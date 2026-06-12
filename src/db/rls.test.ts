// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "./client";
import { withLeagueContext } from "./rls";
import { migrateSerialized } from "./test-support";

/**
 * Integration test for the RLS plumbing (migration 0002 + `withLeagueContext`)
 * against the local stack (`pnpm db:up`). The compose user is a superuser, so
 * row filtering is bypassed here — this suite proves the catalog state
 * (RLS enabled + forced, policy shape) and the transaction-local setting
 * mechanics. The two-league isolation canary under a non-superuser role is
 * the follow-up task.
 */

let handle: DbHandle;

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
  await handle?.pool.end();
});

describe("RLS catalog state (migration 0002)", () => {
  const leagueScopedTables = [
    "ai_generation_run",
    "ai_memory",
    "ai_persona_card",
    "all_time_record",
    "bankroll_ledger",
    "bankroll_weeks",
    "bet_legs",
    "bet_slips",
    "championship_record",
    "fantasy_teams",
    "fantasy_members",
    "fantasy_matchups",
    "head_to_head_record",
    "historical_import_checkpoints",
    "identity_audit_log",
    "identity_mapping",
    "league_invites",
    "person",
    "provider_final_standings",
    "push_subscription",
    "season_statistics",
    "stats_calculation",
    "team_season",
    "weekly_statistics",
  ] as const;
  const mixedScopeTables = ["content_item"] as const;

  it("has row security enabled AND forced on league-scoped tables", async () => {
    const { rows } = await handle.pool.query(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       where relname = any($1)
       order by relname`,
      [leagueScopedTables],
    );
    expect(rows).toHaveLength(leagueScopedTables.length);
    for (const tableName of leagueScopedTables) {
      expect(rows).toContainEqual({
        relname: tableName,
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
    }
  });

  it("scopes every isolation policy to current_league_id() for all commands", async () => {
    const { rows } = await handle.pool.query(
      `select tablename, policyname, cmd, qual, with_check
       from pg_policies
       where tablename = any($1)
       order by tablename`,
      [leagueScopedTables],
    );
    expect(rows).toHaveLength(leagueScopedTables.length);
    for (const row of rows) {
      expect(row.policyname).toBe(`${row.tablename}_isolation`);
      expect(row.cmd).toBe("ALL");
      expect(row.qual).toContain("current_league_id()");
      expect(row.with_check).toContain("current_league_id()");
    }
  });

  it("has row security enabled AND forced on mixed central/league content tables", async () => {
    const { rows } = await handle.pool.query(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       where relname = any($1)
       order by relname`,
      [mixedScopeTables],
    );
    expect(rows).toEqual([
      {
        relforcerowsecurity: true,
        relname: "content_item",
        relrowsecurity: true,
      },
    ]);
  });

  it("allows central content rows while scoping league content rows", async () => {
    const { rows } = await handle.pool.query(
      `select tablename, policyname, cmd, qual, with_check
       from pg_policies
       where tablename = any($1)
       order by tablename`,
      [mixedScopeTables],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].policyname).toBe("content_item_scope_policy");
    expect(rows[0].cmd).toBe("ALL");
    expect(rows[0].qual.toLowerCase()).toContain("is null");
    expect(rows[0].qual).toContain("current_league_id()");
    expect(rows[0].with_check.toLowerCase()).toContain("is null");
    expect(rows[0].with_check).toContain("current_league_id()");
  });
});

describe("current_league_id()", () => {
  it("is NULL outside any league context", async () => {
    const { rows } = await handle.pool.query(
      "select current_league_id() as league_id",
    );
    expect(rows[0].league_id).toBeNull();
  });

  it("treats an empty setting as no context instead of failing the uuid cast", async () => {
    const { rows } = await handle.pool.query(
      `select set_config('app.current_league_id', '', true),
              current_league_id() as league_id`,
    );
    expect(rows[0].league_id).toBeNull();
  });
});

describe("withLeagueContext", () => {
  it("exposes the league id to SQL inside the callback transaction", async () => {
    const leagueId = randomUUID();
    const seen = await withLeagueContext(handle.db, leagueId, async (tx) => {
      const result = await tx.execute(
        sql`select current_league_id() as league_id`,
      );
      return result.rows[0].league_id;
    });
    expect(seen).toBe(leagueId);
  });

  it("does not leak the setting past the transaction", async () => {
    const leagueId = randomUUID();
    await withLeagueContext(handle.db, leagueId, async () => undefined);
    // set_config(..., is_local => true) resets at commit, so no pooled
    // connection can still carry this league's context.
    const { rows } = await handle.pool.query(
      "select current_league_id() as league_id",
    );
    expect(rows[0].league_id).toBeNull();
  });

  it("resets the setting when the callback throws and rolls back", async () => {
    const leagueId = randomUUID();
    await expect(
      withLeagueContext(handle.db, leagueId, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const { rows } = await handle.pool.query(
      "select current_league_id() as league_id",
    );
    expect(rows[0].league_id).toBeNull();
  });

  it("rejects a non-UUID league id before touching the database", async () => {
    await expect(
      withLeagueContext(handle.db, "95050; drop table users", async () => {
        throw new Error("callback must not run");
      }),
    ).rejects.toThrow(/must be a UUID/);
  });
});
