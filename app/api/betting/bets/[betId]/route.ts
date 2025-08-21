/**
 * Individual Bet Management API Endpoints
 * 
 * GET /api/betting/bets/[betId] - Get bet details
 * DELETE /api/betting/bets/[betId] - Cancel a pending bet
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { BankrollManager } from '@/lib/betting/bankroll-manager';
import { BetValidator } from '@/lib/betting/bet-validator';
import { BetPlacementEngine } from '@/lib/betting/bet-placement';
import { OddsApiClient } from '@/lib/betting/odds-client';

const prisma = new PrismaClient();

/**
 * Get bet details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { betId: string } }
) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { betId } = params;

    // Get bet and verify ownership
    const bet = await prisma.bet.findFirst({
      where: {
        id: betId,
        userId: session.user.id,
      },
      include: {
        betSlip: {
          include: {
            bets: true,
          },
        },
      },
    });

    if (!bet) {
      return NextResponse.json(
        { error: 'Bet not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(bet);
  } catch (error: any) {
    console.error('Error fetching bet:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bet' },
      { status: 500 }
    );
  }
}

/**
 * Cancel a pending bet
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { betId: string } }
) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { betId } = params;

    // Initialize services
    const bankrollManager = new BankrollManager(prisma);
    const oddsClient = new OddsApiClient();
    const betValidator = new BetValidator(prisma, oddsClient);
    const betPlacementEngine = new BetPlacementEngine(
      prisma,
      bankrollManager,
      betValidator
    );

    // Cancel the bet
    const success = await betPlacementEngine.cancelBet(betId, session.user.id);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to cancel bet. It may have already started or been settled.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Bet cancelled successfully',
    });
  } catch (error: any) {
    console.error('Error cancelling bet:', error);
    return NextResponse.json(
      { error: 'Failed to cancel bet' },
      { status: 500 }
    );
  }
}