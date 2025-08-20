/**
 * Historical Odds API Endpoint
 * GET /api/odds/history - Get historical odds data
 */

import { NextRequest, NextResponse } from 'next/server';
import { HistoricalOddsService } from '@/lib/betting/historical-service';
import { 
  OddsApiEndpointResponse,
  HistoricalOddsRequest,
  BettingError 
} from '@/types/betting';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse parameters
    const gameId = searchParams.get('gameId');
    const sport = searchParams.get('sport') || 'NFL';
    const dateFromParam = searchParams.get('dateFrom');
    const dateToParam = searchParams.get('dateTo');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate date parameters
    if (!dateFromParam || !dateToParam) {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: 'dateFrom and dateTo parameters are required',
        timestamp: new Date()
      }, { status: 400 });
    }

    const dateFrom = new Date(dateFromParam);
    const dateTo = new Date(dateToParam);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: 'Invalid date format',
        timestamp: new Date()
      }, { status: 400 });
    }

    // Initialize service
    const historicalService = new HistoricalOddsService();

    // Get historical data
    const request: HistoricalOddsRequest = {
      gameId: gameId || undefined,
      sport,
      dateFrom,
      dateTo,
      limit,
      offset
    };

    const result = await historicalService.getHistoricalOdds(request);

    // Return response
    const response: OddsApiEndpointResponse = {
      success: true,
      data: result,
      timestamp: new Date()
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching historical odds:', error);

    if (error instanceof BettingError) {
      return NextResponse.json<OddsApiEndpointResponse>({
        success: false,
        error: error.message,
        timestamp: new Date()
      }, { status: error.statusCode || 500 });
    }

    return NextResponse.json<OddsApiEndpointResponse>({
      success: false,
      error: 'Failed to fetch historical odds',
      timestamp: new Date()
    }, { status: 500 });
  }
}