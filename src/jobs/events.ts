import type { AiContentType, AiPersona } from "@/ai";
import type { FantasyProviderId } from "@/providers";

export const JOB_EVENTS = {
  appPing: "app.ping",
  leagueConnected: "league.connected",
  gameFinal: "game.final",
  importRequested: "import.requested",
  oddsPoll: "odds.poll",
  newsRefresh: "news.refresh",
  contentGenerate: "content.generate",
} as const;

export type JobEventName = (typeof JOB_EVENTS)[keyof typeof JOB_EVENTS];

export interface AppPingData {
  message?: unknown;
  requestedAt?: unknown;
}

export interface ImportRequestedData {
  credentialId: string;
  leagueId: string;
  provider: Extract<FantasyProviderId, "espn" | "sleeper" | "yahoo">;
  providerLeagueId: string;
  season: number;
  sport: "ffl" | "unknown";
  name: string;
  teamName?: string;
  size?: number;
  seasons?: number[];
  maxSeasons?: number;
}

export interface ContentGenerateData {
  leagueId: string;
  persona: AiPersona;
  contentType: AiContentType;
  triggerKey: string;
}

export interface GameFinalData {
  bettingEventId?: string;
  leagueId: string;
  gameId: string;
  milestoneKeys?: string[];
}

export interface NewsRefreshData {
  topic?: string;
  limit?: number;
}

export interface OddsPollData {
  limit?: number;
  sport?: "nfl";
}
