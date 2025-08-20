/**
 * Rate Limiting Middleware
 * 
 * Protects API endpoints from abuse using Redis-backed sliding window algorithm.
 * Different limits can be applied per user, agent type, and endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests in window
  keyPrefix?: string; // Redis key prefix
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string; // Custom error message
  standardHeaders?: boolean; // Return rate limit info in headers
  legacyHeaders?: boolean; // Return X-RateLimit headers
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number; // Seconds until retry
}

export class RateLimiter {
  private config: RateLimitConfig;
  private redis = getRedis();

  constructor(config: RateLimitConfig) {
    this.config = {
      keyPrefix: 'ratelimit',
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Too many requests, please try again later.',
      ...config,
    };
  }

  /**
   * Generate rate limit key
   */
  private getKey(identifier: string): string {
    return `${this.config.keyPrefix}:${identifier}:${Date.now()}`;
  }

  /**
   * Check if request is allowed
   */
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const key = `${this.config.keyPrefix}:${identifier}`;

    try {
      // Remove old entries outside the window
      await this.redis.zremrangebyscore(key, '-inf', windowStart);

      // Count requests in current window
      const requestCount = await this.redis.zcard(key);

      if (requestCount >= this.config.maxRequests) {
        // Get oldest request time to calculate retry after
        const oldestRequest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTime = oldestRequest[1] ? parseInt(oldestRequest[1]) : now;
        const resetTime = new Date(oldestTime + this.config.windowMs);
        const retryAfter = Math.ceil((resetTime.getTime() - now) / 1000);

        return {
          allowed: false,
          limit: this.config.maxRequests,
          remaining: 0,
          resetTime,
          retryAfter,
        };
      }

      // Add current request
      await this.redis.zadd(key, now, `${now}-${Math.random()}`);
      await this.redis.expire(key, Math.ceil(this.config.windowMs / 1000));

      return {
        allowed: true,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests - requestCount - 1,
        resetTime: new Date(now + this.config.windowMs),
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Allow request on error to avoid blocking users
      return {
        allowed: true,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests,
        resetTime: new Date(now + this.config.windowMs),
      };
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = `${this.config.keyPrefix}:${identifier}`;
    await this.redis.del(key);
  }

  /**
   * Get current usage for an identifier
   */
  async getUsage(identifier: string): Promise<number> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const key = `${this.config.keyPrefix}:${identifier}`;

    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    return await this.redis.zcard(key);
  }
}

/**
 * Rate limit configurations for different agent types
 */
export const AGENT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  COMMISSIONER: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  ANALYST: {
    windowMs: 60 * 1000,
    maxRequests: 40,
  },
  NARRATOR: {
    windowMs: 60 * 1000,
    maxRequests: 20,
  },
  TRASH_TALKER: {
    windowMs: 60 * 1000,
    maxRequests: 20,
  },
  BETTING_ADVISOR: {
    windowMs: 60 * 1000,
    maxRequests: 25,
  },
  HISTORIAN: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  ORACLE: {
    windowMs: 60 * 1000,
    maxRequests: 15, // Lower limit for prediction requests
  },
  MULTI_AGENT: {
    windowMs: 60 * 1000,
    maxRequests: 10, // Lower limit for multi-agent collaborations
  },
};

/**
 * Global rate limit configuration
 */
export const GLOBAL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute total
  keyPrefix: 'ratelimit:global',
};

/**
 * Burst rate limit configuration (for rapid requests)
 */
export const BURST_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10 * 1000, // 10 seconds
  maxRequests: 5, // 5 requests per 10 seconds
  keyPrefix: 'ratelimit:burst',
};

/**
 * Rate limiting middleware for Next.js API routes
 */
export function withRateLimit(
  handler: (req: NextRequest, context: any) => Promise<NextResponse>,
  customConfig?: Partial<RateLimitConfig>
) {
  const config = {
    ...GLOBAL_RATE_LIMIT,
    ...customConfig,
  };

  const limiter = new RateLimiter(config);

  return async (req: NextRequest, context: any): Promise<NextResponse> => {
    try {
      // Get user identifier (user ID or IP)
      const session = await getServerSession(authOptions);
      const identifier = session?.user?.id || req.ip || 'anonymous';

      // Check rate limit
      const result = await limiter.checkLimit(identifier);

      if (!result.allowed) {
        const response = NextResponse.json(
          {
            error: config.message,
            retryAfter: result.retryAfter,
          },
          { status: 429 }
        );

        // Add rate limit headers
        if (config.standardHeaders) {
          response.headers.set('RateLimit-Limit', result.limit.toString());
          response.headers.set('RateLimit-Remaining', result.remaining.toString());
          response.headers.set('RateLimit-Reset', result.resetTime.toISOString());
        }

        if (config.legacyHeaders) {
          response.headers.set('X-RateLimit-Limit', result.limit.toString());
          response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
          response.headers.set('X-RateLimit-Reset', result.resetTime.getTime().toString());
        }

        if (result.retryAfter) {
          response.headers.set('Retry-After', result.retryAfter.toString());
        }

        return response;
      }

      // Process request
      const response = await handler(req, context);

      // Add rate limit headers to successful response
      if (config.standardHeaders) {
        response.headers.set('RateLimit-Limit', result.limit.toString());
        response.headers.set('RateLimit-Remaining', result.remaining.toString());
        response.headers.set('RateLimit-Reset', result.resetTime.toISOString());
      }

      if (config.legacyHeaders) {
        response.headers.set('X-RateLimit-Limit', result.limit.toString());
        response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
        response.headers.set('X-RateLimit-Reset', result.resetTime.getTime().toString());
      }

      return response;
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      // Allow request on error
      return handler(req, context);
    }
  };
}

/**
 * Agent-specific rate limiting middleware
 */
export function withAgentRateLimit(
  agentType: string,
  handler: (req: NextRequest, context: any) => Promise<NextResponse>
) {
  const agentConfig = AGENT_RATE_LIMITS[agentType] || GLOBAL_RATE_LIMIT;
  
  return withRateLimit(handler, {
    ...agentConfig,
    keyPrefix: `ratelimit:agent:${agentType}`,
  });
}

/**
 * Composite rate limiting (global + specific)
 */
export function withCompositeRateLimit(
  configs: RateLimitConfig[],
  handler: (req: NextRequest, context: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context: any): Promise<NextResponse> => {
    // Check all rate limits
    for (const config of configs) {
      const limiter = new RateLimiter(config);
      const session = await getServerSession(authOptions);
      const identifier = session?.user?.id || req.ip || 'anonymous';
      const result = await limiter.checkLimit(identifier);

      if (!result.allowed) {
        return NextResponse.json(
          {
            error: config.message || 'Too many requests',
            retryAfter: result.retryAfter,
          },
          { status: 429 }
        );
      }
    }

    return handler(req, context);
  };
}