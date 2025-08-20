import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiHandler, validateRequest, parseRequestBody, createSuccessResponse, ApiError } from '@/lib/api/handler';
import prisma from '@/lib/prisma';

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
  espnTeamId: z.number().optional(),
  teamName: z.string().optional()
});

interface RouteParams {
  params: Promise<{ leagueId: string }>;
}

// GET /api/leagues/[leagueId]/members - List league members
export const GET = createApiHandler(async (request: NextRequest, { params }: RouteParams) => {
  const { leagueId } = await params;
  
  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true
        }
      }
    },
    orderBy: {
      joinedAt: 'asc'
    }
  });
  
  return createSuccessResponse(members);
});

// POST /api/leagues/[leagueId]/members - Add a member to the league
export const POST = createApiHandler(async (request: NextRequest, { params }: RouteParams) => {
  const { leagueId } = await params;
  const body = await parseRequestBody(request);
  const { userId, role, espnTeamId, teamName } = validateRequest(addMemberSchema, body);
  
  // Check if league exists
  const league = await prisma.league.findUnique({
    where: { id: leagueId }
  });
  
  if (!league) {
    throw new ApiError('League not found', 404);
  }
  
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  
  // Check if user is already a member
  const existingMember = await prisma.leagueMember.findFirst({
    where: {
      leagueId,
      userId
    }
  });
  
  if (existingMember) {
    throw new ApiError('User is already a member of this league', 409);
  }
  
  // Add the member
  const member = await prisma.leagueMember.create({
    data: {
      leagueId,
      userId,
      role,
      espnTeamId,
      teamName
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true
        }
      }
    }
  });
  
  return createSuccessResponse(member, 201);
});