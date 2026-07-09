// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  leagues,
  members,
  pushNotificationPreferences,
  pushSubscriptions,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { PushNotificationPayload, SendWebPushNotification } from ".";
import { PUSH_EVENTS, WebPushNotifier } from ".";
import { upsertPushSubscription } from "./subscriptions";

const marker = `pushnotify-${randomUUID()}`;
const unusedPrivateKey = ["unused", "private"].join("-");
let handle: DbHandle;
let userId: string;
let otherUserId: string;
let leagueId: string;

function endpoint(tag: string) {
  return `https://push.example.test/${marker}/${tag}`;
}

async function seedSubscription(tag: string, targetUserId = userId) {
  const result = await upsertPushSubscription(
    { db: handle.db, now: () => new Date("2026-06-12T12:00:00.000Z") },
    {
      leagueId,
      subscription: {
        endpoint: endpoint(tag),
        expirationTime: null,
        keys: {
          auth: `${tag}-auth`,
          p256dh: `${tag}-p256dh`,
        },
      },
      userAgent: "vitest",
      userId: targetUserId,
    },
  );
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable - start the local stack with `pnpm db:up` before running tests.",
      { cause },
    );
  }
  await migrateSerialized(handle);

  const [user, otherUser] = await handle.db
    .insert(users)
    .values([
      {
        displayName: "Push Notify User",
        email: `${marker}@example.test`,
      },
      {
        displayName: "Push Notify Other User",
        email: `${marker}-other@example.test`,
      },
    ])
    .returning();
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: "Push Notify League",
      provider: "espn",
      providerLeagueId: marker,
    })
    .returning();
  if (!user || !otherUser || !league) {
    throw new Error("push notifier seed failed");
  }
  userId = user.id;
  otherUserId = otherUser.id;
  leagueId = league.id;
  await handle.db.insert(members).values([
    {
      organizationId: leagueId,
      role: "member",
      userId,
    },
    {
      organizationId: leagueId,
      role: "member",
      userId: otherUserId,
    },
  ]);
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} = ${marker}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}%@example.test`}`);
  await handle.pool.end();
});

describe("WebPushNotifier", () => {
  it("fans out league notifications to active subscriptions", async () => {
    await seedSubscription("active");
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      await tx.insert(pushNotificationPreferences).values({
        channel: "push",
        enabled: true,
        eventFamily: "content",
        leagueId,
        type: PUSH_EVENTS.leagueBlogPublished,
        userId,
      });
    });
    const calls: { endpoint: string; payload: PushNotificationPayload }[] = [];
    const sendNotification = vi.fn(async (subscription, payload) => {
      calls.push({
        endpoint: subscription.endpoint,
        payload: (await new Response(
          String(payload),
        ).json()) as PushNotificationPayload,
      });
      return { body: "", headers: {}, statusCode: 201 };
    }) as unknown as SendWebPushNotification;
    const notifier = new WebPushNotifier({
      db: handle.db,
      privateKey: unusedPrivateKey,
      publicKey: "unused-public",
      sendNotification,
      subject: "mailto:ops@example.invalid",
    });

    const summary = await notifier.notifyLeague({
      at: new Date("2026-06-12T14:00:00.000Z"),
      body: "A new recap is ready.",
      leagueId,
      tag: `league:${leagueId}:blog:post-1`,
      title: "New league post",
      type: PUSH_EVENTS.leagueBlogPublished,
      url: `/leagues/${leagueId}/posts/post-1`,
    });

    expect(summary).toEqual({ attempted: 1, expired: 0, failed: 0, sent: 1 });
    expect(calls).toEqual([
      {
        endpoint: endpoint("active"),
        payload: {
          at: "2026-06-12T14:00:00.000Z",
          body: "A new recap is ready.",
          leagueId,
          tag: `league:${leagueId}:blog:post-1`,
          title: "New league post",
          type: "league.blog.published",
          url: `/leagues/${leagueId}/posts/post-1`,
          v: 1,
        },
      },
    ]);
  });

  it("treats an explicit empty user list as no recipients", async () => {
    await seedSubscription("empty-user-list");
    const sendNotification = vi.fn(
      async () => ({ body: "", headers: {}, statusCode: 201 }) as const,
    ) as unknown as SendWebPushNotification;
    const notifier = new WebPushNotifier({
      db: handle.db,
      privateKey: unusedPrivateKey,
      publicKey: "unused-public",
      sendNotification,
      subject: "mailto:ops@example.invalid",
    });

    const summary = await notifier.notifyLeague({
      at: new Date("2026-06-12T14:30:00.000Z"),
      body: "Nobody should receive this personal fan-out.",
      leagueId,
      title: "No recipients",
      type: PUSH_EVENTS.leagueBetSettled,
      url: `/leagues/${leagueId}/bet`,
      userIds: [],
    });

    expect(summary).toEqual({ attempted: 0, expired: 0, failed: 0, sent: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("excludes a personally targeted opted-out user before delivery", async () => {
    await seedSubscription("personal-opt-out");
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      await tx.insert(pushNotificationPreferences).values({
        channel: "none",
        enabled: false,
        eventFamily: "arena",
        leagueId,
        type: PUSH_EVENTS.arenaRivalPassed,
        userId,
      });
    });
    const sendNotification = vi.fn(
      async () => ({ body: "", headers: {}, statusCode: 201 }) as const,
    ) as unknown as SendWebPushNotification;
    const notifier = new WebPushNotifier({
      db: handle.db,
      privateKey: unusedPrivateKey,
      publicKey: "unused-public",
      sendNotification,
      subject: "mailto:ops@example.invalid",
    });

    const summary = await notifier.notifyLeague({
      at: new Date("2026-06-12T14:45:00.000Z"),
      body: "A rival passed you.",
      leagueId,
      title: "Arena rank changed",
      type: PUSH_EVENTS.arenaRivalPassed,
      url: "/arena?season=season-1",
      userIds: [userId],
    });

    expect(summary).toEqual({ attempted: 0, expired: 0, failed: 0, sent: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("applies per-user opt-outs to league-wide fan-out", async () => {
    await seedSubscription("league-wide-opted-out", userId);
    await seedSubscription("league-wide-default-on", otherUserId);
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      await tx
        .insert(pushNotificationPreferences)
        .values({
          channel: "none",
          enabled: false,
          eventFamily: "lore",
          leagueId,
          type: PUSH_EVENTS.leagueLoreVoteOpened,
          userId,
        })
        .onConflictDoUpdate({
          target: [
            pushNotificationPreferences.leagueId,
            pushNotificationPreferences.userId,
            pushNotificationPreferences.eventFamily,
          ],
          set: { channel: "none", enabled: false },
        });
    });
    const calls: { endpoint: string; payload: PushNotificationPayload }[] = [];
    const sendNotification = vi.fn(async (subscription, payload) => {
      calls.push({
        endpoint: subscription.endpoint,
        payload: (await new Response(
          String(payload),
        ).json()) as PushNotificationPayload,
      });
      return { body: "", headers: {}, statusCode: 201 };
    }) as unknown as SendWebPushNotification;
    const notifier = new WebPushNotifier({
      db: handle.db,
      privateKey: unusedPrivateKey,
      publicKey: "unused-public",
      sendNotification,
      subject: "mailto:ops@example.invalid",
    });

    const summary = await notifier.notifyLeague({
      at: new Date("2026-06-12T14:50:00.000Z"),
      body: "Settle it.",
      leagueId,
      title: "Lore vote opened",
      type: PUSH_EVENTS.leagueLoreVoteOpened,
      url: `/leagues/${leagueId}/lore/claim-1`,
    });

    expect(summary.sent).toBeGreaterThanOrEqual(1);
    expect(calls.map((call) => call.endpoint)).toContain(
      endpoint("league-wide-default-on"),
    );
    expect(calls.map((call) => call.endpoint)).not.toContain(
      endpoint("league-wide-opted-out"),
    );
  });

  it("disables expired subscriptions after a 410 response", async () => {
    const saved = await seedSubscription("expired");
    const sendNotification = vi.fn(async () => {
      throw { statusCode: 410 };
    }) as unknown as SendWebPushNotification;
    const notifier = new WebPushNotifier({
      db: handle.db,
      privateKey: unusedPrivateKey,
      publicKey: "unused-public",
      sendNotification,
      subject: "mailto:ops@example.invalid",
    });

    const summary = await notifier.notifyLeague({
      at: new Date("2026-06-12T15:00:00.000Z"),
      body: "A bet settled.",
      leagueId,
      title: "Betting results are in",
      type: PUSH_EVENTS.leagueBetSettled,
      url: `/leagues/${leagueId}`,
    });

    expect(summary.expired).toBeGreaterThanOrEqual(1);
    const [row] = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select({
          disabledAt: pushSubscriptions.disabledAt,
          status: pushSubscriptions.status,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.id, saved.id ?? "")),
    );
    expect(row).toEqual({
      disabledAt: new Date("2026-06-12T15:00:00.000Z"),
      status: "disabled",
    });
  });
});
