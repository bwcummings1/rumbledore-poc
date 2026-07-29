import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { withLeagueContext } from "@/db/rls";
import {
  bettingEvents,
  bettingMarkets,
  oddsSnapshots,
  picks,
} from "@/db/schema";
import { gradeSelection, toPickOutcome } from "./grading";
import type { EventResult } from "./interfaces";

/**
 * Grades submitted picks against a finished event.
 *
 * This is the middle of the Pick 'em loop: submit -> GRADE -> standings.
 * Without it `picks.status` never leaves `pending`, so every league's accuracy
 * reads 0% forever and the arena ranks a field of zeroes.
 *
 * It shares `gradeSelection` with the bankroll settler rather than
 * reimplementing the math. These rules decide who wins an inter-league
 * competition; a second copy that quietly disagrees with the first is exactly
 * the failure worth designing out.
 *
 * ## Idempotence
 *
 * Only `pending` picks are updated. Re-running after a partial failure, or on
 * an Inngest retry, cannot regrade a pick that already has an outcome — so a
 * replayed job cannot flip a correct pick to incorrect because a provider
 * corrected a box score hours later. Correcting a graded pick is a deliberate
 * act, not a side effect of a retry.
 */

export interface GradePicksForEventInput {
  readonly bettingEventId: string;
  readonly result: EventResult;
  readonly gradedAt?: Date;
}

export interface GradePicksForEventResult {
  readonly bettingEventId: string;
  readonly correct: number;
  readonly incorrect: number;
  readonly void: number;
  readonly skipped: number;
  /** Leagues whose standings are now stale and need a rebuild. */
  readonly affectedLeagueIds: readonly string[];
}

/**
 * Postponed and canceled events grade too — as voids, not as losses.
 *
 * A canceled game is not a pick the user got wrong; leaving it pending would
 * strand it in the denominator forever, and marking it incorrect would punish
 * a user for a game that never happened.
 */
function isGradable(result: EventResult): boolean {
  return (
    result.finalStatus === "final" ||
    result.finalStatus === "postponed" ||
    result.finalStatus === "canceled"
  );
}

export async function gradePicksForEvent(
  db: Db,
  input: GradePicksForEventInput,
): Promise<GradePicksForEventResult> {
  const empty: GradePicksForEventResult = {
    affectedLeagueIds: [],
    bettingEventId: input.bettingEventId,
    correct: 0,
    incorrect: 0,
    skipped: 0,
    void: 0,
  };
  if (!isGradable(input.result)) {
    return empty;
  }
  const gradedAt = input.gradedAt ?? new Date();

  // Which leagues have pending picks on this event. Read centrally: picks are
  // RLS-protected per league, so the per-league update below must run inside
  // each league's own context, and we cannot know the set without asking first.
  //
  // This SELECT is deliberately narrow — league ids only, no pick content — so
  // the central read reveals nothing about what any league picked.
  const leagueRows = await db
    .selectDistinct({ leagueId: picks.leagueId })
    .from(picks)
    .innerJoin(bettingMarkets, eq(bettingMarkets.id, picks.marketId))
    .where(
      and(
        eq(bettingMarkets.eventId, input.bettingEventId),
        eq(picks.status, "pending"),
      ),
    );

  let correct = 0;
  let incorrect = 0;
  let voided = 0;
  let skipped = 0;
  const affectedLeagueIds: string[] = [];

  for (const { leagueId } of leagueRows) {
    const graded = await withLeagueContext(db, leagueId, async (tx) => {
      const pending = await tx
        .select({
          lockedLine: picks.lockedLine,
          marketSubject: bettingMarkets.subject,
          marketType: bettingMarkets.type,
          pickId: picks.id,
          propType: bettingMarkets.propType,
          selection: picks.selection,
          // The line the user was shown, used only when the pick did not
          // snapshot its own -- see below.
          snapshotLine: oddsSnapshots.line,
        })
        .from(picks)
        .innerJoin(bettingMarkets, eq(bettingMarkets.id, picks.marketId))
        .innerJoin(oddsSnapshots, eq(oddsSnapshots.id, picks.oddsSnapshotId))
        .where(
          and(
            eq(picks.leagueId, leagueId),
            eq(bettingMarkets.eventId, input.bettingEventId),
            eq(picks.status, "pending"),
          ),
        );

      const byOutcome = new Map<string, string[]>();
      let localSkipped = 0;

      for (const row of pending) {
        const outcome = gradeSelection(
          {
            // `lockedLine` is what the user actually committed to. Falling back
            // to the snapshot's line is only for picks written before the lock
            // was recorded; grading a spread against a line the user never saw
            // would move the goalposts after the fact.
            lockedLine: row.lockedLine ?? row.snapshotLine,
            marketSubject: row.marketSubject,
            marketType: row.marketType,
            propType: row.propType,
            selection: row.selection,
          },
          input.result,
        );

        if (!outcome) {
          // The grader could not decide — a prop with no matching stat line,
          // for instance. Left pending on purpose so a later, more complete
          // result can settle it. Guessing here would be worse than waiting.
          localSkipped += 1;
          continue;
        }

        const status = toPickOutcome(outcome.status);
        const ids = byOutcome.get(status) ?? [];
        ids.push(row.pickId);
        byOutcome.set(status, ids);
      }

      const counts = { correct: 0, incorrect: 0, void: 0 };
      for (const [status, ids] of byOutcome) {
        if (ids.length === 0) continue;
        await tx
          .update(picks)
          .set({
            gradedAt,
            status: status as "correct" | "incorrect" | "void",
            updatedAt: gradedAt,
          })
          .where(
            and(
              eq(picks.leagueId, leagueId),
              inArray(picks.id, ids),
              // Re-checked inside the write: another worker may have graded
              // these between the read above and here.
              eq(picks.status, "pending"),
            ),
          );
        counts[status as keyof typeof counts] = ids.length;
      }

      return { ...counts, skipped: localSkipped };
    });

    correct += graded.correct;
    incorrect += graded.incorrect;
    voided += graded.void;
    skipped += graded.skipped;
    if (graded.correct + graded.incorrect + graded.void > 0) {
      affectedLeagueIds.push(leagueId);
    }
  }

  return {
    affectedLeagueIds,
    bettingEventId: input.bettingEventId,
    correct,
    incorrect,
    skipped,
    void: voided,
  };
}

/** Resolves the event row a result belongs to, for callers holding only an id. */
export async function loadGradableEvent(db: Db, bettingEventId: string) {
  const [event] = await db
    .select()
    .from(bettingEvents)
    .where(eq(bettingEvents.id, bettingEventId))
    .limit(1);
  return event ?? null;
}
