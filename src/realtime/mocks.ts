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
  type RealtimeChannel,
  type RealtimeEventType,
  type RealtimePayload,
  type RealtimePublisher,
  type ScoresUpdatedPayload,
} from "./interfaces";

function contentLifecycleChannel(payload: {
  leagueId: string | null;
}): RealtimeChannel {
  return payload.leagueId
    ? leagueBlogChannel(payload.leagueId)
    : centralNewsChannel();
}

export class NoopRealtimePublisher implements RealtimePublisher {
  async publishArenaLeaderboardUpdated(
    _payload: ArenaLeaderboardUpdatedPayload,
  ): Promise<void> {
    return;
  }

  async publishArenaStandingsSwing(
    _payload: ArenaStandingsSwingPayload,
  ): Promise<void> {
    return;
  }

  async publishContentRetracted(
    _payload: ContentRetractedPayload,
  ): Promise<void> {
    return;
  }

  async publishContentSuperseded(
    _payload: ContentSupersededPayload,
  ): Promise<void> {
    return;
  }

  async publishLeagueBlogPublished(
    _payload: BlogPublishedPayload,
  ): Promise<void> {
    return;
  }

  async publishLeagueHistoryImportProgress(
    _payload: HistoryImportProgressPayload,
  ): Promise<void> {
    return;
  }

  async publishLeagueLeaderboardUpdated(
    _payload: LeagueLeaderboardUpdatedPayload,
  ): Promise<void> {
    return;
  }

  async publishLeagueLoreCanonized(
    _payload: LoreCanonizedPayload,
  ): Promise<void> {
    return;
  }

  async publishLeagueLoreVoteOpened(
    _payload: LoreVoteOpenedPayload,
  ): Promise<void> {
    return;
  }

  async publishLeagueScoresUpdated(
    _payload: ScoresUpdatedPayload,
  ): Promise<void> {
    return;
  }
}

export class RecordingRealtimePublisher implements RealtimePublisher {
  readonly arenaLeaderboardUpdated: ArenaLeaderboardUpdatedPayload[] = [];
  readonly arenaStandingsSwing: ArenaStandingsSwingPayload[] = [];
  readonly blogPublished: BlogPublishedPayload[] = [];
  readonly contentRetracted: ContentRetractedPayload[] = [];
  readonly contentSuperseded: ContentSupersededPayload[] = [];
  readonly historyImportProgress: HistoryImportProgressPayload[] = [];
  readonly leagueLeaderboardUpdated: LeagueLeaderboardUpdatedPayload[] = [];
  readonly loreCanonized: LoreCanonizedPayload[] = [];
  readonly loreVoteOpened: LoreVoteOpenedPayload[] = [];
  readonly scoresUpdated: ScoresUpdatedPayload[] = [];

  async publishArenaLeaderboardUpdated(
    payload: ArenaLeaderboardUpdatedPayload,
  ): Promise<void> {
    this.arenaLeaderboardUpdated.push(payload);
  }

  async publishArenaStandingsSwing(
    payload: ArenaStandingsSwingPayload,
  ): Promise<void> {
    this.arenaStandingsSwing.push(payload);
  }

  async publishContentRetracted(
    payload: ContentRetractedPayload,
  ): Promise<void> {
    this.contentRetracted.push(payload);
  }

  async publishContentSuperseded(
    payload: ContentSupersededPayload,
  ): Promise<void> {
    this.contentSuperseded.push(payload);
  }

  async publishLeagueBlogPublished(
    payload: BlogPublishedPayload,
  ): Promise<void> {
    this.blogPublished.push(payload);
  }

  async publishLeagueHistoryImportProgress(
    payload: HistoryImportProgressPayload,
  ): Promise<void> {
    this.historyImportProgress.push(payload);
  }

  async publishLeagueLeaderboardUpdated(
    payload: LeagueLeaderboardUpdatedPayload,
  ): Promise<void> {
    this.leagueLeaderboardUpdated.push(payload);
  }

  async publishLeagueLoreCanonized(
    payload: LoreCanonizedPayload,
  ): Promise<void> {
    this.loreCanonized.push(payload);
  }

  async publishLeagueLoreVoteOpened(
    payload: LoreVoteOpenedPayload,
  ): Promise<void> {
    this.loreVoteOpened.push(payload);
  }

  async publishLeagueScoresUpdated(
    payload: ScoresUpdatedPayload,
  ): Promise<void> {
    this.scoresUpdated.push(payload);
  }
}

export type InProcessRealtimeHandler = (message: {
  event: RealtimeEventType;
  payload: RealtimePayload;
  topic: RealtimeChannel;
}) => void | Promise<void>;

function subscriptionKey(topic: RealtimeChannel, event: RealtimeEventType) {
  return `${topic}\n${event}`;
}

export class InProcessRealtimePublisher implements RealtimePublisher {
  private readonly handlers = new Map<string, Set<InProcessRealtimeHandler>>();

  subscribe(
    topic: RealtimeChannel,
    event: RealtimeEventType,
    handler: InProcessRealtimeHandler,
  ): () => void {
    const key = subscriptionKey(topic, event);
    const handlers =
      this.handlers.get(key) ?? new Set<InProcessRealtimeHandler>();
    handlers.add(handler);
    this.handlers.set(key, handlers);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(key);
      }
    };
  }

  async publishArenaLeaderboardUpdated(
    payload: ArenaLeaderboardUpdatedPayload,
  ): Promise<void> {
    await this.publish(
      arenaLeaderboardChannel(),
      REALTIME_EVENTS.arenaLeaderboardUpdated,
      payload,
    );
  }

  async publishArenaStandingsSwing(
    payload: ArenaStandingsSwingPayload,
  ): Promise<void> {
    await this.publish(
      arenaLeaderboardChannel(),
      REALTIME_EVENTS.arenaStandingsSwing,
      payload,
    );
  }

  async publishContentRetracted(
    payload: ContentRetractedPayload,
  ): Promise<void> {
    await this.publish(
      contentLifecycleChannel(payload),
      REALTIME_EVENTS.contentRetracted,
      payload,
    );
  }

  async publishContentSuperseded(
    payload: ContentSupersededPayload,
  ): Promise<void> {
    await this.publish(
      contentLifecycleChannel(payload),
      REALTIME_EVENTS.contentSuperseded,
      payload,
    );
  }

  async publishLeagueBlogPublished(
    payload: BlogPublishedPayload,
  ): Promise<void> {
    await this.publish(
      leagueBlogChannel(payload.leagueId),
      REALTIME_EVENTS.blogPublished,
      payload,
    );
  }

  async publishLeagueHistoryImportProgress(
    payload: HistoryImportProgressPayload,
  ): Promise<void> {
    await this.publish(
      leagueHistoryChannel(payload.leagueId),
      REALTIME_EVENTS.historyImportProgress,
      payload,
    );
  }

  async publishLeagueLeaderboardUpdated(
    payload: LeagueLeaderboardUpdatedPayload,
  ): Promise<void> {
    await this.publish(
      leagueLeaderboardChannel(payload.leagueId),
      REALTIME_EVENTS.leagueLeaderboardUpdated,
      payload,
    );
  }

  async publishLeagueLoreCanonized(
    payload: LoreCanonizedPayload,
  ): Promise<void> {
    await this.publish(
      leagueLoreChannel(payload.leagueId),
      REALTIME_EVENTS.loreCanonized,
      payload,
    );
  }

  async publishLeagueLoreVoteOpened(
    payload: LoreVoteOpenedPayload,
  ): Promise<void> {
    await this.publish(
      leagueLoreChannel(payload.leagueId),
      REALTIME_EVENTS.loreVoteOpened,
      payload,
    );
  }

  async publishLeagueScoresUpdated(
    payload: ScoresUpdatedPayload,
  ): Promise<void> {
    await this.publish(
      leagueScoresChannel(payload.leagueId),
      REALTIME_EVENTS.scoresUpdated,
      payload,
    );
  }

  private async publish(
    topic: RealtimeChannel,
    event: RealtimeEventType,
    payload: RealtimePayload,
  ): Promise<void> {
    const handlers = this.handlers.get(subscriptionKey(topic, event));
    if (!handlers) {
      return;
    }

    for (const handler of [...handlers]) {
      await handler({ event, payload, topic });
    }
  }
}
