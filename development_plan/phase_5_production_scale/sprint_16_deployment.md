# Sprint 16: Deployment

## Sprint Overview
Final production deployment with CI/CD pipelines, monitoring, documentation, and launch preparation.

**Duration**: 2 weeks (Week 3-4 of Phase 5)  
**Dependencies**: Sprint 15 (Optimization) complete  
**Risk Level**: High - Production deployment critical

## Implementation Guide

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test -- --coverage
      
      - name: Run linting
        run: npm run lint
      
      - name: Type check
        run: npm run type-check
      
      - name: Security audit
        run: npm audit --audit-level=high

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build application
        run: npm run build
        env:
          NEXT_PUBLIC_API_URL: ${{ secrets.API_URL }}
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build-files
          path: .next/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Production Infrastructure

```terraform
# infrastructure/main.tf
provider "aws" {
  region = "us-east-1"
}

resource "aws_rds_cluster" "postgres" {
  cluster_identifier      = "rumbledore-db-cluster"
  engine                  = "aurora-postgresql"
  engine_version          = "14.6"
  master_username         = var.db_username
  master_password         = var.db_password
  database_name          = "rumbledore"
  backup_retention_period = 7
  preferred_backup_window = "03:00-04:00"
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  serverlessv2_scaling_configuration {
    max_capacity = 16
    min_capacity = 0.5
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "rumbledore-redis"
  replication_group_description = "Redis cluster for Rumbledore"
  engine                     = "redis"
  node_type                 = "cache.t3.micro"
  number_cache_clusters      = 2
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  snapshot_retention_limit = 5
  snapshot_window          = "03:00-05:00"
}

resource "aws_s3_bucket" "assets" {
  bucket = "rumbledore-assets"
  
  versioning {
    enabled = true
  }
  
  lifecycle_rule {
    enabled = true
    
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}

resource "aws_cloudfront_distribution" "cdn" {
  origin {
    domain_name = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id   = "S3-rumbledore-assets"
  }
  
  enabled             = true
  is_ipv6_enabled    = true
  default_root_object = "index.html"
  
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-rumbledore-assets"
    
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
  }
  
  price_class = "PriceClass_100"
  
  restrictions {
    geo_restriction {
      restriction_type = "whitelist"
      locations        = ["US", "CA"]
    }
  }
  
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
```

### Monitoring Setup

```typescript
// /lib/monitoring/setup.ts
import * as Sentry from '@sentry/nextjs';
import { StatsD } from 'node-statsd';

export function setupMonitoring() {
  // Sentry error tracking
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend(event, hint) {
      // Filter sensitive data
      if (event.request?.cookies) {
        delete event.request.cookies;
      }
      return event;
    },
  });

  // StatsD metrics
  const statsd = new StatsD({
    host: process.env.STATSD_HOST,
    port: 8125,
    prefix: 'rumbledore.',
  });

  // Custom metrics
  return {
    trackEvent(name: string, value: number = 1) {
      statsd.increment(name, value);
    },
    
    trackTiming(name: string, duration: number) {
      statsd.timing(name, duration);
    },
    
    trackGauge(name: string, value: number) {
      statsd.gauge(name, value);
    },
  };
}

// Health check endpoint
export async function healthCheck(): Promise<HealthStatus> {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    espn: await checkESPNConnection(),
    openai: await checkOpenAI(),
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date(),
  };
}
```

### Documentation

```markdown
# Rumbledore Production Deployment Guide

## Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Docker & Docker Compose
- AWS CLI configured

## Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/rumbledore
DATABASE_URL_READ=postgresql://user:pass@read-replica:5432/rumbledore

# Redis
REDIS_URL=redis://localhost:6379

# APIs
OPENAI_API_KEY=sk-...
ODDS_API_KEY=...
ESPN_COOKIE=...

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
DATADOG_API_KEY=...

# Next.js
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://rumbledore.com
```

## Deployment Steps

1. **Database Migration**
   ```bash
   npm run db:migrate:deploy
   ```

2. **Build Application**
   ```bash
   npm run build
   ```

3. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

4. **Verify Deployment**
   ```bash
   npm run test:e2e:production
   ```

## Monitoring

- **Sentry**: Error tracking at sentry.io/rumbledore
- **DataDog**: Metrics at app.datadoghq.com
- **Vercel Analytics**: vercel.com/analytics

## Rollback Procedure

1. Identify the last stable deployment
2. Run: `vercel rollback [deployment-id]`
3. Verify rollback successful
4. Investigate and fix issue
5. Redeploy when ready

## Support

- Technical issues: tech@rumbledore.com
- User support: support@rumbledore.com
- Status page: status.rumbledore.com
```

## Success Criteria
- [ ] CI/CD pipeline functional
- [ ] Zero-downtime deployments
- [ ] Monitoring active
- [ ] Alerts configured
- [ ] Documentation complete
- [ ] Load testing passed
- [ ] Security audit passed
- [ ] Backup strategy tested
