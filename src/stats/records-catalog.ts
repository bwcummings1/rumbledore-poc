import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  championshipRecords,
  dataIntegrityChecks,
  persons,
  seasonStatistics,
  weeklyStatistics,
} from "@/db/schema";
import type { RecordType } from "./engine";

const DEFAULT_CATALOG_LIMIT = 10;

type SeasonStatisticsRow = typeof seasonStatistics.$inferSelect;
type WeeklyStatisticsRow = typeof weeklyStatistics.$inferSelect;
type ChampionshipRecordRow = typeof championshipRecords.$inferSelect;

interface PeriodContext {
  matchupId?: string;
  opponentName: string | null;
  opponentPersonId: string | null;
  personName: string;
  personId: string;
  scoringPeriod: number;
  season: number;
}

export interface AllTimeStandingCatalogRow {
  avgPointsAgainst: number;
  avgPointsFor: number;
  bestSeason: SeasonSummary | null;
  careerLuck: number;
  championships: number;
  games: number;
  losses: number;
  madeChampionships: number;
  personId: string;
  personName: string;
  playoffAppearances: number;
  pointDifferential: number;
  pointsAgainst: number;
  pointsFor: number;
  rank: number;
  regularSeasonTitles: number;
  runnerUps: number;
  seasons: number;
  ties: number;
  winPercentage: number;
  wins: number;
  worstSeason: SeasonSummary | null;
}

export interface SeasonSummary {
  finalPlacement: string;
  finalRank: number;
  losses: number;
  pointsFor: number;
  season: number;
  ties: number;
  winPercentage: number;
  wins: number;
}

export interface WeeklyCatalogEntry extends PeriodContext {
  recordType: Extract<
    RecordType,
    | "best_score_in_loss"
    | "highest_combined_matchup"
    | "highest_single_week_score"
    | "lowest_single_week_score"
    | "worst_score_in_win"
  >;
  value: number;
}

export interface BlowoutCatalogEntry extends PeriodContext {
  margin: number;
  recordType: Extract<RecordType, "biggest_blowout" | "narrowest_win">;
}

export interface StreakCatalogEntry {
  endScoringPeriod: number;
  endSeason: number;
  length: number;
  personId: string;
  personName: string;
  recordType: Extract<RecordType, "longest_loss_streak" | "longest_win_streak">;
  startScoringPeriod: number;
  startSeason: number;
}

export interface RecordsCatalog {
  allTimeStandings: AllTimeStandingCatalogRow[];
  blowouts: {
    biggest: BlowoutCatalogEntry[];
    narrowestWins: BlowoutCatalogEntry[];
  };
  highLow: {
    bestScoresInLosses: WeeklyCatalogEntry[];
    highestCombinedMatchups: WeeklyCatalogEntry[];
    highestScores: WeeklyCatalogEntry[];
    lowestScores: WeeklyCatalogEntry[];
    worstScoresInWins: WeeklyCatalogEntry[];
  };
  integrityBlocked: boolean;
  streaks: {
    longestLosses: StreakCatalogEntry[];
    longestWins: StreakCatalogEntry[];
  };
}

interface AllTimeStandingAccumulator {
  careerLuck: number;
  championships: number;
  games: number;
  losses: number;
  madeChampionships: number;
  personId: string;
  playoffAppearances: number;
  pointsAgainst: number;
  pointsFor: number;
  regularSeasonTitles: number;
  runnerUps: number;
  seasons: SeasonStatisticsRow[];
  ties: number;
  wins: number;
}

interface MatchupCombinedAccumulator {
  matchupId: string;
  rows: WeeklyStatisticsRow[];
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function personName(
  personNames: ReadonlyMap<string, string>,
  personId: string,
) {
  return personNames.get(personId) ?? "Unknown manager";
}

function periodContext(
  row: WeeklyStatisticsRow,
  personNames: ReadonlyMap<string, string>,
): PeriodContext {
  return {
    matchupId: row.matchupId,
    opponentName: row.opponentPersonId
      ? personName(personNames, row.opponentPersonId)
      : null,
    opponentPersonId: row.opponentPersonId,
    personId: row.personId,
    personName: personName(personNames, row.personId),
    scoringPeriod: row.scoringPeriod,
    season: row.season,
  };
}

function compareWeeklyAscending(
  left: WeeklyStatisticsRow,
  right: WeeklyStatisticsRow,
): number {
  return (
    left.season - right.season ||
    left.scoringPeriod - right.scoringPeriod ||
    compareStable(left.personId, right.personId) ||
    compareStable(left.matchupId, right.matchupId)
  );
}

function weeklyTop(
  rows: readonly WeeklyStatisticsRow[],
  recordType: WeeklyCatalogEntry["recordType"],
  personNames: ReadonlyMap<string, string>,
  direction: "max" | "min",
  limit: number,
): WeeklyCatalogEntry[] {
  return [...rows]
    .sort((left, right) => {
      const valueCompare =
        direction === "max"
          ? right.pointsFor - left.pointsFor
          : left.pointsFor - right.pointsFor;
      return valueCompare || compareWeeklyAscending(left, right);
    })
    .slice(0, limit)
    .map((row) => ({
      ...periodContext(row, personNames),
      recordType,
      value: round(row.pointsFor, 4),
    }));
}

function blowoutTop(
  rows: readonly WeeklyStatisticsRow[],
  recordType: BlowoutCatalogEntry["recordType"],
  personNames: ReadonlyMap<string, string>,
  direction: "max" | "min",
  limit: number,
): BlowoutCatalogEntry[] {
  return [...rows]
    .sort((left, right) => {
      const valueCompare =
        direction === "max"
          ? right.margin - left.margin
          : left.margin - right.margin;
      return valueCompare || compareWeeklyAscending(left, right);
    })
    .slice(0, limit)
    .map((row) => ({
      ...periodContext(row, personNames),
      margin: round(row.margin, 4),
      recordType,
    }));
}

function matchupCombinedEntries(
  weeklyRows: readonly WeeklyStatisticsRow[],
  personNames: ReadonlyMap<string, string>,
  limit: number,
): WeeklyCatalogEntry[] {
  const byMatchup = new Map<string, MatchupCombinedAccumulator>();
  for (const row of weeklyRows) {
    const current = byMatchup.get(row.matchupId) ?? {
      matchupId: row.matchupId,
      rows: [],
    };
    current.rows.push(row);
    byMatchup.set(row.matchupId, current);
  }

  return [...byMatchup.values()]
    .map((entry) => {
      const sorted = [...entry.rows].sort(compareWeeklyAscending);
      const first = sorted[0];
      if (!first) {
        return null;
      }
      const winner =
        sorted.find((row) => row.result === "win") ??
        [...sorted].sort(
          (left, right) => right.pointsFor - left.pointsFor,
        )[0] ??
        first;
      return {
        row: winner,
        value: round(first.pointsFor + first.pointsAgainst, 4),
      };
    })
    .filter((entry): entry is { row: WeeklyStatisticsRow; value: number } =>
      Boolean(entry),
    )
    .sort(
      (left, right) =>
        right.value - left.value || compareWeeklyAscending(left.row, right.row),
    )
    .slice(0, limit)
    .map((entry) => ({
      ...periodContext(entry.row, personNames),
      recordType: "highest_combined_matchup",
      value: entry.value,
    }));
}

function seasonSummary(row: SeasonStatisticsRow): SeasonSummary {
  return {
    finalPlacement: row.finalPlacement,
    finalRank: row.finalRank,
    losses: row.losses,
    pointsFor: round(row.pointsFor, 4),
    season: row.season,
    ties: row.ties,
    winPercentage: round(row.winPercentage, 4),
    wins: row.wins,
  };
}

function compareBestSeason(
  left: SeasonStatisticsRow,
  right: SeasonStatisticsRow,
): number {
  return (
    left.finalRank - right.finalRank ||
    right.winPercentage - left.winPercentage ||
    right.pointsFor - left.pointsFor ||
    left.season - right.season ||
    compareStable(left.personId, right.personId)
  );
}

function compareWorstSeason(
  left: SeasonStatisticsRow,
  right: SeasonStatisticsRow,
): number {
  return (
    right.finalRank - left.finalRank ||
    left.winPercentage - right.winPercentage ||
    left.pointsFor - right.pointsFor ||
    left.season - right.season ||
    compareStable(left.personId, right.personId)
  );
}

function buildAllTimeStandings(
  seasonRows: readonly SeasonStatisticsRow[],
  personNames: ReadonlyMap<string, string>,
  championshipRows: readonly ChampionshipRecordRow[] = [],
): AllTimeStandingCatalogRow[] {
  const byPerson = new Map<string, AllTimeStandingAccumulator>();
  const regularSeasonTitles = new Map<string, number>();
  for (const row of championshipRows) {
    if (!row.regularSeasonWinnerPersonId) {
      continue;
    }
    regularSeasonTitles.set(
      row.regularSeasonWinnerPersonId,
      (regularSeasonTitles.get(row.regularSeasonWinnerPersonId) ?? 0) + 1,
    );
  }

  for (const row of seasonRows) {
    const current = byPerson.get(row.personId) ?? {
      careerLuck: 0,
      championships: 0,
      games: 0,
      losses: 0,
      madeChampionships: 0,
      personId: row.personId,
      playoffAppearances: 0,
      pointsAgainst: 0,
      pointsFor: 0,
      regularSeasonTitles: 0,
      runnerUps: 0,
      seasons: [],
      ties: 0,
      wins: 0,
    };
    current.careerLuck = round(current.careerLuck + row.luck, 4);
    current.championships += row.finalPlacement === "champ" ? 1 : 0;
    current.games += row.wins + row.losses + row.ties;
    current.losses += row.losses;
    current.madeChampionships += row.madeChampionship ? 1 : 0;
    current.playoffAppearances += row.madePlayoffs ? 1 : 0;
    current.pointsAgainst = round(current.pointsAgainst + row.pointsAgainst, 4);
    current.pointsFor = round(current.pointsFor + row.pointsFor, 4);
    current.regularSeasonTitles +=
      championshipRows.length === 0 && row.playoffSeed === 1 ? 1 : 0;
    current.runnerUps += row.finalPlacement === "runner_up" ? 1 : 0;
    current.seasons.push(row);
    current.ties += row.ties;
    current.wins += row.wins;
    byPerson.set(row.personId, current);
  }

  return [...byPerson.values()]
    .map((row) => {
      const winPercentage =
        row.games > 0 ? round((row.wins + row.ties * 0.5) / row.games, 4) : 0;
      const bestSeason = [...row.seasons].sort(compareBestSeason)[0] ?? null;
      const worstSeason = [...row.seasons].sort(compareWorstSeason)[0] ?? null;
      return {
        avgPointsAgainst:
          row.games > 0 ? round(row.pointsAgainst / row.games, 4) : 0,
        avgPointsFor: row.games > 0 ? round(row.pointsFor / row.games, 4) : 0,
        bestSeason: bestSeason ? seasonSummary(bestSeason) : null,
        careerLuck: row.careerLuck,
        championships: row.championships,
        games: row.games,
        losses: row.losses,
        madeChampionships: row.madeChampionships,
        personId: row.personId,
        personName: personName(personNames, row.personId),
        playoffAppearances: row.playoffAppearances,
        pointDifferential: round(row.pointsFor - row.pointsAgainst, 4),
        pointsAgainst: row.pointsAgainst,
        pointsFor: row.pointsFor,
        rank: 0,
        regularSeasonTitles:
          regularSeasonTitles.get(row.personId) ?? row.regularSeasonTitles,
        runnerUps: row.runnerUps,
        seasons: row.seasons.length,
        ties: row.ties,
        winPercentage,
        wins: row.wins,
        worstSeason: worstSeason ? seasonSummary(worstSeason) : null,
      };
    })
    .sort(
      (left, right) =>
        right.winPercentage - left.winPercentage ||
        right.championships - left.championships ||
        right.pointsFor - left.pointsFor ||
        left.losses - right.losses ||
        compareStable(left.personName, right.personName) ||
        compareStable(left.personId, right.personId),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function bestStreaks(
  weeklyRows: readonly WeeklyStatisticsRow[],
  personNames: ReadonlyMap<string, string>,
  result: "loss" | "win",
  limit: number,
): StreakCatalogEntry[] {
  const rowsByPerson = new Map<string, WeeklyStatisticsRow[]>();
  for (const row of weeklyRows) {
    if (row.matchupKind !== "head_to_head") {
      continue;
    }
    rowsByPerson.set(row.personId, [
      ...(rowsByPerson.get(row.personId) ?? []),
      row,
    ]);
  }

  const recordType: StreakCatalogEntry["recordType"] =
    result === "win" ? "longest_win_streak" : "longest_loss_streak";
  const streaks: StreakCatalogEntry[] = [];
  for (const [personId, rows] of rowsByPerson) {
    let best: StreakCatalogEntry | null = null;
    let currentStart: WeeklyStatisticsRow | null = null;
    let currentLength = 0;
    let currentEnd: WeeklyStatisticsRow | null = null;

    for (const row of [...rows].sort(compareWeeklyAscending)) {
      if (row.result === result) {
        currentStart ??= row;
        currentEnd = row;
        currentLength += 1;
        continue;
      }

      if (currentStart && currentEnd) {
        const candidate = {
          endScoringPeriod: currentEnd.scoringPeriod,
          endSeason: currentEnd.season,
          length: currentLength,
          personId,
          personName: personName(personNames, personId),
          recordType,
          startScoringPeriod: currentStart.scoringPeriod,
          startSeason: currentStart.season,
        };
        if (!best || compareStreak(candidate, best) < 0) {
          best = candidate;
        }
      }
      currentStart = null;
      currentEnd = null;
      currentLength = 0;
    }

    if (currentStart && currentEnd) {
      const candidate = {
        endScoringPeriod: currentEnd.scoringPeriod,
        endSeason: currentEnd.season,
        length: currentLength,
        personId,
        personName: personName(personNames, personId),
        recordType,
        startScoringPeriod: currentStart.scoringPeriod,
        startSeason: currentStart.season,
      };
      if (!best || compareStreak(candidate, best) < 0) {
        best = candidate;
      }
    }

    if (best && best.length > 0) {
      streaks.push(best);
    }
  }

  return streaks.sort(compareStreak).slice(0, limit);
}

function compareStreak(
  left: StreakCatalogEntry,
  right: StreakCatalogEntry,
): number {
  return (
    right.length - left.length ||
    left.startSeason - right.startSeason ||
    left.startScoringPeriod - right.startScoringPeriod ||
    compareStable(left.personName, right.personName) ||
    compareStable(left.personId, right.personId)
  );
}

export function buildRecordsCatalog(input: {
  championshipRows?: readonly ChampionshipRecordRow[];
  limit?: number;
  personNames: ReadonlyMap<string, string>;
  seasonRows: readonly SeasonStatisticsRow[];
  weeklyRows: readonly WeeklyStatisticsRow[];
}): RecordsCatalog {
  const limit = input.limit ?? DEFAULT_CATALOG_LIMIT;
  const headToHeadRows = input.weeklyRows.filter(
    (row) => row.matchupKind === "head_to_head",
  );
  const winners = headToHeadRows.filter((row) => row.result === "win");
  const losers = input.weeklyRows.filter((row) => row.result === "loss");
  const scoredRows = input.weeklyRows.filter((row) => row.pointsFor > 0);

  return {
    allTimeStandings: buildAllTimeStandings(
      input.seasonRows,
      input.personNames,
      input.championshipRows,
    ),
    blowouts: {
      biggest: blowoutTop(
        winners,
        "biggest_blowout",
        input.personNames,
        "max",
        limit,
      ),
      narrowestWins: blowoutTop(
        winners,
        "narrowest_win",
        input.personNames,
        "min",
        limit,
      ),
    },
    highLow: {
      bestScoresInLosses: weeklyTop(
        losers,
        "best_score_in_loss",
        input.personNames,
        "max",
        limit,
      ),
      highestCombinedMatchups: matchupCombinedEntries(
        headToHeadRows,
        input.personNames,
        limit,
      ),
      highestScores: weeklyTop(
        input.weeklyRows,
        "highest_single_week_score",
        input.personNames,
        "max",
        limit,
      ),
      lowestScores: weeklyTop(
        scoredRows,
        "lowest_single_week_score",
        input.personNames,
        "min",
        limit,
      ),
      worstScoresInWins: weeklyTop(
        winners,
        "worst_score_in_win",
        input.personNames,
        "min",
        limit,
      ),
    },
    integrityBlocked: false,
    streaks: {
      longestLosses: bestStreaks(
        input.weeklyRows,
        input.personNames,
        "loss",
        limit,
      ),
      longestWins: bestStreaks(
        input.weeklyRows,
        input.personNames,
        "win",
        limit,
      ),
    },
  };
}

export async function getLeagueRecordsCatalog(
  db: Db,
  input: { leagueId: string; limit?: number },
): Promise<RecordsCatalog> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const unresolvedFailures = await tx
      .select({ id: dataIntegrityChecks.id })
      .from(dataIntegrityChecks)
      .where(
        and(
          eq(dataIntegrityChecks.leagueId, input.leagueId),
          eq(dataIntegrityChecks.status, "fail"),
        ),
      )
      .limit(1);
    if (unresolvedFailures.length > 0) {
      return {
        allTimeStandings: [],
        blowouts: { biggest: [], narrowestWins: [] },
        highLow: {
          bestScoresInLosses: [],
          highestCombinedMatchups: [],
          highestScores: [],
          lowestScores: [],
          worstScoresInWins: [],
        },
        integrityBlocked: true,
        streaks: { longestLosses: [], longestWins: [] },
      };
    }

    const personRows = await tx
      .select({
        canonicalName: persons.canonicalName,
        id: persons.id,
      })
      .from(persons)
      .where(eq(persons.leagueId, input.leagueId))
      .orderBy(asc(persons.canonicalName));
    const personNames = new Map(
      personRows.map((person) => [person.id, person.canonicalName]),
    );

    const seasonRows = await tx
      .select()
      .from(seasonStatistics)
      .where(eq(seasonStatistics.leagueId, input.leagueId))
      .orderBy(asc(seasonStatistics.season), asc(seasonStatistics.personId));
    const championshipRows = await tx
      .select()
      .from(championshipRecords)
      .where(eq(championshipRecords.leagueId, input.leagueId))
      .orderBy(asc(championshipRecords.season));
    const weeklyRows = await tx
      .select()
      .from(weeklyStatistics)
      .where(eq(weeklyStatistics.leagueId, input.leagueId))
      .orderBy(
        asc(weeklyStatistics.season),
        asc(weeklyStatistics.scoringPeriod),
        asc(weeklyStatistics.matchupId),
        asc(weeklyStatistics.personId),
      );

    return buildRecordsCatalog({
      championshipRows,
      limit: input.limit,
      personNames,
      seasonRows,
      weeklyRows,
    });
  });
}
