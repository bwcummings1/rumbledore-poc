import type { BlogPublishedPayload, RealtimePublisher } from "./interfaces";

export class NoopRealtimePublisher implements RealtimePublisher {
  async publishLeagueBlogPublished(
    _payload: BlogPublishedPayload,
  ): Promise<void> {
    return;
  }
}

export class RecordingRealtimePublisher implements RealtimePublisher {
  readonly blogPublished: BlogPublishedPayload[] = [];

  async publishLeagueBlogPublished(
    payload: BlogPublishedPayload,
  ): Promise<void> {
    this.blogPublished.push(payload);
  }
}
