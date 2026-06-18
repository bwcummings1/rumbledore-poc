import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  championshipRecords,
  dataIntegrityChecks,
  fantasyRosterEntries,
  headToHeadRecords,
  identityMappings,
  leagueGroupingSeasons,
  leagueSeasonGroupings,
  leagueSeasonSettings,
  persons,
  recordBookAllTimeStandings,
  recordBookMilestones,
  seasonStatistics,
  weeklyStatistics,
} from "@/db/schema";
import type { RecordType } from "./engine";

const DEFAULT_CATALOG_LIMIT = 10;

type SeasonStatisticsRow = typeof seasonStatistics.$inferSelect;
type WeeklyStatisticsRow = typeof weeklyStatistics.$inferSelect;
type ChampionshipRecordRow = typeof championshipRecords.$inferSelect;
type HeadToHeadRecordRow = typeof headToHeadRecords.$inferSelect;
type RecordBookAllTimeStandingRow =
  typeof recordBookAllTimeStandings.$inferSelect;
type RecordBookMilestoneRow = typeof recordBookMilestones.$inferSelect;

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

export interface PersonCatalogRef {
  personId: string;
  personName: string;
}

export interface HeadToHeadStreakSummary extends PersonCatalogRef {
  length: number;
}

export interface ManagerHeadToHeadStreakSummary
  extends HeadToHeadStreakSummary {
  isAgainst: boolean;
}

export interface HeadToHeadPairSide extends PersonCatalogRef {
  avgPoints: number;
  highestScore: number;
  losses: number;
  points: number;
  wins: number;
}

export interface HeadToHeadPairCatalogEntry {
  championshipMeetings: number;
  currentStreak: HeadToHeadStreakSummary | null;
  lastScoringPeriod: number | null;
  lastSeason: number | null;
  longestStreak: HeadToHeadStreakSummary | null;
  meetings: number;
  personA: HeadToHeadPairSide;
  personB: HeadToHeadPairSide;
  playoffMeetings: number;
  season: number;
  ties: number;
}

export interface ManagerHeadToHeadLedgerEntry {
  avgPointsAgainst: number;
  avgPointsFor: number;
  championshipMeetings: number;
  currentStreak: ManagerHeadToHeadStreakSummary | null;
  highestScore: number;
  lastScoringPeriod: number | null;
  lastSeason: number | null;
  longestStreak: ManagerHeadToHeadStreakSummary | null;
  losses: number;
  meetings: number;
  opponentHighestScore: number;
  opponentName: string;
  opponentPersonId: string;
  playoffMeetings: number;
  personId: string;
  personName: string;
  pointsAgainst: number;
  pointsFor: number;
  season: number;
  ties: number;
  wins: number;
}

export interface ChampionshipSeasonCatalogEntry {
  champion: PersonCatalogRef | null;
  championshipScore: number | null;
  regularSeasonWinner: PersonCatalogRef | null;
  runnerUp: PersonCatalogRef | null;
  runnerUpScore: number | null;
  season: number;
  thirdPlace: PersonCatalogRef | null;
}

export interface ManagerChampionshipRecord {
  bestFinish: SeasonSummary | null;
  championshipAppearances: number;
  championshipGameLosses: number;
  championshipGamePointsAgainst: number;
  championshipGamePointsFor: number;
  championshipGameTies: number;
  championshipGameWins: number;
  championships: number;
  personId: string;
  personName: string;
  playoffAppearances: number;
  playoffLosses: number;
  playoffPointsAgainst: number;
  playoffPointsFor: number;
  playoffTies: number;
  playoffWins: number;
  regularSeasonTitles: number;
  runnerUps: number;
  seasons: number;
  thirdPlaces: number;
}

export interface KeeperMilestoneCatalogEntry {
  label: string;
  metadata: Record<string, unknown>;
  milestoneKey: string;
  milestoneType: string;
  personId: string | null;
  personName: string | null;
  providerPlayerId: string | null;
  season: number | null;
  value: number;
}

export interface KeeperMilestoneCatalog {
  entries: KeeperMilestoneCatalogEntry[];
  status: "available" | "unavailable";
  summary: string | null;
}

export interface RecordsCatalog {
  allTimeStandings: AllTimeStandingCatalogRow[];
  blowouts: {
    biggest: BlowoutCatalogEntry[];
    narrowestWins: BlowoutCatalogEntry[];
  };
  championships: {
    managerRecords: ManagerChampionshipRecord[];
    seasons: ChampionshipSeasonCatalogEntry[];
  };
  headToHead: {
    allTimePairs: HeadToHeadPairCatalogEntry[];
    managerLedgers: ManagerHeadToHeadLedgerEntry[];
    seasonPairs: HeadToHeadPairCatalogEntry[];
  };
  highLow: {
    bestScoresInLosses: WeeklyCatalogEntry[];
    highestCombinedMatchups: WeeklyCatalogEntry[];
    highestScores: WeeklyCatalogEntry[];
    lowestScores: WeeklyCatalogEntry[];
    worstScoresInWins: WeeklyCatalogEntry[];
  };
  integrityBlocked: boolean;
  milestones: {
    keeper: KeeperMilestoneCatalog;
  };
  streaks: {
    longestLosses: StreakCatalogEntry[];
    longestWins: StreakCatalogEntry[];
  };
}

export interface RecordBookAggregateRefreshSummary {
  milestones: number;
  standings: number;
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
  scoringPeriods: number;
  seasons: SeasonStatisticsRow[];
  ties: number;
  wins: number;
}

export type RecordBookSegment = "both" | "playoff" | "regular";

export interface RecordBookLens {
  groupingId?: string | null;
  scope?: "all";
  seasonSet?: readonly number[];
  segment?: RecordBookSegment;
}

interface MatchupCombinedAccumulator {
  matchupId: string;
  rows: WeeklyStatisticsRow[];
}

interface HeadToHeadMeetingForCatalog {
  championship: boolean;
  matchupId: string;
  personAId: string;
  personAPoints: number;
  personBId: string;
  personBPoints: number;
  playoff: boolean;
  scoringPeriod: number;
  season: number;
  winnerPersonId: string | null;
}

interface ChampionshipAccumulator {
  championshipAppearances: number;
  championshipGameLosses: number;
  championshipGamePointsAgainst: number;
  championshipGamePointsFor: number;
  championshipGameTies: number;
  championshipGameWins: number;
  championships: number;
  personId: string;
  playoffAppearances: number;
  playoffLosses: number;
  playoffPointsAgainst: number;
  playoffPointsFor: number;
  playoffTies: number;
  playoffWins: number;
  regularSeasonTitles: number;
  runnerUps: number;
  seasons: SeasonStatisticsRow[];
  thirdPlaces: number;
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
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

function personRef(
  personNames: ReadonlyMap<string, string>,
  personId: string | null,
): PersonCatalogRef | null {
  return personId
    ? { personId, personName: personName(personNames, personId) }
    : null;
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
    scoringPeriod: scoringWindowStart(row),
    season: row.season,
  };
}

type ScoringWindowInput = Pick<
  WeeklyStatisticsRow,
  "periodStart" | "scoringPeriod" | "scoringPeriodSpan" | "season"
>;

function scoringWindowStart(row: ScoringWindowInput): number {
  return row.periodStart ?? row.scoringPeriod;
}

function scoringWindowSpan(row: ScoringWindowInput): number {
  return Math.max(1, row.scoringPeriodSpan);
}

function scoringWindowKey(row: ScoringWindowInput): string {
  return `${row.season}:${scoringWindowStart(row)}:${scoringWindowSpan(row)}`;
}

function compareScoringWindow(
  left: ScoringWindowInput,
  right: ScoringWindowInput,
): number {
  return (
    left.season - right.season ||
    scoringWindowStart(left) - scoringWindowStart(right) ||
    scoringWindowSpan(left) - scoringWindowSpan(right) ||
    left.scoringPeriod - right.scoringPeriod
  );
}

function compareWeeklyAscending(
  left: WeeklyStatisticsRow,
  right: WeeklyStatisticsRow,
): number {
  return (
    compareScoringWindow(left, right) ||
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
      scoringPeriods: 0,
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
    current.scoringPeriods +=
      row.avgPointsFor > 0
        ? row.pointsFor / row.avgPointsFor
        : row.wins + row.losses + row.ties;
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
          row.scoringPeriods > 0
            ? round(row.pointsAgainst / row.scoringPeriods, 4)
            : 0,
        avgPointsFor:
          row.scoringPeriods > 0
            ? round(row.pointsFor / row.scoringPeriods, 4)
            : 0,
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

function seasonSummaryFromJson(value: Record<string, unknown> | null) {
  if (!value) {
    return null;
  }
  return {
    finalPlacement:
      typeof value.finalPlacement === "string" ? value.finalPlacement : "out",
    finalRank: typeof value.finalRank === "number" ? value.finalRank : 0,
    losses: typeof value.losses === "number" ? value.losses : 0,
    pointsFor: typeof value.pointsFor === "number" ? value.pointsFor : 0,
    season: typeof value.season === "number" ? value.season : 0,
    ties: typeof value.ties === "number" ? value.ties : 0,
    winPercentage:
      typeof value.winPercentage === "number" ? value.winPercentage : 0,
    wins: typeof value.wins === "number" ? value.wins : 0,
  } satisfies SeasonSummary;
}

function materializedAllTimeStandings(
  rows: readonly RecordBookAllTimeStandingRow[],
  personNames: ReadonlyMap<string, string>,
): AllTimeStandingCatalogRow[] {
  return rows
    .map((row) => ({
      avgPointsAgainst: row.avgPointsAgainst,
      avgPointsFor: row.avgPointsFor,
      bestSeason: seasonSummaryFromJson(row.bestSeason),
      careerLuck: row.careerLuck,
      championships: row.championships,
      games: row.games,
      losses: row.losses,
      madeChampionships: row.madeChampionships,
      personId: row.personId,
      personName: personName(personNames, row.personId),
      playoffAppearances: row.playoffAppearances,
      pointDifferential: row.pointDifferential,
      pointsAgainst: row.pointsAgainst,
      pointsFor: row.pointsFor,
      rank: row.rank,
      regularSeasonTitles: row.regularSeasonTitles,
      runnerUps: row.runnerUps,
      seasons: row.seasons,
      ties: row.ties,
      winPercentage: row.winPercentage,
      wins: row.wins,
      worstSeason: seasonSummaryFromJson(row.worstSeason),
    }))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        compareStable(left.personName, right.personName) ||
        compareStable(left.personId, right.personId),
    );
}

function isDefaultLens(lens?: RecordBookLens): boolean {
  return (
    !lens ||
    (!lens.groupingId &&
      (!lens.seasonSet || lens.seasonSet.length === 0) &&
      (lens.segment === undefined || lens.segment === "both"))
  );
}

function lensSeasonSet(lens?: RecordBookLens): Set<number> | null {
  if (!lens) {
    return null;
  }
  if (lens.seasonSet && lens.seasonSet.length > 0) {
    return new Set(lens.seasonSet);
  }
  return lens.groupingId ? new Set() : null;
}

function personSeasonKey(personId: string, season: number): string {
  return `${personId}:${season}`;
}

function filterWeeklyRowsByLens(
  rows: readonly WeeklyStatisticsRow[],
  lens?: RecordBookLens,
): WeeklyStatisticsRow[] {
  const seasons = lensSeasonSet(lens);
  const segment = lens?.segment ?? "both";
  return rows.filter((row) => {
    if (seasons && !seasons.has(row.season)) {
      return false;
    }
    if (segment === "regular" && row.isPlayoff) {
      return false;
    }
    if (segment === "playoff" && !row.isPlayoff) {
      return false;
    }
    return true;
  });
}

function filterSeasonRowsByLens(
  rows: readonly SeasonStatisticsRow[],
  lens?: RecordBookLens,
): SeasonStatisticsRow[] {
  const seasons = lensSeasonSet(lens);
  if (!seasons) {
    return [...rows];
  }
  return rows.filter((row) => seasons.has(row.season));
}

function filterChampionshipRowsByLens(
  rows: readonly ChampionshipRecordRow[],
  lens?: RecordBookLens,
): ChampionshipRecordRow[] {
  if ((lens?.segment ?? "both") === "regular") {
    return [];
  }
  const seasons = lensSeasonSet(lens);
  if (!seasons) {
    return [...rows];
  }
  return rows.filter((row) => seasons.has(row.season));
}

function derivedSeasonRowsFromWeeklyRows(
  rows: readonly WeeklyStatisticsRow[],
  sourceSeasonRows: readonly SeasonStatisticsRow[] = [],
  lens?: RecordBookLens,
): SeasonStatisticsRow[] {
  const grouped = new Map<string, WeeklyStatisticsRow[]>();
  const byWindow = new Map<string, WeeklyStatisticsRow[]>();
  const sourceByPersonSeason = new Map(
    sourceSeasonRows.map((row) => [
      personSeasonKey(row.personId, row.season),
      row,
    ]),
  );
  for (const row of rows) {
    const key = personSeasonKey(row.personId, row.season);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
    const windowKey = scoringWindowKey(row);
    byWindow.set(windowKey, [...(byWindow.get(windowKey) ?? []), row]);
  }

  const allPlay = new Map<
    string,
    { expectedWins: number; losses: number; ties: number; wins: number }
  >();
  for (const windowRows of byWindow.values()) {
    const scoringRowsByPerson = new Map<string, WeeklyStatisticsRow>();
    for (const row of windowRows) {
      const existing = scoringRowsByPerson.get(row.personId);
      if (
        !existing ||
        (existing.matchupKind !== "head_to_head" &&
          row.matchupKind === "head_to_head") ||
        (existing.matchupKind === row.matchupKind &&
          compareStable(row.matchupId, existing.matchupId) < 0)
      ) {
        scoringRowsByPerson.set(row.personId, row);
      }
    }

    const scoringRows = [...scoringRowsByPerson.values()];
    for (const row of scoringRows) {
      const key = personSeasonKey(row.personId, row.season);
      const entry = allPlay.get(key) ?? {
        expectedWins: 0,
        losses: 0,
        ties: 0,
        wins: 0,
      };
      const opponents = scoringRows.filter(
        (opponent) => opponent.personId !== row.personId,
      );
      let windowWins = 0;
      for (const opponent of opponents) {
        if (row.pointsFor > opponent.pointsFor) {
          entry.wins += 1;
          windowWins += 1;
        } else if (row.pointsFor < opponent.pointsFor) {
          entry.losses += 1;
        } else {
          entry.ties += 1;
        }
      }
      entry.expectedWins +=
        opponents.length > 0 ? windowWins / opponents.length : 0;
      allPlay.set(key, entry);
    }
  }

  const now = new Date(0);
  const segment = lens?.segment ?? "both";
  const seasonRows: SeasonStatisticsRow[] = [];
  for (const [key, groupedRows] of grouped) {
    const [personId, seasonRaw] = key.split(":");
    const season = Number(seasonRaw);
    const sorted = [...groupedRows].sort(compareWeeklyAscending);
    const wins = sorted.filter((row) => row.result === "win").length;
    const losses = sorted.filter((row) => row.result === "loss").length;
    const ties = sorted.filter((row) => row.result === "tie").length;
    const pointsFor = round(
      sorted.reduce((sum, row) => sum + row.pointsFor, 0),
      4,
    );
    const pointsAgainst = round(
      sorted.reduce((sum, row) => sum + row.pointsAgainst, 0),
      4,
    );
    const scoringPeriods = sorted.reduce(
      (sum, row) => sum + Math.max(1, row.scoringPeriodSpan),
      0,
    );
    const scoresFor = sorted.map((row) => row.pointsFor);
    const scoresAgainst = sorted.map((row) => row.pointsAgainst);
    const games = wins + losses + ties;
    const positiveScores = scoresFor.filter((score) => score > 0);
    let currentStreakLength = 0;
    let currentStreakType: SeasonStatisticsRow["currentStreakType"] = null;
    let longestLossStreak = 0;
    let longestWinStreak = 0;

    for (const row of sorted) {
      if (row.result === currentStreakType) {
        currentStreakLength += 1;
      } else {
        currentStreakType = row.result;
        currentStreakLength = 1;
      }
      if (row.result === "win") {
        longestWinStreak = Math.max(longestWinStreak, currentStreakLength);
      }
      if (row.result === "loss") {
        longestLossStreak = Math.max(longestLossStreak, currentStreakLength);
      }
    }

    const source = sourceByPersonSeason.get(key);
    const allPlayRow = allPlay.get(key) ?? {
      expectedWins: 0,
      losses: 0,
      ties: 0,
      wins: 0,
    };
    const expectedWins = round(allPlayRow.expectedWins, 4);
    const preservePostseasonPlacement = segment === "playoff";
    seasonRows.push({
      allPlayLosses: allPlayRow.losses,
      allPlayTies: allPlayRow.ties,
      allPlayWins: allPlayRow.wins,
      avgPointsAgainst:
        scoringPeriods > 0 ? round(pointsAgainst / scoringPeriods, 4) : 0,
      avgPointsFor:
        scoringPeriods > 0 ? round(pointsFor / scoringPeriods, 4) : 0,
      createdAt: now,
      currentStreakLength,
      currentStreakType,
      divisionWinner: source?.divisionWinner ?? false,
      expectedWins,
      finalPlacement: preservePostseasonPlacement
        ? (source?.finalPlacement ?? "out")
        : "out",
      finalRank: preservePostseasonPlacement
        ? (source?.finalRank ?? 0)
        : (source?.playoffSeed ?? 0),
      highestScore: scoresFor.length > 0 ? round(Math.max(...scoresFor), 4) : 0,
      id: `lens-season-${season}-${personId}`,
      leagueId: sorted[0]?.leagueId ?? "",
      longestLossStreak,
      longestWinStreak,
      losses,
      lowestScore:
        positiveScores.length > 0 ? round(Math.min(...positiveScores), 4) : 0,
      luck: round(wins - expectedWins, 4),
      madeChampionship: preservePostseasonPlacement
        ? (source?.madeChampionship ?? sorted.some((row) => row.isChampionship))
        : false,
      madePlayoffs: source?.madePlayoffs ?? sorted.some((row) => row.isPlayoff),
      medianPointsAgainst: round(median(scoresAgainst), 4),
      medianPointsFor: round(median(scoresFor), 4),
      personId,
      playoffSeed: source?.playoffSeed ?? null,
      pointDifferential: round(pointsFor - pointsAgainst, 4),
      pointsAgainst,
      pointsFor,
      scoringStdDev: round(standardDeviation(scoresFor), 4),
      season,
      ties,
      updatedAt: now,
      winPercentage: games > 0 ? round((wins + ties * 0.5) / games, 4) : 0,
      wins,
    });
  }
  return seasonRows;
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
          endScoringPeriod: scoringWindowStart(currentEnd),
          endSeason: currentEnd.season,
          length: currentLength,
          personId,
          personName: personName(personNames, personId),
          recordType,
          startScoringPeriod: scoringWindowStart(currentStart),
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
        endScoringPeriod: scoringWindowStart(currentEnd),
        endSeason: currentEnd.season,
        length: currentLength,
        personId,
        personName: personName(personNames, personId),
        recordType,
        startScoringPeriod: scoringWindowStart(currentStart),
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

function emptyRecordsCatalog(integrityBlocked: boolean): RecordsCatalog {
  return {
    allTimeStandings: [],
    blowouts: { biggest: [], narrowestWins: [] },
    championships: { managerRecords: [], seasons: [] },
    headToHead: { allTimePairs: [], managerLedgers: [], seasonPairs: [] },
    highLow: {
      bestScoresInLosses: [],
      highestCombinedMatchups: [],
      highestScores: [],
      lowestScores: [],
      worstScoresInWins: [],
    },
    integrityBlocked,
    milestones: {
      keeper: {
        entries: [],
        status: "unavailable",
        summary: null,
      },
    },
    streaks: { longestLosses: [], longestWins: [] },
  };
}

function avg(points: number, meetings: number): number {
  return meetings > 0 ? round(points / meetings, 4) : 0;
}

function h2hStreak(
  personNames: ReadonlyMap<string, string>,
  personId: string | null,
  length: number,
): HeadToHeadStreakSummary | null {
  if (!personId || length <= 0) {
    return null;
  }
  return { length, personId, personName: personName(personNames, personId) };
}

function managerH2hStreak(
  personNames: ReadonlyMap<string, string>,
  personId: string,
  streakPersonId: string | null,
  length: number,
): ManagerHeadToHeadStreakSummary | null {
  const streak = h2hStreak(personNames, streakPersonId, length);
  return streak ? { ...streak, isAgainst: streak.personId !== personId } : null;
}

function headToHeadPairEntry(
  row: HeadToHeadRecordRow,
  personNames: ReadonlyMap<string, string>,
): HeadToHeadPairCatalogEntry {
  return {
    championshipMeetings: row.championshipMeetings,
    currentStreak: h2hStreak(
      personNames,
      row.currentStreakPersonId,
      row.currentStreakLength,
    ),
    lastScoringPeriod: row.lastScoringPeriod,
    lastSeason: row.lastSeason,
    longestStreak: h2hStreak(
      personNames,
      row.longestStreakPersonId,
      row.longestStreakLength,
    ),
    meetings: row.meetings,
    personA: {
      avgPoints: avg(row.personAPoints, row.meetings),
      highestScore: round(row.personAHighestScore, 4),
      losses: row.personBWins,
      personId: row.personAId,
      personName: personName(personNames, row.personAId),
      points: round(row.personAPoints, 4),
      wins: row.personAWins,
    },
    personB: {
      avgPoints: avg(row.personBPoints, row.meetings),
      highestScore: round(row.personBHighestScore, 4),
      losses: row.personAWins,
      personId: row.personBId,
      personName: personName(personNames, row.personBId),
      points: round(row.personBPoints, 4),
      wins: row.personBWins,
    },
    playoffMeetings: row.playoffMeetings,
    season: row.season,
    ties: row.ties,
  };
}

function h2hSeasonSortValue(season: number): number {
  return season === 0 ? Number.NEGATIVE_INFINITY : -season;
}

function compareHeadToHeadPair(
  left: HeadToHeadPairCatalogEntry,
  right: HeadToHeadPairCatalogEntry,
): number {
  const leftCombined = left.personA.points + left.personB.points;
  const rightCombined = right.personA.points + right.personB.points;
  return (
    h2hSeasonSortValue(left.season) - h2hSeasonSortValue(right.season) ||
    right.meetings - left.meetings ||
    right.playoffMeetings - left.playoffMeetings ||
    right.championshipMeetings - left.championshipMeetings ||
    rightCombined - leftCombined ||
    compareStable(left.personA.personName, right.personA.personName) ||
    compareStable(left.personB.personName, right.personB.personName) ||
    compareStable(left.personA.personId, right.personA.personId) ||
    compareStable(left.personB.personId, right.personB.personId)
  );
}

function headToHeadMeetingSort(
  left: HeadToHeadMeetingForCatalog,
  right: HeadToHeadMeetingForCatalog,
): number {
  return (
    left.season - right.season ||
    left.scoringPeriod - right.scoringPeriod ||
    compareStable(left.matchupId, right.matchupId)
  );
}

function headToHeadPairKey(
  personAId: string,
  personBId: string,
  season: number,
): string {
  return `${season}:${personAId}:${personBId}`;
}

function canonicalHeadToHeadPair(
  personAId: string,
  personBId: string,
): [string, string] {
  return compareStable(personAId, personBId) <= 0
    ? [personAId, personBId]
    : [personBId, personAId];
}

function headToHeadMeetingGroups(
  rows: readonly WeeklyStatisticsRow[],
): HeadToHeadMeetingForCatalog[] {
  const grouped = new Map<string, WeeklyStatisticsRow[]>();
  for (const row of rows) {
    if (row.matchupKind !== "head_to_head" || !row.opponentPersonId) {
      continue;
    }
    const [personAId, personBId] = canonicalHeadToHeadPair(
      row.personId,
      row.opponentPersonId,
    );
    const key = [
      scoringWindowKey(row),
      row.matchupId,
      personAId,
      personBId,
    ].join(":");
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return [...grouped.values()]
    .map((groupRows) => {
      const first = groupRows[0];
      if (!first?.opponentPersonId) {
        return null;
      }
      const [personAId, personBId] = canonicalHeadToHeadPair(
        first.personId,
        first.opponentPersonId,
      );
      const personARow = groupRows.find((row) => row.personId === personAId);
      const personBRow = groupRows.find((row) => row.personId === personBId);
      if (!personARow || !personBRow) {
        return null;
      }
      const winnerPersonId =
        personARow.pointsFor > personBRow.pointsFor
          ? personAId
          : personBRow.pointsFor > personARow.pointsFor
            ? personBId
            : null;
      return {
        championship: personARow.isChampionship || personBRow.isChampionship,
        matchupId: personARow.matchupId,
        personAId,
        personAPoints: personARow.pointsFor,
        personBId,
        personBPoints: personBRow.pointsFor,
        playoff: personARow.isPlayoff || personBRow.isPlayoff,
        scoringPeriod: scoringWindowStart(personARow),
        season: personARow.season,
        winnerPersonId,
      } satisfies HeadToHeadMeetingForCatalog;
    })
    .filter((meeting): meeting is HeadToHeadMeetingForCatalog =>
      Boolean(meeting),
    )
    .sort(headToHeadMeetingSort);
}

function streakSummaryFromMeetings(
  meetings: readonly HeadToHeadMeetingForCatalog[],
  personNames: ReadonlyMap<string, string>,
  mode: "current" | "longest",
): HeadToHeadStreakSummary | null {
  let currentPersonId: string | null = null;
  let currentLength = 0;
  let bestPersonId: string | null = null;
  let bestLength = 0;

  for (const meeting of meetings) {
    if (!meeting.winnerPersonId) {
      currentPersonId = null;
      currentLength = 0;
      continue;
    }
    if (meeting.winnerPersonId === currentPersonId) {
      currentLength += 1;
    } else {
      currentPersonId = meeting.winnerPersonId;
      currentLength = 1;
    }
    if (currentLength > bestLength) {
      bestPersonId = currentPersonId;
      bestLength = currentLength;
    }
  }

  const personId = mode === "current" ? currentPersonId : bestPersonId;
  const length = mode === "current" ? currentLength : bestLength;
  return h2hStreak(personNames, personId, length);
}

function headToHeadPairEntryFromMeetings(
  meetings: readonly HeadToHeadMeetingForCatalog[],
  personNames: ReadonlyMap<string, string>,
  season: number,
): HeadToHeadPairCatalogEntry | null {
  const first = meetings[0];
  if (!first) {
    return null;
  }
  const sorted = [...meetings].sort(headToHeadMeetingSort);
  const personAId = first.personAId;
  const personBId = first.personBId;
  const personAWins = sorted.filter(
    (meeting) => meeting.winnerPersonId === personAId,
  ).length;
  const personBWins = sorted.filter(
    (meeting) => meeting.winnerPersonId === personBId,
  ).length;
  const ties = sorted.filter((meeting) => !meeting.winnerPersonId).length;
  const personAPoints = round(
    sorted.reduce((sum, meeting) => sum + meeting.personAPoints, 0),
    4,
  );
  const personBPoints = round(
    sorted.reduce((sum, meeting) => sum + meeting.personBPoints, 0),
    4,
  );
  const last = sorted.at(-1) ?? null;

  return {
    championshipMeetings: sorted.filter((meeting) => meeting.championship)
      .length,
    currentStreak: streakSummaryFromMeetings(sorted, personNames, "current"),
    lastScoringPeriod: last?.scoringPeriod ?? null,
    lastSeason: last?.season ?? null,
    longestStreak: streakSummaryFromMeetings(sorted, personNames, "longest"),
    meetings: sorted.length,
    personA: {
      avgPoints: avg(personAPoints, sorted.length),
      highestScore:
        sorted.length > 0
          ? round(Math.max(...sorted.map((meeting) => meeting.personAPoints)))
          : 0,
      losses: personBWins,
      personId: personAId,
      personName: personName(personNames, personAId),
      points: personAPoints,
      wins: personAWins,
    },
    personB: {
      avgPoints: avg(personBPoints, sorted.length),
      highestScore:
        sorted.length > 0
          ? round(Math.max(...sorted.map((meeting) => meeting.personBPoints)))
          : 0,
      losses: personAWins,
      personId: personBId,
      personName: personName(personNames, personBId),
      points: personBPoints,
      wins: personBWins,
    },
    playoffMeetings: sorted.filter((meeting) => meeting.playoff).length,
    season,
    ties,
  };
}

function buildHeadToHeadCatalogFromWeeklyRows(
  rows: readonly WeeklyStatisticsRow[],
  personNames: ReadonlyMap<string, string>,
): RecordsCatalog["headToHead"] {
  const meetings = headToHeadMeetingGroups(rows);
  const byPair = new Map<string, HeadToHeadMeetingForCatalog[]>();
  for (const meeting of meetings) {
    for (const season of [0, meeting.season]) {
      const key = headToHeadPairKey(
        meeting.personAId,
        meeting.personBId,
        season,
      );
      byPair.set(key, [...(byPair.get(key) ?? []), meeting]);
    }
  }

  const pairs = [...byPair.entries()]
    .map(([key, pairMeetings]) => {
      const [seasonRaw] = key.split(":");
      return headToHeadPairEntryFromMeetings(
        pairMeetings,
        personNames,
        Number(seasonRaw),
      );
    })
    .filter((pair): pair is HeadToHeadPairCatalogEntry => Boolean(pair))
    .sort(compareHeadToHeadPair);

  return {
    allTimePairs: pairs.filter((row) => row.season === 0),
    managerLedgers: pairs
      .flatMap((row) => [
        {
          avgPointsAgainst: row.personB.avgPoints,
          avgPointsFor: row.personA.avgPoints,
          championshipMeetings: row.championshipMeetings,
          currentStreak: row.currentStreak
            ? {
                ...row.currentStreak,
                isAgainst: row.currentStreak.personId !== row.personA.personId,
              }
            : null,
          highestScore: row.personA.highestScore,
          lastScoringPeriod: row.lastScoringPeriod,
          lastSeason: row.lastSeason,
          longestStreak: row.longestStreak
            ? {
                ...row.longestStreak,
                isAgainst: row.longestStreak.personId !== row.personA.personId,
              }
            : null,
          losses: row.personA.losses,
          meetings: row.meetings,
          opponentHighestScore: row.personB.highestScore,
          opponentName: row.personB.personName,
          opponentPersonId: row.personB.personId,
          personId: row.personA.personId,
          personName: row.personA.personName,
          playoffMeetings: row.playoffMeetings,
          pointsAgainst: row.personB.points,
          pointsFor: row.personA.points,
          season: row.season,
          ties: row.ties,
          wins: row.personA.wins,
        },
        {
          avgPointsAgainst: row.personA.avgPoints,
          avgPointsFor: row.personB.avgPoints,
          championshipMeetings: row.championshipMeetings,
          currentStreak: row.currentStreak
            ? {
                ...row.currentStreak,
                isAgainst: row.currentStreak.personId !== row.personB.personId,
              }
            : null,
          highestScore: row.personB.highestScore,
          lastScoringPeriod: row.lastScoringPeriod,
          lastSeason: row.lastSeason,
          longestStreak: row.longestStreak
            ? {
                ...row.longestStreak,
                isAgainst: row.longestStreak.personId !== row.personB.personId,
              }
            : null,
          losses: row.personB.losses,
          meetings: row.meetings,
          opponentHighestScore: row.personA.highestScore,
          opponentName: row.personA.personName,
          opponentPersonId: row.personA.personId,
          personId: row.personB.personId,
          personName: row.personB.personName,
          playoffMeetings: row.playoffMeetings,
          pointsAgainst: row.personA.points,
          pointsFor: row.personB.points,
          season: row.season,
          ties: row.ties,
          wins: row.personB.wins,
        },
      ])
      .sort(compareManagerLedger),
    seasonPairs: pairs.filter((row) => row.season !== 0),
  };
}

function managerLedgerEntry(
  row: HeadToHeadRecordRow,
  personNames: ReadonlyMap<string, string>,
  side: "a" | "b",
): ManagerHeadToHeadLedgerEntry {
  const isA = side === "a";
  const personId = isA ? row.personAId : row.personBId;
  const opponentPersonId = isA ? row.personBId : row.personAId;
  const wins = isA ? row.personAWins : row.personBWins;
  const losses = isA ? row.personBWins : row.personAWins;
  const pointsFor = isA ? row.personAPoints : row.personBPoints;
  const pointsAgainst = isA ? row.personBPoints : row.personAPoints;
  const highestScore = isA ? row.personAHighestScore : row.personBHighestScore;
  const opponentHighestScore = isA
    ? row.personBHighestScore
    : row.personAHighestScore;

  return {
    avgPointsAgainst: avg(pointsAgainst, row.meetings),
    avgPointsFor: avg(pointsFor, row.meetings),
    championshipMeetings: row.championshipMeetings,
    currentStreak: managerH2hStreak(
      personNames,
      personId,
      row.currentStreakPersonId,
      row.currentStreakLength,
    ),
    highestScore: round(highestScore, 4),
    lastScoringPeriod: row.lastScoringPeriod,
    lastSeason: row.lastSeason,
    longestStreak: managerH2hStreak(
      personNames,
      personId,
      row.longestStreakPersonId,
      row.longestStreakLength,
    ),
    losses,
    meetings: row.meetings,
    opponentHighestScore: round(opponentHighestScore, 4),
    opponentName: personName(personNames, opponentPersonId),
    opponentPersonId,
    personId,
    personName: personName(personNames, personId),
    playoffMeetings: row.playoffMeetings,
    pointsAgainst: round(pointsAgainst, 4),
    pointsFor: round(pointsFor, 4),
    season: row.season,
    ties: row.ties,
    wins,
  };
}

function compareManagerLedger(
  left: ManagerHeadToHeadLedgerEntry,
  right: ManagerHeadToHeadLedgerEntry,
): number {
  return (
    compareStable(left.personName, right.personName) ||
    compareStable(left.personId, right.personId) ||
    h2hSeasonSortValue(left.season) - h2hSeasonSortValue(right.season) ||
    right.meetings - left.meetings ||
    compareStable(left.opponentName, right.opponentName) ||
    compareStable(left.opponentPersonId, right.opponentPersonId)
  );
}

function buildHeadToHeadCatalog(
  rows: readonly HeadToHeadRecordRow[],
  personNames: ReadonlyMap<string, string>,
): RecordsCatalog["headToHead"] {
  const pairs = rows
    .map((row) => headToHeadPairEntry(row, personNames))
    .sort(compareHeadToHeadPair);
  const managerLedgers = rows
    .flatMap((row) => [
      managerLedgerEntry(row, personNames, "a"),
      managerLedgerEntry(row, personNames, "b"),
    ])
    .sort(compareManagerLedger);

  return {
    allTimePairs: pairs.filter((row) => row.season === 0),
    managerLedgers,
    seasonPairs: pairs.filter((row) => row.season !== 0),
  };
}

function milestoneStatus(
  rows: readonly RecordBookMilestoneRow[],
): KeeperMilestoneCatalog["status"] {
  return rows.some((row) => row.status === "available")
    ? "available"
    : "unavailable";
}

function buildKeeperMilestoneCatalog(
  rows: readonly RecordBookMilestoneRow[],
  personNames: ReadonlyMap<string, string>,
): KeeperMilestoneCatalog {
  const status = milestoneStatus(rows);
  const availableRows = rows.filter((row) => row.status === "available");
  const entries = availableRows
    .map((row) => ({
      label: row.label,
      metadata: row.metadata,
      milestoneKey: row.milestoneKey,
      milestoneType: row.milestoneType,
      personId: row.personId,
      personName: row.personId ? personName(personNames, row.personId) : null,
      providerPlayerId: row.providerPlayerId,
      season: row.season,
      value: row.value,
    }))
    .sort(
      (left, right) =>
        right.value - left.value ||
        compareStable(left.label, right.label) ||
        compareStable(left.milestoneKey, right.milestoneKey),
    );
  return {
    entries,
    status,
    summary:
      status === "available"
        ? `${entries.length} keeper milestone${entries.length === 1 ? "" : "s"} materialized`
        : null,
  };
}

function ensureChampionshipAccumulator(
  rowsByPerson: Map<string, ChampionshipAccumulator>,
  personId: string,
): ChampionshipAccumulator {
  const current = rowsByPerson.get(personId);
  if (current) {
    return current;
  }
  const next = {
    championshipAppearances: 0,
    championshipGameLosses: 0,
    championshipGamePointsAgainst: 0,
    championshipGamePointsFor: 0,
    championshipGameTies: 0,
    championshipGameWins: 0,
    championships: 0,
    personId,
    playoffAppearances: 0,
    playoffLosses: 0,
    playoffPointsAgainst: 0,
    playoffPointsFor: 0,
    playoffTies: 0,
    playoffWins: 0,
    regularSeasonTitles: 0,
    runnerUps: 0,
    seasons: [],
    thirdPlaces: 0,
  };
  rowsByPerson.set(personId, next);
  return next;
}

function addPlacementCount(
  rowsByPerson: Map<string, ChampionshipAccumulator>,
  personId: string | null,
  key: "championships" | "regularSeasonTitles" | "runnerUps" | "thirdPlaces",
) {
  if (!personId) {
    return;
  }
  ensureChampionshipAccumulator(rowsByPerson, personId)[key] += 1;
}

function addPlayoffFact(
  rowsByPerson: Map<string, ChampionshipAccumulator>,
  row: WeeklyStatisticsRow,
) {
  if (row.matchupKind !== "head_to_head" || !row.isPlayoff) {
    return;
  }
  const current = ensureChampionshipAccumulator(rowsByPerson, row.personId);
  current.playoffPointsFor = round(current.playoffPointsFor + row.pointsFor, 4);
  current.playoffPointsAgainst = round(
    current.playoffPointsAgainst + row.pointsAgainst,
    4,
  );
  if (row.result === "win") {
    current.playoffWins += 1;
  } else if (row.result === "loss") {
    current.playoffLosses += 1;
  } else {
    current.playoffTies += 1;
  }

  if (!row.isChampionship) {
    return;
  }
  current.championshipGamePointsFor = round(
    current.championshipGamePointsFor + row.pointsFor,
    4,
  );
  current.championshipGamePointsAgainst = round(
    current.championshipGamePointsAgainst + row.pointsAgainst,
    4,
  );
  if (row.result === "win") {
    current.championshipGameWins += 1;
  } else if (row.result === "loss") {
    current.championshipGameLosses += 1;
  } else {
    current.championshipGameTies += 1;
  }
}

function compareChampionshipManagerRecord(
  left: ManagerChampionshipRecord,
  right: ManagerChampionshipRecord,
): number {
  return (
    right.championships - left.championships ||
    right.runnerUps - left.runnerUps ||
    right.regularSeasonTitles - left.regularSeasonTitles ||
    right.playoffAppearances - left.playoffAppearances ||
    right.playoffWins - left.playoffWins ||
    left.playoffLosses - right.playoffLosses ||
    compareStable(left.personName, right.personName) ||
    compareStable(left.personId, right.personId)
  );
}

function buildChampionshipCatalog({
  championshipRows,
  personNames,
  seasonRows,
  weeklyRows,
}: {
  championshipRows: readonly ChampionshipRecordRow[];
  personNames: ReadonlyMap<string, string>;
  seasonRows: readonly SeasonStatisticsRow[];
  weeklyRows: readonly WeeklyStatisticsRow[];
}): RecordsCatalog["championships"] {
  const rowsByPerson = new Map<string, ChampionshipAccumulator>();
  const championshipSeasons = new Set(
    championshipRows.map((row) => row.season),
  );

  for (const row of seasonRows) {
    const current = ensureChampionshipAccumulator(rowsByPerson, row.personId);
    current.seasons.push(row);
    current.playoffAppearances += row.madePlayoffs ? 1 : 0;
    current.championshipAppearances += row.madeChampionship ? 1 : 0;
    if (championshipSeasons.has(row.season)) {
      continue;
    }
    current.championships += row.finalPlacement === "champ" ? 1 : 0;
    current.runnerUps += row.finalPlacement === "runner_up" ? 1 : 0;
    current.thirdPlaces += row.finalPlacement === "third" ? 1 : 0;
    current.regularSeasonTitles += row.playoffSeed === 1 ? 1 : 0;
  }

  for (const row of championshipRows) {
    addPlacementCount(rowsByPerson, row.championPersonId, "championships");
    addPlacementCount(rowsByPerson, row.runnerUpPersonId, "runnerUps");
    addPlacementCount(rowsByPerson, row.thirdPlacePersonId, "thirdPlaces");
    addPlacementCount(
      rowsByPerson,
      row.regularSeasonWinnerPersonId,
      "regularSeasonTitles",
    );
  }

  for (const row of weeklyRows) {
    addPlayoffFact(rowsByPerson, row);
  }

  return {
    managerRecords: [...rowsByPerson.values()]
      .map((row) => {
        const bestSeason = [...row.seasons].sort(compareBestSeason)[0] ?? null;
        return {
          bestFinish: bestSeason ? seasonSummary(bestSeason) : null,
          championshipAppearances: row.championshipAppearances,
          championshipGameLosses: row.championshipGameLosses,
          championshipGamePointsAgainst: row.championshipGamePointsAgainst,
          championshipGamePointsFor: row.championshipGamePointsFor,
          championshipGameTies: row.championshipGameTies,
          championshipGameWins: row.championshipGameWins,
          championships: row.championships,
          personId: row.personId,
          personName: personName(personNames, row.personId),
          playoffAppearances: row.playoffAppearances,
          playoffLosses: row.playoffLosses,
          playoffPointsAgainst: row.playoffPointsAgainst,
          playoffPointsFor: row.playoffPointsFor,
          playoffTies: row.playoffTies,
          playoffWins: row.playoffWins,
          regularSeasonTitles: row.regularSeasonTitles,
          runnerUps: row.runnerUps,
          seasons: row.seasons.length,
          thirdPlaces: row.thirdPlaces,
        };
      })
      .sort(compareChampionshipManagerRecord),
    seasons: championshipRows
      .map((row) => ({
        champion: personRef(personNames, row.championPersonId),
        championshipScore: row.championshipScore,
        regularSeasonWinner: personRef(
          personNames,
          row.regularSeasonWinnerPersonId,
        ),
        runnerUp: personRef(personNames, row.runnerUpPersonId),
        runnerUpScore: row.runnerUpScore,
        season: row.season,
        thirdPlace: personRef(personNames, row.thirdPlacePersonId),
      }))
      .sort((left, right) => right.season - left.season),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareStable(left, right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function standingValues(
  leagueId: string,
  row: AllTimeStandingCatalogRow,
): typeof recordBookAllTimeStandings.$inferInsert {
  return {
    avgPointsAgainst: row.avgPointsAgainst,
    avgPointsFor: row.avgPointsFor,
    bestSeason: row.bestSeason as unknown as Record<string, unknown> | null,
    careerLuck: row.careerLuck,
    championships: row.championships,
    games: row.games,
    leagueId,
    losses: row.losses,
    madeChampionships: row.madeChampionships,
    personId: row.personId,
    playoffAppearances: row.playoffAppearances,
    pointDifferential: row.pointDifferential,
    pointsAgainst: row.pointsAgainst,
    pointsFor: row.pointsFor,
    rank: row.rank,
    regularSeasonTitles: row.regularSeasonTitles,
    runnerUps: row.runnerUps,
    seasons: row.seasons,
    ties: row.ties,
    winPercentage: row.winPercentage,
    wins: row.wins,
    worstSeason: row.worstSeason as unknown as Record<string, unknown> | null,
  };
}

function standingChanged(
  existing: RecordBookAllTimeStandingRow,
  target: AllTimeStandingCatalogRow,
): boolean {
  const values = standingValues(existing.leagueId, target);
  return (
    existing.rank !== values.rank ||
    existing.seasons !== values.seasons ||
    existing.games !== values.games ||
    existing.wins !== values.wins ||
    existing.losses !== values.losses ||
    existing.ties !== values.ties ||
    existing.winPercentage !== values.winPercentage ||
    existing.pointsFor !== values.pointsFor ||
    existing.pointsAgainst !== values.pointsAgainst ||
    existing.avgPointsFor !== values.avgPointsFor ||
    existing.avgPointsAgainst !== values.avgPointsAgainst ||
    existing.pointDifferential !== values.pointDifferential ||
    existing.careerLuck !== values.careerLuck ||
    existing.championships !== values.championships ||
    existing.runnerUps !== values.runnerUps ||
    existing.playoffAppearances !== values.playoffAppearances ||
    existing.madeChampionships !== values.madeChampionships ||
    existing.regularSeasonTitles !== values.regularSeasonTitles ||
    stableJson(existing.bestSeason) !== stableJson(values.bestSeason) ||
    stableJson(existing.worstSeason) !== stableJson(values.worstSeason)
  );
}

async function refreshAllTimeStandingAggregates(
  tx: LeagueScopedTx,
  leagueId: string,
  personNames: ReadonlyMap<string, string>,
): Promise<number> {
  const seasonRows = await tx
    .select()
    .from(seasonStatistics)
    .where(eq(seasonStatistics.leagueId, leagueId))
    .orderBy(asc(seasonStatistics.season), asc(seasonStatistics.personId));
  const championshipRows = await tx
    .select()
    .from(championshipRecords)
    .where(eq(championshipRecords.leagueId, leagueId))
    .orderBy(asc(championshipRecords.season));
  const targets = buildAllTimeStandings(
    seasonRows,
    personNames,
    championshipRows,
  );
  const existingRows = await tx
    .select()
    .from(recordBookAllTimeStandings)
    .where(eq(recordBookAllTimeStandings.leagueId, leagueId));
  const existingByPerson = new Map(
    existingRows.map((row) => [row.personId, row]),
  );
  const targetPersonIds = new Set(targets.map((row) => row.personId));
  let writes = 0;

  for (const target of targets) {
    const existing = existingByPerson.get(target.personId);
    const values = standingValues(leagueId, target);
    if (!existing) {
      await tx.insert(recordBookAllTimeStandings).values(values);
      writes += 1;
      continue;
    }
    if (!standingChanged(existing, target)) {
      continue;
    }
    await tx
      .update(recordBookAllTimeStandings)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(recordBookAllTimeStandings.id, existing.id));
    writes += 1;
  }

  const staleIds = existingRows
    .filter((row) => !targetPersonIds.has(row.personId))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await tx
      .delete(recordBookAllTimeStandings)
      .where(inArray(recordBookAllTimeStandings.id, staleIds));
    writes += staleIds.length;
  }

  return writes;
}

interface MilestoneTarget {
  label: string;
  metadata: Record<string, unknown>;
  milestoneKey: string;
  milestoneType: string;
  personId: string | null;
  providerPlayerId: string | null;
  season: number | null;
  status: "available" | "unavailable";
  value: number;
}

interface KeeperPlayerRun {
  displayName: string;
  earliestKeptSince: number | null;
  latestSeason: number;
  personId: string;
  providerPlayerId: string;
  seasons: Set<number>;
}

function teamSeasonKey(providerTeamId: string, season: number): string {
  return `${providerTeamId}\u001f${season}`;
}

function keeperMetadataName(metadata: Record<string, unknown>): string | null {
  for (const key of ["playerName", "fullName", "name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function keptSinceSeason(metadata: Record<string, unknown>): number | null {
  const value = metadata.keptSinceSeason;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

async function buildKeeperMilestoneTargets(
  tx: LeagueScopedTx,
  leagueId: string,
  personNames: ReadonlyMap<string, string>,
): Promise<MilestoneTarget[]> {
  const settingsRows = await tx
    .select({
      isDynastyLeague: leagueSeasonSettings.isDynastyLeague,
      isKeeperLeague: leagueSeasonSettings.isKeeperLeague,
      keeperSettings: leagueSeasonSettings.keeperSettings,
      season: leagueSeasonSettings.season,
    })
    .from(leagueSeasonSettings)
    .where(eq(leagueSeasonSettings.leagueId, leagueId))
    .orderBy(asc(leagueSeasonSettings.season));
  const keeperRows = await tx
    .select({
      metadata: fantasyRosterEntries.metadata,
      providerPlayerId: fantasyRosterEntries.providerPlayerId,
      providerTeamId: fantasyRosterEntries.providerTeamId,
      season: fantasyRosterEntries.season,
    })
    .from(fantasyRosterEntries)
    .where(
      and(
        eq(fantasyRosterEntries.leagueId, leagueId),
        eq(fantasyRosterEntries.isKeeper, true),
      ),
    )
    .orderBy(
      asc(fantasyRosterEntries.season),
      asc(fantasyRosterEntries.providerTeamId),
      asc(fantasyRosterEntries.providerPlayerId),
    );
  const mappingRows = await tx
    .select({
      personId: identityMappings.personId,
      providerTeamId: identityMappings.providerTeamId,
      season: identityMappings.season,
    })
    .from(identityMappings)
    .where(eq(identityMappings.leagueId, leagueId));
  const mappingByTeamSeason = new Map(
    mappingRows.map((row) => [
      teamSeasonKey(row.providerTeamId, row.season),
      row.personId,
    ]),
  );
  const hasKeeperSettings = settingsRows.some(
    (row) =>
      row.isKeeperLeague ||
      row.isDynastyLeague ||
      Object.keys(row.keeperSettings).length > 0,
  );
  if (!hasKeeperSettings && keeperRows.length === 0) {
    return [
      {
        label: "Keeper milestones unavailable",
        metadata: { reason: "provider_has_no_keeper_dynasty_signal" },
        milestoneKey: "keeper_dynasty:unavailable",
        milestoneType: "keeper_dynasty_support",
        personId: null,
        providerPlayerId: null,
        season: null,
        status: "unavailable",
        value: 0,
      },
    ];
  }

  const targets: MilestoneTarget[] = [
    {
      label: "Keeper and dynasty signal available",
      metadata: {
        keeperRosterEntries: keeperRows.length,
        seasons: settingsRows.map((row) => row.season),
      },
      milestoneKey: "keeper_dynasty:support",
      milestoneType: "keeper_dynasty_support",
      personId: null,
      providerPlayerId: null,
      season: settingsRows.at(-1)?.season ?? null,
      status: "available",
      value: keeperRows.length,
    },
  ];

  const keeperSeasonsByPerson = new Map<string, Set<string>>();
  const playerRuns = new Map<string, KeeperPlayerRun>();

  for (const row of keeperRows) {
    const personId = mappingByTeamSeason.get(
      teamSeasonKey(row.providerTeamId, row.season),
    );
    if (!personId) {
      continue;
    }
    const keeperKey = `${row.providerPlayerId}:${row.season}`;
    keeperSeasonsByPerson.set(
      personId,
      keeperSeasonsByPerson.get(personId) ?? new Set(),
    );
    keeperSeasonsByPerson.get(personId)?.add(keeperKey);

    const runKey = `${personId}\u001f${row.providerPlayerId}`;
    const current = playerRuns.get(runKey) ?? {
      displayName:
        keeperMetadataName(row.metadata) ?? `Player ${row.providerPlayerId}`,
      earliestKeptSince: null,
      latestSeason: row.season,
      personId,
      providerPlayerId: row.providerPlayerId,
      seasons: new Set<number>(),
    };
    const keptSince = keptSinceSeason(row.metadata);
    current.earliestKeptSince =
      keptSince === null
        ? current.earliestKeptSince
        : Math.min(current.earliestKeptSince ?? keptSince, keptSince);
    current.latestSeason = Math.max(current.latestSeason, row.season);
    current.seasons.add(row.season);
    playerRuns.set(runKey, current);
  }

  for (const [personId, keeperSeasons] of keeperSeasonsByPerson) {
    targets.push({
      label: `${personName(personNames, personId)} keeper seasons`,
      metadata: { uniquePlayerSeasons: keeperSeasons.size },
      milestoneKey: `person:${personId}:keeper_count`,
      milestoneType: "keeper_count",
      personId,
      providerPlayerId: null,
      season: null,
      status: "available",
      value: keeperSeasons.size,
    });
  }

  const longestByPerson = new Map<string, KeeperPlayerRun>();
  for (const run of playerRuns.values()) {
    const duration =
      run.earliestKeptSince === null
        ? run.seasons.size
        : run.latestSeason - run.earliestKeptSince + 1;
    const current = longestByPerson.get(run.personId);
    const currentDuration = current
      ? current.earliestKeptSince === null
        ? current.seasons.size
        : current.latestSeason - current.earliestKeptSince + 1
      : -1;
    if (
      !current ||
      duration > currentDuration ||
      (duration === currentDuration &&
        compareStable(run.displayName, current.displayName) < 0)
    ) {
      longestByPerson.set(run.personId, run);
    }
  }

  for (const run of longestByPerson.values()) {
    const duration =
      run.earliestKeptSince === null
        ? run.seasons.size
        : run.latestSeason - run.earliestKeptSince + 1;
    targets.push({
      label: `${personName(personNames, run.personId)} kept ${run.displayName}`,
      metadata: {
        displayName: run.displayName,
        keptSinceSeason: run.earliestKeptSince,
        seasons: [...run.seasons].sort((left, right) => left - right),
      },
      milestoneKey: `person:${run.personId}:longest_kept_player`,
      milestoneType: "longest_kept_player",
      personId: run.personId,
      providerPlayerId: run.providerPlayerId,
      season: run.latestSeason,
      status: "available",
      value: duration,
    });
  }

  return targets.sort((left, right) =>
    compareStable(left.milestoneKey, right.milestoneKey),
  );
}

function milestoneValues(
  leagueId: string,
  target: MilestoneTarget,
): typeof recordBookMilestones.$inferInsert {
  return {
    label: target.label,
    leagueId,
    metadata: target.metadata,
    milestoneKey: target.milestoneKey,
    milestoneType: target.milestoneType,
    personId: target.personId,
    providerPlayerId: target.providerPlayerId,
    season: target.season,
    status: target.status,
    value: target.value,
  };
}

function milestoneChanged(
  existing: RecordBookMilestoneRow,
  target: MilestoneTarget,
): boolean {
  const values = milestoneValues(existing.leagueId, target);
  return (
    existing.label !== values.label ||
    existing.milestoneType !== values.milestoneType ||
    existing.status !== values.status ||
    existing.personId !== values.personId ||
    existing.providerPlayerId !== values.providerPlayerId ||
    existing.season !== values.season ||
    existing.value !== values.value ||
    stableJson(existing.metadata) !== stableJson(values.metadata)
  );
}

async function refreshMilestoneAggregates(
  tx: LeagueScopedTx,
  leagueId: string,
  personNames: ReadonlyMap<string, string>,
): Promise<number> {
  const targets = await buildKeeperMilestoneTargets(tx, leagueId, personNames);
  const existingRows = await tx
    .select()
    .from(recordBookMilestones)
    .where(eq(recordBookMilestones.leagueId, leagueId));
  const existingByKey = new Map(
    existingRows.map((row) => [row.milestoneKey, row]),
  );
  const targetKeys = new Set(targets.map((row) => row.milestoneKey));
  let writes = 0;

  for (const target of targets) {
    const existing = existingByKey.get(target.milestoneKey);
    const values = milestoneValues(leagueId, target);
    if (!existing) {
      await tx.insert(recordBookMilestones).values(values);
      writes += 1;
      continue;
    }
    if (!milestoneChanged(existing, target)) {
      continue;
    }
    await tx
      .update(recordBookMilestones)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(recordBookMilestones.id, existing.id));
    writes += 1;
  }

  const staleIds = existingRows
    .filter((row) => !targetKeys.has(row.milestoneKey))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await tx
      .delete(recordBookMilestones)
      .where(inArray(recordBookMilestones.id, staleIds));
    writes += staleIds.length;
  }

  return writes;
}

export async function refreshRecordBookAggregates(
  tx: LeagueScopedTx,
  input: { leagueId: string },
): Promise<RecordBookAggregateRefreshSummary> {
  const personRows = await tx
    .select({
      canonicalName: persons.canonicalName,
      id: persons.id,
    })
    .from(persons)
    .where(eq(persons.leagueId, input.leagueId))
    .orderBy(asc(persons.canonicalName), asc(persons.id));
  const personNames = new Map(
    personRows.map((person) => [person.id, person.canonicalName]),
  );

  const standings = await refreshAllTimeStandingAggregates(
    tx,
    input.leagueId,
    personNames,
  );
  const milestones = await refreshMilestoneAggregates(
    tx,
    input.leagueId,
    personNames,
  );
  return { milestones, standings };
}

export function buildRecordsCatalog(input: {
  allTimeStandingRows?: readonly RecordBookAllTimeStandingRow[];
  championshipRows?: readonly ChampionshipRecordRow[];
  headToHeadRows?: readonly HeadToHeadRecordRow[];
  lens?: RecordBookLens;
  limit?: number;
  milestoneRows?: readonly RecordBookMilestoneRow[];
  personNames: ReadonlyMap<string, string>;
  seasonRows: readonly SeasonStatisticsRow[];
  weeklyRows: readonly WeeklyStatisticsRow[];
}): RecordsCatalog {
  const limit = input.limit ?? DEFAULT_CATALOG_LIMIT;
  const defaultLens = isDefaultLens(input.lens);
  const weeklyRows = filterWeeklyRowsByLens(input.weeklyRows, input.lens);
  const seasonRows =
    (input.lens?.segment ?? "both") === "both"
      ? filterSeasonRowsByLens(input.seasonRows, input.lens)
      : derivedSeasonRowsFromWeeklyRows(
          weeklyRows,
          filterSeasonRowsByLens(input.seasonRows, input.lens),
          input.lens,
        );
  const championshipRows = filterChampionshipRowsByLens(
    input.championshipRows ?? [],
    input.lens,
  );
  const headToHeadRecordRows =
    input.lens?.seasonSet && input.lens.seasonSet.length > 0
      ? (input.headToHeadRows ?? []).filter(
          (row) =>
            row.season === 0 || input.lens?.seasonSet?.includes(row.season),
        )
      : (input.headToHeadRows ?? []);
  const headToHeadRows = weeklyRows.filter(
    (row) => row.matchupKind === "head_to_head",
  );
  const winners = headToHeadRows.filter((row) => row.result === "win");
  const losers = weeklyRows.filter((row) => row.result === "loss");
  const scoredRows = weeklyRows.filter((row) => row.pointsFor > 0);

  return {
    allTimeStandings:
      defaultLens && input.allTimeStandingRows
        ? materializedAllTimeStandings(
            input.allTimeStandingRows,
            input.personNames,
          )
        : buildAllTimeStandings(
            seasonRows,
            input.personNames,
            championshipRows,
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
    championships: buildChampionshipCatalog({
      championshipRows,
      personNames: input.personNames,
      seasonRows,
      weeklyRows,
    }),
    headToHead: defaultLens
      ? buildHeadToHeadCatalog(headToHeadRecordRows, input.personNames)
      : buildHeadToHeadCatalogFromWeeklyRows(headToHeadRows, input.personNames),
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
        weeklyRows,
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
    milestones: {
      keeper: buildKeeperMilestoneCatalog(
        input.milestoneRows ?? [],
        input.personNames,
      ),
    },
    streaks: {
      longestLosses: bestStreaks(weeklyRows, input.personNames, "loss", limit),
      longestWins: bestStreaks(weeklyRows, input.personNames, "win", limit),
    },
  };
}

export async function getLeagueRecordsCatalog(
  db: Db,
  input: { leagueId: string; lens?: RecordBookLens; limit?: number },
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
      return emptyRecordsCatalog(true);
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
    const allTimeStandingRows = await tx
      .select()
      .from(recordBookAllTimeStandings)
      .where(eq(recordBookAllTimeStandings.leagueId, input.leagueId))
      .orderBy(
        asc(recordBookAllTimeStandings.rank),
        asc(recordBookAllTimeStandings.personId),
      );
    const milestoneRows = await tx
      .select()
      .from(recordBookMilestones)
      .where(eq(recordBookMilestones.leagueId, input.leagueId))
      .orderBy(
        asc(recordBookMilestones.milestoneType),
        asc(recordBookMilestones.milestoneKey),
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
    const headToHeadRows = await tx
      .select()
      .from(headToHeadRecords)
      .where(eq(headToHeadRecords.leagueId, input.leagueId))
      .orderBy(
        asc(headToHeadRecords.season),
        asc(headToHeadRecords.personAId),
        asc(headToHeadRecords.personBId),
      );
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
    const lens = { ...(input.lens ?? {}) };
    if (lens.groupingId) {
      const [confirmedGrouping] = await tx
        .select({ id: leagueSeasonGroupings.id })
        .from(leagueSeasonGroupings)
        .where(
          and(
            eq(leagueSeasonGroupings.leagueId, input.leagueId),
            eq(leagueSeasonGroupings.id, lens.groupingId),
            eq(leagueSeasonGroupings.status, "confirmed"),
          ),
        )
        .limit(1);
      if (!confirmedGrouping) {
        lens.seasonSet = [];
      } else {
        const groupingSeasonRows = await tx
          .select({ season: leagueGroupingSeasons.season })
          .from(leagueGroupingSeasons)
          .where(
            and(
              eq(leagueGroupingSeasons.leagueId, input.leagueId),
              eq(leagueGroupingSeasons.groupingId, lens.groupingId),
            ),
          )
          .orderBy(asc(leagueGroupingSeasons.season));
        lens.seasonSet = groupingSeasonRows.map((row) => row.season);
      }
    }

    return buildRecordsCatalog({
      allTimeStandingRows,
      championshipRows,
      headToHeadRows,
      lens,
      limit: input.limit,
      milestoneRows,
      personNames,
      seasonRows,
      weeklyRows,
    });
  });
}
