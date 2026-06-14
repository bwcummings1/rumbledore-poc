// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "./client";
import { withLeagueContext } from "./rls";
import {
  bankrollLedger,
  bankrollWeeks,
  type ContentItem,
  contentItems,
  type DataIntegrityCheck,
  dataIntegrityChecks,
  type FantasyTeam,
  fantasyTeams,
  leagues,
  type User,
  users,
} from "./schema";
import { migrateSerialized } from "./test-support";

/**
 * THE league-isolation canary (spec 02 §7): two leagues, one RLS-bound role,
 * proof that a league-scoped query under `withLeagueContext` can neither read
 * nor write the other league's rows. If this suite fails, the isolation model
 * is broken — fix that before anything else.
 *
 * The compose user is a superuser (bypasses RLS even with FORCE), so the
 * admin connection only migrates, provisions a dedicated NOSUPERUSER
 * NOBYPASSRLS login role, and seeds fixtures; every assertion about policy
 * behavior runs on a second pool connected as that role.
 */

const CANARY_ROLE = "rumbledore_rls_canary";
// Dev-stack-only credential for the throwaway test role; never used outside
// the local compose Postgres.
const CANARY_PASSWORD = "rls-canary"; // ubs:ignore — local test-role password, not a real secret

const marker = `rlscanary-${randomUUID()}`;

let admin: DbHandle;
let canary: DbHandle;
let leagueA: string;
let leagueB: string;
let teamA: FantasyTeam;
let teamB: FantasyTeam;
let contentA: ContentItem;
let contentB: ContentItem;
let centralContent: ContentItem;
let userA: User;
let userB: User;
let bankrollWeekA: { id: string; leagueId: string };
let bankrollWeekB: { id: string; leagueId: string };
let bankrollLedgerA: { id: string; leagueId: string };
let bankrollLedgerB: { id: string; leagueId: string };
let integrityCheckA: DataIntegrityCheck;
let integrityCheckB: DataIntegrityCheck;

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

beforeAll(async () => {
  const adminUrl = parseEnv(process.env).databaseUrl;
  admin = createDb(adminUrl);
  try {
    await admin.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable — start the local stack with `pnpm db:up` before running tests.",
      { cause },
    );
  }
  await migrateSerialized(admin);

  // Provision the RLS-bound role idempotently. ALTER (re)asserts the flags
  // and password even when the role survived a previous run.
  await admin.pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${CANARY_ROLE}') THEN
        CREATE ROLE ${CANARY_ROLE};
      END IF;
    END $$;
  `);
  await admin.pool.query(
    `ALTER ROLE ${CANARY_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${CANARY_PASSWORD}'`,
  );
  await admin.pool.query(`GRANT USAGE ON SCHEMA public TO ${CANARY_ROLE}`);
  await admin.pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON leagues, fantasy_teams, fantasy_members, fantasy_matchups, fantasy_roster_entries, fantasy_transactions, provider_final_standings, league_season_settings, historical_import_checkpoints, data_coverage, data_integrity_check, data_correction_audit_log, person, team_season, identity_mapping, identity_audit_log, weekly_statistics, season_statistics, head_to_head_record, championship_record, all_time_record, content_item, league_feed_reference, ai_persona_card, ai_generation_run, ai_memory, push_subscription, bankroll_weeks, bankroll_ledger, bet_slips, bet_legs, bet_settlements, league_invites, league_member_identity_claims TO ${CANARY_ROLE}`,
  );

  // Seed two leagues with one fantasy team each — as admin, outside any
  // league context (the superuser bypasses RLS; that's exactly why it can't be
  // the role under test).
  [userA, userB] = await admin.db
    .insert(users)
    .values([
      {
        displayName: "Canary User A",
        email: `${marker}-a@example.test`,
      },
      {
        displayName: "Canary User B",
        email: `${marker}-b@example.test`,
      },
    ])
    .returning();

  const [la, lb] = await admin.db
    .insert(leagues)
    .values([
      { provider: "espn", providerLeagueId: `${marker}-a`, name: "League A" },
      { provider: "espn", providerLeagueId: `${marker}-b`, name: "League B" },
    ])
    .returning();
  leagueA = la.id;
  leagueB = lb.id;
  [teamA, teamB] = await admin.db
    .insert(fantasyTeams)
    .values([
      {
        leagueId: leagueA,
        provider: "espn",
        providerTeamId: `${marker}-team-a`,
        leagueProviderId: `${marker}-a`,
        season: 2026,
        name: "Team A",
        abbrev: "A",
        contentHash: `${marker}-team-a-hash`,
      },
      {
        leagueId: leagueB,
        provider: "espn",
        providerTeamId: `${marker}-team-b`,
        leagueProviderId: `${marker}-b`,
        season: 2026,
        name: "Team B",
        abbrev: "B",
        contentHash: `${marker}-team-b-hash`,
      },
    ])
    .returning();

  [contentA, contentB, centralContent] = await admin.db
    .insert(contentItems)
    .values([
      {
        authorPersona: "commissioner",
        body: "League A content",
        contentHash: `${marker}-content-a-hash`,
        dedupKey: `${marker}-content-a`,
        kind: "blog",
        leagueId: leagueA,
        summary: "League A summary",
        title: "League A blog",
      },
      {
        authorPersona: "commissioner",
        body: "League B content",
        contentHash: `${marker}-content-b-hash`,
        dedupKey: `${marker}-content-b`,
        kind: "blog",
        leagueId: leagueB,
        summary: "League B summary",
        title: "League B blog",
      },
      {
        body: "Central content",
        contentHash: `${marker}-central-hash`,
        dedupKey: `${marker}-central`,
        kind: "news",
        leagueId: null,
        summary: "Central summary",
        title: "Central news",
      },
    ])
    .returning();

  [bankrollWeekA, bankrollWeekB] = await admin.db
    .insert(bankrollWeeks)
    .values([
      {
        floorCents: 1_000_000,
        leagueId: leagueA,
        openingBalanceCents: 1_000_000,
        userId: userA.id,
        weekEnd: new Date("2026-09-08T00:00:00.000Z"),
        weekStart: new Date("2026-09-01T00:00:00.000Z"),
      },
      {
        floorCents: 1_000_000,
        leagueId: leagueB,
        openingBalanceCents: 1_000_000,
        userId: userB.id,
        weekEnd: new Date("2026-09-08T00:00:00.000Z"),
        weekStart: new Date("2026-09-01T00:00:00.000Z"),
      },
    ])
    .returning({
      id: bankrollWeeks.id,
      leagueId: bankrollWeeks.leagueId,
    });

  [bankrollLedgerA, bankrollLedgerB] = await admin.db
    .insert(bankrollLedger)
    .values([
      {
        amountCents: 1_000_000,
        bankrollWeekId: bankrollWeekA.id,
        entryType: "week_open",
        leagueId: leagueA,
        runningBalanceCents: 1_000_000,
        seq: 1,
        userId: userA.id,
      },
      {
        amountCents: 1_000_000,
        bankrollWeekId: bankrollWeekB.id,
        entryType: "week_open",
        leagueId: leagueB,
        runningBalanceCents: 1_000_000,
        seq: 1,
        userId: userB.id,
      },
    ])
    .returning({
      id: bankrollLedger.id,
      leagueId: bankrollLedger.leagueId,
    });

  [integrityCheckA, integrityCheckB] = await admin.db
    .insert(dataIntegrityChecks)
    .values([
      {
        checkKey: "identity_sanity",
        detail: { marker, side: "a" },
        leagueId: leagueA,
        season: 2026,
        status: "pass",
      },
      {
        checkKey: "identity_sanity",
        detail: { marker, side: "b" },
        leagueId: leagueB,
        season: 2026,
        status: "fail",
      },
    ])
    .returning();

  const canaryUrl = new URL(adminUrl);
  canaryUrl.username = CANARY_ROLE;
  canaryUrl.password = CANARY_PASSWORD;
  canary = createDb(canaryUrl.toString());
});

afterAll(async () => {
  // Leagues cascade to fantasy domain rows. The role stays — it is
  // provisioned idempotently and another run may be mid-flight.
  if (admin) {
    await admin.db
      .delete(contentItems)
      .where(sql`${contentItems.dedupKey} like ${`${marker}-%`}`);
    await admin.db
      .delete(leagues)
      .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
    await admin.db
      .delete(users)
      .where(sql`${users.email} like ${`${marker}-%`}`);
  }
  await canary?.pool.end();
  await admin?.pool.end();
});

describe("canary preconditions", () => {
  it("connects as a role that RLS actually binds (no superuser, no BYPASSRLS)", async () => {
    const { rows } = await canary.pool.query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });
});

describe("two-league isolation under withLeagueContext", () => {
  it("sees no fantasy team rows at all outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(fantasyTeams)
      .where(inArray(fantasyTeams.id, [teamA.id, teamB.id]));
    expect(rows).toHaveLength(0);
  });

  it("outside a league context sees central content but no league blog rows", async () => {
    const rows = await canary.db
      .select({
        id: contentItems.id,
        leagueId: contentItems.leagueId,
      })
      .from(contentItems)
      .where(
        inArray(contentItems.id, [contentA.id, contentB.id, centralContent.id]),
      );
    expect(rows).toEqual([{ id: centralContent.id, leagueId: null }]);
  });

  it("sees no bankroll rows at all outside a league context", async () => {
    const weeks = await canary.db
      .select()
      .from(bankrollWeeks)
      .where(inArray(bankrollWeeks.id, [bankrollWeekA.id, bankrollWeekB.id]));
    const ledger = await canary.db
      .select()
      .from(bankrollLedger)
      .where(
        inArray(bankrollLedger.id, [bankrollLedgerA.id, bankrollLedgerB.id]),
      );

    expect(weeks).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });

  it("sees no data integrity rows at all outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(dataIntegrityChecks)
      .where(
        inArray(dataIntegrityChecks.id, [
          integrityCheckA.id,
          integrityCheckB.id,
        ]),
      );
    expect(rows).toHaveLength(0);
  });

  it("scoped to league A, sees A's fantasy team and nothing of league B", async () => {
    const { mine, theirs } = await withLeagueContext(
      canary.db,
      leagueA,
      async (tx) => ({
        mine: await tx
          .select()
          .from(fantasyTeams)
          .where(eq(fantasyTeams.leagueId, leagueA)),
        theirs: await tx
          .select()
          .from(fantasyTeams)
          .where(eq(fantasyTeams.id, teamB.id)),
      }),
    );
    expect(mine.map((m) => m.id)).toContain(teamA.id);
    expect(theirs).toHaveLength(0);
  });

  it("scoped to league A, an unfiltered scan still yields only league A rows", async () => {
    const all = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(fantasyTeams),
    );
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered bankroll scans still yield only league A rows", async () => {
    const { ledger, weeks } = await withLeagueContext(
      canary.db,
      leagueA,
      async (tx) => ({
        ledger: await tx.select().from(bankrollLedger),
        weeks: await tx.select().from(bankrollWeeks),
      }),
    );

    expect(weeks.map((row) => row.id)).toContain(bankrollWeekA.id);
    expect(weeks.map((row) => row.id)).not.toContain(bankrollWeekB.id);
    expect(weeks.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(ledger.map((row) => row.id)).toContain(bankrollLedgerA.id);
    expect(ledger.map((row) => row.id)).not.toContain(bankrollLedgerB.id);
    expect(ledger.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered data integrity scans still yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(dataIntegrityChecks),
    );

    expect(rows.map((row) => row.id)).toContain(integrityCheckA.id);
    expect(rows.map((row) => row.id)).not.toContain(integrityCheckB.id);
    expect(rows.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, content scans include central rows and league A only", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx
        .select({
          id: contentItems.id,
          leagueId: contentItems.leagueId,
        })
        .from(contentItems)
        .where(
          inArray(contentItems.id, [
            contentA.id,
            contentB.id,
            centralContent.id,
          ]),
        ),
    );
    expect(rows).toContainEqual({ id: contentA.id, leagueId: leagueA });
    expect(rows).toContainEqual({ id: centralContent.id, leagueId: null });
    expect(rows.map((row) => row.id)).not.toContain(contentB.id);
  });

  it("rejects writing a league B row from league A context (WITH CHECK)", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(fantasyTeams).values({
            leagueId: leagueB,
            provider: "espn",
            providerTeamId: `${marker}-bad-team`,
            leagueProviderId: `${marker}-b`,
            season: 2026,
            name: "Bad Team",
            contentHash: `${marker}-bad-team-hash`,
          }),
        ),
      ),
    ).toBe("42501"); // insufficient_privilege: new row violates row-level security policy
  });

  it("rejects writing a league B bankroll week from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(bankrollWeeks).values({
            floorCents: 1_000_000,
            leagueId: leagueB,
            openingBalanceCents: 1_000_000,
            userId: userB.id,
            weekEnd: new Date("2026-09-15T00:00:00.000Z"),
            weekStart: new Date("2026-09-08T00:00:00.000Z"),
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing a league B data integrity row from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(dataIntegrityChecks).values({
            checkKey: "schedule_coverage",
            detail: { marker, bad: true },
            leagueId: leagueB,
            season: 2026,
            status: "fail",
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing league B blog content from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(contentItems).values({
            authorPersona: "commissioner",
            body: "Bad content",
            contentHash: `${marker}-bad-content-hash`,
            dedupKey: `${marker}-bad-content`,
            kind: "blog",
            leagueId: leagueB,
            summary: "Bad summary",
            title: "Bad blog",
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("cannot update league B's rows from league A context", async () => {
    const updated = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx
        .update(fantasyTeams)
        .set({ name: "Should Not Change" })
        .where(eq(fantasyTeams.id, teamB.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const [intact] = await admin.db
      .select()
      .from(fantasyTeams)
      .where(eq(fantasyTeams.id, teamB.id));
    expect(intact.name).toBe("Team B");
  });

  it("cannot delete league B's rows from league A context", async () => {
    const deleted = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.delete(fantasyTeams).where(eq(fantasyTeams.id, teamB.id)).returning(),
    );
    expect(deleted).toHaveLength(0);

    const survivors = await admin.db
      .select()
      .from(fantasyTeams)
      .where(eq(fantasyTeams.id, teamB.id));
    expect(survivors).toHaveLength(1);
  });

  it("allows normal reads and writes within the scoped league (positive control)", async () => {
    const inserted = await withLeagueContext(canary.db, leagueA, async (tx) => {
      const [row] = await tx
        .insert(fantasyTeams)
        .values({
          leagueId: leagueA,
          provider: "espn",
          providerTeamId: `${marker}-team-c`,
          leagueProviderId: `${marker}-a`,
          season: 2026,
          name: "Team C",
          abbrev: "C",
          contentHash: `${marker}-team-c-hash`,
        })
        .returning();
      return row;
    });
    expect(inserted.leagueId).toBe(leagueA);

    const seen = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(fantasyTeams).where(eq(fantasyTeams.id, inserted.id)),
    );
    expect(seen).toHaveLength(1);
  });

  it("keeps league B's own view intact when scoped to league B", async () => {
    const rows = await withLeagueContext(canary.db, leagueB, (tx) =>
      tx.select().from(fantasyTeams),
    );
    expect(rows.map((m) => m.id)).toContain(teamB.id);
    expect(rows.every((row) => row.leagueId === leagueB)).toBe(true);
  });
});
