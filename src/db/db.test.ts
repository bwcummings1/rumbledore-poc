// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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

/**
 * Migration 0082 collapsed `league_admin` into `commissioner` (T-008a). The
 * live database is already migrated, so a pre-0082 row cannot be created here
 * to watch it move. Instead the migration file is replayed *verbatim* against a
 * throwaway schema that has been rebuilt into the pre-0082 shape: the file uses
 * unqualified names precisely so `search_path` can point it at that schema.
 * Breaking the SQL in the file therefore breaks this test.
 */
const LEGACY_ROLE_LABELS = [
  "commissioner",
  "league_admin",
  "data_steward",
  "member",
];

describe("league_role collapse (migration 0082)", () => {
  it("remaps pre-existing league_admin rows to commissioner when replayed", async () => {
    const schema = `t008a_${randomUUID().replaceAll("-", "")}`;
    const migration = await readFile(
      "src/db/migrations/0082_collapse_league_admin_role.sql",
      "utf8",
    );
    const statements = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    const client = await handle.pool.connect();
    try {
      // Everything below is rolled back: DDL is transactional in Postgres, so
      // the replica schema, the legacy type and the `search_path` override all
      // disappear without touching the live schema or the pooled connection.
      await client.query("begin");
      await client.query(`create schema "${schema}"`);
      // `pg_catalog` stays implicitly first; `public` is deliberately absent so
      // an unqualified name in the migration can only resolve to the replica.
      await client.query(`set local search_path to "${schema}"`);
      await client.query(
        `create type league_role as enum (${LEGACY_ROLE_LABELS.map((label) => `'${label}'`).join(", ")})`,
      );
      for (const table of ["members", "invitations"]) {
        await client.query(
          `create table ${table} (id text primary key, role league_role not null default 'member')`,
        );
        await client.query(
          `insert into ${table} (id, role) values
             ('legacy-admin', 'league_admin'),
             ('legacy-commissioner', 'commissioner'),
             ('legacy-steward', 'data_steward'),
             ('legacy-member', 'member')`,
        );
      }

      for (const statement of statements) {
        await client.query(statement);
      }

      for (const table of ["members", "invitations"]) {
        const { rows } = await client.query<{ id: string; role: string }>(
          `select id, role::text as role from ${table} order by id`,
        );
        expect(rows, `${table} after replay`).toEqual([
          { id: "legacy-admin", role: "commissioner" },
          { id: "legacy-commissioner", role: "commissioner" },
          { id: "legacy-member", role: "member" },
          { id: "legacy-steward", role: "data_steward" },
        ]);

        // The remap must not have cost the column its default.
        const { rows: defaults } = await client.query<{ def: string | null }>(
          `select column_default as def from information_schema.columns
             where table_schema = $1 and table_name = $2 and column_name = 'role'`,
          [schema, table],
        );
        expect(defaults[0]?.def, `${table}.role default`).toContain("'member'");
      }

      // The type was rebuilt, not merely emptied of users: the label is gone,
      // so a legacy value is unrepresentable rather than just unexpected.
      const { rows: labels } = await client.query<{ label: string }>(
        `select e.enumlabel as label
           from pg_enum e
           join pg_type t on t.oid = e.enumtypid
           join pg_namespace n on n.oid = t.typnamespace
          where t.typname = 'league_role' and n.nspname = $1
          order by e.enumsortorder`,
        [schema],
      );
      expect(labels.map((row) => row.label)).toEqual([
        "commissioner",
        "data_steward",
        "member",
      ]);
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  it("leaves no league_admin behind in the live database", async () => {
    const { rows: labels } = await handle.pool.query<{ label: string }>(
      `select e.enumlabel as label
         from pg_enum e
         join pg_type t on t.oid = e.enumtypid
         join pg_namespace n on n.oid = t.typnamespace
        where t.typname = 'league_role' and n.nspname = 'public'
        order by e.enumsortorder`,
    );
    expect(labels.map((row) => row.label)).toEqual([
      "commissioner",
      "data_steward",
      "member",
    ]);

    for (const table of ["members", "invitations"]) {
      const { rows } = await handle.pool.query<{ count: string }>(
        `select count(*)::text as count from ${table} where role::text = 'league_admin'`,
      );
      expect(rows[0]?.count, `${table} legacy rows`).toBe("0");
    }
  });
});
