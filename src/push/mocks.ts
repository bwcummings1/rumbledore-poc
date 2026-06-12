import type {
  LeaguePushNotificationInput,
  PushDeliverySummary,
  PushNotifier,
} from "./interfaces";

export class NoopPushNotifier implements PushNotifier {
  async notifyLeague(): Promise<PushDeliverySummary> {
    return { attempted: 0, expired: 0, failed: 0, sent: 0 };
  }
}

export class RecordingPushNotifier implements PushNotifier {
  readonly notifications: LeaguePushNotificationInput[] = [];

  async notifyLeague(
    input: LeaguePushNotificationInput,
  ): Promise<PushDeliverySummary> {
    this.notifications.push(input);
    return { attempted: 1, expired: 0, failed: 0, sent: 1 };
  }
}
