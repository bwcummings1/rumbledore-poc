import { and, count, eq, sql } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db, LeagueScopedTx } from "@/db";
import { withLeagueContext } from "@/db/rls";
import {
  bettingEvents,
  bettingMarkets,
  oddsSnapshots,
  picks,
  pickWeeks,
} from "@/db/schema";
import { DEFAULT_MAX_PICKS_PER_USER } from "./pickem-scoring";

/**
 * Pick submission for the inter-league Pick 'em competition.
 *
 * Replaces bankroll stake placement (`placement.ts`, recoverable at tag
 * `bankroll-engine-v1`). Design of record: PROJECT_CONTEXT.md §3.3.
 *
 * Three invariants this module owns:
 *
 *  1. **One user intent produces at most one pick.** The idempotency key is
 *     minted per staged pick by the caller and reused across retries, so a
 *     submit whose response times out cannot become two picks when the user
 *     tries again. This is the reshaped UIX-001 — under the bankroll model the
 *     same defect double-staked money; here it would double-count a pick and
 *     corrupt a league's accuracy.
 *  2. **A pick locks when its event starts.** Picking a game already underway
 *     is not a UX annoyance, it is cheating.
 *  3. **The weekly allowance is enforced server-side.** The client shows the
 *     remaining count, but the client is not the authority.
 */

/**
 * Declared as a const array so the HTTP schema and the domain type cannot
 * drift: adding a selection here is the only edit needed to accept it at the
 * edge, and removing one fails typecheck at every use site.
 */
export const PICK_SELECTIONS = [
  "home",
  "away",
  "over",
  "under",
  "outcome",
] as const;

export type PickSelection = (typeof PICK_SELECTIONS)[number];

export interface SubmitPickInput {
  readonly leagueId: string;
  readonly userId: string;
  readonly pickWeekId: string;
  readonly oddsSnapshotId: string;
  readonly selection: PickSelection;
  /**
   * Minted once per staged pick by the caller and reused across retries. NOT
   * regenerated per attempt — that was the original defect.
   */
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export interface SubmitPickResult {
  readonly pickId: string;
  readonly deduplicated: boolean;
  readonly remainingPicks: number;
}

function appError(code: string, message: string, status: number): AppError {
  return new AppError({ code, message, status });
}

function validateIdempotencyKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 200) {
    throw appError(
      "PICK_INVALID_IDEMPOTENCY_KEY",
      "Pick idempotency key must be between 8 and 200 characters",
      400,
    );
  }
  return trimmed;
}

async function loadExistingPick(
  tx: LeagueScopedTx,
  input: { leagueId: string; userId: string; idempotencyKey: string },
) {
  const [existing] = await tx
    .select({ id: picks.id, marketId: picks.marketId })
    .from(picks)
    .where(
      and(
        eq(picks.leagueId, input.leagueId),
        eq(picks.userId, input.userId),
        eq(picks.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  return existing ?? null;
}

/**
 * Submits one pick.
 *
 * Runs entirely inside a single league-scoped transaction so the allowance
 * check and the insert cannot race: two concurrent submits from the same user
 * cannot both observe "9 used" and both write a 10th pick.
 */
export async function submitPick(
  db: Db,
  input: SubmitPickInput,
): Promise<SubmitPickResult> {
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const now = input.now ?? new Date();

  return withLeagueContext(db, input.leagueId, async (tx) => {
    const existing = await loadExistingPick(tx, {
      idempotencyKey,
      leagueId: input.leagueId,
      userId: input.userId,
    });

    const [week] = await tx
      .select({
        closesAt: pickWeeks.closesAt,
        id: pickWeeks.id,
        maxPicksPerUser: pickWeeks.maxPicksPerUser,
        opensAt: pickWeeks.opensAt,
      })
      .from(pickWeeks)
      .where(
        and(
          eq(pickWeeks.id, input.pickWeekId),
          eq(pickWeeks.leagueId, input.leagueId),
        ),
      )
      .limit(1);

    if (!week) {
      throw appError("PICK_WEEK_NOT_FOUND", "Pick week was not found", 404);
    }

    const [used] = await tx
      .select({ total: count() })
      .from(picks)
      .where(
        and(
          eq(picks.leagueId, input.leagueId),
          eq(picks.userId, input.userId),
          eq(picks.pickWeekId, input.pickWeekId),
        ),
      );
    const usedPicks = used?.total ?? 0;
    const allowance = week.maxPicksPerUser ?? DEFAULT_MAX_PICKS_PER_USER;

    // A replayed submit returns the original pick without consuming allowance.
    if (existing) {
      return {
        deduplicated: true,
        pickId: existing.id,
        remainingPicks: Math.max(allowance - usedPicks, 0),
      };
    }

    if (now < week.opensAt) {
      throw appError("PICK_WEEK_NOT_OPEN", "Pick week is not open yet", 409);
    }
    if (now >= week.closesAt) {
      throw appError("PICK_WEEK_CLOSED", "Pick week is closed", 409);
    }
    if (usedPicks >= allowance) {
      throw appError(
        "PICK_ALLOWANCE_EXHAUSTED",
        `All ${allowance} picks for this week have been used`,
        409,
      );
    }

    // Resolve the snapshot, its market, and the event in one join so the
    // kickoff lock is evaluated against the SAME row the pick is priced from.
    const [snapshot] = await tx
      .select({
        eventStartTime: bettingEvents.startTime,
        eventStatus: bettingEvents.status,
        line: oddsSnapshots.line,
        marketId: bettingMarkets.id,
        marketStatus: bettingMarkets.status,
        snapshotId: oddsSnapshots.id,
      })
      .from(oddsSnapshots)
      .innerJoin(bettingMarkets, eq(bettingMarkets.id, oddsSnapshots.marketId))
      .innerJoin(bettingEvents, eq(bettingEvents.id, bettingMarkets.eventId))
      .where(eq(oddsSnapshots.id, input.oddsSnapshotId))
      .limit(1);

    if (!snapshot) {
      throw appError(
        "PICK_SNAPSHOT_NOT_FOUND",
        "Odds snapshot was not found",
        404,
      );
    }
    if (snapshot.marketStatus !== "open") {
      throw appError(
        "PICK_MARKET_CLOSED",
        "Selected market is not open for picks",
        409,
      );
    }
    // Invariant 2: the event must not have started. Checked against the event's
    // own start time rather than the week window, because a week stays open
    // while individual games kick off throughout it.
    if (now >= snapshot.eventStartTime) {
      throw appError(
        "PICK_EVENT_STARTED",
        "This event has already started",
        409,
      );
    }

    const [inserted] = await tx
      .insert(picks)
      .values({
        idempotencyKey,
        leagueId: input.leagueId,
        lockedLine: snapshot.line,
        marketId: snapshot.marketId,
        oddsSnapshotId: snapshot.snapshotId,
        pickWeekId: input.pickWeekId,
        selection: input.selection,
        status: "pending",
        submittedAt: now,
        userId: input.userId,
      })
      .onConflictDoNothing({
        target: [picks.leagueId, picks.userId, picks.idempotencyKey],
      })
      .returning({ id: picks.id });

    if (!inserted) {
      // Lost an insert race against a concurrent replay of the same key — the
      // unique index did its job. Re-read the winner rather than erroring.
      const raced = await loadExistingPick(tx, {
        idempotencyKey,
        leagueId: input.leagueId,
        userId: input.userId,
      });
      if (!raced) {
        throw appError(
          "PICK_INSERT_FAILED",
          "Pick could not be inserted or reloaded",
          500,
        );
      }
      return {
        deduplicated: true,
        pickId: raced.id,
        remainingPicks: Math.max(allowance - usedPicks, 0),
      };
    }

    return {
      deduplicated: false,
      pickId: inserted.id,
      remainingPicks: Math.max(allowance - usedPicks - 1, 0),
    };
  });
}

export interface OpenPickWeekInput {
  readonly leagueId: string;
  readonly season: number;
  readonly week: number;
  readonly rosterSize: number;
  readonly opensAt: Date;
  readonly closesAt: Date;
  readonly maxPicksPerUser?: number;
}

/**
 * Opens a week, snapshotting the roster size.
 *
 * The snapshot is the point: it is taken when the week opens and never
 * recomputed, so a league cannot shrink its own denominator mid-week by cutting
 * inactive members. Re-opening the same (league, season, week) is idempotent
 * and deliberately does NOT re-snapshot, for the same reason.
 */
export async function openPickWeek(
  db: Db,
  input: OpenPickWeekInput,
): Promise<{ pickWeekId: string; created: boolean }> {
  if (input.rosterSize <= 0) {
    throw appError(
      "PICK_WEEK_INVALID_ROSTER",
      "Pick week roster size must be positive",
      400,
    );
  }

  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [inserted] = await tx
      .insert(pickWeeks)
      .values({
        closesAt: input.closesAt,
        leagueId: input.leagueId,
        maxPicksPerUser: input.maxPicksPerUser ?? DEFAULT_MAX_PICKS_PER_USER,
        opensAt: input.opensAt,
        rosterSize: input.rosterSize,
        season: input.season,
        week: input.week,
      })
      .onConflictDoNothing({
        target: [pickWeeks.leagueId, pickWeeks.season, pickWeeks.week],
      })
      .returning({ id: pickWeeks.id });

    if (inserted) {
      return { created: true, pickWeekId: inserted.id };
    }

    const [existing] = await tx
      .select({ id: pickWeeks.id })
      .from(pickWeeks)
      .where(
        and(
          eq(pickWeeks.leagueId, input.leagueId),
          eq(pickWeeks.season, input.season),
          eq(pickWeeks.week, input.week),
        ),
      )
      .limit(1);

    if (!existing) {
      throw appError(
        "PICK_WEEK_OPEN_FAILED",
        "Pick week could not be created or reloaded",
        500,
      );
    }
    return { created: false, pickWeekId: existing.id };
  });
}

export interface PickWeekTallyRow {
  readonly correctPicks: number;
  readonly submittedPicks: number;
  readonly voidPicks: number;
  readonly rosterSize: number;
  readonly maxPicksPerUser: number;
}

/** Loads the graded totals a week's score is computed from. */
export async function loadPickWeekTally(
  db: Db,
  input: { leagueId: string; pickWeekId: string },
): Promise<PickWeekTallyRow | null> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [week] = await tx
      .select({
        maxPicksPerUser: pickWeeks.maxPicksPerUser,
        rosterSize: pickWeeks.rosterSize,
      })
      .from(pickWeeks)
      .where(
        and(
          eq(pickWeeks.id, input.pickWeekId),
          eq(pickWeeks.leagueId, input.leagueId),
        ),
      )
      .limit(1);

    if (!week) {
      return null;
    }

    const [tally] = await tx
      .select({
        correctPicks: sql<number>`count(*) filter (where ${picks.status} = 'correct')::int`,
        submittedPicks: sql<number>`count(*)::int`,
        voidPicks: sql<number>`count(*) filter (where ${picks.status} = 'void')::int`,
      })
      .from(picks)
      .where(
        and(
          eq(picks.leagueId, input.leagueId),
          eq(picks.pickWeekId, input.pickWeekId),
        ),
      );

    return {
      correctPicks: tally?.correctPicks ?? 0,
      maxPicksPerUser: week.maxPicksPerUser,
      rosterSize: week.rosterSize,
      // A void pick was submitted but is not scorable, so it must not inflate
      // the submitted count the participation gate reads.
      submittedPicks: (tally?.submittedPicks ?? 0) - (tally?.voidPicks ?? 0),
      voidPicks: tally?.voidPicks ?? 0,
    };
  });
}
