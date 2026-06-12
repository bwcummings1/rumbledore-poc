// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  type BettingMarket,
  bankrollLedger,
  betLegs,
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
import { placeBetSlip } from "./placement";

const marker = `placementtest-${randomUUID()}`;
const providerLeagueA = `${marker}-a`;
const providerLeagueB = `${marker}-b`;
const capturedAt = new Date("2026-09-10T12:00:00.000Z");
const placedAt = new Date("2026-09-10T12:01:00.000Z");

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

async function slipsFor(idempotencyKey: string) {
  return withLeagueContext(handle.db, leagueA.id, (tx) =>
    tx
      .select()
      .from(betSlips)
      .where(
        and(
          eq(betSlips.leagueId, leagueA.id),
          eq(betSlips.userId, userA.id),
          eq(betSlips.idempotencyKey, idempotencyKey),
        ),
      ),
  );
}

async function seedSnapshot(input: {
  awayPrice?: number | null;
  homePrice?: number | null;
  line?: number | null;
  marketStatus?: "open" | "suspended" | "settled" | "void";
  marketType: "moneyline" | "spread" | "total" | "player_prop";
  overPrice?: number | null;
  underPrice?: number | null;
}): Promise<{ market: BettingMarket; snapshot: OddsSnapshot }> {
  eventCounter += 1;
  const providerEventId = `${marker}-event-${eventCounter}`;
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: "Arizona Cardinals",
      contentHash: `${providerEventId}:event`,
      homeTeam: "Seattle Seahawks",
      provider: marker,
      providerEventId,
      sport: "nfl",
      startTime: new Date("2026-09-13T17:00:00.000Z"),
      status: "scheduled",
    })
    .returning();

  const providerMarketId = `${providerEventId}:${input.marketType}`;
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${providerMarketId}:market`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId,
      status: input.marketStatus ?? "open",
      subject: input.marketType === "player_prop" ? "mock-player" : "game",
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
      sourcePayloadHash: `${providerMarketId}:snapshot:1`,
      underPrice: input.underPrice ?? null,
    })
    .returning();

  return { market, snapshot };
}

async function appendSnapshot(
  marketId: string,
  input: {
    awayPrice?: number | null;
    capturedAt: Date;
    homePrice?: number | null;
    line?: number | null;
    overPrice?: number | null;
    sourcePayloadHash: string;
    underPrice?: number | null;
  },
): Promise<OddsSnapshot> {
  const [snapshot] = await handle.db
    .insert(oddsSnapshots)
    .values({
      awayPrice: input.awayPrice ?? null,
      capturedAt: input.capturedAt,
      homePrice: input.homePrice ?? null,
      line: input.line ?? null,
      marketId,
      overPrice: input.overPrice ?? null,
      provider: marker,
      sourcePayloadHash: input.sourcePayloadHash,
      underPrice: input.underPrice ?? null,
    })
    .returning();
  return snapshot;
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
      displayName: "Placement User A",
      email: `${marker}-a@example.test`,
    })
    .returning();

  [leagueA, leagueB] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Placement League A",
        provider: "espn",
        providerLeagueId: providerLeagueA,
      },
      {
        name: "Placement League B",
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

describe("bet placement", () => {
  it("locks selected odds for a single bet and leaves them unchanged after line movement", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(8),
      weekStart: week(1),
    });
    const seeded = await seedSnapshot({
      awayPrice: 120,
      homePrice: -140,
      marketType: "moneyline",
    });

    const placed = await placeBetSlip(handle.db, {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:single-lock`,
      kind: "single",
      leagueId: leagueA.id,
      legs: [{ oddsSnapshotId: seeded.snapshot.id, selection: "home" }],
      now: placedAt,
      stakeCents: 10_000,
      userId: userA.id,
    });
    await appendSnapshot(seeded.market.id, {
      awayPrice: 180,
      capturedAt: new Date("2026-09-10T12:02:00.000Z"),
      homePrice: -200,
      sourcePayloadHash: `${seeded.market.providerMarketId}:snapshot:2`,
    });

    expect(placed.reused).toBe(false);
    expect(placed.slip).toMatchObject({
      combinedDecimalOdds: decimalOdds(-140),
      kind: "single",
      potentialPayoutCents: 17_143,
      stakeCents: 10_000,
      status: "pending",
    });
    expect(placed.legs[0]).toMatchObject({
      lockedAmericanOdds: -140,
      lockedDecimalOdds: decimalOdds(-140),
      lockedLine: null,
      oddsSnapshotId: seeded.snapshot.id,
      selection: "home",
      status: "pending",
    });

    const [storedLeg] = await withLeagueContext(handle.db, leagueA.id, (tx) =>
      tx
        .select()
        .from(betLegs)
        .where(
          and(
            eq(betLegs.leagueId, leagueA.id),
            eq(betLegs.id, placed.legs[0].id),
          ),
        ),
    );
    const [storedSlip] = await withLeagueContext(handle.db, leagueA.id, (tx) =>
      tx
        .select()
        .from(betSlips)
        .where(
          and(
            eq(betSlips.leagueId, leagueA.id),
            eq(betSlips.id, placed.slip.id),
          ),
        ),
    );
    expect(storedLeg.lockedAmericanOdds).toBe(-140);
    expect(storedSlip.potentialPayoutCents).toBe(17_143);
  });

  it("debits the bankroll once and reuses an idempotent retry", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(15),
      weekStart: week(8),
    });
    const seeded = await seedSnapshot({
      awayPrice: 120,
      homePrice: -140,
      marketType: "moneyline",
    });
    const input = {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:single-idempotent`,
      kind: "single" as const,
      leagueId: leagueA.id,
      legs: [
        { oddsSnapshotId: seeded.snapshot.id, selection: "away" as const },
      ],
      now: placedAt,
      stakeCents: 25_000,
      userId: userA.id,
    };

    const first = await placeBetSlip(handle.db, input);
    const second = await placeBetSlip(handle.db, input);

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.slip.id).toBe(first.slip.id);
    expect(second.stakeLedgerEntry?.id).toBe(first.stakeLedgerEntry?.id);
    await expect(
      placeBetSlip(handle.db, { ...input, stakeCents: 25_001 }),
    ).rejects.toMatchObject({ code: "BET_IDEMPOTENCY_CONFLICT" });

    const entries = await ledgerEntriesFor(opened.week.id);
    expect(entries.map((entry) => entry.entryType)).toEqual([
      "week_open",
      "bet_stake",
    ]);
    expect(entries[1]).toMatchObject({
      amountCents: -25_000,
      refSlipId: first.slip.id,
      runningBalanceCents: 975_000,
      seq: 2,
    });
    expect(replayBankrollLedger(entries)).toBe(975_000);
  });

  it("rejects stakes above the current balance without writing a slip or ledger debit", async () => {
    const opened = await openBankrollWeek(handle.db, {
      floorCents: 5_000,
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(22),
      weekStart: week(15),
    });
    const seeded = await seedSnapshot({
      awayPrice: 120,
      homePrice: -140,
      marketType: "moneyline",
    });

    await expect(
      placeBetSlip(handle.db, {
        bankrollWeekId: opened.week.id,
        idempotencyKey: `${marker}:too-rich`,
        kind: "single",
        leagueId: leagueA.id,
        legs: [{ oddsSnapshotId: seeded.snapshot.id, selection: "home" }],
        now: placedAt,
        stakeCents: 5_001,
        userId: userA.id,
      }),
    ).rejects.toMatchObject({ code: "BET_INSUFFICIENT_FUNDS" });

    expect(await slipsFor(`${marker}:too-rich`)).toHaveLength(0);
    expect(await ledgerEntriesFor(opened.week.id)).toHaveLength(1);
  });

  it("rejects stale odds and closed markets before writing placement rows", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(29),
      weekStart: week(22),
    });
    const stale = await seedSnapshot({
      awayPrice: 120,
      homePrice: -140,
      marketType: "moneyline",
    });
    await appendSnapshot(stale.market.id, {
      awayPrice: 130,
      capturedAt: new Date("2026-09-10T12:02:00.000Z"),
      homePrice: -150,
      sourcePayloadHash: `${stale.market.providerMarketId}:snapshot:2`,
    });
    const closed = await seedSnapshot({
      awayPrice: 120,
      homePrice: -140,
      marketStatus: "suspended",
      marketType: "moneyline",
    });

    await expect(
      placeBetSlip(handle.db, {
        bankrollWeekId: opened.week.id,
        idempotencyKey: `${marker}:stale`,
        kind: "single",
        leagueId: leagueA.id,
        legs: [{ oddsSnapshotId: stale.snapshot.id, selection: "home" }],
        now: placedAt,
        stakeCents: 10_000,
        userId: userA.id,
      }),
    ).rejects.toMatchObject({ code: "BET_ODDS_STALE" });
    await expect(
      placeBetSlip(handle.db, {
        bankrollWeekId: opened.week.id,
        idempotencyKey: `${marker}:closed`,
        kind: "single",
        leagueId: leagueA.id,
        legs: [{ oddsSnapshotId: closed.snapshot.id, selection: "home" }],
        now: placedAt,
        stakeCents: 10_000,
        userId: userA.id,
      }),
    ).rejects.toMatchObject({ code: "BET_MARKET_CLOSED" });

    expect(await slipsFor(`${marker}:stale`)).toHaveLength(0);
    expect(await slipsFor(`${marker}:closed`)).toHaveLength(0);
    expect(await ledgerEntriesFor(opened.week.id)).toHaveLength(1);
  });

  it("places a parlay across distinct markets with copied line and payout math", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(36),
      weekStart: week(29),
    });
    const moneyline = await seedSnapshot({
      awayPrice: 120,
      homePrice: -140,
      marketType: "moneyline",
    });
    const total = await seedSnapshot({
      line: 47.5,
      marketType: "total",
      overPrice: -108,
      underPrice: -112,
    });
    const spread = await seedSnapshot({
      awayPrice: -110,
      homePrice: -110,
      line: -2.5,
      marketType: "spread",
    });
    const expectedCombined =
      Math.round(
        decimalOdds(-140) * decimalOdds(-108) * decimalOdds(-110) * 1_000_000,
      ) / 1_000_000;

    const placed = await placeBetSlip(handle.db, {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:parlay`,
      kind: "parlay",
      leagueId: leagueA.id,
      legs: [
        { oddsSnapshotId: moneyline.snapshot.id, selection: "home" },
        { oddsSnapshotId: total.snapshot.id, selection: "over" },
        { oddsSnapshotId: spread.snapshot.id, selection: "away" },
      ],
      now: placedAt,
      stakeCents: 20_000,
      userId: userA.id,
    });

    expect(placed.legs).toHaveLength(3);
    expect(placed.slip.combinedDecimalOdds).toBe(expectedCombined);
    expect(placed.slip.potentialPayoutCents).toBe(
      Math.round(20_000 * expectedCombined),
    );
    expect(placed.legs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lockedAmericanOdds: -108,
          lockedLine: 47.5,
          selection: "over",
        }),
        expect.objectContaining({
          lockedAmericanOdds: -110,
          lockedLine: 2.5,
          selection: "away",
        }),
      ]),
    );
    expect((await ledgerEntriesFor(opened.week.id)).at(-1)).toMatchObject({
      amountCents: -20_000,
      entryType: "bet_stake",
      refSlipId: placed.slip.id,
    });
  });

  it("rejects parlay legs that repeat a market", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(43),
      weekStart: week(36),
    });
    const seeded = await seedSnapshot({
      awayPrice: 120,
      homePrice: -140,
      marketType: "moneyline",
    });

    await expect(
      placeBetSlip(handle.db, {
        bankrollWeekId: opened.week.id,
        idempotencyKey: `${marker}:duplicate-market`,
        kind: "parlay",
        leagueId: leagueA.id,
        legs: [
          { oddsSnapshotId: seeded.snapshot.id, selection: "home" },
          { oddsSnapshotId: seeded.snapshot.id, selection: "away" },
        ],
        now: placedAt,
        stakeCents: 10_000,
        userId: userA.id,
      }),
    ).rejects.toMatchObject({ code: "BET_DUPLICATE_MARKET" });
    expect(await slipsFor(`${marker}:duplicate-market`)).toHaveLength(0);
  });

  it("does not return another league's slip through explicit league filters", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(50),
      weekStart: week(43),
    });
    const seeded = await seedSnapshot({
      awayPrice: 120,
      homePrice: -140,
      marketType: "moneyline",
    });
    const placed = await placeBetSlip(handle.db, {
      bankrollWeekId: opened.week.id,
      idempotencyKey: `${marker}:league-filter`,
      kind: "single",
      leagueId: leagueA.id,
      legs: [{ oddsSnapshotId: seeded.snapshot.id, selection: "home" }],
      now: placedAt,
      stakeCents: 10_000,
      userId: userA.id,
    });

    const rows = await withLeagueContext(handle.db, leagueB.id, (tx) =>
      tx
        .select()
        .from(betSlips)
        .where(
          and(
            eq(betSlips.leagueId, leagueB.id),
            eq(betSlips.id, placed.slip.id),
          ),
        ),
    );
    expect(rows).toHaveLength(0);
  });
});
