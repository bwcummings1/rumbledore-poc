/**
 * Odds Movement API Endpoint
 * GET /api/odds/movement - Get line movement data
 * POST /api/odds/movement - Start tracking movement for a game
 */

import { NextRequest, NextResponse } from 'next/server';
import { MovementTracker } from '@/lib/betting/movement-tracker';
import { HistoricalOddsService } from '@/lib/betting/historical-service';
import { MarketType } from '@prisma/client';
import { 
  OddsApiEndpointResponse,
  MovementAnalysisRequest,
  BettingError 
} from '@/types/betting';

// Global movement tracker instance
let movementTracker: MovementTracker | null = null;

function getMovementTracker(): MovementTracker {
  if (!movementTracker) {
    movementTracker = new MovementTracker();
  }
  return movementTracker;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const gameId = searchParams.get('gameId');
    const marketType = searchParams.get('marketType');
    const bookmaker = searchParams.get('bookmaker');

    if (!gameId) {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: 'gameId parameter is required',
        timestamp: new Date()
      }, { status: 400 });
    }

    // Initialize services
    const tracker = getMovementTracker();
    const historicalService = new HistoricalOddsService();

    // Get movement history
    const movements = await tracker.getMovementHistory(
      gameId,
      marketType ? (marketType.toUpperCase() as MarketType) : undefined
    );

    // Get line movement details
    const lineMovements = await historicalService.getLineMovementHistory(
      gameId,
      marketType ? (marketType.toUpperCase() as MarketType) : undefined,
      bookmaker || undefined
    );

    // Get opening and closing lines
    const [openingLines, closingLines] = await Promise.all([
      historicalService.getOpeningLines(gameId),
      historicalService.getClosingLines(gameId)
    ]);

    // Check for sharp action
    const sharpAction = await tracker.findSharpAction(gameId);

    const response: OddsApiEndpointResponse = {
      success: true,
      data: {
        gameId,
        movements,
        lineMovements,
        openingLines,
        closingLines,
        sharpAction
      },
      timestamp: new Date()
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching movement data:', error);

    if (error instanceof BettingError) {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: error.message,
        timestamp: new Date()
      }, { status: error.statusCode || 500 });
    }

    return NextResponse.json<OddsApiEndpointResponse>({
      success: false,
      error: 'Failed to fetch movement data',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, action, interval } = body;

    if (!gameId) {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: 'gameId is required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const tracker = getMovementTracker();

    if (action === 'start') {
      // Start tracking
      await tracker.startTracking(gameId, interval || 60000);
      
      return NextResponse.json<OddsApiEndpointResponse>({
        success: true,
        data: {
          message: `Started tracking movement for game ${gameId}`,
          interval: interval || 60000
        },
        timestamp: new Date()
      });
    } else if (action === 'stop') {
      // Stop tracking
      tracker.stopTracking(gameId);
      
      return NextResponse.json<OddsApiEndpointResponse>({
        success: true,
        data: {
          message: `Stopped tracking movement for game ${gameId}`
        },
        timestamp: new Date()
      });
    } else if (action === 'check') {
      // Check for movements now
      const alerts = await tracker.checkMovement(gameId);
      
      return NextResponse.json<OddsApiEndpointResponse>({
        success: true,
        data: {
          gameId,
          alerts,
          checked: new Date()
        },
        timestamp: new Date()
      });
    } else {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: 'Invalid action. Use "start", "stop", or "check"',
        timestamp: new Date()
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error managing movement tracking:', error);

    if (error instanceof BettingError) {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: error.message,
        timestamp: new Date()
      }, { status: error.statusCode || 500 });
    }

    return NextResponse.json<OddsApiEndpointResponse>({
      success: false,
      error: 'Failed to manage movement tracking',
      timestamp: new Date()
    }, { status: 500 });
  }
}