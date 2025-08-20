import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiHandler, validateRequest, parseRequestBody, createSuccessResponse, ApiError } from '@/lib/api/handler';
import prisma from '@/lib/prisma';

const updateLeagueSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  settings: z.record(z.any()).optional(),
  isActive: z.boolean().optional()
});

interface RouteParams {
  params: Promise<{ leagueId: string }>;
}

// GET /api/leagues/[leagueId] - Get a specific league
export const GET = createApiHandler(async (request: NextRequest, { params }: RouteParams) => {
  const { leagueId } = await params;
  
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
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
      teams: {
        orderBy: {
          standing: 'asc'
        }
      },
      _count: {
        select: {
          players: true,
          matchups: true
        }
      }
    }
  });
  
  if (!league) {
    throw new ApiError('League not found', 404);
  }
  
  return createSuccessResponse(league);
});

// PUT /api/leagues/[leagueId] - Update a league
export const PUT = createApiHandler(async (request: NextRequest, { params }: RouteParams) => {
  const { leagueId } = await params;
  const body = await parseRequestBody(request);
  const data = validateRequest(updateLeagueSchema, body);
  
  // Check if league exists
  const existingLeague = await prisma.league.findUnique({
    where: { id: leagueId }
  });
  
  if (!existingLeague) {
    throw new ApiError('League not found', 404);
  }
  
  // Update the league
  const league = await prisma.league.update({
    where: { id: leagueId },
    data: {
      ...data,
      updatedAt: new Date()
    }
  });
  
  return createSuccessResponse(league);
});

// DELETE /api/leagues/[leagueId] - Delete a league
export const DELETE = createApiHandler(async (request: NextRequest, { params }: RouteParams) => {
  const { leagueId } = await params;
  
  // Check if league exists
  const existingLeague = await prisma.league.findUnique({
    where: { id: leagueId }
  });
  
  if (!existingLeague) {
    throw new ApiError('League not found', 404);
  }
  
  // Delete the league (cascades to related data)
  await prisma.league.delete({
    where: { id: leagueId }
  });
  
  return createSuccessResponse({ success: true });
});