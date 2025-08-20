// Core type definitions for Rumbledore platform

export interface User {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface League {
  id: string;
  espnLeagueId: bigint;
  name: string;
  season: number;
  sandboxNamespace: string;
  settings: LeagueSettings;
  isActive: boolean;
  lastSyncAt?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeagueSettings {
  scoringType: 'standard' | 'ppr' | 'half-ppr';
  teamCount: number;
  playoffTeams: number;
  tradeDeadline?: Date;
  waiverType?: 'continuous' | 'daily';
  draftType?: 'snake' | 'auction';
  [key: string]: any;
}

export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  espnTeamId?: number;
  teamName?: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: Date;
  user?: User;
  league?: League;
}

export interface LeaguePlayer {
  id: string;
  leagueId: string;
  espnPlayerId: bigint;
  name: string;
  position?: string;
  nflTeam?: string;
  stats: PlayerStats;
  projections: PlayerProjections;
  imageUrl?: string;
  injuryStatus?: string;
  updatedAt: Date;
}

export interface PlayerStats {
  weeklyStats?: Record<number, WeeklyStats>;
  seasonStats?: SeasonStats;
  [key: string]: any;
}

export interface PlayerProjections {
  weeklyProjections?: Record<number, WeeklyProjection>;
  seasonProjection?: SeasonProjection;
  [key: string]: any;
}

export interface WeeklyStats {
  points: number;
  passingYards?: number;
  passingTDs?: number;
  rushingYards?: number;
  rushingTDs?: number;
  receivingYards?: number;
  receivingTDs?: number;
  [key: string]: any;
}

export interface SeasonStats extends WeeklyStats {
  gamesPlayed: number;
  averagePoints: number;
}

export interface WeeklyProjection extends WeeklyStats {
  confidence: number;
}

export interface SeasonProjection extends SeasonStats {
  confidence: number;
}

export interface LeagueTeam {
  id: string;
  leagueId: string;
  espnTeamId: number;
  name: string;
  abbreviation?: string;
  logoUrl?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  standing?: number;
  playoffSeed?: number;
  updatedAt: Date;
}

export interface LeagueMatchup {
  id: string;
  leagueId: string;
  week: number;
  matchupPeriod: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  isPlayoffs: boolean;
  isComplete: boolean;
}

export interface EspnCredential {
  id: string;
  userId: string;
  leagueId: string;
  encryptedSwid: string;
  encryptedEspnS2: string;
  expiresAt?: Date;
  lastValidated?: Date;
  isValid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeagueAgentMemory {
  id: string;
  leagueId: string;
  agentType: AgentType;
  memoryType: MemoryType;
  content: string;
  metadata: Record<string, any>;
  createdAt: Date;
  expiresAt?: Date;
}

export type AgentType = 
  | 'COMMISSIONER'
  | 'ANALYST'
  | 'NARRATOR'
  | 'TRASH_TALKER'
  | 'BETTING_ADVISOR';

export type MemoryType =
  | 'SHORT_TERM'
  | 'LONG_TERM'
  | 'EPISODIC'
  | 'SEMANTIC';

// API Response Types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  code?: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SessionResponse {
  user: User;
  token: string;
  expiresAt: string;
}

// Request Types
export interface CreateLeagueRequest {
  espnLeagueId: number;
  name: string;
  season: number;
}

export interface UpdateLeagueRequest {
  name?: string;
  settings?: Partial<LeagueSettings>;
  isActive?: boolean;
}

export interface AddMemberRequest {
  userId: string;
  role?: 'OWNER' | 'ADMIN' | 'MEMBER';
  espnTeamId?: number;
  teamName?: string;
}