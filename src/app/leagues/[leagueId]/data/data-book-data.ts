import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  identityMappings,
  leagueCurationCheckpoints,
  leagueCurationSeasonPushes,
  leagueCurationSeasonStates,
  leagueDataEdits,
  leagueSeasonSettings,
  leagues,
  persons,
  seasonStatistics,
  teamSeasons,
  weeklyStatistics,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import {
  listLeagueSeasonGroupings,
  type PersistedSeasonGrouping,
  proposeLeagueSeasonGroupings,
} from "@/stats";

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
type PersonRow = Pick<typeof persons.$inferSelect, "canonicalName" | "id">;
type TeamSeasonRow = Pick<
  typeof teamSeasons.$inferSelect,
  "division" | "id" | "ownerNames" | "providerTeamId" | "season" | "teamName"
>;
type IdentityMappingRow = Pick<
  typeof identityMappings.$inferSelect,
  "confidence" | "method" | "personId" | "teamSeasonId"
>;
type SeasonSettingsRow = typeof leagueSeasonSettings.$inferSelect;
type SeasonStatisticsRow = typeof seasonStatistics.$inferSelect;
type WeeklyStatisticsRow = typeof weeklyStatistics.$inferSelect;
type MatchupRow = Pick<
  typeof fantasyMatchups.$inferSelect,
  | "awayTeamProviderId"
  | "id"
  | "homeTeamProviderId"
  | "scoringPeriod"
  | "scoringPeriodSpan"
  | "season"
  | "status"
>;
type CurationCheckpointRow = typeof leagueCurationCheckpoints.$inferSelect;
type CurationSeasonPushRow = Pick<
  typeof leagueCurationSeasonPushes.$inferSelect,
  | "checkpointId"
  | "createdAt"
  | "id"
  | "latestEditId"
  | "markerEditId"
  | "season"
>;
type CurationSeasonStateRow = Pick<
  typeof leagueCurationSeasonStates.$inferSelect,
  "finalizedAt" | "finalizedByUserId" | "mode" | "reason" | "season"
>;
type LeagueDataEditMarkerRow = Pick<
  typeof leagueDataEdits.$inferSelect,
  "afterValue" | "createdAt" | "field" | "id" | "targetId" | "targetKind"
>;

export type DataBookGrain = "people" | "settings" | "weeks";

export interface DataBookLeagueSummary {
  id: string;
  name: string;
  provider: FantasyProviderId;
  providerLeagueId: string;
  scoringType: string;
  season: number;
  size: number;
  status: "complete" | "in_season" | "preseason" | "unknown";
}

export interface DataBookPersonRow {
  confidence: number | null;
  division: string | null;
  id: string;
  mappingMethod: string | null;
  ownerNames: string[];
  personId: string | null;
  personName: string;
  providerTeamId: string;
  teamName: string;
  teamSeasonId: string;
}

export interface DataBookSettingRow {
  detail: string | null;
  group: "Season totals" | "Settings";
  id: string;
  label: string;
  value: string;
}

export interface DataBookWeekRow {
  id: string;
  isChampionship: boolean;
  isPlayoff: boolean;
  managerName: string;
  matchupId: string;
  opponent: string;
  opponentPersonId: string | null;
  opponentTeamName: string | null;
  opponentTeamSeasonId: string | null;
  personId: string | null;
  pointsAgainst: number;
  pointsFor: number;
  result: "bye" | "loss" | "tie" | "win";
  scoringPeriod: number;
  span: number;
  teamName: string;
  teamSeasonId: string;
  weeklyRank: number;
}

export interface DataBookSeasonSummary {
  byeFacts: number;
  matchupFacts: number;
  people: number;
  seasonTotalPoints: number;
  teamWeekFacts: number;
  teams: number;
}

export interface DataBookSeason {
  people: DataBookPersonRow[];
  season: number;
  settings: DataBookSettingRow[];
  summary: DataBookSeasonSummary;
  weeks: DataBookWeekRow[];
}

export type DataBookCurationMode = "finalized" | "live";

export interface DataBookCheckpointOption {
  createdAt: string;
  id: string;
  label: string | null;
  latestEditId: string | null;
  markerEditId: string | null;
  note: string | null;
  seasons: number[];
}

export interface DataBookSeasonCurationState {
  activeCheckpointId: string | null;
  activeCheckpointLabel: string | null;
  autoSuggestFinalize: boolean;
  finalizedAt: string | null;
  finalizedByUserId: string | null;
  hasSavedUnpushed: boolean;
  hasUnsavedDraft: boolean;
  isPushed: boolean;
  latestPushAt: string | null;
  latestPushCheckpointId: string | null;
  latestPushId: string | null;
  mode: DataBookCurationMode;
  providerComplete: boolean;
  reason: string | null;
  season: number;
}

export interface DataBookCurationState {
  activeCheckpoint: DataBookCheckpointOption | null;
  checkpoints: DataBookCheckpointOption[];
  hasSavedUnpushed: boolean;
  hasUnsavedDraft: boolean;
  pushedSeasons: number;
  seasons: DataBookSeasonCurationState[];
  totalSeasons: number;
}

export interface DataBookEraProposal {
  id: string;
  kind: string;
  name: string;
  ordinal: number;
  rationale: string;
  seasons: number[];
  status: PersistedSeasonGrouping["status"];
}

export interface DataBookPageData {
  curation: DataBookCurationState;
  eraProposals: DataBookEraProposal[];
  league: DataBookLeagueSummary;
  seasons: DataBookSeason[];
}

export type DataBookResult =
  | { data: DataBookPageData; status: "ready" }
  | { status: "not_found" };

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatInteger(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : formatNumber(value, 0);
}

function formatMaybeNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : formatNumber(value);
}

function formatBoolean(value: boolean): string {
  return value ? "Yes" : "No";
}

function iso(value: Date): string {
  return value.toISOString();
}

function checkpointOption(
  row: CurationCheckpointRow,
): DataBookCheckpointOption {
  return {
    createdAt: iso(row.createdAt),
    id: row.id,
    label: row.label,
    latestEditId: row.latestEditId,
    markerEditId: row.markerEditId,
    note: row.note,
    seasons: row.seasons,
  };
}

function afterValueRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function activeCheckpointIdFromMarker(
  row: LeagueDataEditMarkerRow,
): string | null {
  if (
    row.targetKind === "curation_checkpoint" &&
    row.field === "checkpoint_restore"
  ) {
    const checkpointId = afterValueRecord(row.afterValue).checkpointId;
    return typeof checkpointId === "string" ? checkpointId : null;
  }
  if (
    row.targetKind === "curation_checkpoint" &&
    row.field === "checkpoint_save"
  ) {
    return row.targetId;
  }
  return null;
}

function isCheckpointMarker(row: LeagueDataEditMarkerRow): boolean {
  return activeCheckpointIdFromMarker(row) !== null;
}

function isDraftMutationMarker(row: LeagueDataEditMarkerRow): boolean {
  return (
    row.targetKind !== "curation_checkpoint" &&
    row.targetKind !== "curation_push"
  );
}

function lastIndexWhere<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index] as T)) {
      return index;
    }
  }
  return -1;
}

function buildCurationState(input: {
  checkpointRows: readonly CurationCheckpointRow[];
  editRows: readonly LeagueDataEditMarkerRow[];
  league: LeagueRow;
  pushRows: readonly CurationSeasonPushRow[];
  seasonStateRows: readonly CurationSeasonStateRow[];
  seasons: readonly DataBookSeason[];
}): DataBookCurationState {
  const checkpoints = input.checkpointRows.map(checkpointOption);
  const checkpointById = new Map(checkpoints.map((row) => [row.id, row]));
  const activeMarkerIndex = lastIndexWhere(input.editRows, isCheckpointMarker);
  const activeMarker =
    activeMarkerIndex >= 0 ? input.editRows[activeMarkerIndex] : null;
  const activeCheckpointId = activeMarker
    ? activeCheckpointIdFromMarker(activeMarker)
    : null;
  const activeCheckpoint = activeCheckpointId
    ? (checkpointById.get(activeCheckpointId) ?? null)
    : null;
  const latestDraftMutationIndex = lastIndexWhere(
    input.editRows,
    isDraftMutationMarker,
  );
  const hasUnsavedDraft = latestDraftMutationIndex > activeMarkerIndex;
  const latestPushBySeason = new Map<number, CurationSeasonPushRow>();
  for (const row of input.pushRows) {
    if (!latestPushBySeason.has(row.season)) {
      latestPushBySeason.set(row.season, row);
    }
  }
  const stateBySeason = new Map(
    input.seasonStateRows.map((row) => [row.season, row]),
  );
  const curationSeasons = input.seasons.map((season) => {
    const state = stateBySeason.get(season.season);
    const mode = state?.mode ?? "live";
    const latestPush = latestPushBySeason.get(season.season) ?? null;
    const providerComplete =
      season.season < input.league.season ||
      (season.season === input.league.season &&
        input.league.status === "complete");
    const activeCheckpointCoversSeason =
      activeCheckpoint?.seasons.includes(season.season) ?? false;
    const pushedFromActiveCheckpoint =
      activeCheckpoint !== null &&
      latestPush?.checkpointId === activeCheckpoint.id;
    const hasSavedUnpushed =
      activeCheckpointCoversSeason && !pushedFromActiveCheckpoint;

    return {
      activeCheckpointId: activeCheckpoint?.id ?? null,
      activeCheckpointLabel: activeCheckpoint?.label ?? null,
      autoSuggestFinalize: providerComplete && mode === "live",
      finalizedAt: state?.finalizedAt ? iso(state.finalizedAt) : null,
      finalizedByUserId: state?.finalizedByUserId ?? null,
      hasSavedUnpushed,
      hasUnsavedDraft,
      isPushed: latestPush !== null,
      latestPushAt: latestPush ? iso(latestPush.createdAt) : null,
      latestPushCheckpointId: latestPush?.checkpointId ?? null,
      latestPushId: latestPush?.id ?? null,
      mode,
      providerComplete,
      reason: state?.reason ?? null,
      season: season.season,
    };
  });

  return {
    activeCheckpoint,
    checkpoints,
    hasSavedUnpushed: curationSeasons.some((season) => season.hasSavedUnpushed),
    hasUnsavedDraft,
    pushedSeasons: curationSeasons.filter((season) => season.isPushed).length,
    seasons: curationSeasons,
    totalSeasons: curationSeasons.length,
  };
}

const ESPN_LINEUP_SLOT_LABELS: Readonly<Record<string, string>> = {
  "0": "QB",
  "2": "RB",
  "4": "WR",
  "6": "TE",
  "16": "D/ST",
  "17": "K",
  "20": "Bench",
  "21": "IR",
  "23": "Flex",
  "24": "OP",
};

function formatJsonRecord(
  value: Record<string, number> | Record<string, unknown>,
  options: { numericSlots?: boolean } = {},
): string {
  const entries = Object.entries(value).filter(([, nested]) => {
    if (typeof nested === "number") {
      return Number.isFinite(nested) && nested !== 0;
    }
    return nested !== null && nested !== undefined && nested !== "";
  });
  if (entries.length === 0) {
    return "-";
  }

  return entries
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, nested]) => {
      const label = options.numericSlots
        ? (ESPN_LINEUP_SLOT_LABELS[key] ?? key)
        : key.replaceAll("_", " ");
      return `${label}: ${typeof nested === "number" ? formatNumber(nested, 2) : String(nested)}`;
    })
    .join(", ");
}

function formatAcquisition(
  type: string | null,
  budget: number | null,
  settings: Record<string, unknown>,
): string {
  const typeLabel = type?.trim() || "unknown";
  const budgetLabel =
    budget === null || budget === undefined ? "" : `, budget ${budget}`;
  const details = formatJsonRecord(settings);
  return details === "-"
    ? `${typeLabel}${budgetLabel}`
    : `${typeLabel}${budgetLabel} (${details})`;
}

function uniqueSeasons(input: {
  league: LeagueRow;
  matchupRows: readonly MatchupRow[];
  seasonRows: readonly SeasonStatisticsRow[];
  settingsRows: readonly SeasonSettingsRow[];
  teamRows: readonly TeamSeasonRow[];
  weeklyRows: readonly WeeklyStatisticsRow[];
}): number[] {
  const seasons = new Set<number>([
    input.league.season,
    ...input.settingsRows.map((row) => row.season),
    ...input.teamRows.map((row) => row.season),
    ...input.weeklyRows.map((row) => row.season),
    ...input.matchupRows.map((row) => row.season),
    ...input.seasonRows.map((row) => row.season),
  ]);

  return [...seasons]
    .filter((season) => Number.isInteger(season) && season > 0)
    .sort((left, right) => right - left);
}

function toLeagueSummary(league: LeagueRow): DataBookLeagueSummary {
  return {
    id: league.id,
    name: league.name,
    provider: league.provider,
    providerLeagueId: league.providerLeagueId,
    scoringType: league.scoringType,
    season: league.season,
    size: league.size,
    status: league.status,
  };
}

function toEraProposal(grouping: PersistedSeasonGrouping): DataBookEraProposal {
  return {
    id: grouping.id,
    kind: grouping.kind,
    name: grouping.name,
    ordinal: grouping.ordinal,
    rationale: grouping.rationale,
    seasons: grouping.seasons,
    status: grouping.status,
  };
}

function buildPeopleRows(input: {
  mappingByTeamSeason: ReadonlyMap<string, IdentityMappingRow>;
  personById: ReadonlyMap<string, PersonRow>;
  season: number;
  teamRows: readonly TeamSeasonRow[];
}): DataBookPersonRow[] {
  return input.teamRows
    .filter((row) => row.season === input.season)
    .map((row) => {
      const mapping = input.mappingByTeamSeason.get(row.id) ?? null;
      const person = mapping
        ? (input.personById.get(mapping.personId) ?? null)
        : null;
      return {
        confidence: mapping?.confidence ?? null,
        division: row.division,
        id: row.id,
        mappingMethod: mapping?.method ?? null,
        ownerNames: row.ownerNames,
        personId: person?.id ?? null,
        personName: person?.canonicalName ?? "Unmapped person",
        providerTeamId: row.providerTeamId,
        teamName: row.teamName,
        teamSeasonId: row.id,
      };
    })
    .sort(
      (left, right) =>
        compareText(left.personName, right.personName) ||
        compareText(left.teamName, right.teamName) ||
        compareText(left.providerTeamId, right.providerTeamId),
    );
}

function seasonTotals(input: {
  matchupRows: readonly MatchupRow[];
  season: number;
  seasonRows: readonly SeasonStatisticsRow[];
  teamRows: readonly TeamSeasonRow[];
  weeklyRows: readonly WeeklyStatisticsRow[];
}): DataBookSeasonSummary {
  const weeklyRows = input.weeklyRows.filter(
    (row) => row.season === input.season,
  );
  const seasonRows = input.seasonRows.filter(
    (row) => row.season === input.season,
  );
  const matchupRows = input.matchupRows.filter(
    (row) => row.season === input.season,
  );
  const teamRows = input.teamRows.filter((row) => row.season === input.season);
  const seasonTotalPoints =
    seasonRows.length > 0
      ? seasonRows.reduce((sum, row) => sum + row.pointsFor, 0)
      : weeklyRows.reduce((sum, row) => sum + row.pointsFor, 0);

  return {
    byeFacts: weeklyRows.filter((row) => row.result === "bye").length,
    matchupFacts: matchupRows.length,
    people: new Set(
      seasonRows.map((row) => row.personId).filter((id) => Boolean(id)),
    ).size,
    seasonTotalPoints,
    teamWeekFacts: weeklyRows.length,
    teams: teamRows.length,
  };
}

function buildSettingRows(input: {
  matchupRows: readonly MatchupRow[];
  season: number;
  seasonRows: readonly SeasonStatisticsRow[];
  settings: SeasonSettingsRow | null;
  summary: DataBookSeasonSummary;
  teamRows: readonly TeamSeasonRow[];
  weeklyRows: readonly WeeklyStatisticsRow[];
}): DataBookSettingRow[] {
  const settings = input.settings;
  const seasonRows = input.seasonRows.filter(
    (row) => row.season === input.season,
  );
  const wins = seasonRows.reduce((sum, row) => sum + row.wins, 0);
  const losses = seasonRows.reduce((sum, row) => sum + row.losses, 0);
  const ties = seasonRows.reduce((sum, row) => sum + row.ties, 0);
  const weeklyRows = input.weeklyRows.filter(
    (row) => row.season === input.season,
  );
  const avgTeamWeek =
    weeklyRows.length > 0
      ? input.summary.seasonTotalPoints / weeklyRows.length
      : 0;

  return [
    {
      detail: "Persisted from provider season settings.",
      group: "Settings",
      id: "league-size",
      label: "League size",
      value: formatInteger(settings?.leagueSize ?? input.summary.teams),
    },
    {
      detail: "Regular season endpoint where the provider exposed it.",
      group: "Settings",
      id: "regular-season",
      label: "Regular season weeks",
      value: formatInteger(settings?.regularSeasonEndScoringPeriod),
    },
    {
      detail: "Total scoring periods in the provider schedule.",
      group: "Settings",
      id: "matchup-periods",
      label: "Matchup periods",
      value: formatInteger(settings?.matchupPeriodCount),
    },
    {
      detail: "Persisted playoff field from mSettings.",
      group: "Settings",
      id: "playoff-teams",
      label: "Playoff teams",
      value: formatInteger(settings?.playoffTeamCount),
    },
    {
      detail: "Used by the substrate to derive multi-week matchup spans.",
      group: "Settings",
      id: "playoff-length",
      label: "Playoff matchup length",
      value: formatInteger(settings?.playoffMatchupPeriodLength),
    },
    {
      detail: "Provider championship scoring period.",
      group: "Settings",
      id: "championship-period",
      label: "Championship week",
      value: formatInteger(settings?.championshipScoringPeriod),
    },
    {
      detail: "Roster slot counts stored as normalized JSON.",
      group: "Settings",
      id: "lineup-slots",
      label: "Lineup slots",
      value: settings
        ? formatJsonRecord(settings.lineupSlotCounts, { numericSlots: true })
        : "-",
    },
    {
      detail: "Provider scoring type plus scoring settings payload count.",
      group: "Settings",
      id: "scoring",
      label: "Scoring",
      value: settings
        ? `${settings.scoringType} (${Object.keys(settings.scoringSettings).length} settings)`
        : "-",
    },
    {
      detail: "Waiver/free-agent acquisition posture for the season.",
      group: "Settings",
      id: "acquisition",
      label: "Acquisition",
      value: settings
        ? formatAcquisition(
            settings.acquisitionType,
            settings.acquisitionBudget,
            settings.acquisitionSettings,
          )
        : "-",
    },
    {
      detail: "SeasonStatistics W-L-T totals; bye rows do not add W/L/T.",
      group: "Season totals",
      id: "record-total",
      label: "Recorded W-L-T",
      value: `${wins}-${losses}-${ties}`,
    },
    {
      detail: "Sum of season points for all mapped people.",
      group: "Season totals",
      id: "points-for",
      label: "Total points for",
      value: formatMaybeNumber(input.summary.seasonTotalPoints),
    },
    {
      detail: "Average points per team-week fact.",
      group: "Season totals",
      id: "avg-team-week",
      label: "Avg team-week score",
      value: weeklyRows.length > 0 ? formatMaybeNumber(avgTeamWeek) : "-",
    },
    {
      detail: "One row per team scoring period in weekly statistics.",
      group: "Season totals",
      id: "team-week-facts",
      label: "Team-week facts",
      value: formatInteger(input.summary.teamWeekFacts),
    },
    {
      detail: "Provider matchup facts, including one-sided byes.",
      group: "Season totals",
      id: "matchup-facts",
      label: "Matchup facts",
      value: formatInteger(input.summary.matchupFacts),
    },
    {
      detail: "Weekly statistics rows with result=bye.",
      group: "Season totals",
      id: "bye-facts",
      label: "Bye facts",
      value: formatInteger(input.summary.byeFacts),
    },
    {
      detail: "Keeper/dynasty flags from persisted settings.",
      group: "Settings",
      id: "keeper-dynasty",
      label: "Keeper / dynasty",
      value: settings
        ? `${formatBoolean(settings.isKeeperLeague)} / ${formatBoolean(settings.isDynastyLeague)}`
        : "-",
    },
  ];
}

function buildWeekRows(input: {
  mappingByTeamSeason: ReadonlyMap<string, IdentityMappingRow>;
  personById: ReadonlyMap<string, PersonRow>;
  season: number;
  teamById: ReadonlyMap<string, TeamSeasonRow>;
  weeklyRows: readonly WeeklyStatisticsRow[];
}): DataBookWeekRow[] {
  const rows = input.weeklyRows.filter((row) => row.season === input.season);
  const rowsByMatchup = new Map<string, WeeklyStatisticsRow[]>();
  for (const row of rows) {
    rowsByMatchup.set(row.matchupId, [
      ...(rowsByMatchup.get(row.matchupId) ?? []),
      row,
    ]);
  }

  return rows
    .map((row) => {
      const team = input.teamById.get(row.teamSeasonId) ?? null;
      const person = input.personById.get(row.personId) ?? null;
      const opponentRow =
        row.opponentPersonId === null
          ? null
          : (rowsByMatchup
              .get(row.matchupId)
              ?.find((candidate) => candidate.personId !== row.personId) ??
            null);
      const opponentPerson =
        row.opponentPersonId === null
          ? null
          : (input.personById.get(row.opponentPersonId) ?? null);
      const opponentTeam = opponentRow
        ? (input.teamById.get(opponentRow.teamSeasonId) ?? null)
        : null;

      return {
        id: row.id,
        isChampionship: row.isChampionship,
        isPlayoff: row.isPlayoff,
        managerName: person?.canonicalName ?? "Unknown manager",
        matchupId: row.matchupId,
        opponent:
          row.result === "bye"
            ? "BYE"
            : (opponentPerson?.canonicalName ?? "Unknown opponent"),
        opponentPersonId: row.opponentPersonId,
        opponentTeamName: opponentTeam?.teamName ?? null,
        opponentTeamSeasonId: opponentRow?.teamSeasonId ?? null,
        personId: row.personId,
        pointsAgainst: row.pointsAgainst,
        pointsFor: row.pointsFor,
        result: row.result,
        scoringPeriod: row.scoringPeriod,
        span: row.scoringPeriodSpan,
        teamName: team?.teamName ?? "Unknown team",
        teamSeasonId: row.teamSeasonId,
        weeklyRank: row.weeklyRank,
      };
    })
    .sort(
      (left, right) =>
        left.scoringPeriod - right.scoringPeriod ||
        compareText(left.teamName, right.teamName) ||
        compareText(left.id, right.id),
    );
}

function buildSeasonData(input: {
  league: LeagueRow;
  mappingByTeamSeason: ReadonlyMap<string, IdentityMappingRow>;
  matchupRows: readonly MatchupRow[];
  personById: ReadonlyMap<string, PersonRow>;
  season: number;
  seasonRows: readonly SeasonStatisticsRow[];
  settingsBySeason: ReadonlyMap<number, SeasonSettingsRow>;
  teamById: ReadonlyMap<string, TeamSeasonRow>;
  teamRows: readonly TeamSeasonRow[];
  weeklyRows: readonly WeeklyStatisticsRow[];
}): DataBookSeason {
  const summary = seasonTotals({
    matchupRows: input.matchupRows,
    season: input.season,
    seasonRows: input.seasonRows,
    teamRows: input.teamRows,
    weeklyRows: input.weeklyRows,
  });

  return {
    people: buildPeopleRows(input),
    season: input.season,
    settings: buildSettingRows({
      matchupRows: input.matchupRows,
      season: input.season,
      seasonRows: input.seasonRows,
      settings: input.settingsBySeason.get(input.season) ?? null,
      summary,
      teamRows: input.teamRows,
      weeklyRows: input.weeklyRows,
    }),
    summary,
    weeks: buildWeekRows(input),
  };
}

export async function getLeagueDataBookData(
  db: Db,
  input: { canManageEras?: boolean; leagueId: string },
): Promise<DataBookResult> {
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
    const personRows = await tx
      .select({
        canonicalName: persons.canonicalName,
        id: persons.id,
      })
      .from(persons)
      .where(eq(persons.leagueId, input.leagueId))
      .orderBy(asc(persons.canonicalName), asc(persons.id));

    const teamRows = await tx
      .select({
        division: teamSeasons.division,
        id: teamSeasons.id,
        ownerNames: teamSeasons.ownerNames,
        providerTeamId: teamSeasons.providerTeamId,
        season: teamSeasons.season,
        teamName: teamSeasons.teamName,
      })
      .from(teamSeasons)
      .where(eq(teamSeasons.leagueId, input.leagueId))
      .orderBy(desc(teamSeasons.season), asc(teamSeasons.teamName));

    const mappingRows =
      teamRows.length > 0
        ? await tx
            .select({
              confidence: identityMappings.confidence,
              method: identityMappings.method,
              personId: identityMappings.personId,
              teamSeasonId: identityMappings.teamSeasonId,
            })
            .from(identityMappings)
            .where(
              and(
                eq(identityMappings.leagueId, input.leagueId),
                inArray(
                  identityMappings.teamSeasonId,
                  teamRows.map((row) => row.id),
                ),
              ),
            )
        : [];

    const settingsRows = await tx
      .select()
      .from(leagueSeasonSettings)
      .where(eq(leagueSeasonSettings.leagueId, input.leagueId))
      .orderBy(desc(leagueSeasonSettings.season));

    const seasonRows = await tx
      .select()
      .from(seasonStatistics)
      .where(eq(seasonStatistics.leagueId, input.leagueId))
      .orderBy(desc(seasonStatistics.season), asc(seasonStatistics.personId));

    const weeklyRows = await tx
      .select()
      .from(weeklyStatistics)
      .where(eq(weeklyStatistics.leagueId, input.leagueId))
      .orderBy(
        desc(weeklyStatistics.season),
        asc(weeklyStatistics.scoringPeriod),
        asc(weeklyStatistics.matchupId),
        asc(weeklyStatistics.personId),
      );

    const matchupRows = await tx
      .select({
        awayTeamProviderId: fantasyMatchups.awayTeamProviderId,
        homeTeamProviderId: fantasyMatchups.homeTeamProviderId,
        id: fantasyMatchups.id,
        scoringPeriod: fantasyMatchups.scoringPeriod,
        scoringPeriodSpan: fantasyMatchups.scoringPeriodSpan,
        season: fantasyMatchups.season,
        status: fantasyMatchups.status,
      })
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.leagueId, input.leagueId))
      .orderBy(
        desc(fantasyMatchups.season),
        asc(fantasyMatchups.scoringPeriod),
        asc(fantasyMatchups.id),
      );

    const checkpointRows = await tx
      .select()
      .from(leagueCurationCheckpoints)
      .where(eq(leagueCurationCheckpoints.leagueId, input.leagueId))
      .orderBy(
        desc(leagueCurationCheckpoints.createdAt),
        desc(leagueCurationCheckpoints.id),
      );

    const pushRows = await tx
      .select({
        checkpointId: leagueCurationSeasonPushes.checkpointId,
        createdAt: leagueCurationSeasonPushes.createdAt,
        id: leagueCurationSeasonPushes.id,
        latestEditId: leagueCurationSeasonPushes.latestEditId,
        markerEditId: leagueCurationSeasonPushes.markerEditId,
        season: leagueCurationSeasonPushes.season,
      })
      .from(leagueCurationSeasonPushes)
      .where(eq(leagueCurationSeasonPushes.leagueId, input.leagueId))
      .orderBy(
        desc(leagueCurationSeasonPushes.season),
        desc(leagueCurationSeasonPushes.createdAt),
        desc(leagueCurationSeasonPushes.id),
      );

    const seasonStateRows = await tx
      .select({
        finalizedAt: leagueCurationSeasonStates.finalizedAt,
        finalizedByUserId: leagueCurationSeasonStates.finalizedByUserId,
        mode: leagueCurationSeasonStates.mode,
        reason: leagueCurationSeasonStates.reason,
        season: leagueCurationSeasonStates.season,
      })
      .from(leagueCurationSeasonStates)
      .where(eq(leagueCurationSeasonStates.leagueId, input.leagueId))
      .orderBy(desc(leagueCurationSeasonStates.season));

    const editRows = await tx
      .select({
        afterValue: leagueDataEdits.afterValue,
        createdAt: leagueDataEdits.createdAt,
        field: leagueDataEdits.field,
        id: leagueDataEdits.id,
        targetId: leagueDataEdits.targetId,
        targetKind: leagueDataEdits.targetKind,
      })
      .from(leagueDataEdits)
      .where(eq(leagueDataEdits.leagueId, input.leagueId))
      .orderBy(asc(leagueDataEdits.createdAt), asc(leagueDataEdits.id));

    return {
      checkpointRows,
      editRows,
      mappingRows,
      matchupRows,
      personRows,
      pushRows,
      seasonRows,
      seasonStateRows,
      settingsRows,
      teamRows,
      weeklyRows,
    };
  });

  const personById = new Map<string, PersonRow>(
    scoped.personRows.map((row) => [row.id, row]),
  );
  const teamById = new Map<string, TeamSeasonRow>(
    scoped.teamRows.map((row) => [row.id, row]),
  );
  const mappingByTeamSeason = new Map<string, IdentityMappingRow>(
    scoped.mappingRows.map((row) => [row.teamSeasonId, row]),
  );
  const settingsBySeason = new Map<number, SeasonSettingsRow>(
    scoped.settingsRows.map((row) => [row.season, row]),
  );

  const seasons = uniqueSeasons({ league, ...scoped }).map((season) =>
    buildSeasonData({
      league,
      mappingByTeamSeason,
      matchupRows: scoped.matchupRows,
      personById,
      season,
      seasonRows: scoped.seasonRows,
      settingsBySeason,
      teamById,
      teamRows: scoped.teamRows,
      weeklyRows: scoped.weeklyRows,
    }),
  );
  const groupings = input.canManageEras
    ? await proposeLeagueSeasonGroupings(db, { leagueId: input.leagueId })
    : await listLeagueSeasonGroupings(db, { leagueId: input.leagueId });

  return {
    data: {
      curation: buildCurationState({
        checkpointRows: scoped.checkpointRows,
        editRows: scoped.editRows,
        league,
        pushRows: scoped.pushRows,
        seasonStateRows: scoped.seasonStateRows,
        seasons,
      }),
      eraProposals: groupings
        .filter((grouping) => grouping.kind === "era")
        .filter((grouping) => grouping.status !== "dismissed")
        .map(toEraProposal),
      league: toLeagueSummary(league),
      seasons,
    },
    status: "ready",
  };
}
