import { inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import {
  extractArenaStandingSwingSignals,
  findArenaSeasonIdsForWeekStarts,
  rebuildAllArenaStandings,
} from "@/betting/arena";
import { createResolveBettingEventDependencies } from "@/betting/dependencies";
import {
  type ResolveBettingEventDependencies,
  resolveBettingEvent,
} from "@/betting/event-resolution";
import { gradePicksForEvent } from "@/betting/pickem-grading";
import { logger } from "@/core/logging";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { members } from "@/db/schema";
import { createPushNotifier, PUSH_EVENTS, type PushNotifier } from "@/push";
import {
  type ArenaLeaderboardUpdatedPayload,
  type ArenaStandingsSwingPayload,
  createRealtimePublisher,
  REALTIME_EVENTS,
  type RealtimePublisher,
} from "@/realtime";
import { inngest } from "../client";
import {
  type ArenaStandingsSwingData,
  type BettingEventFinalData,
  JOB_EVENTS,
  type PicksGradedData,
} from "../events";

/**
 * `game.final` consumer: resolve the event, grade Pick 'em entries, rebuild
 * the arena, fan out.
 *
 * Replaces `betting-settle-game-final`. That job settled paper bet slips
 * against a bankroll; the bankroll is gone (T-011) and the arena ranks on pick
 * accuracy instead. What survived the deletion is the half that was never
 * about money: marking the game final, grading what people picked, and
 * telling everyone the standings moved.
 */

interface PlannedArenaStandingsSwingEvent {
  id: string;
  name: typeof JOB_EVENTS.arenaStandingsSwing;
  data: ArenaStandingsSwingData;
}

interface PlannedPicksGradedEvent {
  id: string;
  name: typeof JOB_EVENTS.picksGraded;
  data: PicksGradedData;
}

export interface BettingGradeGameFinalDependencies
  extends ResolveBettingEventDependencies {
  push: PushNotifier;
  realtime: RealtimePublisher;
}

export interface BettingGradeGameFinalResponse {
  arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[];
  arenaRecapEvents: PlannedArenaStandingsSwingEvent[];
  arenaSwingSignals: ArenaStandingsSwingPayload[];
  bettingEventId: string;
  eventName: typeof JOB_EVENTS.bettingEventFinal;
  gradedPicks: { correct: number; incorrect: number; void: number };
  leagueId: string;
  ok: true;
  picksGradedEvents: PlannedPicksGradedEvent[];
  skippedReason: "event_not_found" | "result_not_final" | null;
}

/**
 * `bettingEventId` is REQUIRED and there is no fallback.
 *
 * The old schema made it optional and the consumer wrote
 * `bettingEventId ?? gameId`. That guess is what let UIX-101 survive: the only
 * live producer supplied a `fantasy_matchups.id` as `gameId`, the grader looked
 * it up in `betting_event`, found nothing, and reported `event_not_found`
 * forever. Requiring the id means a producer that cannot supply one fails
 * loudly at the edge instead of grading nothing in silence.
 */
const bettingEventFinalDataSchema = z.object({
  bettingEventId: z.uuid(),
  leagueId: z.uuid(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseGameFinalData(data: unknown): BettingEventFinalData {
  const parsed = bettingEventFinalDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "BETTING_EVENT_FINAL_INVALID",
        message: "Betting event final payload is invalid",
        status: 400,
      }),
    );
  }
  return parsed.data;
}

async function getDefaultDependencies(): Promise<BettingGradeGameFinalDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  const db = getDb();
  const env = getEnv();
  return {
    ...createResolveBettingEventDependencies(db, env),
    push: createPushNotifier(db, env),
    realtime: createRealtimePublisher(env),
  };
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * What resolution and grading changed, in a shape Inngest can memoize.
 *
 * Crosses a `step.run` boundary, so ids, numbers and strings only — no Dates,
 * no class instances.
 */
export interface GameFinalGradingFacts {
  bettingEventId: string;
  /** ISO kickoff, used to locate the arena season the game belongs to. */
  eventStartTime: string | null;
  gradedPicks: { correct: number; incorrect: number; void: number };
  leagueId: string;
  /** Leagues whose picks were graded, and whose standings are now stale. */
  pickAffectedLeagueIds: string[];
  skippedReason: "event_not_found" | "result_not_final" | null;
}

/** Step 1: the database writes. Resolve the event, grade the picks. */
export async function gradeGameFinalFacts({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: BettingGradeGameFinalDependencies;
}): Promise<GameFinalGradingFacts> {
  const data = parseGameFinalData(rawData);
  const resolution = await resolveBettingEvent({
    deps,
    input: { bettingEventId: data.bettingEventId },
  });

  if (!resolution.resolved || !resolution.result) {
    return {
      bettingEventId: resolution.bettingEventId,
      eventStartTime: resolution.event?.startTime.toISOString() ?? null,
      gradedPicks: { correct: 0, incorrect: 0, void: 0 },
      leagueId: data.leagueId,
      pickAffectedLeagueIds: [],
      skippedReason: resolution.skippedReason,
    };
  }

  const graded = await gradePicksForEvent(deps.db, {
    bettingEventId: resolution.bettingEventId,
    result: resolution.result,
  });

  return {
    bettingEventId: resolution.bettingEventId,
    eventStartTime: resolution.event?.startTime.toISOString() ?? null,
    gradedPicks: {
      correct: graded.correct,
      incorrect: graded.incorrect,
      void: graded.void,
    },
    leagueId: data.leagueId,
    pickAffectedLeagueIds: [...graded.affectedLeagueIds],
    skippedReason: null,
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
    .select({ leagueId: members.organizationId, userId: members.userId })
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
  deps: BettingGradeGameFinalDependencies;
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
          userId,
        });
      }
    }
  }
}

async function publishArenaRealtimeSignals({
  arenaResults,
  at,
  deps,
  leagueId,
}: {
  arenaResults: Awaited<ReturnType<typeof rebuildAllArenaStandings>>;
  at: string;
  deps: BettingGradeGameFinalDependencies;
  leagueId: string;
}): Promise<{
  arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[];
  arenaSwingSignals: ArenaStandingsSwingPayload[];
}> {
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

  // Realtime is best-effort: a dropped socket update is a stale board the next
  // page load fixes, and must not fail a job that already wrote the truth.
  try {
    for (const payload of arenaLeaderboardUpdates) {
      await deps.realtime.publishArenaLeaderboardUpdated(payload);
    }
    for (const payload of arenaSwingSignals) {
      await deps.realtime.publishArenaStandingsSwing(payload);
    }
  } catch (error) {
    logger.warn("Realtime arena signal failed", { error, leagueId });
  }

  return { arenaLeaderboardUpdates, arenaSwingSignals };
}

function planArenaSwingContentEvents({
  arenaSwingSignals,
  bettingEventId,
  leagueId,
}: {
  arenaSwingSignals: readonly ArenaStandingsSwingPayload[];
  bettingEventId: string;
  leagueId: string;
}): PlannedArenaStandingsSwingEvent[] {
  if (arenaSwingSignals.length === 0) {
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

  return seasonIds.flatMap((seasonId) =>
    targetLeagueIds.map((targetLeagueId) => {
      // Keyed on the EVENT rather than on settlement ids, which no longer
      // exist. The key is what makes the fan-out idempotent, so it has to name
      // something stable across retries — the game does, a generated id would
      // not.
      const swingKey = `game-final:${bettingEventId}:${targetLeagueId}`;
      return {
        data: { leagueId: targetLeagueId, seasonId, swingKey },
        id: `${JOB_EVENTS.arenaStandingsSwing}:${targetLeagueId}:${seasonId}:${swingKey}`,
        name: JOB_EVENTS.arenaStandingsSwing,
      };
    }),
  );
}

/**
 * Step 2: everything the grading should CAUSE.
 *
 * Separate from step 1 for the reason recorded in T-016: resolution and
 * grading are both idempotent, so a throw in here would re-run them, find
 * nothing left to do, see zero counters, skip this block entirely and return
 * SUCCESSFULLY — dropping every downstream effect while reporting green.
 * Split, a failure retries only this step against step 1's memoized facts.
 *
 * Delivery is at-least-once. A retry after a partial send repeats some pushes;
 * a duplicate notification is a nuisance, a dropped one is a user who never
 * learns their picks were graded.
 */
export async function publishGameFinalEffects({
  deps,
  facts,
}: {
  deps: BettingGradeGameFinalDependencies;
  facts: GameFinalGradingFacts;
}): Promise<{
  arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[];
  arenaRecapEvents: PlannedArenaStandingsSwingEvent[];
  arenaSwingSignals: ArenaStandingsSwingPayload[];
}> {
  if (facts.pickAffectedLeagueIds.length === 0) {
    return {
      arenaLeaderboardUpdates: [],
      arenaRecapEvents: [],
      arenaSwingSignals: [],
    };
  }

  // The game's kickoff locates the arena season it belongs to.
  const arenaSeasonIds = facts.eventStartTime
    ? await findArenaSeasonIdsForWeekStarts(deps.db, {
        weekStarts: [new Date(facts.eventStartTime)],
      })
    : [];
  const arenaResults = await rebuildAllArenaStandings(deps.db, {
    seasonIds: arenaSeasonIds,
  });
  const realtimeUpdates = await publishArenaRealtimeSignals({
    arenaResults,
    at: new Date().toISOString(),
    deps,
    leagueId: facts.leagueId,
  });
  const arenaRecapEvents = planArenaSwingContentEvents({
    arenaSwingSignals: realtimeUpdates.arenaSwingSignals,
    bettingEventId: facts.bettingEventId,
    leagueId: facts.leagueId,
  });
  await sendArenaRivalPassedPushNotifications({
    arenaSwingSignals: realtimeUpdates.arenaSwingSignals,
    deps,
  });

  return { ...realtimeUpdates, arenaRecapEvents };
}

/**
 * One content-planning trigger per league whose picks were graded.
 *
 * Replaces the per-slip `bet.settled` fan-out. Keyed on (event, league) so a
 * retry produces the same ids and the planner deduplicates instead of writing
 * the same recap twice.
 */
function picksGradedEventsFor(
  facts: GameFinalGradingFacts,
): PlannedPicksGradedEvent[] {
  return facts.pickAffectedLeagueIds.map((leagueId) => ({
    data: {
      bettingEventId: facts.bettingEventId,
      correctPicks: facts.gradedPicks.correct,
      leagueId,
    },
    id: `${JOB_EVENTS.picksGraded}:${leagueId}:${facts.bettingEventId}`,
    name: JOB_EVENTS.picksGraded,
  }));
}

export async function runBettingGradeGameFinal({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: BettingGradeGameFinalDependencies;
}): Promise<BettingGradeGameFinalResponse> {
  const facts = await gradeGameFinalFacts({ data: rawData, deps });
  const effects = await publishGameFinalEffects({ deps, facts });
  return {
    ...effects,
    bettingEventId: facts.bettingEventId,
    eventName: JOB_EVENTS.bettingEventFinal,
    gradedPicks: facts.gradedPicks,
    leagueId: facts.leagueId,
    ok: true,
    picksGradedEvents: picksGradedEventsFor(facts),
    skippedReason: facts.skippedReason,
  };
}

export function createBettingGradeGameFinalFunction(
  resolveDeps: () =>
    | Promise<BettingGradeGameFinalDependencies>
    | BettingGradeGameFinalDependencies = getDefaultDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Resolves a finished NFL event and grades the Pick 'em entries on it.",
      id: "betting-grade-game-final",
      idempotency: "event.data.leagueId + ':' + event.data.bettingEventId",
      name: "Betting game-final grading",
      triggers: [{ event: JOB_EVENTS.bettingEventFinal }],
    },
    async ({ event, step }): Promise<BettingGradeGameFinalResponse> =>
      recordJobRun("betting-grade-game-final", async () => {
        const deps = await resolveDeps();
        // TWO steps, deliberately. Collapsing them back into one re-introduces
        // UIX-106 — see `publishGameFinalEffects`.
        const facts = await step.run("grade-game-final", () =>
          gradeGameFinalFacts({ data: event.data, deps }),
        );
        const effects = await step.run("publish-grading-effects", () =>
          publishGameFinalEffects({ deps, facts }),
        );
        const picksGradedEvents = picksGradedEventsFor(facts);
        if (picksGradedEvents.length > 0) {
          await step.sendEvent("send-picks-graded-events", picksGradedEvents);
        }
        if (effects.arenaRecapEvents.length > 0) {
          await step.sendEvent(
            "send-arena-swing-content-events",
            effects.arenaRecapEvents,
          );
        }
        return {
          ...effects,
          bettingEventId: facts.bettingEventId,
          eventName: JOB_EVENTS.bettingEventFinal,
          gradedPicks: facts.gradedPicks,
          leagueId: facts.leagueId,
          ok: true,
          picksGradedEvents,
          skippedReason: facts.skippedReason,
        };
      }),
  );
}

export const bettingGradeGameFinal = createBettingGradeGameFinalFunction();
