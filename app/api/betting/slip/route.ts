/**
 * Bet Slip Management API Endpoints
 * 
 * GET /api/betting/slip - Get current bet slip
 * POST /api/betting/slip - Add selection to bet slip
 * DELETE /api/betting/slip - Clear bet slip
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
 * Get current bet slip
 */
export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Get bet slip
    const betSlip = await betPlacementEngine.getBetSlip(session.user.id);

    // Calculate potential payouts
    const { searchParams } = new URL(request.url);
    const stake = parseFloat(searchParams.get('stake') || '10');
    const type = searchParams.get('type') as 'single' | 'parlay' || 'parlay';

    const potentialPayout = betPlacementEngine.calculateBetSlipPayout(
      betSlip,
      stake,
      type
    );

    return NextResponse.json({
      selections: betSlip,
      potentialPayout,
      stake,
      type,
    });
  } catch (error: any) {
    console.error('Error fetching bet slip:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bet slip' },
      { status: 500 }
    );
  }
}

/**
 * Add selection to bet slip
 */
export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const selectionSchema = z.object({
      gameId: z.string(),
      eventDate: z.string().transform(str => new Date(str)),
      marketType: z.string(),
      selection: z.string(),
      line: z.number().optional(),
      odds: z.number(),
    });

    const body = await request.json();
    const validation = selectionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid selection data', details: validation.error },
        { status: 400 }
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

    // Add to bet slip
    await betPlacementEngine.addToBetSlip(session.user.id, validation.data);

    // Get updated bet slip
    const betSlip = await betPlacementEngine.getBetSlip(session.user.id);

    return NextResponse.json({
      success: true,
      selections: betSlip,
    });
  } catch (error: any) {
    console.error('Error adding to bet slip:', error);
    return NextResponse.json(
      { error: 'Failed to add selection to bet slip' },
      { status: 500 }
    );
  }
}

/**
 * Clear bet slip or remove specific selection
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Check for specific selection removal
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');
    const marketType = searchParams.get('marketType');

    if (gameId && marketType) {
      // Remove specific selection
      await betPlacementEngine.removeFromBetSlip(
        session.user.id,
        gameId,
        marketType
      );
    } else {
      // Clear entire bet slip
      await betPlacementEngine.clearBetSlip(session.user.id);
    }

    // Get updated bet slip
    const betSlip = await betPlacementEngine.getBetSlip(session.user.id);

    return NextResponse.json({
      success: true,
      selections: betSlip,
    });
  } catch (error: any) {
    console.error('Error clearing bet slip:', error);
    return NextResponse.json(
      { error: 'Failed to clear bet slip' },
      { status: 500 }
    );
  }
}