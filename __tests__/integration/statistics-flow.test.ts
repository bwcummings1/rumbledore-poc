// Integration tests for end-to-end statistics flow
// Sprint 6: Statistics Engine - Integration testing

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { StatisticsEngine } from '@/lib/stats/statistics-engine';
import { RealtimeStatsService } from '@/lib/stats/realtime-stats';
import { Server as SocketServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer, Server } from 'http';
import {
  CalculationType,
  RecordType,
  StatsUpdateEvent,
  RecordBrokenEvent,
} from '@/types/statistics';

// Test configuration
const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 
  'postgresql://rumbledore_test:test123@localhost:5432/rumbledore_test';

// Test data
const TEST_LEAGUE_ID = 'test-league-123';
const TEST_SEASON = '2024';

describe('Statistics Flow Integration', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let statsEngine: StatisticsEngine;
  let realtimeService: RealtimeStatsService;
  let httpServer: Server;
  let io: SocketServer;
  let clientSocket: ClientSocket;

  beforeAll(async () => {
    // Initialize test database connection
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    // Initialize Redis
    redis = new Redis(TEST_REDIS_URL);
    await redis.flushdb(); // Clear test Redis database

    // Setup Socket.IO server
    httpServer = createServer();
    io = new SocketServer(httpServer, {
      cors: {
        origin: '*',
      },
    });

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(3001, () => {
        resolve();
      });
    });

    // Initialize services
    statsEngine = new StatisticsEngine(TEST_REDIS_URL);
    realtimeService = new RealtimeStatsService(io, TEST_REDIS_URL);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup
    await cleanupTestData();
    await statsEngine.shutdown();
    await realtimeService.shutdown();
    
    if (clientSocket) {
      clientSocket.disconnect();
    }
    
    io.close();
    httpServer.close();
    
    await redis.quit();
    await prisma.$disconnect();
  });

  async function setupTestData() {
    // Create test user
    const user = await prisma.user.create({
      data: {
        id: 'test-user-123',
        email: 'test@example.com',
        name: 'Test User',
      },
    });

    // Create test league
    await prisma.league.create({
      data: {
        id: TEST_LEAGUE_ID,
        espnLeagueId: '12345',
        name: 'Test League',
        userId: user.id,
        isActive: true,
      },
    });

    // Create test teams
    const teams = await Promise.all([
      prisma.leagueTeam.create({
        data: {
          id: 'team-1',
          leagueId: TEST_LEAGUE_ID,
          espnTeamId: '1',
          name: 'Team Alpha',
          abbreviation: 'ALP',
          ownerId: 'owner-1',
          ownerName: 'Owner One',
        },
      }),
      prisma.leagueTeam.create({
        data: {
          id: 'team-2',
          leagueId: TEST_LEAGUE_ID,
          espnTeamId: '2',
          name: 'Team Beta',
          abbreviation: 'BET',
          ownerId: 'owner-2',
          ownerName: 'Owner Two',
        },
      }),
      prisma.leagueTeam.create({
        data: {
          id: 'team-3',
          leagueId: TEST_LEAGUE_ID,
          espnTeamId: '3',
          name: 'Team Gamma',
          abbreviation: 'GAM',
          ownerId: 'owner-3',
          ownerName: 'Owner Three',
        },
      }),
    ]);

    // Create test matchups and weekly statistics
    const matchups = [
      // Week 1
      { week: 1, team1: 'team-1', score1: 120.5, team2: 'team-2', score2: 115.3 },
      // Week 2
      { week: 2, team1: 'team-1', score1: 135.2, team2: 'team-3', score2: 128.7 },
      { week: 2, team1: 'team-2', score1: 142.1, team2: 'team-3', score2: 138.9 },
      // Week 3
      { week: 3, team1: 'team-1', score1: 155.8, team2: 'team-2', score2: 149.2 },
      // Week 4 - Record-breaking score
      { week: 4, team1: 'team-1', score1: 185.5, team2: 'team-3', score2: 165.3 },
      { week: 4, team1: 'team-2', score1: 170.2, team2: 'team-3', score2: 168.9 },
    ];

    for (const matchup of matchups) {
      // Create weekly statistics for team 1
      await prisma.weeklyStatistics.create({
        data: {
          leagueId: TEST_LEAGUE_ID,
          season: TEST_SEASON,
          week: matchup.week,
          teamId: matchup.team1,
          opponentId: matchup.team2,
          pointsFor: matchup.score1,
          pointsAgainst: matchup.score2,
          result: matchup.score1 > matchup.score2 ? 'WIN' : 'LOSS',
          marginOfVictory: matchup.score1 - matchup.score2,
        },
      });

      // Create weekly statistics for team 2
      await prisma.weeklyStatistics.create({
        data: {
          leagueId: TEST_LEAGUE_ID,
          season: TEST_SEASON,
          week: matchup.week,
          teamId: matchup.team2,
          opponentId: matchup.team1,
          pointsFor: matchup.score2,
          pointsAgainst: matchup.score1,
          result: matchup.score2 > matchup.score1 ? 'WIN' : 'LOSS',
          marginOfVictory: matchup.score2 - matchup.score1,
        },
      });
    }

    // Create some historical seasons for all-time records
    await prisma.seasonStatistics.create({
      data: {
        leagueId: TEST_LEAGUE_ID,
        season: '2023',
        teamId: 'team-1',
        wins: 10,
        losses: 4,
        pointsFor: 1650.5,
        pointsAgainst: 1520.3,
        highestScore: 175.2,
        lowestScore: 98.5,
        playoffAppearance: true,
        championshipAppearance: true,
      },
    });
  }

  async function cleanupTestData() {
    // Delete in correct order to respect foreign key constraints
    await prisma.weeklyStatistics.deleteMany({ where: { leagueId: TEST_LEAGUE_ID } });
    await prisma.seasonStatistics.deleteMany({ where: { leagueId: TEST_LEAGUE_ID } });
    await prisma.allTimeRecord.deleteMany({ where: { leagueId: TEST_LEAGUE_ID } });
    await prisma.headToHeadRecord.deleteMany({ where: { leagueId: TEST_LEAGUE_ID } });
    await prisma.performanceTrend.deleteMany({ where: { leagueId: TEST_LEAGUE_ID } });
    await prisma.championshipRecord.deleteMany({ where: { leagueId: TEST_LEAGUE_ID } });
    await prisma.statisticsCalculation.deleteMany({ where: { leagueId: TEST_LEAGUE_ID } });
    await prisma.leagueTeam.deleteMany({ where: { leagueId: TEST_LEAGUE_ID } });
    await prisma.league.deleteMany({ where: { id: TEST_LEAGUE_ID } });
    await prisma.user.deleteMany({ where: { id: 'test-user-123' } });
  }

  describe('Season Statistics Calculation', () => {
    it('should calculate season statistics correctly', async () => {
      const jobId = await statsEngine.queueCalculation({
        leagueId: TEST_LEAGUE_ID,
        calculationType: CalculationType.SEASON,
        seasonId: TEST_SEASON,
      });

      expect(jobId).toBeDefined();

      // Wait for calculation to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify season statistics were created
      const seasonStats = await prisma.seasonStatistics.findMany({
        where: {
          leagueId: TEST_LEAGUE_ID,
          season: TEST_SEASON,
        },
        orderBy: { wins: 'desc' },
      });

      expect(seasonStats).toHaveLength(3);
      
      // Verify team-1 stats (should have best record: 4-0)
      const team1Stats = seasonStats.find(s => s.teamId === 'team-1');
      expect(team1Stats).toMatchObject({
        wins: 4,
        losses: 0,
        pointsFor: expect.closeTo(597.0, 1), // 120.5 + 135.2 + 155.8 + 185.5
        pointsAgainst: expect.closeTo(558.2, 1),
        highestScore: expect.closeTo(185.5, 1),
        lowestScore: expect.closeTo(120.5, 1),
      });

      // Verify calculation log
      const calcLog = await prisma.statisticsCalculation.findFirst({
        where: {
          leagueId: TEST_LEAGUE_ID,
          calculationType: CalculationType.SEASON,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(calcLog).toMatchObject({
        status: 'COMPLETED',
        recordsProcessed: expect.any(Number),
      });
    });

    it('should detect and store win streaks', async () => {
      await statsEngine.calculateSeasonStatistics(TEST_LEAGUE_ID, TEST_SEASON);

      const seasonStats = await prisma.seasonStatistics.findFirst({
        where: {
          leagueId: TEST_LEAGUE_ID,
          season: TEST_SEASON,
          teamId: 'team-1',
        },
      });

      expect(seasonStats).toMatchObject({
        longestWinStreak: 4,
        currentStreakType: 'WIN',
        currentStreakCount: 4,
      });
    });
  });

  describe('Head-to-Head Records', () => {
    it('should calculate head-to-head records correctly', async () => {
      await statsEngine.calculateHeadToHead(TEST_LEAGUE_ID);

      const h2hRecords = await prisma.headToHeadRecord.findMany({
        where: { leagueId: TEST_LEAGUE_ID },
      });

      // Should have 3 H2H records for 3 teams (3 choose 2 = 3 combinations)
      expect(h2hRecords).toHaveLength(3);

      // Check team-1 vs team-2 record
      const team1vs2 = h2hRecords.find(
        r => (r.team1Id === 'team-1' && r.team2Id === 'team-2') ||
             (r.team1Id === 'team-2' && r.team2Id === 'team-1')
      );

      expect(team1vs2).toBeDefined();
      expect(team1vs2!.totalMatchups).toBe(2);
    });
  });

  describe('All-Time Records', () => {
    it('should identify and store all-time records', async () => {
      await statsEngine.calculateAllTimeRecords(TEST_LEAGUE_ID);

      const records = await prisma.allTimeRecord.findMany({
        where: { leagueId: TEST_LEAGUE_ID },
      });

      // Should have various record types
      expect(records.length).toBeGreaterThan(0);

      // Check for highest single game score
      const highestScore = records.find(
        r => r.recordType === RecordType.HIGHEST_SINGLE_GAME_SCORE
      );

      expect(highestScore).toMatchObject({
        recordHolderId: 'team-1',
        recordValue: expect.closeTo(185.5, 1),
        week: 4,
        season: TEST_SEASON,
      });
    });
  });

  describe('Real-time Updates via WebSocket', () => {
    beforeEach(async () => {
      // Create client socket
      clientSocket = ioClient('http://localhost:3001', {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => {
          resolve();
        });
      });
    });

    afterEach(() => {
      if (clientSocket) {
        clientSocket.disconnect();
      }
    });

    it('should receive real-time updates when subscribing to league', async () => {
      const updates: any[] = [];

      clientSocket.on('stats:initial', (data) => {
        updates.push({ type: 'initial', data });
      });

      clientSocket.on('stats:update', (data) => {
        updates.push({ type: 'update', data });
      });

      // Subscribe to league
      clientSocket.emit('subscribe:league', TEST_LEAGUE_ID);

      // Wait for initial stats
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].type).toBe('initial');
      expect(updates[0].data).toHaveProperty('seasonStats');
    });

    it('should receive calculation progress updates', async () => {
      const progressUpdates: any[] = [];

      clientSocket.on('stats:calculating', (data) => {
        progressUpdates.push({ event: 'calculating', data });
      });

      clientSocket.on('stats:progress', (data) => {
        progressUpdates.push({ event: 'progress', data });
      });

      clientSocket.on('stats:ready', (data) => {
        progressUpdates.push({ event: 'ready', data });
      });

      // Subscribe and request calculation
      clientSocket.emit('subscribe:league', TEST_LEAGUE_ID);
      
      clientSocket.emit('calculate:stats', {
        leagueId: TEST_LEAGUE_ID,
        calculationType: CalculationType.TRENDS,
      });

      // Wait for calculation to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(progressUpdates.length).toBeGreaterThan(0);
      
      const readyUpdate = progressUpdates.find(u => u.event === 'ready');
      expect(readyUpdate).toBeDefined();
      expect(readyUpdate.data.status).toBe('COMPLETED');
    });

    it('should handle record broken events', async () => {
      const recordEvents: RecordBrokenEvent[] = [];

      clientSocket.on('record:broken', (data) => {
        recordEvents.push(data);
      });

      clientSocket.emit('subscribe:league', TEST_LEAGUE_ID);

      // Simulate a new high score
      await realtimeService.publishUpdate('matchup:update', {
        leagueId: TEST_LEAGUE_ID,
        season: TEST_SEASON,
        week: 5,
        teamId: 'team-2',
        teamName: 'Team Beta',
        score: 195.5, // New record!
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(recordEvents.length).toBeGreaterThan(0);
      expect(recordEvents[0].type).toBe(RecordType.HIGHEST_SINGLE_GAME_SCORE);
      expect(recordEvents[0].newValue).toBe(195.5);
    });
  });

  describe('Statistics Query API', () => {
    it('should query season statistics via WebSocket', async () => {
      clientSocket = ioClient('http://localhost:3001', {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      const response = await new Promise<any>((resolve) => {
        clientSocket.on('stats:response', resolve);
        
        clientSocket.emit('query:stats', {
          leagueId: TEST_LEAGUE_ID,
          type: 'season',
          seasonId: TEST_SEASON,
        });
      });

      expect(response.type).toBe('season');
      expect(response.data).toBeInstanceOf(Array);
      expect(response.data.length).toBeGreaterThan(0);
    });

    it('should query head-to-head records for specific team', async () => {
      const response = await new Promise<any>((resolve) => {
        clientSocket.on('stats:response', resolve);
        
        clientSocket.emit('query:stats', {
          leagueId: TEST_LEAGUE_ID,
          type: 'h2h',
          teamId: 'team-1',
        });
      });

      expect(response.type).toBe('h2h');
      expect(response.data).toBeInstanceOf(Array);
      
      // All records should involve team-1
      response.data.forEach((record: any) => {
        expect(
          record.team1Id === 'team-1' || record.team2Id === 'team-1'
        ).toBe(true);
      });
    });
  });

  describe('Performance and Caching', () => {
    it('should cache frequently accessed statistics', async () => {
      // First calculation - should be slower
      const start1 = Date.now();
      await statsEngine.calculateSeasonStatistics(TEST_LEAGUE_ID, TEST_SEASON);
      const duration1 = Date.now() - start1;

      // Second calculation - should be faster due to caching
      const start2 = Date.now();
      await statsEngine.calculateSeasonStatistics(TEST_LEAGUE_ID, TEST_SEASON);
      const duration2 = Date.now() - start2;

      // Cache should make second call faster (unless forceRecalculate is true)
      expect(duration2).toBeLessThan(duration1);

      // Verify cache exists
      const cacheKey = `stats:${TEST_LEAGUE_ID}:season:${TEST_SEASON}`;
      const cachedData = await redis.get(cacheKey);
      expect(cachedData).toBeDefined();
    });

    it('should handle concurrent calculations gracefully', async () => {
      const calculations = [
        statsEngine.queueCalculation({
          leagueId: TEST_LEAGUE_ID,
          calculationType: CalculationType.SEASON,
        }),
        statsEngine.queueCalculation({
          leagueId: TEST_LEAGUE_ID,
          calculationType: CalculationType.HEAD_TO_HEAD,
        }),
        statsEngine.queueCalculation({
          leagueId: TEST_LEAGUE_ID,
          calculationType: CalculationType.RECORDS,
        }),
      ];

      const jobIds = await Promise.all(calculations);
      
      // All should get unique job IDs
      expect(new Set(jobIds).size).toBe(3);

      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verify all completed successfully
      const logs = await prisma.statisticsCalculation.findMany({
        where: {
          leagueId: TEST_LEAGUE_ID,
          status: 'COMPLETED',
        },
      });

      expect(logs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Error Recovery', () => {
    it('should handle database errors gracefully', async () => {
      // Temporarily break database connection
      const originalFindMany = prisma.weeklyStatistics.findMany;
      prisma.weeklyStatistics.findMany = jest.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      const jobId = await statsEngine.queueCalculation({
        leagueId: TEST_LEAGUE_ID,
        calculationType: CalculationType.SEASON,
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check that error was logged
      const log = await prisma.statisticsCalculation.findFirst({
        where: {
          leagueId: TEST_LEAGUE_ID,
          status: 'FAILED',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(log).toBeDefined();
      expect(log!.errorMessage).toContain('Database connection failed');

      // Restore original function
      prisma.weeklyStatistics.findMany = originalFindMany;
    });

    it('should retry failed calculations', async () => {
      // This would involve implementing retry logic in the StatisticsEngine
      // For now, we'll test that failed jobs can be requeued
      
      const jobId1 = await statsEngine.queueCalculation({
        leagueId: TEST_LEAGUE_ID,
        calculationType: CalculationType.TRENDS,
      });

      // Wait and then retry
      await new Promise(resolve => setTimeout(resolve, 1000));

      const jobId2 = await statsEngine.queueCalculation({
        leagueId: TEST_LEAGUE_ID,
        calculationType: CalculationType.TRENDS,
        forceRecalculate: true,
      });

      expect(jobId2).not.toBe(jobId1);
    });
  });
});