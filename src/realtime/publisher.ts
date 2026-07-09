import { AppError } from "@/core/result";
import {
  type ArenaLeaderboardUpdatedPayload,
  type ArenaStandingsSwingPayload,
  arenaLeaderboardChannel,
  type BlogPublishedPayload,
  type ContentRetractedPayload,
  type ContentSupersededPayload,
  centralNewsChannel,
  type HistoryImportProgressPayload,
  type LeagueLeaderboardUpdatedPayload,
  type LoreCanonizedPayload,
  type LoreVoteOpenedPayload,
  leagueBlogChannel,
  leagueHistoryChannel,
  leagueLeaderboardChannel,
  leagueLoreChannel,
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

function contentLifecycleChannel(payload: { leagueId: string | null }): string {
  return payload.leagueId
    ? leagueBlogChannel(payload.leagueId)
    : centralNewsChannel();
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

  async publishContentRetracted(
    payload: ContentRetractedPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.contentRetracted,
      payload,
      private: true,
      topic: contentLifecycleChannel(payload),
    });
  }

  async publishContentSuperseded(
    payload: ContentSupersededPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.contentSuperseded,
      payload,
      private: true,
      topic: contentLifecycleChannel(payload),
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

  async publishLeagueHistoryImportProgress(
    payload: HistoryImportProgressPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.historyImportProgress,
      payload,
      private: true,
      topic: leagueHistoryChannel(payload.leagueId),
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

  async publishLeagueLoreCanonized(
    payload: LoreCanonizedPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.loreCanonized,
      payload,
      private: true,
      topic: leagueLoreChannel(payload.leagueId),
    });
  }

  async publishLeagueLoreVoteOpened(
    payload: LoreVoteOpenedPayload,
  ): Promise<void> {
    await this.broadcast({
      event: REALTIME_EVENTS.loreVoteOpened,
      payload,
      private: true,
      topic: leagueLoreChannel(payload.leagueId),
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
