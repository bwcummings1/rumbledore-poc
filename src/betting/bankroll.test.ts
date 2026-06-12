// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  bankrollLedger,
  type League,
  leagues,
  type User,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  appendBankrollLedgerEntry,
  DEFAULT_BANKROLL_FLOOR_CENTS,
  getCurrentBankrollBalance,
  openBankrollWeek,
  replayBankrollLedger,
  rolloverBankrollWeek,
} from "./bankroll";

const marker = `bankrolltest-${randomUUID()}`;
const providerLeagueA = `${marker}-a`;
const providerLeagueB = `${marker}-b`;

let handle: DbHandle;
let leagueA: League;
let leagueB: League;
let userA: User;
let userB: User;

function week(day: number): Date {
  return new Date(Date.UTC(2026, 8, day));
}

async function sqlstateOf(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? String(cause ?? error);
  }
  throw new Error("expected the query to be rejected, but it succeeded");
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

  [userA, userB] = await handle.db
    .insert(users)
    .values([
      {
        displayName: "Bankroll User A",
        email: `${marker}-a@example.test`,
      },
      {
        displayName: "Bankroll User B",
        email: `${marker}-b@example.test`,
      },
    ])
    .returning();

  [leagueA, leagueB] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Bankroll League A",
        provider: "espn",
        providerLeagueId: providerLeagueA,
      },
      {
        name: "Bankroll League B",
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
  await handle.pool.end();
});

describe("bankroll schema", () => {
  it("enables and forces RLS on league-scoped bankroll tables", async () => {
    const rows = await handle.pool.query<{
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       where relname in ('bankroll_weeks', 'bankroll_ledger')
       order by relname`,
    );

    expect(rows.rows).toEqual([
      {
        relforcerowsecurity: true,
        relname: "bankroll_ledger",
        relrowsecurity: true,
      },
      {
        relforcerowsecurity: true,
        relname: "bankroll_weeks",
        relrowsecurity: true,
      },
    ]);
  });

  it("rejects update and delete attempts on bankroll ledger rows", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(8),
      weekStart: week(1),
    });
    const entryId = opened.latestLedgerEntry.id;

    await expect(
      sqlstateOf(
        withLeagueContext(handle.db, leagueA.id, (tx) =>
          tx
            .update(bankrollLedger)
            .set({ amountCents: 1 })
            .where(eq(bankrollLedger.id, entryId)),
        ),
      ),
    ).resolves.toBe("55000");

    await expect(
      sqlstateOf(
        withLeagueContext(handle.db, leagueA.id, (tx) =>
          tx.delete(bankrollLedger).where(eq(bankrollLedger.id, entryId)),
        ),
      ),
    ).resolves.toBe("55000");
  });
});

describe("bankroll week opening", () => {
  it("opens a user-week once and records a single week_open ledger entry", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(15),
      weekStart: week(8),
    });
    const repeated = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(15),
      weekStart: week(8),
    });

    expect(opened.created).toBe(true);
    expect(repeated.created).toBe(false);
    expect(repeated.week.id).toBe(opened.week.id);
    expect(opened.balanceCents).toBe(DEFAULT_BANKROLL_FLOOR_CENTS);
    expect(opened.latestLedgerEntry).toMatchObject({
      amountCents: DEFAULT_BANKROLL_FLOOR_CENTS,
      entryType: "week_open",
      runningBalanceCents: DEFAULT_BANKROLL_FLOOR_CENTS,
      seq: 1,
    });

    const entries = await ledgerEntriesFor(opened.week.id);
    expect(entries).toHaveLength(1);
    expect(replayBankrollLedger(entries)).toBe(DEFAULT_BANKROLL_FLOOR_CENTS);
  });

  it("appends ledger entries sequentially and reads the active balance", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(22),
      weekStart: week(15),
    });

    const adjustment = await appendBankrollLedgerEntry(handle.db, {
      amountCents: -250_000,
      bankrollWeekId: opened.week.id,
      entryType: "adjustment",
      leagueId: leagueA.id,
      userId: userA.id,
    });
    const balance = await getCurrentBankrollBalance(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
    });

    expect(adjustment).toMatchObject({
      amountCents: -250_000,
      runningBalanceCents: 750_000,
      seq: 2,
    });
    expect(balance?.week.id).toBe(opened.week.id);
    expect(balance?.balanceCents).toBe(750_000);
    expect(replayBankrollLedger(await ledgerEntriesFor(opened.week.id))).toBe(
      750_000,
    );
  });

  it("rejects entries that would produce a negative balance", async () => {
    const opened = await openBankrollWeek(handle.db, {
      floorCents: 500,
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(29),
      weekStart: week(22),
    });

    await expect(
      appendBankrollLedgerEntry(handle.db, {
        amountCents: -501,
        bankrollWeekId: opened.week.id,
        entryType: "bet_stake",
        leagueId: leagueA.id,
        userId: userA.id,
      }),
    ).rejects.toMatchObject({ code: "BANKROLL_NEGATIVE_BALANCE" });

    const entries = await ledgerEntriesFor(opened.week.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].runningBalanceCents).toBe(500);
  });

  it("does not return another league's bankroll week through explicit filters", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(30),
      weekStart: week(29),
    });

    await openBankrollWeek(handle.db, {
      leagueId: leagueB.id,
      userId: userB.id,
      weekEnd: week(30),
      weekStart: week(29),
    });

    await expect(
      getCurrentBankrollBalance(handle.db, {
        bankrollWeekId: opened.week.id,
        leagueId: leagueB.id,
        userId: userB.id,
      }),
    ).resolves.toBeNull();
  });
});

describe("bankroll weekly rollover", () => {
  it("resets a busted user to the floor with an auditable reset entry", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(36),
      weekStart: week(30),
    });
    await appendBankrollLedgerEntry(handle.db, {
      amountCents: -DEFAULT_BANKROLL_FLOOR_CENTS,
      bankrollWeekId: opened.week.id,
      entryType: "adjustment",
      leagueId: leagueA.id,
      userId: userA.id,
    });

    const rollover = await rolloverBankrollWeek(handle.db, {
      closingWeekStart: week(30),
      leagueId: leagueA.id,
      nextWeekEnd: week(43),
      nextWeekStart: week(36),
      userId: userA.id,
    });
    const repeated = await rolloverBankrollWeek(handle.db, {
      closingWeekStart: week(30),
      leagueId: leagueA.id,
      nextWeekEnd: week(43),
      nextWeekStart: week(36),
      userId: userA.id,
    });

    expect(rollover.previousWeek.closed).toBe(true);
    expect(rollover.closingBalanceCents).toBe(0);
    expect(rollover.createdNextWeek).toBe(true);
    expect(rollover.openingBalanceCents).toBe(DEFAULT_BANKROLL_FLOOR_CENTS);
    expect(rollover.resetAmountCents).toBe(DEFAULT_BANKROLL_FLOOR_CENTS);
    expect(rollover.ledgerEntries.map((entry) => entry.entryType)).toEqual([
      "week_open",
      "reset_to_floor",
    ]);
    expect(rollover.ledgerEntries.map((entry) => entry.amountCents)).toEqual([
      0,
      DEFAULT_BANKROLL_FLOOR_CENTS,
    ]);
    expect(
      replayBankrollLedger(await ledgerEntriesFor(rollover.nextWeek.id)),
    ).toBe(DEFAULT_BANKROLL_FLOOR_CENTS);
    expect(repeated.createdNextWeek).toBe(false);
    expect(await ledgerEntriesFor(rollover.nextWeek.id)).toHaveLength(2);
  });

  it("carries a user above the floor into the next week without reset", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: leagueA.id,
      userId: userA.id,
      weekEnd: week(50),
      weekStart: week(43),
    });
    await appendBankrollLedgerEntry(handle.db, {
      amountCents: 250_000,
      bankrollWeekId: opened.week.id,
      entryType: "adjustment",
      leagueId: leagueA.id,
      userId: userA.id,
    });

    const rollover = await rolloverBankrollWeek(handle.db, {
      closingWeekStart: week(43),
      leagueId: leagueA.id,
      nextWeekEnd: week(57),
      nextWeekStart: week(50),
      userId: userA.id,
    });
    const entries = await ledgerEntriesFor(rollover.nextWeek.id);

    expect(rollover.closingBalanceCents).toBe(1_250_000);
    expect(rollover.openingBalanceCents).toBe(1_250_000);
    expect(rollover.resetAmountCents).toBe(0);
    expect(entries.map((entry) => entry.entryType)).toEqual(["week_open"]);
    expect(entries[0]).toMatchObject({
      amountCents: 1_250_000,
      runningBalanceCents: 1_250_000,
      seq: 1,
    });
    expect(replayBankrollLedger(entries)).toBe(1_250_000);
  });
});
