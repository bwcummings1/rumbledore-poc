/**
 * NFL Odds API Endpoint
 * GET /api/odds/nfl - Get current NFL odds
 */

import { NextRequest, NextResponse } from 'next/server';
import { OddsApiClient } from '@/lib/betting/odds-client';
import { OddsTransformer } from '@/lib/betting/odds-transformer';
import { MarketType } from '@prisma/client';
import { 
  OddsApiEndpointResponse, 
  GameOdds,
  BettingError,
  BettingErrorCode 
} from '@/types/betting';

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const marketsParam = searchParams.get('markets');
    const cacheOnly = searchParams.get('cacheOnly') === 'true';
    
    // Parse markets
    let markets: MarketType[] = [MarketType.H2H, MarketType.SPREADS, MarketType.TOTALS];
    if (marketsParam) {
      const requestedMarkets = marketsParam.split(',');
      markets = requestedMarkets
        .map(m => m.toUpperCase() as MarketType)
        .filter(m => Object.values(MarketType).includes(m));
    }

    // Initialize client
    const client = new OddsApiClient();
    const transformer = new OddsTransformer();

    // Get odds
    let odds: GameOdds[];
    let cached = false;

    if (cacheOnly) {
      // Try to get from cache only
      const historical = await client.getHistoricalOdds('');
      if (historical.length === 0) {
        return NextResponse.json<OddsApiEndpointResponse>({
          success: false,
          error: 'No cached data available',
          timestamp: new Date()
        }, { status: 404 });
      }
      
      // Transform historical to GameOdds
      odds = await transformer.databaseToGameOdds([]);
      cached = true;
    } else {
      // Fetch fresh odds
      odds = await client.getNFLOdds(markets);
      
      // Store in database
      const { bettingLines, movements } = await transformer.apiToDatabase(odds as any);
      await transformer.storeBettingLines(bettingLines);
      await transformer.storeMovements(movements);
    }

    // Get rate limit info
    const rateLimit = client.getRateLimit();

    // Return response
    const response: OddsApiEndpointResponse<GameOdds[]> = {
      success: true,
      data: odds,
      cached,
      timestamp: new Date(),
      rateLimit: {
        remaining: rateLimit.remaining,
        reset: rateLimit.reset
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching NFL odds:', error);

    if (error instanceof BettingError) {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: error.message,
        timestamp: new Date()
      }, { status: error.statusCode || 500 });
    }

    return NextResponse.json<OddsApiEndpointResponse>({
      success: false,
      error: 'Failed to fetch NFL odds',
      timestamp: new Date()
    }, { status: 500 });
  }
}