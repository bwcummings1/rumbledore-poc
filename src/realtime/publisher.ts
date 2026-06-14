import { AppError } from "@/core/result";
import {
  type ArenaLeaderboardUpdatedPayload,
  type ArenaStandingsSwingPayload,
  arenaLeaderboardChannel,
  type BlogPublishedPayload,
  type LeagueLeaderboardUpdatedPayload,
  leagueBlogChannel,
  leagueLeaderboardChannel,
  leagueScoresChannel,
  REALTIME_EVENTS,
  type RealtimePublisher,
  type ScoresUpdatedPayload,
} from "./interfaces";

export interface SupabaseRealtimePublisherOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  url: string;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export class SupabaseRealtimePublisher implements RealtimePublisher {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly url: string;

  constructor({ apiKey, fetchFn, url }: SupabaseRealtimePublisherOptions) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn ?? fetch;
    this.url = trimTrailingSlashes(url);
  }

  async publishArenaLeaderboardUpdated(
    payload: ArenaLeaderboardUpdatedPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.arenaLeaderboardUpdated,
      payload,
      private: true,
      topic: arenaLeaderboardChannel(),
    });
  }

  async publishArenaStandingsSwing(
    payload: ArenaStandingsSwingPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.arenaStandingsSwing,
      payload,
      private: true,
      topic: arenaLeaderboardChannel(),
    });
  }

  async publishLeagueBlogPublished(
    payload: BlogPublishedPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.blogPublished,
      payload,
      private: true,
      topic: leagueBlogChannel(payload.leagueId),
    });
  }

  async publishLeagueLeaderboardUpdated(
    payload: LeagueLeaderboardUpdatedPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.leagueLeaderboardUpdated,
      payload,
      private: true,
      topic: leagueLeaderboardChannel(payload.leagueId),
    });
  }

  async publishLeagueScoresUpdated(
    payload: ScoresUpdatedPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.scoresUpdated,
      payload,
      private: true,
      topic: leagueScoresChannel(payload.leagueId),
    });
  }

  private async broadcast({
    event,
    payload,
    private: isPrivate,
    topic,
  }: {
    event: string;
    payload: unknown;
    private: boolean;
    topic: string;
  }): Promise<void> {
    const endpoint = new URL(
      `${this.url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(event)}`,
    );
    if (isPrivate) {
      endpoint.searchParams.set("private", "true");
    }

    const response = await this.fetchFn(endpoint, {
      body: JSON.stringify(payload),
      headers: {
        apikey: this.apiKey,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new AppError({
        code: "REALTIME_BROADCAST_FAILED",
        message: `Realtime broadcast failed with status ${response.status}`,
        status: 502,
      });
    }
  }
}
