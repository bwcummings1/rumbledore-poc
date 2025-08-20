/**
 * AI Response Cache
 * 
 * Caches AI agent responses to reduce API calls and improve performance.
 * Uses Redis with compression for efficient storage.
 */

import { RedisCache } from '@/lib/cache/redis-cache';
import crypto from 'crypto';
import { AgentType } from '@prisma/client';

export interface CacheConfig {
  enabled: boolean;
  ttl: {
    default: number;
    byAgentType: Record<string, number>;
    byResponseType: Record<string, number>;
  };
  maxSize: number; // Maximum size for cached response
  skipPatterns: RegExp[]; // Messages to skip caching
}

export class AIResponseCache {
  private cache: RedisCache;
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.cache = new RedisCache();
    this.config = {
      enabled: true,
      ttl: {
        default: 300, // 5 minutes
        byAgentType: {
          [AgentType.ANALYST]: 600, // 10 minutes for analytical data
          [AgentType.BETTING_ADVISOR]: 300, // 5 minutes for odds
          [AgentType.NARRATOR]: 1800, // 30 minutes for stories
          [AgentType.COMMISSIONER]: 600, // 10 minutes for rulings
          [AgentType.TRASH_TALKER]: 900, // 15 minutes for roasts
          HISTORIAN: 3600, // 1 hour for historical data
          ORACLE: 180, // 3 minutes for predictions
        },
        byResponseType: {
          prediction: 180, // 3 minutes
          analysis: 600, // 10 minutes
          historical: 3600, // 1 hour
          roast: 900, // 15 minutes
          story: 1800, // 30 minutes
        },
      },
      maxSize: 50000, // 50KB max
      skipPatterns: [
        /personal|private|my|me|I/i, // Skip personalized queries
        /what time|current|now|today/i, // Skip time-sensitive
        /secret|password|key/i, // Skip sensitive
        /random|generate|create new/i, // Skip generative
      ],
      ...config,
    };
  }

  /**
   * Generate cache key from message and context
   */
  private generateCacheKey(
    message: string,
    agentType: string,
    leagueSandbox?: string,
    context?: any
  ): string {
    const normalizedMessage = message.toLowerCase().trim();
    const contextHash = context ? this.hashObject(context) : 'no-context';
    const league = leagueSandbox || 'global';
    
    // Create deterministic hash
    const hash = crypto
      .createHash('sha256')
      .update(`${normalizedMessage}-${agentType}-${league}-${contextHash}`)
      .digest('hex')
      .substring(0, 16);

    return `ai:response:${agentType}:${league}:${hash}`;
  }

  /**
   * Check if message should be cached
   */
  private shouldCache(message: string, response: string): boolean {
    if (!this.config.enabled) return false;
    
    // Check message patterns
    for (const pattern of this.config.skipPatterns) {
      if (pattern.test(message)) {
        return false;
      }
    }

    // Check response size
    if (response.length > this.config.maxSize) {
      return false;
    }

    return true;
  }

  /**
   * Get TTL for a specific agent and response type
   */
  private getTTL(agentType: string, responseType?: string): number {
    if (responseType && this.config.ttl.byResponseType[responseType]) {
      return this.config.ttl.byResponseType[responseType];
    }

    if (this.config.ttl.byAgentType[agentType]) {
      return this.config.ttl.byAgentType[agentType];
    }

    return this.config.ttl.default;
  }

  /**
   * Detect response type from content
   */
  private detectResponseType(response: string): string | undefined {
    const patterns = {
      prediction: /predict|forecast|will|probability|odds|chance/i,
      analysis: /analysis|analyze|breakdown|examine|evaluate/i,
      historical: /history|historical|past|previously|record/i,
      roast: /roast|burn|joke|funny|lol|haha/i,
      story: /once upon|story|tale|narrative|chapter/i,
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(response)) {
        return type;
      }
    }

    return undefined;
  }

  /**
   * Get cached response
   */
  async get(
    message: string,
    agentType: string,
    leagueSandbox?: string,
    context?: any
  ): Promise<{
    response: string;
    toolsUsed: string[];
    cached: boolean;
    cacheKey: string;
  } | null> {
    try {
      const cacheKey = this.generateCacheKey(message, agentType, leagueSandbox, context);
      const cached = await this.cache.get<any>('ai-responses', cacheKey);

      if (cached) {
        // Update access stats
        await this.updateCacheStats(cacheKey, 'hit');
        
        return {
          ...cached,
          cached: true,
          cacheKey,
        };
      }

      await this.updateCacheStats(cacheKey, 'miss');
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached response
   */
  async set(
    message: string,
    agentType: string,
    response: string,
    toolsUsed: string[],
    leagueSandbox?: string,
    context?: any
  ): Promise<void> {
    try {
      if (!this.shouldCache(message, response)) {
        return;
      }

      const cacheKey = this.generateCacheKey(message, agentType, leagueSandbox, context);
      const responseType = this.detectResponseType(response);
      const ttl = this.getTTL(agentType, responseType);

      const cacheData = {
        response,
        toolsUsed,
        agentType,
        timestamp: Date.now(),
        responseType,
      };

      await this.cache.set('ai-responses', cacheKey, cacheData, ttl);
      await this.updateCacheStats(cacheKey, 'set');
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Invalidate cache for a league
   */
  async invalidateLeague(leagueSandbox: string): Promise<void> {
    try {
      // This would need to be implemented with Redis SCAN
      // to find and delete all keys for a specific league
      const pattern = `ai:response:*:${leagueSandbox}:*`;
      // TODO: Implement pattern-based deletion
      console.log(`Invalidating cache for league: ${leagueSandbox}`);
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    hits: number;
    misses: number;
    sets: number;
    hitRate: number;
  }> {
    try {
      const stats = await this.cache.get<any>('ai-cache', 'stats') || {
        hits: 0,
        misses: 0,
        sets: 0,
      };

      const hitRate = stats.hits + stats.misses > 0
        ? (stats.hits / (stats.hits + stats.misses)) * 100
        : 0;

      return {
        ...stats,
        hitRate,
      };
    } catch (error) {
      console.error('Get stats error:', error);
      return {
        hits: 0,
        misses: 0,
        sets: 0,
        hitRate: 0,
      };
    }
  }

  /**
   * Update cache statistics
   */
  private async updateCacheStats(key: string, operation: 'hit' | 'miss' | 'set'): Promise<void> {
    try {
      const stats = await this.cache.get<any>('ai-cache', 'stats') || {
        hits: 0,
        misses: 0,
        sets: 0,
      };

      stats[operation === 'hit' ? 'hits' : operation === 'miss' ? 'misses' : 'sets']++;
      
      await this.cache.set('ai-cache', 'stats', stats, 86400); // 24 hours
    } catch (error) {
      console.error('Update stats error:', error);
    }
  }

  /**
   * Hash an object for cache key generation
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 8);
  }

  /**
   * Clear all AI response cache
   */
  async clearAll(): Promise<void> {
    try {
      // This would need Redis FLUSHDB or pattern deletion
      console.log('Clearing all AI response cache');
    } catch (error) {
      console.error('Clear cache error:', error);
    }
  }

  /**
   * Warm up cache with common queries
   */
  async warmUp(commonQueries: Array<{
    message: string;
    agentType: string;
    response: string;
    toolsUsed: string[];
  }>): Promise<void> {
    for (const query of commonQueries) {
      await this.set(
        query.message,
        query.agentType,
        query.response,
        query.toolsUsed
      );
    }
  }
}

// Singleton instance
let cacheInstance: AIResponseCache | null = null;

export function getAIResponseCache(): AIResponseCache {
  if (!cacheInstance) {
    cacheInstance = new AIResponseCache();
  }
  return cacheInstance;
}