/**
 * Parlay Bet API Endpoint
 * 
 * POST /api/betting/bets/parlay - Place a parlay bet
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { BankrollManager } from '@/lib/betting/bankroll-manager';
import { BetValidator } from '@/lib/betting/bet-validator';
import { BetPlacementEngine } from '@/lib/betting/bet-placement';
import { OddsApiClient } from '@/lib/betting/odds-client';
import { z } from 'zod';

const prisma = new PrismaClient();

/**
 * Place a parlay bet
 */
export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const parlaySchema = z.object({
      leagueId: z.string().uuid(),
      leagueSandbox: z.string(),
      stake: z.number().min(1).max(500),
      selections: z.array(z.object({
        gameId: z.string(),
        eventDate: z.string().transform(str => new Date(str)),
        marketType: z.enum(['H2H', 'SPREADS', 'TOTALS']),
        selection: z.string(),
        line: z.number().optional(),
        odds: z.number(),
      })).min(2).max(10), // 2-10 legs allowed
    });

    const body = await request.json();
    const validation = parlaySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid parlay data', details: validation.error },
        { status: 400 }
      );
    }

    const { leagueId, leagueSandbox, stake, selections } = validation.data;

    // Verify user is member of league
    const membership = await prisma.leagueMember.findFirst({
      where: {
        userId: session.user.id,
        leagueId,
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

    // Place the parlay
    const result = await betPlacementEngine.placeParlayBet(
      session.user.id,
      leagueId,
      leagueSandbox,
      selections,
      stake
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to place parlay' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      betSlip: result.betSlip,
      transactionId: result.transactionId,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error placing parlay:', error);
    return NextResponse.json(
      { error: 'Failed to place parlay bet' },
      { status: 500 }
    );
  }
}