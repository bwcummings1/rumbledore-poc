/**
 * Analytics Collection Endpoint
 * Receives performance metrics from the client
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { z } from 'zod';
import { getRedis } from '@/lib/redis';

const WebVitalSchema = z.object({
  type: z.enum(['webvital', 'webvitals-batch']),
  metric: z.string().optional(),
  value: z.number().optional(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  url: z.string(),
  timestamp: z.number(),
  userAgent: z.string().optional(),
  connection: z.string().optional(),
  metrics: z.array(z.any()).optional(),
});

const PerformanceMetricSchema = z.object({
  metrics: z.array(z.object({
    name: z.string(),
    value: z.number(),
    unit: z.string(),
    timestamp: z.number(),
    tags: z.record(z.string()).optional(),
  })),
  timestamp: z.number(),
});

const AnalyticsPayloadSchema = z.union([
  WebVitalSchema,
  PerformanceMetricSchema,
]);

export const POST = createApiHandler(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const payload = AnalyticsPayloadSchema.parse(body);
    
    const redis = getRedis();
    const timestamp = Date.now();
    
    // Store in Redis with TTL (7 days)
    const key = `analytics:${timestamp}:${Math.random().toString(36).substr(2, 9)}`;
    await redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(payload));
    
    // Also aggregate metrics in time buckets
    if ('type' in payload && payload.type === 'webvital') {
      // Store web vital in hourly bucket
      const hourBucket = Math.floor(timestamp / (60 * 60 * 1000));
      const bucketKey = `analytics:webvitals:${hourBucket}`;
      
      await redis.lpush(bucketKey, JSON.stringify({
        metric: payload.metric,
        value: payload.value,
        rating: payload.rating,
        url: payload.url,
        timestamp: payload.timestamp,
      }));
      
      // Trim to last 1000 entries per bucket
      await redis.ltrim(bucketKey, 0, 999);
      
      // Set expiry on bucket (7 days)
      await redis.expire(bucketKey, 7 * 24 * 60 * 60);
      
      // Update aggregated stats
      if (payload.metric && payload.value !== undefined) {
        await updateAggregatedStats(redis, payload.metric, payload.value, payload.rating || 'unknown');
      }
    } else if ('metrics' in payload) {
      // Store performance metrics
      for (const metric of payload.metrics) {
        const hourBucket = Math.floor(timestamp / (60 * 60 * 1000));
        const bucketKey = `analytics:metrics:${metric.name}:${hourBucket}`;
        
        await redis.lpush(bucketKey, JSON.stringify(metric));
        await redis.ltrim(bucketKey, 0, 999);
        await redis.expire(bucketKey, 7 * 24 * 60 * 60);
        
        // Update aggregated stats
        await updateAggregatedStats(redis, metric.name, metric.value);
      }
    }
    
    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics] Received:', payload);
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[Analytics] Error processing payload:', error);
    
    // Still return success to avoid blocking the client
    return NextResponse.json({ success: true }, { status: 200 });
  }
});

async function updateAggregatedStats(
  redis: ReturnType<typeof getRedis>,
  metricName: string,
  value: number,
  rating?: string
) {
  const dailyKey = `analytics:stats:daily:${metricName}:${new Date().toISOString().split('T')[0]}`;
  
  // Increment count
  await redis.hincrby(dailyKey, 'count', 1);
  
  // Update sum for average calculation
  await redis.hincrbyfloat(dailyKey, 'sum', value);
  
  // Update min/max
  const currentMin = await redis.hget(dailyKey, 'min');
  const currentMax = await redis.hget(dailyKey, 'max');
  
  if (!currentMin || value < parseFloat(currentMin)) {
    await redis.hset(dailyKey, 'min', value.toString());
  }
  
  if (!currentMax || value > parseFloat(currentMax)) {
    await redis.hset(dailyKey, 'max', value.toString());
  }
  
  // Track rating distribution for web vitals
  if (rating && rating !== 'unknown') {
    await redis.hincrby(dailyKey, `rating:${rating}`, 1);
  }
  
  // Store individual values for percentile calculation (sample up to 1000)
  const valuesKey = `${dailyKey}:values`;
  const valuesCount = await redis.llen(valuesKey);
  
  if (valuesCount < 1000) {
    await redis.lpush(valuesKey, value.toString());
  } else {
    // Random sampling for values over 1000
    if (Math.random() < 0.1) {
      await redis.lpush(valuesKey, value.toString());
      await redis.ltrim(valuesKey, 0, 999);
    }
  }
  
  // Set expiry (30 days)
  await redis.expire(dailyKey, 30 * 24 * 60 * 60);
  await redis.expire(valuesKey, 30 * 24 * 60 * 60);
}

export const GET = createApiHandler(async (request: NextRequest) => {
  try {
    const redis = getRedis();
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get('metric');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    
    if (!metric) {
      // Return list of available metrics
      const keys = await redis.keys('analytics:stats:daily:*');
      const metrics = new Set<string>();
      
      keys.forEach(key => {
        const parts = key.split(':');
        if (parts[4]) {
          metrics.add(parts[4]);
        }
      });
      
      return NextResponse.json({
        metrics: Array.from(metrics),
        date,
      });
    }
    
    // Get stats for specific metric
    const dailyKey = `analytics:stats:daily:${metric}:${date}`;
    const stats = await redis.hgetall(dailyKey);
    
    if (!stats || Object.keys(stats).length === 0) {
      return NextResponse.json({
        metric,
        date,
        error: 'No data available',
      }, { status: 404 });
    }
    
    // Get values for percentile calculation
    const valuesKey = `${dailyKey}:values`;
    const values = await redis.lrange(valuesKey, 0, -1);
    const sortedValues = values.map(v => parseFloat(v)).sort((a, b) => a - b);
    
    const count = parseInt(stats.count || '0');
    const sum = parseFloat(stats.sum || '0');
    
    const result = {
      metric,
      date,
      count,
      average: count > 0 ? sum / count : 0,
      min: parseFloat(stats.min || '0'),
      max: parseFloat(stats.max || '0'),
      p50: sortedValues.length > 0 ? sortedValues[Math.floor(sortedValues.length * 0.5)] : 0,
      p75: sortedValues.length > 0 ? sortedValues[Math.floor(sortedValues.length * 0.75)] : 0,
      p95: sortedValues.length > 0 ? sortedValues[Math.floor(sortedValues.length * 0.95)] : 0,
      p99: sortedValues.length > 0 ? sortedValues[Math.floor(sortedValues.length * 0.99)] : 0,
      ratings: {
        good: parseInt(stats['rating:good'] || '0'),
        needsImprovement: parseInt(stats['rating:needs-improvement'] || '0'),
        poor: parseInt(stats['rating:poor'] || '0'),
      },
    };
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Analytics] Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
});