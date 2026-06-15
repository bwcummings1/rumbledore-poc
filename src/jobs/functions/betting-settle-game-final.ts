import { and, desc, eq, inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import {
  extractArenaStandingSwingSignals,
  rebuildAllArenaStandings,
} from "@/betting/arena";
import { createBettingSettlementDependencies } from "@/betting/dependencies";
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
import { bankrollLedger, betSlips } from "@/db/schema";
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
  "ledgerEntries" | "settlements"
> & {
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
}

const gameFinalDataSchema = z.object({
  bettingEventId: z.uuid().optional(),
  gameId: z.uuid(),
  leagueId: z.uuid(),
  milestoneKeys: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
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

async function loadSettlementNotificationDetails(
  db: Db,
  input: Pick<SettleBettingEventResult, "leagueId" | "settlements">,
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
      })
      .from(betSlips)
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
        kind: swing.kind,
        leagueId: swing.leagueId,
        netPnlCents: swing.netPnlCents,
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

export async function runBettingSettleGameFinal({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: BettingSettleGameFinalDependencies;
}): Promise<BettingSettleGameFinalResponse> {
  const data = parseGameFinalData(rawData);
  const result = await settleBettingEvent({
    deps,
    input: {
      bettingEventId: data.bettingEventId ?? data.gameId,
      leagueId: data.leagueId,
    },
  });
  let arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[] = [];
  let arenaRecapEvents: PlannedArenaStandingsSwingEvent[] = [];
  let arenaSwingSignals: ArenaStandingsSwingPayload[] = [];
  let leagueLeaderboardUpdates: LeagueLeaderboardUpdatedPayload[] = [];

  if (result.finalizedSlips > 0) {
    const details = await loadSettlementNotificationDetails(deps.db, result);
    const arenaResults = await rebuildAllArenaStandings(deps.db);
    const realtimeUpdates = await publishSettlementRealtimeSignals({
      arenaResults,
      at: new Date().toISOString(),
      deps,
      details,
      leagueId: result.leagueId,
    });
    arenaLeaderboardUpdates = realtimeUpdates.arenaLeaderboardUpdates;
    arenaSwingSignals = realtimeUpdates.arenaSwingSignals;
    leagueLeaderboardUpdates = realtimeUpdates.leagueLeaderboardUpdates;
    arenaRecapEvents = planArenaSwingContentEvents({
      arenaSwingSignals,
      leagueId: result.leagueId,
      settlementIds: result.settlements.map((settlement) => settlement.id),
    });
    await sendSettlementPushNotifications({
      deps,
      details,
      leagueId: result.leagueId,
    });
  }

  const betSettledEvents = result.settlements.map((settlement) => ({
    data: {
      bettingEventId: result.bettingEventId,
      leagueId: result.leagueId,
      settlementId: settlement.id,
      slipId: settlement.slipId,
    },
    id: `${JOB_EVENTS.betSettled}:${result.leagueId}:${settlement.id}`,
    name: JOB_EVENTS.betSettled,
  }));

  return {
    arenaLeaderboardUpdates,
    arenaRecapEvents,
    arenaSwingSignals,
    betSettledEvents,
    bettingEventId: result.bettingEventId,
    eventName: JOB_EVENTS.gameFinal,
    finalizedSlips: result.finalizedSlips,
    gradedLegs: result.gradedLegs,
    leagueId: result.leagueId,
    ledgerEntryIds: result.ledgerEntries.map((entry) => entry.id),
    leagueLeaderboardUpdates,
    ok: true,
    repricedSlips: result.repricedSlips,
    settlementIds: result.settlements.map((settlement) => settlement.id),
    skippedReason: result.skippedReason,
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
        const result = await step.run("settle-betting-event", () =>
          runBettingSettleGameFinal({ data: event.data, deps }),
        );
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
