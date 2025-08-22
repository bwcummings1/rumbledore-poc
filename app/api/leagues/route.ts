import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiHandler, validateRequest, parseRequestBody, createSuccessResponse, ApiError } from '@/lib/api/handler';
import prisma from '@/lib/prisma';

const createLeagueSchema = z.object({
  espnLeagueId: z.number(),
  name: z.string().min(1).max(255),
  season: z.number().min(2020).max(2030)
});

// GET /api/leagues - List all leagues for the current user
export const GET = createApiHandler(async (request: NextRequest) => {
  // In production, get user from session
  const userId = request.headers.get('x-user-id'); // For development
  
  const leagues = await prisma.league.findMany({
    where: userId ? {
      members: {
        some: {
          userId
        }
      }
    } : undefined,
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true
            }
          }
        }
      },
      _count: {
        select: {
          players: true,
          teams: true
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });
  
  // Convert BigInt to number for JSON serialization
  const serializedLeagues = leagues.map(league => ({
    ...league,
    espnLeagueId: league.espnLeagueId ? Number(league.espnLeagueId) : null,
    _count: {
      players: Number(league._count.players),
      teams: Number(league._count.teams)
    }
  }));
  
  return createSuccessResponse(serializedLeagues);
});

// POST /api/leagues - Create a new league
export const POST = createApiHandler(async (request: NextRequest) => {
  const body = await parseRequestBody(request);
  const { espnLeagueId, name, season } = validateRequest(createLeagueSchema, body);
  
  // Check if league already exists
  const existingLeague = await prisma.league.findFirst({
    where: {
      espnLeagueId: BigInt(espnLeagueId),
      season
    }
  });
  
  if (existingLeague) {
    throw new ApiError('League already exists for this season', 409);
  }
  
  // Create sandboxed namespace
  const sandboxNamespace = `league_${espnLeagueId}_${season}`;
  
  // Create the league
  const league = await prisma.league.create({
    data: {
      espnLeagueId: BigInt(espnLeagueId),
      name,
      season,
      sandboxNamespace,
      settings: {
        scoringType: 'standard',
        teamCount: 12,
        playoffTeams: 6
      }
    }
  });
  
  return createSuccessResponse(league, 201);
});