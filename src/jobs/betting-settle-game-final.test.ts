// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type EventResult,
  ensureArenaSeason,
  openBankrollWeek,
  placeBetSlip,
  type ResultsProvider,
  type ResultsProviderInput,
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
  oddsSnapshots,
  type User,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { RecordingPushNotifier } from "@/push";
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

  [user] = await handle.db
    .insert(users)
    .values({
      displayName: "Settlement Job User",
      email: `${marker}@example.test`,
    })
    .returning();
  [league] = await handle.db
    .insert(leagues)
    .values({
      name: "Settlement Job League",
      provider: "espn",
      providerLeagueId: marker,
    })
    .returning();
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(arenaSeasons)
    .where(sql`${arenaSeasons.name} = ${`${marker}-arena`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} = ${marker}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} = ${`${marker}@example.test`}`);
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
    const push = new RecordingPushNotifier();
    const fn = createBettingSettleGameFinalFunction(() => ({
      db: handle.db,
      push,
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

    expect(stepRun.result).toMatchObject({
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
      ok: true,
      skippedReason: null,
    });
    const [slip] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx.select().from(betSlips).where(eq(betSlips.id, seeded.placed.slip.id)),
    );
    expect(slip.status).toBe("won");

    const arenaRows = await handle.db
      .select()
      .from(arenaStandings)
      .where(eq(arenaStandings.seasonId, arenaSeason.id));
    expect(arenaRows).toHaveLength(2);
    expect(arenaRows.map((row) => row.kind).sort()).toEqual([
      "individual",
      "league",
    ]);
    expect(push.notifications).toEqual([
      {
        body: "1 betting slip settled for this league.",
        leagueId: league.id,
        tag: `league:${league.id}:betting:${seeded.event.id}`,
        title: "Betting results are in",
        type: "league.bet.settled",
        url: `/leagues/${league.id}`,
      },
    ]);
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
          resultsProvider: new StaticResultsProvider(),
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(bettingSettleGameFinal);
  });
});
