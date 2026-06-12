import { and, desc, eq, sql } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  type BankrollLedgerEntry,
  type BankrollWeek,
  bankrollLedger,
  bankrollWeeks,
} from "@/db/schema";

export const DEFAULT_BANKROLL_FLOOR_CENTS = 1_000_000;

export const BANKROLL_LEDGER_ENTRY_TYPES = [
  "week_open",
  "bet_stake",
  "bet_payout",
  "bet_refund",
  "reset_to_floor",
  "adjustment",
] as const;

export type BankrollLedgerEntryType =
  (typeof BANKROLL_LEDGER_ENTRY_TYPES)[number];

export interface BankrollWeekInput {
  floorCents?: number;
  leagueId: string;
  userId: string;
  weekEnd: Date;
  weekStart: Date;
}

export interface OpenBankrollWeekInput extends BankrollWeekInput {
  openingBalanceCents?: number;
}

export interface AppendBankrollLedgerEntryInput {
  amountCents: number;
  bankrollWeekId: string;
  createdAt?: Date;
  entryType: BankrollLedgerEntryType;
  leagueId: string;
  refSlipId?: string | null;
  userId: string;
}

export interface GetBankrollBalanceInput {
  bankrollWeekId?: string;
  leagueId: string;
  userId: string;
  weekStart?: Date;
}

export interface RolloverBankrollWeekInput {
  closingWeekStart: Date;
  floorCents?: number;
  leagueId: string;
  nextWeekEnd: Date;
  nextWeekStart: Date;
  now?: Date;
  userId: string;
}

export interface BankrollWeekState {
  balanceCents: number;
  created: boolean;
  ledgerEntries: BankrollLedgerEntry[];
  latestLedgerEntry: BankrollLedgerEntry;
  week: BankrollWeek;
}

export interface BankrollBalance {
  balanceCents: number;
  latestLedgerEntry: BankrollLedgerEntry;
  week: BankrollWeek;
}

export interface BankrollRolloverResult {
  closingBalanceCents: number;
  createdNextWeek: boolean;
  ledgerEntries: BankrollLedgerEntry[];
  nextWeek: BankrollWeek;
  openingBalanceCents: number;
  previousWeek: BankrollWeek;
  resetAmountCents: number;
}

function appError(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): AppError {
  return new AppError({ code, details, message, status });
}

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function dateValue(value: Date, field: string): Date {
  if (!validDate(value)) {
    throw appError(
      "BANKROLL_INVALID_DATE",
      `${field} must be a valid Date`,
      400,
      {
        field,
      },
    );
  }
  return new Date(value.getTime());
}

function validateWeekWindow(weekStart: Date, weekEnd: Date): void {
  if (weekStart.getTime() >= weekEnd.getTime()) {
    throw appError(
      "BANKROLL_INVALID_WEEK_WINDOW",
      "weekStart must be before weekEnd",
      400,
    );
  }
}

function centsValue(
  value: number,
  field: string,
  { allowZero = true, signed = false } = {},
): number {
  if (!Number.isSafeInteger(value)) {
    throw appError(
      "BANKROLL_INVALID_AMOUNT",
      `${field} must be integer cents`,
      400,
      {
        field,
      },
    );
  }
  if (!signed && value < 0) {
    throw appError(
      "BANKROLL_INVALID_AMOUNT",
      `${field} cannot be negative`,
      400,
      {
        field,
      },
    );
  }
  if (!allowZero && value === 0) {
    throw appError("BANKROLL_INVALID_AMOUNT", `${field} cannot be zero`, 400, {
      field,
    });
  }
  return value;
}

function validateLedgerAmount(
  entryType: BankrollLedgerEntryType,
  amountCents: number,
): number {
  const amount = centsValue(amountCents, "amountCents", { signed: true });
  switch (entryType) {
    case "week_open":
      if (amount < 0) {
        throw appError(
          "BANKROLL_INVALID_LEDGER_AMOUNT",
          "week_open entries cannot be negative",
          400,
        );
      }
      return amount;
    case "bet_stake":
      if (amount >= 0) {
        throw appError(
          "BANKROLL_INVALID_LEDGER_AMOUNT",
          "bet_stake entries must be negative",
          400,
        );
      }
      return amount;
    case "bet_payout":
    case "bet_refund":
    case "reset_to_floor":
      if (amount <= 0) {
        throw appError(
          "BANKROLL_INVALID_LEDGER_AMOUNT",
          `${entryType} entries must be positive`,
          400,
        );
      }
      return amount;
    case "adjustment":
      if (amount === 0) {
        throw appError(
          "BANKROLL_INVALID_LEDGER_AMOUNT",
          "adjustment entries cannot be zero",
          400,
        );
      }
      return amount;
  }
}

async function lockWeekLedger(tx: LeagueScopedTx, bankrollWeekId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${bankrollWeekId}, 0))`,
  );
}

async function findWeekByStart(
  tx: LeagueScopedTx,
  input: Pick<GetBankrollBalanceInput, "leagueId" | "userId"> & {
    weekStart: Date;
  },
): Promise<BankrollWeek | null> {
  const [week] = await tx
    .select()
    .from(bankrollWeeks)
    .where(
      and(
        eq(bankrollWeeks.leagueId, input.leagueId),
        eq(bankrollWeeks.userId, input.userId),
        eq(bankrollWeeks.weekStart, input.weekStart),
      ),
    )
    .limit(1);
  return week ?? null;
}

async function findWeekForBalance(
  tx: LeagueScopedTx,
  input: GetBankrollBalanceInput,
): Promise<BankrollWeek | null> {
  if (input.bankrollWeekId) {
    const [week] = await tx
      .select()
      .from(bankrollWeeks)
      .where(
        and(
          eq(bankrollWeeks.id, input.bankrollWeekId),
          eq(bankrollWeeks.leagueId, input.leagueId),
          eq(bankrollWeeks.userId, input.userId),
        ),
      )
      .limit(1);
    return week ?? null;
  }

  if (input.weekStart) {
    return findWeekByStart(tx, {
      leagueId: input.leagueId,
      userId: input.userId,
      weekStart: input.weekStart,
    });
  }

  const [week] = await tx
    .select()
    .from(bankrollWeeks)
    .where(
      and(
        eq(bankrollWeeks.leagueId, input.leagueId),
        eq(bankrollWeeks.userId, input.userId),
        eq(bankrollWeeks.closed, false),
      ),
    )
    .orderBy(desc(bankrollWeeks.weekStart))
    .limit(1);
  return week ?? null;
}

async function getLatestLedgerEntry(
  tx: LeagueScopedTx,
  input: Pick<GetBankrollBalanceInput, "leagueId" | "userId"> & {
    bankrollWeekId: string;
  },
): Promise<BankrollLedgerEntry | null> {
  const [entry] = await tx
    .select()
    .from(bankrollLedger)
    .where(
      and(
        eq(bankrollLedger.leagueId, input.leagueId),
        eq(bankrollLedger.userId, input.userId),
        eq(bankrollLedger.bankrollWeekId, input.bankrollWeekId),
      ),
    )
    .orderBy(desc(bankrollLedger.seq))
    .limit(1);
  return entry ?? null;
}

async function appendBankrollLedgerEntryInContext(
  tx: LeagueScopedTx,
  input: AppendBankrollLedgerEntryInput,
): Promise<BankrollLedgerEntry> {
  const amountCents = validateLedgerAmount(input.entryType, input.amountCents);
  const createdAt = input.createdAt
    ? dateValue(input.createdAt, "createdAt")
    : new Date();

  await lockWeekLedger(tx, input.bankrollWeekId);

  const [week] = await tx
    .select()
    .from(bankrollWeeks)
    .where(
      and(
        eq(bankrollWeeks.id, input.bankrollWeekId),
        eq(bankrollWeeks.leagueId, input.leagueId),
        eq(bankrollWeeks.userId, input.userId),
      ),
    )
    .limit(1);

  if (!week) {
    throw appError(
      "BANKROLL_WEEK_NOT_FOUND",
      "Bankroll week was not found",
      404,
    );
  }
  if (week.closed) {
    throw appError(
      "BANKROLL_WEEK_CLOSED",
      "Cannot append ledger entries to a closed bankroll week",
      409,
    );
  }

  const latest = await getLatestLedgerEntry(tx, {
    bankrollWeekId: input.bankrollWeekId,
    leagueId: input.leagueId,
    userId: input.userId,
  });

  if (!latest && input.entryType !== "week_open") {
    throw appError(
      "BANKROLL_WEEK_NOT_OPENED",
      "The first bankroll ledger entry must be week_open",
      409,
    );
  }
  if (latest && input.entryType === "week_open") {
    throw appError(
      "BANKROLL_WEEK_ALREADY_OPEN",
      "week_open can only be the first bankroll ledger entry",
      409,
    );
  }

  const previousBalance = latest?.runningBalanceCents ?? 0;
  const runningBalanceCents = previousBalance + amountCents;
  if (runningBalanceCents < 0) {
    throw appError(
      "BANKROLL_NEGATIVE_BALANCE",
      "Bankroll ledger entries cannot produce a negative balance",
      409,
      { previousBalanceCents: previousBalance },
    );
  }

  const [entry] = await tx
    .insert(bankrollLedger)
    .values({
      amountCents,
      bankrollWeekId: input.bankrollWeekId,
      createdAt,
      entryType: input.entryType,
      leagueId: input.leagueId,
      refSlipId: input.refSlipId ?? null,
      runningBalanceCents,
      seq: (latest?.seq ?? 0) + 1,
      userId: input.userId,
    })
    .returning();

  if (!entry) {
    throw appError(
      "BANKROLL_LEDGER_INSERT_FAILED",
      "Bankroll ledger entry could not be inserted",
      500,
    );
  }
  return entry;
}

async function requireBalanceInContext(
  tx: LeagueScopedTx,
  input: GetBankrollBalanceInput,
): Promise<BankrollBalance> {
  const week = await findWeekForBalance(tx, input);
  if (!week) {
    throw appError(
      "BANKROLL_WEEK_NOT_FOUND",
      "Bankroll week was not found",
      404,
    );
  }

  const latestLedgerEntry = await getLatestLedgerEntry(tx, {
    bankrollWeekId: week.id,
    leagueId: input.leagueId,
    userId: input.userId,
  });
  if (!latestLedgerEntry) {
    throw appError(
      "BANKROLL_LEDGER_EMPTY",
      "Bankroll week has no ledger entries",
      500,
    );
  }

  return {
    balanceCents: latestLedgerEntry.runningBalanceCents,
    latestLedgerEntry,
    week,
  };
}

async function openBankrollWeekInContext(
  tx: LeagueScopedTx,
  input: OpenBankrollWeekInput & {
    openingEntryAmountCents?: number;
    resetAmountCents?: number;
  },
): Promise<BankrollWeekState> {
  const weekStart = dateValue(input.weekStart, "weekStart");
  const weekEnd = dateValue(input.weekEnd, "weekEnd");
  validateWeekWindow(weekStart, weekEnd);

  const floorCents = centsValue(
    input.floorCents ?? DEFAULT_BANKROLL_FLOOR_CENTS,
    "floorCents",
  );
  const openingBalanceCents = centsValue(
    input.openingBalanceCents ?? floorCents,
    "openingBalanceCents",
  );
  const openingEntryAmountCents = centsValue(
    input.openingEntryAmountCents ?? openingBalanceCents,
    "openingEntryAmountCents",
  );
  const resetAmountCents = centsValue(
    input.resetAmountCents ?? 0,
    "resetAmountCents",
  );
  if (openingBalanceCents < floorCents) {
    throw appError(
      "BANKROLL_OPENING_BELOW_FLOOR",
      "openingBalanceCents cannot be below floorCents",
      400,
    );
  }
  const replayedOpeningBalanceCents =
    openingEntryAmountCents + resetAmountCents;
  const openingReplayDelta = replayedOpeningBalanceCents - openingBalanceCents;
  if (Math.abs(openingReplayDelta) > 0) {
    throw appError(
      "BANKROLL_OPENING_LEDGER_MISMATCH",
      "Opening ledger entries must replay to openingBalanceCents",
      400,
    );
  }

  const existing = await findWeekByStart(tx, {
    leagueId: input.leagueId,
    userId: input.userId,
    weekStart,
  });
  if (existing) {
    const balance = await requireBalanceInContext(tx, {
      bankrollWeekId: existing.id,
      leagueId: input.leagueId,
      userId: input.userId,
    });
    return {
      ...balance,
      created: false,
      ledgerEntries: [],
    };
  }

  const [week] = await tx
    .insert(bankrollWeeks)
    .values({
      floorCents,
      leagueId: input.leagueId,
      openingBalanceCents,
      userId: input.userId,
      weekEnd,
      weekStart,
    })
    .returning();

  if (!week) {
    throw appError(
      "BANKROLL_WEEK_INSERT_FAILED",
      "Bankroll week could not be inserted",
      500,
    );
  }

  const entries: BankrollLedgerEntry[] = [];
  entries.push(
    await appendBankrollLedgerEntryInContext(tx, {
      amountCents: openingEntryAmountCents,
      bankrollWeekId: week.id,
      entryType: "week_open",
      leagueId: input.leagueId,
      userId: input.userId,
    }),
  );
  if (resetAmountCents > 0) {
    entries.push(
      await appendBankrollLedgerEntryInContext(tx, {
        amountCents: resetAmountCents,
        bankrollWeekId: week.id,
        entryType: "reset_to_floor",
        leagueId: input.leagueId,
        userId: input.userId,
      }),
    );
  }

  const latestLedgerEntry = entries[entries.length - 1];
  if (!latestLedgerEntry) {
    throw appError(
      "BANKROLL_LEDGER_INSERT_FAILED",
      "Bankroll week opened without a ledger entry",
      500,
    );
  }

  return {
    balanceCents: latestLedgerEntry.runningBalanceCents,
    created: true,
    ledgerEntries: entries,
    latestLedgerEntry,
    week,
  };
}

export async function openBankrollWeek(
  db: Db,
  input: OpenBankrollWeekInput,
): Promise<BankrollWeekState> {
  return withLeagueContext(db, input.leagueId, (tx) =>
    openBankrollWeekInContext(tx, input),
  );
}

export async function appendBankrollLedgerEntry(
  db: Db,
  input: AppendBankrollLedgerEntryInput,
): Promise<BankrollLedgerEntry> {
  return withLeagueContext(db, input.leagueId, (tx) =>
    appendBankrollLedgerEntryInContext(tx, input),
  );
}

export async function getCurrentBankrollBalance(
  db: Db,
  input: GetBankrollBalanceInput,
): Promise<BankrollBalance | null> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const week = await findWeekForBalance(tx, {
      ...input,
      weekStart: input.weekStart
        ? dateValue(input.weekStart, "weekStart")
        : undefined,
    });
    if (!week) {
      return null;
    }
    return requireBalanceInContext(tx, {
      bankrollWeekId: week.id,
      leagueId: input.leagueId,
      userId: input.userId,
    });
  });
}

export async function rolloverBankrollWeek(
  db: Db,
  input: RolloverBankrollWeekInput,
): Promise<BankrollRolloverResult> {
  const closingWeekStart = dateValue(
    input.closingWeekStart,
    "closingWeekStart",
  );
  const nextWeekStart = dateValue(input.nextWeekStart, "nextWeekStart");
  const nextWeekEnd = dateValue(input.nextWeekEnd, "nextWeekEnd");
  const now = input.now ? dateValue(input.now, "now") : new Date();
  validateWeekWindow(nextWeekStart, nextWeekEnd);
  if (closingWeekStart.getTime() >= nextWeekStart.getTime()) {
    throw appError(
      "BANKROLL_INVALID_ROLLOVER_WINDOW",
      "nextWeekStart must be after closingWeekStart",
      400,
    );
  }

  return withLeagueContext(db, input.leagueId, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${input.leagueId}:${input.userId}:${closingWeekStart.toISOString()}`}, 0))`,
    );

    const previousWeek = await findWeekByStart(tx, {
      leagueId: input.leagueId,
      userId: input.userId,
      weekStart: closingWeekStart,
    });
    if (!previousWeek) {
      throw appError(
        "BANKROLL_WEEK_NOT_FOUND",
        "Closing bankroll week was not found",
        404,
      );
    }

    const latestPriorEntry = await getLatestLedgerEntry(tx, {
      bankrollWeekId: previousWeek.id,
      leagueId: input.leagueId,
      userId: input.userId,
    });
    if (!latestPriorEntry) {
      throw appError(
        "BANKROLL_LEDGER_EMPTY",
        "Closing bankroll week has no ledger entries",
        500,
      );
    }

    const closingBalanceCents =
      previousWeek.closed && previousWeek.closingBalanceCents !== null
        ? previousWeek.closingBalanceCents
        : latestPriorEntry.runningBalanceCents;

    let closedPreviousWeek = previousWeek;
    if (!previousWeek.closed) {
      const [updated] = await tx
        .update(bankrollWeeks)
        .set({
          closed: true,
          closingBalanceCents,
          updatedAt: now,
        })
        .where(
          and(
            eq(bankrollWeeks.id, previousWeek.id),
            eq(bankrollWeeks.leagueId, input.leagueId),
            eq(bankrollWeeks.userId, input.userId),
          ),
        )
        .returning();
      if (!updated) {
        throw appError(
          "BANKROLL_WEEK_CLOSE_FAILED",
          "Bankroll week could not be closed",
          500,
        );
      }
      closedPreviousWeek = updated;
    }

    const floorCents = centsValue(
      input.floorCents ?? previousWeek.floorCents,
      "floorCents",
    );
    const openingBalanceCents = Math.max(closingBalanceCents, floorCents);
    const openingEntryAmountCents = Math.max(closingBalanceCents, 0);
    const resetAmountCents = openingBalanceCents - openingEntryAmountCents;

    const next = await openBankrollWeekInContext(tx, {
      floorCents,
      leagueId: input.leagueId,
      openingBalanceCents,
      openingEntryAmountCents,
      resetAmountCents,
      userId: input.userId,
      weekEnd: nextWeekEnd,
      weekStart: nextWeekStart,
    });

    return {
      closingBalanceCents,
      createdNextWeek: next.created,
      ledgerEntries: next.ledgerEntries,
      nextWeek: next.week,
      openingBalanceCents: next.week.openingBalanceCents,
      previousWeek: closedPreviousWeek,
      resetAmountCents,
    };
  });
}

export function replayBankrollLedger(
  entries: readonly Pick<
    BankrollLedgerEntry,
    "amountCents" | "runningBalanceCents" | "seq"
  >[],
): number {
  let balance = 0;
  for (const entry of [...entries].sort((a, b) => a.seq - b.seq)) {
    balance += entry.amountCents;
    if (balance !== entry.runningBalanceCents) {
      throw appError(
        "BANKROLL_LEDGER_REPLAY_MISMATCH",
        "Bankroll ledger running balance does not match replayed amounts",
        500,
        { seq: entry.seq },
      );
    }
  }
  return balance;
}
