// Unit tests for RealtimeStatsService
// Sprint 6: Statistics Engine - Real-time statistics WebSocket service

import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { RealtimeStatsService } from '@/lib/stats/realtime-stats';
import { StatisticsEngine } from '@/lib/stats/statistics-engine';
import { PrismaClient } from '@prisma/client';
import {
  CalculationType,
  RecordType,
  StatsUpdateEvent,
  RecordBrokenEvent,
  CalculationProgressEvent,
} from '@/types/statistics';

// Mock dependencies
jest.mock('socket.io');
jest.mock('ioredis');
jest.mock('@prisma/client');
jest.mock('@/lib/stats/statistics-engine');

const mockPrisma = {
  allTimeRecord: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  headToHeadRecord: {
    findMany: jest.fn(),
  },
  performanceTrend: {
    findMany: jest.fn(),
  },
  championshipRecord: {
    findMany: jest.fn(),
  },
  seasonStatistics: {
    findMany: jest.fn(),
  },
  weeklyStatistics: {
    findMany: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe('RealtimeStatsService', () => {
  let service: RealtimeStatsService;
  let mockIo: jest.Mocked<Server>;
  let mockSocket: jest.Mocked<Socket>;
  let mockRedis: jest.Mocked<Redis>;
  let mockSubClient: jest.Mocked<Redis>;
  let mockPubClient: jest.Mocked<Redis>;
  let mockStatsEngine: jest.Mocked<StatisticsEngine>;

  beforeEach(() => {
    // Setup mock Socket.IO server
    mockSocket = {
      id: 'socket-123',
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
    } as any;

    const socketsMap = new Map();
    socketsMap.set('socket-123', mockSocket);

    mockIo = {
      on: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: {
        sockets: socketsMap,
      },
    } as any;

    // Setup mock Redis clients
    mockRedis = {
      duplicate: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    mockSubClient = {
      subscribe: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    mockPubClient = {
      publish: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    mockRedis.duplicate.mockReturnValueOnce(mockSubClient);
    mockRedis.duplicate.mockReturnValueOnce(mockPubClient);

    // Setup mock Redis module
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis);

    // Setup mock StatisticsEngine
    mockStatsEngine = {
      queueCalculation: jest.fn().mockResolvedValue('job-123'),
      shutdown: jest.fn(),
    } as any;

    (StatisticsEngine as jest.MockedClass<typeof StatisticsEngine>).mockImplementation(() => mockStatsEngine);

    // Create service instance
    service = new RealtimeStatsService(mockIo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize Redis clients and subscriptions', () => {
      expect(mockRedis.duplicate).toHaveBeenCalledTimes(2);
      expect(mockSubClient.subscribe).toHaveBeenCalledWith(
        'matchup:update',
        'stats:calculate',
        'stats:complete',
        'stats:failed',
        'stats:progress',
        'record:broken'
      );
      expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should handle Redis message events', () => {
      expect(mockSubClient.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('socket connection handling', () => {
    let connectionHandler: (socket: Socket) => void;

    beforeEach(() => {
      connectionHandler = mockIo.on.mock.calls[0][1];
    });

    it('should handle new socket connections', () => {
      connectionHandler(mockSocket);
      
      expect(mockSocket.on).toHaveBeenCalledWith('subscribe:league', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('unsubscribe:league', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('calculate:stats', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('query:stats', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('league subscription', () => {
    it('should handle league subscription', async () => {
      const leagueId = 'league-123';
      const cachedStats = JSON.stringify({
        seasonStats: [],
        records: [],
        timestamp: new Date(),
      });

      mockRedis.get.mockResolvedValue(cachedStats);

      await service.subscribeToLeague('socket-123', leagueId);

      expect(mockSocket.join).toHaveBeenCalledWith(`league:${leagueId}`);
      expect(mockRedis.get).toHaveBeenCalledWith(`stats:${leagueId}:current`);
      expect(mockSocket.emit).toHaveBeenCalledWith('stats:initial', JSON.parse(cachedStats));
    });

    it('should fetch initial stats if no cache exists', async () => {
      const leagueId = 'league-123';
      mockRedis.get.mockResolvedValue(null);

      const mockSeasonStats = [
        { id: '1', teamId: 'team-1', wins: 10, losses: 3 },
      ];
      const mockRecords = [
        { id: '1', recordType: RecordType.HIGHEST_SINGLE_GAME_SCORE, recordValue: 150 },
      ];

      mockPrisma.seasonStatistics.findMany.mockResolvedValue(mockSeasonStats);
      mockPrisma.allTimeRecord.findMany.mockResolvedValue(mockRecords);

      await service.subscribeToLeague('socket-123', leagueId);

      expect(mockPrisma.seasonStatistics.findMany).toHaveBeenCalledWith({
        where: { leagueId },
        orderBy: { wins: 'desc' },
        take: 10,
      });

      expect(mockPrisma.allTimeRecord.findMany).toHaveBeenCalledWith({
        where: { leagueId },
        take: 10,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('stats:initial', {
        seasonStats: mockSeasonStats,
        records: mockRecords,
        timestamp: expect.any(Date),
      });
    });

    it('should handle league unsubscription', async () => {
      const leagueId = 'league-123';

      await service.subscribeToLeague('socket-123', leagueId);
      await service.unsubscribeFromLeague('socket-123', leagueId);

      expect(mockSocket.leave).toHaveBeenCalledWith(`league:${leagueId}`);
    });
  });

  describe('matchup updates', () => {
    it('should handle matchup updates and trigger recalculation', async () => {
      const messageHandler = mockSubClient.on.mock.calls[0][1];
      
      const matchupData = {
        leagueId: 'league-123',
        season: '2024',
        week: 10,
        teamId: 'team-1',
        teamName: 'Test Team',
        score: 180.5,
      };

      const cachedStats = JSON.stringify({ updated: true });
      mockRedis.get.mockResolvedValue(cachedStats);

      mockPrisma.allTimeRecord.findMany.mockResolvedValue([
        {
          id: '1',
          leagueId: 'league-123',
          recordType: RecordType.HIGHEST_SINGLE_GAME_SCORE,
          recordValue: 175.0,
          recordHolderType: 'TEAM',
          recordHolderId: 'team-2',
        },
      ]);

      await messageHandler('matchup:update', JSON.stringify(matchupData));

      // Should queue season statistics calculation
      expect(mockStatsEngine.queueCalculation).toHaveBeenCalledWith({
        leagueId: 'league-123',
        calculationType: CalculationType.SEASON,
        seasonId: '2024',
        priority: 5,
      });

      // Should check for new records
      expect(mockPrisma.allTimeRecord.findMany).toHaveBeenCalledWith({
        where: { leagueId: 'league-123' },
      });

      // Should publish record broken event (since 180.5 > 175.0)
      expect(mockPubClient.publish).toHaveBeenCalledWith(
        'record:broken',
        expect.stringContaining('HIGHEST_SINGLE_GAME_SCORE')
      );

      // Should queue records recalculation
      expect(mockStatsEngine.queueCalculation).toHaveBeenCalledWith({
        leagueId: 'league-123',
        calculationType: CalculationType.RECORDS,
      });
    });
  });

  describe('calculation requests', () => {
    let connectionHandler: (socket: Socket) => void;
    let calculateHandler: (data: any) => Promise<void>;

    beforeEach(() => {
      connectionHandler = mockIo.on.mock.calls[0][1];
      connectionHandler(mockSocket);
      calculateHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'calculate:stats'
      )[1];
    });

    it('should handle valid calculation requests', async () => {
      const requestData = {
        leagueId: 'league-123',
        calculationType: CalculationType.ALL,
        forceRecalculate: true,
      };

      await calculateHandler(requestData);

      expect(mockStatsEngine.queueCalculation).toHaveBeenCalledWith(requestData);
      expect(mockSocket.emit).toHaveBeenCalledWith('calculation:queued', {
        jobId: 'job-123',
        message: 'Calculation queued successfully',
      });
    });

    it('should handle invalid calculation requests', async () => {
      const requestData = {
        // Missing required parameters
        calculationType: CalculationType.ALL,
      };

      await calculateHandler(requestData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Missing required parameters',
      });
      expect(mockStatsEngine.queueCalculation).not.toHaveBeenCalled();
    });

    it('should handle calculation errors', async () => {
      const requestData = {
        leagueId: 'league-123',
        calculationType: CalculationType.ALL,
      };

      const error = new Error('Queue full');
      mockStatsEngine.queueCalculation.mockRejectedValue(error);

      await calculateHandler(requestData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to queue calculation',
        error: 'Queue full',
      });
    });
  });

  describe('stats queries', () => {
    let connectionHandler: (socket: Socket) => void;
    let queryHandler: (data: any) => Promise<void>;

    beforeEach(() => {
      connectionHandler = mockIo.on.mock.calls[0][1];
      connectionHandler(mockSocket);
      queryHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'query:stats'
      )[1];
    });

    it('should handle season stats query', async () => {
      const queryData = {
        leagueId: 'league-123',
        type: 'season',
        seasonId: '2024',
      };

      const mockStats = [
        { id: '1', teamId: 'team-1', wins: 10, losses: 3 },
      ];

      mockPrisma.seasonStatistics.findMany.mockResolvedValue(mockStats);

      await queryHandler(queryData);

      expect(mockPrisma.seasonStatistics.findMany).toHaveBeenCalledWith({
        where: {
          leagueId: 'league-123',
          season: '2024',
        },
        orderBy: { wins: 'desc' },
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('stats:response', {
        type: 'season',
        data: mockStats,
        timestamp: expect.any(Date),
      });
    });

    it('should handle head-to-head query for specific team', async () => {
      const queryData = {
        leagueId: 'league-123',
        type: 'h2h',
        teamId: 'team-1',
      };

      const mockH2H = [
        { id: '1', team1Id: 'team-1', team2Id: 'team-2', team1Wins: 5, team2Wins: 3 },
      ];

      mockPrisma.headToHeadRecord.findMany.mockResolvedValue(mockH2H);

      await queryHandler(queryData);

      expect(mockPrisma.headToHeadRecord.findMany).toHaveBeenCalledWith({
        where: {
          leagueId: 'league-123',
          OR: [
            { team1Id: 'team-1' },
            { team2Id: 'team-1' },
          ],
        },
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('stats:response', {
        type: 'h2h',
        data: mockH2H,
        timestamp: expect.any(Date),
      });
    });

    it('should handle invalid query type', async () => {
      const queryData = {
        leagueId: 'league-123',
        type: 'invalid',
      };

      await queryHandler(queryData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid query type',
      });
    });
  });

  describe('calculation progress events', () => {
    let messageHandler: (channel: string, message: string) => Promise<void>;

    beforeEach(() => {
      messageHandler = mockSubClient.on.mock.calls[0][1];
    });

    it('should handle calculation complete event', async () => {
      const eventData = {
        jobId: 'job-123',
        leagueId: 'league-123',
        calculationType: CalculationType.SEASON,
        executionTime: 1500,
      };

      const mockSeasonStats = [
        { id: '1', teamId: 'team-1', wins: 10 },
      ];

      mockPrisma.seasonStatistics.findMany.mockResolvedValue(mockSeasonStats);

      await messageHandler('stats:complete', JSON.stringify(eventData));

      expect(mockIo.to).toHaveBeenCalledWith('league:league-123');
      expect(mockIo.emit).toHaveBeenCalledWith('stats:ready', expect.objectContaining({
        jobId: 'job-123',
        status: 'COMPLETED',
        executionTime: 1500,
      }));

      expect(mockIo.emit).toHaveBeenCalledWith('season:update', mockSeasonStats);
    });

    it('should handle calculation failed event', async () => {
      const eventData = {
        jobId: 'job-123',
        leagueId: 'league-123',
        calculationType: CalculationType.SEASON,
        error: 'Database connection failed',
      };

      await messageHandler('stats:failed', JSON.stringify(eventData));

      expect(mockIo.to).toHaveBeenCalledWith('league:league-123');
      expect(mockIo.emit).toHaveBeenCalledWith('stats:error', expect.objectContaining({
        jobId: 'job-123',
        status: 'FAILED',
        message: 'Calculation failed: Database connection failed',
      }));
    });

    it('should handle calculation progress event', async () => {
      const eventData = {
        jobId: 'job-123',
        leagueId: 'league-123',
        calculationType: CalculationType.ALL,
        progress: 65,
      };

      await messageHandler('stats:progress', JSON.stringify(eventData));

      expect(mockIo.to).toHaveBeenCalledWith('league:league-123');
      expect(mockIo.emit).toHaveBeenCalledWith('stats:progress', expect.objectContaining({
        jobId: 'job-123',
        status: 'IN_PROGRESS',
        progress: 65,
        message: 'Processing: 65% complete',
      }));
    });
  });

  describe('record broken events', () => {
    let messageHandler: (channel: string, message: string) => Promise<void>;

    beforeEach(() => {
      messageHandler = mockSubClient.on.mock.calls[0][1];
    });

    it('should broadcast record broken events', async () => {
      const recordEvent: RecordBrokenEvent = {
        type: RecordType.HIGHEST_SINGLE_GAME_SCORE,
        oldRecord: {
          id: '1',
          leagueId: 'league-123',
          recordType: RecordType.HIGHEST_SINGLE_GAME_SCORE,
          recordValue: 175.0,
          recordHolderType: 'TEAM',
          recordHolderId: 'team-1',
          date: new Date('2024-01-01'),
        } as any,
        newValue: 185.5,
        achievedBy: 'team-2',
        achievedByName: 'Team 2',
        date: new Date('2024-10-15'),
        metadata: {
          week: 10,
          season: '2024',
        },
      };

      await messageHandler('record:broken', JSON.stringify(recordEvent));

      expect(mockIo.to).toHaveBeenCalledWith('league:league-123');
      expect(mockIo.emit).toHaveBeenCalledWith('record:broken', recordEvent);
    });
  });

  describe('broadcast updated stats', () => {
    it('should broadcast all stats for ALL calculation type', async () => {
      const messageHandler = mockSubClient.on.mock.calls[0][1];

      const mockSeasonStats = [{ id: '1', teamId: 'team-1', wins: 10 }];
      const mockRecords = [{ id: '1', recordType: RecordType.HIGHEST_SINGLE_GAME_SCORE }];
      const mockTrends = [{ id: '1', entityId: 'team-1', trendDirection: 'UP' }];

      mockPrisma.seasonStatistics.findMany.mockResolvedValue(mockSeasonStats);
      mockPrisma.allTimeRecord.findMany.mockResolvedValue(mockRecords);
      mockPrisma.performanceTrend.findMany.mockResolvedValue(mockTrends);

      const eventData = {
        jobId: 'job-123',
        leagueId: 'league-123',
        calculationType: CalculationType.ALL,
        executionTime: 2000,
      };

      await messageHandler('stats:complete', JSON.stringify(eventData));

      expect(mockPrisma.seasonStatistics.findMany).toHaveBeenCalled();
      expect(mockPrisma.allTimeRecord.findMany).toHaveBeenCalled();
      expect(mockPrisma.performanceTrend.findMany).toHaveBeenCalled();

      expect(mockIo.emit).toHaveBeenCalledWith('all:update', {
        seasonStats: mockSeasonStats,
        records: mockRecords,
        trends: mockTrends,
      });
    });
  });

  describe('error handling', () => {
    it('should handle malformed Redis messages gracefully', async () => {
      const messageHandler = mockSubClient.on.mock.calls[0][1];
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await messageHandler('stats:complete', 'invalid json');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[RealtimeStats] Error handling stats:complete message:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    it('should properly shutdown all connections', async () => {
      await service.shutdown();

      expect(mockStatsEngine.shutdown).toHaveBeenCalled();
      expect(mockSubClient.disconnect).toHaveBeenCalled();
      expect(mockPubClient.disconnect).toHaveBeenCalled();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });
  });

  describe('publishUpdate', () => {
    it('should publish updates to Redis channels', async () => {
      const data = { test: 'data' };
      await service.publishUpdate('test:channel', data);

      expect(mockPubClient.publish).toHaveBeenCalledWith(
        'test:channel',
        JSON.stringify(data)
      );
    });
  });
});