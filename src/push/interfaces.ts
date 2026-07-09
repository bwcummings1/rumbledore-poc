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

export const NOTIFICATION_EVENT_FAMILY_VALUES = [
  "content",
  "lore",
  "bets",
  "arena",
] as const;

export type NotificationEventFamily =
  (typeof NOTIFICATION_EVENT_FAMILY_VALUES)[number];

export const NOTIFICATION_CHANNEL_VALUES = ["push", "digest", "none"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNEL_VALUES)[number];

export const PUSH_EVENT_FAMILIES = {
  [PUSH_EVENTS.arenaRivalPassed]: "arena",
  [PUSH_EVENTS.contentRetracted]: "content",
  [PUSH_EVENTS.contentSuperseded]: "content",
  [PUSH_EVENTS.leagueBetSettled]: "bets",
  [PUSH_EVENTS.leagueBlogPublished]: "content",
  [PUSH_EVENTS.leagueLoreCanonized]: "lore",
  [PUSH_EVENTS.leagueLoreVoteOpened]: "lore",
} as const satisfies Record<PushEventType, NotificationEventFamily>;

export const DEFAULT_NOTIFICATION_CHANNEL_BY_FAMILY = {
  arena: "push",
  bets: "push",
  content: "digest",
  lore: "push",
} as const satisfies Record<NotificationEventFamily, NotificationChannel>;

export const NOTIFICATION_FAMILY_REPRESENTATIVE_EVENT = {
  arena: PUSH_EVENTS.arenaRivalPassed,
  bets: PUSH_EVENTS.leagueBetSettled,
  content: PUSH_EVENTS.leagueBlogPublished,
  lore: PUSH_EVENTS.leagueLoreVoteOpened,
} as const satisfies Record<NotificationEventFamily, PushEventType>;

export const DIGEST_NOTIFICATION_EVENT_FAMILY = "content" as const;

export function notificationFamilyForPushEvent(
  type: PushEventType,
): NotificationEventFamily {
  return PUSH_EVENT_FAMILIES[type];
}

export function defaultNotificationChannelForFamily(
  family: NotificationEventFamily,
): NotificationChannel {
  return DEFAULT_NOTIFICATION_CHANNEL_BY_FAMILY[family];
}

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
