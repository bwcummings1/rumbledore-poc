export const GENERAL_STATS_MOCK_SOURCE = "mock-nfl-general-stats";

export type NflGameStatus = "scheduled" | "in_progress" | "final";

export interface GeneralStatsPlayerInput {
  fantasyProviderIds: Record<string, string>;
  fullName: string;
  position: string;
  sourcePlayerId: string;
  team: string;
}

export interface GeneralStatsScheduleInput {
  awayScore: number | null;
  awayTeam: string;
  gameTime: string;
  homeScore: number | null;
  homeTeam: string;
  season: number;
  sourceGameId: string;
  status: NflGameStatus;
  week: number;
}

export interface GeneralStatsTeamStatInput {
  isHome: boolean;
  opponentTeam: string;
  passingTouchdowns: number;
  passingYards: number;
  pointsAgainst: number;
  pointsFor: number;
  receivingTouchdowns: number;
  receivingYards: number;
  rushingTouchdowns: number;
  rushingYards: number;
  sacks: number;
  season: number;
  sourceGameId: string;
  team: string;
  turnovers: number;
  week: number;
}

export interface GeneralStatsPlayerWeekStatInput {
  fantasyPoints: number;
  interceptions: number;
  opponentTeam: string;
  passingTouchdowns: number;
  passingYards: number;
  receptions: number;
  receivingTouchdowns: number;
  receivingYards: number;
  rushingTouchdowns: number;
  rushingYards: number;
  season: number;
  sourceGameId: string;
  sourcePlayerId: string;
  targets: number;
  team: string;
  week: number;
}

export interface GeneralStatsFixture {
  playerWeekStats: GeneralStatsPlayerWeekStatInput[];
  players: GeneralStatsPlayerInput[];
  schedule: GeneralStatsScheduleInput[];
  source: string;
  teamStats: GeneralStatsTeamStatInput[];
}

export type GeneralStatsIntegrityStatus = "pass" | "fail";

export type GeneralStatsIntegrityCheckKey =
  | "no_silent_empty"
  | "unique_players"
  | "unique_games"
  | "team_box_coverage"
  | "player_stat_references"
  | "player_stat_game_alignment";

export interface GeneralStatsIntegrityCheck {
  detail: Record<string, unknown>;
  key: GeneralStatsIntegrityCheckKey;
  status: GeneralStatsIntegrityStatus;
}

export interface GeneralStatsIntegritySummary {
  checks: GeneralStatsIntegrityCheck[];
  ok: boolean;
}

export interface GeneralStatsIngestSummary {
  fetchedAt: Date;
  integrity: GeneralStatsIntegritySummary;
  playerWeekStats: { changed: number; total: number };
  players: { changed: number; total: number };
  schedule: { changed: number; total: number };
  source: string;
  teamStats: { changed: number; total: number };
}

export interface GeneralStatsPlayer {
  fantasyProviderIds: Record<string, string>;
  fetchedAt: Date;
  fullName: string;
  id: string;
  position: string;
  source: string;
  sourcePlayerId: string;
  team: string;
}

export interface GeneralStatsScheduleGame {
  awayScore: number | null;
  awayTeam: string;
  fetchedAt: Date;
  gameTime: Date;
  homeScore: number | null;
  homeTeam: string;
  id: string;
  season: number;
  source: string;
  sourceGameId: string;
  status: NflGameStatus;
  week: number;
}

export interface GeneralStatsTeamBoxScore {
  fetchedAt: Date;
  isHome: boolean;
  opponentTeam: string;
  passingTouchdowns: number;
  passingYards: number;
  pointsAgainst: number;
  pointsFor: number;
  receivingTouchdowns: number;
  receivingYards: number;
  rushingTouchdowns: number;
  rushingYards: number;
  sacks: number;
  season: number;
  source: string;
  sourceGameId: string;
  team: string;
  turnovers: number;
  week: number;
}

export interface GeneralStatsPlayerWeekStats {
  fantasyPoints: number;
  fetchedAt: Date;
  interceptions: number;
  opponentTeam: string;
  passingTouchdowns: number;
  passingYards: number;
  player: GeneralStatsPlayer;
  receptions: number;
  receivingTouchdowns: number;
  receivingYards: number;
  rushingTouchdowns: number;
  rushingYards: number;
  season: number;
  source: string;
  sourceGameId: string;
  targets: number;
  team: string;
  week: number;
}

/**
 * League-agnostic read model for one NFL week. Central editorial consumers use
 * this directly; it deliberately contains substrate facts only and carries no
 * fantasy-league roster or canon context.
 */
export interface GeneralStatsWeekSnapshot {
  fetchedAt: Date | null;
  playerWeekStats: GeneralStatsPlayerWeekStats[];
  schedule: GeneralStatsScheduleGame[];
  season: number;
  source: string | null;
  teamBoxScores: GeneralStatsTeamBoxScore[];
  week: number;
}

export interface LeagueRosterFactForEnrichment {
  leagueTeamName?: string | null;
  playerName?: string | null;
  provider?: string | null;
  providerPlayerId?: string | null;
  providerTeamId?: string | null;
  rosterSlot?: string | null;
  started?: boolean | null;
  team?: string | null;
}

export interface EnrichedRosterFact {
  confidence: "provider_id" | "name";
  original: LeagueRosterFactForEnrichment;
  player: GeneralStatsPlayer;
}

export interface LeagueRosterGeneralStatsSeasonTotals {
  fantasyPoints: number;
  games: number;
  interceptions: number;
  passingTouchdowns: number;
  passingYards: number;
  receptions: number;
  receivingTouchdowns: number;
  receivingYards: number;
  rushingTouchdowns: number;
  rushingYards: number;
  targets: number;
}

export interface LeagueRosterGeneralStatsFact {
  confidence: EnrichedRosterFact["confidence"];
  latestWeek: GeneralStatsPlayerWeekStats | null;
  original: LeagueRosterFactForEnrichment;
  player: GeneralStatsPlayer;
  schedule: GeneralStatsScheduleGame[];
  season: number;
  seasonTotals: LeagueRosterGeneralStatsSeasonTotals;
  source: string;
}
