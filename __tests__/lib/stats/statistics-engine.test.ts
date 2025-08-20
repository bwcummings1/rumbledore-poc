// Unit tests for Statistics Engine
// Sprint 6 Completion - Testing Suite

import { StatisticsEngine } from '@/lib/stats/statistics-engine';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Queue, Worker } from 'bull';
import {
  CalculationType,
  CalculationStatus,
  MatchupResult,
  RecordType,
  RecordHolderType,
  TrendDirection,
  PeriodType,
} from '@/types/statistics';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('ioredis');
jest.mock('bull');

describe('StatisticsEngine', () => {
  let engine: StatisticsEngine;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockRedis: jest.Mocked<Redis>;
  let mockQueue: jest.Mocked<Queue>;
  let mockWorker: jest.Mocked<Worker>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    mockRedis = new Redis() as jest.Mocked<Redis>;
    mockQueue = new Queue('test') as jest.Mocked<Queue>;
    mockWorker = new Worker('test', jest.fn()) as jest.Mocked<Worker>;

    // Mock Redis duplicate method
    mockRedis.duplicate = jest.fn().mockReturnValue(mockRedis);

    // Initialize engine
    engine = new StatisticsEngine('redis://localhost:6379');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('queueCalculation', () => {
    it('should queue a calculation job with correct priority', async () => {
      const mockJob = { id: 'job-123' };
      mockQueue.add = jest.fn().mockResolvedValue(mockJob);
      
      // Mock the queue property
      Object.defineProperty(engine, 'queue', {
        value: mockQueue,
        writable: true,
      });

      const jobId = await engine.queueCalculation({
        leagueId: 'league-123',
        calculationType: CalculationType.ALL,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'calculate',
        expect.objectContaining({
          leagueId: 'league-123',
          calculationType: CalculationType.ALL,
        }),
        expect.objectContaining({
          priority: 1, // ALL type gets priority 1
        })
      );
      expect(jobId).toBe('job-123');
    });

    it('should use default priority for non-ALL calculations', async () => {
      const mockJob = { id: 'job-456' };
      mockQueue.add = jest.fn().mockResolvedValue(mockJob);
      
      Object.defineProperty(engine, 'queue', {
        value: mockQueue,
        writable: true,
      });

      await engine.queueCalculation({
        leagueId: 'league-123',
        calculationType: CalculationType.SEASON,
        seasonId: '2024',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'calculate',
        expect.any(Object),
        expect.objectContaining({
          priority: 10, // Non-ALL types get priority 10
        })
      );
    });
  });

  describe('calculateSeasonStatistics', () => {
    it('should calculate season statistics correctly', async () => {
      const mockWeeklyStats = [
        {
          id: '1',
          leagueId: 'league-123',
          season: '2024',
          week: 1,
          teamId: 'team-1',
          opponentId: 'team-2',
          pointsFor: 120.5,
          pointsAgainst: 110.2,
          result: MatchupResult.WIN,
          isPlayoff: false,
          isChampionship: false,
          marginOfVictory: 10.3,
          createdAt: new Date(),
        },
        {
          id: '2',
          leagueId: 'league-123',
          season: '2024',
          week: 2,
          teamId: 'team-1',
          opponentId: 'team-3',
          pointsFor: 95.3,
          pointsAgainst: 98.7,
          result: MatchupResult.LOSS,
          isPlayoff: false,
          isChampionship: false,
          marginOfVictory: -3.4,
          createdAt: new Date(),
        },
      ];

      // Mock Prisma methods
      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockResolvedValue(mockWeeklyStats),
      } as any;

      mockPrisma.seasonStatistics = {
        upsert: jest.fn().mockResolvedValue({}),
      } as any;

      // Mock Redis
      mockRedis.setex = jest.fn().mockResolvedValue('OK');

      // Replace private prisma instance
      Object.defineProperty(engine, 'redis', {
        value: mockRedis,
        writable: true,
      });

      const result = await engine.calculateSeasonStatistics('league-123', '2024');

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1); // 1 team processed
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'stats:league-123:season:2024',
        3600,
        expect.any(String)
      );
    });

    it('should handle empty statistics gracefully', async () => {
      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockResolvedValue([]),
      } as any;

      const result = await engine.calculateSeasonStatistics('league-123', '2024');

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(0);
    });

    it('should calculate win streaks correctly', async () => {
      const mockWeeklyStats = [
        {
          id: '1',
          teamId: 'team-1',
          season: '2024',
          week: 1,
          result: MatchupResult.WIN,
          pointsFor: 100,
          pointsAgainst: 90,
        },
        {
          id: '2',
          teamId: 'team-1',
          season: '2024',
          week: 2,
          result: MatchupResult.WIN,
          pointsFor: 110,
          pointsAgainst: 95,
        },
        {
          id: '3',
          teamId: 'team-1',
          season: '2024',
          week: 3,
          result: MatchupResult.WIN,
          pointsFor: 105,
          pointsAgainst: 100,
        },
        {
          id: '4',
          teamId: 'team-1',
          season: '2024',
          week: 4,
          result: MatchupResult.LOSS,
          pointsFor: 95,
          pointsAgainst: 100,
        },
      ];

      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockResolvedValue(mockWeeklyStats),
      } as any;

      mockPrisma.seasonStatistics = {
        upsert: jest.fn().mockImplementation((args) => {
          expect(args.create.longestWinStreak).toBe(3);
          expect(args.create.wins).toBe(3);
          expect(args.create.losses).toBe(1);
          return Promise.resolve({});
        }),
      } as any;

      await engine.calculateSeasonStatistics('league-123', '2024');
    });
  });

  describe('calculateHeadToHead', () => {
    it('should calculate head-to-head records correctly', async () => {
      const mockWeeklyStats = [
        {
          teamId: 'team-1',
          opponentId: 'team-2',
          result: MatchupResult.WIN,
          pointsFor: 120,
          pointsAgainst: 110,
          isPlayoff: false,
          isChampionship: false,
        },
        {
          teamId: 'team-2',
          opponentId: 'team-1',
          result: MatchupResult.LOSS,
          pointsFor: 110,
          pointsAgainst: 120,
          isPlayoff: false,
          isChampionship: false,
        },
      ];

      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockResolvedValue(mockWeeklyStats),
      } as any;

      mockPrisma.headToHeadRecord = {
        upsert: jest.fn().mockResolvedValue({}),
      } as any;

      mockRedis.setex = jest.fn().mockResolvedValue('OK');

      const result = await engine.calculateHeadToHead('league-123');

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1); // 1 H2H record
      expect(mockPrisma.headToHeadRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            leagueId_team1Id_team2Id: expect.objectContaining({
              leagueId: 'league-123',
              team1Id: 'team-1',
              team2Id: 'team-2',
            }),
          }),
        })
      );
    });

    it('should handle ties in head-to-head', async () => {
      const mockWeeklyStats = [
        {
          teamId: 'team-1',
          opponentId: 'team-2',
          result: MatchupResult.TIE,
          pointsFor: 100,
          pointsAgainst: 100,
        },
      ];

      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockResolvedValue(mockWeeklyStats),
      } as any;

      mockPrisma.headToHeadRecord = {
        upsert: jest.fn().mockImplementation((args) => {
          expect(args.create.ties).toBe(1);
          expect(args.create.team1Wins).toBe(0);
          expect(args.create.team2Wins).toBe(0);
          return Promise.resolve({});
        }),
      } as any;

      await engine.calculateHeadToHead('league-123');
    });
  });

  describe('calculateAllTimeRecords', () => {
    it('should detect highest single game score', async () => {
      const mockHighScore = {
        id: '1',
        leagueId: 'league-123',
        teamId: 'team-1',
        pointsFor: 185.7,
        season: '2024',
        week: 10,
        createdAt: new Date(),
      };

      mockPrisma.weeklyStatistics = {
        findFirst: jest.fn().mockResolvedValue(mockHighScore),
      } as any;

      mockPrisma.allTimeRecord = {
        upsert: jest.fn().mockResolvedValue({}),
      } as any;

      mockPrisma.allTimeRecord.findMany = jest.fn().mockResolvedValue([]);
      mockRedis.setex = jest.fn().mockResolvedValue('OK');

      const result = await engine.calculateAllTimeRecords('league-123');

      expect(result.success).toBe(true);
      expect(mockPrisma.allTimeRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            leagueId_recordType_recordHolderType: expect.objectContaining({
              recordType: RecordType.HIGHEST_SINGLE_GAME_SCORE,
            }),
          }),
        })
      );
    });

    it('should detect longest win streak', async () => {
      const mockMatchups = [
        { teamId: 'team-1', result: MatchupResult.WIN, seasonId: '2024' },
        { teamId: 'team-1', result: MatchupResult.WIN, seasonId: '2024' },
        { teamId: 'team-1', result: MatchupResult.WIN, seasonId: '2024' },
        { teamId: 'team-1', result: MatchupResult.WIN, seasonId: '2024' },
        { teamId: 'team-1', result: MatchupResult.LOSS, seasonId: '2024' },
      ];

      // Mock private method implementations
      mockPrisma.seasonStatistics = {
        findFirst: jest.fn().mockResolvedValue({
          teamId: 'team-1',
          longestWinStreak: 4,
          season: '2024',
        }),
      } as any;

      mockPrisma.allTimeRecord = {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      } as any;

      const result = await engine.calculateAllTimeRecords('league-123');

      expect(result.success).toBe(true);
    });
  });

  describe('calculatePerformanceTrends', () => {
    it('should calculate upward trend correctly', async () => {
      const recentStats = [
        { teamId: 'team-1', week: 10, pointsFor: 130, result: MatchupResult.WIN, season: '2024' },
        { teamId: 'team-1', week: 9, pointsFor: 125, result: MatchupResult.WIN, season: '2024' },
        { teamId: 'team-1', week: 8, pointsFor: 120, result: MatchupResult.WIN, season: '2024' },
        { teamId: 'team-1', week: 7, pointsFor: 100, result: MatchupResult.LOSS, season: '2024' },
        { teamId: 'team-1', week: 6, pointsFor: 95, result: MatchupResult.LOSS, season: '2024' },
        { teamId: 'team-1', week: 5, pointsFor: 90, result: MatchupResult.LOSS, season: '2024' },
      ];

      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockResolvedValue(recentStats),
      } as any;

      mockPrisma.performanceTrend = {
        upsert: jest.fn().mockImplementation((args) => {
          expect(args.create.trendDirection).toBe(TrendDirection.UP);
          expect(Number(args.create.trendStrength)).toBeGreaterThan(0);
          return Promise.resolve({});
        }),
      } as any;

      const result = await engine.calculatePerformanceTrends('league-123');

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
    });

    it('should detect stable trend', async () => {
      const recentStats = [
        { teamId: 'team-1', week: 10, pointsFor: 100, result: MatchupResult.WIN, season: '2024' },
        { teamId: 'team-1', week: 9, pointsFor: 101, result: MatchupResult.WIN, season: '2024' },
        { teamId: 'team-1', week: 8, pointsFor: 99, result: MatchupResult.LOSS, season: '2024' },
        { teamId: 'team-1', week: 7, pointsFor: 100, result: MatchupResult.WIN, season: '2024' },
        { teamId: 'team-1', week: 6, pointsFor: 99, result: MatchupResult.LOSS, season: '2024' },
        { teamId: 'team-1', week: 5, pointsFor: 101, result: MatchupResult.WIN, season: '2024' },
      ];

      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockResolvedValue(recentStats),
      } as any;

      mockPrisma.performanceTrend = {
        upsert: jest.fn().mockImplementation((args) => {
          expect(args.create.trendDirection).toBe(TrendDirection.STABLE);
          return Promise.resolve({});
        }),
      } as any;

      await engine.calculatePerformanceTrends('league-123');
    });
  });

  describe('calculateChampionshipRecords', () => {
    it('should identify championship winners', async () => {
      const playoffStats = [
        {
          season: '2024',
          week: 16,
          teamId: 'team-1',
          pointsFor: 140,
          isPlayoff: true,
        },
        {
          season: '2024',
          week: 16,
          teamId: 'team-2',
          pointsFor: 130,
          isPlayoff: true,
        },
      ];

      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockResolvedValue(playoffStats),
      } as any;

      mockPrisma.championshipRecord = {
        upsert: jest.fn().mockImplementation((args) => {
          expect(args.create.championId).toBe('team-1');
          expect(args.create.runnerUpId).toBe('team-2');
          expect(Number(args.create.championshipScore)).toBe(140);
          return Promise.resolve({});
        }),
      } as any;

      const result = await engine.calculateChampionshipRecords('league-123');

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
    });
  });

  describe('getProgress', () => {
    it('should return job progress', async () => {
      const mockJob = {
        id: 'job-123',
        progress: jest.fn().mockReturnValue(50),
        getState: jest.fn().mockResolvedValue('active'),
        data: { leagueId: 'league-123' },
        returnvalue: null,
        failedReason: null,
      };

      mockQueue.getJob = jest.fn().mockResolvedValue(mockJob);
      
      Object.defineProperty(engine, 'queue', {
        value: mockQueue,
        writable: true,
      });

      const progress = await engine.getProgress('job-123');

      expect(progress).toEqual({
        id: 'job-123',
        progress: 50,
        state: 'active',
        data: { leagueId: 'league-123' },
        returnValue: null,
        failedReason: null,
      });
    });

    it('should return null for non-existent job', async () => {
      mockQueue.getJob = jest.fn().mockResolvedValue(null);
      
      Object.defineProperty(engine, 'queue', {
        value: mockQueue,
        writable: true,
      });

      const progress = await engine.getProgress('non-existent');

      expect(progress).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      } as any;

      await expect(
        engine.calculateSeasonStatistics('league-123', '2024')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle Redis errors gracefully', async () => {
      mockPrisma.weeklyStatistics = {
        findMany: jest.fn().mockResolvedValue([]),
      } as any;

      mockRedis.setex = jest.fn().mockRejectedValue(new Error('Redis connection failed'));

      Object.defineProperty(engine, 'redis', {
        value: mockRedis,
        writable: true,
      });

      // Should complete calculation even if caching fails
      const result = await engine.calculateSeasonStatistics('league-123', '2024');
      expect(result.success).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should close all connections properly', async () => {
      mockQueue.close = jest.fn().mockResolvedValue(undefined);
      mockWorker.close = jest.fn().mockResolvedValue(undefined);
      mockRedis.disconnect = jest.fn();

      Object.defineProperty(engine, 'queue', {
        value: mockQueue,
        writable: true,
      });
      Object.defineProperty(engine, 'worker', {
        value: mockWorker,
        writable: true,
      });
      Object.defineProperty(engine, 'redis', {
        value: mockRedis,
        writable: true,
      });
      Object.defineProperty(engine, 'pubClient', {
        value: mockRedis,
        writable: true,
      });

      await engine.shutdown();

      expect(mockQueue.close).toHaveBeenCalled();
      expect(mockWorker.close).toHaveBeenCalled();
      expect(mockRedis.disconnect).toHaveBeenCalledTimes(2); // redis and pubClient
    });
  });
});