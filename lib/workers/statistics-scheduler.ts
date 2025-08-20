// Statistics Scheduler Service
// Sprint 6: Statistics Engine - Automated scheduling for statistics calculations

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { StatisticsEngine } from '../stats/statistics-engine';
import { CalculationType } from '@/types/statistics';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const statsEngine = new StatisticsEngine(process.env.REDIS_URL);

// Scheduler configuration
const SCHEDULES = {
  // Refresh materialized views every hour
  REFRESH_VIEWS: '0 * * * *',
  
  // Calculate season statistics every 4 hours during season
  SEASON_STATS: '0 */4 * * *',
  
  // Calculate all-time records daily at 2 AM
  ALL_TIME_RECORDS: '0 2 * * *',
  
  // Calculate head-to-head records daily at 3 AM
  HEAD_TO_HEAD: '0 3 * * *',
  
  // Calculate performance trends weekly on Sunday at 4 AM
  PERFORMANCE_TRENDS: '0 4 * * 0',
  
  // Full recalculation monthly on the 1st at 5 AM
  FULL_RECALC: '0 5 1 * *',
  
  // Clean up old calculation logs weekly
  CLEANUP_LOGS: '0 0 * * 0',
};

// Track active schedules
const activeSchedules: Map<string, cron.ScheduledTask> = new Map();

/**
 * Refresh materialized views for all active leagues
 */
async function refreshMaterializedViews() {
  console.log('[Scheduler] Starting materialized view refresh...');
  const startTime = Date.now();
  
  try {
    // Refresh both materialized views concurrently
    await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_season_statistics`;
    await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_h2h_summary`;
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Materialized views refreshed in ${duration}ms`);
    
    // Log success
    await logScheduledJob('REFRESH_VIEWS', 'SUCCESS', duration);
  } catch (error) {
    console.error('[Scheduler] Error refreshing materialized views:', error);
    await logScheduledJob('REFRESH_VIEWS', 'FAILED', Date.now() - startTime, error);
  }
}

/**
 * Calculate season statistics for all active leagues
 */
async function calculateSeasonStatistics() {
  console.log('[Scheduler] Starting season statistics calculation...');
  const startTime = Date.now();
  
  try {
    // Get all active leagues
    const activeLeagues = await prisma.league.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    
    console.log(`[Scheduler] Processing ${activeLeagues.length} active leagues`);
    
    // Queue calculations for each league
    const jobs = await Promise.all(
      activeLeagues.map(league =>
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.SEASON,
          priority: 3, // Medium priority for scheduled jobs
        })
      )
    );
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Queued ${jobs.length} season statistics jobs in ${duration}ms`);
    
    await logScheduledJob('SEASON_STATS', 'SUCCESS', duration, null, jobs.length);
  } catch (error) {
    console.error('[Scheduler] Error calculating season statistics:', error);
    await logScheduledJob('SEASON_STATS', 'FAILED', Date.now() - startTime, error);
  }
}

/**
 * Calculate all-time records for all active leagues
 */
async function calculateAllTimeRecords() {
  console.log('[Scheduler] Starting all-time records calculation...');
  const startTime = Date.now();
  
  try {
    const activeLeagues = await prisma.league.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    
    const jobs = await Promise.all(
      activeLeagues.map(league =>
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.RECORDS,
          priority: 4, // Lower priority for daily jobs
        })
      )
    );
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Queued ${jobs.length} all-time records jobs in ${duration}ms`);
    
    await logScheduledJob('ALL_TIME_RECORDS', 'SUCCESS', duration, null, jobs.length);
  } catch (error) {
    console.error('[Scheduler] Error calculating all-time records:', error);
    await logScheduledJob('ALL_TIME_RECORDS', 'FAILED', Date.now() - startTime, error);
  }
}

/**
 * Calculate head-to-head records for all active leagues
 */
async function calculateHeadToHeadRecords() {
  console.log('[Scheduler] Starting head-to-head records calculation...');
  const startTime = Date.now();
  
  try {
    const activeLeagues = await prisma.league.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    
    const jobs = await Promise.all(
      activeLeagues.map(league =>
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.HEAD_TO_HEAD,
          priority: 4,
        })
      )
    );
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Queued ${jobs.length} head-to-head jobs in ${duration}ms`);
    
    await logScheduledJob('HEAD_TO_HEAD', 'SUCCESS', duration, null, jobs.length);
  } catch (error) {
    console.error('[Scheduler] Error calculating head-to-head records:', error);
    await logScheduledJob('HEAD_TO_HEAD', 'FAILED', Date.now() - startTime, error);
  }
}

/**
 * Calculate performance trends for all active leagues
 */
async function calculatePerformanceTrends() {
  console.log('[Scheduler] Starting performance trends calculation...');
  const startTime = Date.now();
  
  try {
    const activeLeagues = await prisma.league.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    
    const jobs = await Promise.all(
      activeLeagues.map(league =>
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.TRENDS,
          priority: 5, // Lowest priority for weekly jobs
        })
      )
    );
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Queued ${jobs.length} performance trends jobs in ${duration}ms`);
    
    await logScheduledJob('PERFORMANCE_TRENDS', 'SUCCESS', duration, null, jobs.length);
  } catch (error) {
    console.error('[Scheduler] Error calculating performance trends:', error);
    await logScheduledJob('PERFORMANCE_TRENDS', 'FAILED', Date.now() - startTime, error);
  }
}

/**
 * Perform full statistics recalculation for all active leagues
 */
async function fullRecalculation() {
  console.log('[Scheduler] Starting full statistics recalculation...');
  const startTime = Date.now();
  
  try {
    const activeLeagues = await prisma.league.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    
    console.log(`[Scheduler] Performing full recalculation for ${activeLeagues.length} leagues`);
    
    const jobs = await Promise.all(
      activeLeagues.map(league =>
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.ALL,
          forceRecalculate: true,
          priority: 5, // Low priority for monthly job
        })
      )
    );
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Queued ${jobs.length} full recalculation jobs in ${duration}ms`);
    
    await logScheduledJob('FULL_RECALC', 'SUCCESS', duration, null, jobs.length);
  } catch (error) {
    console.error('[Scheduler] Error in full recalculation:', error);
    await logScheduledJob('FULL_RECALC', 'FAILED', Date.now() - startTime, error);
  }
}

/**
 * Clean up old calculation logs
 */
async function cleanupOldLogs() {
  console.log('[Scheduler] Starting cleanup of old calculation logs...');
  const startTime = Date.now();
  
  try {
    // Delete logs older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await prisma.statisticsCalculation.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Deleted ${result.count} old calculation logs in ${duration}ms`);
    
    // Clean up old Redis keys
    const oldCacheKeys = await redis.keys('stats:*');
    let deletedKeys = 0;
    
    for (const key of oldCacheKeys) {
      const ttl = await redis.ttl(key);
      // Delete keys that have no TTL or expired
      if (ttl === -1 || ttl === -2) {
        await redis.del(key);
        deletedKeys++;
      }
    }
    
    console.log(`[Scheduler] Deleted ${deletedKeys} expired cache keys`);
    
    await logScheduledJob('CLEANUP_LOGS', 'SUCCESS', duration, null, result.count);
  } catch (error) {
    console.error('[Scheduler] Error cleaning up logs:', error);
    await logScheduledJob('CLEANUP_LOGS', 'FAILED', Date.now() - startTime, error);
  }
}

/**
 * Log scheduled job execution
 */
async function logScheduledJob(
  jobType: string,
  status: 'SUCCESS' | 'FAILED',
  executionTime: number,
  error?: any,
  recordsProcessed?: number
) {
  try {
    await prisma.statisticsCalculation.create({
      data: {
        leagueId: '00000000-0000-0000-0000-000000000000', // System job
        calculationType: `SCHEDULED_${jobType}`,
        status: status === 'SUCCESS' ? 'COMPLETED' : 'FAILED',
        startedAt: new Date(Date.now() - executionTime),
        completedAt: new Date(),
        executionTimeMs: Math.round(executionTime),
        recordsProcessed: recordsProcessed || 0,
        errorMessage: error ? String(error) : null,
        metadata: {
          jobType,
          scheduledRun: true,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (logError) {
    console.error('[Scheduler] Error logging job:', logError);
  }
}

/**
 * Start all scheduled jobs
 */
export function startScheduler() {
  console.log('[Scheduler] Starting statistics scheduler...');
  
  // Schedule materialized view refresh
  const refreshViewsTask = cron.schedule(SCHEDULES.REFRESH_VIEWS, refreshMaterializedViews, {
    scheduled: false,
  });
  activeSchedules.set('REFRESH_VIEWS', refreshViewsTask);
  refreshViewsTask.start();
  
  // Schedule season statistics calculation
  const seasonStatsTask = cron.schedule(SCHEDULES.SEASON_STATS, calculateSeasonStatistics, {
    scheduled: false,
  });
  activeSchedules.set('SEASON_STATS', seasonStatsTask);
  seasonStatsTask.start();
  
  // Schedule all-time records calculation
  const recordsTask = cron.schedule(SCHEDULES.ALL_TIME_RECORDS, calculateAllTimeRecords, {
    scheduled: false,
  });
  activeSchedules.set('ALL_TIME_RECORDS', recordsTask);
  recordsTask.start();
  
  // Schedule head-to-head calculation
  const h2hTask = cron.schedule(SCHEDULES.HEAD_TO_HEAD, calculateHeadToHeadRecords, {
    scheduled: false,
  });
  activeSchedules.set('HEAD_TO_HEAD', h2hTask);
  h2hTask.start();
  
  // Schedule performance trends calculation
  const trendsTask = cron.schedule(SCHEDULES.PERFORMANCE_TRENDS, calculatePerformanceTrends, {
    scheduled: false,
  });
  activeSchedules.set('PERFORMANCE_TRENDS', trendsTask);
  trendsTask.start();
  
  // Schedule full recalculation
  const fullRecalcTask = cron.schedule(SCHEDULES.FULL_RECALC, fullRecalculation, {
    scheduled: false,
  });
  activeSchedules.set('FULL_RECALC', fullRecalcTask);
  fullRecalcTask.start();
  
  // Schedule cleanup
  const cleanupTask = cron.schedule(SCHEDULES.CLEANUP_LOGS, cleanupOldLogs, {
    scheduled: false,
  });
  activeSchedules.set('CLEANUP_LOGS', cleanupTask);
  cleanupTask.start();
  
  console.log(`[Scheduler] Started ${activeSchedules.size} scheduled jobs`);
  
  // Log active schedules
  console.log('[Scheduler] Active schedules:');
  for (const [name, schedule] of Object.entries(SCHEDULES)) {
    console.log(`  - ${name}: ${schedule}`);
  }
}

/**
 * Stop all scheduled jobs
 */
export function stopScheduler() {
  console.log('[Scheduler] Stopping statistics scheduler...');
  
  for (const [name, task] of activeSchedules) {
    task.stop();
    console.log(`[Scheduler] Stopped ${name}`);
  }
  
  activeSchedules.clear();
  console.log('[Scheduler] All scheduled jobs stopped');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  const status = {
    active: activeSchedules.size > 0,
    jobs: Array.from(activeSchedules.entries()).map(([name, task]) => ({
      name,
      running: task.status === 'scheduled',
    })),
    schedules: SCHEDULES,
  };
  
  return status;
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Scheduler] Received SIGINT, shutting down gracefully...');
  stopScheduler();
  await statsEngine.shutdown();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Scheduler] Received SIGTERM, shutting down gracefully...');
  stopScheduler();
  await statsEngine.shutdown();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
});

// Start scheduler if running directly
if (require.main === module) {
  startScheduler();
  console.log('[Scheduler] Statistics scheduler is running. Press Ctrl+C to stop.');
}