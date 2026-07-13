import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { leagues } from "@/db/schema";
import {
  buildDeclaredCapabilityBasis,
  listDeclaredCapabilityMap,
} from "@/ingestion/capability-map";
import type { FantasyProviderId } from "@/providers";
import {
  type BlowoutCatalogEntry,
  type ChampionshipRecordRow,
  compareStable,
  getLeagueCanonRecordsContext,
  type HeadToHeadPairCatalogEntry,
  type ManagerChampionshipRecord,
  type ManagerHeadToHeadLedgerEntry,
  RECORD_TYPE_LABELS,
  type RecordBookSegment,
  type RecordsCatalog,
  type RecordsLensInput,
  type RecordsLensSelection,
  type RecordsPersonRow,
  type RecordsPersonSummary,
  type RecordType,
  round,
  type SeasonStatisticsRow,
  type StreakCatalogEntry,
  type WeeklyCatalogEntry,
  type WeeklyStatisticsRow,
} from "@/stats";

const DETAIL_LIMIT = 8;

type LeagueRow = Pick<
  typeof leagues.$inferSelect,
  | "id"
  | "name"
  | "provider"
  | "providerLeagueId"
  | "scoringType"
  | "season"
  | "size"
  | "status"
>;

export type {
  RecordsGroupingOption,
  RecordsLensInput,
  RecordsLensSelection,
  RecordsPersonSummary,
} from "@/stats";

export interface RecordsLeagueSummary {
  id: string;
  name: string;
  provider: FantasyProviderId;
  providerLeagueId: string;
  scoringType: string;
  season: number;
  size: number;
  status: "complete" | "in_season" | "preseason" | "unknown";
}

export interface CurrentRecordBookEntry {
  holderName: string | null;
  holderPersonId: string | null;
  id: string;
  label: string;
  opponentName: string | null;
  opponentPersonId: string | null;
  previousHolderName: string | null;
  previousRecordId: string | null;
  previousValue: number | null;
  recordType: RecordType;
  scoringPeriod: number | null;
  season: number | null;
  value: number;
}

export interface ManagerSeasonLine {
  avgPointsAgainst: number;
  avgPointsFor: number;
  finalPlacement: string;
  finalRank: number;
  longestLossStreak: number;
  longestWinStreak: number;
  losses: number;
  luck: number;
  madeChampionship: boolean;
  madePlayoffs: boolean;
  playoffSeed: number | null;
  pointDifferential: number;
  pointsAgainst: number;
  pointsFor: number;
  season: number;
  ties: number;
  winPercentage: number;
  wins: number;
}

export interface ManagerWeeklyHighlight {
  matchupId: string;
  opponentName: string | null;
  opponentPersonId: string | null;
  pointsAgainst: number;
  pointsFor: number;
  result: "bye" | "loss" | "tie" | "win";
  scoringPeriod: number;
  season: number;
}

export interface ManagerPlacement {
  roles: string[];
  season: number;
}

export interface RecordsPageData {
  catalog: RecordsCatalog;
  currentRecords: CurrentRecordBookEntry[];
  league: RecordsLeagueSummary;
  lens: RecordsLensSelection;
  managers: RecordsPersonSummary[];
  playerDataBasis: string;
}

export interface ManagerRecordsPageData extends RecordsPageData {
  championshipRecord: ManagerChampionshipRecord | null;
  h2hLedgers: ManagerHeadToHeadLedgerEntry[];
  heldRecords: CurrentRecordBookEntry[];
  manager: RecordsPersonSummary;
  placements: ManagerPlacement[];
  seasonLines: ManagerSeasonLine[];
  signatureWeeks: {
    bestLosses: ManagerWeeklyHighlight[];
    highestScores: ManagerWeeklyHighlight[];
    lowestScores: ManagerWeeklyHighlight[];
    worstWins: ManagerWeeklyHighlight[];
  };
}

export interface HeadToHeadMeeting {
  championship: boolean;
  combinedPoints: number;
  matchupId: string;
  personAPoints: number;
  personBPoints: number;
  playoff: boolean;
  scoringPeriod: number;
  season: number;
  winnerPersonId: string | null;
}

export interface HeadToHeadRecordsPageData extends RecordsPageData {
  biggestMeetings: HeadToHeadMeeting[];
  canonicalPersonAId: string;
  canonicalPersonBId: string;
  meetings: HeadToHeadMeeting[];
  pair: HeadToHeadPairCatalogEntry;
  personA: RecordsPersonSummary;
  personB: RecordsPersonSummary;
  seasonPairs: HeadToHeadPairCatalogEntry[];
}

interface RecordsSourceData {
  catalog: RecordsCatalog;
  championshipRows: ChampionshipRecordRow[];
  league: RecordsLeagueSummary;
  lens: RecordsLensSelection;
  personRows: RecordsPersonRow[];
  playerDataBasis: string;
  seasonRows: SeasonStatisticsRow[];
  weeklyRows: WeeklyStatisticsRow[];
}

export type RecordsDataResult<T> =
  | { data: T; status: "ready" }
  | { status: "not_found" };

const RECORD_SEGMENTS = new Set<RecordBookSegment>([
  "both",
  "playoff",
  "regular",
]);

function firstSearchValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function recordsLensFromSearchParams(
  searchParams:
    | Record<string, string | string[] | undefined>
    | null
    | undefined,
): RecordsLensInput {
  const segment = firstSearchValue(searchParams?.segment);
  const grouping =
    firstSearchValue(searchParams?.grouping) ??
    firstSearchValue(searchParams?.groupingId) ??
    firstSearchValue(searchParams?.era);
  return {
    groupingId:
      grouping && !["all", "cumulative", "none"].includes(grouping)
        ? grouping
        : null,
    segment:
      segment && RECORD_SEGMENTS.has(segment as RecordBookSegment)
        ? (segment as RecordBookSegment)
        : undefined,
  };
}

export function canonicalizeHeadToHeadPersonIds(
  personAId: string,
  personBId: string,
): [string, string] {
  return compareStable(personAId, personBId) <= 0
    ? [personAId, personBId]
    : [personBId, personAId];
}

function recordLabel(recordType: string): string {
  return (
    RECORD_TYPE_LABELS[recordType as RecordType] ??
    recordType.replaceAll("_", " ")
  );
}

function toLeagueSummary(row: LeagueRow): RecordsLeagueSummary {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    providerLeagueId: row.providerLeagueId,
    scoringType: row.scoringType,
    season: row.season,
    size: row.size,
    status: row.status,
  };
}

function toPersonSummary(row: RecordsPersonRow): RecordsPersonSummary {
  return {
    id: row.id,
    name: row.name,
    ownerHistory: row.ownerHistory,
    ownerNames: row.ownerNames,
    seasonSpan: row.seasonSpan,
  };
}

function personName(
  personNames: ReadonlyMap<string, string>,
  personId: string | null,
): string | null {
  return personId ? (personNames.get(personId) ?? "Unknown manager") : null;
}

function lensRecordId(
  lens: RecordsLensSelection,
  recordType: RecordType,
  suffix: string,
): string {
  const grouping = lens.groupingId ?? "cumulative";
  return `lens-${lens.segment}-${grouping}-${recordType}-${suffix}`;
}

function lensRecordEntry(input: {
  holderPersonId: string | null;
  lens: RecordsLensSelection;
  opponentName?: string | null;
  opponentPersonId?: string | null;
  personNames: ReadonlyMap<string, string>;
  recordType: RecordType;
  scoringPeriod?: number | null;
  season?: number | null;
  suffix: string;
  value: number;
}): CurrentRecordBookEntry {
  return {
    holderName: personName(input.personNames, input.holderPersonId),
    holderPersonId: input.holderPersonId,
    id: lensRecordId(input.lens, input.recordType, input.suffix),
    label: recordLabel(input.recordType),
    opponentName: input.opponentName ?? null,
    opponentPersonId: input.opponentPersonId ?? null,
    previousHolderName: null,
    previousRecordId: null,
    previousValue: null,
    recordType: input.recordType,
    scoringPeriod: input.scoringPeriod ?? null,
    season: input.season ?? null,
    value: round(input.value, 4),
  };
}

function weeklyCatalogRecord(
  row: WeeklyCatalogEntry | undefined,
  lens: RecordsLensSelection,
  personNames: ReadonlyMap<string, string>,
): CurrentRecordBookEntry | null {
  if (!row) {
    return null;
  }
  return lensRecordEntry({
    holderPersonId: row.personId,
    lens,
    opponentName: row.opponentName,
    opponentPersonId: row.opponentPersonId,
    personNames,
    recordType: row.recordType,
    scoringPeriod: row.scoringPeriod,
    season: row.season,
    suffix: `${row.personId}-${row.season}-${row.scoringPeriod}-${row.matchupId ?? "matchup"}`,
    value: row.value,
  });
}

function blowoutCatalogRecord(
  row: BlowoutCatalogEntry | undefined,
  lens: RecordsLensSelection,
  personNames: ReadonlyMap<string, string>,
): CurrentRecordBookEntry | null {
  if (!row) {
    return null;
  }
  return lensRecordEntry({
    holderPersonId: row.personId,
    lens,
    opponentName: row.opponentName,
    opponentPersonId: row.opponentPersonId,
    personNames,
    recordType: row.recordType,
    scoringPeriod: row.scoringPeriod,
    season: row.season,
    suffix: `${row.personId}-${row.season}-${row.scoringPeriod}-${row.matchupId ?? "matchup"}`,
    value: row.margin,
  });
}

function streakCatalogRecord(
  row: StreakCatalogEntry | undefined,
  lens: RecordsLensSelection,
  personNames: ReadonlyMap<string, string>,
): CurrentRecordBookEntry | null {
  if (!row) {
    return null;
  }
  return lensRecordEntry({
    holderPersonId: row.personId,
    lens,
    personNames,
    recordType: row.recordType,
    scoringPeriod: row.startScoringPeriod,
    season: row.startSeason,
    suffix: `${row.personId}-${row.startSeason}-${row.startScoringPeriod}-${row.endSeason}-${row.endScoringPeriod}`,
    value: row.length,
  });
}

function countCatalogRecord(
  row:
    | RecordsCatalog["achievements"]["mostTopScoringWeeks"][number]
    | undefined,
  lens: RecordsLensSelection,
  personNames: ReadonlyMap<string, string>,
): CurrentRecordBookEntry | null {
  if (!row) {
    return null;
  }
  return lensRecordEntry({
    holderPersonId: row.personId,
    lens,
    personNames,
    recordType: row.recordType,
    suffix: row.personId,
    value: row.value,
  });
}

function compareRecordCandidate(
  left: {
    personId: string;
    personName: string;
    season?: number | null;
    value: number;
  },
  right: {
    personId: string;
    personName: string;
    season?: number | null;
    value: number;
  },
  direction: "max" | "min",
): number {
  const valueCompare =
    direction === "max" ? right.value - left.value : left.value - right.value;
  return (
    valueCompare ||
    (left.season ?? 0) - (right.season ?? 0) ||
    compareStable(left.personName, right.personName) ||
    compareStable(left.personId, right.personId)
  );
}

function seasonRecord(
  rows: readonly SeasonStatisticsRow[],
  recordType: RecordType,
  selector: (row: SeasonStatisticsRow) => number,
  direction: "max" | "min",
  lens: RecordsLensSelection,
  personNames: ReadonlyMap<string, string>,
): CurrentRecordBookEntry | null {
  const candidates = rows
    .filter((row) => row.wins + row.losses + row.ties > 0)
    .map((row) => ({
      personId: row.personId,
      personName: personName(personNames, row.personId) ?? "Unknown manager",
      season: row.season,
      value: selector(row),
    }))
    .sort((left, right) => compareRecordCandidate(left, right, direction));
  const winner = candidates[0];
  if (!winner) {
    return null;
  }
  return lensRecordEntry({
    holderPersonId: winner.personId,
    lens,
    personNames,
    recordType,
    season: winner.season,
    suffix: `${winner.personId}-${winner.season}`,
    value: winner.value,
  });
}

function careerRecord(
  rows: readonly RecordsCatalog["allTimeStandings"][number][],
  recordType: RecordType,
  selector: (row: RecordsCatalog["allTimeStandings"][number]) => number,
  direction: "max" | "min",
  lens: RecordsLensSelection,
  personNames: ReadonlyMap<string, string>,
): CurrentRecordBookEntry | null {
  const candidates = rows
    .filter((row) => row.games > 0 || row.seasons > 0)
    .map((row) => ({
      personId: row.personId,
      personName: row.personName,
      value: selector(row),
    }))
    .sort((left, right) => compareRecordCandidate(left, right, direction));
  const winner = candidates[0];
  if (!winner) {
    return null;
  }
  return lensRecordEntry({
    holderPersonId: winner.personId,
    lens,
    personNames,
    recordType,
    suffix: winner.personId,
    value: winner.value,
  });
}

function championshipManagerRecord(
  rows: readonly RecordsCatalog["championships"]["managerRecords"][number][],
  recordType: RecordType,
  selector: (
    row: RecordsCatalog["championships"]["managerRecords"][number],
  ) => number,
  direction: "max" | "min",
  lens: RecordsLensSelection,
  personNames: ReadonlyMap<string, string>,
): CurrentRecordBookEntry | null {
  const candidates = rows
    .filter((row) => row.seasons > 0)
    .map((row) => ({
      personId: row.personId,
      personName: row.personName,
      value: selector(row),
    }))
    .sort((left, right) => compareRecordCandidate(left, right, direction));
  const winner = candidates[0];
  if (!winner) {
    return null;
  }
  return lensRecordEntry({
    holderPersonId: winner.personId,
    lens,
    personNames,
    recordType,
    suffix: winner.personId,
    value: winner.value,
  });
}

function derivedCurrentRecords(
  catalog: RecordsCatalog,
  seasonRows: readonly SeasonStatisticsRow[],
  lens: RecordsLensSelection,
  personNames: ReadonlyMap<string, string>,
): CurrentRecordBookEntry[] {
  return [
    careerRecord(
      catalog.allTimeStandings,
      "best_career_win_percentage",
      (row) => row.winPercentage,
      "max",
      lens,
      personNames,
    ),
    careerRecord(
      catalog.allTimeStandings,
      "worst_career_win_percentage",
      (row) => row.winPercentage,
      "min",
      lens,
      personNames,
    ),
    careerRecord(
      catalog.allTimeStandings,
      "most_career_points",
      (row) => row.pointsFor,
      "max",
      lens,
      personNames,
    ),
    careerRecord(
      catalog.allTimeStandings,
      "most_career_points_against",
      (row) => row.pointsAgainst,
      "max",
      lens,
      personNames,
    ),
    careerRecord(
      catalog.allTimeStandings,
      "most_championships",
      (row) => row.championships,
      "max",
      lens,
      personNames,
    ),
    careerRecord(
      catalog.allTimeStandings,
      "most_playoff_appearances",
      (row) => row.playoffAppearances,
      "max",
      lens,
      personNames,
    ),
    careerRecord(
      catalog.allTimeStandings,
      "luckiest_career",
      (row) => row.careerLuck,
      "max",
      lens,
      personNames,
    ),
    championshipManagerRecord(
      catalog.championships.managerRecords,
      "most_runner_ups",
      (row) => row.runnerUps,
      "max",
      lens,
      personNames,
    ),
    championshipManagerRecord(
      catalog.championships.managerRecords,
      "most_regular_season_titles",
      (row) => row.regularSeasonTitles,
      "max",
      lens,
      personNames,
    ),
    championshipManagerRecord(
      catalog.championships.managerRecords,
      "most_playoff_wins",
      (row) => row.playoffWins,
      "max",
      lens,
      personNames,
    ),
    championshipManagerRecord(
      catalog.championships.managerRecords,
      "most_playoff_losses",
      (row) => row.playoffLosses,
      "max",
      lens,
      personNames,
    ),
    championshipManagerRecord(
      catalog.championships.managerRecords,
      "most_playoff_points_for",
      (row) => row.playoffPointsFor,
      "max",
      lens,
      personNames,
    ),
    championshipManagerRecord(
      catalog.championships.managerRecords,
      "most_playoff_points_against",
      (row) => row.playoffPointsAgainst,
      "max",
      lens,
      personNames,
    ),
    championshipManagerRecord(
      catalog.championships.managerRecords,
      "best_playoff_win_percentage",
      (row) => {
        const games = row.playoffWins + row.playoffLosses + row.playoffTies;
        return games > 0
          ? round((row.playoffWins + row.playoffTies * 0.5) / games, 4)
          : 0;
      },
      "max",
      lens,
      personNames,
    ),
    streakCatalogRecord(catalog.streaks.longestWins[0], lens, personNames),
    streakCatalogRecord(catalog.streaks.longestLosses[0], lens, personNames),
    countCatalogRecord(
      catalog.achievements.mostTopScoringWeeks[0],
      lens,
      personNames,
    ),
    countCatalogRecord(
      catalog.lowlights.mostBottomScoringWeeks[0],
      lens,
      personNames,
    ),
    countCatalogRecord(
      catalog.lowlights.mostLastPlaceFinishes[0],
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "most_wins_season",
      (row) => row.wins,
      "max",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "fewest_wins_season",
      (row) => row.wins,
      "min",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "most_points_for_season",
      (row) => row.pointsFor,
      "max",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "fewest_points_for_season",
      (row) => row.pointsFor,
      "min",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "most_points_against_season",
      (row) => row.pointsAgainst,
      "max",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "fewest_points_against_season",
      (row) => row.pointsAgainst,
      "min",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "best_luck_season",
      (row) => row.luck,
      "max",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "worst_luck_season",
      (row) => row.luck,
      "min",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "worst_season_win_percentage",
      (row) => row.winPercentage,
      "min",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "highest_season_scoring_average",
      (row) => row.avgPointsFor,
      "max",
      lens,
      personNames,
    ),
    seasonRecord(
      seasonRows,
      "lowest_season_scoring_average",
      (row) => row.avgPointsFor,
      "min",
      lens,
      personNames,
    ),
    weeklyCatalogRecord(catalog.highLow.highestScores[0], lens, personNames),
    weeklyCatalogRecord(catalog.highLow.lowestScores[0], lens, personNames),
    weeklyCatalogRecord(
      catalog.highLow.highestCombinedMatchups[0],
      lens,
      personNames,
    ),
    weeklyCatalogRecord(
      catalog.highLow.bestScoresInLosses[0],
      lens,
      personNames,
    ),
    weeklyCatalogRecord(
      catalog.highLow.worstScoresInWins[0],
      lens,
      personNames,
    ),
    blowoutCatalogRecord(catalog.blowouts.biggest[0], lens, personNames),
    blowoutCatalogRecord(catalog.blowouts.narrowestWins[0], lens, personNames),
    blowoutCatalogRecord(catalog.blowouts.biggestLosses[0], lens, personNames),
    blowoutCatalogRecord(
      catalog.blowouts.narrowestLosses[0],
      lens,
      personNames,
    ),
  ].filter((record): record is CurrentRecordBookEntry => Boolean(record));
}

function toSeasonLine(row: SeasonStatisticsRow): ManagerSeasonLine {
  return {
    avgPointsAgainst: row.avgPointsAgainst,
    avgPointsFor: row.avgPointsFor,
    finalPlacement: row.finalPlacement,
    finalRank: row.finalRank,
    longestLossStreak: row.longestLossStreak,
    longestWinStreak: row.longestWinStreak,
    losses: row.losses,
    luck: row.luck,
    madeChampionship: row.madeChampionship,
    madePlayoffs: row.madePlayoffs,
    playoffSeed: row.playoffSeed,
    pointDifferential: row.pointDifferential,
    pointsAgainst: row.pointsAgainst,
    pointsFor: row.pointsFor,
    season: row.season,
    ties: row.ties,
    winPercentage: row.winPercentage,
    wins: row.wins,
  };
}

function toWeeklyHighlight(
  row: WeeklyStatisticsRow,
  personNames: ReadonlyMap<string, string>,
): ManagerWeeklyHighlight {
  return {
    matchupId: row.matchupId,
    opponentName: row.opponentPersonId
      ? personName(personNames, row.opponentPersonId)
      : null,
    opponentPersonId: row.opponentPersonId,
    pointsAgainst: row.pointsAgainst,
    pointsFor: row.pointsFor,
    result: row.result,
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

function topWeeklyHighlights(
  rows: readonly WeeklyStatisticsRow[],
  personNames: ReadonlyMap<string, string>,
  direction: "max" | "min",
): ManagerWeeklyHighlight[] {
  return [...rows]
    .sort((left, right) => {
      const valueCompare =
        direction === "max"
          ? right.pointsFor - left.pointsFor
          : left.pointsFor - right.pointsFor;
      return valueCompare || compareWeeklyAscending(left, right);
    })
    .slice(0, DETAIL_LIMIT)
    .map((row) => toWeeklyHighlight(row, personNames));
}

function placementRolesFor(
  row: ChampionshipRecordRow,
  personId: string,
): string[] {
  const roles: string[] = [];
  if (row.championPersonId === personId) {
    roles.push("Champion");
  }
  if (row.runnerUpPersonId === personId) {
    roles.push("Runner-up");
  }
  if (row.thirdPlacePersonId === personId) {
    roles.push("Third place");
  }
  if (row.regularSeasonWinnerPersonId === personId) {
    roles.push("Regular-season winner");
  }
  return roles;
}

function managerPlacements(
  rows: readonly ChampionshipRecordRow[],
  personId: string,
): ManagerPlacement[] {
  return rows
    .map((row) => ({
      roles: placementRolesFor(row, personId),
      season: row.season,
    }))
    .filter((row) => row.roles.length > 0)
    .sort((left, right) => right.season - left.season);
}

function toRecordsPageData(source: RecordsSourceData): RecordsPageData {
  const personNames = new Map(
    source.personRows.map((person) => [person.id, person.name]),
  );
  const currentRecords = derivedCurrentRecords(
    source.catalog,
    source.seasonRows,
    source.lens,
    personNames,
  );

  return {
    catalog: source.catalog,
    currentRecords,
    league: source.league,
    lens: source.lens,
    managers: source.personRows.map(toPersonSummary),
    playerDataBasis: source.playerDataBasis,
  };
}

async function loadRecordsSourceData(
  db: Db,
  input: { leagueId: string; lens?: RecordsLensInput; limit?: number },
): Promise<RecordsDataResult<RecordsSourceData>> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      scoringType: leagues.scoringType,
      season: leagues.season,
      size: leagues.size,
      status: leagues.status,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const canon = await getLeagueCanonRecordsContext(db, {
    leagueId: input.leagueId,
    lens: input.lens,
    limit: input.limit,
  });
  const capabilityMap = await listDeclaredCapabilityMap({
    db,
    leagueId: input.leagueId,
    provider: league.provider,
    providerLeagueId: league.providerLeagueId,
  });
  const playerDataBasis = buildDeclaredCapabilityBasis({
    currentSeason: league.season,
    dataClass: "rosters",
    label: "Player depth",
    observations: capabilityMap,
  });
  const scoped: Omit<RecordsSourceData, "league"> = {
    catalog: canon.catalog,
    championshipRows: canon.championshipRows,
    lens: canon.lens,
    personRows: canon.personRows,
    playerDataBasis: playerDataBasis.label,
    seasonRows: canon.seasonRows,
    weeklyRows: canon.weeklyRows,
  };

  return {
    data: {
      ...scoped,
      league: toLeagueSummary(league),
    },
    status: "ready",
  };
}

export async function getLeagueRecordsPageData(
  db: Db,
  input: { leagueId: string; lens?: RecordsLensInput; limit?: number },
): Promise<RecordsDataResult<RecordsPageData>> {
  const source = await loadRecordsSourceData(db, input);
  if (source.status !== "ready") {
    return source;
  }
  return { data: toRecordsPageData(source.data), status: "ready" };
}

export async function getManagerRecordsPageData(
  db: Db,
  input: { leagueId: string; lens?: RecordsLensInput; personId: string },
): Promise<RecordsDataResult<ManagerRecordsPageData>> {
  const source = await loadRecordsSourceData(db, {
    lens: input.lens,
    leagueId: input.leagueId,
    limit: DETAIL_LIMIT,
  });
  if (source.status !== "ready") {
    return source;
  }

  const person = source.data.personRows.find(
    (row) => row.id === input.personId,
  );
  if (!person) {
    return { status: "not_found" };
  }

  const pageData = toRecordsPageData(source.data);
  const personNames = new Map(
    source.data.personRows.map((row) => [row.id, row.name]),
  );
  const weeklyRows = source.data.weeklyRows.filter(
    (row) => row.personId === input.personId,
  );
  const scoredRows = weeklyRows.filter((row) => row.pointsFor > 0);

  return {
    data: {
      ...pageData,
      championshipRecord:
        source.data.catalog.championships.managerRecords.find(
          (row) => row.personId === input.personId,
        ) ?? null,
      h2hLedgers: source.data.catalog.headToHead.managerLedgers.filter(
        (row) => row.personId === input.personId && row.season === 0,
      ),
      heldRecords: pageData.currentRecords.filter(
        (record) => record.holderPersonId === input.personId,
      ),
      manager: toPersonSummary(person),
      placements: managerPlacements(
        source.data.championshipRows,
        input.personId,
      ),
      seasonLines: source.data.seasonRows
        .filter((row) => row.personId === input.personId)
        .sort((left, right) => right.season - left.season)
        .map(toSeasonLine),
      signatureWeeks: {
        bestLosses: topWeeklyHighlights(
          weeklyRows.filter((row) => row.result === "loss"),
          personNames,
          "max",
        ),
        highestScores: topWeeklyHighlights(scoredRows, personNames, "max"),
        lowestScores: topWeeklyHighlights(scoredRows, personNames, "min"),
        worstWins: topWeeklyHighlights(
          weeklyRows.filter((row) => row.result === "win"),
          personNames,
          "min",
        ),
      },
    },
    status: "ready",
  };
}

function samePair(
  entry: HeadToHeadPairCatalogEntry,
  personAId: string,
  personBId: string,
): boolean {
  return (
    entry.personA.personId === personAId && entry.personB.personId === personBId
  );
}

function headToHeadMeetings(
  weeklyRows: readonly WeeklyStatisticsRow[],
  personAId: string,
  personBId: string,
): HeadToHeadMeeting[] {
  const grouped = new Map<string, WeeklyStatisticsRow[]>();
  for (const row of weeklyRows) {
    if (row.matchupKind !== "head_to_head") {
      continue;
    }
    if (![row.personId, row.opponentPersonId].includes(personAId)) {
      continue;
    }
    if (![row.personId, row.opponentPersonId].includes(personBId)) {
      continue;
    }
    const key = `${row.season}:${row.scoringPeriod}:${row.matchupId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return [...grouped.values()]
    .map((rows) => {
      const personARow = rows.find((row) => row.personId === personAId);
      const personBRow = rows.find((row) => row.personId === personBId);
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
        combinedPoints: personARow.pointsFor + personBRow.pointsFor,
        matchupId: personARow.matchupId,
        personAPoints: personARow.pointsFor,
        personBPoints: personBRow.pointsFor,
        playoff: personARow.isPlayoff || personBRow.isPlayoff,
        scoringPeriod: personARow.scoringPeriod,
        season: personARow.season,
        winnerPersonId,
      };
    })
    .filter((meeting): meeting is HeadToHeadMeeting => Boolean(meeting))
    .sort(
      (left, right) =>
        right.season - left.season ||
        right.scoringPeriod - left.scoringPeriod ||
        compareStable(left.matchupId, right.matchupId),
    );
}

export async function getHeadToHeadRecordsPageData(
  db: Db,
  input: {
    leagueId: string;
    lens?: RecordsLensInput;
    personAId: string;
    personBId: string;
  },
): Promise<RecordsDataResult<HeadToHeadRecordsPageData>> {
  if (input.personAId === input.personBId) {
    return { status: "not_found" };
  }

  const [canonicalPersonAId, canonicalPersonBId] =
    canonicalizeHeadToHeadPersonIds(input.personAId, input.personBId);
  const source = await loadRecordsSourceData(db, {
    lens: input.lens,
    leagueId: input.leagueId,
    limit: DETAIL_LIMIT,
  });
  if (source.status !== "ready") {
    return source;
  }

  const personA = source.data.personRows.find(
    (row) => row.id === canonicalPersonAId,
  );
  const personB = source.data.personRows.find(
    (row) => row.id === canonicalPersonBId,
  );
  const pair = source.data.catalog.headToHead.allTimePairs.find((entry) =>
    samePair(entry, canonicalPersonAId, canonicalPersonBId),
  );
  if (!personA || !personB || !pair) {
    return { status: "not_found" };
  }

  const pageData = toRecordsPageData(source.data);
  const meetings = headToHeadMeetings(
    source.data.weeklyRows,
    canonicalPersonAId,
    canonicalPersonBId,
  );

  return {
    data: {
      ...pageData,
      biggestMeetings: [...meetings]
        .sort(
          (left, right) =>
            right.combinedPoints - left.combinedPoints ||
            right.season - left.season ||
            right.scoringPeriod - left.scoringPeriod,
        )
        .slice(0, DETAIL_LIMIT),
      canonicalPersonAId,
      canonicalPersonBId,
      meetings,
      pair,
      personA: toPersonSummary(personA),
      personB: toPersonSummary(personB),
      seasonPairs: source.data.catalog.headToHead.seasonPairs.filter((entry) =>
        samePair(entry, canonicalPersonAId, canonicalPersonBId),
      ),
    },
    status: "ready",
  };
}
