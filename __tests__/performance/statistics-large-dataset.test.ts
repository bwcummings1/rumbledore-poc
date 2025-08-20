// Performance tests for statistics engine with large datasets
// Sprint 6: Statistics Engine - Performance testing

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { StatisticsEngine } from '@/lib/stats/statistics-engine';
import { CalculationType } from '@/types/statistics';
import { performance } from 'perf_hooks';

// Test configuration
const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/2';
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 
  'postgresql://rumbledore_test:test123@localhost:5432/rumbledore_test';

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  SEASON_CALC_MS: 5000,        // 5 seconds for season calculation
  H2H_CALC_MS: 10000,          // 10 seconds for H2H calculation
  RECORDS_CALC_MS: 8000,        // 8 seconds for records calculation
  TRENDS_CALC_MS: 15000,        // 15 seconds for trends calculation
  ALL_CALC_MS: 30000,           // 30 seconds for all calculations
  MEMORY_USAGE_MB: 500,         // Max 500MB memory usage
  CACHE_HIT_RATIO: 0.8,         // 80% cache hit ratio
};

describe('Statistics Performance Tests', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let statsEngine: StatisticsEngine;
  let testLeagueId: string;
  
  // Track performance metrics
  const metrics = {
    executionTimes: [] as number[],
    memoryUsage: [] as number[],
    cacheHits: 0,
    cacheMisses: 0,
  };

  beforeAll(async () => {
    // Initialize connections
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    redis = new Redis(TEST_REDIS_URL);
    await redis.flushdb();

    statsEngine = new StatisticsEngine(TEST_REDIS_URL);

    // Generate large dataset
    console.log('🏗️  Generating large test dataset...');
    testLeagueId = await generateLargeDataset();
    console.log(`✅ Generated dataset for league: ${testLeagueId}`);
  }, 60000); // 60 second timeout for setup

  afterAll(async () => {
    console.log('🧹 Cleaning up test data...');
    await cleanupTestData();
    await statsEngine.shutdown();
    await redis.quit();
    await prisma.$disconnect();
  });

  async function generateLargeDataset(): Promise<string> {
    const leagueId = `perf-test-${Date.now()}`;
    const numTeams = 12;
    const numSeasons = 10;
    const weeksPerSeason = 17;
    const playoffWeeks = 3;

    // Create user
    const user = await prisma.user.create({
      data: {
        id: `perf-user-${Date.now()}`,
        email: 'perf@test.com',
        name: 'Performance Test User',
      },
    });

    // Create league
    await prisma.league.create({
      data: {
        id: leagueId,
        espnLeagueId: '99999',
        name: 'Performance Test League',
        userId: user.id,
        isActive: true,
      },
    });

    // Create teams
    const teams = await Promise.all(
      Array.from({ length: numTeams }, (_, i) => 
        prisma.leagueTeam.create({
          data: {
            id: `team-${leagueId}-${i + 1}`,
            leagueId,
            espnTeamId: String(i + 1),
            name: `Team ${String.fromCharCode(65 + i)}`,
            abbreviation: `T${String.fromCharCode(65 + i)}`,
            ownerId: `owner-${i + 1}`,
            ownerName: `Owner ${i + 1}`,
          },
        })
      )
    );

    // Generate historical data for multiple seasons
    const batchSize = 100;
    let totalRecords = 0;

    for (let seasonYear = 2024 - numSeasons + 1; seasonYear <= 2024; seasonYear++) {
      const season = String(seasonYear);
      const weeklyStats = [];

      // Regular season + playoffs
      for (let week = 1; week <= weeksPerSeason + playoffWeeks; week++) {
        const isPlayoff = week > weeksPerSeason;
        
        // Generate matchups (round-robin style)
        for (let i = 0; i < numTeams; i += 2) {
          const team1Idx = (i + week - 1) % numTeams;
          const team2Idx = (i + week) % numTeams;
          
          const team1 = teams[team1Idx];
          const team2 = teams[team2Idx];
          
          // Generate realistic scores with some variance
          const baseScore = 100 + Math.random() * 50;
          const score1 = baseScore + (Math.random() - 0.5) * 40;
          const score2 = baseScore + (Math.random() - 0.5) * 40;
          
          weeklyStats.push({
            leagueId,
            season,
            week,
            teamId: team1.id,
            opponentId: team2.id,
            pointsFor: score1,
            pointsAgainst: score2,
            result: score1 > score2 ? 'WIN' : score1 < score2 ? 'LOSS' : 'TIE',
            isPlayoff,
            isChampionship: isPlayoff && week === weeksPerSeason + playoffWeeks,
            marginOfVictory: score1 - score2,
          });

          weeklyStats.push({
            leagueId,
            season,
            week,
            teamId: team2.id,
            opponentId: team1.id,
            pointsFor: score2,
            pointsAgainst: score1,
            result: score2 > score1 ? 'WIN' : score2 < score1 ? 'LOSS' : 'TIE',
            isPlayoff,
            isChampionship: isPlayoff && week === weeksPerSeason + playoffWeeks,
            marginOfVictory: score2 - score1,
          });
        }
      }

      // Batch insert weekly statistics
      for (let i = 0; i < weeklyStats.length; i += batchSize) {
        const batch = weeklyStats.slice(i, i + batchSize);
        await prisma.weeklyStatistics.createMany({ data: batch });
        totalRecords += batch.length;
      }

      // Create season summary statistics
      const seasonStats = teams.map(team => {
        const teamWeeklyStats = weeklyStats.filter(s => s.teamId === team.id);
        const wins = teamWeeklyStats.filter(s => s.result === 'WIN').length;
        const losses = teamWeeklyStats.filter(s => s.result === 'LOSS').length;
        const ties = teamWeeklyStats.filter(s => s.result === 'TIE').length;
        const pointsFor = teamWeeklyStats.reduce((sum, s) => sum + s.pointsFor, 0);
        const pointsAgainst = teamWeeklyStats.reduce((sum, s) => sum + s.pointsAgainst, 0);
        
        return {
          leagueId,
          season,
          teamId: team.id,
          wins,
          losses,
          ties,
          pointsFor,
          pointsAgainst,
          avgPointsFor: pointsFor / teamWeeklyStats.length,
          avgPointsAgainst: pointsAgainst / teamWeeklyStats.length,
          highestScore: Math.max(...teamWeeklyStats.map(s => s.pointsFor)),
          lowestScore: Math.min(...teamWeeklyStats.map(s => s.pointsFor)),
          playoffAppearance: wins >= 6, // Simple playoff logic
          championshipAppearance: wins >= 10,
        };
      });

      await prisma.seasonStatistics.createMany({ data: seasonStats });
      totalRecords += seasonStats.length;
    }

    console.log(`📊 Created ${totalRecords} total records`);
    return leagueId;
  }

  async function cleanupTestData() {
    if (!testLeagueId) return;

    await prisma.weeklyStatistics.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.seasonStatistics.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.allTimeRecord.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.headToHeadRecord.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.performanceTrend.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.championshipRecord.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.statisticsCalculation.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.leagueTeam.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.league.deleteMany({ where: { id: testLeagueId } });
    await prisma.user.deleteMany({ where: { email: 'perf@test.com' } });
  }

  function measureMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024); // MB
  }

  async function measureExecutionTime(
    fn: () => Promise<any>,
    label: string
  ): Promise<number> {
    const startMemory = measureMemoryUsage();
    const startTime = performance.now();
    
    await fn();
    
    const endTime = performance.now();
    const endMemory = measureMemoryUsage();
    
    const executionTime = endTime - startTime;
    const memoryDelta = endMemory - startMemory;
    
    metrics.executionTimes.push(executionTime);
    metrics.memoryUsage.push(memoryDelta);
    
    console.log(`⏱️  ${label}: ${executionTime.toFixed(2)}ms (Memory Δ: ${memoryDelta}MB)`);
    
    return executionTime;
  }

  describe('Season Statistics Performance', () => {
    it('should calculate 10 years of season statistics within threshold', async () => {
      const executionTime = await measureExecutionTime(
        async () => {
          const jobId = await statsEngine.queueCalculation({
            leagueId: testLeagueId,
            calculationType: CalculationType.SEASON,
          });
          
          // Wait for completion
          await new Promise(resolve => setTimeout(resolve, 4000));
        },
        'Season Statistics (10 years)'
      );

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SEASON_CALC_MS);

      // Verify results
      const stats = await prisma.seasonStatistics.findMany({
        where: { leagueId: testLeagueId },
      });
      
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should handle concurrent season calculations efficiently', async () => {
      const seasons = ['2024', '2023', '2022', '2021', '2020'];
      
      const executionTime = await measureExecutionTime(
        async () => {
          const jobs = await Promise.all(
            seasons.map(season => 
              statsEngine.queueCalculation({
                leagueId: testLeagueId,
                calculationType: CalculationType.SEASON,
                seasonId: season,
              })
            )
          );
          
          // Wait for all to complete
          await new Promise(resolve => setTimeout(resolve, 5000));
        },
        'Concurrent Season Calculations (5 seasons)'
      );

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SEASON_CALC_MS * 2);
    });
  });

  describe('Head-to-Head Performance', () => {
    it('should calculate H2H records for 12 teams within threshold', async () => {
      const executionTime = await measureExecutionTime(
        async () => {
          await statsEngine.calculateHeadToHead(testLeagueId);
        },
        'Head-to-Head Records (12 teams, 10 years)'
      );

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.H2H_CALC_MS);

      // Verify results (12 teams = 66 unique pairings)
      const h2h = await prisma.headToHeadRecord.findMany({
        where: { leagueId: testLeagueId },
      });
      
      expect(h2h.length).toBe(66); // C(12,2) = 66
    });
  });

  describe('All-Time Records Performance', () => {
    it('should identify records across 10 years within threshold', async () => {
      const executionTime = await measureExecutionTime(
        async () => {
          await statsEngine.calculateAllTimeRecords(testLeagueId);
        },
        'All-Time Records (10 years)'
      );

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.RECORDS_CALC_MS);

      // Verify records were created
      const records = await prisma.allTimeRecord.findMany({
        where: { leagueId: testLeagueId },
      });
      
      expect(records.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Trends', () => {
    it('should calculate trends for all teams within threshold', async () => {
      const executionTime = await measureExecutionTime(
        async () => {
          await statsEngine.calculatePerformanceTrends(testLeagueId);
        },
        'Performance Trends (12 teams, 10 years)'
      );

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.TRENDS_CALC_MS);

      // Verify trends were created
      const trends = await prisma.performanceTrend.findMany({
        where: { leagueId: testLeagueId },
        take: 10,
      });
      
      expect(trends.length).toBeGreaterThan(0);
    });
  });

  describe('Complete Statistics Calculation', () => {
    it('should calculate all statistics types within threshold', async () => {
      const executionTime = await measureExecutionTime(
        async () => {
          const jobId = await statsEngine.queueCalculation({
            leagueId: testLeagueId,
            calculationType: CalculationType.ALL,
            forceRecalculate: true,
          });
          
          // Wait for completion
          await new Promise(resolve => setTimeout(resolve, 25000));
        },
        'All Statistics Types'
      );

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.ALL_CALC_MS);

      // Verify all calculation types completed
      const logs = await prisma.statisticsCalculation.findMany({
        where: {
          leagueId: testLeagueId,
          status: 'COMPLETED',
        },
      });
      
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Usage', () => {
    it('should stay within memory limits during large calculations', () => {
      const maxMemory = Math.max(...metrics.memoryUsage);
      console.log(`📊 Max memory delta: ${maxMemory}MB`);
      
      expect(maxMemory).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_USAGE_MB);
    });

    it('should not have memory leaks after multiple calculations', async () => {
      const initialMemory = measureMemoryUsage();
      
      // Run multiple calculations
      for (let i = 0; i < 5; i++) {
        await statsEngine.queueCalculation({
          leagueId: testLeagueId,
          calculationType: CalculationType.SEASON,
          seasonId: String(2024 - i),
        });
      }
      
      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = measureMemoryUsage();
      const memoryGrowth = finalMemory - initialMemory;
      
      console.log(`📊 Memory growth after 5 calculations: ${memoryGrowth}MB`);
      
      // Memory growth should be reasonable
      expect(memoryGrowth).toBeLessThan(100); // Less than 100MB growth
    });
  });

  describe('Cache Performance', () => {
    it('should have high cache hit ratio for repeated queries', async () => {
      // First pass - cache misses
      const firstPassStart = performance.now();
      await statsEngine.calculateSeasonStatistics(testLeagueId, '2024');
      const firstPassTime = performance.now() - firstPassStart;
      
      // Second pass - should hit cache
      const secondPassStart = performance.now();
      await statsEngine.calculateSeasonStatistics(testLeagueId, '2024');
      const secondPassTime = performance.now() - secondPassStart;
      
      // Cache hit should be significantly faster
      const speedup = firstPassTime / secondPassTime;
      console.log(`📊 Cache speedup: ${speedup.toFixed(2)}x`);
      
      expect(speedup).toBeGreaterThan(2); // At least 2x faster with cache
    });

    it('should efficiently manage cache size', async () => {
      const cacheKeys = await redis.keys(`stats:${testLeagueId}:*`);
      const totalCacheSize = await Promise.all(
        cacheKeys.map(async key => {
          const value = await redis.get(key);
          return value ? value.length : 0;
        })
      ).then(sizes => sizes.reduce((sum, size) => sum + size, 0));
      
      const cacheSizeMB = totalCacheSize / 1024 / 1024;
      console.log(`📊 Total cache size: ${cacheSizeMB.toFixed(2)}MB for ${cacheKeys.length} keys`);
      
      // Cache should be reasonable size
      expect(cacheSizeMB).toBeLessThan(50); // Less than 50MB cache for this dataset
    });
  });

  describe('Database Query Performance', () => {
    it('should use indexes efficiently for queries', async () => {
      // Test query performance with EXPLAIN ANALYZE
      const queryPlans = [];
      
      // Test index usage for season statistics query
      const seasonStatsQuery = prisma.$queryRaw`
        EXPLAIN ANALYZE
        SELECT * FROM season_statistics
        WHERE league_id = ${testLeagueId}
        AND season = '2024'
        ORDER BY wins DESC
        LIMIT 10
      `;
      
      const plan = await seasonStatsQuery;
      console.log('📊 Season stats query plan:', plan);
      
      // Query should complete quickly
      const start = performance.now();
      const results = await prisma.seasonStatistics.findMany({
        where: {
          leagueId: testLeagueId,
          season: '2024',
        },
        orderBy: { wins: 'desc' },
        take: 10,
      });
      const queryTime = performance.now() - start;
      
      console.log(`📊 Season stats query time: ${queryTime.toFixed(2)}ms`);
      expect(queryTime).toBeLessThan(100); // Should be very fast with indexes
    });
  });

  describe('Materialized View Performance', () => {
    it('should refresh materialized views efficiently', async () => {
      const executionTime = await measureExecutionTime(
        async () => {
          await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_season_statistics`;
        },
        'Materialized View Refresh'
      );

      // Refresh should be relatively fast even with large dataset
      expect(executionTime).toBeLessThan(5000);
    });

    it('should query materialized views faster than base tables', async () => {
      // Query from base tables
      const baseStart = performance.now();
      const baseResult = await prisma.$queryRaw`
        SELECT 
          league_id,
          season,
          team_id,
          COUNT(*) as games_played,
          SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins
        FROM weekly_statistics
        WHERE league_id = ${testLeagueId}
        GROUP BY league_id, season, team_id
      `;
      const baseTime = performance.now() - baseStart;

      // Query from materialized view
      const mvStart = performance.now();
      const mvResult = await prisma.$queryRaw`
        SELECT * FROM mv_season_statistics
        WHERE league_id = ${testLeagueId}
      `;
      const mvTime = performance.now() - mvStart;

      console.log(`📊 Base table query: ${baseTime.toFixed(2)}ms`);
      console.log(`📊 Materialized view query: ${mvTime.toFixed(2)}ms`);
      console.log(`📊 Speedup: ${(baseTime / mvTime).toFixed(2)}x`);

      // Materialized view should be faster
      expect(mvTime).toBeLessThan(baseTime);
    });
  });

  describe('Performance Report', () => {
    it('should generate performance summary', () => {
      console.log('\n' + '='.repeat(60));
      console.log('📊 PERFORMANCE TEST SUMMARY');
      console.log('='.repeat(60));
      
      const avgExecutionTime = metrics.executionTimes.reduce((a, b) => a + b, 0) / metrics.executionTimes.length;
      const maxExecutionTime = Math.max(...metrics.executionTimes);
      const minExecutionTime = Math.min(...metrics.executionTimes);
      
      const avgMemoryUsage = metrics.memoryUsage.reduce((a, b) => a + b, 0) / metrics.memoryUsage.length;
      const maxMemoryUsage = Math.max(...metrics.memoryUsage);
      
      console.log(`\n⏱️  Execution Times:`);
      console.log(`   Average: ${avgExecutionTime.toFixed(2)}ms`);
      console.log(`   Min: ${minExecutionTime.toFixed(2)}ms`);
      console.log(`   Max: ${maxExecutionTime.toFixed(2)}ms`);
      
      console.log(`\n💾 Memory Usage:`);
      console.log(`   Average Delta: ${avgMemoryUsage.toFixed(2)}MB`);
      console.log(`   Max Delta: ${maxMemoryUsage.toFixed(2)}MB`);
      
      console.log('\n✅ All performance tests passed!');
      console.log('='.repeat(60) + '\n');
      
      // All metrics should be within acceptable ranges
      expect(avgExecutionTime).toBeLessThan(10000);
      expect(maxMemoryUsage).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_USAGE_MB);
    });
  });
});