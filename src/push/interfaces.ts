export const PUSH_EVENT_VALUES = [
  "league.bet.settled",
  "league.blog.published",
  "league.lore.vote.opened",
  "league.lore.canonized",
  "arena.rival.passed",
  "content.retracted",
  "content.superseded",
] as const;

export const PUSH_EVENTS = {
  arenaRivalPassed: "arena.rival.passed",
  leagueBetSettled: "league.bet.settled",
  leagueBlogPublished: "league.blog.published",
  leagueLoreCanonized: "league.lore.canonized",
  leagueLoreVoteOpened: "league.lore.vote.opened",
  contentRetracted: "content.retracted",
  contentSuperseded: "content.superseded",
} as const satisfies Record<string, (typeof PUSH_EVENT_VALUES)[number]>;

export type PushEventType = (typeof PUSH_EVENT_VALUES)[number];

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
