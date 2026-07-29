// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
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
import { openPickWeek, submitPick } from "./pickem";
import { computeLeagueSeasonStandings } from "./pickem-standings";

/**
 * Season standings.
 *
 * The load-bearing property is that a season sums the underlying counts rather
 * than averaging weekly percentages — otherwise a league could lift its season
 * score with one strong low-volume week.
 */

const marker = `standings-${randomUUID()}`;
const season = 2099; // isolated from other suites sharing this database
const opensAt = new Date("2026-09-08T12:00:00.000Z");
const closesAt = new Date("2026-09-20T12:00:00.000Z");
const kickoff = new Date("2026-09-13T17:00:00.000Z");
const beforeKickoff = new Date("2026-09-13T16:00:00.000Z");

let handle: DbHandle;
let leagueA: League;
let leagueB: League;
let user: User;
let counter = 0;

async function seedSnapshot() {
  counter += 1;
  const providerEventId = `${marker}-e${counter}`;
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: "Away",
      contentHash: `${providerEventId}:e`,
      homeTeam: "Home",
      provider: marker,
      providerEventId,
      sport: "nfl",
      startTime: kickoff,
      status: "scheduled",
    })
    .returning();
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${providerEventId}:m`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId: `${providerEventId}:spread`,
      status: "open",
      subject: "game",
      type: "spread",
    })
    .returning();
  const [snapshot] = await handle.db
    .insert(oddsSnapshots)
    .values({
      capturedAt: opensAt,
      homePrice: -110,
      line: -3.5,
      marketId: market.id,
      provider: marker,
      sourcePayloadHash: `${providerEventId}:s`,
    })
    .returning();
  return snapshot;
}

/** Seeds a week for `league` and grades `correct` of `submit` picks. */
async function seedWeek(
  league: League,
  week: number,
  rosterSize: number,
  submit: number,
  correct: number,
): Promise<void> {
  const opened = await openPickWeek(handle.db, {
    closesAt,
    leagueId: league.id,
    maxPicksPerUser: 10,
    opensAt,
    rosterSize,
    season,
    week,
  });

  const ids: string[] = [];
  for (let index = 0; index < submit; index += 1) {
    const snapshot = await seedSnapshot();
    const result = await submitPick(handle.db, {
      idempotencyKey: `${marker}-${league.id}-w${week}-${index}`,
      leagueId: league.id,
      now: beforeKickoff,
      oddsSnapshotId: snapshot.id,
      pickWeekId: opened.pickWeekId,
      selection: "home",
      userId: user.id,
    });
    ids.push(result.pickId);
  }

  await withLeagueContext(handle.db, league.id, async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx
        .update(picks)
        .set({ status: index < correct ? "correct" : "incorrect" })
        .where(eq(picks.id, id));
    }
  });
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await handle.pool.query("select 1");
  await migrateSerialized(handle);

  [user] = await handle.db
    .insert(users)
    .values({ displayName: "Standings", email: `${marker}@example.test` })
    .returning();

  [leagueA, leagueB] = await handle.db
    .insert(leagues)
    .values([
      { name: "A", provider: "espn", providerLeagueId: `${marker}-a` },
      { name: "B", provider: "espn", providerLeagueId: `${marker}-b` },
    ])
    .returning();
}, 90_000);

afterAll(async () => {
  await handle?.pool.end();
});

describe("league season standings", () => {
  it("sums counts across weeks rather than averaging weekly percentages", async () => {
    // League A: a tiny near-perfect week, then a big mediocre one.
    //   week 1: roster 1 -> denominator 10, 2 submitted, 2 correct
    //   week 2: roster 1 -> denominator 10, 10 submitted, 3 correct
    // Averaging the weekly percentages gives (20% + 30%) / 2 = 25%.
    // Summing gives 5 correct / 20 scorable = 25%... so pick numbers that
    // actually diverge: week 1 is 2/10 = 20%, week 2 is 8/10 = 80%.
    // mean = 50%; summed = 10/20 = 50%. Still equal because denominators match.
    // Make the denominators differ instead — that is the real case.
    await seedWeek(leagueA, 1, 1, 2, 2); // denominator 10, 2 correct
    await seedWeek(leagueA, 2, 3, 10, 4); // denominator 30, 4 correct

    const standings = await computeLeagueSeasonStandings(handle.db, { season });
    const a = standings.find((row) => row.leagueId === leagueA.id);

    // Summed: 6 correct / 40 scorable = 15%.
    // Averaged weekly: (2/10 + 4/30) / 2 = (20% + 13.3%) / 2 = 16.7%.
    // The two differ, so this pins the summing behaviour.
    expect(a?.scorablePicks).toBe(40);
    expect(a?.correctPicks).toBe(6);
    expect(a?.storedAccuracy).toBe(0.15);
    expect(a?.weeksPlayed).toBe(2);
  });

  it("counts a week nobody picked at its full denominator", async () => {
    // The LEFT join matters: an inner join would drop this week entirely and
    // flatter the league by shrinking its season denominator.
    await seedWeek(leagueB, 1, 2, 0, 0); // denominator 20, nothing submitted

    const standings = await computeLeagueSeasonStandings(handle.db, { season });
    const b = standings.find((row) => row.leagueId === leagueB.id);

    expect(b?.weeksPlayed).toBe(1);
    expect(b?.scorablePicks).toBe(20);
    expect(b?.correctPicks).toBe(0);
    expect(b?.accuracy).toBe(0);
  });

  it("ranks by accuracy and reports participation without adjusting the score", async () => {
    const standings = await computeLeagueSeasonStandings(handle.db, { season });
    const a = standings.find((row) => row.leagueId === leagueA.id);
    const b = standings.find((row) => row.leagueId === leagueB.id);

    // A (15%) outranks B (0%).
    expect(a?.rank).toBeLessThan(b?.rank ?? Number.MAX_SAFE_INTEGER);
    // Neither league cleared the 90% participation floor in any week, yet both
    // still carry a real accuracy — the gate governs prizes, not scoring.
    expect(a?.eligibleWeeks).toBe(0);
    expect(a?.accuracy).toBeGreaterThan(0);
  });

  it("restricts to the requested week range", async () => {
    const onlyWeekOne = await computeLeagueSeasonStandings(handle.db, {
      fromWeek: 1,
      season,
      toWeek: 1,
    });
    const a = onlyWeekOne.find((row) => row.leagueId === leagueA.id);
    // Week 1 alone: denominator 10, 2 correct.
    expect(a?.scorablePicks).toBe(10);
    expect(a?.correctPicks).toBe(2);
  });
});
