// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  leagues,
  members,
  pushNotificationPreferences,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { PUSH_EVENTS } from "./interfaces";
import {
  isPushNotificationEnabled,
  setPushNotificationPreference,
} from "./preferences";

const marker = `pushpref-${randomUUID()}`;
let handle: DbHandle;
let leagueId: string;
let otherLeagueId: string;
let userId: string;

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
      displayName: "Push Pref User",
      email: `${marker}@example.test`,
    })
    .returning({ id: users.id });
  const [league, otherLeague] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Push Pref League",
        provider: "espn",
        providerLeagueId: marker,
      },
      {
        name: "Push Pref Other League",
        provider: "espn",
        providerLeagueId: `${marker}-other`,
      },
    ])
    .returning({ id: leagues.id });
  if (!user || !league || !otherLeague) {
    throw new Error("push preference seed failed");
  }
  userId = user.id;
  leagueId = league.id;
  otherLeagueId = otherLeague.id;
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
    .where(sql`${leagues.providerLeagueId} like ${`${marker}%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} = ${`${marker}@example.test`}`);
  await handle.pool.end();
});

describe("push notification preferences", () => {
  it("defaults missing preferences to enabled and upserts explicit choices", async () => {
    await expect(
      isPushNotificationEnabled(handle.db, {
        leagueId,
        type: PUSH_EVENTS.arenaRivalPassed,
        userId,
      }),
    ).resolves.toBe(true);

    const disabled = await setPushNotificationPreference(
      { db: handle.db, now: () => new Date("2026-06-15T10:00:00.000Z") },
      {
        enabled: false,
        leagueId,
        type: PUSH_EVENTS.arenaRivalPassed,
        userId,
      },
    );
    expect(disabled).toMatchObject({
      ok: true,
      value: {
        enabled: false,
        leagueId,
        type: "arena.rival.passed",
        userId,
      },
    });

    const [saved] = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(pushNotificationPreferences)
        .where(eq(pushNotificationPreferences.userId, userId)),
    );
    expect(saved).toMatchObject({
      enabled: false,
      leagueId,
      type: "arena.rival.passed",
      userId,
    });
    await expect(
      isPushNotificationEnabled(handle.db, {
        leagueId,
        type: PUSH_EVENTS.arenaRivalPassed,
        userId,
      }),
    ).resolves.toBe(false);

    const enabled = await setPushNotificationPreference(
      { db: handle.db, now: () => new Date("2026-06-15T11:00:00.000Z") },
      {
        enabled: true,
        leagueId,
        type: PUSH_EVENTS.arenaRivalPassed,
        userId,
      },
    );
    expect(enabled).toMatchObject({
      ok: true,
      value: { enabled: true },
    });
    await expect(
      isPushNotificationEnabled(handle.db, {
        leagueId,
        type: PUSH_EVENTS.arenaRivalPassed,
        userId,
      }),
    ).resolves.toBe(true);
  });

  it("rejects preference writes for leagues the user does not belong to", async () => {
    const result = await setPushNotificationPreference(
      { db: handle.db },
      {
        enabled: false,
        leagueId: otherLeagueId,
        type: PUSH_EVENTS.leagueLoreVoteOpened,
        userId,
      },
    );

    expect(result).toMatchObject({
      error: { code: "PUSH_PREFERENCE_LEAGUE_FORBIDDEN", status: 403 },
      ok: false,
    });
  });
});
