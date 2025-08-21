/**
 * Bankroll Management API Endpoints
 * 
 * GET /api/betting/bankroll - Get current bankroll
 * POST /api/betting/bankroll/initialize - Initialize weekly bankroll
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { BankrollManager } from '@/lib/betting/bankroll-manager';
import { z } from 'zod';

const prisma = new PrismaClient();
const bankrollManager = new BankrollManager(prisma);

/**
 * Get current user's bankroll for a league
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
    const week = searchParams.get('week');
    const season = searchParams.get('season');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'League ID is required' },
        { status: 400 }
      );
    }

    // Get bankroll
    const bankroll = await bankrollManager.getBankroll(
      session.user.id,
      leagueId,
      week ? parseInt(week) : undefined,
      season ? parseInt(season) : undefined
    );

    if (!bankroll) {
      return NextResponse.json(
        { error: 'Bankroll not found. Initialize first.' },
        { status: 404 }
      );
    }

    return NextResponse.json(bankroll);
  } catch (error: any) {
    console.error('Error fetching bankroll:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bankroll' },
      { status: 500 }
    );
  }
}

/**
 * Initialize weekly bankroll
 */
export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const schema = z.object({
      leagueId: z.string().uuid(),
      leagueSandbox: z.string(),
      week: z.number().optional(),
      season: z.number().optional(),
    });

    const body = await request.json();
    const validation = schema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error },
        { status: 400 }
      );
    }

    const { leagueId, leagueSandbox, week, season } = validation.data;

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

    // Initialize bankroll
    const bankroll = await bankrollManager.initializeWeeklyBankroll(
      session.user.id,
      leagueId,
      leagueSandbox,
      week,
      season
    );

    return NextResponse.json(bankroll, { status: 201 });
  } catch (error: any) {
    console.error('Error initializing bankroll:', error);
    return NextResponse.json(
      { error: 'Failed to initialize bankroll' },
      { status: 500 }
    );
  }
}