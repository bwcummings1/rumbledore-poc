import type { AiPersona } from "@/ai/personas";

export const REALTIME_EVENTS = {
  arenaLeaderboardUpdated: "arena.leaderboard.updated",
  arenaStandingsSwing: "arena.standings.swing",
  blogPublished: "blog.published",
  centralNewsUpdated: "central.news.updated",
  contentRetracted: "content.retracted",
  contentSuperseded: "content.superseded",
  historyImportProgress: "history.import.progress",
  leagueLeaderboardUpdated: "league.leaderboard.updated",
  loreCanonized: "lore.canonized",
  loreVoteOpened: "lore.vote.opened",
  oddsUpdated: "odds.updated",
  scoresUpdated: "scores.updated",
} as const;

export type RealtimeEventType =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export interface BlogPublishedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.blogPublished;
  at: string;
  leagueId: string;
  contentItemId: string;
  title: string;
  persona: AiPersona;
  triggerKey: string;
  publishedAt: string;
}

export interface ScoresUpdatedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.scoresUpdated;
  at: string;
  leagueId: string;
  scoringPeriod: number | null;
  matchupIds: string[];
}

export interface HistoryImportProgressPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.historyImportProgress;
  at: string;
  leagueId: string;
  provider: string;
  providerLeagueId: string;
  currentSeason: number;
  requestedSeasons: number[];
  importedSeasons: number[];
  skippedSeasons: number[];
  status: "running" | "completed" | "failed";
  lastCompletedSeason: number | null;
  nextSeason: number | null;
  seasonsCompleted: number;
  seasonsTotal: number;
  errorCode?: string;
}

export interface OddsUpdatedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.oddsUpdated;
  at: string;
  leagueId: string;
  bettingEventIds: string[];
  marketIds: string[];
}

export interface LeagueLeaderboardUpdatedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.leagueLeaderboardUpdated;
  at: string;
  leagueId: string;
  bankrollWeekId: string | null;
}

export interface LoreVoteOpenedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.loreVoteOpened;
  at: string;
  leagueId: string;
  claimId: string;
  voteClosesAt: string;
}

export interface LoreCanonizedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.loreCanonized;
  at: string;
  leagueId: string;
  claimId: string;
  ratifiedBy: "steward" | "verified" | "vote";
}

export interface ArenaLeaderboardUpdatedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.arenaLeaderboardUpdated;
  at: string;
  seasonId: string | null;
}

export interface ArenaStandingSwing {
  kind: "individual" | "league";
  leagueId: string | null;
  netPnlCents: number;
  newRank: number;
  oldRank: number;
  rankDelta: number;
  subjectId: string;
  userId: string | null;
}

export interface ArenaStandingsSwingPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.arenaStandingsSwing;
  at: string;
  computedAt: string;
  seasonId: string;
  swings: ArenaStandingSwing[];
}

export interface CentralNewsUpdatedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.centralNewsUpdated;
  at: string;
  contentItemIds: string[];
}

export interface ContentRetractedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.contentRetracted;
  at: string;
  leagueId: string | null;
  contentItemId: string;
  statusChangedAt: string;
  title: string;
}

export interface ContentSupersededPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.contentSuperseded;
  at: string;
  leagueId: string | null;
  contentItemId: string;
  replacementContentItemId: string;
  statusChangedAt: string;
  title: string;
}

export type RealtimePayload =
  | ArenaLeaderboardUpdatedPayload
  | ArenaStandingsSwingPayload
  | BlogPublishedPayload
  | CentralNewsUpdatedPayload
  | ContentRetractedPayload
  | ContentSupersededPayload
  | HistoryImportProgressPayload
  | LeagueLeaderboardUpdatedPayload
  | LoreCanonizedPayload
  | LoreVoteOpenedPayload
  | OddsUpdatedPayload
  | ScoresUpdatedPayload;

export interface RealtimePublisher {
  publishArenaLeaderboardUpdated(
    payload: ArenaLeaderboardUpdatedPayload,
  ): Promise<void>;
  publishArenaStandingsSwing(
    payload: ArenaStandingsSwingPayload,
  ): Promise<void>;
  publishContentRetracted(payload: ContentRetractedPayload): Promise<void>;
  publishContentSuperseded(payload: ContentSupersededPayload): Promise<void>;
  publishLeagueBlogPublished(payload: BlogPublishedPayload): Promise<void>;
  publishLeagueHistoryImportProgress(
    payload: HistoryImportProgressPayload,
  ): Promise<void>;
  publishLeagueLeaderboardUpdated(
    payload: LeagueLeaderboardUpdatedPayload,
  ): Promise<void>;
  publishLeagueLoreCanonized(payload: LoreCanonizedPayload): Promise<void>;
  publishLeagueLoreVoteOpened(payload: LoreVoteOpenedPayload): Promise<void>;
  publishLeagueScoresUpdated(payload: ScoresUpdatedPayload): Promise<void>;
}

export const LEAGUE_REALTIME_CHANNEL_KINDS = [
  "scores",
  "odds",
  "leaderboard",
  "blog",
  "lore",
  "history",
  "presence",
] as const;

export type LeagueRealtimeChannelKind =
  (typeof LEAGUE_REALTIME_CHANNEL_KINDS)[number];

export type LeagueRealtimeChannel =
  `league:${string}:${LeagueRealtimeChannelKind}`;

export const PUBLIC_REALTIME_CHANNELS = [
  "central:news",
  "arena:leaderboard",
] as const;

export type PublicRealtimeChannel = (typeof PUBLIC_REALTIME_CHANNELS)[number];

export type RealtimeChannel = LeagueRealtimeChannel | PublicRealtimeChannel;

export function leagueRealtimeChannel(
  leagueId: string,
  kind: LeagueRealtimeChannelKind,
): LeagueRealtimeChannel {
  return `league:${leagueId}:${kind}`;
}

export function leagueBlogChannel(leagueId: string): `league:${string}:blog` {
  return `league:${leagueId}:blog`;
}

export function arenaLeaderboardChannel(): "arena:leaderboard" {
  return "arena:leaderboard";
}

export function centralNewsChannel(): "central:news" {
  return "central:news";
}

export function leagueLeaderboardChannel(
  leagueId: string,
): `league:${string}:leaderboard` {
  return `league:${leagueId}:leaderboard`;
}

export function leagueLoreChannel(leagueId: string): `league:${string}:lore` {
  return `league:${leagueId}:lore`;
}

export function leagueHistoryChannel(
  leagueId: string,
): `league:${string}:history` {
  return `league:${leagueId}:history`;
}

export function leagueScoresChannel(
  leagueId: string,
): `league:${string}:scores` {
  return `league:${leagueId}:scores`;
}
