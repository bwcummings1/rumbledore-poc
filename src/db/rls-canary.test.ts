// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "./client";
import { withLeagueContext } from "./rls";
import { type LeagueMember, leagueMembers, leagues, users } from "./schema";
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
let userA: string;
let userB: string;
let memberA: LeagueMember;
let memberB: LeagueMember;

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
    `GRANT SELECT, INSERT, UPDATE, DELETE ON users, leagues, league_members TO ${CANARY_ROLE}`,
  );

  // Seed two leagues with one member each — as admin, outside any league
  // context (the superuser bypasses RLS; that's exactly why it can't be the
  // role under test).
  const [ua, ub] = await admin.db
    .insert(users)
    .values([
      { email: `${marker}-a@example.com`, displayName: "Canary A" },
      { email: `${marker}-b@example.com`, displayName: "Canary B" },
    ])
    .returning();
  userA = ua.id;
  userB = ub.id;
  const [la, lb] = await admin.db
    .insert(leagues)
    .values([
      { provider: "espn", providerLeagueId: `${marker}-a`, name: "League A" },
      { provider: "espn", providerLeagueId: `${marker}-b`, name: "League B" },
    ])
    .returning();
  leagueA = la.id;
  leagueB = lb.id;
  [memberA, memberB] = await admin.db
    .insert(leagueMembers)
    .values([
      { leagueId: leagueA, userId: userA, role: "commissioner" },
      { leagueId: leagueB, userId: userB, role: "commissioner" },
    ])
    .returning();

  const canaryUrl = new URL(adminUrl);
  canaryUrl.username = CANARY_ROLE;
  canaryUrl.password = CANARY_PASSWORD;
  canary = createDb(canaryUrl.toString());
});

afterAll(async () => {
  // Users/leagues cascade to league_members. The role stays — it is
  // provisioned idempotently and another run may be mid-flight.
  if (admin) {
    await admin.db
      .delete(users)
      .where(sql`${users.email} like ${`${marker}-%`}`);
    await admin.db
      .delete(leagues)
      .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
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
  it("sees no league_members rows at all outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(leagueMembers)
      .where(inArray(leagueMembers.id, [memberA.id, memberB.id]));
    expect(rows).toHaveLength(0);
  });

  it("scoped to league A, sees A's membership and nothing of league B", async () => {
    const { mine, theirs } = await withLeagueContext(
      canary.db,
      leagueA,
      async (tx) => ({
        mine: await tx
          .select()
          .from(leagueMembers)
          .where(eq(leagueMembers.leagueId, leagueA)),
        theirs: await tx
          .select()
          .from(leagueMembers)
          .where(eq(leagueMembers.id, memberB.id)),
      }),
    );
    expect(mine.map((m) => m.id)).toContain(memberA.id);
    expect(theirs).toHaveLength(0);
  });

  it("scoped to league A, an unfiltered scan still yields only league A rows", async () => {
    const all = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(leagueMembers),
    );
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("rejects writing a league B row from league A context (WITH CHECK)", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(leagueMembers).values({ leagueId: leagueB, userId: userA }),
        ),
      ),
    ).toBe("42501"); // insufficient_privilege: new row violates row-level security policy
  });

  it("cannot update league B's rows from league A context", async () => {
    const updated = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx
        .update(leagueMembers)
        .set({ role: "member" })
        .where(eq(leagueMembers.id, memberB.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const [intact] = await admin.db
      .select()
      .from(leagueMembers)
      .where(eq(leagueMembers.id, memberB.id));
    expect(intact.role).toBe("commissioner");
  });

  it("cannot delete league B's rows from league A context", async () => {
    const deleted = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx
        .delete(leagueMembers)
        .where(eq(leagueMembers.id, memberB.id))
        .returning(),
    );
    expect(deleted).toHaveLength(0);

    const survivors = await admin.db
      .select()
      .from(leagueMembers)
      .where(eq(leagueMembers.id, memberB.id));
    expect(survivors).toHaveLength(1);
  });

  it("allows normal reads and writes within the scoped league (positive control)", async () => {
    const inserted = await withLeagueContext(canary.db, leagueA, async (tx) => {
      const [row] = await tx
        .insert(leagueMembers)
        .values({ leagueId: leagueA, userId: userB, role: "member" })
        .returning();
      return row;
    });
    expect(inserted.leagueId).toBe(leagueA);

    const seen = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(leagueMembers).where(eq(leagueMembers.id, inserted.id)),
    );
    expect(seen).toHaveLength(1);
  });

  it("keeps league B's own view intact when scoped to league B", async () => {
    const rows = await withLeagueContext(canary.db, leagueB, (tx) =>
      tx.select().from(leagueMembers),
    );
    expect(rows.map((m) => m.id)).toContain(memberB.id);
    expect(rows.every((row) => row.leagueId === leagueB)).toBe(true);
  });
});
