import { and, eq, sql } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  type BankrollLedgerEntry,
  type BetSettlement,
  type BettingEvent,
  betLegs,
  betSettlements,
  betSlips,
  bettingEvents,
  bettingMarkets,
} from "@/db/schema";
import { stableContentHash } from "@/ingestion/hash";
import { appendBankrollLedgerEntryInContext } from "./bankroll";
import type {
  EventResult,
  ResultsPlayerStat,
  ResultsProvider,
} from "./interfaces";

type LegStatus = "pending" | "won" | "lost" | "push" | "void";
type FinalSlipStatus = "won" | "lost" | "push" | "void" | "partial_void";
type SettlementLedgerEntryType = "bet_payout" | "bet_refund";

export interface BettingSettlementDependencies {
  db: Db;
  now?: () => Date;
  resultsProvider: ResultsProvider;
}

export interface SettleBettingEventInput {
  bettingEventId: string;
  leagueId: string;
  now?: Date;
}

export interface SettleBettingEventResult {
  bettingEventId: string;
  finalizedSlips: number;
  gradedLegs: number;
  leagueId: string;
  ledgerEntries: BankrollLedgerEntry[];
  repricedSlips: number;
  settlements: BetSettlement[];
  skippedReason: "event_not_found" | "result_not_final" | null;
}

interface PendingLegRow {
  id: string;
  lockedDecimalOdds: number;
  lockedLine: number | null;
  marketId: string;
  marketSubject: string;
  marketType: "moneyline" | "spread" | "total" | "player_prop";
  propType: string | null;
  selection:
    | "home"
    | "away"
    | "over"
    | "under"
    | "player_over"
    | "player_under"
    | "outcome";
  slipId: string;
}

interface SlipLegRow {
  id: string;
  lockedDecimalOdds: number;
  status: LegStatus;
}

interface SlipRow {
  bankrollWeekId: string;
  combinedDecimalOdds: number;
  id: string;
  kind: "single" | "parlay";
  potentialPayoutCents: number;
  stakeCents: number;
  status: "pending" | FinalSlipStatus;
  userId: string;
}

interface SlipFinalization {
  combinedDecimalOdds: number;
  ledgerEntryType: SettlementLedgerEntryType | null;
  notes: string;
  outcome: FinalSlipStatus;
  payoutCents: number;
  potentialPayoutCents: number;
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

function timestamp(deps: BettingSettlementDependencies, inputNow?: Date): Date {
  const now = inputNow ?? deps.now?.() ?? new Date();
  if (!validDate(now)) {
    throw appError("BET_SETTLEMENT_INVALID_DATE", "now must be a valid Date");
  }
  return new Date(now.getTime());
}

function resultPayloadHash(result: EventResult): string {
  return stableContentHash(
    result.sourcePayload ?? {
      awayScore: result.awayScore,
      finalStatus: result.finalStatus,
      homeScore: result.homeScore,
      playerStats: result.playerStats,
      provider: result.provider,
    },
  );
}

function eventContentHash(event: BettingEvent, result: EventResult): string {
  return stableContentHash({
    awayScore: result.awayScore,
    awayTeam: event.awayTeam,
    homeScore: result.homeScore,
    homeTeam: event.homeTeam,
    provider: event.provider,
    providerEventId: event.providerEventId,
    sport: event.sport,
    startTime: event.startTime,
    status: result.finalStatus,
  });
}

function roundDecimalOdds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function payoutFor(
  stakeCents: number,
  legs: readonly Pick<SlipLegRow, "lockedDecimalOdds">[],
): { combinedDecimalOdds: number; potentialPayoutCents: number } {
  const combinedDecimalOdds =
    legs.length === 0
      ? 1
      : roundDecimalOdds(
          legs.reduce((combined, leg) => combined * leg.lockedDecimalOdds, 1),
        );
  return {
    combinedDecimalOdds,
    potentialPayoutCents: Math.round(stakeCents * combinedDecimalOdds),
  };
}

function compare(value: number): -1 | 0 | 1 {
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function scoreDetail(result: EventResult): string {
  return `home ${result.homeScore}, away ${result.awayScore}`;
}

function lineDetail(prefix: string, value: number, line: number): string {
  return `${prefix} ${value} vs line ${line}`;
}

function findPlayerStat(
  stats: readonly ResultsPlayerStat[],
  playerId: string,
  propType: string | null,
): number | null {
  if (!propType) {
    return null;
  }
  const player = stats.find((entry) => entry.playerId === playerId);
  const value = player?.stats[propType];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function gradeFromComparison(
  diff: number,
  wantsOverOrHome: boolean,
): "won" | "lost" | "push" {
  const comparison = compare(diff);
  if (comparison === 0) return "push";
  return comparison > 0 === wantsOverOrHome ? "won" : "lost";
}

function gradePendingLeg(
  leg: PendingLegRow,
  result: EventResult,
): { detail: string; status: Exclude<LegStatus, "pending"> } | null {
  if (result.finalStatus === "postponed" || result.finalStatus === "canceled") {
    return {
      detail: `event ${result.finalStatus}`,
      status: "void",
    };
  }
  if (result.finalStatus !== "final") {
    return null;
  }
  if (result.homeScore === null || result.awayScore === null) {
    return {
      detail: "final result missing score",
      status: "void",
    };
  }

  switch (leg.marketType) {
    case "moneyline": {
      const diff = result.homeScore - result.awayScore;
      if (compare(diff) === 0) {
        return { detail: scoreDetail(result), status: "push" };
      }
      return {
        detail: scoreDetail(result),
        status: gradeFromComparison(diff, leg.selection === "home"),
      };
    }
    case "spread": {
      if (leg.lockedLine === null) {
        return { detail: "spread missing locked line", status: "void" };
      }
      const pickedHome = leg.selection === "home";
      const pickedScore = pickedHome ? result.homeScore : result.awayScore;
      const opponentScore = pickedHome ? result.awayScore : result.homeScore;
      const adjustedMargin = pickedScore + leg.lockedLine - opponentScore;
      return {
        detail: lineDetail(
          pickedHome ? "home adjusted margin" : "away adjusted margin",
          adjustedMargin,
          0,
        ),
        status: gradeFromComparison(adjustedMargin, true),
      };
    }
    case "total": {
      if (leg.lockedLine === null) {
        return { detail: "total missing locked line", status: "void" };
      }
      const total = result.homeScore + result.awayScore;
      return {
        detail: lineDetail("total", total, leg.lockedLine),
        status: gradeFromComparison(
          total - leg.lockedLine,
          leg.selection === "over",
        ),
      };
    }
    case "player_prop": {
      if (leg.lockedLine === null) {
        return { detail: "player prop missing locked line", status: "void" };
      }
      const stat = findPlayerStat(
        result.playerStats,
        leg.marketSubject,
        leg.propType,
      );
      if (stat === null) {
        return { detail: "player prop result missing stat", status: "void" };
      }
      const wantsOver =
        leg.selection === "over" || leg.selection === "player_over";
      return {
        detail: lineDetail(leg.propType ?? "player_stat", stat, leg.lockedLine),
        status: gradeFromComparison(stat - leg.lockedLine, wantsOver),
      };
    }
  }
}

function shouldGradeResult(result: EventResult): boolean {
  return (
    result.finalStatus === "final" ||
    result.finalStatus === "postponed" ||
    result.finalStatus === "canceled"
  );
}

async function lockEventSettlement(
  tx: LeagueScopedTx,
  leagueId: string,
  eventId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`bet-settlement:${leagueId}:${eventId}`}, 0))`,
  );
}

async function loadBettingEvent(
  db: Db,
  bettingEventId: string,
): Promise<BettingEvent | null> {
  const [event] = await db
    .select()
    .from(bettingEvents)
    .where(eq(bettingEvents.id, bettingEventId))
    .limit(1);
  return event ?? null;
}

async function markEventResolved(
  tx: LeagueScopedTx,
  event: BettingEvent,
  result: EventResult,
  now: Date,
): Promise<void> {
  await tx
    .update(bettingEvents)
    .set({
      awayScore: result.awayScore,
      contentHash: eventContentHash(event, result),
      homeScore: result.homeScore,
      lastUpdated: now,
      status: result.finalStatus,
      updatedAt: now,
    })
    .where(eq(bettingEvents.id, event.id));

  await tx
    .update(bettingMarkets)
    .set({
      lastUpdated: now,
      status: result.finalStatus === "final" ? "settled" : "void",
      updatedAt: now,
    })
    .where(eq(bettingMarkets.eventId, event.id));
}

async function loadPendingLegsForEvent(
  tx: LeagueScopedTx,
  input: Pick<SettleBettingEventInput, "leagueId"> & { eventId: string },
): Promise<PendingLegRow[]> {
  return tx
    .select({
      id: betLegs.id,
      lockedDecimalOdds: betLegs.lockedDecimalOdds,
      lockedLine: betLegs.lockedLine,
      marketId: betLegs.marketId,
      marketSubject: bettingMarkets.subject,
      marketType: bettingMarkets.type,
      propType: bettingMarkets.propType,
      selection: betLegs.selection,
      slipId: betLegs.slipId,
    })
    .from(betLegs)
    .innerJoin(bettingMarkets, eq(bettingMarkets.id, betLegs.marketId))
    .where(
      and(
        eq(betLegs.leagueId, input.leagueId),
        eq(betLegs.status, "pending"),
        eq(bettingMarkets.eventId, input.eventId),
      ),
    )
    .orderBy(betLegs.slipId, betLegs.id);
}

async function gradePendingLegs(
  tx: LeagueScopedTx,
  input: Pick<SettleBettingEventInput, "leagueId"> & {
    eventId: string;
    result: EventResult;
    now: Date;
  },
): Promise<{ gradedLegs: number; impactedSlipIds: string[] }> {
  const pendingLegs = await loadPendingLegsForEvent(tx, input);
  const impactedSlipIds = new Set<string>();
  let gradedLegs = 0;

  for (const leg of pendingLegs) {
    const grade = gradePendingLeg(leg, input.result);
    if (!grade) {
      continue;
    }

    const [updated] = await tx
      .update(betLegs)
      .set({
        resultDetail: grade.detail,
        status: grade.status,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(betLegs.id, leg.id),
          eq(betLegs.leagueId, input.leagueId),
          eq(betLegs.status, "pending"),
        ),
      )
      .returning({ slipId: betLegs.slipId });

    if (updated) {
      gradedLegs += 1;
      impactedSlipIds.add(updated.slipId);
    }
  }

  return { gradedLegs, impactedSlipIds: [...impactedSlipIds] };
}

async function loadSlipState(
  tx: LeagueScopedTx,
  input: Pick<SettleBettingEventInput, "leagueId"> & { slipId: string },
): Promise<{ legs: SlipLegRow[]; slip: SlipRow } | null> {
  const [slip] = await tx
    .select({
      bankrollWeekId: betSlips.bankrollWeekId,
      combinedDecimalOdds: betSlips.combinedDecimalOdds,
      id: betSlips.id,
      kind: betSlips.kind,
      potentialPayoutCents: betSlips.potentialPayoutCents,
      stakeCents: betSlips.stakeCents,
      status: betSlips.status,
      userId: betSlips.userId,
    })
    .from(betSlips)
    .where(
      and(eq(betSlips.id, input.slipId), eq(betSlips.leagueId, input.leagueId)),
    )
    .limit(1);
  if (!slip) {
    return null;
  }

  const legs = await tx
    .select({
      id: betLegs.id,
      lockedDecimalOdds: betLegs.lockedDecimalOdds,
      status: betLegs.status,
    })
    .from(betLegs)
    .where(
      and(
        eq(betLegs.leagueId, input.leagueId),
        eq(betLegs.slipId, input.slipId),
      ),
    )
    .orderBy(betLegs.createdAt, betLegs.id);

  return { legs, slip };
}

function finalizationForSlip(
  slip: SlipRow,
  legs: readonly SlipLegRow[],
): SlipFinalization | null {
  if (slip.status !== "pending") {
    return null;
  }
  if (legs.some((leg) => leg.status === "lost")) {
    return {
      combinedDecimalOdds: slip.combinedDecimalOdds,
      ledgerEntryType: null,
      notes: "one or more legs lost",
      outcome: "lost",
      payoutCents: 0,
      potentialPayoutCents: slip.potentialPayoutCents,
    };
  }

  const activeLegs = legs.filter(
    (leg) => leg.status === "pending" || leg.status === "won",
  );
  const droppedLegs = legs.filter(
    (leg) => leg.status === "push" || leg.status === "void",
  );
  if (activeLegs.some((leg) => leg.status === "pending")) {
    return null;
  }

  if (slip.kind === "single") {
    const [leg] = legs;
    if (!leg || leg.status === "pending") {
      return null;
    }
    if (leg.status === "won") {
      return {
        combinedDecimalOdds: slip.combinedDecimalOdds,
        ledgerEntryType: "bet_payout",
        notes: "single won",
        outcome: "won",
        payoutCents: slip.potentialPayoutCents,
        potentialPayoutCents: slip.potentialPayoutCents,
      };
    }
    if (leg.status === "lost") {
      return {
        combinedDecimalOdds: slip.combinedDecimalOdds,
        ledgerEntryType: null,
        notes: "single lost",
        outcome: "lost",
        payoutCents: 0,
        potentialPayoutCents: slip.potentialPayoutCents,
      };
    }
    return {
      combinedDecimalOdds: 1,
      ledgerEntryType: "bet_refund",
      notes: `single ${leg.status}`,
      outcome: leg.status,
      payoutCents: slip.stakeCents,
      potentialPayoutCents: slip.stakeCents,
    };
  }

  if (activeLegs.length === 0) {
    const outcome = legs.some((leg) => leg.status === "void") ? "void" : "push";
    return {
      combinedDecimalOdds: 1,
      ledgerEntryType: "bet_refund",
      notes: `parlay all legs ${outcome}`,
      outcome,
      payoutCents: slip.stakeCents,
      potentialPayoutCents: slip.stakeCents,
    };
  }

  const payout = payoutFor(slip.stakeCents, activeLegs);
  return {
    combinedDecimalOdds: payout.combinedDecimalOdds,
    ledgerEntryType: "bet_payout",
    notes:
      droppedLegs.length > 0
        ? `parlay won with ${droppedLegs.length} pushed or voided leg(s)`
        : "parlay won",
    outcome: droppedLegs.length > 0 ? "partial_void" : "won",
    payoutCents: payout.potentialPayoutCents,
    potentialPayoutCents: payout.potentialPayoutCents,
  };
}

async function repricePendingParlay(
  tx: LeagueScopedTx,
  input: Pick<SettleBettingEventInput, "leagueId"> & {
    legs: readonly SlipLegRow[];
    now: Date;
    slip: SlipRow;
  },
): Promise<boolean> {
  if (input.slip.kind !== "parlay" || input.slip.status !== "pending") {
    return false;
  }
  if (
    !input.legs.some((leg) => leg.status === "push" || leg.status === "void")
  ) {
    return false;
  }
  if (!input.legs.some((leg) => leg.status === "pending")) {
    return false;
  }

  const activeLegs = input.legs.filter(
    (leg) => leg.status === "pending" || leg.status === "won",
  );
  const payout = payoutFor(input.slip.stakeCents, activeLegs);
  await tx
    .update(betSlips)
    .set({
      combinedDecimalOdds: payout.combinedDecimalOdds,
      potentialPayoutCents: payout.potentialPayoutCents,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(betSlips.id, input.slip.id),
        eq(betSlips.leagueId, input.leagueId),
        eq(betSlips.status, "pending"),
      ),
    );
  return true;
}

async function finalizeSlip(
  tx: LeagueScopedTx,
  input: Pick<SettleBettingEventInput, "leagueId"> & {
    finalization: SlipFinalization;
    now: Date;
    payloadHash: string;
    result: EventResult;
    slip: SlipRow;
  },
): Promise<{
  ledgerEntry: BankrollLedgerEntry | null;
  settlement: BetSettlement | null;
}> {
  const [settlement] = await tx
    .insert(betSettlements)
    .values({
      gradedAt: input.now,
      leagueId: input.leagueId,
      metadata: {
        resultProviderStatus: input.result.finalStatus,
      },
      notes: input.finalization.notes,
      outcome: input.finalization.outcome,
      payoutCents: input.finalization.payoutCents,
      resultsPayloadHash: input.payloadHash,
      resultsProvider: input.result.provider,
      slipId: input.slip.id,
    })
    .onConflictDoNothing({ target: betSettlements.slipId })
    .returning();
  if (!settlement) {
    return { ledgerEntry: null, settlement: null };
  }

  const ledgerEntry =
    input.finalization.ledgerEntryType && input.finalization.payoutCents > 0
      ? await appendBankrollLedgerEntryInContext(tx, {
          amountCents: input.finalization.payoutCents,
          bankrollWeekId: input.slip.bankrollWeekId,
          createdAt: input.now,
          entryType: input.finalization.ledgerEntryType,
          leagueId: input.leagueId,
          refSlipId: input.slip.id,
          userId: input.slip.userId,
        })
      : null;

  const [updatedSlip] = await tx
    .update(betSlips)
    .set({
      combinedDecimalOdds: input.finalization.combinedDecimalOdds,
      potentialPayoutCents: input.finalization.potentialPayoutCents,
      settledAt: input.now,
      status: input.finalization.outcome,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(betSlips.id, input.slip.id),
        eq(betSlips.leagueId, input.leagueId),
        eq(betSlips.status, "pending"),
      ),
    )
    .returning({ id: betSlips.id });
  if (!updatedSlip) {
    throw appError(
      "BET_SETTLEMENT_SLIP_UPDATE_FAILED",
      "Bet slip could not be finalized after settlement audit insert",
      500,
    );
  }

  return { ledgerEntry, settlement };
}

async function processImpactedSlips(
  tx: LeagueScopedTx,
  input: Pick<SettleBettingEventInput, "leagueId"> & {
    now: Date;
    payloadHash: string;
    result: EventResult;
    slipIds: readonly string[];
  },
): Promise<{
  finalizedSlips: number;
  ledgerEntries: BankrollLedgerEntry[];
  repricedSlips: number;
  settlements: BetSettlement[];
}> {
  let finalizedSlips = 0;
  let repricedSlips = 0;
  const ledgerEntries: BankrollLedgerEntry[] = [];
  const settlements: BetSettlement[] = [];

  for (const slipId of input.slipIds) {
    const state = await loadSlipState(tx, { ...input, slipId });
    if (!state || state.slip.status !== "pending") {
      continue;
    }

    const finalization = finalizationForSlip(state.slip, state.legs);
    if (!finalization) {
      const repriced = await repricePendingParlay(tx, {
        legs: state.legs,
        leagueId: input.leagueId,
        now: input.now,
        slip: state.slip,
      });
      if (repriced) {
        repricedSlips += 1;
      }
      continue;
    }

    const finalized = await finalizeSlip(tx, {
      finalization,
      leagueId: input.leagueId,
      now: input.now,
      payloadHash: input.payloadHash,
      result: input.result,
      slip: state.slip,
    });
    if (finalized.settlement) {
      finalizedSlips += 1;
      settlements.push(finalized.settlement);
    }
    if (finalized.ledgerEntry) {
      ledgerEntries.push(finalized.ledgerEntry);
    }
  }

  return { finalizedSlips, ledgerEntries, repricedSlips, settlements };
}

export async function settleBettingEvent({
  deps,
  input,
}: {
  deps: BettingSettlementDependencies;
  input: SettleBettingEventInput;
}): Promise<SettleBettingEventResult> {
  const now = timestamp(deps, input.now);
  const event = await loadBettingEvent(deps.db, input.bettingEventId);
  if (!event) {
    return {
      bettingEventId: input.bettingEventId,
      finalizedSlips: 0,
      gradedLegs: 0,
      leagueId: input.leagueId,
      ledgerEntries: [],
      repricedSlips: 0,
      settlements: [],
      skippedReason: "event_not_found",
    };
  }

  const result = await deps.resultsProvider.getEventResult({
    event: {
      awayTeam: event.awayTeam,
      homeTeam: event.homeTeam,
      id: event.id,
      provider: event.provider,
      providerEventId: event.providerEventId,
      sport: event.sport,
      startTime: event.startTime,
    },
    now,
  });

  if (!shouldGradeResult(result)) {
    return {
      bettingEventId: event.id,
      finalizedSlips: 0,
      gradedLegs: 0,
      leagueId: input.leagueId,
      ledgerEntries: [],
      repricedSlips: 0,
      settlements: [],
      skippedReason: "result_not_final",
    };
  }

  const payloadHash = resultPayloadHash(result);
  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    await lockEventSettlement(tx, input.leagueId, event.id);
    await markEventResolved(tx, event, result, now);

    const graded = await gradePendingLegs(tx, {
      eventId: event.id,
      leagueId: input.leagueId,
      now,
      result,
    });
    const processed = await processImpactedSlips(tx, {
      leagueId: input.leagueId,
      now,
      payloadHash,
      result,
      slipIds: graded.impactedSlipIds,
    });

    return {
      bettingEventId: event.id,
      finalizedSlips: processed.finalizedSlips,
      gradedLegs: graded.gradedLegs,
      leagueId: input.leagueId,
      ledgerEntries: processed.ledgerEntries,
      repricedSlips: processed.repricedSlips,
      settlements: processed.settlements,
      skippedReason: null,
    };
  });
}
