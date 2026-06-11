// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "./client";
import { leagues, members, users } from "./schema";
import { migrateSerialized } from "./test-support";

/**
 * Integration test against the local stack (`pnpm db:up`). Verifies the
 * baseline migration: tables, constraints, cascades, and the pgvector
 * extension. All rows it creates are tagged with a run-unique marker and
 * removed afterwards.
 */

const marker = `dbtest-${randomUUID()}`;
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
  // Idempotent: re-applying on an already-migrated database is a no-op.
  await migrateSerialized(handle);
});

afterAll(async () => {
  if (!handle) return;
  // Users/leagues cascade to auth-plane members.
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("baseline schema (users, leagues, auth-plane members)", () => {
  it("has the pgvector extension installed", async () => {
    const { rows } = await handle.pool.query(
      "select extname from pg_extension where extname = 'vector'",
    );
    expect(rows).toHaveLength(1);
  });

  it("does not expose the legacy league_members table", async () => {
    const { rows } = await handle.pool.query(
      "select to_regclass('public.league_members') as table_name",
    );
    expect(rows).toEqual([{ table_name: null }]);
  });

  it("inserts a user, league, and membership with generated defaults", async () => {
    const [user] = await handle.db
      .insert(users)
      .values({ email: `${marker}-a@example.com`, displayName: "Test A" })
      .returning();
    const [league] = await handle.db
      .insert(leagues)
      .values({
        provider: "espn",
        providerLeagueId: `${marker}-95050`,
        name: "NHS Alumni Annual (test)",
      })
      .returning();
    const [member] = await handle.db
      .insert(members)
      .values({
        organizationId: league.id,
        userId: user.id,
        role: "commissioner",
      })
      .returning();

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(member.organizationId).toBe(league.id);
    expect(member.role).toBe("commissioner");
  });

  it("defaults membership role to member", async () => {
    const [user] = await handle.db
      .insert(users)
      .values({ email: `${marker}-b@example.com`, displayName: "Test B" })
      .returning();
    const [league] = await handle.db
      .insert(leagues)
      .values({
        provider: "sleeper",
        providerLeagueId: `${marker}-b`,
        name: "Role default (test)",
      })
      .returning();
    const [member] = await handle.db
      .insert(members)
      .values({ organizationId: league.id, userId: user.id })
      .returning();
    expect(member.role).toBe("member");
  });

  it("rejects duplicate {provider, providerLeagueId} but allows the same id under another provider", async () => {
    const ref = `${marker}-dup`;
    await handle.db
      .insert(leagues)
      .values({ provider: "espn", providerLeagueId: ref, name: "Original" });

    expect(
      await violatedConstraint(
        handle.db
          .insert(leagues)
          .values({ provider: "espn", providerLeagueId: ref, name: "Copy" }),
      ),
    ).toBe("leagues_provider_league_unique");

    await expect(
      handle.db
        .insert(leagues)
        .values({ provider: "yahoo", providerLeagueId: ref, name: "Yahoo" }),
    ).resolves.toBeDefined();
  });

  it("rejects duplicate user emails and duplicate league memberships", async () => {
    const [user] = await handle.db
      .insert(users)
      .values({ email: `${marker}-c@example.com`, displayName: "Test C" })
      .returning();
    expect(
      await violatedConstraint(
        handle.db.insert(users).values({
          email: `${marker}-c@example.com`,
          displayName: "Imposter",
        }),
      ),
    ).toBe("users_email_unique");

    const [league] = await handle.db
      .insert(leagues)
      .values({
        provider: "espn",
        providerLeagueId: `${marker}-c`,
        name: "Membership dup (test)",
      })
      .returning();
    await handle.db
      .insert(members)
      .values({ organizationId: league.id, userId: user.id });
    expect(
      await violatedConstraint(
        handle.db.insert(members).values({
          organizationId: league.id,
          userId: user.id,
          role: "data_steward",
        }),
      ),
    ).toBe("members_organization_user_unique");
  });

  it("cascades league deletion to memberships without touching the user", async () => {
    const [user] = await handle.db
      .insert(users)
      .values({ email: `${marker}-d@example.com`, displayName: "Test D" })
      .returning();
    const [league] = await handle.db
      .insert(leagues)
      .values({
        provider: "espn",
        providerLeagueId: `${marker}-d`,
        name: "Cascade (test)",
      })
      .returning();
    await handle.db
      .insert(members)
      .values({ organizationId: league.id, userId: user.id });

    await handle.db.delete(leagues).where(sql`${leagues.id} = ${league.id}`);

    const orphaned = await handle.db
      .select()
      .from(members)
      .where(sql`${members.organizationId} = ${league.id}`);
    expect(orphaned).toHaveLength(0);

    const stillThere = await handle.db
      .select()
      .from(users)
      .where(sql`${users.id} = ${user.id}`);
    expect(stillThere).toHaveLength(1);
  });

  it("rejects membership rows pointing at a nonexistent league", async () => {
    const [user] = await handle.db
      .insert(users)
      .values({ email: `${marker}-e@example.com`, displayName: "Test E" })
      .returning();
    expect(
      await violatedConstraint(
        handle.db
          .insert(members)
          .values({ organizationId: randomUUID(), userId: user.id }),
      ),
    ).toBe("members_organization_id_leagues_id_fk");
  });
});
