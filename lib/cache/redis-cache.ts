import { getRedis } from '@/lib/redis';
import { compress, decompress, shouldCompress } from '@/lib/utils/compression';

export class RedisCache {
  private defaultTTL = 300; // 5 minutes

  private generateKey(namespace: string, id: string): string {
    return `rumbledore:${namespace}:${id}`;
  }

  async get<T>(namespace: string, id: string): Promise<T | null> {
    try {
      const redis = getRedis();
      const key = this.generateKey(namespace, id);
      const compressed = await redis.get(key);
      
      if (!compressed) {
        return null;
      }

      const decompressed = await decompress(compressed);
      return JSON.parse(decompressed);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set<T>(
    namespace: string,
    id: string,
    value: T,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    try {
      const redis = getRedis();
      const key = this.generateKey(namespace, id);
      const json = JSON.stringify(value);
      
      // Only compress if data is large enough
      const compressed = await shouldCompress(json) 
        ? await compress(json)
        : json;
      
      await redis.setex(key, ttl, compressed);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async delete(namespace: string, id: string): Promise<void> {
    try {
      const redis = getRedis();
      const key = this.generateKey(namespace, id);
      await redis.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async clearNamespace(namespace: string): Promise<void> {
    try {
      const redis = getRedis();
      const pattern = `rumbledore:${namespace}:*`;
      
      // Use SCAN instead of KEYS for production safety
      const stream = redis.scanStream({
        match: pattern,
        count: 100,
      });

      const pipeline = redis.pipeline();
      
      stream.on('data', (keys: string[]) => {
        if (keys.length) {
          keys.forEach(key => pipeline.del(key));
        }
      });

      stream.on('end', async () => {
        await pipeline.exec();
      });
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  async getOrSet<T>(
    namespace: string,
    id: string,
    fetcher: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(namespace, id);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const fresh = await fetcher();
    
    // Store in cache
    await this.set(namespace, id, fresh, ttl);
    
    return fresh;
  }

  async mget<T>(namespace: string, ids: string[]): Promise<(T | null)[]> {
    try {
      const redis = getRedis();
      const keys = ids.map(id => this.generateKey(namespace, id));
      const values = await redis.mget(...keys);
      
      return Promise.all(
        values.map(async (compressed) => {
          if (!compressed) return null;
          
          try {
            const decompressed = await shouldCompress(compressed)
              ? await decompress(compressed)
              : compressed;
            return JSON.parse(decompressed);
          } catch {
            return null;
          }
        })
      );
    } catch (error) {
      console.error('Cache mget error:', error);
      return ids.map(() => null);
    }
  }

  async mset<T>(
    namespace: string, 
    items: Array<{ id: string; value: T }>,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    try {
      const redis = getRedis();
      const pipeline = redis.pipeline();
      
      for (const { id, value } of items) {
        const key = this.generateKey(namespace, id);
        const json = JSON.stringify(value);
        const compressed = await shouldCompress(json)
          ? await compress(json)
          : json;
        
        pipeline.setex(key, ttl, compressed);
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('Cache mset error:', error);
    }
  }

  async exists(namespace: string, id: string): Promise<boolean> {
    try {
      const redis = getRedis();
      const key = this.generateKey(namespace, id);
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  async ttl(namespace: string, id: string): Promise<number> {
    try {
      const redis = getRedis();
      const key = this.generateKey(namespace, id);
      return await redis.ttl(key);
    } catch (error) {
      console.error('Cache ttl error:', error);
      return -1;
    }
  }

  async expire(namespace: string, id: string, ttl: number): Promise<boolean> {
    try {
      const redis = getRedis();
      const key = this.generateKey(namespace, id);
      const result = await redis.expire(key, ttl);
      return result === 1;
    } catch (error) {
      console.error('Cache expire error:', error);
      return false;
    }
  }

  async increment(namespace: string, id: string, amount = 1): Promise<number> {
    try {
      const redis = getRedis();
      const key = this.generateKey(namespace, id);
      return await redis.incrby(key, amount);
    } catch (error) {
      console.error('Cache increment error:', error);
      return 0;
    }
  }

  async decrement(namespace: string, id: string, amount = 1): Promise<number> {
    try {
      const redis = getRedis();
      const key = this.generateKey(namespace, id);
      return await redis.decrby(key, amount);
    } catch (error) {
      console.error('Cache decrement error:', error);
      return 0;
    }
  }

  async flush(): Promise<void> {
    try {
      const redis = getRedis();
      await redis.flushdb();
    } catch (error) {
      console.error('Cache flush error:', error);
    }
  }
}