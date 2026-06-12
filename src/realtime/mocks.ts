import {
  type BlogPublishedPayload,
  leagueBlogChannel,
  leagueScoresChannel,
  REALTIME_EVENTS,
  type RealtimeChannel,
  type RealtimeEventType,
  type RealtimePayload,
  type RealtimePublisher,
  type ScoresUpdatedPayload,
} from "./interfaces";

export class NoopRealtimePublisher implements RealtimePublisher {
  async publishLeagueBlogPublished(
    _payload: BlogPublishedPayload,
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
  readonly blogPublished: BlogPublishedPayload[] = [];
  readonly scoresUpdated: ScoresUpdatedPayload[] = [];

  async publishLeagueBlogPublished(
    payload: BlogPublishedPayload,
  ): Promise<void> {
    this.blogPublished.push(payload);
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

  async publishLeagueBlogPublished(
    payload: BlogPublishedPayload,
  ): Promise<void> {
    await this.publish(
      leagueBlogChannel(payload.leagueId),
      REALTIME_EVENTS.blogPublished,
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
