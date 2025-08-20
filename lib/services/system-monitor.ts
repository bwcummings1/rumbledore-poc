import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import os from 'os';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);

export class SystemMonitor {
  private metricsInterval: NodeJS.Timeout | null = null;
  private static instance: SystemMonitor;

  static getInstance(): SystemMonitor {
    if (!SystemMonitor.instance) {
      SystemMonitor.instance = new SystemMonitor();
    }
    return SystemMonitor.instance;
  }

  startMonitoring(intervalMs: number = 60000) {
    if (this.metricsInterval) {
      return; // Already monitoring
    }

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    // Collect initial metrics
    this.collectMetrics();
  }

  stopMonitoring() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  private async collectMetrics() {
    const timestamp = new Date();

    try {
      // System metrics
      const cpuUsage = process.cpuUsage();
      const memoryUsage = process.memoryUsage();
      const loadAverage = os.loadavg();

      // Database metrics
      const dbMetrics = await this.getDatabaseMetrics();

      // Redis metrics
      const redisMetrics = await this.getRedisMetrics();

      // Application metrics
      const appMetrics = await this.getApplicationMetrics();

      // Store metrics
      await this.storeMetrics({
        timestamp,
        cpu: {
          usage: cpuUsage,
          loadAverage,
        },
        memory: {
          rss: memoryUsage.rss,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
        },
        database: dbMetrics,
        redis: redisMetrics,
        application: appMetrics,
      });

      // Check for alerts
      await this.checkAlerts({
        cpuUsage: loadAverage[0],
        memoryUsage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        dbConnections: dbMetrics.activeConnections,
      });
    } catch (error) {
      console.error('Error collecting metrics:', error);
    }
  }

  private async getDatabaseMetrics() {
    const startTime = performance.now();

    try {
      // Get database statistics
      const [dbStats]: any = await prisma.$queryRaw`
        SELECT 
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
          (SELECT count(*) FROM users) as total_users,
          (SELECT count(*) FROM leagues) as total_leagues,
          (SELECT count(*) FROM league_matchups) as total_matchups,
          pg_database_size(current_database()) as database_size
      `;

      const queryTime = performance.now() - startTime;

      return {
        responseTime: queryTime,
        activeConnections: Number(dbStats?.active_connections || 0),
        totalUsers: Number(dbStats?.total_users || 0),
        totalLeagues: Number(dbStats?.total_leagues || 0),
        totalMatchups: Number(dbStats?.total_matchups || 0),
        databaseSize: Number(dbStats?.database_size || 0),
      };
    } catch (error) {
      console.error('Error getting database metrics:', error);
      return {
        responseTime: 0,
        activeConnections: 0,
        totalUsers: 0,
        totalLeagues: 0,
        totalMatchups: 0,
        databaseSize: 0,
      };
    }
  }

  private async getRedisMetrics() {
    try {
      const info = await redis.info();
      const lines = info.split('\r\n');
      const metrics: any = {};

      lines.forEach((line) => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          metrics[key] = value;
        }
      });

      return {
        connectedClients: parseInt(metrics.connected_clients || '0'),
        usedMemory: parseInt(metrics.used_memory || '0'),
        totalCommandsProcessed: parseInt(metrics.total_commands_processed || '0'),
        instantaneousOpsPerSec: parseInt(metrics.instantaneous_ops_per_sec || '0'),
      };
    } catch (error) {
      console.error('Error getting Redis metrics:', error);
      return {
        connectedClients: 0,
        usedMemory: 0,
        totalCommandsProcessed: 0,
        instantaneousOpsPerSec: 0,
      };
    }
  }

  private async getApplicationMetrics() {
    try {
      // Get recent sync status
      const recentSyncs = await prisma.syncStatus.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 3600000), // Last hour
          },
        },
      });

      const successRate = recentSyncs.length > 0
        ? (recentSyncs.filter(s => s.status === 'COMPLETED').length / recentSyncs.length) * 100
        : 100;

      // Get recent errors
      const recentErrors = await prisma.auditLog.findMany({
        where: {
          action: 'ERROR',
          createdAt: {
            gte: new Date(Date.now() - 3600000),
          },
        },
      });

      return {
        syncSuccessRate: successRate,
        recentErrorCount: recentErrors.length,
        activeSyncs: recentSyncs.filter(s => s.status === 'IN_PROGRESS').length,
      };
    } catch (error) {
      console.error('Error getting application metrics:', error);
      return {
        syncSuccessRate: 100,
        recentErrorCount: 0,
        activeSyncs: 0,
      };
    }
  }

  private async storeMetrics(metrics: any) {
    try {
      const metricEntries = [
        {
          metricType: 'SYSTEM',
          metricName: 'cpu_load_average',
          value: metrics.cpu.loadAverage[0],
          unit: 'load',
        },
        {
          metricType: 'SYSTEM',
          metricName: 'memory_usage',
          value: metrics.memory.heapUsed,
          unit: 'bytes',
        },
        {
          metricType: 'DATABASE',
          metricName: 'active_connections',
          value: metrics.database.activeConnections,
          unit: 'count',
        },
        {
          metricType: 'DATABASE',
          metricName: 'response_time',
          value: metrics.database.responseTime,
          unit: 'ms',
        },
        {
          metricType: 'REDIS',
          metricName: 'connected_clients',
          value: metrics.redis.connectedClients,
          unit: 'count',
        },
        {
          metricType: 'APPLICATION',
          metricName: 'sync_success_rate',
          value: metrics.application.syncSuccessRate,
          unit: 'percentage',
        },
      ];

      await prisma.systemMetric.createMany({
        data: metricEntries,
      });

      // Store in Redis for quick access
      await redis.setex(
        'metrics:current',
        300,
        JSON.stringify(metrics)
      );
    } catch (error) {
      console.error('Error storing metrics:', error);
    }
  }

  private async checkAlerts(metrics: any) {
    const alerts = [];

    // CPU alert
    if (metrics.cpuUsage > 80) {
      alerts.push({
        type: 'HIGH_CPU_USAGE',
        severity: 'WARNING',
        message: `CPU usage at ${metrics.cpuUsage.toFixed(1)}%`,
      });
    }

    // Memory alert
    if (metrics.memoryUsage > 90) {
      alerts.push({
        type: 'HIGH_MEMORY_USAGE',
        severity: 'CRITICAL',
        message: `Memory usage at ${metrics.memoryUsage.toFixed(1)}%`,
      });
    }

    // Database connection alert
    if (metrics.dbConnections > 90) {
      alerts.push({
        type: 'HIGH_DB_CONNECTIONS',
        severity: 'WARNING',
        message: `Database connections at ${metrics.dbConnections}`,
      });
    }

    if (alerts.length > 0) {
      // Store alerts and potentially notify administrators
      for (const alert of alerts) {
        try {
          await prisma.auditLog.create({
            data: {
              action: 'SYSTEM_ALERT',
              entityType: 'SYSTEM',
              metadata: alert,
            },
          });
        } catch (error) {
          console.error('Error storing alert:', error);
        }
      }

      // Could send notifications here (email, Slack, etc.)
    }
  }

  async getHealthScore(): Promise<{ score: number; status: string; details: any }> {
    try {
      const metrics = await redis.get('metrics:current');
      if (!metrics) {
        return { score: 0, status: 'No data', details: {} };
      }

      const current = JSON.parse(metrics);
      let score = 100;
      const issues = [];

      // Check CPU
      if (current.cpu.loadAverage[0] > 4) {
        score -= 20;
        issues.push('High CPU usage');
      } else if (current.cpu.loadAverage[0] > 2) {
        score -= 10;
        issues.push('Moderate CPU usage');
      }

      // Check memory
      const memoryUsage = (current.memory.heapUsed / current.memory.heapTotal) * 100;
      if (memoryUsage > 90) {
        score -= 30;
        issues.push('Critical memory usage');
      } else if (memoryUsage > 70) {
        score -= 15;
        issues.push('High memory usage');
      }

      // Check database
      if (current.database.responseTime > 1000) {
        score -= 20;
        issues.push('Slow database response');
      } else if (current.database.responseTime > 500) {
        score -= 10;
        issues.push('Database response degraded');
      }

      // Check application
      if (current.application.syncSuccessRate < 50) {
        score -= 25;
        issues.push('Low sync success rate');
      } else if (current.application.syncSuccessRate < 80) {
        score -= 10;
        issues.push('Sync issues detected');
      }

      let status = 'Healthy';
      if (score < 50) status = 'Critical';
      else if (score < 70) status = 'Degraded';
      else if (score < 90) status = 'Warning';

      return {
        score: Math.max(0, score),
        status,
        details: {
          issues,
          metrics: current,
        },
      };
    } catch (error) {
      console.error('Error calculating health score:', error);
      return { score: 0, status: 'Error', details: {} };
    }
  }

  async getMetricsSummary() {
    try {
      const [current, recentMetrics] = await Promise.all([
        redis.get('metrics:current'),
        prisma.systemMetric.findMany({
          where: {
            recordedAt: {
              gte: new Date(Date.now() - 86400000), // Last 24 hours
            },
          },
          orderBy: {
            recordedAt: 'desc',
          },
          take: 100,
        }),
      ]);

      const users = await prisma.user.count();
      const leagues = await prisma.league.count();
      const activeLeagues = await prisma.league.count({
        where: { isActive: true },
      });

      const newUsersThisWeek = await prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      });

      // Calculate data points (simplified)
      const dataPoints = await prisma.$queryRaw`
        SELECT 
          (SELECT COUNT(*) FROM league_players) +
          (SELECT COUNT(*) FROM league_matchups) +
          (SELECT COUNT(*) FROM league_player_stats) as total
      `;

      return {
        totalUsers: users,
        totalLeagues: leagues,
        activeLeagues,
        newUsersThisWeek,
        totalDataPoints: Number((dataPoints as any)[0]?.total || 0),
        current: current ? JSON.parse(current) : null,
        recent: recentMetrics,
      };
    } catch (error) {
      console.error('Error getting metrics summary:', error);
      return {
        totalUsers: 0,
        totalLeagues: 0,
        activeLeagues: 0,
        newUsersThisWeek: 0,
        totalDataPoints: 0,
        current: null,
        recent: [],
      };
    }
  }
}

// Initialize monitor singleton
export const systemMonitor = SystemMonitor.getInstance();