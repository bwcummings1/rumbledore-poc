import { and, eq, inArray, isNull } from "drizzle-orm";
import webpush from "web-push";
import { logger } from "@/core/logging";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { pushSubscriptions } from "@/db/schema";
import type {
  LeaguePushNotificationInput,
  PushDeliverySummary,
  PushNotificationPayload,
  PushNotifier,
} from "./interfaces";

type WebPushSubscription = Parameters<typeof webpush.sendNotification>[0];
type SendNotification = typeof webpush.sendNotification;
export type SendWebPushNotification = SendNotification;

export interface WebPushNotifierOptions {
  db: Db;
  privateKey: string;
  publicKey: string;
  sendNotification?: SendWebPushNotification;
  subject: string;
}

interface PushSubscriptionRow {
  authSecret: string;
  endpoint: string;
  expirationTime: Date | null;
  id: string;
  p256dh: string;
}

function notificationAt(input: LeaguePushNotificationInput): Date {
  return input.at ?? new Date();
}

function tagFor(input: LeaguePushNotificationInput): string {
  return input.tag ?? `${input.type}:${input.leagueId}`;
}

function payloadFor(
  input: LeaguePushNotificationInput,
): PushNotificationPayload {
  return {
    at: notificationAt(input).toISOString(),
    body: input.body,
    leagueId: input.leagueId,
    tag: tagFor(input),
    title: input.title,
    type: input.type,
    url: input.url,
    v: 1,
  };
}

function toWebPushSubscription(row: PushSubscriptionRow): WebPushSubscription {
  return {
    endpoint: row.endpoint,
    expirationTime: row.expirationTime?.getTime() ?? null,
    keys: {
      auth: row.authSecret,
      p256dh: row.p256dh,
    },
  };
}

function errorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const candidate = error as { status?: unknown; statusCode?: unknown };
  if (typeof candidate.statusCode === "number") {
    return candidate.statusCode;
  }
  if (typeof candidate.status === "number") {
    return candidate.status;
  }
  return null;
}

function isExpiredSubscriptionError(error: unknown): boolean {
  const statusCode = errorStatusCode(error);
  return statusCode === 404 || statusCode === 410;
}

async function loadActiveSubscriptions(
  db: Db,
  input: Pick<LeaguePushNotificationInput, "leagueId" | "userIds">,
): Promise<PushSubscriptionRow[]> {
  const userIds = [...new Set(input.userIds ?? [])];
  if (input.userIds !== undefined && userIds.length === 0) {
    return [];
  }

  return withLeagueContext(db, input.leagueId, async (tx) => {
    const filters = [
      eq(pushSubscriptions.leagueId, input.leagueId),
      eq(pushSubscriptions.status, "active"),
      isNull(pushSubscriptions.disabledAt),
    ];
    if (userIds.length > 0) {
      filters.push(inArray(pushSubscriptions.userId, userIds));
    }

    return tx
      .select({
        authSecret: pushSubscriptions.authSecret,
        endpoint: pushSubscriptions.endpoint,
        expirationTime: pushSubscriptions.expirationTime,
        id: pushSubscriptions.id,
        p256dh: pushSubscriptions.p256dh,
      })
      .from(pushSubscriptions)
      .where(and(...filters));
  });
}

async function disableExpiredSubscriptions(
  db: Db,
  input: { ids: readonly string[]; leagueId: string; now: Date },
): Promise<void> {
  const ids = [...new Set(input.ids)];
  if (ids.length === 0) {
    return;
  }

  await withLeagueContext(db, input.leagueId, async (tx) => {
    await tx
      .update(pushSubscriptions)
      .set({
        disabledAt: input.now,
        status: "disabled",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(pushSubscriptions.leagueId, input.leagueId),
          inArray(pushSubscriptions.id, ids),
        ),
      );
  });
}

export class WebPushNotifier implements PushNotifier {
  private readonly db: Db;
  private readonly sendNotification: SendNotification;

  constructor({
    db,
    privateKey,
    publicKey,
    sendNotification,
    subject,
  }: WebPushNotifierOptions) {
    this.db = db;
    if (sendNotification) {
      this.sendNotification = sendNotification;
    } else {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.sendNotification = webpush.sendNotification.bind(webpush);
    }
  }

  async notifyLeague(
    input: LeaguePushNotificationInput,
  ): Promise<PushDeliverySummary> {
    const rows = await loadActiveSubscriptions(this.db, input);
    const payload = JSON.stringify(payloadFor(input));
    const expiredIds: string[] = [];
    const summary: PushDeliverySummary = {
      attempted: rows.length,
      expired: 0,
      failed: 0,
      sent: 0,
    };

    for (const row of rows) {
      try {
        await this.sendNotification(toWebPushSubscription(row), payload, {
          TTL: 60 * 60,
          urgency: "normal",
        });
        summary.sent += 1;
      } catch (error) {
        if (isExpiredSubscriptionError(error)) {
          expiredIds.push(row.id);
          summary.expired += 1;
        } else {
          summary.failed += 1;
          logger.warn("Web push delivery failed", {
            errorStatus: errorStatusCode(error),
            leagueId: input.leagueId,
            type: input.type,
          });
        }
      }
    }

    await disableExpiredSubscriptions(this.db, {
      ids: expiredIds,
      leagueId: input.leagueId,
      now: notificationAt(input),
    });

    return summary;
  }
}
