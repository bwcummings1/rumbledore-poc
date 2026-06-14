import { and, desc, eq, inArray } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  type BankrollLedgerEntry,
  type BetLeg,
  type BetSlip,
  bankrollLedger,
  betLegs,
  betSlips,
  bettingMarkets,
  oddsSnapshots,
} from "@/db/schema";
import { stableContentHash } from "@/ingestion/hash";
import {
  appendBankrollLedgerEntryInContext,
  requireLockedBankrollBalanceInContext,
} from "./bankroll";

export const DEFAULT_ODDS_FRESHNESS_MS = 5 * 60 * 1000;

export const BET_SLIP_KINDS = ["single", "parlay"] as const;
export type BetSlipKind = (typeof BET_SLIP_KINDS)[number];

export const BET_LEG_SELECTIONS = [
  "home",
  "away",
  "over",
  "under",
  "player_over",
  "player_under",
  "outcome",
] as const;
export type BetLegSelection = (typeof BET_LEG_SELECTIONS)[number];

export interface PlaceBetLegInput {
  oddsSnapshotId: string;
  selection: BetLegSelection;
}

export interface PlaceBetSlipInput {
  bankrollWeekId?: string;
  freshnessWindowMs?: number;
  idempotencyKey: string;
  kind: BetSlipKind;
  leagueId: string;
  legs: PlaceBetLegInput[];
  now?: Date;
  stakeCents: number;
  userId: string;
}

export interface PlaceBetSlipResult {
  legs: BetLeg[];
  reused: boolean;
  slip: BetSlip;
  stakeLedgerEntry: BankrollLedgerEntry | null;
}

interface PreparedLeg {
  lockedAmericanOdds: number;
  lockedDecimalOdds: number;
  lockedLine: number | null;
  marketId: string;
  oddsSnapshotId: string;
  selection: BetLegSelection;
}

interface SnapshotRow {
  awayPrice: number | null;
  capturedAt: Date;
  homePrice: number | null;
  line: number | null;
  marketId: string;
  marketStatus: "open" | "suspended" | "settled" | "void";
  marketType: "moneyline" | "spread" | "total" | "player_prop";
  oddsSnapshotId: string;
  outcomePrice: number | null;
  overPrice: number | null;
  underPrice: number | null;
}

function appError(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): AppError {
  return new AppError({ code, details, message, status });
}

function dateValue(value: Date | undefined, field: string): Date {
  const date = value ? new Date(value.getTime()) : new Date();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw appError("BET_INVALID_DATE", `${field} must be a valid Date`, 400, {
      field,
    });
  }
  return date;
}

function validateStakeCents(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw appError(
      "BET_INVALID_STAKE",
      "stakeCents must be positive integer cents",
      400,
    );
  }
  return value;
}

function validateFreshnessWindow(value: number | undefined): number {
  const freshnessWindowMs = value ?? DEFAULT_ODDS_FRESHNESS_MS;
  if (!Number.isSafeInteger(freshnessWindowMs) || freshnessWindowMs <= 0) {
    throw appError(
      "BET_INVALID_FRESHNESS_WINDOW",
      "freshnessWindowMs must be a positive integer",
      400,
    );
  }
  return freshnessWindowMs;
}

function validateIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 200) {
    throw appError(
      "BET_INVALID_IDEMPOTENCY_KEY",
      "idempotencyKey must be a non-empty string of 200 characters or fewer",
      400,
    );
  }
  return key;
}

function validateKindAndLegs(
  kind: BetSlipKind,
  legs: readonly PlaceBetLegInput[],
): PlaceBetLegInput[] {
  if (!BET_SLIP_KINDS.includes(kind)) {
    throw appError("BET_INVALID_KIND", "Bet slip kind is invalid", 400);
  }
  if (!Array.isArray(legs) || legs.length === 0) {
    throw appError(
      "BET_EMPTY_SLIP",
      "A bet slip must include at least one leg",
    );
  }
  if (kind === "single" && legs.length !== 1) {
    throw appError(
      "BET_INVALID_LEG_COUNT",
      "Single bet slips must include exactly one leg",
    );
  }
  if (kind === "parlay" && legs.length < 2) {
    throw appError(
      "BET_INVALID_LEG_COUNT",
      "Parlay bet slips must include at least two legs",
    );
  }

  const seenSnapshots = new Set<string>();
  return legs.map((leg) => {
    const oddsSnapshotId = leg.oddsSnapshotId.trim();
    if (!oddsSnapshotId) {
      throw appError(
        "BET_INVALID_SNAPSHOT",
        "Each bet leg must reference an odds snapshot",
      );
    }
    if (seenSnapshots.has(oddsSnapshotId)) {
      throw appError(
        "BET_DUPLICATE_MARKET",
        "Parlay legs must reference distinct markets",
        409,
      );
    }
    seenSnapshots.add(oddsSnapshotId);

    if (!BET_LEG_SELECTIONS.includes(leg.selection)) {
      throw appError(
        "BET_INVALID_SELECTION",
        "Bet leg selection is invalid",
        400,
      );
    }
    return { oddsSnapshotId, selection: leg.selection };
  });
}

function decimalOddsFromAmerican(americanOdds: number): number {
  if (!Number.isSafeInteger(americanOdds) || americanOdds === 0) {
    throw appError(
      "BET_INVALID_ODDS",
      "American odds must be a non-zero integer",
      400,
    );
  }
  const decimalOdds =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);
  return roundDecimalOdds(decimalOdds);
}

function roundDecimalOdds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function requirePrice(
  value: number | null,
  selection: BetLegSelection,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value === 0
  ) {
    throw appError(
      "BET_PRICE_UNAVAILABLE",
      `No available price for ${selection}`,
      409,
    );
  }
  return value;
}

function requireLine(value: number | null, marketType: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw appError(
      "BET_LINE_UNAVAILABLE",
      `No available line for ${marketType}`,
      409,
    );
  }
  return value;
}

function selectedOdds(
  row: SnapshotRow,
  selection: BetLegSelection,
): Pick<
  PreparedLeg,
  "lockedAmericanOdds" | "lockedDecimalOdds" | "lockedLine"
> {
  switch (row.marketType) {
    case "moneyline": {
      if (selection !== "home" && selection !== "away") {
        throw appError(
          "BET_INVALID_SELECTION",
          "Moneyline bets must select home or away",
          400,
        );
      }
      const lockedAmericanOdds = requirePrice(
        selection === "home" ? row.homePrice : row.awayPrice,
        selection,
      );
      return {
        lockedAmericanOdds,
        lockedDecimalOdds: decimalOddsFromAmerican(lockedAmericanOdds),
        lockedLine: null,
      };
    }
    case "spread": {
      if (selection !== "home" && selection !== "away") {
        throw appError(
          "BET_INVALID_SELECTION",
          "Spread bets must select home or away",
          400,
        );
      }
      const line = requireLine(row.line, row.marketType);
      const lockedAmericanOdds = requirePrice(
        selection === "home" ? row.homePrice : row.awayPrice,
        selection,
      );
      return {
        lockedAmericanOdds,
        lockedDecimalOdds: decimalOddsFromAmerican(lockedAmericanOdds),
        lockedLine: selection === "home" ? line : -line,
      };
    }
    case "total": {
      if (selection !== "over" && selection !== "under") {
        throw appError(
          "BET_INVALID_SELECTION",
          "Total bets must select over or under",
          400,
        );
      }
      const lockedAmericanOdds = requirePrice(
        selection === "over" ? row.overPrice : row.underPrice,
        selection,
      );
      return {
        lockedAmericanOdds,
        lockedDecimalOdds: decimalOddsFromAmerican(lockedAmericanOdds),
        lockedLine: requireLine(row.line, row.marketType),
      };
    }
    case "player_prop": {
      if (
        selection !== "over" &&
        selection !== "under" &&
        selection !== "player_over" &&
        selection !== "player_under"
      ) {
        throw appError(
          "BET_INVALID_SELECTION",
          "Player props must select over or under",
          400,
        );
      }
      const picksOver = selection === "over" || selection === "player_over";
      const lockedAmericanOdds = requirePrice(
        picksOver ? row.overPrice : row.underPrice,
        selection,
      );
      return {
        lockedAmericanOdds,
        lockedDecimalOdds: decimalOddsFromAmerican(lockedAmericanOdds),
        lockedLine: requireLine(row.line, row.marketType),
      };
    }
  }

  if (selection !== "outcome") {
    throw appError(
      "BET_INVALID_SELECTION",
      "Bet leg selection is invalid",
      400,
    );
  }
  const lockedAmericanOdds = requirePrice(row.outcomePrice, selection);
  return {
    lockedAmericanOdds,
    lockedDecimalOdds: decimalOddsFromAmerican(lockedAmericanOdds),
    lockedLine: row.line,
  };
}

function requestHash(
  input: Pick<PlaceBetSlipInput, "kind" | "stakeCents"> & {
    bankrollWeekId: string;
    idempotencyKey: string;
    legs: readonly PlaceBetLegInput[];
  },
): string {
  return stableContentHash({
    bankrollWeekId: input.bankrollWeekId,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    legs: [...input.legs]
      .map((leg) => ({
        oddsSnapshotId: leg.oddsSnapshotId,
        selection: leg.selection,
      }))
      .sort((left, right) => {
        const bySnapshot = left.oddsSnapshotId.localeCompare(
          right.oddsSnapshotId,
        );
        return bySnapshot || left.selection.localeCompare(right.selection);
      }),
    stakeCents: input.stakeCents,
  });
}

function potentialPayoutCents(
  stakeCents: number,
  preparedLegs: readonly PreparedLeg[],
): { combinedDecimalOdds: number; potentialPayoutCents: number } {
  const combinedDecimalOdds = roundDecimalOdds(
    preparedLegs.reduce((combined, leg) => combined * leg.lockedDecimalOdds, 1),
  );
  return {
    combinedDecimalOdds,
    potentialPayoutCents: Math.round(stakeCents * combinedDecimalOdds),
  };
}

async function loadExistingPlacement(
  tx: LeagueScopedTx,
  input: Pick<PlaceBetSlipInput, "leagueId" | "userId"> & {
    idempotencyKey: string;
  },
): Promise<PlaceBetSlipResult | null> {
  const [slip] = await tx
    .select()
    .from(betSlips)
    .where(
      and(
        eq(betSlips.leagueId, input.leagueId),
        eq(betSlips.userId, input.userId),
        eq(betSlips.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!slip) {
    return null;
  }

  const legs = await tx
    .select()
    .from(betLegs)
    .where(
      and(eq(betLegs.leagueId, input.leagueId), eq(betLegs.slipId, slip.id)),
    )
    .orderBy(betLegs.createdAt, betLegs.id);

  const [stakeLedgerEntry] = await tx
    .select()
    .from(bankrollLedger)
    .where(
      and(
        eq(bankrollLedger.leagueId, input.leagueId),
        eq(bankrollLedger.userId, input.userId),
        eq(bankrollLedger.refSlipId, slip.id),
        eq(bankrollLedger.entryType, "bet_stake"),
      ),
    )
    .orderBy(bankrollLedger.seq)
    .limit(1);

  return {
    legs,
    reused: true,
    slip,
    stakeLedgerEntry: stakeLedgerEntry ?? null,
  };
}

function assertIdempotentPayloadMatches(
  existing: PlaceBetSlipResult,
  expectedRequestHash: string,
): PlaceBetSlipResult {
  if (existing.slip.requestHash !== expectedRequestHash) {
    throw appError(
      "BET_IDEMPOTENCY_CONFLICT",
      "idempotencyKey was already used for a different bet slip",
      409,
    );
  }
  return existing;
}

async function loadSnapshotRows(
  tx: LeagueScopedTx,
  legs: readonly PlaceBetLegInput[],
): Promise<Map<string, SnapshotRow>> {
  const snapshotIds = legs.map((leg) => leg.oddsSnapshotId);
  const rows = await tx
    .select({
      awayPrice: oddsSnapshots.awayPrice,
      capturedAt: oddsSnapshots.capturedAt,
      homePrice: oddsSnapshots.homePrice,
      line: oddsSnapshots.line,
      marketId: bettingMarkets.id,
      marketStatus: bettingMarkets.status,
      marketType: bettingMarkets.type,
      oddsSnapshotId: oddsSnapshots.id,
      outcomePrice: oddsSnapshots.outcomePrice,
      overPrice: oddsSnapshots.overPrice,
      underPrice: oddsSnapshots.underPrice,
    })
    .from(oddsSnapshots)
    .innerJoin(bettingMarkets, eq(bettingMarkets.id, oddsSnapshots.marketId))
    .where(inArray(oddsSnapshots.id, snapshotIds));

  const bySnapshotId = new Map<string, SnapshotRow>();
  for (const row of rows) {
    bySnapshotId.set(row.oddsSnapshotId, row);
  }
  return bySnapshotId;
}

async function assertLatestFreshSnapshot(
  tx: LeagueScopedTx,
  row: SnapshotRow,
  now: Date,
  freshnessWindowMs: number,
): Promise<void> {
  const [latest] = await tx
    .select({
      capturedAt: oddsSnapshots.capturedAt,
      id: oddsSnapshots.id,
    })
    .from(oddsSnapshots)
    .where(eq(oddsSnapshots.marketId, row.marketId))
    .orderBy(desc(oddsSnapshots.capturedAt), desc(oddsSnapshots.createdAt))
    .limit(1);

  if (!latest || latest.id !== row.oddsSnapshotId) {
    throw appError(
      "BET_ODDS_STALE",
      "Selected odds are no longer the latest available price",
      409,
    );
  }

  if (now.getTime() - latest.capturedAt.getTime() > freshnessWindowMs) {
    throw appError(
      "BET_ODDS_STALE",
      "Selected odds are outside the freshness window",
      409,
      { capturedAt: latest.capturedAt.toISOString() },
    );
  }
}

async function prepareLegs(
  tx: LeagueScopedTx,
  legs: readonly PlaceBetLegInput[],
  now: Date,
  freshnessWindowMs: number,
): Promise<PreparedLeg[]> {
  const rows = await loadSnapshotRows(tx, legs);
  const prepared: PreparedLeg[] = [];
  const marketIds = new Set<string>();

  for (const leg of legs) {
    const row = rows.get(leg.oddsSnapshotId);
    if (!row) {
      throw appError(
        "BET_SNAPSHOT_NOT_FOUND",
        "Selected odds snapshot was not found",
        404,
      );
    }
    if (row.marketStatus !== "open") {
      throw appError(
        "BET_MARKET_CLOSED",
        "Selected market is not open for betting",
        409,
        { marketStatus: row.marketStatus },
      );
    }
    if (marketIds.has(row.marketId)) {
      throw appError(
        "BET_DUPLICATE_MARKET",
        "Parlay legs must reference distinct markets",
        409,
      );
    }
    marketIds.add(row.marketId);

    await assertLatestFreshSnapshot(tx, row, now, freshnessWindowMs);
    prepared.push({
      ...selectedOdds(row, leg.selection),
      marketId: row.marketId,
      oddsSnapshotId: row.oddsSnapshotId,
      selection: leg.selection,
    });
  }

  return prepared;
}

export async function placeBetSlip(
  db: Db,
  input: PlaceBetSlipInput,
): Promise<PlaceBetSlipResult> {
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const stakeCents = validateStakeCents(input.stakeCents);
  const legs = validateKindAndLegs(input.kind, input.legs);
  const now = dateValue(input.now, "now");
  const freshnessWindowMs = validateFreshnessWindow(input.freshnessWindowMs);

  return withLeagueContext(db, input.leagueId, async (tx) => {
    const existing = await loadExistingPlacement(tx, {
      idempotencyKey,
      leagueId: input.leagueId,
      userId: input.userId,
    });
    if (existing) {
      const existingRequestHash = requestHash({
        bankrollWeekId: input.bankrollWeekId ?? existing.slip.bankrollWeekId,
        idempotencyKey,
        kind: input.kind,
        legs,
        stakeCents,
      });
      return assertIdempotentPayloadMatches(existing, existingRequestHash);
    }

    const balance = await requireLockedBankrollBalanceInContext(tx, {
      bankrollWeekId: input.bankrollWeekId,
      leagueId: input.leagueId,
      userId: input.userId,
    });
    if (stakeCents > balance.balanceCents) {
      throw appError(
        "BET_INSUFFICIENT_FUNDS",
        "Stake exceeds current bankroll balance",
        409,
        { balanceCents: balance.balanceCents },
      );
    }

    const resolvedRequestHash = requestHash({
      bankrollWeekId: balance.week.id,
      idempotencyKey,
      kind: input.kind,
      legs,
      stakeCents,
    });
    const preparedLegs = await prepareLegs(tx, legs, now, freshnessWindowMs);
    const payout = potentialPayoutCents(stakeCents, preparedLegs);

    const [slip] = await tx
      .insert(betSlips)
      .values({
        bankrollWeekId: balance.week.id,
        combinedDecimalOdds: payout.combinedDecimalOdds,
        idempotencyKey,
        kind: input.kind,
        leagueId: input.leagueId,
        placedAt: now,
        potentialPayoutCents: payout.potentialPayoutCents,
        requestHash: resolvedRequestHash,
        stakeCents,
        status: "pending",
        userId: input.userId,
      })
      .onConflictDoNothing({
        target: [betSlips.leagueId, betSlips.userId, betSlips.idempotencyKey],
      })
      .returning();

    if (!slip) {
      const raced = await loadExistingPlacement(tx, {
        idempotencyKey,
        leagueId: input.leagueId,
        userId: input.userId,
      });
      if (!raced) {
        throw appError(
          "BET_SLIP_INSERT_FAILED",
          "Bet slip could not be inserted or reloaded",
          500,
        );
      }
      return assertIdempotentPayloadMatches(raced, resolvedRequestHash);
    }

    const insertedLegs = await tx
      .insert(betLegs)
      .values(
        preparedLegs.map((leg) => ({
          leagueId: input.leagueId,
          lockedAmericanOdds: leg.lockedAmericanOdds,
          lockedDecimalOdds: leg.lockedDecimalOdds,
          lockedLine: leg.lockedLine,
          marketId: leg.marketId,
          oddsSnapshotId: leg.oddsSnapshotId,
          selection: leg.selection,
          slipId: slip.id,
        })),
      )
      .returning();

    if (insertedLegs.length !== preparedLegs.length) {
      throw appError(
        "BET_LEG_INSERT_FAILED",
        "Bet legs could not be inserted",
        500,
      );
    }

    const stakeLedgerEntry = await appendBankrollLedgerEntryInContext(tx, {
      amountCents: -stakeCents,
      bankrollWeekId: balance.week.id,
      createdAt: now,
      entryType: "bet_stake",
      leagueId: input.leagueId,
      refSlipId: slip.id,
      userId: input.userId,
    });

    return {
      legs: insertedLegs,
      reused: false,
      slip,
      stakeLedgerEntry,
    };
  });
}
