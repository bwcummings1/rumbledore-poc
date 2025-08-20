// Head-to-Head Statistics API
// Sprint 6: Statistics Engine

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import Redis from 'ioredis';
import { StatisticsApiResponse, HeadToHeadRecord } from '@/types/statistics';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const H2HQuerySchema = z.object({
  leagueId: z.string().uuid(),
  team1: z.string(),
  team2: z.string(),
  includeGames: z.coerce.boolean().default(false),
});

// GET /api/statistics/h2h - Get head-to-head comparison
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  
  try {
    const query = H2HQuerySchema.parse({
      leagueId: searchParams.get('leagueId'),
      team1: searchParams.get('team1'),
      team2: searchParams.get('team2'),
      includeGames: searchParams.get('includeGames') || false,
    });

    // Ensure team1 < team2 for consistent ordering
    const [sortedTeam1, sortedTeam2] = [query.team1, query.team2].sort();

    // Check cache
    const cacheKey = `stats:${query.leagueId}:h2h:${sortedTeam1}:${sortedTeam2}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return NextResponse.json<StatisticsApiResponse<HeadToHeadRecord>>({
        success: true,
        data: JSON.parse(cached),
        metadata: {
          cached: true,
          executionTime: Date.now() - startTime,
        },
      });
    }

    // Get H2H record
    const h2hRecord = await prisma.headToHeadRecord.findUnique({
      where: {
        leagueId_team1Id_team2Id: {
          leagueId: query.leagueId,
          team1Id: sortedTeam1,
          team2Id: sortedTeam2,
        },
      },
    });

    if (!h2hRecord) {
      // No H2H record found, create empty one
      const emptyRecord: Partial<HeadToHeadRecord> = {
        leagueId: query.leagueId,
        team1Id: sortedTeam1,
        team2Id: sortedTeam2,
        totalMatchups: 0,
        team1Wins: 0,
        team2Wins: 0,
        ties: 0,
        team1TotalPoints: 0,
        team2TotalPoints: 0,
        playoffMatchups: 0,
        championshipMatchups: 0,
      };

      return NextResponse.json<StatisticsApiResponse<Partial<HeadToHeadRecord>>>({
        success: true,
        data: emptyRecord,
        metadata: {
          cached: false,
          executionTime: Date.now() - startTime,
        },
      });
    }

    // Optionally include individual game details
    let gameDetails = null;
    if (query.includeGames) {
      gameDetails = await getH2HGames(query.leagueId, sortedTeam1, sortedTeam2);
    }

    const responseData = {
      ...h2hRecord,
      ...(gameDetails && { games: gameDetails }),
      // Calculate additional metrics
      team1WinPercentage: h2hRecord.totalMatchups > 0 
        ? (h2hRecord.team1Wins / h2hRecord.totalMatchups) * 100 
        : 0,
      team2WinPercentage: h2hRecord.totalMatchups > 0 
        ? (h2hRecord.team2Wins / h2hRecord.totalMatchups) * 100 
        : 0,
      team1AvgPoints: h2hRecord.totalMatchups > 0
        ? Number(h2hRecord.team1TotalPoints) / h2hRecord.totalMatchups
        : 0,
      team2AvgPoints: h2hRecord.totalMatchups > 0
        ? Number(h2hRecord.team2TotalPoints) / h2hRecord.totalMatchups
        : 0,
    };

    // Cache the result
    await redis.setex(cacheKey, 600, JSON.stringify(responseData)); // 10 minutes TTL

    return NextResponse.json<StatisticsApiResponse>({
      success: true,
      data: responseData,
      metadata: {
        cached: false,
        executionTime: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[H2H API] Error:', error);
    
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
        error: 'Failed to fetch head-to-head statistics',
        metadata: {
          executionTime: Date.now() - startTime,
        },
      },
      { status: 500 }
    );
  }
}

async function getH2HGames(leagueId: string, team1Id: string, team2Id: string) {
  // Get all games between these teams from weekly statistics
  const games = await prisma.weeklyStatistics.findMany({
    where: {
      leagueId,
      OR: [
        { teamId: team1Id, opponentId: team2Id },
        { teamId: team2Id, opponentId: team1Id },
      ],
    },
    orderBy: [{ season: 'desc' }, { week: 'desc' }],
  });

  // Process games to ensure each matchup appears only once
  const uniqueGames = new Map<string, any>();
  
  for (const game of games) {
    const gameKey = `${game.season}-${game.week}`;
    if (!uniqueGames.has(gameKey)) {
      uniqueGames.set(gameKey, {
        season: game.season,
        week: game.week,
        team1Score: game.teamId === team1Id ? game.pointsFor : game.pointsAgainst,
        team2Score: game.teamId === team2Id ? game.pointsFor : game.pointsAgainst,
        winner: game.result === 'WIN' 
          ? (game.teamId === team1Id ? team1Id : team2Id)
          : (game.result === 'LOSS' 
              ? (game.teamId === team1Id ? team2Id : team1Id)
              : null),
        isPlayoff: game.isPlayoff,
        isChampionship: game.isChampionship,
        date: game.createdAt,
      });
    }
  }

  return Array.from(uniqueGames.values());
}