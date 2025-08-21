/**
 * Competition API endpoints
 * 
 * GET /api/competitions - List competitions
 * POST /api/competitions - Create a new competition
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { CompetitionManager } from '@/lib/betting/competition-manager';
import { CompetitionConfig, CompetitionFilters } from '@/types/betting';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();
const competitionManager = new CompetitionManager(prisma);

/**
 * List competitions with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Build filters from query params
    const filters: CompetitionFilters = {};
    
    const status = searchParams.get('status');
    if (status) {
      filters.status = status.split(',') as any;
    }
    
    const type = searchParams.get('type');
    if (type) {
      filters.type = type.split(',') as any;
    }
    
    const scope = searchParams.get('scope');
    if (scope) {
      filters.scope = scope as any;
    }
    
    const leagueId = searchParams.get('leagueId');
    if (leagueId) {
      filters.leagueId = leagueId;
    }
    
    const userId = searchParams.get('userId');
    if (userId) {
      filters.userId = userId;
    }

    const competitions = await competitionManager.listCompetitions(filters);

    return NextResponse.json({
      success: true,
      data: competitions,
      count: competitions.length,
    });
  } catch (error: any) {
    console.error('Error listing competitions:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to list competitions',
      },
      { status: 500 }
    );
  }
}

/**
 * Create a new competition
 */
export async function POST(request: NextRequest) {
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
    
    // Validate required fields
    if (!body.name || !body.type || !body.scope || !body.startDate || !body.endDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
        },
        { status: 400 }
      );
    }

    // Validate dates
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid date format',
        },
        { status: 400 }
      );
    }

    // Create competition config
    const config: CompetitionConfig = {
      name: body.name,
      description: body.description,
      type: body.type,
      scope: body.scope,
      leagueId: body.leagueId,
      leagueSandbox: body.leagueSandbox,
      startDate,
      endDate,
      week: body.week,
      season: body.season,
      entryFee: body.entryFee || 0,
      prizePool: body.prizePool || 0,
      maxEntrants: body.maxEntrants,
      minEntrants: body.minEntrants || 2,
      scoringRules: body.scoringRules || {
        profitWeight: 1.0,
        roiWeight: 0.5,
        winRateWeight: 0.3,
        activityBonus: 0.1,
        minBetsRequired: 3,
        tieBreaker: 'PROFIT',
      },
    };

    const competition = await competitionManager.createCompetition(
      config,
      user.id
    );

    return NextResponse.json({
      success: true,
      data: competition,
    });
  } catch (error: any) {
    console.error('Error creating competition:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create competition',
      },
      { status: 500 }
    );
  }
}