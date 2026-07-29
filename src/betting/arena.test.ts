// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  arenaSeasons,
  arenaStandings,
  bettingEvents,
  bettingMarkets,
  type League,
  leagues,
  oddsSnapshots,
  picks,
  type User,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  computeArenaStandings,
  ensureArenaSeason,
  extractArenaStandingSwingSignals,
  getArenaLeaderboardData,
  rebuildArenaStandings,
} from "./arena";
import { openPickWeek } from "./pickem";

const marker = `arenatest-${randomUUID()}`;
const testYear =
  2036 + (Number.parseInt(marker.slice("arenatest-".length, 18), 16) % 500);
const CANARY_ROLE = "rumbledore_rls_canary";
const CANARY_PASSWORD = "rls-canary"; // ubs:ignore — local test-role password, not a real secret

let handle: DbHandle;
let leagueA: League;
let leagueB: League;
let userAlpha: User;
let userBeta: User;
let userGamma: User;
let marketCounter = 0;

function day(value: number): Date {
  return new Date(Date.UTC(testYear, 8, value));
}

/**
 * A market to hang a pick on. Picks reference a market and a priced snapshot,
 * so the arena's counts cannot be seeded without one.
 */
async function seedMarket() {
  marketCounter += 1;
  const id = `${marker}-m${marketCounter}`;
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: `Away ${marketCounter}`,
      contentHash: `${id}:e`,
      homeTeam: `Home ${marketCounter}`,
      provider: marker,
      providerEventId: id,
      sport: "nfl",
      startTime: day(3),
      status: "final",
    })
    .returning();
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${id}:m`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId: `${id}:ml`,
      status: "settled",
      subject: "game",
      type: "moneyline",
    })
    .returning();
  const [snapshot] = await handle.db
    .insert(oddsSnapshots)
    .values({
      awayPrice: -110,
      capturedAt: day(2),
      homePrice: -110,
      marketId: market.id,
      provider: marker,
      sourcePayloadHash: `${id}:s`,
    })
    .returning();
  return { market, snapshot };
}

/**
 * Opens a pick week and grades a set of picks into it.
 *
 * `rosterSize` and `maxPicksPerUser` are what set the DENOMINATOR, so they are
 * always passed explicitly: the whole point of the metric is that the roster,
 * not the number of picks actually made, decides what a league is scored out of.
 */
async function seedPickWeek(input: {
  leagueId: string;
  week: number;
  rosterSize: number;
  maxPicksPerUser: number;
  opensDay?: number;
  closesDay?: number;
  graded: readonly {
    userId: string;
    correct: number;
    incorrect?: number;
    voids?: number;
  }[];
}) {
  const week = await openPickWeek(handle.db, {
    closesAt: day(input.closesDay ?? 8),
    leagueId: input.leagueId,
    maxPicksPerUser: input.maxPicksPerUser,
    opensAt: day(input.opensDay ?? 2),
    rosterSize: input.rosterSize,
    season: testYear,
    week: input.week,
  });

  for (const entry of input.graded) {
    const statuses = [
      ...Array<"correct">(entry.correct).fill("correct"),
      ...Array<"incorrect">(entry.incorrect ?? 0).fill("incorrect"),
      ...Array<"void">(entry.voids ?? 0).fill("void"),
    ];
    for (const [index, status] of statuses.entries()) {
      const { market, snapshot } = await seedMarket();
      await withLeagueContext(handle.db, input.leagueId, (tx) =>
        tx.insert(picks).values({
          gradedAt: day(4),
          idempotencyKey: `${marker}:${input.leagueId}:${input.week}:${entry.userId}:${index}`,
          leagueId: input.leagueId,
          marketId: market.id,
          oddsSnapshotId: snapshot.id,
          pickWeekId: week.pickWeekId,
          selection: "home",
          status,
          userId: entry.userId,
        }),
      );
    }
  }

  return week;
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
    `ALTER ROLE ${CANARY_ROLE} WITH LOGIN PASSWORD '${CANARY_PASSWORD}' NOSUPERUSER NOBYPASSRLS`,
  );
  await handle.pool.query(
    `GRANT USAGE ON SCHEMA public TO ${CANARY_ROLE};
     GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${CANARY_ROLE};`,
  );

  const url = new URL(parseEnv(process.env).databaseUrl);
  url.username = CANARY_ROLE;
  url.password = CANARY_PASSWORD;
  return createDb(url.toString());
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
      { displayName: "Arena Alpha", email: `${marker}-alpha@example.test` },
      { displayName: "Arena Beta", email: `${marker}-beta@example.test` },
      { displayName: "Arena Gamma", email: `${marker}-gamma@example.test` },
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
}, 90_000);

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
  await handle.db
    .delete(bettingEvents)
    .where(eq(bettingEvents.provider, marker));
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
  it("ranks leagues and individuals by pick accuracy", async () => {
    const season = await ensureArenaSeason(handle.db, {
      endsAt: day(30),
      name: `${marker}-2026`,
      startsAt: day(1),
    });

    // League A: 2 members x 5 picks = 10 scorable. Alpha goes 4/5, Beta 1/5.
    // 5 correct out of 10 => 50%.
    await seedPickWeek({
      graded: [
        { correct: 4, incorrect: 1, userId: userAlpha.id },
        { correct: 1, incorrect: 4, userId: userBeta.id },
      ],
      leagueId: leagueA.id,
      maxPicksPerUser: 5,
      rosterSize: 2,
      week: 1,
    });
    // League B: 2 members x 5 picks = 10 scorable, but only Gamma played, and
    // he went 4/5. The absent member still costs the league 5 -- so 4/10 = 40%,
    // NOT the 80% a submitted-only denominator would report.
    await seedPickWeek({
      graded: [{ correct: 4, incorrect: 1, userId: userGamma.id }],
      leagueId: leagueB.id,
      maxPicksPerUser: 5,
      rosterSize: 2,
      week: 1,
    });

    const fresh = await computeArenaStandings(handle.db, {
      seasonId: season.id,
    });
    const rebuilt = await rebuildArenaStandings(handle.db, {
      computedAt: day(9),
      seasonId: season.id,
    });
    const leaderboard = await getArenaLeaderboardData(handle.db, {
      leagueId: leagueA.id,
      rivalLeagueId: leagueB.id,
      seasonId: season.id,
    });

    // 2 leagues + 3 individuals.
    expect(rebuilt.materializedRows).toHaveLength(5);
    expect(leaderboard.computedAt).toBe(day(9).toISOString());
    expect(leaderboard.leagueStandings.map((row) => row.displayName)).toEqual([
      "Arena League A",
      "Arena League B",
    ]);
    // This is the assertion that matters. League B's only player outscored
    // both of League A's, yet League A leads -- because B left half its
    // allowance unspent and an unsubmitted pick scores the same as a wrong one.
    expect(leaderboard.leagueStandings.map((row) => row.accuracyBps)).toEqual([
      5_000, 4_000,
    ]);
    expect(
      leaderboard.leagueStandings.map((row) => [
        row.correctPicks,
        row.scorablePicks,
      ]),
    ).toEqual([
      [5, 10],
      [4, 10],
    ]);
    expect(leaderboard.leagueOptions).toEqual([
      {
        accuracyBps: 5_000,
        displayName: "Arena League A",
        id: leagueA.id,
        rank: 1,
      },
      {
        accuracyBps: 4_000,
        displayName: "Arena League B",
        id: leagueB.id,
        rank: 2,
      },
    ]);
    expect(leaderboard.headToHead).toEqual({
      anchor: expect.objectContaining({
        accuracyBps: 5_000,
        displayName: "Arena League A",
        id: leagueA.id,
        rank: 1,
      }),
      comparison: "leading",
      leader: expect.objectContaining({
        displayName: "Arena League A",
        id: leagueA.id,
      }),
      marginBps: 1_000,
      rankGap: 1,
      rival: expect.objectContaining({
        accuracyBps: 4_000,
        displayName: "Arena League B",
        id: leagueB.id,
        rank: 2,
      }),
    });
    // Individuals are scored on their own allowance: 5 picks each, so Alpha and
    // Gamma both went 4/5 and genuinely tie.
    //
    // The two tied rows are compared as a SET, not a sequence. Asserting that
    // Alpha precedes Gamma would be asserting an order the code deliberately
    // refuses to invent -- the residual sort is by subject uuid, so a
    // sequence assertion passes or fails on which uuid Postgres happened to
    // mint. It is the ranks that must be pinned, not the arrangement.
    const [first, second, third] = leaderboard.individualStandings;
    expect([first, second].map((row) => row.displayName).sort()).toEqual([
      "Arena Alpha",
      "Arena Gamma",
    ]);
    expect([first.accuracyBps, second.accuracyBps]).toEqual([8_000, 8_000]);
    expect([first.rank, second.rank]).toEqual([1, 1]);
    expect([third.displayName, third.accuracyBps, third.rank]).toEqual([
      "Arena Beta",
      2_000,
      3,
    ]);
    // Standard competition ranking: after a 2-way tie for 1st, next is 3rd.
    expect(leaderboard.individualStandings.map((row) => row.rank)).toEqual([
      1, 1, 3,
    ]);
    // The materialized rows must agree with the freshly computed ones. Sorted
    // by id so the comparison does not smuggle in an order assertion about the
    // tied pair above.
    const byId = (rows: readonly { id: string }[]) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    expect(
      byId(
        leaderboard.individualStandings.map((row) => ({
          accuracyBps: row.accuracyBps,
          correctPicks: row.correctPicks,
          id: row.id,
          rank: row.rank,
          scorablePicks: row.scorablePicks,
        })),
      ),
    ).toEqual(
      byId(
        fresh.individualStandings.map((row) => ({
          accuracyBps: row.accuracyBps,
          correctPicks: row.correctPicks,
          id: row.subjectId,
          rank: row.rank,
          scorablePicks: row.scorablePicks,
        })),
      ),
    );

    // The arena aggregates across leagues, but a league context must still not
    // be able to read another league's picks.
    const canary = await createRlsCanaryHandle();
    try {
      const leagueBPicksFromLeagueAContext = await withLeagueContext(
        canary.db,
        leagueA.id,
        (tx) =>
          tx
            .select({ id: picks.id })
            .from(picks)
            .where(eq(picks.leagueId, leagueB.id)),
      );
      expect(leagueBPicksFromLeagueAContext).toEqual([]);
    } finally {
      await canary.pool.end();
    }

    const persisted = await handle.db
      .select()
      .from(arenaStandings)
      .where(eq(arenaStandings.seasonId, season.id));
    expect(persisted).toHaveLength(5);
  }, 60_000);

  it("voids pushes out of the denominator instead of counting them wrong", async () => {
    const season = await ensureArenaSeason(handle.db, {
      endsAt: day(46),
      name: `${marker}-pushes`,
      startsAt: day(40),
    });

    // 1 member x 4 picks = 4 scorable, minus 2 pushes = 2. Two correct out of
    // that 2 is 100%. Counting the pushes as wrong would report 50% instead.
    await seedPickWeek({
      closesDay: 45,
      graded: [{ correct: 2, userId: userAlpha.id, voids: 2 }],
      leagueId: leagueA.id,
      maxPicksPerUser: 4,
      opensDay: 41,
      rosterSize: 1,
      week: 40,
    });

    const rebuilt = await rebuildArenaStandings(handle.db, {
      computedAt: day(45),
      seasonId: season.id,
    });

    const league = rebuilt.leagueStandings.find((row) => row.id === leagueA.id);
    expect(league).toMatchObject({
      accuracyBps: 10_000,
      correctPicks: 2,
      scorablePicks: 2,
      voidPicks: 2,
    });
  }, 60_000);

  it("counts a week nobody picked against the league", async () => {
    const season = await ensureArenaSeason(handle.db, {
      endsAt: day(56),
      name: `${marker}-silent`,
      startsAt: day(50),
    });

    // Week 50: a perfect 3/3. Week 51: nobody submitted anything.
    await seedPickWeek({
      closesDay: 52,
      graded: [{ correct: 3, userId: userAlpha.id }],
      leagueId: leagueA.id,
      maxPicksPerUser: 3,
      opensDay: 51,
      rosterSize: 1,
      week: 50,
    });
    await seedPickWeek({
      closesDay: 55,
      graded: [],
      leagueId: leagueA.id,
      maxPicksPerUser: 3,
      opensDay: 53,
      rosterSize: 1,
      week: 51,
    });

    const rebuilt = await rebuildArenaStandings(handle.db, {
      computedAt: day(55),
      seasonId: season.id,
    });

    // 3 correct out of 6 scorable. The silent week still costs its full
    // denominator -- an inner join would have dropped it and reported 100%.
    const league = rebuilt.leagueStandings.find((row) => row.id === leagueA.id);
    expect(league).toMatchObject({
      accuracyBps: 5_000,
      correctPicks: 3,
      scorablePicks: 6,
      weeksPlayed: 2,
    });
  }, 60_000);

  it("stamps rank movement against the prior materialized standings", async () => {
    const season = await ensureArenaSeason(handle.db, {
      endsAt: day(20),
      name: `${marker}-movement`,
      startsAt: day(10),
    });

    // B ahead: 3/4 vs A's 2/4.
    await seedPickWeek({
      closesDay: 17,
      graded: [{ correct: 2, incorrect: 2, userId: userAlpha.id }],
      leagueId: leagueA.id,
      maxPicksPerUser: 4,
      opensDay: 11,
      rosterSize: 1,
      week: 10,
    });
    await seedPickWeek({
      closesDay: 17,
      graded: [{ correct: 3, incorrect: 1, userId: userGamma.id }],
      leagueId: leagueB.id,
      maxPicksPerUser: 4,
      opensDay: 11,
      rosterSize: 1,
      week: 10,
    });

    const first = await rebuildArenaStandings(handle.db, {
      computedAt: day(12),
      seasonId: season.id,
    });
    expect(extractArenaStandingSwingSignals(first)).toEqual([]);
    expect(
      first.leagueStandings.map((row) => ({
        delta: row.rankDelta,
        name: row.displayName,
        previous: row.previousRank,
        rank: row.rank,
      })),
    ).toEqual([
      { delta: 0, name: "Arena League B", previous: null, rank: 1 },
      { delta: 0, name: "Arena League A", previous: null, rank: 2 },
    ]);

    // A sweeps a second, larger week and overtakes: (2+6)/(4+6) = 80% against
    // B's unchanged 3/4 = 75%. A 4-pick sweep would only reach 6/8 = 75% and
    // tie, which would leave the rank order undefined -- and this test is
    // specifically about movement, so the gap has to be real.
    await seedPickWeek({
      closesDay: 19,
      graded: [{ correct: 6, userId: userBeta.id }],
      leagueId: leagueA.id,
      maxPicksPerUser: 6,
      opensDay: 18,
      rosterSize: 1,
      week: 11,
    });

    const second = await rebuildArenaStandings(handle.db, {
      computedAt: day(13),
      seasonId: season.id,
    });
    expect(extractArenaStandingSwingSignals(second)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "league",
          leagueId: leagueA.id,
          newRank: 1,
          oldRank: 2,
          rankDelta: 1,
          subjectId: leagueA.id,
          userId: null,
        }),
        expect.objectContaining({
          kind: "league",
          leagueId: leagueB.id,
          newRank: 2,
          oldRank: 1,
          rankDelta: -1,
          subjectId: leagueB.id,
          userId: null,
        }),
      ]),
    );
    const leaderboard = await getArenaLeaderboardData(handle.db, {
      now: day(14),
      seasonId: season.id,
    });

    expect(leaderboard.season?.status).toBe("active");
    expect(leaderboard.seasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: season.id,
          isSelected: true,
          status: "active",
        }),
      ]),
    );
    expect(
      leaderboard.leagueStandings.map((row) => ({
        delta: row.rankDelta,
        name: row.displayName,
        previous: row.previousRank,
        rank: row.rank,
      })),
    ).toEqual([
      { delta: 1, name: "Arena League A", previous: 2, rank: 1 },
      { delta: -1, name: "Arena League B", previous: 1, rank: 2 },
    ]);
    expect(leaderboard.movers.risers).toEqual([
      expect.objectContaining({
        displayName: "Arena League A",
        kind: "league",
        previousRank: 2,
        rank: 1,
        rankDelta: 1,
      }),
    ]);
    expect(leaderboard.movers.fallers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Arena League B",
          kind: "league",
          previousRank: 1,
          rank: 2,
          rankDelta: -1,
        }),
      ]),
    );
  }, 60_000);
});
