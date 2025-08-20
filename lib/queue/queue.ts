import Bull from 'bull';
import { getRedis } from '@/lib/redis';

export enum QueueName {
  LEAGUE_SYNC = 'league-sync',
  PLAYER_SYNC = 'player-sync',
  SCORE_UPDATE = 'score-update',
  TRANSACTION_SYNC = 'transaction-sync',
  HISTORICAL_DATA_IMPORT = 'historical-data-import',
}

export interface QueueJob<T = any> {
  id: string;
  data: T;
  timestamp: number;
  attempts?: number;
}

export class QueueManager {
  private queues: Map<QueueName, Bull.Queue> = new Map();
  private static instance: QueueManager;

  private constructor() {
    this.initializeQueues();
  }

  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  private initializeQueues() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    Object.values(QueueName).forEach(name => {
      const queue = new Bull(name, redisUrl, {
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      // Add event handlers
      queue.on('completed', (job) => {
        console.log(`Job ${job.id} in queue ${name} completed`);
      });

      queue.on('failed', (job, err) => {
        console.error(`Job ${job.id} in queue ${name} failed:`, err);
      });

      queue.on('stalled', (job) => {
        console.warn(`Job ${job.id} in queue ${name} stalled`);
      });

      this.queues.set(name as QueueName, queue);
    });
  }

  getQueue(name: QueueName): Bull.Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue ${name} not found`);
    }
    return queue;
  }

  async addJob<T>(
    queueName: QueueName,
    data: T,
    options?: Bull.JobOptions
  ): Promise<Bull.Job<T>> {
    const queue = this.getQueue(queueName);
    return queue.add(data, options);
  }

  async processQueue<T>(
    queueName: QueueName,
    processor: (job: Bull.Job<T>) => Promise<void>,
    concurrency = 1
  ) {
    const queue = this.getQueue(queueName);
    queue.process(concurrency, processor);
  }

  async getJobCounts(queueName: QueueName): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const queue = this.getQueue(queueName);
    return queue.getJobCounts();
  }

  async getJob(queueName: QueueName, jobId: string): Promise<Bull.Job | null> {
    const queue = this.getQueue(queueName);
    return queue.getJob(jobId);
  }

  async getJobs(
    queueName: QueueName,
    types: Bull.JobStatus[] = ['waiting', 'active', 'completed', 'failed', 'delayed'],
    start = 0,
    end = 20
  ): Promise<Bull.Job[]> {
    const queue = this.getQueue(queueName);
    return queue.getJobs(types, start, end);
  }

  async cleanQueue(queueName: QueueName, grace = 0) {
    const queue = this.getQueue(queueName);
    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
  }

  async pauseQueue(queueName: QueueName): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
  }

  async resumeQueue(queueName: QueueName): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
  }

  async emptyQueue(queueName: QueueName): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.empty();
  }

  async closeQueues(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
  }

  async getQueueHealth(): Promise<Record<string, any>> {
    const health: Record<string, any> = {};
    
    for (const [name, queue] of this.queues.entries()) {
      const counts = await queue.getJobCounts();
      const isPaused = await queue.isPaused();
      
      health[name] = {
        ...counts,
        isPaused,
        isHealthy: counts.failed < 100 && counts.waiting < 1000,
      };
    }
    
    return health;
  }
}

export const queueManager = QueueManager.getInstance();