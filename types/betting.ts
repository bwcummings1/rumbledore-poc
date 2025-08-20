/**
 * TypeScript type definitions for the betting system
 * These types define the structure of data from The Odds API and our internal betting system
 */

import { MarketType, PropType } from '@prisma/client';

// =============================================================================
// THE ODDS API RESPONSE TYPES
// =============================================================================

/**
 * Main response from The Odds API for sports odds
 */
export interface OddsApiResponse {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

/**
 * Individual bookmaker odds
 */
export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

/**
 * Market data for different bet types
 */
export interface Market {
  key: 'h2h' | 'spreads' | 'totals';
  last_update?: string;
  outcomes: Outcome[];
}

/**
 * Betting outcome with odds
 */
export interface Outcome {
  name: string;
  price: number;
  point?: number; // For spreads and totals
}

/**
 * Player prop response from The Odds API
 */
export interface PlayerPropResponse {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: PlayerPropBookmaker[];
}

/**
 * Bookmaker with player prop markets
 */
export interface PlayerPropBookmaker {
  key: string;
  title: string;
  markets: PlayerPropMarket[];
}

/**
 * Player prop market
 */
export interface PlayerPropMarket {
  key: string;
  description: string;
  outcomes: PlayerPropOutcome[];
}

/**
 * Player prop outcome
 */
export interface PlayerPropOutcome {
  description: string;
  name: string;
  price: number;
  point?: number;
}

// =============================================================================
// INTERNAL BETTING TYPES
// =============================================================================

/**
 * Processed game odds for internal use
 */
export interface GameOdds {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  moneyline?: MoneylineOdds;
  spread?: SpreadOdds;
  total?: TotalOdds;
  bookmakers: ProcessedBookmaker[];
  lastUpdate: Date;
}

/**
 * Moneyline (head-to-head) odds
 */
export interface MoneylineOdds {
  home: OddsValue;
  away: OddsValue;
  bestHome?: BookmakerOdds;
  bestAway?: BookmakerOdds;
}

/**
 * Point spread odds
 */
export interface SpreadOdds {
  home: SpreadValue;
  away: SpreadValue;
  bestHome?: BookmakerSpread;
  bestAway?: BookmakerSpread;
}

/**
 * Total (over/under) odds
 */
export interface TotalOdds {
  line: number;
  over: OddsValue;
  under: OddsValue;
  bestOver?: BookmakerOdds;
  bestUnder?: BookmakerOdds;
}

/**
 * Individual odds value with implied probability
 */
export interface OddsValue {
  odds: number;
  impliedProbability: number;
}

/**
 * Spread value with line and odds
 */
export interface SpreadValue {
  line: number;
  odds: number;
  impliedProbability: number;
}

/**
 * Best odds from a specific bookmaker
 */
export interface BookmakerOdds {
  bookmaker: string;
  odds: number;
  impliedProbability: number;
}

/**
 * Best spread from a specific bookmaker
 */
export interface BookmakerSpread {
  bookmaker: string;
  line: number;
  odds: number;
  impliedProbability: number;
}

/**
 * Processed bookmaker data
 */
export interface ProcessedBookmaker {
  key: string;
  name: string;
  lastUpdate: Date;
  moneyline?: {
    home: number;
    away: number;
  };
  spread?: {
    home: { line: number; odds: number };
    away: { line: number; odds: number };
  };
  total?: {
    line: number;
    over: number;
    under: number;
  };
}

// =============================================================================
// ODDS MOVEMENT TYPES
// =============================================================================

/**
 * Line movement tracking
 */
export interface OddsMovement {
  gameId: string;
  bookmaker: string;
  marketType: MarketType;
  team?: string;
  opening: {
    line?: number;
    odds: number;
    timestamp: Date;
  };
  current: {
    line?: number;
    odds: number;
    timestamp: Date;
  };
  movements: MovementEntry[];
  totalMovement: {
    line?: number;
    odds: number;
  };
}

/**
 * Individual movement entry
 */
export interface MovementEntry {
  timestamp: Date;
  previousLine?: number;
  newLine?: number;
  previousOdds: number;
  newOdds: number;
  direction: 'up' | 'down' | 'unchanged';
}

/**
 * Movement summary for a game
 */
export interface GameMovementSummary {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  lineMovements: {
    spread: {
      home: number;
      away: number;
      direction: 'home' | 'away' | 'unchanged';
    };
    total: {
      movement: number;
      direction: 'over' | 'under' | 'unchanged';
    };
    moneyline: {
      home: number;
      away: number;
      direction: 'home' | 'away' | 'unchanged';
    };
  };
  publicMoney?: {
    spread: { home: number; away: number };
    total: { over: number; under: number };
    moneyline: { home: number; away: number };
  };
}

// =============================================================================
// CACHING TYPES
// =============================================================================

/**
 * Cache configuration for odds data
 */
export interface OddsCacheConfig {
  ttl: number; // Time to live in seconds
  namespace: string;
  compress?: boolean;
}

/**
 * Cached odds entry
 */
export interface CachedOdds {
  data: GameOdds[];
  timestamp: Date;
  expires: Date;
  source: 'api' | 'cache';
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Request parameters for fetching odds
 */
export interface OddsRequest {
  sport?: 'americanfootball_nfl' | 'basketball_nba';
  markets?: MarketType[];
  bookmakers?: string[];
  gameIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Response format for API endpoints
 */
export interface OddsApiEndpointResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  cached?: boolean;
  timestamp: Date;
  rateLimit?: {
    remaining: number;
    reset: Date;
  };
}

/**
 * Historical odds request
 */
export interface HistoricalOddsRequest {
  gameId?: string;
  sport?: string;
  dateFrom: Date;
  dateTo: Date;
  limit?: number;
  offset?: number;
}

/**
 * Movement analysis request
 */
export interface MovementAnalysisRequest {
  gameId: string;
  marketType?: MarketType;
  bookmaker?: string;
  includePublicMoney?: boolean;
}

// =============================================================================
// PLAYER PROP TYPES
// =============================================================================

/**
 * Processed player prop data
 */
export interface ProcessedPlayerProp {
  gameId: string;
  playerId: string;
  playerName: string;
  team: string;
  propType: PropType;
  line: number;
  overOdds: number;
  underOdds: number;
  bookmakers: {
    [key: string]: {
      line: number;
      overOdds: number;
      underOdds: number;
      lastUpdate: Date;
    };
  };
  bestOver?: {
    bookmaker: string;
    odds: number;
  };
  bestUnder?: {
    bookmaker: string;
    odds: number;
  };
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Convert American odds to decimal
 */
export function americanToDecimal(american: number): number {
  if (american > 0) {
    return (american / 100) + 1;
  }
  return (100 / Math.abs(american)) + 1;
}

/**
 * Convert American odds to implied probability
 */
export function americanToImpliedProbability(american: number): number {
  if (american > 0) {
    return 100 / (american + 100);
  }
  return Math.abs(american) / (Math.abs(american) + 100);
}

/**
 * Calculate vig/juice from odds
 */
export function calculateVig(odds1: number, odds2: number): number {
  const prob1 = americanToImpliedProbability(odds1);
  const prob2 = americanToImpliedProbability(odds2);
  return (prob1 + prob2 - 1) * 100;
}

/**
 * Determine if line has moved significantly
 */
export function isSignificantMovement(
  oldLine: number,
  newLine: number,
  threshold: number = 0.5
): boolean {
  return Math.abs(newLine - oldLine) >= threshold;
}

/**
 * Format American odds for display
 */
export function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : odds.toString();
}

/**
 * Parse market type from API key
 */
export function parseMarketType(key: string): MarketType {
  switch (key) {
    case 'h2h':
      return MarketType.H2H;
    case 'spreads':
      return MarketType.SPREADS;
    case 'totals':
      return MarketType.TOTALS;
    default:
      throw new Error(`Unknown market type: ${key}`);
  }
}

/**
 * Rate limit tracking
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  period: 'month' | 'minute';
}

/**
 * Error types for betting system
 */
export enum BettingErrorCode {
  API_ERROR = 'API_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_GAME_ID = 'INVALID_GAME_ID',
  NO_ODDS_AVAILABLE = 'NO_ODDS_AVAILABLE',
  CACHE_ERROR = 'CACHE_ERROR',
  TRANSFORMATION_ERROR = 'TRANSFORMATION_ERROR',
}

export class BettingError extends Error {
  constructor(
    message: string,
    public code: BettingErrorCode,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'BettingError';
  }
}