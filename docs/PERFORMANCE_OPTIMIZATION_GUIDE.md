# Performance Optimization Guide

## Overview
This guide documents all performance optimizations implemented in Rumbledore and provides best practices for maintaining and improving application performance.

## Table of Contents
1. [Current Performance Metrics](#current-performance-metrics)
2. [Database Optimizations](#database-optimizations)
3. [API Performance](#api-performance)
4. [Frontend Optimizations](#frontend-optimizations)
5. [Caching Strategy](#caching-strategy)
6. [WebSocket Optimization](#websocket-optimization)
7. [Image & Asset Optimization](#image--asset-optimization)
8. [Monitoring & Testing](#monitoring--testing)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

## Current Performance Metrics

### Achieved Metrics (Sprint 15)
- **Page Load Time**: <2.5s ✅
- **API Response (p95)**: ~95ms (cached) ✅
- **Bundle Size**: ~480KB ✅
- **Lighthouse Score**: ~90-92 (target >95) ⚠️
- **Database Queries**: <45ms (indexed) ✅
- **Cache Hit Ratio**: >80% ✅
- **WebSocket Latency**: <100ms ✅
- **Compression Ratio**: ~70% ✅

### Performance Budgets
```javascript
// Resource budgets
- JavaScript: < 300KB
- CSS: < 150KB
- Images: < 500KB per page
- Fonts: < 100KB
- Total page weight: < 1.5MB

// Timing budgets
- First Contentful Paint: < 1.8s
- Largest Contentful Paint: < 2.5s
- Time to Interactive: < 3.8s
- First Input Delay: < 100ms
- Cumulative Layout Shift: < 0.1
```

## Database Optimizations

### 1. Connection Pooling
```typescript
// Optimal pool configuration
const poolSize = cpuCount * 2 + 1; // Formula for optimal connections

// Implementation: /lib/db/connection-pool.ts
- Min connections: 2 (production)
- Max connections: poolSize * 2
- Idle timeout: 30 seconds
- Connection timeout: 5 seconds
```

### 2. Query-Level Caching
```typescript
// Prisma middleware caching
// Implementation: /lib/db/prisma-cache.ts

Cache patterns:
- User queries: 10 minutes
- League data: 5 minutes
- Leaderboards: 1 minute
- Static data: 30 minutes

// Usage
const queryCache = new PrismaQueryCache();
prisma.$use(queryCache.middleware());
```

### 3. Database Indexes
```sql
-- Critical indexes for performance
CREATE INDEX CONCURRENTLY idx_bets_user_week ON "Bet"("userId", "week");
CREATE INDEX CONCURRENTLY idx_matchups_lookup ON "Matchup"("leagueSandbox", "seasonId", "week");
CREATE INDEX CONCURRENTLY idx_content_published ON "GeneratedContent"("status", "publishedAt");
-- 20+ more indexes in /lib/db/query-optimizer.ts
```

### 4. Materialized Views
```sql
-- Pre-computed aggregations
CREATE MATERIALIZED VIEW mv_season_statistics AS ...
CREATE MATERIALIZED VIEW mv_h2h_summary AS ...
CREATE MATERIALIZED VIEW league_summary AS ...

-- Refresh schedule: Every hour for active data
```

## API Performance

### 1. Response Caching
```typescript
// Redis-based API caching
// Implementation: /lib/cache/response-cache.ts

export const GET = createApiHandler(
  async (request, context) => {
    // Handler logic
  },
  {
    cache: {
      ttl: 300, // 5 minutes
      tags: ['leagues'],
      vary: ['Authorization'],
    }
  }
);
```

### 2. Compression Middleware
```typescript
// Automatic Gzip/Brotli compression
// Implementation: /lib/middleware/compression.ts

- Threshold: 1KB minimum
- Brotli preferred over Gzip
- Level 6 compression (balanced)
- ~70% size reduction for JSON
```

### 3. Rate Limiting
```typescript
// Sliding window rate limiting
// Per endpoint limits:
- AI Chat: 15 req/min
- Betting: 30 req/min
- General API: 60 req/min
```

## Frontend Optimizations

### 1. Bundle Optimization
```javascript
// next.config.mjs optimizations
{
  splitChunks: {
    chunks: 'all',
    cacheGroups: {
      vendor: { test: /node_modules/, priority: 20 },
      radix: { test: /@radix-ui/, priority: 30 },
      charts: { test: /recharts/, priority: 25 },
      framework: { test: /react|react-dom/, priority: 40 },
    }
  }
}
```

### 2. Image Optimization
```tsx
// Optimized image component
// Implementation: /components/ui/optimized-image.tsx

<OptimizedImage
  src="/hero.jpg"
  width={1200}
  height={600}
  lazyBoundary="200px"
  fadeIn={true}
  priority={false} // true for above-fold
  quality={75}
/>
```

### 3. Critical CSS
```html
<!-- Inline critical CSS -->
<style>
  /* Critical above-fold styles */
  ${criticalCSS}
</style>

<!-- Preload non-critical CSS -->
<link rel="preload" href="/styles/main.css" as="style">
```

### 4. Service Worker
```javascript
// Caching strategies (/public/sw.js)
- Static assets: Cache First
- API requests: Network First
- Images: Stale While Revalidate
- Offline fallback: /offline.html
```

## Caching Strategy

### Multi-Layer Cache Architecture
```
┌─────────────┐
│   Browser   │ → Service Worker Cache
└─────────────┘
       ↓
┌─────────────┐
│     CDN     │ → Edge Cache
└─────────────┘
       ↓
┌─────────────┐
│    Redis    │ → Application Cache
└─────────────┘
       ↓
┌─────────────┐
│  Database   │ → Query Cache
└─────────────┘
```

### Cache TTL Strategy
```typescript
const cacheTTLs = {
  // Static assets
  images: 31536000,     // 1 year
  fonts: 31536000,      // 1 year
  css: 86400,           // 1 day
  js: 86400,            // 1 day
  
  // API responses
  userProfile: 600,     // 10 minutes
  leagueData: 300,      // 5 minutes
  liveScores: 30,       // 30 seconds
  odds: 300,            // 5 minutes
  
  // Database queries
  staticData: 3600,     // 1 hour
  userQueries: 600,     // 10 minutes
  aggregations: 60,     // 1 minute
};
```

## WebSocket Optimization

### Connection Pooling
```typescript
// Implementation: /lib/websocket/connection-pool.ts

Configuration:
- Max connections per league: 100
- Idle timeout: 5 minutes
- Heartbeat: 25 seconds
- Compression: enabled for messages >1KB
```

### Message Optimization
```typescript
// Optimize message payload
wsConnectionPool.optimizeMessage(message);

// Compression for large messages
if (message.length > 1024) {
  socket.compress(true).emit(event, data);
}
```

## Image & Asset Optimization

### CDN Integration
```typescript
// CDN configuration (/lib/cdn/cdn-config.ts)
const cdnUrl = cdnUrlBuilder.buildUrl('/image.jpg', {
  width: 800,
  quality: 80,
  format: 'auto', // WebP/AVIF auto-selection
});
```

### Lazy Loading
```typescript
// Native lazy loading
<img loading="lazy" />

// Intersection Observer for custom loading
const observer = new IntersectionObserver(entries => {
  // Load image when in viewport
}, { rootMargin: '200px' });
```

### Responsive Images
```html
<picture>
  <source 
    media="(max-width: 640px)" 
    srcset="/image-mobile.webp">
  <source 
    media="(max-width: 1024px)" 
    srcset="/image-tablet.webp">
  <img 
    src="/image-desktop.jpg" 
    alt="Description">
</picture>
```

## Monitoring & Testing

### Performance Dashboard
```typescript
// Access at: /admin/performance
// Implementation: /components/monitoring/performance-dashboard.tsx

Metrics tracked:
- API response times
- Database query performance
- Cache hit ratios
- WebSocket connections
- Web Vitals
- System resources
```

### Load Testing

#### Artillery
```bash
# Run load test
npx artillery run tests/load/artillery-config.yml

# Quick test
npx artillery quick --count 10 --num 50 http://localhost:3000
```

#### k6
```bash
# Run k6 test
k6 run tests/load/k6-load-test.js

# Run with specific scenario
k6 run -e K6_SCENARIO=api tests/load/k6-load-test.js
```

### Performance Monitoring Commands
```bash
# Run performance benchmark
npm run perf:bench

# Optimize database
npm run db:optimize

# Analyze bundle
npm run build:analyze
```

## Best Practices

### 1. Database
- Always use indexed columns in WHERE clauses
- Avoid N+1 queries (use includes/joins)
- Use pagination for large datasets
- Implement cursor-based pagination for real-time data
- Use read replicas for heavy read operations

### 2. API
- Return only necessary fields (use select)
- Implement field filtering (?fields=id,name)
- Use HTTP caching headers appropriately
- Compress responses >1KB
- Implement request batching where possible

### 3. Frontend
- Code split at route level minimum
- Lazy load below-fold components
- Use React.memo for expensive components
- Implement virtual scrolling for long lists
- Preload critical resources

### 4. Caching
- Cache at every layer possible
- Use appropriate TTLs for data freshness
- Implement cache warming for critical data
- Monitor cache hit ratios (target >80%)
- Use cache tags for granular invalidation

### 5. Images
- Use modern formats (WebP, AVIF)
- Implement responsive images
- Lazy load below-fold images
- Use LQIP for better perceived performance
- Optimize with appropriate quality settings

## Troubleshooting

### High API Response Times
1. Check database query performance in logs
2. Verify Redis cache is working (redis-cli PING)
3. Check for N+1 queries in ORM
4. Review API endpoint complexity
5. Enable query logging: `prisma.$on('query', console.log)`

### Low Cache Hit Ratio
1. Review cache TTL settings
2. Check Redis memory usage (redis-cli INFO memory)
3. Verify cache key generation logic
4. Monitor cache eviction rate
5. Consider increasing Redis memory

### High Database Load
1. Check slow query log
2. Review missing indexes
3. Consider query result caching
4. Implement read replicas
5. Optimize complex aggregations with materialized views

### Large Bundle Size
1. Run bundle analyzer: `npm run build:analyze`
2. Check for duplicate dependencies
3. Review dynamic imports usage
4. Consider removing unused dependencies
5. Implement more aggressive code splitting

### Poor Lighthouse Score
1. Run Lighthouse in incognito mode
2. Check for render-blocking resources
3. Verify critical CSS is inlined
4. Review JavaScript execution time
5. Check for layout shifts (CLS)
6. Optimize Time to Interactive (TTI)

## Performance Checklist

Before deploying to production:

- [ ] Database indexes are in place
- [ ] Materialized views are created and scheduled
- [ ] Redis cache is configured and running
- [ ] CDN is configured for static assets
- [ ] Service worker is registered and caching
- [ ] Images are optimized and lazy loaded
- [ ] Bundle size is under budget (<500KB)
- [ ] API responses are compressed
- [ ] Rate limiting is configured
- [ ] Monitoring is set up and alerting
- [ ] Load tests pass performance targets
- [ ] Lighthouse score is >90

## Continuous Optimization

### Weekly Tasks
- Review performance dashboard metrics
- Check slow query logs
- Monitor cache hit ratios
- Review error rates and patterns

### Monthly Tasks
- Run full load test suite
- Analyze bundle size trends
- Review and optimize database indexes
- Update cache TTL strategies based on usage

### Quarterly Tasks
- Full performance audit
- Database query optimization review
- Dependency audit and updates
- Architecture review for bottlenecks

## Resources

### Documentation
- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Prisma Performance](https://www.prisma.io/docs/guides/performance-and-optimization)

### Tools
- [WebPageTest](https://www.webpagetest.org/)
- [GTmetrix](https://gtmetrix.com/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Redis Commander](https://github.com/joeferner/redis-commander)

### Monitoring Services
- [DataDog](https://www.datadoghq.com/)
- [New Relic](https://newrelic.com/)
- [Sentry Performance](https://sentry.io/for/performance/)
- [LogRocket](https://logrocket.com/)

---

*Last Updated: Sprint 15 Completion*
*For questions or improvements, please refer to the development team.*