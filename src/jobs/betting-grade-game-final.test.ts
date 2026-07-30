// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type EventResult,
  ensureArenaSeason,
  type ResultsProvider,
  type ResultsProviderInput,
} from "@/betting";
import { openPickWeek } from "@/betting/pickem";
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
import { RecordingPushNotifier } from "@/push";
import { REALTIME_EVENTS, RecordingRealtimePublisher } from "@/realtime";
import { JOB_EVENTS } from "./events";
import {
  bettingGradeGameFinal,
  createBettingGradeGameFinalFunction,
  gradeGameFinalFacts,
  publishGameFinalEffects,
  runBettingGradeGameFinal,
} from "./functions/betting-grade-game-final";
import { functions } from "./index";

const marker = `gradejob-${randomUUID()}`;
let handle: DbHandle;
let league: League;
let rivalLeague: League;
let rivalUser: User;
let user: User;
let counter = 0;

/** Home 21, away 14 — home wins outright and covers any line under 7. */
class StaticResultsProvider implements ResultsProvider {
  readonly id = `${marker}-results`;

  async getEventResult(_input: ResultsProviderInput): Promise<EventResult> {
    return {
      awayScore: 14,
      finalStatus: "final",
      homeScore: 21,
      playerStats: [],
      provider: this.id,
      sourcePayload: { marker, score: "21-14" },
    } as EventResult;
  }
}

class PendingResultsProvider implements ResultsProvider {
  readonly id = `${marker}-pending`;

  async getEventResult(_input: ResultsProviderInput): Promise<EventResult> {
    return {
      awayScore: 0,
      finalStatus: "in_progress",
      homeScore: 0,
      playerStats: [],
      provider: this.id,
      sourcePayload: { marker },
    } as EventResult;
  }
}

async function seedEventWithMarkets(tag: string) {
  counter += 1;
  const id = `${marker}-${tag}-${counter}`;
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: "Fixture Away",
      contentHash: `${id}:event`,
      homeTeam: "Fixture Home",
      provider: marker,
      providerEventId: `${id}:event`,
      sport: "nfl",
      startTime: new Date("2037-09-07T17:00:00.000Z"),
      status: "scheduled",
    })
    .returning();

  const markets = [];
  for (const side of ["a", "b"]) {
    const [market] = await handle.db
      .insert(bettingMarkets)
      .values({
        contentHash: `${id}:${side}:market`,
        eventId: event.id,
        period: "full_game",
        provider: marker,
        providerMarketId: `${id}:${side}:moneyline`,
        status: "open",
        subject: "game",
        type: "moneyline",
      })
      .returning();
    const [snapshot] = await handle.db
      .insert(oddsSnapshots)
      .values({
        awayPrice: 120,
        capturedAt: new Date("2037-09-07T12:00:00.000Z"),
        homePrice: -140,
        marketId: market.id,
        provider: marker,
        sourcePayloadHash: `${id}:${side}:snapshot`,
      })
      .returning();
    markets.push({ market, snapshot });
  }
  return { event, markets };
}

/**
 * One pick per league on the same event. The focus league takes the winner and
 * the rival takes the loser, so grading produces a genuine rank change rather
 * than a staged one.
 */
async function seedPicks(
  markets: Awaited<ReturnType<typeof seedEventWithMarkets>>["markets"],
  weekNumber: number,
) {
  const entries = [
    {
      leagueId: league.id,
      market: markets[0],
      selection: "home" as const,
      userId: user.id,
    },
    {
      leagueId: rivalLeague.id,
      market: markets[1],
      selection: "away" as const,
      userId: rivalUser.id,
    },
  ];
  for (const entry of entries) {
    const week = await openPickWeek(handle.db, {
      closesAt: new Date("2037-09-14T00:00:00.000Z"),
      leagueId: entry.leagueId,
      maxPicksPerUser: 1,
      opensAt: new Date("2037-09-01T00:00:00.000Z"),
      rosterSize: 1,
      season: 2037,
      week: weekNumber,
    });
    await withLeagueContext(handle.db, entry.leagueId, (tx) =>
      tx.insert(picks).values({
        idempotencyKey: `${marker}:pick:${entry.leagueId}:${weekNumber}`,
        leagueId: entry.leagueId,
        marketId: entry.market.market.id,
        oddsSnapshotId: entry.market.snapshot.id,
        pickWeekId: week.pickWeekId,
        selection: entry.selection,
        userId: entry.userId,
      }),
    );
  }
}

function deps(resultsProvider: ResultsProvider = new StaticResultsProvider()) {
  return {
    db: handle.db,
    push: new RecordingPushNotifier(),
    realtime: new RecordingRealtimePublisher(),
    resultsProvider,
  };
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await handle.pool.query("select 1");
  await migrateSerialized(handle);

  [user, rivalUser] = await handle.db
    .insert(users)
    .values([
      { displayName: "Grade User", email: `${marker}-a@example.test` },
      { displayName: "Rival User", email: `${marker}-b@example.test` },
    ])
    .returning();
  [league, rivalLeague] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Grade League",
        provider: "espn",
        providerLeagueId: `${marker}-a`,
      },
      {
        name: "Rival League",
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
    .where(sql`${arenaSeasons.name} like ${`${marker}%`}`);
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

describe("betting game.final grading job", () => {
  it("resolves the event, grades picks, and moves the arena", async () => {
    const { event, markets } = await seedEventWithMarkets("main");
    await seedPicks(markets, 1);
    const arenaSeason = await ensureArenaSeason(handle.db, {
      endsAt: new Date("2037-10-01T00:00:00.000Z"),
      name: `${marker}-arena`,
      startsAt: new Date("2037-09-01T00:00:00.000Z"),
    });

    const result = await runBettingGradeGameFinal({
      data: { bettingEventId: event.id, leagueId: league.id },
      deps: deps(),
    });

    expect(result).toMatchObject({
      gradedPicks: { correct: 1, incorrect: 1, void: 0 },
      ok: true,
      skippedReason: null,
    });

    // The event itself is marked final and its markets are closed, so they
    // leave the Pick 'em slate.
    const [resolved] = await handle.db
      .select()
      .from(bettingEvents)
      .where(eq(bettingEvents.id, event.id));
    expect(resolved).toMatchObject({
      awayScore: 14,
      homeScore: 21,
      status: "final",
    });
    const marketRows = await handle.db
      .select({ status: bettingMarkets.status })
      .from(bettingMarkets)
      .where(eq(bettingMarkets.eventId, event.id));
    expect(marketRows.every((row) => row.status === "settled")).toBe(true);

    // One content-planning trigger per league whose picks were graded, keyed
    // on the game so a retry produces the same id.
    expect(result.picksGradedEvents).toHaveLength(2);
    expect(
      result.picksGradedEvents.map((planned) => planned.id).sort(),
    ).toEqual(
      [
        `${JOB_EVENTS.picksGraded}:${league.id}:${event.id}`,
        `${JOB_EVENTS.picksGraded}:${rivalLeague.id}:${event.id}`,
      ].sort(),
    );

    const arenaRows = await handle.db
      .select()
      .from(arenaStandings)
      .where(eq(arenaStandings.seasonId, arenaSeason.id));
    // 2 leagues + 2 individuals, all scored from the picks just graded.
    expect(arenaRows).toHaveLength(4);
    const focus = arenaRows.find((row) => row.subjectId === league.id);
    const rival = arenaRows.find((row) => row.subjectId === rivalLeague.id);
    expect(focus).toMatchObject({ accuracyBps: 10_000, correctPicks: 1 });
    expect(rival).toMatchObject({ accuracyBps: 0, correctPicks: 0 });
  }, 90_000);

  it("leaves picks pending when the provider has no final result", async () => {
    const { event, markets } = await seedEventWithMarkets("pending");
    await seedPicks(markets, 2);

    const result = await runBettingGradeGameFinal({
      data: { bettingEventId: event.id, leagueId: league.id },
      deps: deps(new PendingResultsProvider()),
    });

    expect(result).toMatchObject({
      gradedPicks: { correct: 0, incorrect: 0, void: 0 },
      picksGradedEvents: [],
      skippedReason: "result_not_final",
    });
    const [row] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({ status: picks.status })
        .from(picks)
        .where(eq(picks.leagueId, league.id)),
    );
    expect(row).toBeDefined();
  }, 60_000);

  it("still fires the fan-out when it throws and retries (UIX-106)", async () => {
    // Resolution and grading are idempotent, so a second pass finds nothing to
    // do and reports zero counters. When all of this lived in one step, a throw
    // down here re-ran everything, skipped the fan-out, and returned success
    // with every downstream effect silently dropped.
    const { event, markets } = await seedEventWithMarkets("retry");
    await seedPicks(markets, 3);
    await ensureArenaSeason(handle.db, {
      endsAt: new Date("2037-10-01T00:00:00.000Z"),
      name: `${marker}-arena-retry`,
      startsAt: new Date("2037-09-01T00:00:00.000Z"),
    });

    const base = deps();
    const facts = await gradeGameFinalFacts({
      data: { bettingEventId: event.id, leagueId: league.id },
      deps: base,
    });
    expect(facts.pickAffectedLeagueIds).toHaveLength(2);

    // The arena rebuild is the real unwrapped throw site: a multi-league
    // recompute in one transaction. Push and realtime are both best-effort and
    // cannot fail the step.
    const exploding = {
      ...base,
      db: new Proxy(handle.db, {
        get(target, prop, receiver) {
          if (prop === "transaction") {
            return async () => {
              throw new Error("arena rebuild deadlocked");
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }) as typeof handle.db,
    };
    await expect(
      publishGameFinalEffects({ deps: exploding, facts }),
    ).rejects.toThrow("arena rebuild deadlocked");

    // Re-deriving the facts on the retry — the pre-split behaviour — yields
    // nothing, because grading already happened.
    const rederived = await gradeGameFinalFacts({
      data: { bettingEventId: event.id, leagueId: league.id },
      deps: base,
    });
    expect(rederived.pickAffectedLeagueIds).toEqual([]);

    // Retrying against the MEMOIZED facts still produces the fan-out.
    const effects = await publishGameFinalEffects({ deps: base, facts });
    expect(effects.arenaLeaderboardUpdates.length).toBeGreaterThan(0);
    expect(base.realtime.arenaLeaderboardUpdated.length).toBeGreaterThan(0);
  }, 90_000);

  it("runs both steps through the Inngest step API", async () => {
    const { event, markets } = await seedEventWithMarkets("engine");
    await seedPicks(markets, 4);
    await ensureArenaSeason(handle.db, {
      endsAt: new Date("2037-10-01T00:00:00.000Z"),
      name: `${marker}-arena-engine`,
      startsAt: new Date("2037-09-01T00:00:00.000Z"),
    });

    const resolved = deps();
    const fn = createBettingGradeGameFinalFunction(() => resolved);
    const testEngine = new InngestTestEngine({ function: fn });

    // Reaching the second step at all proves the first ran and handed its
    // memoized facts across the boundary.
    const stepRun = await testEngine.executeStep("publish-grading-effects", {
      events: [
        {
          data: { bettingEventId: event.id, leagueId: league.id },
          name: JOB_EVENTS.bettingEventFinal,
        },
      ],
    });

    expect(stepRun.step.name).toBe("publish-grading-effects");
    expect(stepRun.result).toMatchObject({
      arenaLeaderboardUpdates: expect.arrayContaining([
        expect.objectContaining({
          type: REALTIME_EVENTS.arenaLeaderboardUpdated,
        }),
      ]),
    });
  }, 90_000);

  it("rejects a payload with no betting event id, without retrying", async () => {
    // The id is required now: a producer that cannot supply one must fail at
    // the edge rather than have the grader guess and silently grade nothing,
    // which is precisely how UIX-101 survived being "fixed".
    await expect(
      runBettingGradeGameFinal({
        data: { leagueId: randomUUID() },
        deps: deps(),
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(bettingGradeGameFinal);
  });
});
