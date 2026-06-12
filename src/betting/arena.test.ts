// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  arenaSeasons,
  arenaStandings,
  betSlips,
  type League,
  leagues,
  type User,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  computeArenaStandings,
  ensureArenaSeason,
  getArenaLeaderboardData,
  rebuildArenaStandings,
} from "./arena";
import {
  appendBankrollLedgerEntry,
  type OpenBankrollWeekInput,
  openBankrollWeek,
} from "./bankroll";

const marker = `arenatest-${randomUUID()}`;
const CANARY_ROLE = "rumbledore_rls_canary";
const CANARY_PASSWORD = "rls-canary"; // ubs:ignore — local test-role password, not a real secret

let handle: DbHandle;
let leagueA: League;
let leagueB: League;
let userAlpha: User;
let userBeta: User;
let userGamma: User;

function day(value: number): Date {
  return new Date(Date.UTC(2036, 8, value));
}

async function seedBettingWeek(
  input: Pick<OpenBankrollWeekInput, "floorCents" | "leagueId" | "userId"> & {
    stakeCents: number;
    status: "lost" | "push" | "void" | "won";
    tag: string;
    returnCents?: number;
  },
) {
  const opened = await openBankrollWeek(handle.db, {
    floorCents: input.floorCents,
    leagueId: input.leagueId,
    userId: input.userId,
    weekEnd: day(8),
    weekStart: day(1),
  });

  const [slip] = await withLeagueContext(handle.db, input.leagueId, (tx) =>
    tx
      .insert(betSlips)
      .values({
        bankrollWeekId: opened.week.id,
        combinedDecimalOdds: input.returnCents
          ? input.returnCents / input.stakeCents
          : 2,
        idempotencyKey: `${marker}:${input.tag}`,
        kind: "single",
        leagueId: input.leagueId,
        potentialPayoutCents: input.returnCents ?? input.stakeCents * 2,
        requestHash: `${marker}:${input.tag}:request`,
        settledAt: day(4),
        stakeCents: input.stakeCents,
        status: input.status,
        userId: input.userId,
      })
      .returning(),
  );

  await appendBankrollLedgerEntry(handle.db, {
    amountCents: -input.stakeCents,
    bankrollWeekId: opened.week.id,
    entryType: "bet_stake",
    leagueId: input.leagueId,
    refSlipId: slip.id,
    userId: input.userId,
  });

  if (input.returnCents) {
    await appendBankrollLedgerEntry(handle.db, {
      amountCents: input.returnCents,
      bankrollWeekId: opened.week.id,
      entryType:
        input.status === "push" || input.status === "void"
          ? "bet_refund"
          : "bet_payout",
      leagueId: input.leagueId,
      refSlipId: slip.id,
      userId: input.userId,
    });
  }

  return { opened, slip };
}

async function createRlsCanaryHandle(): Promise<DbHandle> {
  await handle.pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${CANARY_ROLE}') THEN
        CREATE ROLE ${CANARY_ROLE};
      END IF;
    END $$;
  `);
  await handle.pool.query(
    `ALTER ROLE ${CANARY_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${CANARY_PASSWORD}'`,
  );
  await handle.pool.query(`GRANT USAGE ON SCHEMA public TO ${CANARY_ROLE}`);
  await handle.pool.query(`GRANT SELECT ON bet_slips TO ${CANARY_ROLE}`);

  const canaryUrl = new URL(parseEnv(process.env).databaseUrl);
  canaryUrl.username = CANARY_ROLE;
  canaryUrl.password = CANARY_PASSWORD;
  return createDb(canaryUrl.toString());
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

  [userAlpha, userBeta, userGamma] = await handle.db
    .insert(users)
    .values([
      {
        displayName: "Arena Alpha",
        email: `${marker}-alpha@example.test`,
      },
      {
        displayName: "Arena Beta",
        email: `${marker}-beta@example.test`,
      },
      {
        displayName: "Arena Gamma",
        email: `${marker}-gamma@example.test`,
      },
    ])
    .returning();

  [leagueA, leagueB] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Arena League A",
        provider: "espn",
        providerLeagueId: `${marker}-a`,
      },
      {
        name: "Arena League B",
        provider: "espn",
        providerLeagueId: `${marker}-b`,
      },
    ])
    .returning();
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(arenaSeasons)
    .where(sql`${arenaSeasons.name} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("arena schema", () => {
  it("keeps arena tables central without restrictive RLS", async () => {
    const rows = await handle.pool.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select relname, relrowsecurity
       from pg_class
       where relname in ('arena_season', 'arena_standing')
       order by relname`,
    );

    expect(rows.rows).toEqual([
      { relname: "arena_season", relrowsecurity: false },
      { relname: "arena_standing", relrowsecurity: false },
    ]);
  });
});

describe("arena leaderboard materialization", () => {
  it("ranks leagues and individuals from league-scoped ledgers", async () => {
    const season = await ensureArenaSeason(handle.db, {
      endsAt: day(30),
      name: `${marker}-2026`,
      startsAt: day(1),
    });

    await seedBettingWeek({
      floorCents: 100_000,
      leagueId: leagueA.id,
      returnCents: 25_000,
      stakeCents: 10_000,
      status: "won",
      tag: "alpha-win",
      userId: userAlpha.id,
    });
    await seedBettingWeek({
      floorCents: 100_000,
      leagueId: leagueA.id,
      stakeCents: 20_000,
      status: "lost",
      tag: "beta-loss",
      userId: userBeta.id,
    });
    await seedBettingWeek({
      floorCents: 100_000,
      leagueId: leagueB.id,
      returnCents: 40_000,
      stakeCents: 10_000,
      status: "won",
      tag: "gamma-win",
      userId: userGamma.id,
    });

    const fresh = await computeArenaStandings(handle.db, {
      seasonId: season.id,
    });
    const rebuilt = await rebuildArenaStandings(handle.db, {
      computedAt: day(9),
      seasonId: season.id,
    });
    const leaderboard = await getArenaLeaderboardData(handle.db, {
      seasonId: season.id,
    });

    expect(rebuilt.materializedRows).toHaveLength(5);
    expect(leaderboard.computedAt).toBe(day(9).toISOString());
    expect(leaderboard.leagueStandings.map((row) => row.displayName)).toEqual([
      "Arena League B",
      "Arena League A",
    ]);
    expect(leaderboard.leagueStandings.map((row) => row.netPnlCents)).toEqual([
      30_000, -2_500,
    ]);
    expect(
      leaderboard.individualStandings.map((row) => [
        row.displayName,
        row.netPnlCents,
        row.roiBps,
        row.winRateBps,
      ]),
    ).toEqual([
      ["Arena Gamma", 30_000, 30_000, 10_000],
      ["Arena Alpha", 15_000, 15_000, 10_000],
      ["Arena Beta", -20_000, -10_000, 0],
    ]);
    expect(
      leaderboard.individualStandings.map((row) => row.totalStakeCents),
    ).toEqual([10_000, 10_000, 20_000]);
    expect(
      leaderboard.individualStandings.map((row) => row.settledSlipCount),
    ).toEqual([1, 1, 1]);
    expect(
      leaderboard.individualStandings.map((row) => row.weeksSurvived),
    ).toEqual([1, 1, 1]);
    expect(
      leaderboard.individualStandings.map((row) => ({
        currentBalanceCents: row.currentBalanceCents,
        id: row.id,
        netPnlCents: row.netPnlCents,
        rank: row.rank,
        roiBps: row.roiBps,
      })),
    ).toEqual(
      fresh.individualStandings.map((row) => ({
        currentBalanceCents: row.currentBalanceCents,
        id: row.subjectId,
        netPnlCents: row.netPnlCents,
        rank: row.rank,
        roiBps: row.roiBps,
      })),
    );

    const canary = await createRlsCanaryHandle();
    try {
      const leagueBRowsFromLeagueAContext = await withLeagueContext(
        canary.db,
        leagueA.id,
        (tx) =>
          tx
            .select({ id: betSlips.id })
            .from(betSlips)
            .where(
              and(
                eq(betSlips.leagueId, leagueB.id),
                eq(betSlips.userId, userGamma.id),
              ),
            ),
      );
      expect(leagueBRowsFromLeagueAContext).toEqual([]);
    } finally {
      await canary.pool.end();
    }

    const persisted = await handle.db
      .select()
      .from(arenaStandings)
      .where(eq(arenaStandings.seasonId, season.id));
    expect(persisted).toHaveLength(5);
  });
});
