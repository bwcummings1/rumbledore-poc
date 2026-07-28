/**
 * Pick 'em scoring — the "absolute denominator" model.
 *
 * Replaces the bankroll/PnL model (specs 08/15 rewrite; prior engine recoverable
 * at tag `bankroll-engine-v1`). Design of record: PROJECT_CONTEXT.md §3.3.
 *
 * Two rules do all the work:
 *
 *  1. **An unsubmitted pick is mathematically identical to a wrong one.** The
 *     denominator is the entry's maximum POSSIBLE picks, never the number
 *     actually submitted. A league that skips picks is not rewarded with a
 *     smaller denominator, so no separate penalty formula is needed — the
 *     arithmetic punishes low volume on its own.
 *
 *  2. **League size normalises away.** Because the score is a percentage of
 *     possible picks, a 10-person and a 12-person league compete on equal
 *     terms with no tiering: 80/120 and 66/100 are both 66.7%.
 *
 * Pushes are the one subtraction from the denominator — see `voidPicks` below.
 */

/** Default weekly allowance per user. Tunable; see PROJECT_CONTEXT.md §3.3. */
export const DEFAULT_MAX_PICKS_PER_USER = 10;

/**
 * Fraction of an entry's possible picks that must be submitted for the entry to
 * be eligible for a weekly prize. Annual accuracy is recorded regardless — the
 * gate governs eligibility only, never scoring.
 */
export const WEEKLY_PARTICIPATION_FLOOR = 0.9;

export interface PickWeekTotals {
  /** Roster size snapshotted when the week opened, NOT current membership. */
  readonly rosterSize: number;
  readonly maxPicksPerUser: number;
  readonly submittedPicks: number;
  readonly correctPicks: number;
  /**
   * Picks that pushed — the result landed exactly on the line. These are void:
   * they count toward neither the numerator nor the denominator, because the
   * outcome was structurally undecidable and the user did nothing wrong.
   * Grading them incorrect would also drive users off whole-number lines,
   * narrowing the pick pool through the back door (IMPLEMENTATION_PLAN.md DD-2).
   */
  readonly voidPicks: number;
}

export interface PickWeekScore {
  /** rosterSize × maxPicksPerUser, before void adjustment. */
  readonly potentialPicks: number;
  /** The graded denominator: potential picks less any that pushed. */
  readonly scorablePicks: number;
  /** correct ÷ scorable, in [0,1]. Zero when nothing was scorable. */
  readonly accuracy: number;
  /** submitted ÷ scorable, in [0,1]. Can exceed nothing; clamped at 1. */
  readonly participationRate: number;
  readonly isEligibleForWeeklyPrize: boolean;
}

function nonnegativeInt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Scores one entry's week.
 *
 * Deliberately pure and dependency-free so the arithmetic can be tested
 * exhaustively without a database — the scoring rules are the product, and
 * they should not require a fixture league to verify.
 */
export function scorePickWeek(totals: PickWeekTotals): PickWeekScore {
  const rosterSize = nonnegativeInt(totals.rosterSize);
  const maxPicks = nonnegativeInt(totals.maxPicksPerUser);
  const potentialPicks = rosterSize * maxPicks;

  const voidPicks = Math.min(nonnegativeInt(totals.voidPicks), potentialPicks);
  const scorablePicks = Math.max(potentialPicks - voidPicks, 0);

  // Correct and submitted counts include only graded, non-void picks, but clamp
  // defensively: a caller passing inconsistent totals should not produce an
  // accuracy above 1, which would corrupt a leaderboard rather than fail loudly.
  const correctPicks = Math.min(
    nonnegativeInt(totals.correctPicks),
    scorablePicks,
  );
  const submittedPicks = Math.min(
    nonnegativeInt(totals.submittedPicks),
    scorablePicks,
  );

  const accuracy = scorablePicks === 0 ? 0 : correctPicks / scorablePicks;
  const participationRate =
    scorablePicks === 0 ? 0 : submittedPicks / scorablePicks;

  return {
    accuracy,
    isEligibleForWeeklyPrize:
      scorablePicks > 0 && participationRate >= WEEKLY_PARTICIPATION_FLOOR,
    participationRate,
    potentialPicks,
    scorablePicks,
  };
}

/**
 * Rounds an accuracy fraction to the 4 decimal places the leaderboard stores.
 *
 * Accuracy is persisted as DECIMAL(6,4) specifically to minimise artificial
 * ties from floating-point noise: two genuinely different weeks should not
 * collapse onto the same score and force a tie-split that neither earned.
 */
export function toStoredAccuracy(accuracy: number): number {
  return Math.round(accuracy * 10_000) / 10_000;
}

/**
 * Ranks entries best-first, returning tie groups rather than an arbitrary
 * order.
 *
 * Ties are surfaced instead of broken because the prize rule is an even split
 * among tied entries — a leaderboard that silently picked a winner would
 * misreport who actually won.
 */
export function rankEntries<T extends { accuracy: number }>(
  entries: readonly T[],
): (readonly T[])[] {
  const byScore = new Map<number, T[]>();
  for (const entry of entries) {
    const key = toStoredAccuracy(entry.accuracy);
    const bucket = byScore.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      byScore.set(key, [entry]);
    }
  }
  return [...byScore.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, bucket]) => bucket);
}
