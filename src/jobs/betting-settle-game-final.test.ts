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
  rebuildArenaStandings,
} from "@/betting";
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
  runBettingSettleGameFinal,
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

async function seedPlacedSingle() {
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
      contentHash: `${marker}:event`,
      homeTeam: "Fixture Home",
      provider: marker,
      providerEventId: `${marker}:event`,
      sport: "nfl",
      startTime: new Date("2037-09-07T17:00:00.000Z"),
      status: "scheduled",
    })
    .returning();
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${marker}:market`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId: `${marker}:moneyline`,
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
      sourcePayloadHash: `${marker}:snapshot`,
    })
    .returning();
  const placed = await placeBetSlip(handle.db, {
    bankrollWeekId: opened.week.id,
    idempotencyKey: `${marker}:job`,
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
    await rebuildArenaStandings(handle.db, {
      computedAt: new Date("2037-09-07T21:00:00.000Z"),
      seasonId: arenaSeason.id,
    });
    const push = new RecordingPushNotifier();
    const realtime = new RecordingRealtimePublisher();
    const fn = createBettingSettleGameFinalFunction(() => ({
      db: handle.db,
      push,
      realtime,
      resultsProvider: new StaticResultsProvider(),
    }));
    const testEngine = new InngestTestEngine({ function: fn });

    const stepRun = await testEngine.executeStep("settle-betting-event", {
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

    const settleResult = stepRun.result as Awaited<
      ReturnType<typeof runBettingSettleGameFinal>
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
      betSettledEvents: [
        {
          data: {
            bettingEventId: seeded.event.id,
            leagueId: league.id,
            settlementId: expect.any(String),
            slipId: seeded.placed.slip.id,
          },
          id: expect.stringContaining(`${JOB_EVENTS.betSettled}:${league.id}:`),
          name: JOB_EVENTS.betSettled,
        },
      ],
      eventName: JOB_EVENTS.gameFinal,
      finalizedSlips: 1,
      gradedLegs: 1,
      leagueLeaderboardUpdates: [
        {
          bankrollWeekId: seeded.placed.slip.bankrollWeekId,
          leagueId: league.id,
          type: REALTIME_EVENTS.leagueLeaderboardUpdated,
          v: 1,
        },
      ],
      ok: true,
      skippedReason: null,
    });
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
});
