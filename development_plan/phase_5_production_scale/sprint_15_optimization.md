# Sprint 15: Optimization

## Sprint Overview
Comprehensive performance optimization across database, API, and frontend to achieve production-ready performance targets.

**Duration**: 2 weeks (Week 1-2 of Phase 5)  
**Dependencies**: All features complete (Phases 1-4)  
**Risk Level**: Low - Focused on improvements, not new features

## Implementation Guide

### Database Optimization

```typescript
// /lib/db/query-optimizer.ts
export class QueryOptimizer {
  async analyzeSlowQueries(): Promise<QueryAnalysis[]> {
    const slowQueries = await prisma.$queryRaw`
      SELECT 
        query,
        mean_exec_time,
        calls,
        total_exec_time
      FROM pg_stat_statements
      WHERE mean_exec_time > 100
      ORDER BY mean_exec_time DESC
      LIMIT 20
    `;

    return slowQueries.map(q => ({
      query: q.query,
      avgTime: q.mean_exec_time,
      calls: q.calls,
      totalTime: q.total_exec_time,
      suggestions: this.generateOptimizationSuggestions(q),
    }));
  }

  async createIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX CONCURRENTLY idx_matchups_lookup ON matchups(league_sandbox, season_id, week)',
      'CREATE INDEX CONCURRENTLY idx_bets_user_week ON bets(user_id, created_at DESC)',
      'CREATE INDEX CONCURRENTLY idx_content_published ON generated_content(status, published_at DESC)',
    ];

    for (const index of indexes) {
      await prisma.$executeRawUnsafe(index);
    }
  }

  async implementMaterializedViews(): Promise<void> {
    await prisma.$executeRaw`
      CREATE MATERIALIZED VIEW league_summary AS
      SELECT 
        league_sandbox,
        COUNT(DISTINCT season_id) as total_seasons,
        COUNT(DISTINCT team_id) as total_teams,
        COUNT(*) as total_matchups,
        MAX(date) as last_updated
      FROM matchups
      GROUP BY league_sandbox
      WITH DATA;

      CREATE UNIQUE INDEX ON league_summary(league_sandbox);
    `;
  }
}
```

### API Response Caching

```typescript
// /lib/cache/response-cache.ts
import { Redis } from 'ioredis';
import { createHash } from 'crypto';

export class ResponseCache {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') return next();

      const key = this.generateCacheKey(req);
      const cached = await this.redis.get(key);

      if (cached) {
        const data = JSON.parse(cached);
        res.setHeader('X-Cache', 'HIT');
        return res.json(data);
      }

      // Store original json method
      const originalJson = res.json;
      res.json = function(data: any) {
        res.setHeader('X-Cache', 'MISS');
        
        // Cache the response
        const ttl = res.getHeader('Cache-Control')?.toString().match(/max-age=(\d+)/)?.[1] || 300;
        redis.setex(key, parseInt(ttl), JSON.stringify(data));
        
        return originalJson.call(this, data);
      };

      next();
    };
  }

  private generateCacheKey(req: Request): string {
    const hash = createHash('md5');
    hash.update(req.url);
    hash.update(JSON.stringify(req.query));
    hash.update(req.headers['authorization'] || '');
    return `api:${hash.digest('hex')}`;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### Frontend Bundle Optimization

```typescript
// next.config.js
module.exports = {
  experimental: {
    optimizeCss: true,
  },
  
  webpack: (config, { dev, isServer }) => {
    // Code splitting
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        default: false,
        vendors: false,
        vendor: {
          name: 'vendor',
          chunks: 'all',
          test: /node_modules/,
          priority: 20,
        },
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          priority: 10,
          reuseExistingChunk: true,
          enforce: true,
        },
      },
    };

    // Tree shaking
    config.optimization.usedExports = true;
    config.optimization.sideEffects = false;

    return config;
  },

  images: {
    domains: ['espn.com', 'cloudinary.com'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96],
    formats: ['image/webp'],
  },

  compress: true,
  
  poweredByHeader: false,
  
  reactStrictMode: true,
};
```

### Service Worker Implementation

```typescript
// /public/sw.js
const CACHE_NAME = 'rumbledore-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }

        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        });
      })
  );
});
```

### Performance Monitoring

```typescript
// /lib/monitoring/performance.ts
export class PerformanceMonitor {
  trackWebVitals() {
    if (typeof window === 'undefined') return;

    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(this.sendToAnalytics);
      getFID(this.sendToAnalytics);
      getFCP(this.sendToAnalytics);
      getLCP(this.sendToAnalytics);
      getTTFB(this.sendToAnalytics);
    });
  }

  private sendToAnalytics(metric: any) {
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      id: metric.id,
      label: metric.label,
    });

    // Send to analytics endpoint
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics', body);
    } else {
      fetch('/api/analytics', { 
        body, 
        method: 'POST',
        keepalive: true,
      });
    }
  }

  measureApiPerformance(endpoint: string, duration: number) {
    if (duration > 1000) {
      console.warn(`Slow API call: ${endpoint} took ${duration}ms`);
    }

    // Log to monitoring service
    this.logMetric('api_performance', {
      endpoint,
      duration,
      timestamp: Date.now(),
    });
  }
}
```

## Success Criteria
- [ ] Page load time < 3s
- [ ] API response < 100ms (p95)
- [ ] Bundle size < 500KB
- [ ] Lighthouse score > 95
- [ ] Database queries optimized
- [ ] Caching strategy implemented
