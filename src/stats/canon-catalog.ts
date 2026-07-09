import type { Db } from "@/db/client";
import type {
  championshipRecords,
  leagueSeasonGroupings,
  PersonOwnerHistoryEntry,
  seasonStatistics,
  weeklyStatistics,
} from "@/db/schema";
import {
  type ComposedCanonicalSnapshot,
  composeCanonicalSnapshot,
} from "./curated-state";
import {
  buildRecordsCatalog,
  type RecordBookLens,
  type RecordBookSegment,
  type RecordsCatalog,
} from "./records-catalog";

/**
 * Canon-provenance boundary (specs/45 §A).
 *
 * `CanonCatalog` is a branded `RecordsCatalog` that can only be produced by
 * the pushed-canonical-snapshot path in this module. AI context loaders and
 * any surface that must "never assert un-ratified history" accept ONLY this
 * type; a catalog built from live/draft tables (`getLeagueRecordsCatalog`)
 * does not assign to it. Do not cast to `CanonCatalog` outside this module —
 * tests use `forgeCanonCatalogForTest` from `src/testing/canon.ts`.
 */
declare const CANON_CATALOG_BRAND: unique symbol;

export type CanonCatalog = RecordsCatalog & {
  readonly [CANON_CATALOG_BRAND]: true;
};

export type SeasonStatisticsRow = typeof seasonStatistics.$inferSelect;
export type WeeklyStatisticsRow = typeof weeklyStatistics.$inferSelect;
export type ChampionshipRecordRow = typeof championshipRecords.$inferSelect;

export interface RecordsPersonSummary {
  id: string;
  name: string;
  ownerHistory: PersonOwnerHistoryEntry[];
  ownerNames: string[];
  seasonSpan: string | null;
}

export interface RecordsPersonRow extends RecordsPersonSummary {
  canonicalName: string;
}

export interface RecordsGroupingOption {
  formatType: string;
  id: string;
  kind: string;
  name: string;
  ordinal: number;
  seasons: number[];
}

export interface RecordsLensSelection {
  groupingId: string | null;
  groupings: RecordsGroupingOption[];
  scope: "all";
  seasonSet: number[];
  segment: RecordBookSegment;
}

export interface RecordsLensInput {
  groupingId?: string | null;
  segment?: RecordBookSegment;
}

const SNAPSHOT_ROW_DATE = new Date(0);

export function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function compareStable(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function uniqueSorted(values: readonly string[]): string[] {
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

function groupingFormatType(
  config: typeof leagueSeasonGroupings.$inferSelect.config,
): string {
  return typeof config.format_type === "string" && config.format_type
    ? config.format_type
    : "traditional";
}

function seasonSpanFromSeasons(seasons: readonly number[]): string | null {
  if (seasons.length === 0) {
    return null;
  }
  const sorted = [...seasons].sort((left, right) => left - right);
  const first = sorted[0] ?? 0;
  const last = sorted.at(-1) ?? first;
  return first === last ? String(first) : `${first}-${last}`;
}

function displayNameFor(input: {
  canonicalName: string;
  teamName: string | null;
}): string {
  return input.teamName
    ? `${input.teamName} (${input.canonicalName})`
    : input.canonicalName;
}

export function personRowsFromSnapshot(
  snapshot: ComposedCanonicalSnapshot,
): RecordsPersonRow[] {
  const latestPersonById = new Map<
    string,
    ComposedCanonicalSnapshot["persons"][number]
  >();
  for (const person of [...snapshot.persons].sort(
    (left, right) =>
      left.snapshotSeason - right.snapshotSeason ||
      compareStable(left.canonicalName, right.canonicalName) ||
      compareStable(left.id, right.id),
  )) {
    latestPersonById.set(person.id, person);
  }

  const teamSeasonsById = new Map(
    snapshot.teamSeasons.map((teamSeason) => [teamSeason.id, teamSeason]),
  );
  const latestTeamByPersonId = new Map<
    string,
    ComposedCanonicalSnapshot["teamSeasons"][number]
  >();
  const seasonsByPersonId = new Map<string, number[]>();
  const ownerNamesByPersonId = new Map<string, string[]>();

  for (const mapping of snapshot.identityMappings) {
    const teamSeason = teamSeasonsById.get(mapping.teamSeasonId);
    if (!teamSeason) {
      continue;
    }
    seasonsByPersonId.set(mapping.personId, [
      ...(seasonsByPersonId.get(mapping.personId) ?? []),
      teamSeason.season,
    ]);
    ownerNamesByPersonId.set(mapping.personId, [
      ...(ownerNamesByPersonId.get(mapping.personId) ?? []),
      ...teamSeason.ownerNames,
    ]);

    const current = latestTeamByPersonId.get(mapping.personId);
    if (
      !current ||
      teamSeason.season > current.season ||
      (teamSeason.season === current.season &&
        compareStable(teamSeason.id, current.id) > 0)
    ) {
      latestTeamByPersonId.set(mapping.personId, teamSeason);
    }
  }

  return [...latestPersonById.values()]
    .map((person) => {
      const ownerNames = uniqueSorted([
        ...ownerNamesFor(person.ownerHistory),
        ...(ownerNamesByPersonId.get(person.id) ?? []),
      ]);
      const seasons = seasonsByPersonId.get(person.id) ?? [];
      const pushedSpan = seasonSpanFromSeasons(seasons);
      return {
        canonicalName: person.canonicalName,
        id: person.id,
        name: displayNameFor({
          canonicalName: person.canonicalName,
          teamName: latestTeamByPersonId.get(person.id)?.teamName ?? null,
        }),
        ownerHistory: person.ownerHistory,
        ownerNames,
        seasonSpan: pushedSpan ?? seasonSpanFor(person.ownerHistory),
      };
    })
    .sort(
      (left, right) =>
        compareStable(left.name, right.name) ||
        compareStable(left.id, right.id),
    );
}

export function groupingOptionsFromSnapshot(
  snapshot: ComposedCanonicalSnapshot,
): RecordsGroupingOption[] {
  const byId = new Map<
    string,
    {
      row: ComposedCanonicalSnapshot["groupings"][number];
      seasons: Set<number>;
    }
  >();

  for (const row of snapshot.groupings) {
    if (
      row.status !== "confirmed" ||
      !row.seasons.includes(row.snapshotSeason)
    ) {
      continue;
    }
    const current = byId.get(row.id);
    if (!current) {
      byId.set(row.id, { row, seasons: new Set([row.snapshotSeason]) });
      continue;
    }
    current.seasons.add(row.snapshotSeason);
    if (row.snapshotSeason >= current.row.snapshotSeason) {
      current.row = row;
    }
  }

  return [...byId.values()]
    .map(({ row, seasons }) => ({
      formatType: groupingFormatType(row.config),
      id: row.id,
      kind: row.kind,
      name: row.name,
      ordinal: row.ordinal,
      seasons: [...seasons].sort((left, right) => left - right),
    }))
    .sort(
      (left, right) =>
        compareStable(left.kind, right.kind) ||
        left.ordinal - right.ordinal ||
        compareStable(left.name, right.name) ||
        compareStable(left.id, right.id),
    );
}

function dateFromSnapshot(value: string | undefined): Date {
  return value ? new Date(value) : SNAPSHOT_ROW_DATE;
}

export function weeklyRowsFromSnapshot(
  snapshot: ComposedCanonicalSnapshot,
): WeeklyStatisticsRow[] {
  return snapshot.weeklyStatistics.map((row) => ({
    createdAt: dateFromSnapshot(row.createdAt),
    id: row.id,
    isBottomScorer: row.isBottomScorer,
    isChampionship: row.isChampionship,
    isPlayoff: row.isPlayoff,
    isTopScorer: row.isTopScorer,
    leagueId: snapshot.leagueId,
    margin: row.margin,
    matchupId: row.matchupId,
    matchupKind: row.matchupKind,
    opponentPersonId: row.opponentPersonId,
    periodStart: row.periodStart,
    personId: row.personId,
    pointsAgainst: row.pointsAgainst,
    pointsFor: row.pointsFor,
    result: row.result,
    scoringPeriod: row.scoringPeriod,
    scoringPeriodSpan: row.scoringPeriodSpan,
    season: row.season,
    teamSeasonId: row.teamSeasonId,
    updatedAt: dateFromSnapshot(row.updatedAt ?? row.createdAt),
    weeklyRank: row.weeklyRank,
  }));
}

function regularSeasonWinnerPersonId(
  rows: readonly WeeklyStatisticsRow[],
  season: number,
): string | null {
  const standings = new Map<
    string,
    { losses: number; pointsFor: number; ties: number; wins: number }
  >();
  for (const row of rows) {
    if (row.season !== season || row.isPlayoff || row.result === "bye") {
      continue;
    }
    const current = standings.get(row.personId) ?? {
      losses: 0,
      pointsFor: 0,
      ties: 0,
      wins: 0,
    };
    current.wins += row.result === "win" ? 1 : 0;
    current.losses += row.result === "loss" ? 1 : 0;
    current.ties += row.result === "tie" ? 1 : 0;
    current.pointsFor = round(current.pointsFor + row.pointsFor, 4);
    standings.set(row.personId, current);
  }

  return (
    [...standings.entries()].sort((left, right) => {
      const leftWinPct =
        left[1].wins + left[1].losses + left[1].ties > 0
          ? (left[1].wins + left[1].ties * 0.5) /
            (left[1].wins + left[1].losses + left[1].ties)
          : 0;
      const rightWinPct =
        right[1].wins + right[1].losses + right[1].ties > 0
          ? (right[1].wins + right[1].ties * 0.5) /
            (right[1].wins + right[1].losses + right[1].ties)
          : 0;
      return (
        rightWinPct - leftWinPct ||
        right[1].pointsFor - left[1].pointsFor ||
        compareStable(left[0], right[0])
      );
    })[0]?.[0] ?? null
  );
}

export function championshipRowsFromWeeklyRows(
  rows: readonly WeeklyStatisticsRow[],
): ChampionshipRecordRow[] {
  const byMatchup = new Map<string, WeeklyStatisticsRow[]>();
  for (const row of rows) {
    if (
      !row.isChampionship ||
      row.matchupKind !== "head_to_head" ||
      !row.opponentPersonId
    ) {
      continue;
    }
    const key = `${row.season}:${row.periodStart ?? row.scoringPeriod}:${row.matchupId}`;
    byMatchup.set(key, [...(byMatchup.get(key) ?? []), row]);
  }

  const bySeason = new Map<number, WeeklyStatisticsRow[]>();
  for (const matchupRows of byMatchup.values()) {
    const first = matchupRows[0];
    if (!first || matchupRows.length < 2) {
      continue;
    }
    const current = bySeason.get(first.season);
    if (
      !current ||
      (first.periodStart ?? first.scoringPeriod) >
        (current[0]?.periodStart ?? current[0]?.scoringPeriod ?? 0) ||
      ((first.periodStart ?? first.scoringPeriod) ===
        (current[0]?.periodStart ?? current[0]?.scoringPeriod ?? 0) &&
        compareStable(first.matchupId, current[0]?.matchupId ?? "") > 0)
    ) {
      bySeason.set(first.season, matchupRows);
    }
  }

  return [...bySeason.entries()]
    .map(([season, matchupRows]) => {
      const sorted = [...matchupRows].sort(
        (left, right) =>
          right.pointsFor - left.pointsFor ||
          compareStable(left.personId, right.personId),
      );
      const champion = sorted[0] ?? null;
      const runnerUp = sorted[1] ?? null;
      return {
        championshipScore: champion?.pointsFor ?? null,
        championPersonId: champion?.personId ?? null,
        createdAt: SNAPSHOT_ROW_DATE,
        id: `pushed-championship-${season}`,
        leagueId: champion?.leagueId ?? runnerUp?.leagueId ?? "",
        regularSeasonWinnerPersonId: regularSeasonWinnerPersonId(rows, season),
        runnerUpPersonId: runnerUp?.personId ?? null,
        runnerUpScore: runnerUp?.pointsFor ?? null,
        season,
        thirdPlacePersonId: null,
        updatedAt: SNAPSHOT_ROW_DATE,
      } satisfies ChampionshipRecordRow;
    })
    .sort((left, right) => left.season - right.season);
}

export function resolveLensSelection(
  input: RecordsLensInput | null | undefined,
  groupings: readonly RecordsGroupingOption[],
): RecordsLensSelection {
  const segment = input?.segment ?? "both";
  const grouping =
    input?.groupingId && groupings.length > 0
      ? (groupings.find((option) => option.id === input.groupingId) ?? null)
      : null;
  return {
    groupingId: grouping?.id ?? null,
    groupings: [...groupings],
    scope: "all",
    seasonSet: grouping?.seasons ?? [],
    segment,
  };
}

export function toRecordBookLens(lens: RecordsLensSelection): RecordBookLens {
  return {
    groupingId: lens.groupingId,
    scope: lens.scope,
    seasonSet: lens.seasonSet,
    segment: lens.segment,
  };
}

function lensSeasonSet(lens: RecordsLensSelection): Set<number> | null {
  return lens.seasonSet.length > 0 ? new Set(lens.seasonSet) : null;
}

export function filterWeeklyRowsByLens(
  rows: readonly WeeklyStatisticsRow[],
  lens: RecordsLensSelection,
): WeeklyStatisticsRow[] {
  const seasons = lensSeasonSet(lens);
  return rows.filter((row) => {
    if (seasons && !seasons.has(row.season)) {
      return false;
    }
    if (lens.segment === "regular" && row.isPlayoff) {
      return false;
    }
    if (lens.segment === "playoff" && !row.isPlayoff) {
      return false;
    }
    return true;
  });
}

export function filterSeasonRowsByLens(
  rows: readonly SeasonStatisticsRow[],
  lens: RecordsLensSelection,
): SeasonStatisticsRow[] {
  const seasons = lensSeasonSet(lens);
  return seasons ? rows.filter((row) => seasons.has(row.season)) : [...rows];
}

export function filterChampionshipRowsByLens(
  rows: readonly ChampionshipRecordRow[],
  lens: RecordsLensSelection,
): ChampionshipRecordRow[] {
  if (lens.segment === "regular") {
    return [];
  }
  const seasons = lensSeasonSet(lens);
  return seasons ? rows.filter((row) => seasons.has(row.season)) : [...rows];
}

export function median(values: readonly number[]): number {
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

export function derivedSeasonRowsFromWeeklyRows(
  rows: readonly WeeklyStatisticsRow[],
  championshipRows: readonly ChampionshipRecordRow[] = [],
): SeasonStatisticsRow[] {
  const grouped = new Map<string, WeeklyStatisticsRow[]>();
  for (const row of rows) {
    grouped.set(`${row.personId}:${row.season}`, [
      ...(grouped.get(`${row.personId}:${row.season}`) ?? []),
      row,
    ]);
  }

  const championshipBySeason = new Map(
    championshipRows.map((row) => [row.season, row]),
  );
  const now = SNAPSHOT_ROW_DATE;
  return [...grouped.entries()].map(([key, groupedRows]) => {
    const [personId, seasonRaw] = key.split(":");
    const season = Number(seasonRaw);
    const championship = championshipBySeason.get(season) ?? null;
    const wins = groupedRows.filter((row) => row.result === "win").length;
    const losses = groupedRows.filter((row) => row.result === "loss").length;
    const ties = groupedRows.filter((row) => row.result === "tie").length;
    const pointsFor = round(
      groupedRows.reduce((sum, row) => sum + row.pointsFor, 0),
      4,
    );
    const pointsAgainst = round(
      groupedRows.reduce((sum, row) => sum + row.pointsAgainst, 0),
      4,
    );
    const scoringPeriods = groupedRows.reduce(
      (sum, row) => sum + Math.max(1, row.scoringPeriodSpan),
      0,
    );
    const scoresFor = groupedRows.map((row) => row.pointsFor);
    const scoresAgainst = groupedRows.map((row) => row.pointsAgainst);
    const positiveScores = scoresFor.filter((score) => score > 0);
    const games = wins + losses + ties;
    const finalPlacement =
      championship?.championPersonId === personId
        ? "champ"
        : championship?.runnerUpPersonId === personId
          ? "runner_up"
          : championship?.thirdPlacePersonId === personId
            ? "third"
            : "out";
    const finalRank =
      finalPlacement === "champ"
        ? 1
        : finalPlacement === "runner_up"
          ? 2
          : finalPlacement === "third"
            ? 3
            : 0;

    return {
      allPlayLosses: losses,
      allPlayTies: ties,
      allPlayWins: wins,
      avgPointsAgainst:
        scoringPeriods > 0 ? round(pointsAgainst / scoringPeriods, 4) : 0,
      avgPointsFor:
        scoringPeriods > 0 ? round(pointsFor / scoringPeriods, 4) : 0,
      createdAt: now,
      currentStreakLength: 0,
      currentStreakType: null,
      divisionWinner: false,
      expectedWins: wins,
      finalPlacement,
      finalRank,
      highestScore: scoresFor.length > 0 ? round(Math.max(...scoresFor), 4) : 0,
      id: `records-lens-season-${season}-${personId}`,
      leagueId: groupedRows[0]?.leagueId ?? "",
      longestLossStreak: 0,
      longestWinStreak: 0,
      losses,
      lowestScore:
        positiveScores.length > 0 ? round(Math.min(...positiveScores), 4) : 0,
      luck: 0,
      madeChampionship:
        championship?.championPersonId === personId ||
        championship?.runnerUpPersonId === personId,
      madePlayoffs: groupedRows.some((row) => row.isPlayoff),
      medianPointsAgainst:
        scoresAgainst.length > 0 ? round(median(scoresAgainst), 4) : 0,
      medianPointsFor: scoresFor.length > 0 ? round(median(scoresFor), 4) : 0,
      personId: personId ?? "",
      playoffSeed:
        championship?.regularSeasonWinnerPersonId === personId ? 1 : null,
      pointDifferential: round(pointsFor - pointsAgainst, 4),
      pointsAgainst,
      pointsFor,
      scoringStdDev: 0,
      season,
      ties,
      updatedAt: now,
      winPercentage: games > 0 ? round((wins + ties * 0.5) / games, 4) : 0,
      wins,
    } satisfies SeasonStatisticsRow;
  });
}

export function seasonRowsForLens(
  rows: readonly SeasonStatisticsRow[],
  championshipRows: readonly ChampionshipRecordRow[],
  weeklyRows: readonly WeeklyStatisticsRow[],
  lens: RecordsLensSelection,
): SeasonStatisticsRow[] {
  return lens.segment === "both"
    ? filterSeasonRowsByLens(rows, lens)
    : derivedSeasonRowsFromWeeklyRows(
        weeklyRows,
        filterChampionshipRowsByLens(championshipRows, lens),
      );
}

export interface CanonRecordsContextInput {
  leagueId: string;
  lens?: RecordsLensInput | null;
  limit?: number;
  /**
   * Optional lens chooser that runs AFTER the pushed groupings are known —
   * lets a caller (e.g. the personal agent) infer a grouping from a question
   * without composing the snapshot twice. Takes precedence over `lens`.
   */
  resolveLens?: (
    groupings: readonly RecordsGroupingOption[],
  ) => RecordsLensInput | null | undefined;
}

export interface CanonRecordsContext {
  /** Built exclusively from the pushed canonical snapshot. */
  catalog: CanonCatalog;
  /** Championship rows filtered to the selected lens. */
  championshipRows: ChampionshipRecordRow[];
  /** Confirmed groupings present in the pushed snapshot (view-only). */
  groupings: RecordsGroupingOption[];
  lens: RecordsLensSelection;
  personNames: Map<string, string>;
  personRows: RecordsPersonRow[];
  /** Season rows for the selected lens (derived for segment lenses). */
  seasonRows: SeasonStatisticsRow[];
  /** All derived season rows regardless of lens (catalog input). */
  seasonRowsAll: SeasonStatisticsRow[];
  /** Weekly rows filtered to the selected lens. */
  weeklyRows: WeeklyStatisticsRow[];
  /** All weekly rows from the pushed snapshot (catalog input). */
  weeklyRowsAll: WeeklyStatisticsRow[];
}

/**
 * The ONLY producer of `CanonCatalog`: composes the latest pushed canonical
 * snapshot per season and derives the records catalog from it. Saved-but-
 * unpushed edits, live provider data, and unconfirmed/unpushed groupings are
 * invisible here by construction.
 */
export async function getLeagueCanonRecordsContext(
  db: Db,
  input: CanonRecordsContextInput,
): Promise<CanonRecordsContext> {
  const snapshot = await composeCanonicalSnapshot(db, {
    leagueId: input.leagueId,
  });
  const personRows = personRowsFromSnapshot(snapshot);
  const personNames = new Map(
    personRows.map((person) => [person.id, person.name]),
  );
  const groupings = groupingOptionsFromSnapshot(snapshot);
  const lens = resolveLensSelection(
    input.resolveLens ? (input.resolveLens(groupings) ?? null) : input.lens,
    groupings,
  );
  const weeklyRowsAll = weeklyRowsFromSnapshot(snapshot);
  const championshipRowsAll = championshipRowsFromWeeklyRows(weeklyRowsAll);
  const seasonRowsAll = derivedSeasonRowsFromWeeklyRows(
    weeklyRowsAll,
    championshipRowsAll,
  );
  const weeklyRows = filterWeeklyRowsByLens(weeklyRowsAll, lens);
  const championshipRows = filterChampionshipRowsByLens(
    championshipRowsAll,
    lens,
  );
  const seasonRows = seasonRowsForLens(
    seasonRowsAll,
    championshipRowsAll,
    weeklyRows,
    lens,
  );

  const catalog = buildRecordsCatalog({
    championshipRows,
    lens: toRecordBookLens(lens),
    limit: input.limit,
    personNames,
    seasonRows: seasonRowsAll,
    weeklyRows: weeklyRowsAll,
  }) as CanonCatalog;

  return {
    catalog,
    championshipRows,
    groupings,
    lens,
    personNames,
    personRows,
    seasonRows,
    seasonRowsAll,
    weeklyRows,
    weeklyRowsAll,
  };
}
