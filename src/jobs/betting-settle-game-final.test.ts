// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appendBankrollLedgerEntry,
  type EventResult,
  ensureArenaSeason,
  openBankrollWeek,
  placeBetSlip,
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
  betSlips,
  bettingEvents,
  bettingMarkets,
  type League,
  leagues,
  members,
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
  bettingSettleGameFinal,
  createBettingSettleGameFinalFunction,
  publishGameFinalEffects,
  runBettingSettleGameFinal,
  settleGameFinalFacts,
} from "./functions/betting-settle-game-final";
import { functions } from "./index";

const marker = `settlejob-${randomUUID()}`;
let handle: DbHandle;
let league: League;
let rivalLeague: League;
let rivalUser: User;
let user: User;

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
    };
  }
}

async function seedPlacedSingle(tag = "") {
  const opened = await openBankrollWeek(handle.db, {
    leagueId: league.id,
    userId: user.id,
    weekEnd: new Date("2037-09-08T00:00:00.000Z"),
    weekStart: new Date("2037-09-01T00:00:00.000Z"),
  });
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: "Fixture Away",
      contentHash: `${marker}${tag}:event`,
      homeTeam: "Fixture Home",
      provider: marker,
      providerEventId: `${marker}${tag}:event`,
      sport: "nfl",
      startTime: new Date("2037-09-07T17:00:00.000Z"),
      status: "scheduled",
    })
    .returning();
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${marker}${tag}:market`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId: `${marker}${tag}:moneyline`,
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
      sourcePayloadHash: `${marker}${tag}:snapshot`,
    })
    .returning();
  const placed = await placeBetSlip(handle.db, {
    bankrollWeekId: opened.week.id,
    idempotencyKey: `${marker}${tag}:job`,
    kind: "single",
    leagueId: league.id,
    legs: [{ oddsSnapshotId: snapshot.id, selection: "home" }],
    now: new Date("2037-09-07T12:01:00.000Z"),
    stakeCents: 10_000,
    userId: user.id,
  });

  return { event, placed };
}

async function seedRivalSettledSingle() {
  const opened = await openBankrollWeek(handle.db, {
    leagueId: rivalLeague.id,
    userId: rivalUser.id,
    weekEnd: new Date("2037-09-08T00:00:00.000Z"),
    weekStart: new Date("2037-09-01T00:00:00.000Z"),
  });
  const [slip] = await withLeagueContext(handle.db, rivalLeague.id, (tx) =>
    tx
      .insert(betSlips)
      .values({
        bankrollWeekId: opened.week.id,
        combinedDecimalOdds: 1.5,
        idempotencyKey: `${marker}:rival-job`,
        kind: "single",
        leagueId: rivalLeague.id,
        placedAt: new Date("2037-09-07T12:01:00.000Z"),
        potentialPayoutCents: 15_000,
        requestHash: `${marker}:rival-request`,
        settledAt: new Date("2037-09-07T22:00:00.000Z"),
        stakeCents: 10_000,
        status: "won",
        userId: rivalUser.id,
      })
      .returning(),
  );

  await appendBankrollLedgerEntry(handle.db, {
    amountCents: -10_000,
    bankrollWeekId: opened.week.id,
    entryType: "bet_stake",
    leagueId: rivalLeague.id,
    refSlipId: slip.id,
    userId: rivalUser.id,
  });
  await appendBankrollLedgerEntry(handle.db, {
    amountCents: 15_000,
    bankrollWeekId: opened.week.id,
    entryType: "bet_payout",
    leagueId: rivalLeague.id,
    refSlipId: slip.id,
    userId: rivalUser.id,
  });
}

/**
 * Puts a Pick 'em entry on the SAME event for each league.
 *
 * The arena ranks on graded picks now, not on settled slips, so without this
 * the rebuild that follows settlement finds no picks, produces no standings,
 * and emits no swing -- and the fan-out this test exists to prove never fires.
 *
 * `user` takes the winner and `rivalUser` the loser, so after grading the
 * focus league passes the rival and the rank swing is real rather than staged.
 */
async function seedPickemEntries(eventId: string, marketId: string) {
  const [snapshot] = await handle.db
    .select({ id: oddsSnapshots.id })
    .from(oddsSnapshots)
    .where(eq(oddsSnapshots.marketId, marketId))
    .limit(1);

  for (const entry of [
    { leagueId: league.id, selection: "home" as const, userId: user.id },
    {
      leagueId: rivalLeague.id,
      selection: "away" as const,
      userId: rivalUser.id,
    },
  ]) {
    const week = await openPickWeek(handle.db, {
      closesAt: new Date("2037-09-14T00:00:00.000Z"),
      leagueId: entry.leagueId,
      maxPicksPerUser: 1,
      opensAt: new Date("2037-09-01T00:00:00.000Z"),
      rosterSize: 1,
      season: 2037,
      week: 1,
    });
    await withLeagueContext(handle.db, entry.leagueId, (tx) =>
      tx.insert(picks).values({
        idempotencyKey: `${marker}:pick:${entry.leagueId}`,
        leagueId: entry.leagueId,
        marketId,
        oddsSnapshotId: snapshot.id,
        pickWeekId: week.pickWeekId,
        selection: entry.selection,
        userId: entry.userId,
      }),
    );
  }
  return eventId;
}

async function seedPriorArenaSnapshot(seasonId: string) {
  const computedAt = new Date("2037-09-07T21:00:00.000Z");
  await handle.db.insert(arenaStandings).values([
    {
      computedAt,
      accuracyBps: 6_250,
      correctPicks: 25,
      kind: "league",
      leagueId: league.id,
      eligibleWeeks: 1,
      rank: 2,
      rankDelta: 0,
      seasonId,
      subjectId: league.id,
      weeksPlayed: 1,
      scorablePicks: 40,
    },
    {
      computedAt,
      accuracyBps: 6_250,
      correctPicks: 25,
      kind: "league",
      leagueId: rivalLeague.id,
      eligibleWeeks: 1,
      rank: 1,
      rankDelta: 0,
      seasonId,
      subjectId: rivalLeague.id,
      weeksPlayed: 1,
      scorablePicks: 40,
    },
    {
      computedAt,
      accuracyBps: 6_250,
      correctPicks: 25,
      kind: "individual",
      eligibleWeeks: 1,
      rank: 2,
      rankDelta: 0,
      seasonId,
      subjectId: user.id,
      userId: user.id,
      weeksPlayed: 1,
      scorablePicks: 40,
    },
    {
      computedAt,
      accuracyBps: 6_250,
      correctPicks: 25,
      kind: "individual",
      eligibleWeeks: 1,
      rank: 1,
      rankDelta: 0,
      seasonId,
      subjectId: rivalUser.id,
      userId: rivalUser.id,
      weeksPlayed: 1,
      scorablePicks: 40,
    },
  ]);
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

  [user, rivalUser] = await handle.db
    .insert(users)
    .values([
      {
        displayName: "Settlement Job User",
        email: `${marker}@example.test`,
      },
      {
        displayName: "Settlement Job Rival",
        email: `${marker}-rival@example.test`,
      },
    ])
    .returning();
  [league, rivalLeague] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Settlement Job League",
        provider: "espn",
        providerLeagueId: marker,
      },
      {
        name: "Settlement Job Rival League",
        provider: "espn",
        providerLeagueId: `${marker}-rival`,
      },
    ])
    .returning();
  await handle.db.insert(members).values([
    {
      organizationId: league.id,
      role: "member",
      userId: user.id,
    },
    {
      organizationId: rivalLeague.id,
      role: "member",
      userId: rivalUser.id,
    },
  ]);
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(arenaSeasons)
    .where(sql`${arenaSeasons.name} = ${`${marker}-arena`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}%@example.test`}`);
  await handle.db
    .delete(bettingEvents)
    .where(eq(bettingEvents.provider, marker));
  await handle.pool.end();
});

describe("betting game.final settlement job", () => {
  it("settles betting events through the Inngest step API", async () => {
    const seeded = await seedPlacedSingle();
    const arenaSeason = await ensureArenaSeason(handle.db, {
      endsAt: new Date("2037-10-01T00:00:00.000Z"),
      name: `${marker}-arena`,
      startsAt: new Date("2037-09-01T00:00:00.000Z"),
    });
    await seedRivalSettledSingle();
    await seedPickemEntries(seeded.event.id, seeded.placed.legs[0].marketId);
    await seedPriorArenaSnapshot(arenaSeason.id);
    const push = new RecordingPushNotifier();
    const realtime = new RecordingRealtimePublisher();
    const fn = createBettingSettleGameFinalFunction(() => ({
      db: handle.db,
      push,
      realtime,
      resultsProvider: new StaticResultsProvider(),
    }));
    const testEngine = new InngestTestEngine({ function: fn });

    // The whole function, not `executeStep("settle-betting-event")`: settlement
    // and the fan-out are now two steps, and the response under assertion is
    // composed from both.
    const stepRun = await testEngine.executeStep("publish-settlement-effects", {
      events: [
        {
          data: {
            bettingEventId: seeded.event.id,
            gameId: randomUUID(),
            leagueId: league.id,
          },
          name: JOB_EVENTS.gameFinal,
        },
      ],
    });
    // eslint-disable-next-line no-console
    console.log(
      "PROBE keys:",
      Object.keys(stepRun),
      "result?",
      stepRun.result === undefined ? "undefined" : "present",
    );

    // `executeStep` returns THAT step's output, so this is the fan-out half:
    // the arena and realtime payloads. The settlement half is asserted by
    // `runBettingSettleGameFinal`'s own test below; splitting them keeps each
    // assertion pointed at one step rather than at a merged blob.
    const settleResult = stepRun.result as Awaited<
      ReturnType<typeof publishGameFinalEffects>
    >;
    expect(stepRun.result).toMatchObject({
      arenaLeaderboardUpdates: [
        {
          seasonId: arenaSeason.id,
          type: REALTIME_EVENTS.arenaLeaderboardUpdated,
          v: 1,
        },
      ],
      arenaSwingSignals: [
        {
          seasonId: arenaSeason.id,
          swings: expect.arrayContaining([
            expect.objectContaining({
              kind: "individual",
              newRank: 1,
              oldRank: 2,
              rankDelta: 1,
              subjectId: user.id,
              userId: user.id,
            }),
            expect.objectContaining({
              kind: "league",
              leagueId: league.id,
              newRank: 1,
              oldRank: 2,
              rankDelta: 1,
              subjectId: league.id,
            }),
          ]),
          type: REALTIME_EVENTS.arenaStandingsSwing,
          v: 1,
        },
      ],
      leagueLeaderboardUpdates: [
        {
          bankrollWeekId: seeded.placed.slip.bankrollWeekId,
          leagueId: league.id,
          type: REALTIME_EVENTS.leagueLeaderboardUpdated,
          v: 1,
        },
      ],
    });
    // Reaching this step at all proves settlement ran first and handed its
    // memoized facts across the boundary -- the fan-out cannot name a
    // settlement it did not receive.
    expect(stepRun.step.name).toBe("publish-settlement-effects");
    expect(settleResult.arenaRecapEvents).toHaveLength(2);
    expect(settleResult.arenaRecapEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            leagueId: league.id,
            seasonId: arenaSeason.id,
            swingKey: expect.stringContaining(`:${league.id}`),
          }),
          id: expect.stringContaining(
            `${JOB_EVENTS.arenaStandingsSwing}:${league.id}:${arenaSeason.id}:settlement:`,
          ),
          name: JOB_EVENTS.arenaStandingsSwing,
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            leagueId: rivalLeague.id,
            seasonId: arenaSeason.id,
            swingKey: expect.stringContaining(`:${rivalLeague.id}`),
          }),
          id: expect.stringContaining(
            `${JOB_EVENTS.arenaStandingsSwing}:${rivalLeague.id}:${arenaSeason.id}:settlement:`,
          ),
          name: JOB_EVENTS.arenaStandingsSwing,
        }),
      ]),
    );
    const [slip] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx.select().from(betSlips).where(eq(betSlips.id, seeded.placed.slip.id)),
    );
    expect(slip.status).toBe("won");

    const arenaRows = await handle.db
      .select()
      .from(arenaStandings)
      .where(eq(arenaStandings.seasonId, arenaSeason.id));
    expect(arenaRows).toHaveLength(4);
    expect(arenaRows.map((row) => row.kind).sort()).toEqual([
      "individual",
      "individual",
      "league",
      "league",
    ]);
    expect(realtime.leagueLeaderboardUpdated).toEqual([
      expect.objectContaining({
        bankrollWeekId: seeded.placed.slip.bankrollWeekId,
        leagueId: league.id,
        type: REALTIME_EVENTS.leagueLeaderboardUpdated,
      }),
    ]);
    expect(realtime.arenaLeaderboardUpdated).toEqual([
      expect.objectContaining({
        seasonId: arenaSeason.id,
        type: REALTIME_EVENTS.arenaLeaderboardUpdated,
      }),
    ]);
    expect(realtime.arenaStandingsSwing).toEqual([
      expect.objectContaining({
        seasonId: arenaSeason.id,
        swings: expect.arrayContaining([
          expect.objectContaining({
            kind: "league",
            newRank: 1,
            oldRank: 2,
            rankDelta: 1,
            subjectId: league.id,
          }),
        ]),
        type: REALTIME_EVENTS.arenaStandingsSwing,
      }),
    ]);
    expect(push.notifications).toEqual([
      {
        body: "A rival just passed you in the arena. You fell from 1 to 2.",
        leagueId: rivalLeague.id,
        tag: `arena:${arenaSeason.id}:rival-passed:${rivalUser.id}`,
        title: "Arena rank changed",
        type: "arena.rival.passed",
        url: `/arena?season=${arenaSeason.id}`,
        userIds: [rivalUser.id],
      },
      {
        body: "Won $171 on a single. Bankroll now $10,071.",
        leagueId: league.id,
        tag: `league:${league.id}:betting:${seeded.placed.slip.id}`,
        title: "Bet won",
        type: "league.bet.settled",
        url: expect.stringMatching(
          new RegExp(
            `^/leagues/${league.id}/bet\\?slip=${seeded.placed.slip.id}&settlement=`,
          ),
        ),
        userIds: [user.id],
      },
    ]);

    const retry = await runBettingSettleGameFinal({
      data: {
        bettingEventId: seeded.event.id,
        gameId: randomUUID(),
        leagueId: league.id,
      },
      deps: {
        db: handle.db,
        push,
        realtime,
        resultsProvider: new StaticResultsProvider(),
      },
    });
    expect(retry).toMatchObject({
      arenaRecapEvents: [],
      arenaSwingSignals: [],
      finalizedSlips: 0,
      leagueLeaderboardUpdates: [],
      settlementIds: [],
    });
    expect(push.notifications).toHaveLength(2);
    expect(realtime.arenaStandingsSwing).toHaveLength(1);
  });

  it("rejects invalid game.final payloads without retrying", async () => {
    await expect(
      runBettingSettleGameFinal({
        data: {
          gameId: "not-a-uuid",
          leagueId: randomUUID(),
        },
        deps: {
          db: handle.db,
          push: new RecordingPushNotifier(),
          realtime: new RecordingRealtimePublisher(),
          resultsProvider: new StaticResultsProvider(),
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(bettingSettleGameFinal);
  });

  it("still fires notifications when the fan-out throws and retries (UIX-106)", async () => {
    // The bug: everything lived in one `step.run`. Settlement is idempotent,
    // so a throw during the fan-out re-ran the whole step, the retry found
    // nothing left to settle, saw zero counters, skipped the notification
    // block, and returned SUCCESSFULLY. The database was right and every
    // downstream effect was silently dropped.
    //
    // Split in two, the retry re-runs only the fan-out and Inngest replays the
    // memoized settlement facts -- so the settlement ids that name the work
    // are still there on the second attempt instead of being recomputed empty.
    const seeded = await seedPlacedSingle("-retry");
    await ensureArenaSeason(handle.db, {
      endsAt: new Date("2037-10-01T00:00:00.000Z"),
      name: `${marker}-arena`,
      startsAt: new Date("2037-09-01T00:00:00.000Z"),
    });

    const push = new RecordingPushNotifier();
    const realtime = new RecordingRealtimePublisher();
    const deps = {
      db: handle.db,
      push,
      realtime,
      resultsProvider: new StaticResultsProvider(),
    };

    // Attempt 1: settlement lands, then the fan-out blows up.
    const facts = await settleGameFinalFacts({
      data: {
        bettingEventId: seeded.event.id,
        gameId: randomUUID(),
        leagueId: league.id,
      },
      deps,
    });
    expect(facts.finalizedSlips).toBe(1);
    expect(facts.settlements).toHaveLength(1);

    // Push and realtime delivery are BEST-EFFORT by design -- both are wrapped
    // in try/catch, so neither can fail the step. The genuine unwrapped throw
    // site is the arena rebuild, a multi-league recompute in one transaction
    // that can deadlock or time out. That is what is simulated here.
    const exploding = {
      ...deps,
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
    expect(push.notifications).toHaveLength(0);

    // Attempt 2: the fan-out retries against the SAME memoized facts. This is
    // the assertion that would have failed before the split -- re-deriving the
    // facts here returns an empty settlement list, and the notification is
    // never sent.
    const rederived = await settleGameFinalFacts({
      data: {
        bettingEventId: seeded.event.id,
        gameId: randomUUID(),
        leagueId: league.id,
      },
      deps,
    });
    expect(rederived.finalizedSlips).toBe(0);
    expect(rederived.settlements).toEqual([]);

    await publishGameFinalEffects({ deps, facts });

    expect(
      push.notifications.filter(
        (notification) => notification.type === "league.bet.settled",
      ),
    ).toHaveLength(1);
    expect(realtime.leagueLeaderboardUpdated.length).toBeGreaterThan(0);
  }, 60_000);
});
