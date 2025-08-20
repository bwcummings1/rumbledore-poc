import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { syncManager } from '@/lib/sync/sync-manager';
import { prisma } from '@/lib/prisma';

// Request body schema
const syncRequestSchema = z.object({
  fullSync: z.boolean().optional().default(false),
  forceRefresh: z.boolean().optional().default(false),
  scoringPeriodId: z.number().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params;
    
    // TODO: Get actual user ID from session/auth
    // For now, using mock user ID
    const userId = 'mock-user-id';
    
    // Parse and validate request body
    const body = await request.json();
    const { fullSync, forceRefresh, scoringPeriodId } = syncRequestSchema.parse(body);
    
    // Verify league exists
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
    });
    
    if (!league) {
      return NextResponse.json(
        { error: 'League not found' },
        { status: 404 }
      );
    }
    
    // Verify user has access to league
    const member = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: { leagueId, userId },
      },
    });
    
    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized - You do not have access to this league' },
        { status: 403 }
      );
    }
    
    // Trigger sync
    const result = await syncManager.syncLeague(leagueId, userId, {
      fullSync,
      forceRefresh,
      scoringPeriodId,
    });
    
    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || 'Failed to start sync',
          jobId: result.jobId,
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      leagueId: result.leagueId,
      startTime: result.startTime,
      message: 'Sync started successfully',
    });
  } catch (error) {
    console.error('Sync API error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params;
    
    // Get sync status
    const status = await syncManager.getSyncStatus(leagueId);
    
    // Get league's last sync time
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        lastSyncAt: true,
        name: true,
      },
    });
    
    if (!league) {
      return NextResponse.json(
        { error: 'League not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      leagueId,
      leagueName: league.name,
      lastSyncAt: league.lastSyncAt,
      syncInProgress: status.inProgress,
      jobId: status.jobId,
      progress: status.progress,
    });
  } catch (error) {
    console.error('Sync status API error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params;
    
    // TODO: Get actual user ID from session/auth
    const userId = 'mock-user-id';
    
    // Verify user has access to league
    const member = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: { leagueId, userId },
      },
    });
    
    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized - You do not have access to this league' },
        { status: 403 }
      );
    }
    
    // Cancel sync
    const cancelled = await syncManager.cancelSync(leagueId);
    
    if (!cancelled) {
      return NextResponse.json(
        { error: 'No sync in progress for this league' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Sync cancelled successfully',
    });
  } catch (error) {
    console.error('Cancel sync API error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}