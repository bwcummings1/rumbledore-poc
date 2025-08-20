// Types for Statistics Engine
// Sprint 6: Statistics Engine

import { Decimal } from '@prisma/client/runtime/library';

// Enums
export enum CalculationType {
  ALL = 'ALL',
  SEASON = 'SEASON',
  HEAD_TO_HEAD = 'HEAD_TO_HEAD',
  RECORDS = 'RECORDS',
  TRENDS = 'TRENDS',
  CHAMPIONSHIPS = 'CHAMPIONSHIPS'
}

export enum RecordType {
  HIGHEST_SINGLE_GAME_SCORE = 'HIGHEST_SINGLE_GAME_SCORE',
  LOWEST_SINGLE_GAME_SCORE = 'LOWEST_SINGLE_GAME_SCORE',
  HIGHEST_SEASON_AVERAGE = 'HIGHEST_SEASON_AVERAGE',
  LOWEST_SEASON_AVERAGE = 'LOWEST_SEASON_AVERAGE',
  MOST_WINS_SEASON = 'MOST_WINS_SEASON',
  MOST_LOSSES_SEASON = 'MOST_LOSSES_SEASON',
  LONGEST_WIN_STREAK = 'LONGEST_WIN_STREAK',
  LONGEST_LOSS_STREAK = 'LONGEST_LOSS_STREAK',
  HIGHEST_TOTAL_SEASON_POINTS = 'HIGHEST_TOTAL_SEASON_POINTS',
  LOWEST_TOTAL_SEASON_POINTS = 'LOWEST_TOTAL_SEASON_POINTS',
  MOST_CHAMPIONSHIPS = 'MOST_CHAMPIONSHIPS',
  MOST_PLAYOFF_APPEARANCES = 'MOST_PLAYOFF_APPEARANCES',
  HIGHEST_PLAYOFF_SCORE = 'HIGHEST_PLAYOFF_SCORE',
  BIGGEST_COMEBACK = 'BIGGEST_COMEBACK',
  BIGGEST_BLOWOUT = 'BIGGEST_BLOWOUT',
  MOST_POINTS_IN_LOSS = 'MOST_POINTS_IN_LOSS',
  FEWEST_POINTS_IN_WIN = 'FEWEST_POINTS_IN_WIN'
}

export enum RecordHolderType {
  TEAM = 'TEAM',
  PLAYER = 'PLAYER'
}

export enum TrendDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  STABLE = 'STABLE'
}

export enum PeriodType {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  SEASONAL = 'SEASONAL'
}

export enum MatchupResult {
  WIN = 'WIN',
  LOSS = 'LOSS',
  TIE = 'TIE'
}

export enum CalculationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

// Core Interfaces
export interface StatisticsCalculation {
  leagueId: string;
  calculationType: CalculationType;
  seasonId?: string;
  forceRecalculate?: boolean;
  priority?: number;
}

export interface AllTimeRecord {
  id: string;
  leagueId: string;
  recordType: RecordType;
  recordHolderType: RecordHolderType;
  recordHolderId: string;
  recordValue: number | Decimal;
  season?: string;
  week?: number;
  opponentId?: string;
  dateAchieved?: Date;
  metadata?: Record<string, any>;
  previousRecordId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HeadToHeadRecord {
  id: string;
  leagueId: string;
  team1Id: string;
  team2Id: string;
  totalMatchups: number;
  team1Wins: number;
  team2Wins: number;
  ties: number;
  team1TotalPoints: number | Decimal;
  team2TotalPoints: number | Decimal;
  team1HighestScore?: number | Decimal;
  team2HighestScore?: number | Decimal;
  lastMatchupDate?: Date;
  playoffMatchups: number;
  championshipMatchups: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PerformanceTrend {
  id: string;
  leagueId: string;
  entityType: RecordHolderType;
  entityId: string;
  periodType: PeriodType;
  periodValue: string;
  metrics: TrendMetrics;
  trendDirection?: TrendDirection;
  trendStrength?: number | Decimal;
  calculatedAt: Date;
}

export interface TrendMetrics {
  recentAverage: number;
  previousAverage: number;
  recentGames: number;
  winPercentage: number;
  pointsPerGame: number;
  pointsAgainstPerGame?: number;
  [key: string]: any;
}

export interface ChampionshipRecord {
  id: string;
  leagueId: string;
  season: string;
  championId: string;
  runnerUpId?: string;
  thirdPlaceId?: string;
  regularSeasonWinnerId?: string;
  championshipScore?: number | Decimal;
  runnerUpScore?: number | Decimal;
  playoffBracket?: any;
  createdAt: Date;
}

export interface SeasonStatistics {
  id: string;
  leagueId: string;
  season: string;
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number | Decimal;
  pointsAgainst: number | Decimal;
  avgPointsFor?: number | Decimal;
  avgPointsAgainst?: number | Decimal;
  highestScore?: number | Decimal;
  lowestScore?: number | Decimal;
  pointsStdDev?: number | Decimal;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreakType?: string;
  currentStreakCount: number;
  playoffAppearance: boolean;
  championshipAppearance: boolean;
  divisionWinner: boolean;
  calculatedAt: Date;
}

export interface WeeklyStatistics {
  id: string;
  leagueId: string;
  season: string;
  week: number;
  teamId: string;
  opponentId?: string;
  pointsFor: number | Decimal;
  pointsAgainst?: number | Decimal;
  result?: MatchupResult;
  isPlayoff: boolean;
  isChampionship: boolean;
  marginOfVictory?: number | Decimal;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface StatisticsCalculationLog {
  id: string;
  leagueId: string;
  calculationType: string;
  status: CalculationStatus;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  recordsProcessed: number;
  executionTimeMs?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

// Team Statistics Summary
export interface TeamStatsSummary {
  teamId: string;
  teamName?: string;
  season: string;
  record: {
    wins: number;
    losses: number;
    ties: number;
    winPercentage: number;
  };
  scoring: {
    totalPointsFor: number;
    totalPointsAgainst: number;
    avgPointsFor: number;
    avgPointsAgainst: number;
    highestScore: number;
    lowestScore: number;
    standardDeviation: number;
  };
  streaks: {
    currentStreak: {
      type: MatchupResult | null;
      count: number;
    };
    longestWinStreak: number;
    longestLossStreak: number;
  };
  playoffs?: {
    appearances: number;
    championships: number;
    runnerUps: number;
  };
}

// Query Parameters
export interface StatisticsQuery {
  leagueId: string;
  type: 'season' | 'alltime' | 'h2h' | 'trends' | 'championships';
  seasonId?: string;
  teamId?: string;
  playerId?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface HeadToHeadQuery {
  leagueId: string;
  team1Id: string;
  team2Id: string;
  includePlayoffs?: boolean;
  limit?: number;
}

// WebSocket Events
export interface StatsUpdateEvent {
  type: 'SEASON' | 'RECORD' | 'H2H' | 'TREND';
  leagueId: string;
  seasonId?: string;
  week?: number;
  teamId?: string;
  data: any;
  timestamp: Date;
}

export interface RecordBrokenEvent {
  type: RecordType;
  oldRecord: AllTimeRecord;
  newValue: number;
  achievedBy: string;
  achievedByName?: string;
  date: Date;
  metadata?: Record<string, any>;
}

export interface CalculationProgressEvent {
  jobId: string;
  leagueId: string;
  calculationType: CalculationType;
  status: CalculationStatus;
  progress?: number;
  message?: string;
  executionTime?: number;
}

// Calculation Results
export interface CalculationResult {
  success: boolean;
  jobId?: string;
  executionTime?: number;
  recordsProcessed?: number;
  errors?: string[];
  data?: any;
}

export interface RecordDetectionResult {
  recordType: RecordType;
  isNewRecord: boolean;
  currentValue: number;
  previousValue?: number;
  recordHolder: string;
  metadata?: Record<string, any>;
}

// Cache Keys
export interface CacheKeyConfig {
  prefix: string;
  leagueId: string;
  type?: string;
  seasonId?: string;
  teamId?: string;
  ttl?: number;
}

// API Response Types
export interface StatisticsApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    cached?: boolean;
    executionTime?: number;
    totalCount?: number;
    page?: number;
    pageSize?: number;
  };
}

export interface BulkStatisticsResponse {
  seasonStats?: SeasonStatistics[];
  allTimeRecords?: AllTimeRecord[];
  headToHeadRecords?: HeadToHeadRecord[];
  performanceTrends?: PerformanceTrend[];
  championshipRecords?: ChampionshipRecord[];
}

// Utility Types
export type StatisticsMetric = 
  | 'wins'
  | 'losses'
  | 'ties'
  | 'pointsFor'
  | 'pointsAgainst'
  | 'avgPointsFor'
  | 'avgPointsAgainst'
  | 'winPercentage'
  | 'streak';

export type ComparisonOperator = 
  | 'gt' // greater than
  | 'gte' // greater than or equal
  | 'lt' // less than
  | 'lte' // less than or equal
  | 'eq' // equal
  | 'ne'; // not equal

export interface StatisticsFilter {
  metric: StatisticsMetric;
  operator: ComparisonOperator;
  value: number;
}

export interface StatisticsAggregation {
  type: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'stddev';
  field: string;
  alias?: string;
}

// Export all types
export type {
  Decimal
};