import type {
  BettingMarketType,
  EventResult,
  ResultsPlayerStat,
} from "./interfaces";

/**
 * Pure outcome grading for a single selection against a finished event.
 *
 * Extracted from `settlement.ts` so the Pick 'em grader and the (soon to be
 * removed) bankroll settler share ONE implementation of this math rather than
 * two that can drift. The rules here decide who wins an inter-league
 * competition, so a second copy quietly disagreeing with the first is exactly
 * the failure mode worth designing out — the audit already flags a triplicated
 * hand-rolled Redis client as the same hazard.
 *
 * Deliberately pure: no database, no league context, no I/O. The whole point is
 * that it can be exhaustively tested without a fixture league.
 */

/** Sportsbook-standard outcome vocabulary. */
export type GradedOutcome = "won" | "lost" | "push" | "void";

export interface GradeableSelection {
  readonly marketType: BettingMarketType;
  readonly selection: string;
  readonly lockedLine: number | null;
  /** Player id for prop markets; the market's `subject` column. */
  readonly marketSubject?: string | null;
  readonly propType?: string | null;
}

export interface GradedResult {
  readonly status: GradedOutcome;
  readonly detail: string;
}

/**
 * Floating-point-safe sign test.
 *
 * Lines and scores arrive as numerics, so an exact `=== 0` would miss a genuine
 * push by a rounding hair — and a missed push is graded as a loss, which takes
 * points off a user for an outcome that was never decidable.
 */
function compare(value: number): -1 | 0 | 1 {
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function scoreDetail(result: EventResult): string {
  return `home ${result.homeScore}, away ${result.awayScore}`;
}

function lineDetail(prefix: string, value: number, line: number): string {
  return `${prefix} ${value} vs line ${line}`;
}

function findPlayerStat(
  stats: readonly ResultsPlayerStat[],
  playerId: string | null | undefined,
  propType: string | null | undefined,
): number | null {
  if (!propType || !playerId) {
    return null;
  }
  const player = stats.find((entry) => entry.playerId === playerId);
  const value = player?.stats[propType];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function gradeFromComparison(
  diff: number,
  wantsOverOrHome: boolean,
): "won" | "lost" | "push" {
  const comparison = compare(diff);
  if (comparison === 0) return "push";
  return comparison > 0 === wantsOverOrHome ? "won" : "lost";
}

/**
 * Grades one selection, or returns `null` when the event has not finished and
 * therefore cannot be graded yet.
 *
 * `null` and `void` mean different things and must not be collapsed: `null` is
 * "ask again later", while `void` is "this will never resolve, stop asking".
 */
export function gradeSelection(
  selection: GradeableSelection,
  result: EventResult,
): GradedResult | null {
  if (result.finalStatus === "postponed" || result.finalStatus === "canceled") {
    return { detail: `event ${result.finalStatus}`, status: "void" };
  }
  if (result.finalStatus !== "final") {
    return null;
  }
  if (result.homeScore === null || result.awayScore === null) {
    return { detail: "final result missing score", status: "void" };
  }

  switch (selection.marketType) {
    case "moneyline": {
      const diff = result.homeScore - result.awayScore;
      if (compare(diff) === 0) {
        return { detail: scoreDetail(result), status: "push" };
      }
      return {
        detail: scoreDetail(result),
        status: gradeFromComparison(diff, selection.selection === "home"),
      };
    }
    case "spread": {
      if (selection.lockedLine === null) {
        return { detail: "spread missing locked line", status: "void" };
      }
      const pickedHome = selection.selection === "home";
      const pickedScore = pickedHome ? result.homeScore : result.awayScore;
      const opponentScore = pickedHome ? result.awayScore : result.homeScore;
      const adjustedMargin = pickedScore + selection.lockedLine - opponentScore;
      return {
        detail: lineDetail(
          pickedHome ? "home adjusted margin" : "away adjusted margin",
          adjustedMargin,
          0,
        ),
        status: gradeFromComparison(adjustedMargin, true),
      };
    }
    case "total": {
      if (selection.lockedLine === null) {
        return { detail: "total missing locked line", status: "void" };
      }
      const total = result.homeScore + result.awayScore;
      return {
        detail: lineDetail("total", total, selection.lockedLine),
        status: gradeFromComparison(
          total - selection.lockedLine,
          selection.selection === "over",
        ),
      };
    }
    case "player_prop": {
      if (selection.lockedLine === null) {
        return { detail: "player prop missing locked line", status: "void" };
      }
      const stat = findPlayerStat(
        result.playerStats,
        selection.marketSubject,
        selection.propType,
      );
      if (stat === null) {
        return { detail: "player prop result missing stat", status: "void" };
      }
      const wantsOver =
        selection.selection === "over" || selection.selection === "player_over";
      return {
        detail: lineDetail(
          selection.propType ?? "player_stat",
          stat,
          selection.lockedLine,
        ),
        status: gradeFromComparison(stat - selection.lockedLine, wantsOver),
      };
    }
    default:
      // Unreachable across the current BettingMarketType union, but explicit so
      // adding a market type surfaces here rather than silently grading `void`.
      return { detail: "unsupported market type", status: "void" };
  }
}

/** Pick 'em pick statuses, mirroring `pick_status` in the schema. */
export type PickOutcome = "correct" | "incorrect" | "void";

/**
 * Maps a sportsbook outcome onto a Pick 'em status.
 *
 * A **push becomes `void`, not `incorrect`** — the single most consequential
 * line here. Under absolute-denominator scoring a void pick is subtracted from
 * the denominator entirely, so a user who picked a line that landed exactly on
 * the number is neither rewarded nor punished. Grading it incorrect would take
 * points off for an outcome that was structurally undecidable, and would push
 * users away from whole-number lines, narrowing the pick pool through the back
 * door (IMPLEMENTATION_PLAN.md DD-2).
 */
export function toPickOutcome(outcome: GradedOutcome): PickOutcome {
  switch (outcome) {
    case "won":
      return "correct";
    case "lost":
      return "incorrect";
    case "push":
    case "void":
      return "void";
  }
}
