// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { leagues, members, pushSubscriptions, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { PushNotificationPayload, SendWebPushNotification } from ".";
import { PUSH_EVENTS, WebPushNotifier } from ".";
import { upsertPushSubscription } from "./subscriptions";

const marker = `pushnotify-${randomUUID()}`;
const unusedPrivateKey = ["unused", "private"].join("-");
let handle: DbHandle;
let userId: string;
let leagueId: string;

function endpoint(tag: string) {
  return `https://push.example.test/${marker}/${tag}`;
}

async function seedSubscription(tag: string) {
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
      userId,
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

  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: "Push Notify User",
      email: `${marker}@example.test`,
    })
    .returning();
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: "Push Notify League",
      provider: "espn",
      providerLeagueId: marker,
    })
    .returning();
  if (!user || !league) {
    throw new Error("push notifier seed failed");
  }
  userId = user.id;
  leagueId = league.id;
  await handle.db.insert(members).values({
    organizationId: leagueId,
    role: "member",
    userId,
  });
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} = ${marker}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} = ${`${marker}@example.test`}`);
  await handle.pool.end();
});

describe("WebPushNotifier", () => {
  it("fans out league notifications to active subscriptions", async () => {
    await seedSubscription("active");
    const calls: { endpoint: string; payload: PushNotificationPayload }[] = [];
    const sendNotification = vi.fn(async (subscription, payload) => {
      calls.push({
        endpoint: subscription.endpoint,
        payload: JSON.parse(String(payload)) as PushNotificationPayload,
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
