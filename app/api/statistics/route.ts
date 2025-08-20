// Statistics API Routes
// Sprint 6: Statistics Engine

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { StatisticsEngine } from '@/lib/stats/statistics-engine';
import { z } from 'zod';
import Redis from 'ioredis';
import { 
  StatisticsApiResponse,
  CalculationType,
  StatisticsQuery,
  BulkStatisticsResponse 
} from '@/types/statistics';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const statsEngine = new StatisticsEngine();

// Query schema for GET requests
const QuerySchema = z.object({
  leagueId: z.string().uuid(),
  type: z.enum(['season', 'alltime', 'h2h', 'trends', 'championships', 'bulk']),
  seasonId: z.string().optional(),
  teamId: z.string().optional(),
  playerId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(0).default(0),
  orderBy: z.string().optional(),
  orderDirection: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Calculation schema for POST requests
const CalculateSchema = z.object({
  leagueId: z.string().uuid(),
  calculationType: z.nativeEnum(CalculationType),
  seasonId: z.string().optional(),
  forceRecalculate: z.boolean().default(false),
  priority: z.number().min(1).max(10).optional(),
});

// GET /api/statistics - Query statistics
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  
  try {
    // Parse and validate query parameters
    const query = QuerySchema.parse({
      leagueId: searchParams.get('leagueId'),
      type: searchParams.get('type'),
      seasonId: searchParams.get('seasonId') || undefined,
      teamId: searchParams.get('teamId') || undefined,
      playerId: searchParams.get('playerId') || undefined,
      limit: searchParams.get('limit') || 10,
      offset: searchParams.get('offset') || 0,
      orderBy: searchParams.get('orderBy') || undefined,
      orderDirection: searchParams.get('orderDirection') || 'desc',
    });

    // Check cache first
    const cacheKey = `stats:${query.leagueId}:${query.type}${query.seasonId ? `:${query.seasonId}` : ''}${query.teamId ? `:${query.teamId}` : ''}`;
    const cached = await redis.get(cacheKey);
    
    if (cached && !searchParams.get('noCache')) {
      return NextResponse.json<StatisticsApiResponse>({
        success: true,
        data: JSON.parse(cached),
        metadata: {
          cached: true,
          executionTime: Date.now() - startTime,
        },
      });
    }

    let data: any;

    switch (query.type) {
      case 'season':
        data = await getSeasonStats(query);
        break;
      case 'alltime':
        data = await getAllTimeRecords(query);
        break;
      case 'h2h':
        data = await getHeadToHead(query);
        break;
      case 'trends':
        data = await getTrends(query);
        break;
      case 'championships':
        data = await getChampionships(query);
        break;
      case 'bulk':
        data = await getBulkStatistics(query);
        break;
      default:
        throw new Error(`Invalid statistics type: ${query.type}`);
    }

    // Cache the results
    if (data && !searchParams.get('noCache')) {
      await redis.setex(cacheKey, 300, JSON.stringify(data)); // 5 minutes TTL
    }

    return NextResponse.json<StatisticsApiResponse>({
      success: true,
      data,
      metadata: {
        cached: false,
        executionTime: Date.now() - startTime,
        totalCount: Array.isArray(data) ? data.length : undefined,
      },
    });
  } catch (error) {
    console.error('[Statistics API] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json<StatisticsApiResponse>(
        {
          success: false,
          error: 'Invalid request parameters',
          metadata: {
            executionTime: Date.now() - startTime,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json<StatisticsApiResponse>(
      {
        success: false,
        error: 'Failed to fetch statistics',
        metadata: {
          executionTime: Date.now() - startTime,
        },
      },
      { status: 500 }
    );
  }
}

// POST /api/statistics - Trigger statistics calculation
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const data = CalculateSchema.parse(body);

    // Check if calculation is already in progress
    const existingJobs = await statsEngine.getProgress(data.leagueId);
    if (existingJobs && !data.forceRecalculate) {
      return NextResponse.json<StatisticsApiResponse>({
        success: false,
        error: 'Calculation already in progress',
        data: { jobId: existingJobs.id },
        metadata: {
          executionTime: Date.now() - startTime,
        },
      }, { status: 409 });
    }

    // Queue the calculation
    const jobId = await statsEngine.queueCalculation(data);

    return NextResponse.json<StatisticsApiResponse>({
      success: true,
      data: {
        jobId,
        message: 'Statistics calculation queued successfully',
      },
      metadata: {
        executionTime: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[Statistics API] Calculation error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json<StatisticsApiResponse>(
        {
          success: false,
          error: 'Invalid request body',
          metadata: {
            executionTime: Date.now() - startTime,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json<StatisticsApiResponse>(
      {
        success: false,
        error: 'Failed to queue calculation',
        metadata: {
          executionTime: Date.now() - startTime,
        },
      },
      { status: 500 }
    );
  }
}

// Helper functions for data fetching
async function getSeasonStats(query: StatisticsQuery) {
  const where: any = { leagueId: query.leagueId };
  if (query.seasonId) where.season = query.seasonId;
  if (query.teamId) where.teamId = query.teamId;

  const orderBy: any = {};
  if (query.orderBy) {
    orderBy[query.orderBy] = query.orderDirection || 'desc';
  } else {
    orderBy.wins = 'desc';
  }

  return await prisma.seasonStatistics.findMany({
    where,
    orderBy,
    take: query.limit,
    skip: query.offset,
  });
}

async function getAllTimeRecords(query: StatisticsQuery) {
  const where: any = { leagueId: query.leagueId };
  
  return await prisma.allTimeRecord.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: query.limit,
    skip: query.offset,
  });
}

async function getHeadToHead(query: StatisticsQuery) {
  const where: any = { leagueId: query.leagueId };
  
  if (query.teamId) {
    // Get H2H records for a specific team
    where.OR = [
      { team1Id: query.teamId },
      { team2Id: query.teamId },
    ];
  }

  return await prisma.headToHeadRecord.findMany({
    where,
    orderBy: { totalMatchups: 'desc' },
    take: query.limit,
    skip: query.offset,
  });
}

async function getTrends(query: StatisticsQuery) {
  const where: any = { leagueId: query.leagueId };
  
  if (query.teamId) {
    where.entityId = query.teamId;
    where.entityType = 'TEAM';
  } else if (query.playerId) {
    where.entityId = query.playerId;
    where.entityType = 'PLAYER';
  }

  return await prisma.performanceTrend.findMany({
    where,
    orderBy: { calculatedAt: 'desc' },
    take: query.limit,
    skip: query.offset,
  });
}

async function getChampionships(query: StatisticsQuery) {
  const where: any = { leagueId: query.leagueId };
  if (query.seasonId) where.season = query.seasonId;

  return await prisma.championshipRecord.findMany({
    where,
    orderBy: { season: 'desc' },
    take: query.limit,
    skip: query.offset,
  });
}

async function getBulkStatistics(query: StatisticsQuery): Promise<BulkStatisticsResponse> {
  const [
    seasonStats,
    allTimeRecords,
    headToHeadRecords,
    performanceTrends,
    championshipRecords,
  ] = await Promise.all([
    prisma.seasonStatistics.findMany({
      where: { 
        leagueId: query.leagueId,
        ...(query.seasonId && { season: query.seasonId }),
      },
      orderBy: { wins: 'desc' },
      take: 20,
    }),
    prisma.allTimeRecord.findMany({
      where: { leagueId: query.leagueId },
      take: 20,
    }),
    prisma.headToHeadRecord.findMany({
      where: { leagueId: query.leagueId },
      orderBy: { totalMatchups: 'desc' },
      take: 10,
    }),
    prisma.performanceTrend.findMany({
      where: { leagueId: query.leagueId },
      orderBy: { calculatedAt: 'desc' },
      take: 10,
    }),
    prisma.championshipRecord.findMany({
      where: { leagueId: query.leagueId },
      orderBy: { season: 'desc' },
      take: 10,
    }),
  ]);

  return {
    seasonStats,
    allTimeRecords,
    headToHeadRecords,
    performanceTrends,
    championshipRecords,
  };
}