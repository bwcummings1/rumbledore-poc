/**
 * Main Odds API Endpoint
 * GET /api/odds - Get comprehensive odds data
 */

import { NextRequest, NextResponse } from 'next/server';
import { OddsApiClient } from '@/lib/betting/odds-client';
import { HistoricalOddsService } from '@/lib/betting/historical-service';
import { MovementTracker } from '@/lib/betting/movement-tracker';
import { OddsTransformer } from '@/lib/betting/odds-transformer';
import { prisma } from '@/lib/prisma';
import { 
  OddsApiEndpointResponse,
  BettingError 
} from '@/types/betting';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sport = searchParams.get('sport') || 'NFL';
    const includeMovements = searchParams.get('includeMovements') === 'true';
    const includeHistorical = searchParams.get('includeHistorical') === 'true';
    const gameId = searchParams.get('gameId');

    // Initialize services
    const client = new OddsApiClient();
    const historicalService = new HistoricalOddsService();
    const movementTracker = new MovementTracker();
    const transformer = new OddsTransformer();

    let responseData: any = {};

    if (gameId) {
      // Get specific game data
      const [currentLines, movements, history] = await Promise.all([
        prisma.bettingLine.findMany({
          where: { gameId },
          orderBy: { lastUpdate: 'desc' }
        }),
        includeMovements ? movementTracker.getMovementHistory(gameId) : null,
        includeHistorical ? historicalService.getGameHistory(gameId) : null
      ]);

      // Get game odds
      const snapshots = history ? history.snapshots : [];
      const gameOdds = await transformer.databaseToGameOdds(currentLines, snapshots);

      responseData = {
        game: gameOdds[0] || null,
        currentLines,
        movements: includeMovements ? movements : undefined,
        history: includeHistorical ? history : undefined
      };
    } else {
      // Get all current odds
      const odds = await client.getNFLOdds();
      
      // Get significant movements if requested
      let significantMovements = null;
      if (includeMovements) {
        significantMovements = await historicalService.findSignificantMovements();
      }

      // Get storage stats
      const stats = await historicalService.getStorageStats();

      responseData = {
        odds,
        significantMovements,
        stats,
        rateLimit: client.getRateLimit()
      };
    }

    const response: OddsApiEndpointResponse = {
      success: true,
      data: responseData,
      timestamp: new Date()
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching odds data:', error);

    if (error instanceof BettingError) {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: error.message,
        timestamp: new Date()
      }, { status: error.statusCode || 500 });
    }

    return NextResponse.json<OddsApiEndpointResponse>({
      success: false,
      error: 'Failed to fetch odds data',
      timestamp: new Date()
    }, { status: 500 });
  }
}