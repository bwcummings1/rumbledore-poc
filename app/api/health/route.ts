import { NextRequest } from 'next/server';
import { createApiHandler, createSuccessResponse } from '@/lib/api/handler';
import prisma from '@/lib/prisma';
import Redis from 'ioredis';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    api: ServiceStatus;
  };
  version: string;
}

interface ServiceStatus {
  status: 'up' | 'down';
  latency?: number;
  error?: string;
}

async function checkDatabase(): Promise<ServiceStatus> {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    
    return {
      status: 'up',
      latency
    };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    commandTimeout: 5000
  });

  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;
    
    await redis.quit();
    
    return {
      status: 'up',
      latency
    };
  } catch (error) {
    await redis.quit();
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export const GET = createApiHandler<HealthStatus>(async (request: NextRequest) => {
  const [dbStatus, redisStatus] = await Promise.all([
    checkDatabase(),
    checkRedis()
  ]);
  
  const allServicesUp = 
    dbStatus.status === 'up' && 
    redisStatus.status === 'up';
  
  const anyServiceDown = 
    dbStatus.status === 'down' || 
    redisStatus.status === 'down';
  
  const overallStatus = anyServiceDown 
    ? 'unhealthy' 
    : allServicesUp 
      ? 'healthy' 
      : 'degraded';
  
  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbStatus,
      redis: redisStatus,
      api: {
        status: 'up',
        latency: 0
      }
    },
    version: process.env.npm_package_version || '0.1.0'
  };
  
  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  
  return createSuccessResponse(health, statusCode);
});