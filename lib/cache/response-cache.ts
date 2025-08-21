/**
 * API Response Cache
 * Caches API responses in Redis for improved performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '../redis';
import { createHash } from 'crypto';
import performanceMonitor from '../monitoring/performance-monitor';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  vary?: string[]; // Headers to vary cache on
  skipCache?: boolean; // Skip caching for this request
  cacheControl?: string; // Cache-Control header value
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  avgResponseTime: number;
  cachedResponses: number;
}

class ResponseCache {
  private redis: ReturnType<typeof getRedis>;
  private defaultTTL: number;
  private stats: CacheStats;
  private enabled: boolean;
  
  constructor() {
    this.redis = getRedis();
    this.defaultTTL = 300; // 5 minutes default
    this.enabled = process.env.ENABLE_API_CACHE !== 'false';
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      avgResponseTime: 0,
      cachedResponses: 0,
    };
    
    // Update stats periodically
    if (this.enabled) {
      setInterval(() => this.updateStats(), 60000); // Every minute
    }
  }

  /**
   * Middleware to cache API responses
   */
  middleware(options: CacheOptions = {}) {
    return async (
      handler: (req: NextRequest) => Promise<NextResponse>
    ) => {
      return async (req: NextRequest): Promise<NextResponse> => {
        // Skip caching if disabled or for non-GET requests
        if (!this.enabled || req.method !== 'GET' || options.skipCache) {
          return handler(req);
        }
        
        const startTime = Date.now();
        const cacheKey = this.generateCacheKey(req, options.vary);
        
        // Try to get from cache
        const cached = await this.get(cacheKey);
        
        if (cached) {
          this.stats.hits++;
          const duration = Date.now() - startTime;
          
          // Reconstruct response from cached data
          const response = new NextResponse(
            cached.body,
            {
              status: cached.status,
              statusText: cached.statusText,
              headers: new Headers(cached.headers),
            }
          );
          
          // Add cache headers
          response.headers.set('X-Cache', 'HIT');
          response.headers.set('X-Cache-Key', cacheKey);
          response.headers.set('X-Response-Time', `${duration}ms`);
          response.headers.set('Age', this.calculateAge(cached.timestamp).toString());
          
          // Set Cache-Control if specified
          if (options.cacheControl) {
            response.headers.set('Cache-Control', options.cacheControl);
          }
          
          // Track performance
          performanceMonitor.recordApiPerformance(
            req.nextUrl.pathname,
            req.method,
            cached.status,
            duration
          );
          
          return response;
        }
        
        // Cache miss - execute handler
        this.stats.misses++;
        const response = await handler(req);
        const duration = Date.now() - startTime;
        
        // Cache the response
        if (this.shouldCache(response)) {
          await this.set(
            cacheKey,
            response,
            options.ttl || this.defaultTTL,
            options.tags
          );
        }
        
        // Add cache headers
        response.headers.set('X-Cache', 'MISS');
        response.headers.set('X-Cache-Key', cacheKey);
        response.headers.set('X-Response-Time', `${duration}ms`);
        
        // Set Cache-Control if specified
        if (options.cacheControl) {
          response.headers.set('Cache-Control', options.cacheControl);
        } else {
          // Set default cache control
          response.headers.set(
            'Cache-Control',
            `public, max-age=${options.ttl || this.defaultTTL}, stale-while-revalidate=60`
          );
        }
        
        // Track performance
        performanceMonitor.recordApiPerformance(
          req.nextUrl.pathname,
          req.method,
          response.status,
          duration
        );
        
        return response;
      };
    };
  }

  /**
   * Generate a cache key for the request
   */
  private generateCacheKey(req: NextRequest, vary?: string[]): string {
    const hash = createHash('md5');
    
    // Base key components
    hash.update(req.nextUrl.pathname);
    hash.update(req.nextUrl.search);
    
    // Add vary headers
    if (vary) {
      vary.forEach(header => {
        const value = req.headers.get(header.toLowerCase());
        if (value) {
          hash.update(`${header}:${value}`);
        }
      });
    }
    
    // Add user context if available
    const authorization = req.headers.get('authorization');
    if (authorization) {
      // Extract user ID from JWT or session
      hash.update(`auth:${authorization.substring(0, 20)}`);
    }
    
    return `api:${hash.digest('hex')}`;
  }

  /**
   * Get cached response
   */
  private async get(key: string): Promise<any | null> {
    try {
      const cached = await this.redis.get(key);
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      
      // Check if cache is still valid
      const age = this.calculateAge(data.timestamp);
      if (data.maxAge && age > data.maxAge) {
        await this.redis.del(key);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached response
   */
  private async set(
    key: string,
    response: NextResponse,
    ttl: number,
    tags?: string[]
  ): Promise<void> {
    try {
      // Extract response data
      const body = await response.text();
      
      const cacheData = {
        body,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        timestamp: Date.now(),
        maxAge: ttl * 1000,
      };
      
      // Store in Redis
      await this.redis.setex(key, ttl, JSON.stringify(cacheData));
      
      // Store tags for invalidation
      if (tags && tags.length > 0) {
        for (const tag of tags) {
          await this.redis.sadd(`cache:tag:${tag}`, key);
          await this.redis.expire(`cache:tag:${tag}`, ttl);
        }
      }
      
      // Track in stats
      this.stats.cachedResponses++;
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Determine if response should be cached
   */
  private shouldCache(response: NextResponse): boolean {
    // Don't cache error responses (unless 404)
    if (response.status >= 400 && response.status !== 404) {
      return false;
    }
    
    // Don't cache if explicitly set to no-cache
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl && (
      cacheControl.includes('no-cache') ||
      cacheControl.includes('no-store') ||
      cacheControl.includes('private')
    )) {
      return false;
    }
    
    return true;
  }

  /**
   * Calculate age of cached response in seconds
   */
  private calculateAge(timestamp: number): number {
    return Math.floor((Date.now() - timestamp) / 1000);
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`Invalidated ${keys.length} cache entries matching ${pattern}`);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateTags(tags: string[]): Promise<void> {
    try {
      const keysToDelete: string[] = [];
      
      for (const tag of tags) {
        const keys = await this.redis.smembers(`cache:tag:${tag}`);
        keysToDelete.push(...keys);
        await this.redis.del(`cache:tag:${tag}`);
      }
      
      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
        console.log(`Invalidated ${keysToDelete.length} cache entries for tags: ${tags.join(', ')}`);
      }
    } catch (error) {
      console.error('Cache tag invalidation error:', error);
    }
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await this.redis.keys('api:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`Cleared ${keys.length} cache entries`);
      }
      
      // Reset stats
      this.stats = {
        hits: 0,
        misses: 0,
        hitRate: 0,
        avgResponseTime: 0,
        cachedResponses: 0,
      };
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Update cache statistics
   */
  private updateStats() {
    const total = this.stats.hits + this.stats.misses;
    if (total > 0) {
      this.stats.hitRate = (this.stats.hits / total) * 100;
    }
    
    // Log stats
    console.log(`Cache Stats - Hit Rate: ${this.stats.hitRate.toFixed(1)}%, Hits: ${this.stats.hits}, Misses: ${this.stats.misses}`);
    
    // Report to performance monitor
    performanceMonitor.recordMetric({
      name: 'cache.hitrate',
      value: this.stats.hitRate,
      unit: 'percent',
      timestamp: Date.now(),
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Warm up cache with common queries
   */
  async warmUp(urls: string[]): Promise<void> {
    console.log(`Warming up cache with ${urls.length} URLs...`);
    
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          console.log(`✓ Warmed up: ${url}`);
        }
      } catch (error) {
        console.error(`✗ Failed to warm up ${url}:`, error);
      }
    }
  }
}

// Singleton instance
export const responseCache = new ResponseCache();

// Helper function to create cached API handler
export function withCache<T>(
  handler: (req: NextRequest) => Promise<NextResponse<T>>,
  options: CacheOptions = {}
): (req: NextRequest) => Promise<NextResponse<T>> {
  return responseCache.middleware(options)(handler);
}

// Cache invalidation helpers
export const cacheInvalidation = {
  async invalidateLeague(leagueId: string) {
    await responseCache.invalidatePattern(`api:*league*${leagueId}*`);
    await responseCache.invalidateTags([`league:${leagueId}`]);
  },
  
  async invalidateUser(userId: string) {
    await responseCache.invalidatePattern(`api:*user*${userId}*`);
    await responseCache.invalidateTags([`user:${userId}`]);
  },
  
  async invalidateCompetition(competitionId: string) {
    await responseCache.invalidatePattern(`api:*competition*${competitionId}*`);
    await responseCache.invalidateTags([`competition:${competitionId}`]);
  },
  
  async invalidateBetting() {
    await responseCache.invalidatePattern(`api:*bet*`);
    await responseCache.invalidateTags(['betting']);
  },
  
  async invalidateContent() {
    await responseCache.invalidatePattern(`api:*content*`);
    await responseCache.invalidateTags(['content']);
  },
};

export default responseCache;