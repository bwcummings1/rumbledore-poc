import type { AiPersona } from "@/ai/personas";

export const REALTIME_EVENTS = {
  blogPublished: "blog.published",
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

export interface RealtimePublisher {
  publishLeagueBlogPublished(payload: BlogPublishedPayload): Promise<void>;
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
