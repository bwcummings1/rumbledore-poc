/**
 * Competition settlement endpoint
 * 
 * POST /api/competitions/[competitionId]/settle - Settle competition and distribute rewards
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { CompetitionManager } from '@/lib/betting/competition-manager';
import { LeaderboardService } from '@/lib/betting/leaderboard-service';
import { RewardDistributor } from '@/lib/betting/reward-distributor';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();
const competitionManager = new CompetitionManager(prisma);
const leaderboardService = new LeaderboardService(prisma);
const rewardDistributor = new RewardDistributor(prisma);

interface RouteParams {
  params: {
    competitionId: string;
  };
}

/**
 * Settle competition and distribute rewards
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

    // Get competition
    const competition = await prisma.competition.findUnique({
      where: { id: params.competitionId },
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

    // Check if competition can be settled
    if (competition.status !== 'ACTIVE' && competition.status !== 'SETTLING') {
      return NextResponse.json(
        {
          success: false,
          error: 'Competition must be active or settling to settle',
        },
        { status: 400 }
      );
    }

    // Check if competition period has ended
    const now = new Date();
    if (now < competition.endDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'Competition has not ended yet',
        },
        { status: 400 }
      );
    }

    // Update status to SETTLING
    if (competition.status === 'ACTIVE') {
      await competitionManager.updateCompetitionStatus(
        params.competitionId,
        'SETTLING'
      );
    }

    // Calculate final leaderboard
    const leaderboard = await leaderboardService.updateLeaderboard(
      params.competitionId
    );

    // Distribute rewards
    const rewards = await rewardDistributor.distributeRewards(
      params.competitionId,
      leaderboard.standings
    );

    return NextResponse.json({
      success: true,
      data: {
        competition: {
          id: params.competitionId,
          status: 'COMPLETED',
        },
        leaderboard: leaderboard.standings.slice(0, 10), // Top 10
        rewards,
      },
      message: 'Competition settled successfully',
    });
  } catch (error: any) {
    console.error('Error settling competition:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to settle competition',
      },
      { status: 500 }
    );
  }
}