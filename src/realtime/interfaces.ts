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

export function leagueBlogChannel(leagueId: string): `league:${string}:blog` {
  return `league:${leagueId}:blog`;
}
