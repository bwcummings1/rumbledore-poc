/**
 * Competition Performance Tests
 * 
 * Tests system performance with many participants:
 * - Large-scale leaderboard calculations
 * - Concurrent user entries
 * - Cache performance
 * - Database query optimization
 * - Memory usage
 */

import { PrismaClient } from '@prisma/client';
import { CompetitionManager } from '@/lib/betting/competition-manager';
import { LeaderboardService } from '@/lib/betting/leaderboard-service';
import { CompetitionCacheManager } from '@/lib/cache/competition-cache';
import { performance } from 'perf_hooks';
import Redis from 'ioredis';

describe('Competition Performance Tests', () => {
  let prisma: PrismaClient;
  let competitionManager: CompetitionManager;
  let leaderboardService: LeaderboardService;
  let cacheManager: CompetitionCacheManager;
  let redis: Redis;

  let testLeagueId: string;
  let testCompetitionId: string;
  let testUserIds: string[] = [];

  const NUM_USERS = 100; // Test with 100 participants
  const NUM_BETS_PER_USER = 50; // 50 bets per user

  beforeAll(async () => {
    // Initialize services
    prisma = new PrismaClient();
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    competitionManager = new CompetitionManager(prisma);
    leaderboardService = new LeaderboardService(prisma);
    cacheManager = new CompetitionCacheManager();

    // Create test league
    const league = await prisma.league.create({
      data: {
        espnLeagueId: 'perf-test-league-' + Date.now(),
        name: 'Performance Test League',
        year: 2024,
        platform: 'ESPN',
      },
    });
    testLeagueId = league.id;

    // Create large competition
    const competition = await competitionManager.createCompetition({
      name: 'Performance Test Competition',
      description: 'Testing with many participants',
      type: 'SEASON',
      scope: 'LEAGUE',
      leagueId: testLeagueId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      entryFee: 0, // Free to avoid bankroll complications
      maxEntrants: NUM_USERS + 10,
      prizePool: 10000,
      scoringRules: {
        winPoints: 10,
        roiMultiplier: 5,
        streakBonus: 2,
      },
    });
    testCompetitionId = competition.id;

    // Update to ACTIVE status
    await competitionManager.updateCompetitionStatus(testCompetitionId, 'ACTIVE');
  }, 60000); // 60 second timeout for setup

  afterAll(async () => {
    // Cleanup in batches to avoid timeout
    console.log('Starting cleanup...');
    
    // Delete bets in batches
    const betBatches = [];
    for (let i = 0; i < testUserIds.length; i += 10) {
      const batch = testUserIds.slice(i, i + 10);
      betBatches.push(
        prisma.bet.deleteMany({
          where: { userId: { in: batch } },
        })
      );
    }
    await Promise.all(betBatches);
    
    // Delete competition data
    await prisma.competitionReward.deleteMany({ where: { competitionId: testCompetitionId } });
    await prisma.competitionEntry.deleteMany({ where: { competitionId: testCompetitionId } });
    await prisma.leaderboard.deleteMany({ where: { competitionId: testCompetitionId } });
    await prisma.competition.deleteMany({ where: { id: testCompetitionId } });
    
    // Delete users in batches
    const userBatches = [];
    for (let i = 0; i < testUserIds.length; i += 10) {
      const batch = testUserIds.slice(i, i + 10);
      userBatches.push(
        prisma.user.deleteMany({
          where: { id: { in: batch } },
        })
      );
    }
    await Promise.all(userBatches);
    
    await prisma.league.deleteMany({ where: { id: testLeagueId } });
    
    await cacheManager.disconnect();
    await redis.quit();
    await prisma.$disconnect();
    
    console.log('Cleanup completed');
  }, 120000); // 120 second timeout for cleanup

  describe('User Creation and Entry Performance', () => {
    it(`should handle ${NUM_USERS} users joining competition concurrently`, async () => {
      const startTime = performance.now();
      
      // Create users in batches
      const userCreationPromises = [];
      for (let i = 0; i < NUM_USERS; i++) {
        userCreationPromises.push(
          prisma.user.create({
            data: {
              email: `perf-user-${i}-${Date.now()}@test.com`,
              name: `Performance User ${i}`,
            },
          })
        );
      }
      
      const users = await Promise.all(userCreationPromises);
      testUserIds = users.map(u => u.id);
      
      const userCreationTime = performance.now() - startTime;
      console.log(`Created ${NUM_USERS} users in ${userCreationTime.toFixed(2)}ms`);
      expect(userCreationTime).toBeLessThan(30000); // Should complete within 30 seconds
      
      // Join competition concurrently
      const joinStartTime = performance.now();
      const joinPromises = testUserIds.map(userId =>
        competitionManager.joinCompetition(testCompetitionId, userId, testLeagueId)
      );
      
      await Promise.all(joinPromises);
      
      const joinTime = performance.now() - joinStartTime;
      console.log(`${NUM_USERS} users joined competition in ${joinTime.toFixed(2)}ms`);
      expect(joinTime).toBeLessThan(20000); // Should complete within 20 seconds
      
      // Verify all users joined
      const competition = await competitionManager.getCompetition(testCompetitionId);
      expect(competition?.currentEntrants).toBe(NUM_USERS);
    }, 60000); // 60 second timeout
  });

  describe('Bet Generation Performance', () => {
    it(`should handle ${NUM_USERS * NUM_BETS_PER_USER} bets efficiently`, async () => {
      const startTime = performance.now();
      
      // Generate bets for all users
      const betData = [];
      for (const userId of testUserIds) {
        for (let j = 0; j < NUM_BETS_PER_USER; j++) {
          const won = Math.random() > 0.5;
          betData.push({
            leagueId: testLeagueId,
            userId,
            bankrollId: `dummy-${userId}`,
            gameId: `game-${j}`,
            eventDate: new Date(),
            week: Math.floor(j / 7) + 1,
            betType: 'SINGLE' as const,
            marketType: ['SPREAD', 'MONEYLINE', 'TOTAL'][j % 3] as any,
            selection: ['HOME', 'AWAY', 'OVER', 'UNDER'][j % 4],
            odds: -110 + Math.floor(Math.random() * 200),
            stake: 10 + Math.floor(Math.random() * 90),
            potentialPayout: 100 + Math.random() * 100,
            actualPayout: won ? 100 + Math.random() * 100 : 0,
            status: 'SETTLED' as const,
            result: won ? 'WIN' : 'LOSS' as any,
          });
        }
      }
      
      // Insert bets in batches
      const batchSize = 1000;
      for (let i = 0; i < betData.length; i += batchSize) {
        const batch = betData.slice(i, i + batchSize);
        await prisma.bet.createMany({ data: batch });
      }
      
      const betCreationTime = performance.now() - startTime;
      console.log(`Created ${betData.length} bets in ${betCreationTime.toFixed(2)}ms`);
      expect(betCreationTime).toBeLessThan(60000); // Should complete within 60 seconds
    }, 90000); // 90 second timeout
  });

  describe('Leaderboard Calculation Performance', () => {
    it('should calculate leaderboard for large competition efficiently', async () => {
      const startTime = performance.now();
      
      const leaderboard = await leaderboardService.updateLeaderboard(testCompetitionId);
      
      const calculationTime = performance.now() - startTime;
      console.log(`Calculated leaderboard for ${NUM_USERS} users in ${calculationTime.toFixed(2)}ms`);
      
      expect(leaderboard).toBeDefined();
      expect(leaderboard.standings).toHaveLength(NUM_USERS);
      expect(calculationTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Check memory usage
      const memUsage = process.memoryUsage();
      console.log('Memory usage:', {
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      });
      expect(memUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // Less than 500MB
    });

    it('should handle frequent leaderboard updates', async () => {
      const updateCount = 10;
      const startTime = performance.now();
      
      const updatePromises = [];
      for (let i = 0; i < updateCount; i++) {
        updatePromises.push(
          leaderboardService.updateLeaderboard(testCompetitionId)
        );
      }
      
      await Promise.all(updatePromises);
      
      const totalTime = performance.now() - startTime;
      const avgTime = totalTime / updateCount;
      
      console.log(`${updateCount} leaderboard updates completed in ${totalTime.toFixed(2)}ms`);
      console.log(`Average time per update: ${avgTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(2000); // Average should be under 2 seconds
    });
  });

  describe('Cache Performance', () => {
    it('should cache and retrieve leaderboard efficiently', async () => {
      // First, ensure leaderboard is calculated
      const leaderboard = await leaderboardService.getLeaderboard(testCompetitionId);
      expect(leaderboard).toBeDefined();
      
      // Cache the leaderboard
      const cacheStartTime = performance.now();
      await cacheManager.cacheLeaderboard(testCompetitionId, leaderboard!);
      const cacheTime = performance.now() - cacheStartTime;
      
      console.log(`Cached leaderboard in ${cacheTime.toFixed(2)}ms`);
      expect(cacheTime).toBeLessThan(100); // Should cache within 100ms
      
      // Retrieve from cache
      const retrieveStartTime = performance.now();
      const cachedLeaderboard = await cacheManager.getLeaderboard(testCompetitionId);
      const retrieveTime = performance.now() - retrieveStartTime;
      
      console.log(`Retrieved leaderboard from cache in ${retrieveTime.toFixed(2)}ms`);
      expect(retrieveTime).toBeLessThan(50); // Should retrieve within 50ms
      expect(cachedLeaderboard?.standings).toHaveLength(NUM_USERS);
    });

    it('should handle cache invalidation efficiently', async () => {
      const invalidationStartTime = performance.now();
      
      await cacheManager.invalidateLeaderboard(testCompetitionId);
      await cacheManager.invalidateCompetition(testCompetitionId);
      await cacheManager.invalidateCompetitionList(testLeagueId);
      
      const invalidationTime = performance.now() - invalidationStartTime;
      console.log(`Cache invalidation completed in ${invalidationTime.toFixed(2)}ms`);
      expect(invalidationTime).toBeLessThan(100); // Should complete within 100ms
    });

    it('should demonstrate cache effectiveness', async () => {
      // Clear cache first
      await cacheManager.invalidateLeaderboard(testCompetitionId);
      
      // First call - no cache
      const uncachedStartTime = performance.now();
      await leaderboardService.getLeaderboard(testCompetitionId);
      const uncachedTime = performance.now() - uncachedStartTime;
      
      // Second call - should use cache
      const cachedStartTime = performance.now();
      await leaderboardService.getLeaderboard(testCompetitionId);
      const cachedTime = performance.now() - cachedStartTime;
      
      console.log(`Uncached call: ${uncachedTime.toFixed(2)}ms`);
      console.log(`Cached call: ${cachedTime.toFixed(2)}ms`);
      console.log(`Speed improvement: ${(uncachedTime / cachedTime).toFixed(2)}x`);
      
      expect(cachedTime).toBeLessThan(uncachedTime / 2); // Cached should be at least 2x faster
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent leaderboard updates without data corruption', async () => {
      const concurrentUpdates = 5;
      const updatePromises = [];
      
      for (let i = 0; i < concurrentUpdates; i++) {
        updatePromises.push(
          leaderboardService.updateLeaderboard(testCompetitionId)
        );
      }
      
      const results = await Promise.all(updatePromises);
      
      // All updates should return the same version
      const versions = results.map(r => r.version);
      const uniqueVersions = [...new Set(versions)];
      
      console.log(`Concurrent update versions: ${versions.join(', ')}`);
      expect(uniqueVersions.length).toBeLessThanOrEqual(2); // At most 2 different versions
      
      // Final leaderboard should be consistent
      const finalLeaderboard = await leaderboardService.getLeaderboard(testCompetitionId);
      expect(finalLeaderboard?.standings).toHaveLength(NUM_USERS);
    });

    it('should handle concurrent user joins without race conditions', async () => {
      // Create a new competition for this test
      const concurrentCompetition = await competitionManager.createCompetition({
        name: 'Concurrent Join Test',
        type: 'WEEKLY',
        scope: 'LEAGUE',
        leagueId: testLeagueId,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        entryFee: 0,
        prizePool: 1000,
      });
      
      // Create 20 new users
      const newUsers = [];
      for (let i = 0; i < 20; i++) {
        const user = await prisma.user.create({
          data: {
            email: `concurrent-${i}-${Date.now()}@test.com`,
            name: `Concurrent User ${i}`,
          },
        });
        newUsers.push(user);
      }
      
      // Join concurrently
      const joinPromises = newUsers.map(user =>
        competitionManager.joinCompetition(concurrentCompetition.id, user.id, testLeagueId)
      );
      
      await Promise.all(joinPromises);
      
      // Verify all joined
      const competition = await competitionManager.getCompetition(concurrentCompetition.id);
      expect(competition?.currentEntrants).toBe(20);
      
      // Cleanup
      await prisma.competitionEntry.deleteMany({ where: { competitionId: concurrentCompetition.id } });
      await prisma.competition.delete({ where: { id: concurrentCompetition.id } });
      await prisma.user.deleteMany({ where: { id: { in: newUsers.map(u => u.id) } } });
    });
  });

  describe('Database Query Performance', () => {
    it('should retrieve competition data efficiently', async () => {
      const startTime = performance.now();
      
      // Test various queries
      const [competition, entries, leaderboard, userEntries] = await Promise.all([
        competitionManager.getCompetition(testCompetitionId),
        prisma.competitionEntry.findMany({
          where: { competitionId: testCompetitionId },
          take: 100,
        }),
        prisma.leaderboard.findFirst({
          where: { competitionId: testCompetitionId },
        }),
        prisma.competitionEntry.findMany({
          where: { userId: testUserIds[0] },
        }),
      ]);
      
      const queryTime = performance.now() - startTime;
      console.log(`Database queries completed in ${queryTime.toFixed(2)}ms`);
      
      expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
      expect(competition).toBeDefined();
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should paginate leaderboard efficiently', async () => {
      const pageSize = 20;
      const pages = 5;
      
      const startTime = performance.now();
      
      for (let page = 0; page < pages; page++) {
        await leaderboardService.getLeaderboard(
          testCompetitionId,
          pageSize,
          page * pageSize
        );
      }
      
      const paginationTime = performance.now() - startTime;
      const avgTimePerPage = paginationTime / pages;
      
      console.log(`Paginated ${pages} pages in ${paginationTime.toFixed(2)}ms`);
      console.log(`Average time per page: ${avgTimePerPage.toFixed(2)}ms`);
      
      expect(avgTimePerPage).toBeLessThan(500); // Each page should load within 500ms
    });
  });
});

describe('Memory Leak Tests', () => {
  let prisma: PrismaClient;
  let leaderboardService: LeaderboardService;

  beforeAll(() => {
    prisma = new PrismaClient();
    leaderboardService = new LeaderboardService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should not leak memory during repeated operations', async () => {
    const iterations = 100;
    const memorySnapshots: number[] = [];
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const initialMemory = process.memoryUsage().heapUsed;
    memorySnapshots.push(initialMemory);
    
    for (let i = 0; i < iterations; i++) {
      // Simulate operations
      await prisma.competition.findMany({ take: 10 });
      
      if (i % 20 === 0) {
        if (global.gc) global.gc();
        const currentMemory = process.memoryUsage().heapUsed;
        memorySnapshots.push(currentMemory);
      }
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
    
    console.log(`Memory increase after ${iterations} iterations: ${memoryIncreaseMB.toFixed(2)} MB`);
    console.log('Memory snapshots (MB):', memorySnapshots.map(m => (m / 1024 / 1024).toFixed(2)));
    
    // Memory increase should be minimal (less than 50MB for 100 iterations)
    expect(memoryIncreaseMB).toBeLessThan(50);
  }, 30000);
});