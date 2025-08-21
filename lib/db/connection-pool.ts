/**
 * Database Connection Pool Optimization
 * Manages and optimizes Prisma connection pooling
 */

import { PrismaClient } from '@prisma/client';
import performanceMonitor from '../monitoring/performance-monitor';

export interface PoolConfig {
  connectionLimit?: number;
  pool?: {
    min: number;
    max: number;
    idleTimeoutMillis: number;
    acquireTimeoutMillis: number;
    createTimeoutMillis: number;
  };
}

export interface PoolMetrics {
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  totalConnections: number;
  poolUtilization: number;
}

class ConnectionPoolManager {
  private static instance: ConnectionPoolManager;
  private prisma: PrismaClient | null = null;
  private config: PoolConfig;
  private metrics: PoolMetrics;
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.config = this.getOptimalConfig();
    this.metrics = {
      activeConnections: 0,
      idleConnections: 0,
      waitingClients: 0,
      totalConnections: 0,
      poolUtilization: 0,
    };
  }

  static getInstance(): ConnectionPoolManager {
    if (!ConnectionPoolManager.instance) {
      ConnectionPoolManager.instance = new ConnectionPoolManager();
    }
    return ConnectionPoolManager.instance;
  }

  /**
   * Get optimal pool configuration based on environment
   */
  private getOptimalConfig(): PoolConfig {
    const isProduction = process.env.NODE_ENV === 'production';
    const cpuCount = require('os').cpus().length;
    
    // Calculate optimal pool size based on CPU cores
    // Formula: connections = (cpu_count * 2) + effective_spindle_count
    const optimalPoolSize = cpuCount * 2 + 1;
    
    return {
      connectionLimit: isProduction ? optimalPoolSize * 2 : optimalPoolSize,
      pool: {
        min: isProduction ? 2 : 1,
        max: isProduction ? optimalPoolSize * 2 : optimalPoolSize,
        idleTimeoutMillis: 30000, // 30 seconds
        acquireTimeoutMillis: 10000, // 10 seconds
        createTimeoutMillis: 5000, // 5 seconds
      },
    };
  }

  /**
   * Get or create optimized Prisma client
   */
  getPrismaClient(): PrismaClient {
    if (!this.prisma) {
      const databaseUrl = this.buildConnectionUrl();
      
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
        log: process.env.NODE_ENV === 'development' 
          ? ['query', 'error', 'warn'] 
          : ['error'],
      });

      // Add middleware for query performance tracking
      this.addPerformanceMiddleware();
      
      // Start monitoring
      this.startMonitoring();
      
      // Handle shutdown gracefully
      this.setupShutdownHandlers();
    }
    
    return this.prisma;
  }

  /**
   * Build optimized connection URL with pool settings
   */
  private buildConnectionUrl(): string {
    const baseUrl = process.env.DATABASE_URL || '';
    const url = new URL(baseUrl);
    
    // Add connection pool parameters
    const poolConfig = this.config.pool!;
    url.searchParams.set('connection_limit', this.config.connectionLimit?.toString() || '10');
    url.searchParams.set('pool_timeout', (poolConfig.acquireTimeoutMillis / 1000).toString());
    url.searchParams.set('connect_timeout', (poolConfig.createTimeoutMillis / 1000).toString());
    url.searchParams.set('statement_cache_size', '200');
    url.searchParams.set('pgbouncer', 'true');
    
    // Enable prepared statements for better performance
    url.searchParams.set('prepared_statements', 'true');
    
    return url.toString();
  }

  /**
   * Add performance tracking middleware
   */
  private addPerformanceMiddleware() {
    if (!this.prisma) return;
    
    this.prisma.$use(async (params, next) => {
      const startTime = Date.now();
      
      try {
        const result = await next(params);
        const duration = Date.now() - startTime;
        
        // Track slow queries
        if (duration > 100) {
          console.warn(`Slow query detected: ${params.model}.${params.action} took ${duration}ms`);
        }
        
        // Record metrics
        performanceMonitor.recordDatabasePerformance(
          `${params.model}.${params.action}`,
          params.action as any,
          duration,
          Array.isArray(result) ? result.length : 1
        );
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        performanceMonitor.recordDatabasePerformance(
          `${params.model}.${params.action}`,
          params.action as any,
          duration,
          0
        );
        
        throw error;
      }
    });
  }

  /**
   * Start connection pool monitoring
   */
  private startMonitoring() {
    // Monitor pool metrics every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.reportMetrics();
      this.autoScale();
    }, 30000);
  }

  /**
   * Collect current pool metrics
   */
  private async collectMetrics() {
    if (!this.prisma) return;
    
    try {
      // Query pg_stat_activity for connection info
      const connections = await this.prisma.$queryRaw<any[]>`
        SELECT 
          state,
          COUNT(*) as count
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY state
      `;
      
      let active = 0;
      let idle = 0;
      
      connections.forEach(conn => {
        if (conn.state === 'active') {
          active = parseInt(conn.count);
        } else if (conn.state === 'idle') {
          idle = parseInt(conn.count);
        }
      });
      
      this.metrics.activeConnections = active;
      this.metrics.idleConnections = idle;
      this.metrics.totalConnections = active + idle;
      this.metrics.poolUtilization = 
        this.metrics.totalConnections > 0 
          ? (active / this.metrics.totalConnections) * 100 
          : 0;
          
    } catch (error) {
      console.error('Failed to collect pool metrics:', error);
    }
  }

  /**
   * Report metrics to performance monitor
   */
  private reportMetrics() {
    performanceMonitor.recordMetric({
      name: 'db.pool.active',
      value: this.metrics.activeConnections,
      unit: 'count',
      timestamp: Date.now(),
    });
    
    performanceMonitor.recordMetric({
      name: 'db.pool.idle',
      value: this.metrics.idleConnections,
      unit: 'count',
      timestamp: Date.now(),
    });
    
    performanceMonitor.recordMetric({
      name: 'db.pool.utilization',
      value: this.metrics.poolUtilization,
      unit: 'percent',
      timestamp: Date.now(),
    });
    
    // Log if pool is under stress
    if (this.metrics.poolUtilization > 80) {
      console.warn(`Database pool under stress: ${this.metrics.poolUtilization.toFixed(1)}% utilization`);
    }
  }

  /**
   * Auto-scale pool based on usage
   */
  private autoScale() {
    // This would typically adjust pool size based on metrics
    // For now, just log recommendations
    
    if (this.metrics.poolUtilization > 90 && this.config.pool) {
      console.log('Recommendation: Increase pool size - high utilization detected');
    } else if (this.metrics.poolUtilization < 20 && this.metrics.totalConnections > 5) {
      console.log('Recommendation: Decrease pool size - low utilization detected');
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers() {
    const cleanup = async () => {
      console.log('Closing database connections...');
      
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }
      
      if (this.prisma) {
        await this.prisma.$disconnect();
        this.prisma = null;
      }
      
      console.log('Database connections closed');
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Get current pool metrics
   */
  getMetrics(): PoolMetrics {
    return { ...this.metrics };
  }

  /**
   * Get pool configuration
   */
  getConfig(): PoolConfig {
    return { ...this.config };
  }

  /**
   * Health check for connection pool
   */
  async healthCheck(): Promise<boolean> {
    if (!this.prisma) return false;
    
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Force refresh connections
   */
  async refreshConnections() {
    if (!this.prisma) return;
    
    console.log('Refreshing database connections...');
    await this.prisma.$disconnect();
    await this.prisma.$connect();
    console.log('Database connections refreshed');
  }
}

// Export singleton instance
export const connectionPool = ConnectionPoolManager.getInstance();

// Export optimized Prisma client
export const optimizedPrisma = connectionPool.getPrismaClient();

// Export helper function for health checks
export async function checkDatabaseHealth(): Promise<boolean> {
  return connectionPool.healthCheck();
}

// Export metrics function
export function getPoolMetrics(): PoolMetrics {
  return connectionPool.getMetrics();
}

export default connectionPool;