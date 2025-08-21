/**
 * Prisma Query Result Cache
 * Implements query-level caching for Prisma ORM
 */

import { Prisma } from '@prisma/client';
import { getRedis } from '../redis';
import { createHash } from 'crypto';
import performanceMonitor from '../monitoring/performance-monitor';

export interface CacheConfig {
  enabled: boolean;
  defaultTTL: number;
  maxKeys: number;
  keyPrefix: string;
}

export interface QueryCacheOptions {
  ttl?: number;
  key?: string;
  tags?: string[];
  skip?: boolean;
}

interface CachedQuery {
  result: any;
  timestamp: number;
  hits: number;
  model: string;
  action: string;
}

class PrismaQueryCache {
  private redis: ReturnType<typeof getRedis>;
  private config: CacheConfig;
  private hitCount: number = 0;
  private missCount: number = 0;
  private cachePatterns: Map<string, QueryCacheOptions>;

  constructor(config?: Partial<CacheConfig>) {
    this.redis = getRedis();
    this.config = {
      enabled: process.env.ENABLE_QUERY_CACHE !== 'false',
      defaultTTL: 300, // 5 minutes
      maxKeys: 10000,
      keyPrefix: 'prisma:query:',
      ...config,
    };
    
    // Define cache patterns for common queries
    this.cachePatterns = new Map([
      // Cache user queries for 10 minutes
      ['User.findUnique', { ttl: 600 }],
      ['User.findMany', { ttl: 300 }],
      
      // Cache league data for 5 minutes
      ['League.findUnique', { ttl: 300 }],
      ['League.findMany', { ttl: 300 }],
      
      // Cache competition leaderboards for 1 minute
      ['Leaderboard.findUnique', { ttl: 60 }],
      ['Leaderboard.findMany', { ttl: 60 }],
      
      // Cache static data for longer
      ['LeagueSettings.findUnique', { ttl: 1800 }], // 30 minutes
      ['SystemConfig.findMany', { ttl: 3600 }], // 1 hour
      
      // Don't cache write operations
      ['*.create', { skip: true }],
      ['*.update', { skip: true }],
      ['*.delete', { skip: true }],
      ['*.upsert', { skip: true }],
    ]);
  }

  /**
   * Create Prisma middleware for caching
   */
  middleware(): Prisma.Middleware {
    return async (params, next) => {
      if (!this.config.enabled) {
        return next(params);
      }

      const cacheOptions = this.getCacheOptions(params);
      
      // Skip caching if configured
      if (cacheOptions.skip || this.shouldSkipCache(params)) {
        return next(params);
      }

      const cacheKey = this.generateCacheKey(params, cacheOptions);
      
      // Try to get from cache
      const cached = await this.get(cacheKey);
      if (cached && this.isValidCache(cached)) {
        this.hitCount++;
        this.updateStats('hit', params);
        
        // Update hit count in cache
        cached.hits++;
        await this.set(cacheKey, cached, cacheOptions.ttl);
        
        return cached.result;
      }

      // Cache miss - execute query
      this.missCount++;
      this.updateStats('miss', params);
      
      const startTime = Date.now();
      const result = await next(params);
      const duration = Date.now() - startTime;

      // Cache the result if query was successful
      if (result !== null && result !== undefined) {
        const cacheData: CachedQuery = {
          result,
          timestamp: Date.now(),
          hits: 0,
          model: params.model || 'unknown',
          action: params.action,
        };
        
        await this.set(cacheKey, cacheData, cacheOptions.ttl);
        
        // Invalidate related caches if needed
        await this.invalidateRelated(params);
      }

      // Record query performance
      performanceMonitor.recordDatabasePerformance(
        `${params.model}.${params.action}`,
        params.action as any,
        duration,
        Array.isArray(result) ? result.length : 1
      );

      return result;
    };
  }

  /**
   * Get cache options for a query
   */
  private getCacheOptions(params: Prisma.MiddlewareParams): QueryCacheOptions {
    const key = `${params.model}.${params.action}`;
    
    // Check specific pattern
    if (this.cachePatterns.has(key)) {
      return this.cachePatterns.get(key)!;
    }
    
    // Check wildcard patterns
    const wildcardKey = `*.${params.action}`;
    if (this.cachePatterns.has(wildcardKey)) {
      return this.cachePatterns.get(wildcardKey)!;
    }
    
    // Default options
    return {
      ttl: this.config.defaultTTL,
    };
  }

  /**
   * Determine if query should skip cache
   */
  private shouldSkipCache(params: Prisma.MiddlewareParams): boolean {
    // Skip transactions
    if (params.runInTransaction) {
      return true;
    }
    
    // Skip write operations
    const writeActions = ['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany'];
    if (writeActions.includes(params.action)) {
      return true;
    }
    
    // Skip raw queries
    if (params.action === 'executeRaw' || params.action === 'queryRaw') {
      return true;
    }
    
    // Skip if args contain special operators that shouldn't be cached
    if (params.args) {
      const argsStr = JSON.stringify(params.args);
      if (argsStr.includes('$transaction') || argsStr.includes('cursor')) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Generate cache key for query
   */
  private generateCacheKey(
    params: Prisma.MiddlewareParams,
    options: QueryCacheOptions
  ): string {
    if (options.key) {
      return `${this.config.keyPrefix}${options.key}`;
    }
    
    const hash = createHash('md5');
    hash.update(params.model || 'unknown');
    hash.update(params.action);
    
    if (params.args) {
      // Sort args to ensure consistent keys
      const sortedArgs = this.sortObject(params.args);
      hash.update(JSON.stringify(sortedArgs));
    }
    
    return `${this.config.keyPrefix}${hash.digest('hex')}`;
  }

  /**
   * Sort object keys recursively for consistent hashing
   */
  private sortObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }
    
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj)
        .sort()
        .reduce((sorted: any, key) => {
          sorted[key] = this.sortObject(obj[key]);
          return sorted;
        }, {});
    }
    
    return obj;
  }

  /**
   * Get cached query result
   */
  private async get(key: string): Promise<CachedQuery | null> {
    try {
      const cached = await this.redis.get(key);
      if (!cached) return null;
      
      return JSON.parse(cached);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached query result
   */
  private async set(key: string, data: CachedQuery, ttl?: number): Promise<void> {
    try {
      const finalTTL = ttl || this.config.defaultTTL;
      await this.redis.setex(key, finalTTL, JSON.stringify(data));
      
      // Track cache size
      const keyCount = await this.redis.dbsize();
      if (keyCount > this.config.maxKeys) {
        await this.evictOldest();
      }
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Check if cached data is still valid
   */
  private isValidCache(cached: CachedQuery): boolean {
    // Add any additional validation logic here
    return cached && cached.result !== undefined;
  }

  /**
   * Invalidate related caches after write operations
   */
  private async invalidateRelated(params: Prisma.MiddlewareParams): Promise<void> {
    if (!params.model) return;
    
    const writeActions = ['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany'];
    if (!writeActions.includes(params.action)) {
      return;
    }
    
    // Invalidate all caches for this model
    const pattern = `${this.config.keyPrefix}*${params.model}*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
      console.log(`Invalidated ${keys.length} cache entries for ${params.model}`);
    }
  }

  /**
   * Evict oldest cache entries when max keys reached
   */
  private async evictOldest(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
      
      // Get all cache entries with their timestamps
      const entries: Array<{ key: string; timestamp: number }> = [];
      
      for (const key of keys.slice(0, 100)) { // Sample first 100
        const data = await this.redis.get(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            entries.push({ key, timestamp: parsed.timestamp || 0 });
          } catch {
            // Invalid entry, delete it
            await this.redis.del(key);
          }
        }
      }
      
      // Sort by timestamp and delete oldest 10%
      entries.sort((a, b) => a.timestamp - b.timestamp);
      const toDelete = entries.slice(0, Math.ceil(entries.length * 0.1));
      
      if (toDelete.length > 0) {
        await this.redis.del(...toDelete.map(e => e.key));
        console.log(`Evicted ${toDelete.length} old cache entries`);
      }
    } catch (error) {
      console.error('Cache eviction error:', error);
    }
  }

  /**
   * Update cache statistics
   */
  private updateStats(type: 'hit' | 'miss', params: Prisma.MiddlewareParams) {
    const metricName = type === 'hit' ? 'db.cache.hit' : 'db.cache.miss';
    
    performanceMonitor.recordMetric({
      name: metricName,
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: {
        model: params.model || 'unknown',
        action: params.action,
      },
    });
    
    // Log cache hit rate periodically
    const total = this.hitCount + this.missCount;
    if (total > 0 && total % 100 === 0) {
      const hitRate = (this.hitCount / total) * 100;
      console.log(`Query cache hit rate: ${hitRate.toFixed(1)}% (${this.hitCount}/${total})`);
      
      performanceMonitor.recordMetric({
        name: 'db.cache.hitrate',
        value: hitRate,
        unit: 'percent',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Clear all query caches
   */
  async clearAll(): Promise<void> {
    const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      console.log(`Cleared ${keys.length} query cache entries`);
    }
    
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Clear caches for specific model
   */
  async clearModel(model: string): Promise<void> {
    const pattern = `${this.config.keyPrefix}*${model}*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
      console.log(`Cleared ${keys.length} cache entries for model ${model}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hitCount + this.missCount;
    return {
      hits: this.hitCount,
      misses: this.missCount,
      total,
      hitRate: total > 0 ? (this.hitCount / total) * 100 : 0,
    };
  }

  /**
   * Warm up cache with common queries
   */
  async warmUp(queries: Array<{ model: string; action: string; args?: any }>): Promise<void> {
    console.log(`Warming up query cache with ${queries.length} queries...`);
    
    for (const query of queries) {
      const cacheKey = this.generateCacheKey(
        { model: query.model, action: query.action, args: query.args } as any,
        {}
      );
      
      // Check if already cached
      const existing = await this.get(cacheKey);
      if (!existing) {
        console.log(`Cache warm-up needed for ${query.model}.${query.action}`);
      }
    }
  }
}

// Singleton instance
export const queryCache = new PrismaQueryCache();

// Export middleware function
export const queryCacheMiddleware = queryCache.middleware();

// Export cache management functions
export const clearQueryCache = () => queryCache.clearAll();
export const clearModelCache = (model: string) => queryCache.clearModel(model);
export const getQueryCacheStats = () => queryCache.getStats();

export default queryCache;