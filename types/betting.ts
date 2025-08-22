/**
 * TypeScript type definitions for the betting system
 * These types define the structure of data from The Odds API and our internal betting system
 */

import { 
  MarketType, 
  PropType,
  BetType,
  BetStatus,
  BetResult,
  BetSlipType,
  BankrollStatus,
  CompetitionType,
  CompetitionScope,
  CompetitionStatus,
  AchievementType,
  RewardType
} from '@prisma/client';

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

// =============================================================================
// BETTING ENGINE TYPES (Sprint 13)
// =============================================================================

/**
 * Bankroll information for a user
 */
export interface BankrollInfo {
  id: string;
  userId: string;
  leagueId: string;
  leagueSandbox: string;
  week: number;
  season: number;
  startingBalance: number;
  currentBalance: number;
  totalBets: number;
  pendingBets: number;
  wonBets: number;
  lostBets: number;
  totalWagered: number;
  totalWon: number;
  totalLost: number;
  profitLoss: number;
  roi: number | null;
  status: BankrollStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request to place a bet
 */
export interface BetRequest {
  userId: string;
  leagueId: string;
  leagueSandbox: string;
  gameId: string;
  eventDate: Date;
  betType: BetType;
  marketType: MarketType;
  selection: string; // Team name or Over/Under
  line?: number; // For spreads and totals
  odds: number; // American odds format
  stake: number;
}

/**
 * Bet information
 */
export interface BetInfo {
  id: string;
  userId: string;
  leagueId: string;
  leagueSandbox: string;
  bankrollId: string;
  betSlipId?: string;
  gameId: string;
  eventDate: Date;
  betType: BetType;
  marketType: MarketType;
  selection: string;
  line?: number;
  odds: number;
  stake: number;
  potentialPayout: number;
  actualPayout?: number;
  status: BetStatus;
  result?: BetResult;
  settledAt?: Date;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parlay bet slip
 */
export interface BetSlipInfo {
  id: string;
  userId: string;
  leagueId: string;
  leagueSandbox: string;
  type: BetSlipType;
  totalStake: number;
  totalOdds: number;
  potentialPayout: number;
  actualPayout?: number;
  status: BetStatus;
  result?: BetResult;
  settledAt?: Date;
  legs: BetInfo[]; // Individual bets in the parlay
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Settlement information
 */
export interface SettlementInfo {
  id: string;
  betId: string;
  userId: string;
  leagueId: string;
  leagueSandbox: string;
  gameId: string;
  betAmount: number;
  payoutAmount: number;
  result: BetResult;
  gameScore: any;
  settledBy?: string;
  notes?: string;
  createdAt: Date;
}

/**
 * Bet validation errors
 */
export enum BetValidationError {
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_STAKE = 'INVALID_STAKE',
  GAME_ALREADY_STARTED = 'GAME_ALREADY_STARTED',
  INVALID_ODDS = 'INVALID_ODDS',
  BANKROLL_NOT_FOUND = 'BANKROLL_NOT_FOUND',
  DUPLICATE_BET = 'DUPLICATE_BET',
  MAX_BETS_EXCEEDED = 'MAX_BETS_EXCEEDED',
}

/**
 * Betting statistics for a user
 */
export interface BettingStats {
  totalBets: number;
  wonBets: number;
  lostBets: number;
  pushBets: number;
  winRate: number;
  totalWagered: number;
  totalWon: number;
  totalLost: number;
  netProfit: number;
  roi: number;
  averageStake: number;
  averageOdds: number;
  bestWin: BetInfo | null;
  worstLoss: BetInfo | null;
  currentStreak: {
    type: 'winning' | 'losing';
    count: number;
  };
  longestWinStreak: number;
  longestLoseStreak: number;
}

/**
 * Weekly betting limits
 */
export interface BettingLimits {
  minBet: number;
  maxBet: number;
  maxWeeklyBets: number;
  maxParlayLegs: number;
  weeklyBankroll: number;
}

export const DEFAULT_BETTING_LIMITS: BettingLimits = {
  minBet: 1,
  maxBet: 500,
  maxWeeklyBets: 100,
  maxParlayLegs: 10,
  weeklyBankroll: 1000,
};

/**
 * Game result for settlement
 */
export interface GameResult {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: 'completed' | 'cancelled' | 'postponed';
  completedAt: Date;
}

/**
 * Calculate payout for American odds
 */
export function calculatePayout(stake: number, odds: number): number {
  if (odds > 0) {
    // Positive odds (e.g., +150)
    return stake * (1 + odds / 100);
  } else {
    // Negative odds (e.g., -110)
    return stake * (1 + 100 / Math.abs(odds));
  }
}

/**
 * Calculate parlay odds
 */
export function calculateParlayOdds(odds: number[]): number {
  const decimalOdds = odds.map(o => {
    if (o > 0) {
      return 1 + o / 100;
    } else {
      return 1 + 100 / Math.abs(o);
    }
  });
  
  const totalDecimal = decimalOdds.reduce((acc, curr) => acc * curr, 1);
  
  // Convert back to American odds
  if (totalDecimal >= 2) {
    return Math.round((totalDecimal - 1) * 100);
  } else {
    return Math.round(-100 / (totalDecimal - 1));
  }
}

/**
 * Validate bet amount
 */
export function validateBetAmount(
  amount: number, 
  currentBalance: number,
  limits: BettingLimits = DEFAULT_BETTING_LIMITS
): BetValidationError | null {
  if (amount < limits.minBet || amount > limits.maxBet) {
    return BetValidationError.INVALID_STAKE;
  }
  if (amount > currentBalance) {
    return BetValidationError.INSUFFICIENT_FUNDS;
  }
  return null;
}

/**
 * Calculate ROI (Return on Investment)
 */
export function calculateROI(totalWon: number, totalWagered: number): number {
  if (totalWagered === 0) return 0;
  return ((totalWon - totalWagered) / totalWagered) * 100;
}

// =============================================================================
// COMPETITION TYPES (Sprint 14)
// =============================================================================

/**
 * Competition configuration
 */
export interface CompetitionConfig {
  name: string;
  description?: string;
  type: CompetitionType;
  scope: CompetitionScope;
  leagueId?: string;
  leagueSandbox?: string;
  startDate: Date;
  endDate: Date;
  week?: number;
  season?: number;
  entryFee?: number;
  prizePool?: number;
  maxEntrants?: number;
  minEntrants?: number;
  scoringRules: ScoringRules;
}

/**
 * Competition details
 */
export interface Competition {
  id: string;
  name: string;
  description?: string;
  type: CompetitionType;
  scope: CompetitionScope;
  leagueId?: string;
  leagueSandbox?: string;
  startDate: Date;
  endDate: Date;
  week?: number;
  season?: number;
  entryFee: number;
  prizePool: number;
  maxEntrants?: number;
  minEntrants: number;
  currentEntrants: number;
  scoringRules: ScoringRules;
  status: CompetitionStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Scoring rules for competitions
 */
export interface ScoringRules {
  profitWeight: number;      // Weight for profit in scoring
  roiWeight: number;          // Weight for ROI
  winRateWeight: number;      // Weight for win rate
  activityBonus: number;      // Bonus for activity
  minBetsRequired?: number;   // Minimum bets to qualify
  tieBreaker?: 'PROFIT' | 'ROI' | 'WIN_RATE' | 'TOTAL_BETS';
}

/**
 * Competition entry
 */
export interface CompetitionEntry {
  id: string;
  competitionId: string;
  userId: string;
  userName?: string;
  joinedAt: Date;
  rank?: number;
  score: number;
  profit: number;
  roi?: number;
  winRate?: number;
  totalBets: number;
  wonBets: number;
  stats?: CompetitionStats;
  lastUpdate?: Date;
}

/**
 * Competition statistics
 */
export interface CompetitionStats {
  totalBets: number;
  wonBets: number;
  totalWagered: number;
  totalWon: number;
  bestBet?: BetInfo;
  worstBet?: BetInfo;
  currentStreak: number;
  longestStreak: number;
  averageOdds: number;
  favoriteMarket: MarketType;
}

/**
 * Leaderboard standings
 */
export interface LeaderboardStandings {
  competitionId: string;
  standings: LeaderboardEntry[];
  lastCalculated: Date;
  version: number;
}

/**
 * Individual leaderboard entry
 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userAvatar?: string;
  score: number;
  profit: number;
  roi: number;
  winRate: number;
  totalBets: number;
  movement?: number; // Position change since last update
  trend?: 'up' | 'down' | 'unchanged';
}

/**
 * Achievement information
 */
export interface Achievement {
  id: string;
  userId: string;
  leagueId?: string;
  type: AchievementType;
  name: string;
  description: string;
  icon?: string;
  metadata?: any;
  progress?: number;
  target?: number;
  unlockedAt: Date;
}

/**
 * Competition reward
 */
export interface CompetitionReward {
  id: string;
  competitionId: string;
  userId: string;
  placement: number;
  rewardType: RewardType;
  rewardValue: RewardValue;
  claimedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

/**
 * Reward value details
 */
export interface RewardValue {
  units?: number;         // For UNITS reward type
  badgeName?: string;     // For BADGE reward type
  badgeIcon?: string;     // Badge icon URL
  title?: string;         // For TITLE reward type
  multiplier?: number;    // For MULTIPLIER reward type
  duration?: number;      // Duration in days for temporary rewards
}

/**
 * Competition filters
 */
export interface CompetitionFilters {
  status?: CompetitionStatus[];
  type?: CompetitionType[];
  scope?: CompetitionScope;
  leagueId?: string;
  userId?: string; // Filter by participant
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Competition summary stats
 */
export interface CompetitionSummary {
  totalCompetitions: number;
  activeCompetitions: number;
  totalParticipants: number;
  totalPrizePool: number;
  averageEntrants: number;
  topCompetitor?: {
    userId: string;
    userName: string;
    wins: number;
    totalEarnings: number;
  };
}

/**
 * Calculate competition score
 */
export function calculateCompetitionScore(
  stats: CompetitionStats,
  rules: ScoringRules
): number {
  const profitScore = (stats.totalWon - stats.totalWagered) * rules.profitWeight;
  const roiScore = calculateROI(stats.totalWon, stats.totalWagered) * rules.roiWeight;
  const winRateScore = ((stats.wonBets / stats.totalBets) * 100) * rules.winRateWeight;
  const activityScore = Math.min(stats.totalBets * rules.activityBonus, 10); // Cap activity bonus
  
  return profitScore + roiScore + winRateScore + activityScore;
}

/**
 * Determine reward distribution
 */
export function calculateRewardDistribution(
  prizePool: number,
  participantCount: number
): RewardValue[] {
  if (participantCount === 0 || prizePool === 0) return [];
  
  const rewards: RewardValue[] = [];
  
  // Standard payout structure
  if (participantCount >= 3) {
    rewards.push(
      { units: Math.floor(prizePool * 0.5), badgeName: '🏆 Champion' },
      { units: Math.floor(prizePool * 0.3), badgeName: '🥈 Runner-up' },
      { units: Math.floor(prizePool * 0.2), badgeName: '🥉 Third Place' }
    );
  } else if (participantCount === 2) {
    rewards.push(
      { units: Math.floor(prizePool * 0.7), badgeName: '🏆 Champion' },
      { units: Math.floor(prizePool * 0.3), badgeName: '🥈 Runner-up' }
    );
  } else {
    rewards.push({ units: prizePool, badgeName: '🏆 Champion' });
  }
  
  // Add participation badges for places 4-10
  for (let i = 4; i <= Math.min(10, participantCount); i++) {
    rewards.push({ badgeName: `🏅 Top ${i}` });
  }
  
  return rewards;
}

/**
 * Check if user is eligible for competition
 */
export function checkCompetitionEligibility(
  competition: Competition,
  userBalance: number,
  userCompetitions: string[]
): { eligible: boolean; reason?: string } {
  // Check if competition is open
  if (competition.status !== 'PENDING') {
    return { eligible: false, reason: 'Competition is not open for entries' };
  }
  
  // Check max entrants
  if (competition.maxEntrants && competition.currentEntrants >= competition.maxEntrants) {
    return { eligible: false, reason: 'Competition is full' };
  }
  
  // Check if already entered
  if (userCompetitions.includes(competition.id)) {
    return { eligible: false, reason: 'Already entered in this competition' };
  }
  
  // Check entry fee
  if (competition.entryFee > 0 && userBalance < competition.entryFee) {
    return { eligible: false, reason: 'Insufficient balance for entry fee' };
  }
  
  // Check date range
  const now = new Date();
  if (now > competition.endDate) {
    return { eligible: false, reason: 'Competition has ended' };
  }
  
  return { eligible: true };
}