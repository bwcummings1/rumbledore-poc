import { NextRequest } from 'next/server';
import { createApiHandler, createSuccessResponse, ApiError } from '@/lib/api/handler';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ leagueId: string }>;
}

// POST /api/leagues/[leagueId]/sync - Trigger ESPN data sync
export const POST = createApiHandler(async (request: NextRequest, { params }: RouteParams) => {
  const { leagueId } = await params;
  
  // Check if league exists
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      credentials: {
        where: {
          isValid: true
        }
      }
    }
  });
  
  if (!league) {
    throw new ApiError('League not found', 404);
  }
  
  if (!league.credentials.length) {
    throw new ApiError('No valid ESPN credentials found for this league', 400);
  }
  
  // In Sprint 3, this will trigger the actual ESPN sync
  // For now, we'll just update the last sync timestamp
  await prisma.league.update({
    where: { id: leagueId },
    data: {
      lastSyncAt: new Date()
    }
  });
  
  return createSuccessResponse({
    success: true,
    message: 'Sync initiated',
    leagueId,
    timestamp: new Date().toISOString()
  });
});