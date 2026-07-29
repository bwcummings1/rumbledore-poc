import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { picks, pickWeeks } from "@/db/schema";
import { rankEntries, scorePickWeek, toStoredAccuracy } from "./pickem-scoring";

/**
 * Season standings for the inter-league competition.
 *
 * Replaces the arena's PnL/ROI metric (`arena.ts`, built on the bankroll
 * ledger) with collective accuracy. Design of record: `PROJECT_CONTEXT.md` §3.3.
 *
 * ## Why a season is summed, not averaged
 *
 * A season's accuracy is `total correct ÷ total scorable` across all its weeks,
 * NOT the mean of the weekly percentages. Averaging percentages would weight a
 * week where the league made 12 picks the same as one where it made 120, so a
 * league could lift its season score with one strong low-volume week. Summing
 * the underlying counts keeps every pick worth the same amount all season,
 * which is the same reasoning that makes the weekly denominator absolute.
 *
 * ## Participation is reported, never used to adjust the score
 *
 * `eligibleWeeks` counts weeks that cleared the 90% participation floor. It
 * gates weekly prizes only. The season accuracy deliberately includes weeks
 * that missed the floor — a league that skipped picks is already punished by
 * the denominator, and deducting again would punish the same lapse twice.
 */

export interface LeagueSeasonStanding {
  readonly leagueId: string;
  /** correct ÷ scorable across the season, in [0,1]. */
  readonly accuracy: number;
  /** Rounded to the 4dp the leaderboard stores. */
  readonly storedAccuracy: number;
  readonly correctPicks: number;
  readonly scorablePicks: number;
  readonly submittedPicks: number;
  readonly voidPicks: number;
  readonly weeksPlayed: number;
  readonly eligibleWeeks: number;
  /** 1-based. Tied leagues share a rank rather than being ordered arbitrarily. */
  readonly rank: number;
}

export interface LeagueSeasonStandingsInput {
  readonly season: number;
  /** Inclusive week bounds. Omit for the whole season. */
  readonly fromWeek?: number;
  readonly toWeek?: number;
}

interface WeekRow {
  leagueId: string;
  maxPicksPerUser: number;
  rosterSize: number;
  correctPicks: number;
  submittedPicks: number;
  voidPicks: number;
}

/**
 * Computes standings across every league in a season.
 *
 * Runs OUTSIDE a league context on purpose — this is the cross-league
 * aggregation step, and the arena is central by design (`arena_standing` has no
 * restrictive RLS, audit §9.14). It selects only counts and ids, never pick
 * content, so it reveals nothing about which selections any league made.
 */
export async function computeLeagueSeasonStandings(
  db: Db,
  input: LeagueSeasonStandingsInput,
): Promise<LeagueSeasonStanding[]> {
  const filters = [eq(pickWeeks.season, input.season)];
  if (input.fromWeek !== undefined) {
    filters.push(gte(pickWeeks.week, input.fromWeek));
  }
  if (input.toWeek !== undefined) {
    filters.push(lte(pickWeeks.week, input.toWeek));
  }

  // One row per (league, week): the snapshotted denominator inputs plus graded
  // counts. Grouping in SQL keeps this proportional to weeks, not to picks.
  const rows: WeekRow[] = await db
    .select({
      correctPicks: sql<number>`count(${picks.id}) filter (where ${picks.status} = 'correct')::int`,
      leagueId: pickWeeks.leagueId,
      maxPicksPerUser: pickWeeks.maxPicksPerUser,
      rosterSize: pickWeeks.rosterSize,
      submittedPicks: sql<number>`count(${picks.id})::int`,
      voidPicks: sql<number>`count(${picks.id}) filter (where ${picks.status} = 'void')::int`,
    })
    .from(pickWeeks)
    // LEFT join: a week where nobody picked still counts its full denominator.
    // An inner join would silently drop it and flatter the league's accuracy.
    .leftJoin(picks, eq(picks.pickWeekId, pickWeeks.id))
    .where(and(...filters))
    .groupBy(
      pickWeeks.id,
      pickWeeks.leagueId,
      pickWeeks.rosterSize,
      pickWeeks.maxPicksPerUser,
    );

  const byLeague = new Map<
    string,
    {
      correctPicks: number;
      scorablePicks: number;
      submittedPicks: number;
      voidPicks: number;
      weeksPlayed: number;
      eligibleWeeks: number;
    }
  >();

  for (const row of rows) {
    const voidPicks = row.voidPicks;
    const week = scorePickWeek({
      correctPicks: row.correctPicks,
      maxPicksPerUser: row.maxPicksPerUser,
      rosterSize: row.rosterSize,
      // A void pick was submitted but is not scorable, so it must not inflate
      // the participation rate the weekly gate reads.
      submittedPicks: row.submittedPicks - voidPicks,
      voidPicks,
    });

    const acc = byLeague.get(row.leagueId) ?? {
      correctPicks: 0,
      eligibleWeeks: 0,
      scorablePicks: 0,
      submittedPicks: 0,
      voidPicks: 0,
      weeksPlayed: 0,
    };
    acc.correctPicks += row.correctPicks;
    acc.scorablePicks += week.scorablePicks;
    acc.submittedPicks += row.submittedPicks - voidPicks;
    acc.voidPicks += voidPicks;
    acc.weeksPlayed += 1;
    if (week.isEligibleForWeeklyPrize) {
      acc.eligibleWeeks += 1;
    }
    byLeague.set(row.leagueId, acc);
  }

  const unranked = [...byLeague.entries()].map(([leagueId, totals]) => ({
    accuracy:
      totals.scorablePicks === 0
        ? 0
        : totals.correctPicks / totals.scorablePicks,
    leagueId,
    ...totals,
  }));

  // Ties share a rank. The prize rule is an even split among tied entries, so
  // inventing an order here would misreport who actually won.
  const grouped = rankEntries(unranked);
  const standings: LeagueSeasonStanding[] = [];
  let rank = 1;
  for (const group of grouped) {
    for (const entry of group) {
      standings.push({
        accuracy: entry.accuracy,
        correctPicks: entry.correctPicks,
        eligibleWeeks: entry.eligibleWeeks,
        leagueId: entry.leagueId,
        rank,
        scorablePicks: entry.scorablePicks,
        storedAccuracy: toStoredAccuracy(entry.accuracy),
        submittedPicks: entry.submittedPicks,
        voidPicks: entry.voidPicks,
        weeksPlayed: entry.weeksPlayed,
      });
    }
    // Standard competition ranking: after a 2-way tie for 1st, the next is 3rd.
    rank += group.length;
  }

  return standings;
}
