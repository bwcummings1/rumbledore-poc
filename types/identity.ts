// Identity Resolution type definitions for Rumbledore platform

// Player Identity Types
export interface PlayerIdentity {
  id: string;
  masterPlayerId: string;
  canonicalName: string;
  confidenceScore: number;
  verified: boolean;
  metadata: PlayerMetadata;
  mappings: PlayerMapping[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface PlayerMetadata {
  positions?: string[];
  teams?: string[];
  alternateNames?: string[];
  nflTeamHistory?: Array<{
    team: string;
    startYear: number;
    endYear?: number;
  }>;
  careerStats?: {
    totalGames: number;
    totalPoints: number;
    averagePoints: number;
    bestSeason: number;
  };
}

export interface PlayerMapping {
  id: string;
  masterPlayerId: string;
  espnPlayerId: number;
  season: number;
  nameVariation: string;
  confidenceScore: number;
  mappingMethod: MappingMethod;
  createdBy?: string;
  createdAt: Date;
}

// Team Identity Types
export interface TeamIdentity {
  id: string;
  masterTeamId: string;
  leagueId: string;
  canonicalName: string;
  ownerHistory: TeamOwner[];
  mappings: TeamMapping[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamOwner {
  name: string;
  startSeason: number;
  endSeason?: number;
  email?: string;
  espnUserId?: string;
}

export interface TeamMapping {
  id: string;
  masterTeamId: string;
  leagueId: string;
  espnTeamId: number;
  season: number;
  teamName: string;
  ownerName?: string;
  confidenceScore: number;
  createdAt: Date;
}

// Identity Matching Types
export interface IdentityMatch {
  sourceId: string | number;
  targetId: string;
  confidence: number;
  method: string;
  reasons: string[];
  suggestedAction: MatchAction;
  metadata?: MatchMetadata;
}

export interface MatchMetadata {
  nameSimilarity?: number;
  positionMatch?: boolean;
  teamContinuity?: boolean;
  statSimilarity?: number;
  seasonProximity?: number;
}

export interface IdentityMatchResult {
  id: string;
  player1: PlayerComparisonData;
  player2: PlayerComparisonData;
  confidence: number;
  method: string;
  reasons: string[];
  status: MatchStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

export interface PlayerComparisonData {
  id: string;
  espnPlayerId: number;
  name: string;
  season: number;
  team: string;
  position: string;
  stats: {
    games: number;
    points: number;
    averagePoints: number;
  };
}

// Confidence Scoring Types
export interface ConfidenceFactors {
  nameSimilarity: number;
  positionMatch: number;
  teamContinuity: number;
  statSimilarity: number;
  draftPosition?: number;
  ownership?: number;
  seasonalPerformance?: number;
}

export interface ConfidenceExplanation {
  score: number;
  level: ConfidenceLevel;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  action: MatchAction;
}

// Audit Types
export interface IdentityAuditEntry {
  id: string;
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
  beforeState?: any;
  afterState?: any;
  reason?: string;
  metadata?: AuditMetadata;
  performedBy?: string;
  performedAt: Date;
}

export interface AuditMetadata {
  confidence?: number;
  method?: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

// Resolution Request/Response Types
export interface ResolveIdentityRequest {
  leagueId: string;
  entityType: 'player' | 'team';
  options?: ResolutionOptions;
}

export interface ResolutionOptions {
  seasons?: number[];
  minConfidence?: number;
  autoApprove?: boolean;
  skipExisting?: boolean;
  dryRun?: boolean;
}

export interface ResolveIdentityResponse {
  success: boolean;
  totalProcessed: number;
  autoMatched: number;
  manualReviewRequired: number;
  errors: number;
  matches: IdentityMatchResult[];
  executionTime: number;
}

export interface MergeIdentityRequest {
  entityType: EntityType;
  primaryId: string;
  secondaryId: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface SplitIdentityRequest {
  entityType: EntityType;
  identityId: string;
  mappingIds: string[];
  reason?: string;
}

// Enums (matching Prisma schema)
export type MappingMethod = 'AUTOMATIC' | 'MANUAL' | 'FUZZY_MATCH';
export type EntityType = 'PLAYER' | 'TEAM';
export type AuditAction = 'CREATE' | 'MERGE' | 'SPLIT' | 'UPDATE' | 'DELETE' | 'ROLLBACK';
export type MatchAction = 'auto_approve_high' | 'auto_approve' | 'manual_review' | 'manual_review_low' | 'skip';
export type MatchStatus = 'pending' | 'approved' | 'rejected' | 'merged';
export type ConfidenceLevel = 'Very High' | 'High' | 'Medium' | 'Low' | 'Very Low';

// Service Interfaces
export interface IFuzzyMatcher {
  calculateSimilarity(name1: string, name2: string): number;
  findBestMatches(
    targetName: string,
    candidates: string[],
    threshold?: number,
    maxResults?: number
  ): Array<{ name: string; score: number }>;
}

export interface IConfidenceScorer {
  calculateConfidence(factors: ConfidenceFactors): number;
  determineAction(confidence: number): MatchAction;
  explainConfidence(factors: ConfidenceFactors, score: number): ConfidenceExplanation;
}

export interface IIdentityResolver {
  resolveIdentities(leagueId: string, options?: ResolutionOptions): Promise<ResolveIdentityResponse>;
  mergeIdentities(request: MergeIdentityRequest): Promise<void>;
  splitIdentity(request: SplitIdentityRequest): Promise<void>;
  getIdentityMatches(leagueId: string, status?: MatchStatus): Promise<IdentityMatchResult[]>;
}

export interface IAuditLogger {
  logAction(action: IdentityAuditEntry, userId: string): Promise<void>;
  getAuditTrail(entityType: EntityType, entityId: string): Promise<IdentityAuditEntry[]>;
  rollbackChange(auditLogId: string): Promise<void>;
}

// UI Component Props
export interface IdentityResolutionManagerProps {
  leagueId: string;
  onIdentitiesUpdated?: () => void;
}

export interface MatchReviewProps {
  match: IdentityMatchResult;
  onApprove: (matchId: string) => Promise<void>;
  onReject: (matchId: string) => Promise<void>;
  onMerge: (player1Id: string, player2Id: string) => Promise<void>;
}

export interface AuditViewerProps {
  entityType: EntityType;
  entityId: string;
  onRollback?: (auditId: string) => Promise<void>;
}

// Utility Types
export interface NameVariation {
  original: string;
  normalized: string;
  tokens: string[];
  phonetic?: string;
}

export interface StatisticalProfile {
  season: number;
  gamesPlayed: number;
  totalPoints: number;
  averagePoints: number;
  positionRank?: number;
  consistency?: number;
}

export interface SeasonComparison {
  player1Stats: StatisticalProfile;
  player2Stats: StatisticalProfile;
  similarity: number;
  significantDifferences: string[];
}