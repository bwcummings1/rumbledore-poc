import { cron } from "inngest";
import {
  DEFAULT_SETTLE_AFTER_MS,
  findFinishedEvents,
  plannedGameFinalEvents,
} from "@/betting/event-results";
import { recordJobRun } from "@/core/metrics";
import type { Db } from "@/db/client";
import { inngest } from "../client";
import { type BettingEventFinalData, JOB_EVENTS } from "../events";

/**
 * Finds central betting events whose games are over and whose picks are still
 * pending, and asks for each affected league to be graded.
 *
 * ## Why this job exists
 *
 * `findFinishedEvents` and `plannedGameFinalEvents` were written, tested and
 * falsified — and then never wired to anything. Nothing imported them. The only
 * live producer of a grading trigger was `plannedGameFinalEventsFor` in
 * `ingestion-live.ts`, which reacts to a FANTASY MATCHUP going final and emits
 * a `fantasy_matchups.id` as `gameId`. The grader looked that id up in
 * `betting_event`, found nothing, and returned `event_not_found`.
 *
 * So UIX-101 — "settlement never fires" — stayed live the entire time its fix
 * sat in the repository with green tests. This job is the missing wire.
 *
 * ## Why it is a poller rather than a reaction
 *
 * Nothing tells us an NFL game ended. The fantasy sync knows when a FANTASY
 * matchup settles, which is a different clock and a different id space. What we
 * can observe is that kickoff was long enough ago that the game must be over,
 * which is a question about the passage of time — so it is asked on a schedule.
 */

export interface BettingEventPollDependencies {
  db: Db;
  now?: () => Date;
}

export interface BettingEventPollResponse {
  candidateCount: number;
  eventName: typeof JOB_EVENTS.bettingEventFinal;
  ok: true;
  planned: {
    data: BettingEventFinalData;
    id: string;
    name: typeof JOB_EVENTS.bettingEventFinal;
  }[];
}

async function getDefaultDependencies(): Promise<BettingEventPollDependencies> {
  const { getDb } = await import("@/db");
  return { db: getDb() };
}

export async function runBettingEventPoll({
  deps,
}: {
  deps: BettingEventPollDependencies;
}): Promise<BettingEventPollResponse> {
  const now = deps.now?.() ?? new Date();
  const candidates = await findFinishedEvents(deps.db, {
    now,
    settleAfterMs: DEFAULT_SETTLE_AFTER_MS,
  });

  // Ids are deterministic on (league, event), so a redelivery of the same pair
  // is deduplicated by Inngest rather than grading twice. Grading is idempotent
  // as well, which makes this belt and braces on purpose: this poller runs
  // every fifteen minutes and will re-see an event until its picks are graded.
  const planned = plannedGameFinalEvents(candidates).map((event) => ({
    data: event.data,
    id: event.id,
    name: JOB_EVENTS.bettingEventFinal,
  }));

  return {
    candidateCount: candidates.length,
    eventName: JOB_EVENTS.bettingEventFinal,
    ok: true,
    planned,
  };
}

export function createBettingEventPollFunction(
  resolveDeps: () =>
    | BettingEventPollDependencies
    | Promise<BettingEventPollDependencies> = getDefaultDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Polls for finished betting events with pending picks and requests grading.",
      id: "betting-event-poll",
      name: "Betting event poll",
      triggers: [
        { event: JOB_EVENTS.bettingEventPoll },
        cron("TZ=UTC */15 * * * *"),
      ],
    },
    async ({ step }): Promise<BettingEventPollResponse> =>
      recordJobRun("betting-event-poll", async () => {
        const deps = await resolveDeps();
        const result = await step.run("find-finished-events", () =>
          runBettingEventPoll({ deps }),
        );
        if (result.planned.length > 0) {
          await step.sendEvent("send-betting-event-final", result.planned);
        }
        return result;
      }),
  );
}

export const bettingEventPoll = createBettingEventPollFunction();
