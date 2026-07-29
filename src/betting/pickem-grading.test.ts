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
import type { EventResult } from "./interfaces";
import { openPickWeek } from "./pickem";
import { gradePicksForEvent } from "./pickem-grading";

const marker = `pickgrade-${randomUUID()}`;
const season = 2094;
const opensAt = new Date("2026-09-08T12:00:00.000Z");
const closesAt = new Date("2026-09-20T12:00:00.000Z");
const kickoff = new Date("2026-09-13T17:00:00.000Z");

let handle: DbHandle;
let league: League;
let otherLeague: League;
let user: User;
let counter = 0;

async function seedEvent() {
  counter += 1;
  const id = `${marker}-e${counter}`;
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: "Away",
      contentHash: `${id}:e`,
      homeTeam: "Home",
      provider: marker,
      providerEventId: id,
      sport: "nfl",
      startTime: kickoff,
      status: "final",
    })
    .returning();
  return event;
}

async function seedMarket(
  eventId: string,
  type: "moneyline" | "spread" | "total",
) {
  counter += 1;
  const id = `${marker}-m${counter}`;
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${id}:m`,
      eventId,
      period: "full_game",
      provider: marker,
      providerMarketId: id,
      status: "open",
      subject: "game",
      type,
    })
    .returning();
  const [snapshot] = await handle.db
    .insert(oddsSnapshots)
    .values({
      awayPrice: -110,
      capturedAt: opensAt,
      homePrice: -110,
      line: type === "moneyline" ? null : -3.5,
      marketId: market.id,
      provider: marker,
      sourcePayloadHash: `${id}:s`,
    })
    .returning();
  return { market, snapshot };
}

async function seedPick(input: {
  leagueId: string;
  pickWeekId: string;
  marketId: string;
  snapshotId: string;
  selection: "home" | "away" | "over" | "under";
  lockedLine?: number | null;
  status?: "pending" | "correct" | "incorrect" | "void";
}) {
  counter += 1;
  const [row] = await withLeagueContext(handle.db, input.leagueId, (tx) =>
    tx
      .insert(picks)
      .values({
        idempotencyKey: `${marker}-p${counter}`,
        leagueId: input.leagueId,
        lockedLine: input.lockedLine ?? null,
        marketId: input.marketId,
        oddsSnapshotId: input.snapshotId,
        pickWeekId: input.pickWeekId,
        selection: input.selection,
        status: input.status ?? "pending",
        userId: user.id,
      })
      .returning(),
  );
  return row;
}

async function statusOf(leagueId: string, pickId: string) {
  const [row] = await withLeagueContext(handle.db, leagueId, (tx) =>
    tx
      .select({ gradedAt: picks.gradedAt, status: picks.status })
      .from(picks)
      .where(eq(picks.id, pickId)),
  );
  return row;
}

function finalResult(overrides: Partial<EventResult> = {}): EventResult {
  return {
    awayScore: 17,
    finalStatus: "final",
    homeScore: 24,
    playerStats: [],
    ...overrides,
  } as EventResult;
}

let pickWeekId: string;
let otherPickWeekId: string;

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await handle.pool.query("select 1");
  await migrateSerialized(handle);

  [user] = await handle.db
    .insert(users)
    .values({ displayName: "Grader", email: `${marker}@example.test` })
    .returning();
  [league, otherLeague] = await handle.db
    .insert(leagues)
    .values([
      { name: "Grade A", provider: "espn", providerLeagueId: `${marker}-a` },
      { name: "Grade B", provider: "espn", providerLeagueId: `${marker}-b` },
    ])
    .returning();

  pickWeekId = (
    await openPickWeek(handle.db, {
      closesAt,
      leagueId: league.id,
      maxPicksPerUser: 10,
      opensAt,
      rosterSize: 2,
      season,
      week: 1,
    })
  ).pickWeekId;
  otherPickWeekId = (
    await openPickWeek(handle.db, {
      closesAt,
      leagueId: otherLeague.id,
      maxPicksPerUser: 10,
      opensAt,
      rosterSize: 2,
      season,
      week: 1,
    })
  ).pickWeekId;
}, 90_000);

afterAll(async () => {
  await handle?.pool.end();
});

describe("Pick 'em grading", () => {
  it("grades a moneyline pick correct or incorrect from the final score", async () => {
    const event = await seedEvent();
    // Two markets, not two picks on one: `picks_user_market_unique` allows a
    // user only one pick per market per week, which is the point of the index.
    const right = await seedMarket(event.id, "moneyline");
    const wrong = await seedMarket(event.id, "moneyline");
    const rightSide = await seedPick({
      leagueId: league.id,
      marketId: right.market.id,
      pickWeekId,
      selection: "home",
      snapshotId: right.snapshot.id,
    });
    const wrongSide = await seedPick({
      leagueId: league.id,
      marketId: wrong.market.id,
      pickWeekId,
      selection: "away",
      snapshotId: wrong.snapshot.id,
    });

    // Home 24, away 17.
    const graded = await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult(),
    });

    expect(graded).toMatchObject({ correct: 1, incorrect: 1, void: 0 });
    expect((await statusOf(league.id, rightSide.id))?.status).toBe("correct");
    expect((await statusOf(league.id, wrongSide.id))?.status).toBe("incorrect");
    expect(graded.affectedLeagueIds).toContain(league.id);
  });

  it("voids a push instead of marking it incorrect", async () => {
    // This is the rule the whole denominator rests on. A push is not a pick
    // the user got wrong -- it leaves the denominator entirely. Grading it
    // `incorrect` would take a point off for an outcome that never decided.
    const event = await seedEvent();
    const { market, snapshot } = await seedMarket(event.id, "spread");
    const pushed = await seedPick({
      leagueId: league.id,
      lockedLine: -7,
      marketId: market.id,
      pickWeekId,
      selection: "home",
      snapshotId: snapshot.id,
    });

    // Home wins by exactly the line: 24 - 17 = 7.
    const graded = await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult(),
    });

    expect(graded).toMatchObject({ correct: 0, incorrect: 0, void: 1 });
    expect((await statusOf(league.id, pushed.id))?.status).toBe("void");
  });

  it("grades a spread against the line the user locked, not the current one", async () => {
    // The snapshot carries -3.5, but this pick locked -7. Grading against the
    // snapshot would move the goalposts after the user committed.
    const event = await seedEvent();
    const { market, snapshot } = await seedMarket(event.id, "spread");
    const locked = await seedPick({
      leagueId: league.id,
      lockedLine: -7.5,
      marketId: market.id,
      pickWeekId,
      selection: "home",
      snapshotId: snapshot.id,
    });

    // Home by 7. Covers -3.5, does NOT cover -7.5.
    await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult(),
    });

    expect((await statusOf(league.id, locked.id))?.status).toBe("incorrect");
  });

  it("never regrades a pick that already has an outcome", async () => {
    // Idempotence: an Inngest retry, or a provider correcting a box score
    // hours later, must not silently flip a settled pick.
    const event = await seedEvent();
    const { market, snapshot } = await seedMarket(event.id, "moneyline");
    const alreadyGraded = await seedPick({
      leagueId: league.id,
      marketId: market.id,
      pickWeekId,
      selection: "away",
      snapshotId: snapshot.id,
      status: "correct",
    });

    // Away lost, so a fresh grade would say "incorrect".
    const graded = await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult(),
    });

    expect(graded).toMatchObject({ correct: 0, incorrect: 0, void: 0 });
    expect((await statusOf(league.id, alreadyGraded.id))?.status).toBe(
      "correct",
    );
  });

  it("leaves an already-graded pick alone while grading a pending one beside it", async () => {
    // The mixed case is the one that actually exercises the guard. When a
    // league has NO pending picks it is never visited at all, so a test with
    // only a graded pick passes even if the guard is deleted -- which is
    // exactly what happened when this was falsified. Here the league is
    // visited because of the pending pick, and the graded pick sitting next to
    // it must survive untouched.
    const event = await seedEvent();
    const stale = await seedMarket(event.id, "moneyline");
    const fresh = await seedMarket(event.id, "moneyline");

    // "away" lost, so a regrade would flip this from correct to incorrect.
    const alreadyGraded = await seedPick({
      leagueId: league.id,
      marketId: stale.market.id,
      pickWeekId,
      selection: "away",
      snapshotId: stale.snapshot.id,
      status: "correct",
    });
    const pending = await seedPick({
      leagueId: league.id,
      marketId: fresh.market.id,
      pickWeekId,
      selection: "home",
      snapshotId: fresh.snapshot.id,
    });

    const graded = await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult(),
    });

    expect(graded).toMatchObject({ correct: 1, incorrect: 0 });
    expect((await statusOf(league.id, pending.id))?.status).toBe("correct");
    expect((await statusOf(league.id, alreadyGraded.id))?.status).toBe(
      "correct",
    );
  });

  it("is safe to run twice", async () => {
    const event = await seedEvent();
    const { market, snapshot } = await seedMarket(event.id, "moneyline");
    await seedPick({
      leagueId: league.id,
      marketId: market.id,
      pickWeekId,
      selection: "home",
      snapshotId: snapshot.id,
    });

    const first = await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult(),
    });
    const second = await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult(),
    });

    expect(first.correct).toBe(1);
    // The second pass finds nothing pending, so it reports no work and no
    // affected league -- which is what stops it triggering a pointless rebuild.
    expect(second).toMatchObject({ affectedLeagueIds: [], correct: 0 });
  });

  it("grades every league holding a pick on the same event", async () => {
    // One central event, two leagues. Grading must reach both, and the RLS
    // per-league loop is the only reason it can.
    const event = await seedEvent();
    const { market, snapshot } = await seedMarket(event.id, "moneyline");
    const mine = await seedPick({
      leagueId: league.id,
      marketId: market.id,
      pickWeekId,
      selection: "home",
      snapshotId: snapshot.id,
    });
    const theirs = await seedPick({
      leagueId: otherLeague.id,
      marketId: market.id,
      pickWeekId: otherPickWeekId,
      selection: "away",
      snapshotId: snapshot.id,
    });

    const graded = await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult(),
    });

    expect((await statusOf(league.id, mine.id))?.status).toBe("correct");
    expect((await statusOf(otherLeague.id, theirs.id))?.status).toBe(
      "incorrect",
    );
    expect([...graded.affectedLeagueIds].sort()).toEqual(
      [league.id, otherLeague.id].sort(),
    );
  });

  it("leaves picks pending when the event has not finished", async () => {
    const event = await seedEvent();
    const { market, snapshot } = await seedMarket(event.id, "moneyline");
    const pending = await seedPick({
      leagueId: league.id,
      marketId: market.id,
      pickWeekId,
      selection: "home",
      snapshotId: snapshot.id,
    });

    const graded = await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult({ finalStatus: "in_progress" }),
    });

    expect(graded).toMatchObject({ affectedLeagueIds: [], correct: 0 });
    expect((await statusOf(league.id, pending.id))?.status).toBe("pending");
  });

  it("voids picks on a canceled game rather than marking them wrong", async () => {
    const event = await seedEvent();
    const { market, snapshot } = await seedMarket(event.id, "moneyline");
    const canceled = await seedPick({
      leagueId: league.id,
      marketId: market.id,
      pickWeekId,
      selection: "home",
      snapshotId: snapshot.id,
    });

    const graded = await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      result: finalResult({ finalStatus: "canceled" }),
    });

    expect(graded).toMatchObject({ void: 1 });
    expect((await statusOf(league.id, canceled.id))?.status).toBe("void");
  });

  it("stamps gradedAt so a graded pick records when it settled", async () => {
    const event = await seedEvent();
    const { market, snapshot } = await seedMarket(event.id, "moneyline");
    const pick = await seedPick({
      leagueId: league.id,
      marketId: market.id,
      pickWeekId,
      selection: "home",
      snapshotId: snapshot.id,
    });

    const gradedAt = new Date("2026-09-13T23:45:00.000Z");
    await gradePicksForEvent(handle.db, {
      bettingEventId: event.id,
      gradedAt,
      result: finalResult(),
    });

    expect((await statusOf(league.id, pick.id))?.gradedAt).toEqual(gradedAt);
  });
});
