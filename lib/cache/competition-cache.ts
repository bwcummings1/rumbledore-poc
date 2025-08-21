/**
 * Competition Caching Strategy
 * 
 * Implements multi-layer caching for competition data:
 * - Leaderboard caching with TTL
 * - Competition metadata caching
 * - Achievement progress caching
 * - User entry caching
 * - Cache invalidation strategies
 */

import Redis from 'ioredis';
import { LeaderboardStandings, Competition, Achievement } from '@/types/betting';
import { logger } from '@/lib/logger';
import { compress, decompress } from '@/lib/utils/compression';

export class CompetitionCacheManager {
  private redis: Redis;
  private defaultTTL = 300; // 5 minutes
  private leaderboardTTL = 60; // 1 minute for active competitions
  private metadataTTL = 600; // 10 minutes
  private achievementTTL = 300; // 5 minutes

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    this.redis.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected for competition cache');
    });
  }

  /**
   * Cache keys generation
   */
  private keys = {
    leaderboard: (competitionId: string) => `competition:leaderboard:${competitionId}`,
    leaderboardVersion: (competitionId: string) => `competition:leaderboard:version:${competitionId}`,
    competition: (competitionId: string) => `competition:meta:${competitionId}`,
    userEntries: (userId: string) => `competition:user:entries:${userId}`,
    userAchievements: (userId: string, leagueId?: string) => 
      leagueId ? `competition:achievements:${userId}:${leagueId}` : `competition:achievements:${userId}`,
    achievementProgress: (userId: string, achievementId: string) => 
      `competition:achievement:progress:${userId}:${achievementId}`,
    competitionList: (leagueId?: string) => 
      leagueId ? `competition:list:${leagueId}` : 'competition:list:global',
    competitionStats: (competitionId: string) => `competition:stats:${competitionId}`,
    lockKey: (key: string) => `lock:${key}`,
  };

  /**
   * Leaderboard caching
   */
  async cacheLeaderboard(
    competitionId: string,
    standings: LeaderboardStandings,
    isActive = true
  ): Promise<void> {
    try {
      const key = this.keys.leaderboard(competitionId);
      const ttl = isActive ? this.leaderboardTTL : this.defaultTTL;
      
      // Compress large leaderboards
      const data = standings.standings.length > 100
        ? await compress(JSON.stringify(standings))
        : JSON.stringify(standings);
      
      await this.redis.setex(key, ttl, data);
      
      // Cache version separately for quick checks
      await this.redis.setex(
        this.keys.leaderboardVersion(competitionId),
        ttl,
        standings.version.toString()
      );
      
      logger.debug('Cached leaderboard', {
        competitionId,
        entryCount: standings.standings.length,
        ttl,
        compressed: standings.standings.length > 100,
      });
    } catch (error: any) {
      logger.error('Failed to cache leaderboard', {
        competitionId,
        error: error.message,
      });
    }
  }

  async getLeaderboard(competitionId: string): Promise<LeaderboardStandings | null> {
    try {
      const key = this.keys.leaderboard(competitionId);
      const data = await this.redis.get(key);
      
      if (!data) return null;
      
      // Check if data is compressed
      try {
        // Try to parse as JSON first
        return JSON.parse(data);
      } catch {
        // If JSON parse fails, assume it's compressed
        const decompressed = await decompress(data);
        return JSON.parse(decompressed);
      }
    } catch (error: any) {
      logger.error('Failed to get cached leaderboard', {
        competitionId,
        error: error.message,
      });
      return null;
    }
  }

  async getLeaderboardVersion(competitionId: string): Promise<number | null> {
    try {
      const version = await this.redis.get(this.keys.leaderboardVersion(competitionId));
      return version ? parseInt(version, 10) : null;
    } catch (error: any) {
      logger.error('Failed to get leaderboard version', {
        competitionId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Competition metadata caching
   */
  async cacheCompetition(competition: Competition): Promise<void> {
    try {
      const key = this.keys.competition(competition.id);
      await this.redis.setex(
        key,
        this.metadataTTL,
        JSON.stringify(competition)
      );
    } catch (error: any) {
      logger.error('Failed to cache competition', {
        competitionId: competition.id,
        error: error.message,
      });
    }
  }

  async getCompetition(competitionId: string): Promise<Competition | null> {
    try {
      const key = this.keys.competition(competitionId);
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error: any) {
      logger.error('Failed to get cached competition', {
        competitionId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * User entries caching
   */
  async cacheUserEntries(userId: string, competitionIds: string[]): Promise<void> {
    try {
      const key = this.keys.userEntries(userId);
      await this.redis.setex(
        key,
        this.defaultTTL,
        JSON.stringify(competitionIds)
      );
    } catch (error: any) {
      logger.error('Failed to cache user entries', {
        userId,
        error: error.message,
      });
    }
  }

  async getUserEntries(userId: string): Promise<string[] | null> {
    try {
      const key = this.keys.userEntries(userId);
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error: any) {
      logger.error('Failed to get cached user entries', {
        userId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Achievement caching
   */
  async cacheUserAchievements(
    userId: string,
    achievements: Achievement[],
    leagueId?: string
  ): Promise<void> {
    try {
      const key = this.keys.userAchievements(userId, leagueId);
      await this.redis.setex(
        key,
        this.achievementTTL,
        JSON.stringify(achievements)
      );
    } catch (error: any) {
      logger.error('Failed to cache user achievements', {
        userId,
        leagueId,
        error: error.message,
      });
    }
  }

  async getUserAchievements(
    userId: string,
    leagueId?: string
  ): Promise<Achievement[] | null> {
    try {
      const key = this.keys.userAchievements(userId, leagueId);
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error: any) {
      logger.error('Failed to get cached user achievements', {
        userId,
        leagueId,
        error: error.message,
      });
      return null;
    }
  }

  async cacheAchievementProgress(
    userId: string,
    achievementId: string,
    progress: number
  ): Promise<void> {
    try {
      const key = this.keys.achievementProgress(userId, achievementId);
      await this.redis.setex(key, this.achievementTTL, progress.toString());
    } catch (error: any) {
      logger.error('Failed to cache achievement progress', {
        userId,
        achievementId,
        error: error.message,
      });
    }
  }

  async getAchievementProgress(
    userId: string,
    achievementId: string
  ): Promise<number | null> {
    try {
      const key = this.keys.achievementProgress(userId, achievementId);
      const data = await this.redis.get(key);
      return data ? parseInt(data, 10) : null;
    } catch (error: any) {
      logger.error('Failed to get cached achievement progress', {
        userId,
        achievementId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Competition list caching
   */
  async cacheCompetitionList(
    competitions: Competition[],
    leagueId?: string
  ): Promise<void> {
    try {
      const key = this.keys.competitionList(leagueId);
      await this.redis.setex(
        key,
        this.metadataTTL,
        JSON.stringify(competitions)
      );
    } catch (error: any) {
      logger.error('Failed to cache competition list', {
        leagueId,
        error: error.message,
      });
    }
  }

  async getCompetitionList(leagueId?: string): Promise<Competition[] | null> {
    try {
      const key = this.keys.competitionList(leagueId);
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error: any) {
      logger.error('Failed to get cached competition list', {
        leagueId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Cache invalidation
   */
  async invalidateLeaderboard(competitionId: string): Promise<void> {
    try {
      await this.redis.del(
        this.keys.leaderboard(competitionId),
        this.keys.leaderboardVersion(competitionId)
      );
      logger.debug('Invalidated leaderboard cache', { competitionId });
    } catch (error: any) {
      logger.error('Failed to invalidate leaderboard cache', {
        competitionId,
        error: error.message,
      });
    }
  }

  async invalidateCompetition(competitionId: string): Promise<void> {
    try {
      await this.redis.del(
        this.keys.competition(competitionId),
        this.keys.competitionStats(competitionId)
      );
      logger.debug('Invalidated competition cache', { competitionId });
    } catch (error: any) {
      logger.error('Failed to invalidate competition cache', {
        competitionId,
        error: error.message,
      });
    }
  }

  async invalidateUserEntries(userId: string): Promise<void> {
    try {
      await this.redis.del(this.keys.userEntries(userId));
      logger.debug('Invalidated user entries cache', { userId });
    } catch (error: any) {
      logger.error('Failed to invalidate user entries cache', {
        userId,
        error: error.message,
      });
    }
  }

  async invalidateUserAchievements(userId: string, leagueId?: string): Promise<void> {
    try {
      await this.redis.del(this.keys.userAchievements(userId, leagueId));
      logger.debug('Invalidated user achievements cache', { userId, leagueId });
    } catch (error: any) {
      logger.error('Failed to invalidate user achievements cache', {
        userId,
        leagueId,
        error: error.message,
      });
    }
  }

  async invalidateCompetitionList(leagueId?: string): Promise<void> {
    try {
      await this.redis.del(this.keys.competitionList(leagueId));
      logger.debug('Invalidated competition list cache', { leagueId });
    } catch (error: any) {
      logger.error('Failed to invalidate competition list cache', {
        leagueId,
        error: error.message,
      });
    }
  }

  /**
   * Bulk invalidation
   */
  async invalidateAll(): Promise<void> {
    try {
      const pattern = 'competition:*';
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info('Invalidated all competition caches', { keyCount: keys.length });
      }
    } catch (error: any) {
      logger.error('Failed to invalidate all caches', {
        error: error.message,
      });
    }
  }

  /**
   * Cache warming
   */
  async warmCache(competitions: Competition[]): Promise<void> {
    try {
      const promises = competitions.map(async (competition) => {
        await this.cacheCompetition(competition);
      });
      
      await Promise.all(promises);
      logger.info('Warmed competition cache', { count: competitions.length });
    } catch (error: any) {
      logger.error('Failed to warm cache', {
        error: error.message,
      });
    }
  }

  /**
   * Distributed locking for cache updates
   */
  async acquireLock(
    key: string,
    ttl = 5000
  ): Promise<boolean> {
    try {
      const lockKey = this.keys.lockKey(key);
      const result = await this.redis.set(
        lockKey,
        '1',
        'PX',
        ttl,
        'NX'
      );
      return result === 'OK';
    } catch (error: any) {
      logger.error('Failed to acquire lock', {
        key,
        error: error.message,
      });
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    try {
      const lockKey = this.keys.lockKey(key);
      await this.redis.del(lockKey);
    } catch (error: any) {
      logger.error('Failed to release lock', {
        key,
        error: error.message,
      });
    }
  }

  /**
   * Cache statistics
   */
  async getCacheStats(): Promise<{
    keys: number;
    memory: string;
    hits: number;
    misses: number;
  }> {
    try {
      const info = await this.redis.info('stats');
      const keys = await this.redis.dbsize();
      
      // Parse Redis info
      const stats = {
        keys,
        memory: 'N/A',
        hits: 0,
        misses: 0,
      };
      
      const lines = info.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('keyspace_hits:')) {
          stats.hits = parseInt(line.split(':')[1], 10);
        } else if (line.startsWith('keyspace_misses:')) {
          stats.misses = parseInt(line.split(':')[1], 10);
        }
      }
      
      return stats;
    } catch (error: any) {
      logger.error('Failed to get cache stats', {
        error: error.message,
      });
      return {
        keys: 0,
        memory: 'N/A',
        hits: 0,
        misses: 0,
      };
    }
  }

  /**
   * Cleanup and connection management
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
    logger.info('Competition cache manager disconnected');
  }
}

// Singleton instance
let cacheManager: CompetitionCacheManager | null = null;

/**
 * Get or create cache manager instance
 */
export function getCompetitionCache(): CompetitionCacheManager {
  if (!cacheManager) {
    cacheManager = new CompetitionCacheManager();
  }
  return cacheManager;
}