/**
 * Competition leaderboard API endpoint
 * 
 * GET /api/competitions/[competitionId]/leaderboard - Get competition leaderboard
 * POST /api/competitions/[competitionId]/leaderboard - Update leaderboard (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { LeaderboardService } from '@/lib/betting/leaderboard-service';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();
const leaderboardService = new LeaderboardService(prisma);

interface RouteParams {
  params: {
    competitionId: string;
  };
}

/**
 * Get competition leaderboard
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const leaderboard = await leaderboardService.getLeaderboard(
      params.competitionId,
      limit,
      offset
    );
    
    if (!leaderboard) {
      // If no cached leaderboard, calculate it
      const competition = await prisma.competition.findUnique({
        where: { id: params.competitionId },
        include: {
          entries: true,
        },
      });
      
      if (!competition) {
        return NextResponse.json(
          {
            success: false,
            error: 'Competition not found',
          },
          { status: 404 }
        );
      }
      
      // If competition has entries but no leaderboard, calculate it
      if (competition.entries.length > 0) {
        const newLeaderboard = await leaderboardService.updateLeaderboard(
          params.competitionId
        );
        
        return NextResponse.json({
          success: true,
          data: newLeaderboard,
        });
      }
      
      // Return empty leaderboard
      return NextResponse.json({
        success: true,
        data: {
          competitionId: params.competitionId,
          standings: [],
          lastCalculated: new Date(),
          version: 1,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: leaderboard,
    });
  } catch (error: any) {
    console.error('Error getting leaderboard:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get leaderboard',
      },
      { status: 500 }
    );
  }
}

/**
 * Update/recalculate leaderboard (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Check for admin authentication
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    // TODO: Add proper admin role check
    // For now, just require authentication

    const leaderboard = await leaderboardService.updateLeaderboard(
      params.competitionId
    );

    return NextResponse.json({
      success: true,
      data: leaderboard,
      message: 'Leaderboard updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating leaderboard:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update leaderboard',
      },
      { status: 500 }
    );
  }
}