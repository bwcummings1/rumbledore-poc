import { ESPNClient } from '@/lib/espn/client';
import { queueManager, QueueName } from '@/lib/queue/queue';
import { cacheManager } from '@/lib/cache/cache-manager';
import { wsServer } from '@/lib/websocket/server';
import { processLeagueSync } from '@/lib/queue/processors/league-sync';
import { prisma } from '@/lib/prisma';
import { getCookieManager } from '@/lib/crypto/cookie-manager';

export interface SyncOptions {
  fullSync?: boolean;
  scoringPeriodId?: number;
  forceRefresh?: boolean;
}

export interface SyncResult {
  success: boolean;
  jobId: string;
  leagueId: string;
  startTime: Date;
  error?: string;
}

export class SyncManager {
  private syncInProgress: Map<string, string> = new Map(); // leagueId -> jobId
  private static instance: SyncManager;

  private constructor() {
    this.initializeQueueProcessors();
  }

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  private initializeQueueProcessors() {
    // Register league sync processor
    queueManager.processQueue(QueueName.LEAGUE_SYNC, processLeagueSync, 2);
    
    // Register other processors as needed
    // queueManager.processQueue(QueueName.PLAYER_SYNC, processPlayerSync);
    // queueManager.processQueue(QueueName.SCORE_UPDATE, processScoreUpdate);
    // queueManager.processQueue(QueueName.TRANSACTION_SYNC, processTransactionSync);
    
    console.log('Queue processors initialized');
  }

  async syncLeague(
    leagueId: string, 
    userId: string, 
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const startTime = new Date();
    
    // Check if sync is already in progress
    if (this.syncInProgress.has(leagueId)) {
      const existingJobId = this.syncInProgress.get(leagueId)!;
      console.log(`Sync already in progress for league ${leagueId} (job: ${existingJobId})`);
      
      return {
        success: false,
        jobId: existingJobId,
        leagueId,
        startTime,
        error: 'Sync already in progress',
      };
    }

    try {
      // Verify user has access to league
      const member = await prisma.leagueMember.findUnique({
        where: {
          leagueId_userId: { leagueId, userId },
        },
      });

      if (!member) {
        throw new Error('User does not have access to this league');
      }

      // Check if credentials are valid
      const cookieManager = getCookieManager();
      const cookieStatus = await cookieManager.getCookieStatus(userId, leagueId);
      
      if (!cookieStatus.hasCredentials || !cookieStatus.isValid) {
        throw new Error('Invalid or missing ESPN credentials');
      }

      // Clear cache if force refresh requested
      if (options.forceRefresh) {
        await cacheManager.invalidateLeague(leagueId);
      }

      // Add sync job to queue
      const job = await queueManager.addJob(
        QueueName.LEAGUE_SYNC,
        {
          leagueId,
          userId,
          fullSync: options.fullSync || false,
          scoringPeriodId: options.scoringPeriodId,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );

      // Track sync progress
      this.syncInProgress.set(leagueId, job.id.toString());
      
      // Emit sync started event
      wsServer.emitSyncStatus(leagueId, 'started', 0);

      // Set up job event handlers
      job.on('progress', (progress) => {
        wsServer.emitSyncStatus(leagueId, 'progress', progress);
      });

      job.on('completed', (result) => {
        this.syncInProgress.delete(leagueId);
        wsServer.emitSyncStatus(leagueId, 'completed', 100);
        console.log(`Sync completed for league ${leagueId}:`, result);
        
        // Update last sync timestamp
        prisma.league.update({
          where: { id: leagueId },
          data: { lastSyncAt: new Date() },
        }).catch(error => {
          console.error('Failed to update last sync timestamp:', error);
        });
      });

      job.on('failed', (error) => {
        this.syncInProgress.delete(leagueId);
        wsServer.emitSyncStatus(leagueId, 'failed');
        console.error(`Sync failed for league ${leagueId}:`, error);
        
        // Schedule retry if appropriate
        this.scheduleRetry(leagueId, userId, options);
      });

      return {
        success: true,
        jobId: job.id.toString(),
        leagueId,
        startTime,
      };
    } catch (error) {
      this.syncInProgress.delete(leagueId);
      wsServer.emitSyncStatus(leagueId, 'failed');
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to start sync for league ${leagueId}:`, errorMessage);
      
      return {
        success: false,
        jobId: '',
        leagueId,
        startTime,
        error: errorMessage,
      };
    }
  }

  private async scheduleRetry(
    leagueId: string, 
    userId: string, 
    options: SyncOptions,
    attempt = 1
  ) {
    const maxAttempts = 3;
    const baseDelay = 60000; // 1 minute
    
    if (attempt > maxAttempts) {
      console.error(`Max retry attempts reached for league ${leagueId}`);
      await this.notifyFailure(leagueId, userId);
      return;
    }

    const delay = baseDelay * Math.pow(2, attempt - 1);
    console.log(`Scheduling retry ${attempt} for league ${leagueId} in ${delay}ms`);

    setTimeout(() => {
      this.syncLeague(leagueId, userId, options).catch(() => {
        this.scheduleRetry(leagueId, userId, options, attempt + 1);
      });
    }, delay);
  }

  private async notifyFailure(leagueId: string, userId: string) {
    // Send notification about sync failure
    // This could be an email, in-app notification, etc.
    console.error(`Notifying user ${userId} of sync failure for league ${leagueId}`);
    
    // You could emit a WebSocket event for immediate notification
    wsServer.emitToUser(userId, 'sync:failure', {
      leagueId,
      message: 'League sync failed after multiple attempts',
    });
  }

  async getSyncStatus(leagueId: string): Promise<{
    inProgress: boolean;
    jobId?: string;
    progress?: number;
  }> {
    const jobId = this.syncInProgress.get(leagueId);
    
    if (!jobId) {
      return { inProgress: false };
    }

    const job = await queueManager.getJob(QueueName.LEAGUE_SYNC, jobId);
    
    if (!job) {
      // Job no longer exists, clean up
      this.syncInProgress.delete(leagueId);
      return { inProgress: false };
    }

    const progress = job.progress();
    
    return {
      inProgress: true,
      jobId,
      progress: typeof progress === 'number' ? progress : 0,
    };
  }

  async getQueueStatus(): Promise<{
    healthy: boolean;
    queues: Record<string, any>;
  }> {
    const queueHealth = await queueManager.getQueueHealth();
    
    const healthy = Object.values(queueHealth).every(
      (status: any) => status.isHealthy
    );

    return {
      healthy,
      queues: queueHealth,
    };
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    queues: Record<string, any>;
    cache: boolean;
    websocket: boolean;
  }> {
    const queueStatus = await this.getQueueStatus();
    const cacheHealthy = await cacheManager.cache.exists('health', 'check');
    const websocketHealthy = wsServer.isInitialized();

    return {
      healthy: queueStatus.healthy && cacheHealthy && websocketHealthy,
      queues: queueStatus.queues,
      cache: cacheHealthy,
      websocket: websocketHealthy,
    };
  }

  async cancelSync(leagueId: string): Promise<boolean> {
    const jobId = this.syncInProgress.get(leagueId);
    
    if (!jobId) {
      return false;
    }

    try {
      const job = await queueManager.getJob(QueueName.LEAGUE_SYNC, jobId);
      
      if (job) {
        await job.remove();
        this.syncInProgress.delete(leagueId);
        wsServer.emitSyncStatus(leagueId, 'failed');
        return true;
      }
    } catch (error) {
      console.error(`Failed to cancel sync for league ${leagueId}:`, error);
    }

    return false;
  }

  async getActiveSyncs(): Promise<Array<{
    leagueId: string;
    jobId: string;
    progress: number;
  }>> {
    const activeSyncs = [];
    
    for (const [leagueId, jobId] of this.syncInProgress.entries()) {
      const job = await queueManager.getJob(QueueName.LEAGUE_SYNC, jobId);
      
      if (job) {
        const progress = job.progress();
        activeSyncs.push({
          leagueId,
          jobId,
          progress: typeof progress === 'number' ? progress : 0,
        });
      } else {
        // Clean up stale entry
        this.syncInProgress.delete(leagueId);
      }
    }
    
    return activeSyncs;
  }

  async clearStaleJobs(): Promise<void> {
    // Clean completed and failed jobs older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const queueName of Object.values(QueueName)) {
      await queueManager.cleanQueue(queueName, oneHourAgo);
    }
    
    console.log('Cleared stale jobs from all queues');
  }
}

export const syncManager = SyncManager.getInstance();