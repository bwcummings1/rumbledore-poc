import { GET } from '@/app/api/health/route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

jest.mock('@/lib/prisma');
jest.mock('ioredis');

describe('/api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return healthy status when all services are up', async () => {
    // Mock successful database check
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);
    
    // Mock Redis
    const Redis = require('ioredis');
    Redis.mockImplementation(() => ({
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue(undefined),
    }));

    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request, {});
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.services.database.status).toBe('up');
    expect(data.services.redis.status).toBe('up');
    expect(data.services.api.status).toBe('up');
  });

  it('should return unhealthy status when database is down', async () => {
    // Mock failed database check
    (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('Database connection failed'));
    
    // Mock Redis success
    const Redis = require('ioredis');
    Redis.mockImplementation(() => ({
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue(undefined),
    }));

    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request, {});
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
    expect(data.services.database.status).toBe('down');
    expect(data.services.database.error).toBe('Database connection failed');
  });

  it('should return unhealthy status when Redis is down', async () => {
    // Mock successful database check
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);
    
    // Mock Redis failure
    const Redis = require('ioredis');
    Redis.mockImplementation(() => ({
      ping: jest.fn().mockRejectedValue(new Error('Redis connection failed')),
      quit: jest.fn().mockResolvedValue(undefined),
    }));

    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request, {});
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
    expect(data.services.redis.status).toBe('down');
    expect(data.services.redis.error).toBe('Redis connection failed');
  });
});