/**
 * Competition join endpoint
 * 
 * POST /api/competitions/[competitionId]/join - Join a competition
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { CompetitionManager } from '@/lib/betting/competition-manager';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();
const competitionManager = new CompetitionManager(prisma);

interface RouteParams {
  params: {
    competitionId: string;
  };
}

/**
 * Join a competition
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Get authenticated user
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

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
        },
        { status: 404 }
      );
    }

    const body = await request.json();
    const leagueId = body.leagueId; // Required for league-scoped competitions

    const entry = await competitionManager.joinCompetition(
      params.competitionId,
      user.id,
      leagueId
    );

    return NextResponse.json({
      success: true,
      data: entry,
      message: 'Successfully joined competition',
    });
  } catch (error: any) {
    console.error('Error joining competition:', error);
    
    // Handle specific error cases
    if (error.message.includes('Already entered')) {
      return NextResponse.json(
        {
          success: false,
          error: 'You have already entered this competition',
        },
        { status: 400 }
      );
    }
    
    if (error.message.includes('Insufficient')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient balance for entry fee',
        },
        { status: 400 }
      );
    }
    
    if (error.message.includes('full')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Competition is full',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to join competition',
      },
      { status: 500 }
    );
  }
}