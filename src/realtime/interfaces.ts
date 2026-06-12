import type { AiPersona } from "@/ai/personas";

export const REALTIME_EVENTS = {
  arenaLeaderboardUpdated: "arena.leaderboard.updated",
  blogPublished: "blog.published",
  centralNewsUpdated: "central.news.updated",
  leagueLeaderboardUpdated: "league.leaderboard.updated",
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

export interface ArenaLeaderboardUpdatedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.arenaLeaderboardUpdated;
  at: string;
  seasonId: string | null;
}

export interface CentralNewsUpdatedPayload {
  v: 1;
  type: typeof REALTIME_EVENTS.centralNewsUpdated;
  at: string;
  contentItemIds: string[];
}

export type RealtimePayload =
  | ArenaLeaderboardUpdatedPayload
  | BlogPublishedPayload
  | CentralNewsUpdatedPayload
  | LeagueLeaderboardUpdatedPayload
  | OddsUpdatedPayload
  | ScoresUpdatedPayload;

export interface RealtimePublisher {
  publishLeagueBlogPublished(payload: BlogPublishedPayload): Promise<void>;
  publishLeagueScoresUpdated(payload: ScoresUpdatedPayload): Promise<void>;
}

export const LEAGUE_REALTIME_CHANNEL_KINDS = [
  "scores",
  "odds",
  "leaderboard",
  "blog",
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

export function leagueScoresChannel(
  leagueId: string,
): `league:${string}:scores` {
  return `league:${leagueId}:scores`;
}
