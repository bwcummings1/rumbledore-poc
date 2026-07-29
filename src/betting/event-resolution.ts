import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type BettingEvent, bettingEvents, bettingMarkets } from "@/db/schema";
import { stableContentHash } from "@/ingestion/hash";
import type { EventResult, ResultsProvider } from "./interfaces";

/**
 * Marks a betting event final and closes its markets.
 *
 * Extracted from `settlement.ts` when the bankroll engine was deleted. This
 * half was never about money: it records the central fact that a game
 * finished, which the Pick 'em grader then reads. The bankroll half — slips,
 * legs, payouts, ledger entries — went with the engine.
 *
 * It no longer runs inside a league context. `betting_event`,
 * `betting_market` and `odds_snapshot` are CENTRAL tables with no RLS
 * (verified against the live catalog: `relrowsecurity = false`), so scoping
 * the update to one league was always slightly wrong — it happened to work
 * only because there was no policy to enforce. A game going final is a fact
 * about the NFL, not about a league.
 */

export interface ResolveBettingEventDependencies {
  db: Db;
  now?: () => Date;
  resultsProvider: ResultsProvider;
}

export interface ResolveBettingEventInput {
  bettingEventId: string;
  now?: Date;
}

export interface ResolveBettingEventResult {
  bettingEventId: string;
  event: BettingEvent | null;
  /** Null when the event was missing or the provider had nothing final. */
  result: EventResult | null;
  resolved: boolean;
  skippedReason: "event_not_found" | "result_not_final" | null;
}

/**
 * Postponed and canceled events resolve too.
 *
 * They are not "still pending" — the game will not decide, and downstream
 * grading needs to hear about that so it can void rather than leave picks
 * stranded in the denominator forever.
 */
function shouldResolve(result: EventResult): boolean {
  return (
    result.finalStatus === "final" ||
    result.finalStatus === "postponed" ||
    result.finalStatus === "canceled"
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

export async function loadBettingEvent(
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

export async function resolveBettingEvent({
  deps,
  input,
}: {
  deps: ResolveBettingEventDependencies;
  input: ResolveBettingEventInput;
}): Promise<ResolveBettingEventResult> {
  const now = input.now ?? deps.now?.() ?? new Date();
  const event = await loadBettingEvent(deps.db, input.bettingEventId);
  if (!event) {
    return {
      bettingEventId: input.bettingEventId,
      event: null,
      result: null,
      resolved: false,
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

  if (!shouldResolve(result)) {
    return {
      bettingEventId: event.id,
      event,
      result,
      resolved: false,
      skippedReason: "result_not_final",
    };
  }

  await deps.db.transaction(async (tx) => {
    // Serializes concurrent resolutions of the same event. Two workers writing
    // different provider snapshots would otherwise interleave and leave the
    // event's score and its content hash describing different results.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`bet-event-resolution:${event.id}`}, 0))`,
    );
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

    // A finished game's markets are settled; a canceled or postponed one's are
    // void. Either way they must stop being offered — leaving them `open`
    // would keep them on the Pick 'em slate for a game that will not be played.
    await tx
      .update(bettingMarkets)
      .set({
        lastUpdated: now,
        status: result.finalStatus === "final" ? "settled" : "void",
        updatedAt: now,
      })
      .where(eq(bettingMarkets.eventId, event.id));
  });

  return {
    bettingEventId: event.id,
    event,
    result,
    resolved: true,
    skippedReason: null,
  };
}
