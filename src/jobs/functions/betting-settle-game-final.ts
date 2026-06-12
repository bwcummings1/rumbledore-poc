import { NonRetriableError } from "inngest";
import { z } from "zod";
import { rebuildAllArenaStandings } from "@/betting/arena";
import { createBettingSettlementDependencies } from "@/betting/dependencies";
import {
  type BettingSettlementDependencies,
  type SettleBettingEventResult,
  settleBettingEvent,
} from "@/betting/settlement";
import { logger } from "@/core/logging";
import { AppError } from "@/core/result";
import { createPushNotifier, PUSH_EVENTS, type PushNotifier } from "@/push";
import { inngest } from "../client";
import { type GameFinalData, JOB_EVENTS } from "../events";

export type BettingSettleGameFinalResponse = Omit<
  SettleBettingEventResult,
  "ledgerEntries" | "settlements"
> & {
  eventName: typeof JOB_EVENTS.gameFinal;
  ledgerEntryIds: string[];
  ok: true;
  settlementIds: string[];
};

export interface BettingSettleGameFinalDependencies
  extends BettingSettlementDependencies {
  push: PushNotifier;
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
  };
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
  if (result.finalizedSlips > 0) {
    await rebuildAllArenaStandings(deps.db);
    try {
      await deps.push.notifyLeague({
        body: `${result.finalizedSlips} betting slip${
          result.finalizedSlips === 1 ? "" : "s"
        } settled for this league.`,
        leagueId: result.leagueId,
        tag: `league:${result.leagueId}:betting:${result.bettingEventId}`,
        title: "Betting results are in",
        type: PUSH_EVENTS.leagueBetSettled,
        url: `/leagues/${result.leagueId}`,
      });
    } catch (error) {
      logger.warn("Push betting settlement notification failed", {
        bettingEventId: result.bettingEventId,
        error,
        leagueId: result.leagueId,
      });
    }
  }

  return {
    bettingEventId: result.bettingEventId,
    eventName: JOB_EVENTS.gameFinal,
    finalizedSlips: result.finalizedSlips,
    gradedLegs: result.gradedLegs,
    leagueId: result.leagueId,
    ledgerEntryIds: result.ledgerEntries.map((entry) => entry.id),
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
    async ({ event, step }): Promise<BettingSettleGameFinalResponse> => {
      const deps = await resolveDeps();
      return step.run("settle-betting-event", () =>
        runBettingSettleGameFinal({ data: event.data, deps }),
      );
    },
  );
}

export const bettingSettleGameFinal = createBettingSettleGameFinalFunction();
