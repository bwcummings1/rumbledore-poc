// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { leagues, members, pushSubscriptions, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  disablePushSubscription,
  getPushSubscriptionStatus,
  pushEndpointHash,
  upsertPushSubscription,
} from "./subscriptions";

const marker = `pushtest-${randomUUID()}`;
const endpoint = `https://push.example.test/${marker}/subscription`;
let handle: DbHandle;
let userId: string;
let otherUserId: string;
let leagueId: string;
let otherLeagueId: string;

function subscription(subscriptionEndpoint = endpoint) {
  return {
    endpoint: subscriptionEndpoint,
    expirationTime: Date.parse("2037-09-01T00:00:00.000Z"),
    keys: {
      auth: `${marker}-auth-secret`,
      p256dh: `${marker}-p256dh`,
    },
  };
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
      displayName: "Push User",
      email: `${marker}-member@example.test`,
    })
    .returning();
  const [otherUser] = await handle.db
    .insert(users)
    .values({
      displayName: "Other Push User",
      email: `${marker}-other@example.test`,
    })
    .returning();
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: "Push League",
      provider: "espn",
      providerLeagueId: marker,
    })
    .returning();
  const [otherLeague] = await handle.db
    .insert(leagues)
    .values({
      name: "Other Push League",
      provider: "espn",
      providerLeagueId: `${marker}-other-league`,
    })
    .returning();
  if (!user || !otherUser || !league || !otherLeague) {
    throw new Error("push test seed failed");
  }
  userId = user.id;
  otherUserId = otherUser.id;
  leagueId = league.id;
  otherLeagueId = otherLeague.id;

  await handle.db.insert(members).values([
    {
      organizationId: leagueId,
      role: "member",
      userId,
    },
    {
      organizationId: otherLeagueId,
      role: "member",
      userId,
    },
  ]);
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("push subscription mutations", () => {
  it("upserts a member subscription under league RLS", async () => {
    const result = await upsertPushSubscription(
      { db: handle.db, now: () => new Date("2026-06-12T12:00:00.000Z") },
      {
        leagueId,
        subscription: subscription(),
        userAgent: "vitest",
        userId,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("active");

    const rows = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.leagueId, leagueId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      endpoint,
      endpointHash: pushEndpointHash(endpoint),
      status: "active",
      userAgent: "vitest",
      userId,
    });
  });

  it("rejects non-member subscription writes before setting league context", async () => {
    const result = await upsertPushSubscription(
      { db: handle.db },
      {
        leagueId,
        subscription: {
          ...subscription(),
          endpoint: `${endpoint}/other`,
        },
        userAgent: "vitest",
        userId: otherUserId,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(403);
    expect(result.error.code).toBe("PUSH_LEAGUE_FORBIDDEN");
  });

  it("reports active status only for the matching league endpoint row", async () => {
    const statusEndpoint = `${endpoint}/status`;
    const upserted = await upsertPushSubscription(
      { db: handle.db, now: () => new Date("2026-06-12T12:30:00.000Z") },
      {
        leagueId,
        subscription: subscription(statusEndpoint),
        userAgent: "vitest",
        userId,
      },
    );
    expect(upserted.ok).toBe(true);

    const active = await getPushSubscriptionStatus(
      { db: handle.db },
      { endpoint: statusEndpoint, leagueId, userId },
    );
    expect(active).toEqual({
      ok: true,
      value: { id: expect.any(String), status: "active" },
    });

    const otherLeague = await getPushSubscriptionStatus(
      { db: handle.db },
      { endpoint: statusEndpoint, leagueId: otherLeagueId, userId },
    );
    expect(otherLeague).toEqual({
      ok: true,
      value: { id: null, status: "disabled" },
    });
  });

  it("disables only the member's matching league subscription", async () => {
    const result = await disablePushSubscription(
      { db: handle.db, now: () => new Date("2026-06-12T13:00:00.000Z") },
      { endpoint, leagueId, userId },
    );

    expect(result.ok).toBe(true);
    const rows = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select({
          disabledAt: pushSubscriptions.disabledAt,
          status: pushSubscriptions.status,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpointHash, pushEndpointHash(endpoint))),
    );
    expect(rows).toEqual([
      {
        disabledAt: new Date("2026-06-12T13:00:00.000Z"),
        status: "disabled",
      },
    ]);
  });
});
