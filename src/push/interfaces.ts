export const PUSH_EVENTS = {
  leagueBetSettled: "league.bet.settled",
  leagueBlogPublished: "league.blog.published",
} as const;

export type PushEventType = (typeof PUSH_EVENTS)[keyof typeof PUSH_EVENTS];

export interface BrowserPushSubscriptionInput {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
}

export interface PushNotificationPayload {
  at: string;
  body: string;
  leagueId: string;
  tag: string;
  title: string;
  type: PushEventType;
  url: string;
  v: 1;
}

export interface LeaguePushNotificationInput {
  at?: Date;
  body: string;
  leagueId: string;
  tag?: string;
  title: string;
  type: PushEventType;
  url: string;
  userIds?: readonly string[];
}

export interface PushDeliverySummary {
  attempted: number;
  expired: number;
  failed: number;
  sent: number;
}

export interface PushNotifier {
  notifyLeague(
    input: LeaguePushNotificationInput,
  ): Promise<PushDeliverySummary>;
}
