// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ENTITLEMENT_CAPS, parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import {
  entitlementEvents,
  leagueEntitlements,
  leagues,
  userEntitlements,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { grantEntitlementAsAdmin } from "./admin";
import { resolveEntitlement } from "./resolver";

const marker = `entitlement-admin-${randomUUID()}`;

let handle: DbHandle;

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `Entitlement Admin ${tag}`,
      email: `${marker}-${tag}@example.test`,
    })
    .returning();
  if (!user) throw new Error(`failed to seed ${tag} user`);
  return user;
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: `Entitlement Admin ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
    })
    .returning();
  if (!league) throw new Error(`failed to seed ${tag} league`);
  return league;
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
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("grantEntitlementAsAdmin", () => {
  it("grants a premium league entitlement, audits it, and resolves as entitled", async () => {
    const actor = await seedUser("league-actor");
    const league = await seedLeague("league-grant");
    const expiresAt = new Date("2026-12-31T00:00:00.000Z");

    const result = await grantEntitlementAsAdmin(handle.db, {
      actorUserId: actor.id,
      capsOverride: { aiPostsPerWeek: 3 },
      expiresAt,
      leagueId: league.id,
      reason: "launch comp",
      scope: "league",
      source: "comp",
      tier: "premium",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entitlement).toMatchObject({
      capsOverride: { aiPostsPerWeek: 3 },
      grantedBy: actor.id,
      leagueId: league.id,
      source: "comp",
      status: "active",
      tier: "premium",
    });
    expect(result.value.entitlement.expiresAt?.toISOString()).toBe(
      expiresAt.toISOString(),
    );
    expect(result.value.event).toMatchObject({
      action: "grant",
      actorUserId: actor.id,
      leagueEntitlementId: result.value.entitlement.id,
      leagueId: league.id,
      reason: "launch comp",
      source: "comp",
      userId: null,
    });
    expect(result.value.event.beforeState).toMatchObject({ tier: "free" });
    expect(result.value.event.afterState).toMatchObject({
      capsOverride: { aiPostsPerWeek: 3 },
      tier: "premium",
    });

    await expect(
      resolveEntitlement({
        capability: "ai.cast.generate",
        db: handle.db,
        env: {
          entitlements: {
            caps: DEFAULT_ENTITLEMENT_CAPS,
            devOverride: false,
            gateArenaAdvanced: false,
          },
        },
        leagueId: league.id,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      caps: { aiPostsPerWeek: 3 },
      reason: "ENTITLED",
      tier: "premium",
    });
  });

  it("updates an existing league entitlement and records the prior state", async () => {
    const actor = await seedUser("league-update-actor");
    const league = await seedLeague("league-update");
    await handle.db.insert(leagueEntitlements).values({
      leagueId: league.id,
      source: "granted",
      tier: "free",
    });

    const result = await grantEntitlementAsAdmin(handle.db, {
      actorUserId: actor.id,
      leagueId: league.id,
      reason: "manual upgrade",
      scope: "league",
      source: "granted",
      tier: "premium",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entitlement).toMatchObject({
      leagueId: league.id,
      tier: "premium",
    });
    expect(result.value.event.beforeState).toMatchObject({
      leagueId: league.id,
      tier: "free",
    });
    expect(result.value.event.afterState).toMatchObject({
      leagueId: league.id,
      tier: "premium",
    });

    const rows = await handle.db
      .select()
      .from(leagueEntitlements)
      .where(eq(leagueEntitlements.leagueId, league.id));
    expect(rows).toHaveLength(1);
  });

  it("grants an individual user entitlement and writes a user-scoped audit event", async () => {
    const actor = await seedUser("user-actor");
    const user = await seedUser("user-target");

    const result = await grantEntitlementAsAdmin(handle.db, {
      actorUserId: actor.id,
      reason: "support comp",
      scope: "user",
      source: "dev",
      userId: user.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entitlement).toMatchObject({
      grantedBy: actor.id,
      source: "dev",
      status: "active",
      tier: "individual",
      userId: user.id,
    });
    expect(result.value.event).toMatchObject({
      action: "grant",
      actorUserId: actor.id,
      leagueId: null,
      reason: "support comp",
      source: "dev",
      userEntitlementId: result.value.entitlement.id,
      userId: user.id,
    });
    expect(result.value.event.beforeState).toMatchObject({ tier: "none" });

    const [event] = await handle.db
      .select()
      .from(entitlementEvents)
      .where(eq(entitlementEvents.id, result.value.event.id));
    expect(event).toMatchObject({
      leagueId: null,
      userId: user.id,
    });

    await expect(
      resolveEntitlement({
        capability: "ai.individual.agent",
        db: handle.db,
        env: {
          entitlements: {
            caps: DEFAULT_ENTITLEMENT_CAPS,
            devOverride: false,
            gateArenaAdvanced: false,
          },
        },
        userId: user.id,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "ENTITLED",
      tier: "individual",
    });

    const userRows = await handle.db
      .select()
      .from(userEntitlements)
      .where(eq(userEntitlements.userId, user.id));
    expect(userRows).toHaveLength(1);
  });
});
