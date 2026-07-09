import type { Result } from "@/core/result";
import { AppError } from "@/core/result";
import type { FantasyProviderId } from "./ids";

export type { FantasyProviderId } from "./ids";
export { FANTASY_PROVIDER_IDS } from "./ids";

export type FantasySport = "ffl" | "unknown";
export type FantasyProviderAuthKind = "cookie" | "none" | "oauth2";

export const PROVIDER_DATA_CLASSES = [
  "league",
  "teams",
  "members",
  "rosters",
  "matchups",
  "final_standings",
  "transactions",
  "history",
  "divisions",
  "keeper_dynasty",
  "scoring_detail",
] as const;

export type ProviderDataClass = (typeof PROVIDER_DATA_CLASSES)[number];

export const PROVIDER_DATA_SUPPORT_LEVELS = [
  "full",
  "partial",
  "none",
] as const;

export type ProviderDataSupport = (typeof PROVIDER_DATA_SUPPORT_LEVELS)[number];

export const DATA_COVERAGE_STATUSES = [
  "complete",
  "partial",
  "stale",
  "unavailable",
  "error",
] as const;

export type DataCoverageStatus = (typeof DATA_COVERAGE_STATUSES)[number];

export type ProviderCapabilityMatrix = Record<
  ProviderDataClass,
  ProviderDataSupport
>;

export interface FantasyProviderCapabilities {
  authKind: FantasyProviderAuthKind;
  dataClasses: ProviderCapabilityMatrix;
  supportsHistory: boolean;
  supportsRosters: boolean;
  supportsTransactions: boolean;
  requiresOAuth: boolean;
}

export interface ProviderEntityRef {
  provider: FantasyProviderId;
  providerId: string;
}

export interface SeasonScopedProviderEntityRef extends ProviderEntityRef {
  season: number;
}

export interface ProviderLeagueRef extends SeasonScopedProviderEntityRef {
  name: string;
  sport: FantasySport;
  linkedProviderIds?: string[];
  previousProviderId?: string;
  providerTeamId?: string;
  teamName?: string;
  size?: number;
}

export type NormalizedLeagueStatus =
  | "preseason"
  | "in_season"
  | "complete"
  | "unknown";

export type NormalizedMatchupKind = "head_to_head" | "median" | "all_play";

export type NormalizedJsonObject = Record<string, unknown>;

export interface NormalizedKeeperSettings extends NormalizedJsonObject {
  isDynasty?: boolean;
  isKeeper?: boolean;
}

export interface NormalizedLeague extends ProviderLeagueRef {
  scoringType: string;
  acquisitionSettings?: NormalizedAcquisitionSettings;
  rosterSettings?: NormalizedRosterSettings;
  scoringSettings?: NormalizedJsonObject;
  size: number;
  currentScoringPeriod: number;
  status: NormalizedLeagueStatus;
  keeperSettings?: NormalizedKeeperSettings;
  postseason?: NormalizedPostseasonSettings;
}

export interface NormalizedAcquisitionSettings extends NormalizedJsonObject {
  acquisitionBudget?: number;
  acquisitionType?: string;
}

export interface NormalizedRosterSettings extends NormalizedJsonObject {
  lineupSlotCounts?: Record<string, number>;
}

export interface NormalizedPostseasonSettings {
  championshipScoringPeriod?: number;
  matchupPeriodCount?: number;
  playoffMatchupPeriodLength?: number;
  playoffStartScoringPeriod?: number;
  playoffTeamCount?: number;
  regularSeasonEndScoringPeriod?: number;
}

export interface NormalizedTeam extends SeasonScopedProviderEntityRef {
  leagueProviderId: string;
  name: string;
  abbrev: string;
  division?: string;
  logo?: string;
  ownerMemberIds: string[];
  record: {
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
  };
}

export type NormalizedMemberRole =
  | "commissioner"
  | "league_admin"
  | "data_steward"
  | "member"
  | "unknown";

export interface NormalizedMember extends ProviderEntityRef {
  displayName: string;
  leagueProviderId: string;
  season: number;
  role?: NormalizedMemberRole;
}

export type NormalizedMatchupWinner = "home" | "away" | "tie" | "unknown";
export type NormalizedMatchupStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "unknown";

export interface NormalizedMatchup extends SeasonScopedProviderEntityRef {
  leagueProviderId: string;
  scoringPeriod: number;
  periodStart?: number;
  scoringPeriodSpan?: number;
  kind?: NormalizedMatchupKind;
  homeTeamRef: SeasonScopedProviderEntityRef;
  awayTeamRef?: SeasonScopedProviderEntityRef;
  homeScore: number;
  awayScore?: number;
  winner: NormalizedMatchupWinner;
  status: NormalizedMatchupStatus;
}

export interface NormalizedPlayer extends ProviderEntityRef {
  fullName: string;
  leagueProviderId?: string;
  metadata?: NormalizedJsonObject;
  position: string;
  proTeam?: string;
  status?: string;
}

export type NormalizedPlayerStatSource = "actual" | "projected";

export interface NormalizedPlayerStatBreakdown {
  fantasyPoints: number;
  metadata?: NormalizedJsonObject;
  providerStatId: number;
  statCategory: string;
  statKey: string;
  statSource: NormalizedPlayerStatSource;
  statValue: number;
}

export interface NormalizedRosterEntry {
  actualPoints?: number;
  projectedPoints?: number;
  started?: boolean;
  player?: NormalizedPlayer;
  playerRef: ProviderEntityRef;
  slot: string;
  statBreakdown?: readonly NormalizedPlayerStatBreakdown[];
  status: string;
  points?: number;
  isKeeper?: boolean;
  metadata?: NormalizedJsonObject;
}

export interface NormalizedRoster {
  teamRef: SeasonScopedProviderEntityRef;
  season: number;
  scoringPeriod: number;
  entries: NormalizedRosterEntry[];
}

export interface NormalizedDraftPick extends SeasonScopedProviderEntityRef {
  auctionValue?: number;
  isKeeper?: boolean;
  leagueProviderId: string;
  metadata?: NormalizedJsonObject;
  pickInRound?: number;
  pickOverall?: number;
  player?: NormalizedPlayer;
  playerRef?: ProviderEntityRef;
  round: number;
  teamRef: SeasonScopedProviderEntityRef;
}

export type NormalizedTransactionType =
  | "add"
  | "drop"
  | "trade"
  | "waiver"
  | "unknown";

export interface NormalizedTransaction extends SeasonScopedProviderEntityRef {
  leagueProviderId: string;
  type: NormalizedTransactionType;
  teamRefs: SeasonScopedProviderEntityRef[];
  playerRefs: ProviderEntityRef[];
  scoringPeriod?: number;
  timestamp: Date;
  details: Record<string, unknown>;
}

export type NormalizedFinalStandingRankSource =
  | "provider_reported"
  | "provider_calculated_final"
  | "provider_final"
  | "regular_season_fallback";

export type NormalizedFinalStandingRankConfidence = "high" | "low";

export interface NormalizedFinalStanding {
  leagueProviderId: string;
  teamRef: SeasonScopedProviderEntityRef;
  rank: number;
  rankConfidence?: NormalizedFinalStandingRankConfidence;
  rankSource?: NormalizedFinalStandingRankSource;
  division?: string;
  divisionRank?: number;
  divisionWinner?: boolean;
  playoffSeed?: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface NormalizedSeasonBundle {
  league: NormalizedLeague;
  teams: NormalizedTeam[];
  members: NormalizedMember[];
  matchups: NormalizedMatchup[];
  finalStandings: NormalizedFinalStanding[];
  players?: NormalizedPlayer[];
  rosters?: NormalizedRoster[];
  draftPicks?: NormalizedDraftPick[];
  transactions: NormalizedTransaction[];
}

export interface ProviderHistoryOptions {
  seasons: number[];
}

export type ProviderErrorCode =
  | "PROVIDER_AUTH_EXPIRED"
  | "PROVIDER_BLOCKED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_PARSE_ERROR";

export class ProviderError extends AppError {
  readonly provider: FantasyProviderId;

  constructor({
    code,
    message,
    provider,
    status,
    cause,
    details,
  }: {
    code: ProviderErrorCode;
    message: string;
    provider: FantasyProviderId;
    status: number;
    cause?: unknown;
    details?: Record<string, unknown>;
  }) {
    super({ code, message, status, cause, details });
    this.name = "ProviderError";
    this.provider = provider;
  }
}

export class AuthExpiredError extends ProviderError {
  constructor(provider: FantasyProviderId, cause?: unknown) {
    super({
      code: "PROVIDER_AUTH_EXPIRED",
      message: "Provider credentials are expired or invalid",
      provider,
      status: 401,
      cause,
    });
    this.name = "AuthExpiredError";
  }
}

export class ProviderBlockedError extends ProviderError {
  constructor(provider: FantasyProviderId, cause?: unknown) {
    super({
      code: "PROVIDER_BLOCKED",
      message: "Provider request was blocked after retries",
      provider,
      status: 503,
      cause,
    });
    this.name = "ProviderBlockedError";
  }
}

export class RateLimitedError extends ProviderError {
  constructor(provider: FantasyProviderId, retryAfterSeconds?: number) {
    super({
      code: "PROVIDER_RATE_LIMITED",
      message: "Provider rate limit exceeded",
      provider,
      status: 429,
      details:
        retryAfterSeconds === undefined ? undefined : { retryAfterSeconds },
    });
    this.name = "RateLimitedError";
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(provider: FantasyProviderId, details?: Record<string, unknown>) {
    super({
      code: "PROVIDER_NOT_FOUND",
      message: "Provider resource was not found",
      provider,
      status: 404,
      details,
    });
    this.name = "ProviderNotFoundError";
  }
}

export class ProviderParseError extends ProviderError {
  constructor(
    provider: FantasyProviderId,
    message = "Provider response could not be normalized",
    cause?: unknown,
  ) {
    super({
      code: "PROVIDER_PARSE_ERROR",
      message,
      provider,
      status: 502,
      cause,
    });
    this.name = "ProviderParseError";
  }
}

export type ProviderResult<T> = Result<T, ProviderError>;

export interface FantasyProviderSession {
  provider: FantasyProviderId;
  authKind: FantasyProviderAuthKind;
  subjectProviderId?: string;
}

export interface FantasyProvider<
  Credentials = unknown,
  Session extends FantasyProviderSession = FantasyProviderSession,
> {
  id: FantasyProviderId;
  name: string;
  capabilities: FantasyProviderCapabilities;

  authenticate(credentials: Credentials): Promise<ProviderResult<Session>>;
  discoverLeagues(
    session: Session,
  ): Promise<ProviderResult<ProviderLeagueRef[]>>;
  getLeague(
    session: Session,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedLeague>>;
  getTeams(
    session: Session,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedTeam[]>>;
  getRosters(
    session: Session,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedRoster[]>>;
  getDraftPicks?(
    session: Session,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedDraftPick[]>>;
  getMembers(
    session: Session,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedMember[]>>;
  getMatchups(
    session: Session,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedMatchup[]>>;
  getTransactions(
    session: Session,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedTransaction[]>>;
  getHistory(
    session: Session,
    ref: ProviderLeagueRef,
    options: ProviderHistoryOptions,
  ): Promise<ProviderResult<NormalizedSeasonBundle[]>>;
}
