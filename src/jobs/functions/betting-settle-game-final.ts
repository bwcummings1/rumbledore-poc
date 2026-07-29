import { and, desc, eq, inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import {
  extractArenaStandingSwingSignals,
  findArenaSeasonIdsForWeekStarts,
  rebuildAllArenaStandings,
} from "@/betting/arena";
import { createBettingSettlementDependencies } from "@/betting/dependencies";
import {
  gradePicksForEvent,
  loadGradableEvent,
} from "@/betting/pickem-grading";
import {
  type BettingSettlementDependencies,
  type SettleBettingEventResult,
  settleBettingEvent,
} from "@/betting/settlement";
import { logger } from "@/core/logging";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { bankrollLedger, bankrollWeeks, betSlips, members } from "@/db/schema";
import { createPushNotifier, PUSH_EVENTS, type PushNotifier } from "@/push";
import {
  type ArenaLeaderboardUpdatedPayload,
  type ArenaStandingsSwingPayload,
  createRealtimePublisher,
  type LeagueLeaderboardUpdatedPayload,
  REALTIME_EVENTS,
  type RealtimePublisher,
} from "@/realtime";
import { inngest } from "../client";
import {
  type ArenaStandingsSwingData,
  type BetSettledData,
  type GameFinalData,
  JOB_EVENTS,
} from "../events";

interface PlannedBetSettledEvent {
  id: string;
  name: typeof JOB_EVENTS.betSettled;
  data: BetSettledData;
}

interface PlannedArenaStandingsSwingEvent {
  id: string;
  name: typeof JOB_EVENTS.arenaStandingsSwing;
  data: ArenaStandingsSwingData;
}

export type BettingSettleGameFinalResponse = Omit<
  SettleBettingEventResult,
  "eventResult" | "ledgerEntries" | "settlements"
> & {
  /** Pick 'em outcomes written for this event. */
  gradedPicks: { correct: number; incorrect: number; void: number };
  arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[];
  arenaRecapEvents: PlannedArenaStandingsSwingEvent[];
  arenaSwingSignals: ArenaStandingsSwingPayload[];
  betSettledEvents: PlannedBetSettledEvent[];
  eventName: typeof JOB_EVENTS.gameFinal;
  ledgerEntryIds: string[];
  leagueLeaderboardUpdates: LeagueLeaderboardUpdatedPayload[];
  ok: true;
  settlementIds: string[];
};

export interface BettingSettleGameFinalDependencies
  extends BettingSettlementDependencies {
  push: PushNotifier;
  realtime: RealtimePublisher;
}

interface SettlementNotificationDetail {
  bankrollWeekId: string;
  kind: "parlay" | "single";
  outcome: SettleBettingEventResult["settlements"][number]["outcome"];
  payoutCents: number;
  runningBalanceCents: number | null;
  settlementId: string;
  slipId: string;
  stakeCents: number;
  userId: string;
  weekStart: Date;
}

const gameFinalDataSchema = z.object({
  bettingEventId: z.uuid().optional(),
  gameId: z.uuid(),
  leagueId: z.uuid(),
  milestoneKeys: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  sourceContentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseGameFinalData(data: unknown): GameFinalData {
  const parsed = gameFinalDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "GAME_FINAL_INVALID",
        message: "Game final payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultBettingSettleGameFinalDependencies(): Promise<BettingSettleGameFinalDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  const db = getDb();
  const env = getEnv();
  return {
    ...createBettingSettlementDependencies(db, env),
    push: createPushNotifier(db, env),
    realtime: createRealtimePublisher(env),
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Takes only the settlement fields it reads, rather than the whole
 * `SettleBettingEventResult`. The caller passes facts that have crossed a
 * `step.run` boundary and been through JSON, so the rich row type (with its
 * Date fields) is no longer available -- and was never needed here.
 */
async function loadSettlementNotificationDetails(
  db: Db,
  input: {
    leagueId: string;
    settlements: readonly {
      id: string;
      outcome: SettleBettingEventResult["settlements"][number]["outcome"];
      payoutCents: number;
      slipId: string;
    }[];
  },
): Promise<SettlementNotificationDetail[]> {
  const slipIds = input.settlements.map((settlement) => settlement.slipId);
  if (slipIds.length === 0) {
    return [];
  }

  return withLeagueContext(db, input.leagueId, async (tx) => {
    const slipRows = await tx
      .select({
        bankrollWeekId: betSlips.bankrollWeekId,
        id: betSlips.id,
        kind: betSlips.kind,
        stakeCents: betSlips.stakeCents,
        userId: betSlips.userId,
        weekStart: bankrollWeeks.weekStart,
      })
      .from(betSlips)
      .innerJoin(
        bankrollWeeks,
        and(
          eq(bankrollWeeks.id, betSlips.bankrollWeekId),
          eq(bankrollWeeks.leagueId, betSlips.leagueId),
          eq(bankrollWeeks.userId, betSlips.userId),
        ),
      )
      .where(
        and(
          eq(betSlips.leagueId, input.leagueId),
          inArray(betSlips.id, slipIds),
        ),
      );
    const slipsById = new Map(slipRows.map((row) => [row.id, row]));
    const details: SettlementNotificationDetail[] = [];

    for (const settlement of input.settlements) {
      const slip = slipsById.get(settlement.slipId);
      if (!slip) {
        logger.warn("Bet settlement notification skipped missing slip", {
          leagueId: input.leagueId,
          settlementId: settlement.id,
          slipId: settlement.slipId,
        });
        continue;
      }
      const { bankrollWeekId, kind, stakeCents, userId } = slip;

      const [latestLedgerEntry] = await tx
        .select({
          runningBalanceCents: bankrollLedger.runningBalanceCents,
        })
        .from(bankrollLedger)
        .where(
          and(
            eq(bankrollLedger.leagueId, input.leagueId),
            eq(bankrollLedger.userId, userId),
            eq(bankrollLedger.bankrollWeekId, bankrollWeekId),
          ),
        )
        .orderBy(desc(bankrollLedger.seq))
        .limit(1);

      details.push({
        bankrollWeekId,
        kind,
        outcome: settlement.outcome,
        payoutCents: settlement.payoutCents,
        runningBalanceCents: latestLedgerEntry?.runningBalanceCents ?? null,
        settlementId: settlement.id,
        slipId: settlement.slipId,
        stakeCents,
        userId,
        weekStart: slip.weekStart,
      });
    }

    return details;
  });
}

function settlementPushTitle(
  outcome: SettlementNotificationDetail["outcome"],
): string {
  switch (outcome) {
    case "won":
    case "partial_void":
      return "Bet won";
    case "lost":
      return "Bet lost";
    case "push":
      return "Bet pushed";
    case "void":
      return "Bet voided";
  }
}

function settlementPushBody(detail: SettlementNotificationDetail): string {
  const balance =
    detail.runningBalanceCents === null
      ? ""
      : ` Bankroll now ${formatCurrency(detail.runningBalanceCents)}.`;
  const slipKind = detail.kind === "parlay" ? "parlay" : "single";

  switch (detail.outcome) {
    case "won":
      return `Won ${formatCurrency(detail.payoutCents)} on a ${slipKind}.${balance}`;
    case "partial_void":
      return `Won ${formatCurrency(detail.payoutCents)} after a pushed or voided leg.${balance}`;
    case "lost":
      return `Lost ${formatCurrency(detail.stakeCents)} on a ${slipKind}.${balance}`;
    case "push":
      return `Pushed for a ${formatCurrency(detail.payoutCents)} refund.${balance}`;
    case "void":
      return `Voided for a ${formatCurrency(detail.payoutCents)} refund.${balance}`;
  }
}

async function sendSettlementPushNotifications({
  deps,
  details,
  leagueId,
}: {
  deps: BettingSettleGameFinalDependencies;
  details: readonly SettlementNotificationDetail[];
  leagueId: string;
}): Promise<void> {
  for (const detail of details) {
    try {
      await deps.push.notifyLeague({
        body: settlementPushBody(detail),
        leagueId,
        tag: `league:${leagueId}:betting:${detail.slipId}`,
        title: settlementPushTitle(detail.outcome),
        type: PUSH_EVENTS.leagueBetSettled,
        url: `/leagues/${leagueId}/bet?slip=${detail.slipId}&settlement=${detail.settlementId}`,
        userIds: [detail.userId],
      });
    } catch (error) {
      logger.warn("Push betting settlement notification failed", {
        error,
        leagueId,
        settlementId: detail.settlementId,
        slipId: detail.slipId,
      });
    }
  }
}

async function publishSettlementRealtimeSignals({
  arenaResults,
  at,
  deps,
  details,
  leagueId,
}: {
  arenaResults: Awaited<ReturnType<typeof rebuildAllArenaStandings>>;
  at: string;
  deps: BettingSettleGameFinalDependencies;
  details: readonly SettlementNotificationDetail[];
  leagueId: string;
}): Promise<{
  arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[];
  arenaSwingSignals: ArenaStandingsSwingPayload[];
  leagueLeaderboardUpdates: LeagueLeaderboardUpdatedPayload[];
}> {
  const leagueLeaderboardUpdates: LeagueLeaderboardUpdatedPayload[] =
    uniqueValues(details.map((detail) => detail.bankrollWeekId)).map(
      (bankrollWeekId) => ({
        at,
        bankrollWeekId,
        leagueId,
        type: REALTIME_EVENTS.leagueLeaderboardUpdated,
        v: 1,
      }),
    );
  if (leagueLeaderboardUpdates.length === 0) {
    leagueLeaderboardUpdates.push({
      at,
      bankrollWeekId: null,
      leagueId,
      type: REALTIME_EVENTS.leagueLeaderboardUpdated,
      v: 1,
    });
  }

  const arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[] =
    arenaResults.map((arenaResult) => ({
      at,
      seasonId: arenaResult.season?.id ?? null,
      type: REALTIME_EVENTS.arenaLeaderboardUpdated,
      v: 1,
    }));

  const arenaSwingSignals: ArenaStandingsSwingPayload[] = [];
  for (const arenaResult of arenaResults) {
    if (!arenaResult.season || !arenaResult.computedAt) {
      continue;
    }
    const swings = extractArenaStandingSwingSignals(arenaResult);
    if (swings.length === 0) {
      continue;
    }
    arenaSwingSignals.push({
      at,
      computedAt: arenaResult.computedAt,
      seasonId: arenaResult.season.id,
      swings: swings.map((swing) => ({
        accuracyBps: swing.accuracyBps,
        kind: swing.kind,
        leagueId: swing.leagueId,
        newRank: swing.newRank,
        oldRank: swing.oldRank,
        rankDelta: swing.rankDelta,
        subjectId: swing.subjectId,
        userId: swing.userId,
      })),
      type: REALTIME_EVENTS.arenaStandingsSwing,
      v: 1,
    });
  }

  try {
    for (const payload of leagueLeaderboardUpdates) {
      await deps.realtime.publishLeagueLeaderboardUpdated(payload);
    }
    for (const payload of arenaLeaderboardUpdates) {
      await deps.realtime.publishArenaLeaderboardUpdated(payload);
    }
    for (const payload of arenaSwingSignals) {
      await deps.realtime.publishArenaStandingsSwing(payload);
    }
  } catch (error) {
    logger.warn("Realtime betting settlement signal failed", {
      error,
      leagueId,
    });
  }

  return {
    arenaLeaderboardUpdates,
    arenaSwingSignals,
    leagueLeaderboardUpdates,
  };
}

async function loadLeagueIdsByUser(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, string[]>> {
  const uniqueUserIds = uniqueValues(userIds);
  if (uniqueUserIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      leagueId: members.organizationId,
      userId: members.userId,
    })
    .from(members)
    .where(inArray(members.userId, uniqueUserIds));
  const byUser = new Map<string, string[]>();
  for (const row of rows) {
    const existing = byUser.get(row.userId) ?? [];
    existing.push(row.leagueId);
    byUser.set(row.userId, existing);
  }
  return byUser;
}

async function sendArenaRivalPassedPushNotifications({
  arenaSwingSignals,
  deps,
}: {
  arenaSwingSignals: readonly ArenaStandingsSwingPayload[];
  deps: BettingSettleGameFinalDependencies;
}): Promise<void> {
  const passedByUser = new Map<
    string,
    { newRank: number; oldRank: number; seasonId: string }
  >();
  for (const payload of arenaSwingSignals) {
    for (const swing of payload.swings) {
      if (
        swing.kind !== "individual" ||
        !swing.userId ||
        swing.rankDelta >= 0
      ) {
        continue;
      }
      const existing = passedByUser.get(swing.userId);
      if (
        existing &&
        Math.abs(existing.oldRank - existing.newRank) >=
          Math.abs(swing.oldRank - swing.newRank)
      ) {
        continue;
      }
      passedByUser.set(swing.userId, {
        newRank: swing.newRank,
        oldRank: swing.oldRank,
        seasonId: payload.seasonId,
      });
    }
  }

  const leagueIdsByUser = await loadLeagueIdsByUser(deps.db, [
    ...passedByUser.keys(),
  ]);
  for (const [userId, passed] of passedByUser) {
    for (const leagueId of leagueIdsByUser.get(userId) ?? []) {
      try {
        await deps.push.notifyLeague({
          body: `A rival just passed you in the arena. You fell from ${passed.oldRank} to ${passed.newRank}.`,
          leagueId,
          tag: `arena:${passed.seasonId}:rival-passed:${userId}`,
          title: "Arena rank changed",
          type: PUSH_EVENTS.arenaRivalPassed,
          url: `/arena?season=${passed.seasonId}`,
          userIds: [userId],
        });
      } catch (error) {
        logger.warn("Push arena rival-passed notification failed", {
          error,
          leagueId,
          seasonId: passed.seasonId,
          userId,
        });
      }
    }
  }
}

function planArenaSwingContentEvents({
  arenaSwingSignals,
  leagueId,
  settlementIds,
}: {
  arenaSwingSignals: readonly ArenaStandingsSwingPayload[];
  leagueId: string;
  settlementIds: readonly string[];
}): PlannedArenaStandingsSwingEvent[] {
  if (arenaSwingSignals.length === 0 || settlementIds.length === 0) {
    return [];
  }

  const seasonIds = uniqueValues(
    arenaSwingSignals.map((payload) => payload.seasonId),
  );
  const movedLeagueIds = uniqueValues(
    arenaSwingSignals.flatMap((payload) =>
      payload.swings.flatMap((swing) =>
        swing.kind === "league" && swing.leagueId ? [swing.leagueId] : [],
      ),
    ),
  );
  const targetLeagueIds = uniqueValues([leagueId, ...movedLeagueIds]);
  const settlementKey = [...settlementIds].sort().join(",");

  return seasonIds.flatMap((seasonId) =>
    targetLeagueIds.map((targetLeagueId) => {
      const swingKey = `settlement:${settlementKey}:${targetLeagueId}`;
      return {
        data: {
          leagueId: targetLeagueId,
          seasonId,
          swingKey,
        },
        id: `${JOB_EVENTS.arenaStandingsSwing}:${targetLeagueId}:${seasonId}:${swingKey}`,
        name: JOB_EVENTS.arenaStandingsSwing,
      };
    }),
  );
}

/**
 * What settlement and grading changed, in a shape Inngest can memoize.
 *
 * This crosses a `step.run` boundary, so it must survive JSON — ids, numbers
 * and strings only, no Dates and no class instances.
 */
export interface GameFinalSettlementFacts {
  bettingEventId: string;
  finalizedSlips: number;
  gradedLegs: number;
  gradedPicks: { correct: number; incorrect: number; void: number };
  /** Leagues whose arena standings are now stale. */
  pickAffectedLeagueIds: string[];
  leagueId: string;
  ledgerEntryIds: string[];
  repricedSlips: number;
  settlements: {
    id: string;
    outcome: SettleBettingEventResult["settlements"][number]["outcome"];
    payoutCents: number;
    slipId: string;
  }[];
  skippedReason: SettleBettingEventResult["skippedReason"];
}

/**
 * Step 1: the database writes. Settles slips, grades picks.
 *
 * Both halves are idempotent, which is exactly why this is a step of its own —
 * see `publishGameFinalEffects`.
 */
export async function settleGameFinalFacts({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: BettingSettleGameFinalDependencies;
}): Promise<GameFinalSettlementFacts> {
  const data = parseGameFinalData(rawData);
  const result = await settleBettingEvent({
    deps,
    input: {
      bettingEventId: data.bettingEventId ?? data.gameId,
      leagueId: data.leagueId,
    },
  });
  // Grade Pick 'em entries for the same event. This is a separate engine that
  // happens to be triggered by the same signal: bet slips belong to the
  // bankroll being removed, picks are what the arena now ranks on. It reuses
  // the result settlement already fetched rather than paying for a second
  // provider call that could disagree.
  const pickGrading = result.eventResult
    ? await gradePicksForEvent(deps.db, {
        bettingEventId: result.bettingEventId,
        result: result.eventResult,
      })
    : { affectedLeagueIds: [], correct: 0, incorrect: 0, void: 0 };

  return {
    bettingEventId: result.bettingEventId,
    finalizedSlips: result.finalizedSlips,
    gradedLegs: result.gradedLegs,
    gradedPicks: {
      correct: pickGrading.correct,
      incorrect: pickGrading.incorrect,
      void: pickGrading.void,
    },
    leagueId: result.leagueId,
    ledgerEntryIds: result.ledgerEntries.map((entry) => entry.id),
    pickAffectedLeagueIds: [...pickGrading.affectedLeagueIds],
    repricedSlips: result.repricedSlips,
    settlements: result.settlements.map((settlement) => ({
      id: settlement.id,
      outcome: settlement.outcome,
      payoutCents: settlement.payoutCents,
      slipId: settlement.slipId,
    })),
    skippedReason: result.skippedReason,
  };
}

/**
 * Step 2: everything the settlement should CAUSE — arena rebuild, realtime
 * signals, push notifications.
 *
 * ## Why this is a separate step (UIX-106)
 *
 * Settling and grading are both idempotent: a second pass over the same event
 * finds nothing left to do and reports `finalizedSlips: 0`, no graded picks,
 * and an empty `settlements` array. When all of this lived in ONE `step.run`,
 * any throw down here — a push provider hiccup, a realtime timeout — re-ran
 * the whole step. The retry re-settled nothing, saw zero counters, skipped the
 * notification block entirely, and returned SUCCESSFULLY. The database was
 * correct and every downstream effect was silently dropped: no push, no
 * realtime update, no arena recap. A silent loss, with a green run to match.
 *
 * Split in two, a failure here retries only this step, and Inngest replays step
 * 1's memoized facts — so the settlement ids that name the work are still
 * there on the second attempt, instead of being recomputed as an empty list.
 *
 * Delivery is therefore at-least-once, not exactly-once: if this step throws
 * after some pushes have gone out, the retry re-sends those. That is the
 * correct trade — a duplicate notification is a nuisance, a dropped one is a
 * user who never learns their bet settled.
 */
export async function publishGameFinalEffects({
  deps,
  facts,
}: {
  deps: BettingSettleGameFinalDependencies;
  facts: GameFinalSettlementFacts;
}): Promise<{
  arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[];
  arenaRecapEvents: PlannedArenaStandingsSwingEvent[];
  arenaSwingSignals: ArenaStandingsSwingPayload[];
  leagueLeaderboardUpdates: LeagueLeaderboardUpdatedPayload[];
}> {
  const empty = {
    arenaLeaderboardUpdates: [] as ArenaLeaderboardUpdatedPayload[],
    arenaRecapEvents: [] as PlannedArenaStandingsSwingEvent[],
    arenaSwingSignals: [] as ArenaStandingsSwingPayload[],
    leagueLeaderboardUpdates: [] as LeagueLeaderboardUpdatedPayload[],
  };

  // Either engine can move the board, and they move it for different reasons:
  // settled slips still drive the league bankroll leaderboard, while graded
  // picks are what the ARENA now ranks on. Gating on `finalizedSlips > 0`
  // alone would leave the arena stale after a game that graded picks but
  // settled no slips.
  const gradedAnyPicks = facts.pickAffectedLeagueIds.length > 0;
  if (facts.finalizedSlips === 0 && !gradedAnyPicks) {
    return empty;
  }

  const details = await loadSettlementNotificationDetails(deps.db, {
    leagueId: facts.leagueId,
    settlements: facts.settlements,
  });
  // Bankroll weeks locate the season for slips; the event's own kickoff
  // locates it for picks, which have no bankroll week to point at.
  const event = await loadGradableEvent(deps.db, facts.bettingEventId);
  const weekStarts = [
    ...details.map((detail) => detail.weekStart),
    ...(gradedAnyPicks && event ? [event.startTime] : []),
  ];
  const arenaSeasonIds = await findArenaSeasonIdsForWeekStarts(deps.db, {
    weekStarts,
  });
  const arenaResults = await rebuildAllArenaStandings(deps.db, {
    seasonIds: arenaSeasonIds,
  });
  const realtimeUpdates = await publishSettlementRealtimeSignals({
    arenaResults,
    at: new Date().toISOString(),
    deps,
    details,
    leagueId: facts.leagueId,
  });
  const arenaRecapEvents = planArenaSwingContentEvents({
    arenaSwingSignals: realtimeUpdates.arenaSwingSignals,
    leagueId: facts.leagueId,
    settlementIds: facts.settlements.map((settlement) => settlement.id),
  });
  await sendArenaRivalPassedPushNotifications({
    arenaSwingSignals: realtimeUpdates.arenaSwingSignals,
    deps,
  });
  await sendSettlementPushNotifications({
    deps,
    details,
    leagueId: facts.leagueId,
  });

  return { ...realtimeUpdates, arenaRecapEvents };
}

function betSettledEventsFor(
  facts: GameFinalSettlementFacts,
): PlannedBetSettledEvent[] {
  return facts.settlements.map((settlement) => ({
    data: {
      bettingEventId: facts.bettingEventId,
      leagueId: facts.leagueId,
      settlementId: settlement.id,
      slipId: settlement.slipId,
    },
    id: `${JOB_EVENTS.betSettled}:${facts.leagueId}:${settlement.id}`,
    name: JOB_EVENTS.betSettled,
  }));
}

export async function runBettingSettleGameFinal({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: BettingSettleGameFinalDependencies;
}): Promise<BettingSettleGameFinalResponse> {
  const facts = await settleGameFinalFacts({ data: rawData, deps });
  const effects = await publishGameFinalEffects({ deps, facts });

  return {
    ...effects,
    betSettledEvents: betSettledEventsFor(facts),
    bettingEventId: facts.bettingEventId,
    eventName: JOB_EVENTS.gameFinal,
    finalizedSlips: facts.finalizedSlips,
    gradedLegs: facts.gradedLegs,
    gradedPicks: facts.gradedPicks,
    leagueId: facts.leagueId,
    ledgerEntryIds: facts.ledgerEntryIds,
    ok: true,
    repricedSlips: facts.repricedSlips,
    settlementIds: facts.settlements.map((settlement) => settlement.id),
    skippedReason: facts.skippedReason,
  };
}

export function createBettingSettleGameFinalFunction(
  resolveDeps: () =>
    | BettingSettleGameFinalDependencies
    | Promise<BettingSettleGameFinalDependencies> = getDefaultBettingSettleGameFinalDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Settles pending paper-betting slips when an NFL betting event becomes final.",
      id: "betting-settle-game-final",
      idempotency:
        "event.data.leagueId + ':' + (event.data.bettingEventId || event.data.gameId)",
      name: "Betting game-final settlement",
      triggers: [{ event: JOB_EVENTS.gameFinal }],
    },
    async ({ event, step }): Promise<BettingSettleGameFinalResponse> =>
      recordJobRun("betting-settle-game-final", async () => {
        const deps = await resolveDeps();
        // TWO steps, deliberately. Collapsing them back into one re-introduces
        // UIX-106: a throw during the fan-out would re-run settlement, which
        // is idempotent, so the retry would find nothing to settle and skip
        // every downstream effect while reporting success. See
        // `publishGameFinalEffects`.
        const facts = await step.run("settle-betting-event", () =>
          settleGameFinalFacts({ data: event.data, deps }),
        );
        const effects = await step.run("publish-settlement-effects", () =>
          publishGameFinalEffects({ deps, facts }),
        );
        const result: BettingSettleGameFinalResponse = {
          ...effects,
          betSettledEvents: betSettledEventsFor(facts),
          bettingEventId: facts.bettingEventId,
          eventName: JOB_EVENTS.gameFinal,
          finalizedSlips: facts.finalizedSlips,
          gradedLegs: facts.gradedLegs,
          gradedPicks: facts.gradedPicks,
          leagueId: facts.leagueId,
          ledgerEntryIds: facts.ledgerEntryIds,
          ok: true,
          repricedSlips: facts.repricedSlips,
          settlementIds: facts.settlements.map((settlement) => settlement.id),
          skippedReason: facts.skippedReason,
        };
        if (result.betSettledEvents.length > 0) {
          await step.sendEvent(
            "send-bet-settled-events",
            result.betSettledEvents,
          );
        }
        if (result.arenaRecapEvents.length > 0) {
          await step.sendEvent(
            "send-arena-swing-content-events",
            result.arenaRecapEvents,
          );
        }
        return result;
      }),
  );
}

export const bettingSettleGameFinal = createBettingSettleGameFinalFunction();
