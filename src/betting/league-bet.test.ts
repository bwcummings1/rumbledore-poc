// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { betSlips, type League, leagues, type User, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  appendBankrollLedgerEntry,
  DEFAULT_BANKROLL_FLOOR_CENTS,
  openBankrollWeek,
  rolloverBankrollWeek,
} from "./bankroll";
import {
  getLeagueBetData,
  type LeagueBetData,
  type LeagueBetLoadResult,
} from "./league-bet";

const marker = `leaguebettest-${randomUUID()}`;
const providerLeagueCarry = `${marker}-carry`;
const providerLeagueReset = `${marker}-reset`;

let handle: DbHandle;
let carryLeague: League;
let resetLeague: League;
let carryUser: User;
let resetUser: User;

function week(day: number): Date {
  return new Date(Date.UTC(2026, 8, day));
}

async function seedPendingSlip(input: {
  bankrollWeekId: string;
  leagueId: string;
  payoutCents: number;
  stakeCents: number;
  tag: string;
  userId: string;
}) {
  const [slip] = await withLeagueContext(handle.db, input.leagueId, (tx) =>
    tx
      .insert(betSlips)
      .values({
        bankrollWeekId: input.bankrollWeekId,
        combinedDecimalOdds: input.payoutCents / input.stakeCents,
        idempotencyKey: `${marker}:${input.tag}`,
        kind: "single",
        leagueId: input.leagueId,
        placedAt: week(9),
        potentialPayoutCents: input.payoutCents,
        requestHash: `${marker}:${input.tag}:request`,
        stakeCents: input.stakeCents,
        status: "pending",
        userId: input.userId,
      })
      .returning(),
  );

  await appendBankrollLedgerEntry(handle.db, {
    amountCents: -input.stakeCents,
    bankrollWeekId: input.bankrollWeekId,
    entryType: "bet_stake",
    leagueId: input.leagueId,
    refSlipId: slip.id,
    userId: input.userId,
  });

  return slip;
}

function expectReadyData(result: LeagueBetLoadResult): LeagueBetData {
  expect(result.status).toBe("ready");
  if (!("data" in result)) {
    throw new Error("expected league bet data to be ready");
  }
  return result.data;
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

  [carryUser, resetUser] = await handle.db
    .insert(users)
    .values([
      {
        displayName: "League Bet Carry User",
        email: `${marker}-carry@example.test`,
      },
      {
        displayName: "League Bet Reset User",
        email: `${marker}-reset@example.test`,
      },
    ])
    .returning();

  [carryLeague, resetLeague] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "League Bet Carry League",
        provider: "espn",
        providerLeagueId: providerLeagueCarry,
      },
      {
        name: "League Bet Reset League",
        provider: "espn",
        providerLeagueId: providerLeagueReset,
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

describe("league bet data", () => {
  it("reports open exposure, upside, and carryover from the active bankroll week", async () => {
    const previous = await openBankrollWeek(handle.db, {
      leagueId: carryLeague.id,
      userId: carryUser.id,
      weekEnd: week(8),
      weekStart: week(1),
    });
    await appendBankrollLedgerEntry(handle.db, {
      amountCents: 250_000,
      bankrollWeekId: previous.week.id,
      entryType: "adjustment",
      leagueId: carryLeague.id,
      userId: carryUser.id,
    });

    const rollover = await rolloverBankrollWeek(handle.db, {
      closingWeekStart: week(1),
      leagueId: carryLeague.id,
      nextWeekEnd: week(15),
      nextWeekStart: week(8),
      userId: carryUser.id,
    });
    await seedPendingSlip({
      bankrollWeekId: rollover.nextWeek.id,
      leagueId: carryLeague.id,
      payoutCents: 90_000,
      stakeCents: 30_000,
      tag: "carry-pending",
      userId: carryUser.id,
    });

    const result = await getLeagueBetData(handle.db, {
      leagueId: carryLeague.id,
      userId: carryUser.id,
    });

    const data = expectReadyData(result);
    expect(data.balance).toMatchObject({
      balanceCents: 1_220_000,
      openExposureCents: 30_000,
      openPotentialReturnCents: 90_000,
      openingBalanceCents: 1_250_000,
      openingKind: "carryover",
      pendingSlipCount: 1,
      previousWeekClosingBalanceCents: 1_250_000,
      resetCreditCents: 0,
      weekOpenEntryCents: 1_250_000,
    });
  });

  it("reports an auditable reset-to-floor opening when the prior week busted", async () => {
    const previous = await openBankrollWeek(handle.db, {
      leagueId: resetLeague.id,
      userId: resetUser.id,
      weekEnd: week(29),
      weekStart: week(22),
    });
    await appendBankrollLedgerEntry(handle.db, {
      amountCents: -DEFAULT_BANKROLL_FLOOR_CENTS,
      bankrollWeekId: previous.week.id,
      entryType: "adjustment",
      leagueId: resetLeague.id,
      userId: resetUser.id,
    });

    await rolloverBankrollWeek(handle.db, {
      closingWeekStart: week(22),
      leagueId: resetLeague.id,
      nextWeekEnd: week(36),
      nextWeekStart: week(29),
      userId: resetUser.id,
    });

    const result = await getLeagueBetData(handle.db, {
      leagueId: resetLeague.id,
      userId: resetUser.id,
    });

    const data = expectReadyData(result);
    expect(data.balance).toMatchObject({
      balanceCents: DEFAULT_BANKROLL_FLOOR_CENTS,
      openExposureCents: 0,
      openPotentialReturnCents: 0,
      openingBalanceCents: DEFAULT_BANKROLL_FLOOR_CENTS,
      openingKind: "reset_to_floor",
      pendingSlipCount: 0,
      previousWeekClosingBalanceCents: 0,
      resetCreditCents: DEFAULT_BANKROLL_FLOOR_CENTS,
      weekOpenEntryCents: 0,
    });
  });
});
