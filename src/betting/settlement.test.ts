// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  type BettingEvent,
  type BettingMarket,
  bankrollLedger,
  betLegs,
  betSettlements,
  betSlips,
  bettingEvents,
  bettingMarkets,
  type League,
  leagues,
  type OddsSnapshot,
  oddsSnapshots,
  type User,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { openBankrollWeek, replayBankrollLedger } from "./bankroll";
import type {
  EventResult,
  ResultsProvider,
  ResultsProviderInput,
} from "./interfaces";
import { placeBetSlip } from "./placement";
import { settleBettingEvent } from "./settlement";

const marker = `settlementtest-${randomUUID()}`;
const providerLeagueA = `${marker}-a`;
const providerLeagueB = `${marker}-b`;
const capturedAt = new Date("2026-09-10T12:00:00.000Z");
const placedAt = new Date("2026-09-10T12:01:00.000Z");
const settledAt = new Date("2026-09-10T23:30:00.000Z");

let handle: DbHandle;
let leagueA: League;
let leagueB: League;
let userA: User;
let eventCounter = 0;

function week(day: number): Date {
  return new Date(Date.UTC(2026, 8, day));
}

function decimalOdds(americanOdds: number): number {
  const decimal =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);
  return Math.round(decimal * 1_000_000) / 1_000_000;
}

class FixtureResultsProvider implements ResultsProvider {
  readonly id = `${marker}-results`;

  constructor(private readonly results: Map<string, EventResult>) {}

  async getEventResult(input: ResultsProviderInput): Promise<EventResult> {
    const result = this.results.get(input.event.providerEventId);
    if (!result) {
      throw new Error(
        `missing fixture result for ${input.event.providerEventId}`,
      );
    }
    return result;
  }
}

function result(input: {
  awayScore?: number | null;
  finalStatus?: EventResult["finalStatus"];
  homeScore?: number | null;
  playerStats?: EventResult["playerStats"];
}): EventResult {
  return {
    awayScore: input.awayScore ?? null,
    finalStatus: input.finalStatus ?? "final",
    homeScore: input.homeScore ?? null,
    playerStats: input.playerStats ?? [],
    provider: `${marker}-results`,
    sourcePayload: {
      awayScore: input.awayScore ?? null,
      finalStatus: input.finalStatus ?? "final",
      homeScore: input.homeScore ?? null,
      marker,
    },
  };
}

async function seedEvent(tag: string): Promise<BettingEvent> {
  eventCounter += 1;
  const providerEventId = `${marker}-${tag}-${eventCounter}`;
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: `${tag} Away`,
      contentHash: `${providerEventId}:event`,
      homeTeam: `${tag} Home`,
      provider: marker,
      providerEventId,
      sport: "nfl",
      startTime: new Date("2026-09-13T17:00:00.000Z"),
      status: "scheduled",
    })
    .returning();
  return event;
}

async function seedSnapshot(input: {
  awayPrice?: number | null;
  event: BettingEvent;
  homePrice?: number | null;
  line?: number | null;
  marketType: "moneyline" | "spread" | "total" | "player_prop";
  overPrice?: number | null;
  propType?: string | null;
  subject?: string;
  underPrice?: number | null;
}): Promise<{ market: BettingMarket; snapshot: OddsSnapshot }> {
  const providerMarketId = `${input.event.providerEventId}:${input.marketType}:${randomUUID()}`;
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${providerMarketId}:market`,
      eventId: input.event.id,
      period: "full_game",
      propType: input.propType ?? null,
      provider: marker,
      providerMarketId,
      status: "open",
      subject: input.subject ?? "game",
      type: input.marketType,
    })
    .returning();

  const [snapshot] = await handle.db
    .insert(oddsSnapshots)
    .values({
      awayPrice: input.awayPrice ?? null,
      capturedAt,
      homePrice: input.homePrice ?? null,
      line: input.line ?? null,
      marketId: market.id,
      overPrice: input.overPrice ?? null,
      provider: marker,
      sourcePayloadHash: `${providerMarketId}:snapshot`,
      underPrice: input.underPrice ?? null,
    })
    .returning();

  return { market, snapshot };
}

async function ledgerEntriesFor(bankrollWeekId: string) {
  return withLeagueContext(handle.db, leagueA.id, (tx) =>
    tx
      .select()
      .from(bankrollLedger)
      .where(
        and(
          eq(bankrollLedger.leagueId, leagueA.id),
          eq(bankrollLedger.userId, userA.id),
          eq(bankrollLedger.bankrollWeekId, bankrollWeekId),
        ),
      )
      .orderBy(bankrollLedger.seq),
  );
}

async function slipWithLegs(slipId: string) {
  return withLeagueContext(handle.db, leagueA.id, async (tx) => {
    const [slip] = await tx
      .select()
      .from(betSlips)
      .where(and(eq(betSlips.leagueId, leagueA.id), eq(betSlips.id, slipId)))
      .limit(1);
    const legs = await tx
      .select()
      .from(betLegs)
      .where(and(eq(betLegs.leagueId, leagueA.id), eq(betLegs.slipId, slipId)))
      .orderBy(betLegs.createdAt, betLegs.id);
    const settlements = await tx
      .select()
      .from(betSettlements)
      .where(
        and(
          eq(betSettlements.leagueId, leagueA.id),
          eq(betSettlements.slipId, slipId),
        ),
      );
    return { legs, settlements, slip };
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

  [userA] = await handle.db
    .insert(users)
    .values({
      displayName: "Settlement User A",
      email: `${marker}-a@example.test`,
    })
    .returning();

  [leagueA, leagueB] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Settlement League A",
        provider: "espn",
        providerLeagueId: providerLeagueA,
      },
      {
        name: "Settlement League B",
        provider: "espn",
        providerLeagueId: providerLeagueB,
      },
    ])
    .returning();
});

afterAll(async () => {
  if (!handle) return;
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

describe("bet settlement schema", () => {
  it("enables and forces RLS on settlement audit rows", async () => {
    const rows = await handle.pool.query<{
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       where relname = 'bet_settlements'`,
    );

    expect(rows.rows).toEqual([
      {
        relforcerowsecurity: true,
        relname: "bet_settlements",
        relrowsecurity: true,
      },
    ]);
  });
});

describe("bet settlement", () => {
  it("settles winning and losing singles without double-crediting retries", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(8),
      weekStart: week(1),
    });
    const event = await seedEvent("single");
    const moneyline = await seedSnapshot({
      awayPrice: 120,
      event,
      homePrice: -140,
      marketType: "moneyline",
    });

    const winner = await placeBetSlip(handle.db, {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:single-win`,
      kind: "single",
      leagueId: leagueA.id,
      legs: [{ oddsSnapshotId: moneyline.snapshot.id, selection: "home" }],
      now: placedAt,
      stakeCents: 10_000,
      userId: userA.id,
    });
    const loser = await placeBetSlip(handle.db, {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:single-loss`,
      kind: "single",
      leagueId: leagueA.id,
      legs: [{ oddsSnapshotId: moneyline.snapshot.id, selection: "away" }],
      now: placedAt,
      stakeCents: 20_000,
      userId: userA.id,
    });

    const deps = {
      db: handle.db,
      resultsProvider: new FixtureResultsProvider(
        new Map([
          [event.providerEventId, result({ awayScore: 17, homeScore: 24 })],
        ]),
      ),
    };
    const first = await settleBettingEvent({
      deps,
      input: {
        bettingEventId: event.id,
        leagueId: leagueA.id,
        now: settledAt,
      },
    });
    const second = await settleBettingEvent({
      deps,
      input: {
        bettingEventId: event.id,
        leagueId: leagueA.id,
        now: settledAt,
      },
    });

    expect(first).toMatchObject({
      finalizedSlips: 2,
      gradedLegs: 2,
      skippedReason: null,
    });
    expect(second).toMatchObject({
      finalizedSlips: 0,
      gradedLegs: 0,
      skippedReason: null,
    });

    const winningState = await slipWithLegs(winner.slip.id);
    const losingState = await slipWithLegs(loser.slip.id);
    expect(winningState.slip).toMatchObject({
      potentialPayoutCents: 17_143,
      status: "won",
    });
    expect(winningState.legs[0]).toMatchObject({ status: "won" });
    expect(winningState.settlements).toHaveLength(1);
    expect(winningState.settlements[0]).toMatchObject({
      outcome: "won",
      payoutCents: 17_143,
    });
    expect(losingState.slip.status).toBe("lost");
    expect(losingState.legs[0]).toMatchObject({ status: "lost" });
    expect(losingState.settlements[0]).toMatchObject({
      outcome: "lost",
      payoutCents: 0,
    });

    const entries = await ledgerEntriesFor(opened.week.id);
    expect(entries.map((entry) => entry.entryType)).toEqual([
      "week_open",
      "bet_stake",
      "bet_stake",
      "bet_payout",
    ]);
    expect(entries.at(-1)).toMatchObject({
      amountCents: 17_143,
      refSlipId: winner.slip.id,
      runningBalanceCents: 987_143,
    });
    expect(replayBankrollLedger(entries)).toBe(987_143);
  });

  it("drops pushed parlay legs, reprices the slip, and finalizes once later legs win", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(15),
      weekStart: week(8),
    });
    const pushEvent = await seedEvent("parlay-push");
    const winEvent = await seedEvent("parlay-win");
    const pushTotal = await seedSnapshot({
      event: pushEvent,
      line: 45,
      marketType: "total",
      overPrice: -110,
      underPrice: -110,
    });
    const moneyline = await seedSnapshot({
      awayPrice: 120,
      event: winEvent,
      homePrice: -140,
      marketType: "moneyline",
    });
    const spread = await seedSnapshot({
      awayPrice: -110,
      event: winEvent,
      homePrice: -110,
      line: -10,
      marketType: "spread",
    });

    const placed = await placeBetSlip(handle.db, {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:parlay-push`,
      kind: "parlay",
      leagueId: leagueA.id,
      legs: [
        { oddsSnapshotId: pushTotal.snapshot.id, selection: "over" },
        { oddsSnapshotId: moneyline.snapshot.id, selection: "home" },
        { oddsSnapshotId: spread.snapshot.id, selection: "away" },
      ],
      now: placedAt,
      stakeCents: 10_000,
      userId: userA.id,
    });
    const expectedRepricedOdds =
      Math.round(decimalOdds(-140) * decimalOdds(-110) * 1_000_000) / 1_000_000;
    const expectedRepricedPayout = Math.round(10_000 * expectedRepricedOdds);

    const deps = {
      db: handle.db,
      resultsProvider: new FixtureResultsProvider(
        new Map([
          [pushEvent.providerEventId, result({ awayScore: 21, homeScore: 24 })],
          [winEvent.providerEventId, result({ awayScore: 20, homeScore: 28 })],
        ]),
      ),
    };

    const first = await settleBettingEvent({
      deps,
      input: {
        bettingEventId: pushEvent.id,
        leagueId: leagueA.id,
        now: settledAt,
      },
    });
    const afterPush = await slipWithLegs(placed.slip.id);
    expect(first).toMatchObject({
      finalizedSlips: 0,
      gradedLegs: 1,
      repricedSlips: 1,
    });
    expect(afterPush.slip).toMatchObject({
      combinedDecimalOdds: expectedRepricedOdds,
      potentialPayoutCents: expectedRepricedPayout,
      status: "pending",
    });
    expect(afterPush.legs.map((leg) => leg.status).sort()).toEqual([
      "pending",
      "pending",
      "push",
    ]);
    expect(afterPush.settlements).toHaveLength(0);

    const second = await settleBettingEvent({
      deps,
      input: {
        bettingEventId: winEvent.id,
        leagueId: leagueA.id,
        now: settledAt,
      },
    });
    const retry = await settleBettingEvent({
      deps,
      input: {
        bettingEventId: winEvent.id,
        leagueId: leagueA.id,
        now: settledAt,
      },
    });
    const finalState = await slipWithLegs(placed.slip.id);

    expect(second).toMatchObject({
      finalizedSlips: 1,
      gradedLegs: 2,
      repricedSlips: 0,
    });
    expect(retry).toMatchObject({
      finalizedSlips: 0,
      gradedLegs: 0,
    });
    expect(finalState.slip).toMatchObject({
      combinedDecimalOdds: expectedRepricedOdds,
      potentialPayoutCents: expectedRepricedPayout,
      status: "partial_void",
    });
    expect(finalState.legs.map((leg) => leg.status).sort()).toEqual([
      "push",
      "won",
      "won",
    ]);
    expect(finalState.settlements).toHaveLength(1);
    expect(finalState.settlements[0]).toMatchObject({
      outcome: "partial_void",
      payoutCents: expectedRepricedPayout,
    });

    const entries = await ledgerEntriesFor(opened.week.id);
    expect(entries.map((entry) => entry.entryType)).toEqual([
      "week_open",
      "bet_stake",
      "bet_payout",
    ]);
    expect(entries.at(-1)).toMatchObject({
      amountCents: expectedRepricedPayout,
      refSlipId: placed.slip.id,
    });
  });

  it("voids canceled single bets and refunds the stake", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(22),
      weekStart: week(15),
    });
    const event = await seedEvent("void");
    const moneyline = await seedSnapshot({
      awayPrice: 100,
      event,
      homePrice: -120,
      marketType: "moneyline",
    });
    const placed = await placeBetSlip(handle.db, {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:single-void`,
      kind: "single",
      leagueId: leagueA.id,
      legs: [{ oddsSnapshotId: moneyline.snapshot.id, selection: "home" }],
      now: placedAt,
      stakeCents: 15_000,
      userId: userA.id,
    });

    await settleBettingEvent({
      deps: {
        db: handle.db,
        resultsProvider: new FixtureResultsProvider(
          new Map([
            [event.providerEventId, result({ finalStatus: "canceled" })],
          ]),
        ),
      },
      input: {
        bettingEventId: event.id,
        leagueId: leagueA.id,
        now: settledAt,
      },
    });

    const state = await slipWithLegs(placed.slip.id);
    expect(state.slip).toMatchObject({
      potentialPayoutCents: 15_000,
      status: "void",
    });
    expect(state.legs[0]).toMatchObject({ status: "void" });
    expect(state.settlements[0]).toMatchObject({
      outcome: "void",
      payoutCents: 15_000,
    });
    const entries = await ledgerEntriesFor(opened.week.id);
    expect(entries.map((entry) => entry.entryType)).toEqual([
      "week_open",
      "bet_stake",
      "bet_refund",
    ]);
    expect(replayBankrollLedger(entries)).toBe(1_000_000);
  });

  it("settles a cross-market parlay including a player prop", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(36),
      weekStart: week(29),
    });
    const event = await seedEvent("market-depth");
    const spread = await seedSnapshot({
      awayPrice: -110,
      event,
      homePrice: -110,
      line: -3.5,
      marketType: "spread",
    });
    const total = await seedSnapshot({
      event,
      line: 48.5,
      marketType: "total",
      overPrice: -108,
      underPrice: -112,
    });
    const prop = await seedSnapshot({
      event,
      line: 64.5,
      marketType: "player_prop",
      overPrice: -115,
      propType: "rushing_yards",
      subject: "mock-rb",
      underPrice: -105,
    });
    const expectedCombined =
      Math.round(
        decimalOdds(-110) * decimalOdds(-112) * decimalOdds(-115) * 1_000_000,
      ) / 1_000_000;
    const expectedPayout = Math.round(10_000 * expectedCombined);

    const placed = await placeBetSlip(handle.db, {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:market-depth-parlay`,
      kind: "parlay",
      leagueId: leagueA.id,
      legs: [
        { oddsSnapshotId: spread.snapshot.id, selection: "home" },
        { oddsSnapshotId: total.snapshot.id, selection: "under" },
        { oddsSnapshotId: prop.snapshot.id, selection: "player_over" },
      ],
      now: placedAt,
      stakeCents: 10_000,
      userId: userA.id,
    });

    const settled = await settleBettingEvent({
      deps: {
        db: handle.db,
        resultsProvider: new FixtureResultsProvider(
          new Map([
            [
              event.providerEventId,
              result({
                awayScore: 17,
                homeScore: 27,
                playerStats: [
                  {
                    playerId: "mock-rb",
                    stats: { rushing_yards: 72 },
                  },
                ],
              }),
            ],
          ]),
        ),
      },
      input: {
        bettingEventId: event.id,
        leagueId: leagueA.id,
        now: settledAt,
      },
    });

    const state = await slipWithLegs(placed.slip.id);
    expect(settled).toMatchObject({
      finalizedSlips: 1,
      gradedLegs: 3,
      skippedReason: null,
    });
    expect(state.slip).toMatchObject({
      combinedDecimalOdds: expectedCombined,
      potentialPayoutCents: expectedPayout,
      status: "won",
    });
    expect(state.legs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resultDetail: "home adjusted margin 6.5 vs line 0",
          status: "won",
        }),
        expect.objectContaining({
          resultDetail: "total 44 vs line 48.5",
          status: "won",
        }),
        expect.objectContaining({
          resultDetail: "rushing_yards 72 vs line 64.5",
          status: "won",
        }),
      ]),
    );
    expect(state.settlements[0]).toMatchObject({
      outcome: "won",
      payoutCents: expectedPayout,
    });

    const entries = await ledgerEntriesFor(opened.week.id);
    expect(entries.map((entry) => entry.entryType)).toEqual([
      "week_open",
      "bet_stake",
      "bet_payout",
    ]);
    expect(entries.at(-1)).toMatchObject({
      amountCents: expectedPayout,
      refSlipId: placed.slip.id,
    });
  });

  it("does not expose settlement rows through the wrong league context", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(43),
      weekStart: week(36),
    });
    const event = await seedEvent("isolation");
    const moneyline = await seedSnapshot({
      awayPrice: 120,
      event,
      homePrice: -140,
      marketType: "moneyline",
    });
    const placed = await placeBetSlip(handle.db, {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:isolation`,
      kind: "single",
      leagueId: leagueA.id,
      legs: [{ oddsSnapshotId: moneyline.snapshot.id, selection: "home" }],
      now: placedAt,
      stakeCents: 10_000,
      userId: userA.id,
    });
    await settleBettingEvent({
      deps: {
        db: handle.db,
        resultsProvider: new FixtureResultsProvider(
          new Map([
            [event.providerEventId, result({ awayScore: 7, homeScore: 10 })],
          ]),
        ),
      },
      input: {
        bettingEventId: event.id,
        leagueId: leagueA.id,
        now: settledAt,
      },
    });

    const rows = await withLeagueContext(handle.db, leagueB.id, (tx) =>
      tx
        .select()
        .from(betSettlements)
        .where(
          and(
            eq(betSettlements.leagueId, leagueB.id),
            eq(betSettlements.slipId, placed.slip.id),
          ),
        ),
    );
    expect(rows).toHaveLength(0);
  });
});
