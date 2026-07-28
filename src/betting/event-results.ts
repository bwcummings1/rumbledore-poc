import { and, desc, eq, inArray, lt, notInArray } from "drizzle-orm";
import type { Db } from "@/db";
import { bettingEvents, bettingMarkets, picks, pickWeeks } from "@/db/schema";

/**
 * Finds real-world events that have finished and the entries that care about
 * them.
 *
 * ## Why this exists (UIX-101)
 *
 * Bets never settled, and the cause was not a broken settler — it was that
 * **nothing ever said a game had ended.**
 *
 * `game.final` had exactly one production emitter, in `ingestion-live.ts`,
 * which fires when a *fantasy matchup* changes and carries
 * `gameId: fantasy_matchups.id`. The settle consumer falls back to
 * `data.bettingEventId ?? data.gameId` and looks that value up in
 * `betting_event`. Those two tables have independent `defaultRandom()` primary
 * keys, so the lookup could never hit and every run returned
 * `skippedReason: "event_not_found"` with `ok: true` — silent, forever.
 *
 * The original plan assumed the emitter could resolve a fantasy matchup to its
 * betting event. It cannot: a fantasy matchup is two *fantasy* teams meeting in
 * week N, while a betting event is a real NFL game. There is no join between
 * them, and none can be constructed. The missing piece was a producer, and this
 * is it.
 *
 * ## Why it lives here rather than in the odds poller
 *
 * The poller owns "what are the current odds"; this owns "which events are
 * done". Keeping them separate means the grading trigger does not silently stop
 * when odds ingestion is rate-limited or mocked.
 *
 * ## Optimistic by design
 *
 * A candidate is any event whose start time has passed and whose status is not
 * yet final. We do NOT try to determine the true outcome here — the settle path
 * already fetches the result and returns `result_not_final` without mutating
 * anything when the game is still in progress. Emitting a little early is free;
 * missing a finished game is not.
 */

export interface FinishedEventCandidate {
  readonly bettingEventId: string;
  readonly leagueIds: readonly string[];
}

export interface FindFinishedEventsInput {
  /** Now. Injected so tests do not depend on wall-clock timing. */
  readonly now: Date;
  /**
   * How long after kickoff an event becomes a candidate. An NFL game runs
   * roughly three hours; the default leaves headroom so we ask once the game is
   * plausibly over rather than repeatedly mid-game.
   */
  readonly settleAfterMs?: number;
  readonly limit?: number;
}

export const DEFAULT_SETTLE_AFTER_MS = 3.5 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 100;

/**
 * Returns finished-looking events paired with the leagues holding pending picks
 * on them.
 *
 * The league fan-out is deliberately derived from **pending picks** rather than
 * from "every league": an event nobody picked needs no grading pass, and a
 * league that already graded its picks should not be asked again.
 *
 * Read-only. This deliberately does not emit or grade — the caller owns that,
 * so the query can be tested without an Inngest harness.
 */
export async function findFinishedEvents(
  db: Db,
  input: FindFinishedEventsInput,
): Promise<FinishedEventCandidate[]> {
  const settleAfterMs = input.settleAfterMs ?? DEFAULT_SETTLE_AFTER_MS;
  const cutoff = new Date(input.now.getTime() - settleAfterMs);

  // Candidate events: kicked off long enough ago to be plausibly over, and not
  // already resolved. Central catalog, so no league context applies.
  const candidates = await db
    .select({ id: bettingEvents.id })
    .from(bettingEvents)
    .where(
      and(
        lt(bettingEvents.startTime, cutoff),
        // Exclude states that can never yield a result. `final` is already
        // graded; `canceled` never will be, and polling it forever would mean
        // the settle path returning `result_not_final` on every pass for the
        // rest of the season. `postponed` stays a candidate on purpose — a
        // rescheduled game moves its startTime and should be graded then.
        notInArray(bettingEvents.status, ["final", "canceled"]),
      ),
    )
    // Newest kickoff first, and the ordering is load-bearing rather than
    // cosmetic. The limit exists to bound one pass, so WITHOUT an explicit
    // order Postgres may return any arbitrary slice — meaning which events get
    // graded is undefined, and a given event could be starved indefinitely
    // while others are re-selected. Newest-first also matches what people are
    // actually waiting on: the game that just ended, not one from weeks ago.
    .orderBy(desc(bettingEvents.startTime))
    .limit(input.limit ?? DEFAULT_LIMIT);

  if (candidates.length === 0) {
    return [];
  }

  const eventIds = candidates.map((row) => row.id);

  // Which leagues hold pending picks on those events. `picks` is league-scoped
  // and RLS-protected, but this query runs OUTSIDE a league context on purpose:
  // it is the cross-league fan-out step, and it selects only ids — never pick
  // content — so it leaks nothing about any league's selections.
  const interested = await db
    .selectDistinct({
      eventId: bettingEvents.id,
      leagueId: picks.leagueId,
    })
    .from(picks)
    .innerJoin(pickWeeks, eq(pickWeeks.id, picks.pickWeekId))
    .innerJoin(bettingMarkets, eq(bettingMarkets.id, picks.marketId))
    .innerJoin(bettingEvents, eq(bettingEvents.id, bettingMarkets.eventId))
    .where(
      and(inArray(bettingEvents.id, eventIds), eq(picks.status, "pending")),
    );

  const byEvent = new Map<string, Set<string>>();
  for (const row of interested) {
    const bucket = byEvent.get(row.eventId);
    if (bucket) {
      bucket.add(row.leagueId);
    } else {
      byEvent.set(row.eventId, new Set([row.leagueId]));
    }
  }

  return [...byEvent.entries()].map(([bettingEventId, leagueIds]) => ({
    bettingEventId,
    leagueIds: [...leagueIds],
  }));
}

/**
 * Builds the `game.final` payloads for a set of candidates.
 *
 * **`bettingEventId` is always set.** That is the entire point: the consumer's
 * `data.bettingEventId ?? data.gameId` fallback exists for direct
 * betting-event producers, and this is the one that finally supplies it. The
 * fallback is never exercised from here.
 *
 * Event ids are deterministic — `(league, event)` — so Inngest deduplicates a
 * redelivery of the same pair rather than grading twice.
 */
export function plannedGameFinalEvents(
  candidates: readonly FinishedEventCandidate[],
): {
  data: { bettingEventId: string; leagueId: string };
  id: string;
}[] {
  return candidates.flatMap((candidate) =>
    candidate.leagueIds.map((leagueId) => ({
      data: {
        bettingEventId: candidate.bettingEventId,
        leagueId,
      },
      id: `game.final:${leagueId}:${candidate.bettingEventId}`,
    })),
  );
}
