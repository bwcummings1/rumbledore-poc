// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "./client";
import {
  entitlementEvents,
  leagueEntitlements,
  leagues,
  userEntitlements,
  users,
} from "./schema";
import { migrateSerialized } from "./test-support";

const marker = `entitlement-${randomUUID()}`;

let handle: DbHandle;

/** Drizzle wraps pg errors; the violated constraint name lives on `cause.constraint`. */
async function violatedConstraint(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint ?? String(cause ?? error);
  }
  throw new Error("expected the query to be rejected, but it succeeded");
}

/** Drizzle wraps pg errors; the SQLSTATE lives on `cause.code`. */
async function sqlstateOf(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? String(cause ?? error);
  }
  throw new Error("expected the query to be rejected, but it succeeded");
}

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `Entitlement ${tag}`,
      email: `${marker}-${tag}@example.test`,
    })
    .returning();
  return user;
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: `Entitlement ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
    })
    .returning();
  return league;
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable — start the local stack with `pnpm db:up` before running tests.",
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

describe("entitlement auth-plane schema", () => {
  it("keeps entitlement tables central without restrictive RLS", async () => {
    const rlsRows = await handle.pool.query<{
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname in ('league_entitlements', 'user_entitlements', 'entitlement_events')
      order by relname
    `);

    expect(rlsRows.rows).toEqual([
      {
        relforcerowsecurity: false,
        relname: "entitlement_events",
        relrowsecurity: false,
      },
      {
        relforcerowsecurity: false,
        relname: "league_entitlements",
        relrowsecurity: false,
      },
      {
        relforcerowsecurity: false,
        relname: "user_entitlements",
        relrowsecurity: false,
      },
    ]);

    const policyRows = await handle.pool.query<{ tablename: string }>(`
      select tablename
      from pg_policies
      where tablename in ('league_entitlements', 'user_entitlements', 'entitlement_events')
    `);
    expect(policyRows.rows).toEqual([]);
  });

  it("defines the tier, status, source, and audit action enums", async () => {
    const { rows } = await handle.pool.query<{
      enum_name: string;
      values: string[];
    }>(`
      select t.typname as enum_name, json_agg(e.enumlabel order by e.enumsortorder) as values
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      where t.typname in (
        'league_entitlement_tier',
        'user_entitlement_tier',
        'entitlement_status',
        'entitlement_source',
        'entitlement_event_action'
      )
      group by t.typname
      order by t.typname
    `);

    expect(rows).toEqual([
      {
        enum_name: "entitlement_event_action",
        values: [
          "grant",
          "revoke",
          "expire",
          "suspend",
          "resume",
          "update_caps",
        ],
      },
      {
        enum_name: "entitlement_source",
        values: ["granted", "comp", "dev", "purchased"],
      },
      {
        enum_name: "entitlement_status",
        values: ["active", "expired", "suspended"],
      },
      { enum_name: "league_entitlement_tier", values: ["free", "premium"] },
      { enum_name: "user_entitlement_tier", values: ["individual"] },
    ]);
  });

  it("stores league, user, caps, expiry, and audit event metadata", async () => {
    const actor = await seedUser("store-actor");
    const personalUser = await seedUser("store-personal");
    const league = await seedLeague("store");
    const expiresAt = new Date("2026-12-31T00:00:00.000Z");

    const [leagueEntitlement] = await handle.db
      .insert(leagueEntitlements)
      .values({
        capsOverride: { aiPostsPerWeek: 12 },
        expiresAt,
        grantedBy: actor.id,
        leagueId: league.id,
        source: "comp",
        status: "active",
        tier: "premium",
      })
      .returning();
    const [userEntitlement] = await handle.db
      .insert(userEntitlements)
      .values({
        grantedBy: actor.id,
        source: "dev",
        userId: personalUser.id,
      })
      .returning();

    expect(leagueEntitlement).toMatchObject({
      capsOverride: { aiPostsPerWeek: 12 },
      grantedBy: actor.id,
      leagueId: league.id,
      source: "comp",
      status: "active",
      tier: "premium",
    });
    expect(leagueEntitlement.expiresAt?.toISOString()).toBe(
      expiresAt.toISOString(),
    );
    expect(userEntitlement).toMatchObject({
      grantedBy: actor.id,
      source: "dev",
      status: "active",
      tier: "individual",
      userId: personalUser.id,
    });

    const [leagueEvent] = await handle.db
      .insert(entitlementEvents)
      .values({
        action: "grant",
        afterState: { tier: "premium" },
        actorUserId: actor.id,
        beforeState: { tier: "free" },
        leagueEntitlementId: leagueEntitlement.id,
        leagueId: league.id,
        reason: "comped launch league",
        source: "comp",
      })
      .returning();
    const [userEvent] = await handle.db
      .insert(entitlementEvents)
      .values({
        action: "grant",
        afterState: { tier: "individual" },
        actorUserId: actor.id,
        reason: "dev personal agent access",
        source: "dev",
        userEntitlementId: userEntitlement.id,
        userId: personalUser.id,
      })
      .returning();

    expect(leagueEvent).toMatchObject({
      action: "grant",
      afterState: { tier: "premium" },
      beforeState: { tier: "free" },
      leagueId: league.id,
      reason: "comped launch league",
      source: "comp",
      userId: null,
    });
    expect(userEvent).toMatchObject({
      action: "grant",
      afterState: { tier: "individual" },
      leagueId: null,
      reason: "dev personal agent access",
      source: "dev",
      userId: personalUser.id,
    });
  });

  it("enforces one entitlement row per league and per user", async () => {
    const user = await seedUser("unique");
    const league = await seedLeague("unique");

    await handle.db
      .insert(leagueEntitlements)
      .values({ leagueId: league.id, tier: "premium" });
    await handle.db
      .insert(userEntitlements)
      .values({ tier: "individual", userId: user.id });

    expect(
      await violatedConstraint(
        handle.db
          .insert(leagueEntitlements)
          .values({ leagueId: league.id, tier: "free" }),
      ),
    ).toBe("league_entitlements_league_unique");
    expect(
      await violatedConstraint(
        handle.db
          .insert(userEntitlements)
          .values({ tier: "individual", userId: user.id }),
      ),
    ).toBe("user_entitlements_user_unique");
  });

  it("requires audit events to target exactly one entitlement scope", async () => {
    const user = await seedUser("scope");
    const league = await seedLeague("scope");

    expect(
      await violatedConstraint(
        handle.db.insert(entitlementEvents).values({
          action: "grant",
          leagueId: league.id,
          userId: user.id,
        }),
      ),
    ).toBe("entitlement_events_single_scope_check");

    expect(
      await violatedConstraint(
        handle.db.insert(entitlementEvents).values({
          action: "grant",
          reason: "missing target",
        }),
      ),
    ).toBe("entitlement_events_single_scope_check");
  });

  it("keeps entitlement events append-only while allowing FK maintenance updates", async () => {
    const actor = await seedUser("append-actor");
    const league = await seedLeague("append");
    const [leagueEntitlement] = await handle.db
      .insert(leagueEntitlements)
      .values({
        grantedBy: actor.id,
        leagueId: league.id,
        tier: "premium",
      })
      .returning();
    const [event] = await handle.db
      .insert(entitlementEvents)
      .values({
        action: "grant",
        actorUserId: actor.id,
        leagueEntitlementId: leagueEntitlement.id,
        leagueId: league.id,
        source: "granted",
      })
      .returning();

    await expect(
      sqlstateOf(
        handle.db
          .update(entitlementEvents)
          .set({ reason: "mutated" })
          .where(eq(entitlementEvents.id, event.id)),
      ),
    ).resolves.toBe("55000");
    await expect(
      sqlstateOf(
        handle.db
          .delete(entitlementEvents)
          .where(eq(entitlementEvents.id, event.id)),
      ),
    ).resolves.toBe("55000");

    await handle.db.delete(users).where(eq(users.id, actor.id));
    const [afterActorDelete] = await handle.db
      .select()
      .from(entitlementEvents)
      .where(eq(entitlementEvents.id, event.id));
    expect(afterActorDelete?.actorUserId).toBeNull();
  });

  it("cascades entitlement rows and scoped audit events when owners are deleted", async () => {
    const user = await seedUser("cascade-user");
    const league = await seedLeague("cascade-league");
    const [leagueEntitlement] = await handle.db
      .insert(leagueEntitlements)
      .values({ leagueId: league.id, tier: "premium" })
      .returning();
    const [userEntitlement] = await handle.db
      .insert(userEntitlements)
      .values({ userId: user.id })
      .returning();
    await handle.db.insert(entitlementEvents).values([
      {
        action: "grant",
        leagueEntitlementId: leagueEntitlement.id,
        leagueId: league.id,
        source: "granted",
      },
      {
        action: "grant",
        source: "granted",
        userEntitlementId: userEntitlement.id,
        userId: user.id,
      },
    ]);

    await handle.db.delete(leagues).where(eq(leagues.id, league.id));
    expect(
      await handle.db
        .select()
        .from(leagueEntitlements)
        .where(eq(leagueEntitlements.id, leagueEntitlement.id)),
    ).toHaveLength(0);
    expect(
      await handle.db
        .select()
        .from(entitlementEvents)
        .where(eq(entitlementEvents.leagueId, league.id)),
    ).toHaveLength(0);

    await handle.db.delete(users).where(eq(users.id, user.id));
    expect(
      await handle.db
        .select()
        .from(userEntitlements)
        .where(eq(userEntitlements.id, userEntitlement.id)),
    ).toHaveLength(0);
    expect(
      await handle.db
        .select()
        .from(entitlementEvents)
        .where(eq(entitlementEvents.userId, user.id)),
    ).toHaveLength(0);
  });
});
