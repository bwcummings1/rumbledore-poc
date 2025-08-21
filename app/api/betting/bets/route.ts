/**
 * Bet Placement API Endpoints
 * 
 * POST /api/betting/bets - Place a bet
 * GET /api/betting/bets - Get user's bets
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, BetType, MarketType } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { BankrollManager } from '@/lib/betting/bankroll-manager';
import { BetValidator } from '@/lib/betting/bet-validator';
import { BetPlacementEngine } from '@/lib/betting/bet-placement';
import { OddsApiClient } from '@/lib/betting/odds-client';
import { z } from 'zod';

const prisma = new PrismaClient();

/**
 * Place a bet
 */
export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const betSchema = z.object({
      leagueId: z.string().uuid(),
      leagueSandbox: z.string(),
      gameId: z.string(),
      eventDate: z.string().transform(str => new Date(str)),
      betType: z.enum(['STRAIGHT', 'PARLAY']),
      marketType: z.enum(['H2H', 'SPREADS', 'TOTALS']),
      selection: z.string(),
      line: z.number().optional(),
      odds: z.number(),
      stake: z.number().min(1).max(500),
    });

    const body = await request.json();
    const validation = betSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid bet data', details: validation.error },
        { status: 400 }
      );
    }

    const betRequest = {
      ...validation.data,
      userId: session.user.id,
    };

    // Verify user is member of league
    const membership = await prisma.leagueMember.findFirst({
      where: {
        userId: session.user.id,
        leagueId: betRequest.leagueId,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this league' },
        { status: 403 }
      );
    }

    // Initialize services
    const bankrollManager = new BankrollManager(prisma);
    const oddsClient = new OddsApiClient();
    const betValidator = new BetValidator(prisma, oddsClient);
    const betPlacementEngine = new BetPlacementEngine(
      prisma,
      bankrollManager,
      betValidator
    );

    // Place the bet
    const result = await betPlacementEngine.placeSingleBet(betRequest);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to place bet' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      bet: result.bet,
      transactionId: result.transactionId,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error placing bet:', error);
    return NextResponse.json(
      { error: 'Failed to place bet' },
      { status: 500 }
    );
  }
}

/**
 * Get user's bets
 */
export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId');
    const status = searchParams.get('status'); // 'active' or 'history'
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'League ID is required' },
        { status: 400 }
      );
    }

    const bankrollManager = new BankrollManager(prisma);
    const oddsClient = new OddsApiClient();
    const betValidator = new BetValidator(prisma, oddsClient);
    const betPlacementEngine = new BetPlacementEngine(
      prisma,
      bankrollManager,
      betValidator
    );

    let bets;
    if (status === 'active') {
      bets = await betPlacementEngine.getActiveBets(session.user.id, leagueId);
    } else {
      bets = await betPlacementEngine.getBetHistory(
        session.user.id,
        leagueId,
        limit,
        offset
      );
    }

    return NextResponse.json(bets);
  } catch (error: any) {
    console.error('Error fetching bets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bets' },
      { status: 500 }
    );
  }
}