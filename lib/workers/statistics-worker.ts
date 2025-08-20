// Statistics Worker Service
// Sprint 6: Statistics Engine - Dedicated worker for processing statistics calculations

import { StatisticsEngine } from '../stats/statistics-engine';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import { RealtimeStatsService } from '../stats/realtime-stats';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Worker configuration
const WORKER_CONFIG = {
  SOCKET_PORT: parseInt(process.env.STATS_SOCKET_PORT || '3002'),
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  CONCURRENCY: parseInt(process.env.STATS_WORKER_CONCURRENCY || '3'),
  MAX_RETRIES: parseInt(process.env.STATS_MAX_RETRIES || '3'),
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
  METRICS_INTERVAL: 60000, // 1 minute
};

// Worker metrics
const metrics = {
  jobsProcessed: 0,
  jobsFailed: 0,
  avgProcessingTime: 0,
  currentQueueSize: 0,
  uptime: Date.now(),
  lastHealthCheck: Date.now(),
};

let statsEngine: StatisticsEngine;
let realtimeService: RealtimeStatsService;
let io: SocketServer;
let healthCheckInterval: NodeJS.Timeout;
let metricsInterval: NodeJS.Timeout;

/**
 * Initialize the statistics worker
 */
export async function initializeWorker() {
  console.log('[Worker] Initializing statistics worker...');
  
  try {
    // Test database connection
    await prisma.$connect();
    console.log('[Worker] ✅ Database connected');
    
    // Test Redis connection
    await redis.ping();
    console.log('[Worker] ✅ Redis connected');
    
    // Initialize Socket.IO server
    const httpServer = createServer();
    io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });
    
    // Start Socket.IO server
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(WORKER_CONFIG.SOCKET_PORT, () => {
        console.log(`[Worker] ✅ Socket.IO server listening on port ${WORKER_CONFIG.SOCKET_PORT}`);
        resolve();
      }).on('error', reject);
    });
    
    // Initialize statistics engine with custom configuration
    statsEngine = new StatisticsEngine(WORKER_CONFIG.REDIS_URL, {
      concurrency: WORKER_CONFIG.CONCURRENCY,
      defaultJobOptions: {
        attempts: WORKER_CONFIG.MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
      },
    });
    
    // Initialize real-time service
    realtimeService = new RealtimeStatsService(io, WORKER_CONFIG.REDIS_URL);
    
    // Set up job event listeners
    setupJobEventListeners();
    
    // Start health checks
    startHealthChecks();
    
    // Start metrics collection
    startMetricsCollection();
    
    console.log('[Worker] ✅ Statistics worker initialized successfully');
    console.log(`[Worker] Configuration:`);
    console.log(`  - Concurrency: ${WORKER_CONFIG.CONCURRENCY}`);
    console.log(`  - Max Retries: ${WORKER_CONFIG.MAX_RETRIES}`);
    console.log(`  - Socket Port: ${WORKER_CONFIG.SOCKET_PORT}`);
    
    return true;
  } catch (error) {
    console.error('[Worker] ❌ Failed to initialize worker:', error);
    throw error;
  }
}

/**
 * Set up event listeners for job processing
 */
function setupJobEventListeners() {
  // Listen to queue events via Redis pub/sub
  const subClient = redis.duplicate();
  
  subClient.subscribe(
    'stats:job:completed',
    'stats:job:failed',
    'stats:job:progress',
    'stats:job:stalled'
  );
  
  subClient.on('message', async (channel, message) => {
    try {
      const data = JSON.parse(message);
      
      switch (channel) {
        case 'stats:job:completed':
          handleJobCompleted(data);
          break;
        case 'stats:job:failed':
          handleJobFailed(data);
          break;
        case 'stats:job:progress':
          handleJobProgress(data);
          break;
        case 'stats:job:stalled':
          handleJobStalled(data);
          break;
      }
    } catch (error) {
      console.error(`[Worker] Error handling ${channel} event:`, error);
    }
  });
}

/**
 * Handle job completion
 */
function handleJobCompleted(data: any) {
  metrics.jobsProcessed++;
  
  // Update average processing time
  if (data.processingTime) {
    metrics.avgProcessingTime = 
      (metrics.avgProcessingTime * (metrics.jobsProcessed - 1) + data.processingTime) / 
      metrics.jobsProcessed;
  }
  
  console.log(`[Worker] Job completed: ${data.jobId} (${data.calculationType}) in ${data.processingTime}ms`);
  
  // Publish completion event for real-time updates
  realtimeService.publishUpdate('stats:complete', data);
}

/**
 * Handle job failure
 */
function handleJobFailed(data: any) {
  metrics.jobsFailed++;
  
  console.error(`[Worker] Job failed: ${data.jobId} (${data.calculationType})`);
  console.error(`[Worker] Error: ${data.error}`);
  
  // Publish failure event
  realtimeService.publishUpdate('stats:failed', data);
  
  // Check if we should alert (too many failures)
  const failureRate = metrics.jobsFailed / (metrics.jobsProcessed + metrics.jobsFailed);
  if (failureRate > 0.1 && metrics.jobsProcessed > 10) { // >10% failure rate
    console.error(`[Worker] ⚠️ High failure rate detected: ${(failureRate * 100).toFixed(1)}%`);
  }
}

/**
 * Handle job progress updates
 */
function handleJobProgress(data: any) {
  console.log(`[Worker] Job progress: ${data.jobId} - ${data.progress}%`);
  
  // Publish progress event
  realtimeService.publishUpdate('stats:progress', data);
}

/**
 * Handle stalled jobs
 */
function handleJobStalled(data: any) {
  console.warn(`[Worker] Job stalled: ${data.jobId} (${data.calculationType})`);
  
  // Attempt to restart the job
  console.log(`[Worker] Attempting to restart stalled job: ${data.jobId}`);
}

/**
 * Start health check monitoring
 */
function startHealthChecks() {
  healthCheckInterval = setInterval(async () => {
    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;
      
      // Check Redis connection
      await redis.ping();
      
      // Check queue health
      const queueHealth = await getQueueHealth();
      
      metrics.lastHealthCheck = Date.now();
      metrics.currentQueueSize = queueHealth.waiting + queueHealth.active;
      
      // Log health status
      if (queueHealth.failed > 10) {
        console.warn(`[Worker] ⚠️ Health Check: ${queueHealth.failed} failed jobs in queue`);
      }
      
      if (queueHealth.waiting > 100) {
        console.warn(`[Worker] ⚠️ Health Check: ${queueHealth.waiting} jobs waiting in queue`);
      }
      
    } catch (error) {
      console.error('[Worker] ❌ Health check failed:', error);
    }
  }, WORKER_CONFIG.HEALTH_CHECK_INTERVAL);
}

/**
 * Start metrics collection
 */
function startMetricsCollection() {
  metricsInterval = setInterval(async () => {
    const uptime = Date.now() - metrics.uptime;
    const uptimeHours = (uptime / 1000 / 60 / 60).toFixed(2);
    
    console.log('[Worker] 📊 Metrics Report:');
    console.log(`  - Uptime: ${uptimeHours} hours`);
    console.log(`  - Jobs Processed: ${metrics.jobsProcessed}`);
    console.log(`  - Jobs Failed: ${metrics.jobsFailed}`);
    console.log(`  - Success Rate: ${((1 - metrics.jobsFailed / (metrics.jobsProcessed || 1)) * 100).toFixed(1)}%`);
    console.log(`  - Avg Processing Time: ${metrics.avgProcessingTime.toFixed(0)}ms`);
    console.log(`  - Current Queue Size: ${metrics.currentQueueSize}`);
    console.log(`  - Memory Usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
    
    // Store metrics in Redis for monitoring
    await redis.set(
      'stats:worker:metrics',
      JSON.stringify({
        ...metrics,
        timestamp: new Date().toISOString(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      }),
      'EX',
      300 // Expire after 5 minutes
    );
  }, WORKER_CONFIG.METRICS_INTERVAL);
}

/**
 * Get queue health status
 */
async function getQueueHealth() {
  // This would normally query Bull queue status
  // For now, return mock data
  return {
    waiting: 0,
    active: 0,
    completed: metrics.jobsProcessed,
    failed: metrics.jobsFailed,
    delayed: 0,
    paused: false,
  };
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('[Worker] Shutting down statistics worker...');
  
  // Clear intervals
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  if (metricsInterval) clearInterval(metricsInterval);
  
  // Shutdown services
  if (statsEngine) await statsEngine.shutdown();
  if (realtimeService) await realtimeService.shutdown();
  
  // Close connections
  if (io) io.close();
  await redis.quit();
  await prisma.$disconnect();
  
  console.log('[Worker] ✅ Statistics worker shut down successfully');
}

/**
 * Handle process signals
 */
process.on('SIGINT', async () => {
  console.log('[Worker] Received SIGINT');
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Worker] Received SIGTERM');
  await shutdown();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught exception:', error);
  metrics.jobsFailed++;
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
  metrics.jobsFailed++;
});

// Start worker if running directly
if (require.main === module) {
  initializeWorker()
    .then(() => {
      console.log('[Worker] 🚀 Statistics worker is running');
      console.log('[Worker] Press Ctrl+C to stop');
    })
    .catch((error) => {
      console.error('[Worker] Failed to start:', error);
      process.exit(1);
    });
}

// Export for testing
export {
  metrics,
  shutdown,
  getQueueHealth,
};