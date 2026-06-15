import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  championshipRecords,
  dataIntegrityChecks,
  headToHeadRecords,
  leagues,
  type PersonOwnerHistoryEntry,
  persons,
  recordBookAllTimeStandings,
  recordBookMilestones,
  seasonStatistics,
  weeklyStatistics,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import {
  buildRecordsCatalog,
  type HeadToHeadPairCatalogEntry,
  type ManagerChampionshipRecord,
  type ManagerHeadToHeadLedgerEntry,
  RECORD_TYPE_LABELS,
  type RecordsCatalog,
  type RecordType,
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
type PersonRow = Pick<
  typeof persons.$inferSelect,
  "canonicalName" | "id" | "ownerHistory"
>;
type SeasonStatisticsRow = typeof seasonStatistics.$inferSelect;
type WeeklyStatisticsRow = typeof weeklyStatistics.$inferSelect;
type ChampionshipRecordRow = typeof championshipRecords.$inferSelect;
type HeadToHeadRecordRow = typeof headToHeadRecords.$inferSelect;
type RecordBookAllTimeStandingRow =
  typeof recordBookAllTimeStandings.$inferSelect;
type RecordBookMilestoneRow = typeof recordBookMilestones.$inferSelect;
type AllTimeRecordRow = Pick<
  typeof allTimeRecords.$inferSelect,
  | "holderPersonId"
  | "id"
  | "opponentPersonId"
  | "previousRecordId"
  | "recordType"
  | "scoringPeriod"
  | "season"
  | "value"
>;

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

export interface RecordsPersonSummary {
  id: string;
  name: string;
  ownerHistory: PersonOwnerHistoryEntry[];
  ownerNames: string[];
  seasonSpan: string | null;
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
  result: "loss" | "tie" | "win";
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
  managers: RecordsPersonSummary[];
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
  allTimeStandingRows: RecordBookAllTimeStandingRow[];
  catalog: RecordsCatalog;
  championshipRows: ChampionshipRecordRow[];
  currentRecordRows: AllTimeRecordRow[];
  headToHeadRows: HeadToHeadRecordRow[];
  league: RecordsLeagueSummary;
  milestoneRows: RecordBookMilestoneRow[];
  personRows: PersonRow[];
  previousRecordRows: AllTimeRecordRow[];
  seasonRows: SeasonStatisticsRow[];
  weeklyRows: WeeklyStatisticsRow[];
}

export type RecordsDataResult<T> =
  | { data: T; status: "ready" }
  | { status: "not_found" };

function compareStable(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
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

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort(compareStable);
}

function ownerNamesFor(history: readonly PersonOwnerHistoryEntry[]): string[] {
  return uniqueSorted(history.flatMap((entry) => entry.ownerNames));
}

function seasonSpanFor(
  history: readonly PersonOwnerHistoryEntry[],
): string | null {
  if (history.length === 0) {
    return null;
  }
  const starts = history.map((entry) => entry.startSeason);
  const ends = history.map((entry) => entry.endSeason ?? entry.startSeason);
  const first = Math.min(...starts);
  const last = Math.max(...ends);
  return first === last ? String(first) : `${first}-${last}`;
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

function toPersonSummary(row: PersonRow): RecordsPersonSummary {
  return {
    id: row.id,
    name: row.canonicalName,
    ownerHistory: row.ownerHistory,
    ownerNames: ownerNamesFor(row.ownerHistory),
    seasonSpan: seasonSpanFor(row.ownerHistory),
  };
}

function personName(
  personNames: ReadonlyMap<string, string>,
  personId: string | null,
): string | null {
  return personId ? (personNames.get(personId) ?? "Unknown manager") : null;
}

function toCurrentRecordEntry(
  row: AllTimeRecordRow,
  personNames: ReadonlyMap<string, string>,
  previousById: ReadonlyMap<string, AllTimeRecordRow>,
): CurrentRecordBookEntry {
  const previous = row.previousRecordId
    ? (previousById.get(row.previousRecordId) ?? null)
    : null;
  return {
    holderName: personName(personNames, row.holderPersonId),
    holderPersonId: row.holderPersonId,
    id: row.id,
    label: recordLabel(row.recordType),
    opponentName: personName(personNames, row.opponentPersonId),
    opponentPersonId: row.opponentPersonId,
    previousHolderName: personName(
      personNames,
      previous?.holderPersonId ?? null,
    ),
    previousRecordId: row.previousRecordId,
    previousValue: previous?.value ?? null,
    recordType: row.recordType as RecordType,
    scoringPeriod: row.scoringPeriod,
    season: row.season,
    value: row.value,
  };
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
    opponentName: personName(personNames, row.opponentPersonId),
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
    source.personRows.map((person) => [person.id, person.canonicalName]),
  );
  const previousById = new Map(
    source.previousRecordRows.map((record) => [record.id, record]),
  );

  return {
    catalog: source.catalog,
    currentRecords: source.currentRecordRows.map((row) =>
      toCurrentRecordEntry(row, personNames, previousById),
    ),
    league: source.league,
    managers: source.personRows.map(toPersonSummary),
  };
}

async function loadRecordsSourceData(
  db: Db,
  input: { leagueId: string; limit?: number },
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

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
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

    const personRows = await tx
      .select({
        canonicalName: persons.canonicalName,
        id: persons.id,
        ownerHistory: persons.ownerHistory,
      })
      .from(persons)
      .where(eq(persons.leagueId, input.leagueId))
      .orderBy(asc(persons.canonicalName), asc(persons.id));

    if (unresolvedFailures.length > 0) {
      const emptyCatalog = buildRecordsCatalog({
        championshipRows: [],
        headToHeadRows: [],
        limit: input.limit,
        personNames: new Map(
          personRows.map((person) => [person.id, person.canonicalName]),
        ),
        seasonRows: [],
        weeklyRows: [],
      });
      return {
        catalog: { ...emptyCatalog, integrityBlocked: true },
        allTimeStandingRows: [],
        championshipRows: [],
        currentRecordRows: [],
        headToHeadRows: [],
        milestoneRows: [],
        personRows,
        previousRecordRows: [],
        seasonRows: [],
        weeklyRows: [],
      };
    }

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
    const currentRecordRows = await tx
      .select({
        holderPersonId: allTimeRecords.holderPersonId,
        id: allTimeRecords.id,
        opponentPersonId: allTimeRecords.opponentPersonId,
        previousRecordId: allTimeRecords.previousRecordId,
        recordType: allTimeRecords.recordType,
        scoringPeriod: allTimeRecords.scoringPeriod,
        season: allTimeRecords.season,
        value: allTimeRecords.value,
      })
      .from(allTimeRecords)
      .where(
        and(
          eq(allTimeRecords.leagueId, input.leagueId),
          eq(allTimeRecords.isCurrent, true),
        ),
      )
      .orderBy(asc(allTimeRecords.recordType), asc(allTimeRecords.id));

    const previousRecordIds = uniqueSorted(
      currentRecordRows.flatMap((record) =>
        record.previousRecordId ? [record.previousRecordId] : [],
      ),
    );
    const previousRecordRows =
      previousRecordIds.length > 0
        ? await tx
            .select({
              holderPersonId: allTimeRecords.holderPersonId,
              id: allTimeRecords.id,
              opponentPersonId: allTimeRecords.opponentPersonId,
              previousRecordId: allTimeRecords.previousRecordId,
              recordType: allTimeRecords.recordType,
              scoringPeriod: allTimeRecords.scoringPeriod,
              season: allTimeRecords.season,
              value: allTimeRecords.value,
            })
            .from(allTimeRecords)
            .where(
              and(
                eq(allTimeRecords.leagueId, input.leagueId),
                inArray(allTimeRecords.id, previousRecordIds),
              ),
            )
        : [];

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
    return {
      catalog: buildRecordsCatalog({
        allTimeStandingRows,
        championshipRows,
        headToHeadRows,
        limit: input.limit,
        milestoneRows,
        personNames,
        seasonRows,
        weeklyRows,
      }),
      allTimeStandingRows,
      championshipRows,
      currentRecordRows,
      headToHeadRows,
      milestoneRows,
      personRows,
      previousRecordRows,
      seasonRows,
      weeklyRows,
    };
  });

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
  input: { leagueId: string; limit?: number },
): Promise<RecordsDataResult<RecordsPageData>> {
  const source = await loadRecordsSourceData(db, input);
  if (source.status !== "ready") {
    return source;
  }
  return { data: toRecordsPageData(source.data), status: "ready" };
}

export async function getManagerRecordsPageData(
  db: Db,
  input: { leagueId: string; personId: string },
): Promise<RecordsDataResult<ManagerRecordsPageData>> {
  const source = await loadRecordsSourceData(db, {
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
    source.data.personRows.map((row) => [row.id, row.canonicalName]),
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
  input: { leagueId: string; personAId: string; personBId: string },
): Promise<RecordsDataResult<HeadToHeadRecordsPageData>> {
  if (input.personAId === input.personBId) {
    return { status: "not_found" };
  }

  const [canonicalPersonAId, canonicalPersonBId] =
    canonicalizeHeadToHeadPersonIds(input.personAId, input.personBId);
  const source = await loadRecordsSourceData(db, {
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
