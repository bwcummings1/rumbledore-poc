import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  dataCorrectionAuditLog,
  fantasyMatchups,
  identityAuditLog,
  type LeagueSeasonGroupingConfig,
  leagueDataEdits,
  leagueGroupingSeasons,
  leagueSeasonGroupings,
  leagueSeasonSettings,
  persons,
  statsCalculations,
  teamSeasons,
  weeklyStatistics,
} from "@/db/schema";
import { recomputeChangedMatchupStatistics } from "./engine";
import { refreshRecordBookAggregates } from "./records-catalog";

type LeagueDataEditInsert = typeof leagueDataEdits.$inferInsert;
export type LeagueDataEditTargetKind = LeagueDataEditInsert["targetKind"];
export type LeagueDataEditClass = LeagueDataEditInsert["editClass"];
export type UnifiedLedgerTargetKind =
  | LeagueDataEditTargetKind
  | "integrity_check";

export interface ApplyLeagueDataEditInput {
  actorUserId: string;
  editClass: LeagueDataEditClass;
  field: string;
  leagueId: string;
  reason?: string;
  targetId: string;
  targetKind: LeagueDataEditTargetKind;
  value: unknown;
}

export interface ApplyLeagueDataEditResult {
  afterValue: unknown;
  beforeValue: unknown;
  editId: string;
  recompute: {
    matchups: number;
    records: number;
  };
}

export interface UnifiedLedgerEntry {
  actorUserId: string | null;
  afterValue: unknown;
  beforeValue: unknown;
  createdAt: string;
  editClass: LeagueDataEditClass | "audit";
  field: string;
  id: string;
  reason: string | null;
  source: "league_data_edit" | "identity_audit" | "data_correction_audit";
  targetId: string | null;
  targetKind: string;
}

export interface SeasonGroupingProposal {
  config: LeagueSeasonGroupingConfig;
  derivedFrom: Record<string, unknown>;
  kind: string;
  name: string;
  ordinal: number;
  seasons: number[];
}

export interface PersistedSeasonGrouping extends SeasonGroupingProposal {
  confirmedByUserId: string | null;
  id: string;
  status: "proposed" | "confirmed";
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortedUniqueNumbers(values: Iterable<number>): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right);
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

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${field} must be a string array`);
  }
  return [...new Set(value.map((entry) => entry.trim()).filter(Boolean))].sort(
    compareStable,
  );
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function optionalInteger(value: unknown, field: string): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer or null`);
  }
  return Number(value);
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

async function recordScopedRecordsRefresh(
  tx: LeagueScopedTx,
  input: {
    field: string;
    leagueId: string;
    targetId: string;
    targetKind: LeagueDataEditTargetKind | "grouping";
    trigger: string;
  },
): Promise<number> {
  const refreshed = await refreshRecordBookAggregates(tx, {
    leagueId: input.leagueId,
  });
  const rowsProcessed = refreshed.standings + refreshed.milestones;
  await tx.insert(statsCalculations).values({
    calculationType: "records",
    completedAt: new Date(),
    durationMs: 0,
    leagueId: input.leagueId,
    metadata: input,
    rowsProcessed,
    status: "completed",
  });
  return rowsProcessed;
}

async function writeDataEdit(
  tx: LeagueScopedTx,
  input: ApplyLeagueDataEditInput & {
    afterValue: unknown;
    beforeValue: unknown;
  },
): Promise<string> {
  const [edit] = await tx
    .insert(leagueDataEdits)
    .values({
      actorUserId: input.actorUserId,
      afterValue: input.afterValue,
      beforeValue: input.beforeValue,
      editClass: input.editClass,
      field: input.field,
      leagueId: input.leagueId,
      reason: input.reason ?? null,
      targetId: input.targetId,
      targetKind: input.targetKind,
    })
    .returning({ id: leagueDataEdits.id });
  if (!edit) {
    throw new Error("league data edit was not written");
  }
  return edit.id;
}

async function applyTargetUpdate(
  tx: LeagueScopedTx,
  input: ApplyLeagueDataEditInput,
): Promise<{
  afterValue: unknown;
  beforeValue: unknown;
  matchupIds: string[];
  recordsRefresh: boolean;
}> {
  if (input.targetKind === "person") {
    const [row] = await tx
      .select()
      .from(persons)
      .where(
        and(
          eq(persons.leagueId, input.leagueId),
          eq(persons.id, input.targetId),
        ),
      )
      .limit(1);
    if (!row || input.field !== "canonical_name") {
      throw new Error("editable person field was not found");
    }
    const afterValue = requireString(input.value, input.field);
    await tx
      .update(persons)
      .set({ canonicalName: afterValue, updatedAt: new Date() })
      .where(eq(persons.id, row.id));
    return {
      afterValue,
      beforeValue: row.canonicalName,
      matchupIds: [],
      recordsRefresh: true,
    };
  }

  if (input.targetKind === "team_season") {
    const [row] = await tx
      .select()
      .from(teamSeasons)
      .where(
        and(
          eq(teamSeasons.leagueId, input.leagueId),
          eq(teamSeasons.id, input.targetId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new Error("team-season was not found");
    }
    if (input.field === "team_name") {
      const afterValue = requireString(input.value, input.field);
      await tx
        .update(teamSeasons)
        .set({ teamName: afterValue, updatedAt: new Date() })
        .where(eq(teamSeasons.id, row.id));
      return {
        afterValue,
        beforeValue: row.teamName,
        matchupIds: [],
        recordsRefresh: true,
      };
    }
    if (input.field === "owner_names") {
      const afterValue = requireStringArray(input.value, input.field);
      await tx
        .update(teamSeasons)
        .set({ ownerNames: afterValue, updatedAt: new Date() })
        .where(eq(teamSeasons.id, row.id));
      return {
        afterValue,
        beforeValue: row.ownerNames,
        matchupIds: [],
        recordsRefresh: true,
      };
    }
    if (input.field === "division") {
      const afterValue =
        input.value === null ? null : requireString(input.value, input.field);
      await tx
        .update(teamSeasons)
        .set({ division: afterValue, updatedAt: new Date() })
        .where(eq(teamSeasons.id, row.id));
      return {
        afterValue,
        beforeValue: row.division,
        matchupIds: [],
        recordsRefresh: false,
      };
    }
  }

  if (input.targetKind === "matchup") {
    const [row] = await tx
      .select()
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.leagueId, input.leagueId),
          eq(fantasyMatchups.id, input.targetId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new Error("matchup was not found");
    }
    if (input.field === "home_score") {
      const afterValue = requireNumber(input.value, input.field);
      await tx
        .update(fantasyMatchups)
        .set({ homeScore: afterValue, updatedAt: new Date() })
        .where(eq(fantasyMatchups.id, row.id));
      return {
        afterValue,
        beforeValue: row.homeScore,
        matchupIds: [row.id],
        recordsRefresh: false,
      };
    }
    if (input.field === "away_score") {
      const afterValue = requireNumber(input.value, input.field);
      await tx
        .update(fantasyMatchups)
        .set({ awayScore: afterValue, updatedAt: new Date() })
        .where(eq(fantasyMatchups.id, row.id));
      return {
        afterValue,
        beforeValue: row.awayScore,
        matchupIds: [row.id],
        recordsRefresh: false,
      };
    }
    if (input.field === "winner") {
      if (!["home", "away", "tie", "unknown"].includes(String(input.value))) {
        throw new Error("winner must be a matchup winner value");
      }
      const afterValue = String(input.value) as typeof row.winner;
      await tx
        .update(fantasyMatchups)
        .set({ updatedAt: new Date(), winner: afterValue })
        .where(eq(fantasyMatchups.id, row.id));
      return {
        afterValue,
        beforeValue: row.winner,
        matchupIds: [row.id],
        recordsRefresh: false,
      };
    }
    if (input.field === "scoring_period_span") {
      const afterValue = requirePositiveInteger(input.value, input.field);
      await tx
        .update(fantasyMatchups)
        .set({ scoringPeriodSpan: afterValue, updatedAt: new Date() })
        .where(eq(fantasyMatchups.id, row.id));
      return {
        afterValue,
        beforeValue: row.scoringPeriodSpan,
        matchupIds: [row.id],
        recordsRefresh: false,
      };
    }
    if (input.field === "period_start") {
      const afterValue = optionalInteger(input.value, input.field);
      await tx
        .update(fantasyMatchups)
        .set({ periodStart: afterValue, updatedAt: new Date() })
        .where(eq(fantasyMatchups.id, row.id));
      return {
        afterValue,
        beforeValue: row.periodStart,
        matchupIds: [row.id],
        recordsRefresh: false,
      };
    }
  }

  if (input.targetKind === "weekly_stat") {
    const [row] = await tx
      .select()
      .from(weeklyStatistics)
      .where(
        and(
          eq(weeklyStatistics.leagueId, input.leagueId),
          eq(weeklyStatistics.id, input.targetId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new Error("weekly statistic was not found");
    }
    if (input.field === "points_for") {
      const afterValue = requireNumber(input.value, input.field);
      await tx
        .update(weeklyStatistics)
        .set({ pointsFor: afterValue, updatedAt: new Date() })
        .where(eq(weeklyStatistics.id, row.id));
      return {
        afterValue,
        beforeValue: row.pointsFor,
        matchupIds: [],
        recordsRefresh: true,
      };
    }
    if (input.field === "points_against") {
      const afterValue = requireNumber(input.value, input.field);
      await tx
        .update(weeklyStatistics)
        .set({ pointsAgainst: afterValue, updatedAt: new Date() })
        .where(eq(weeklyStatistics.id, row.id));
      return {
        afterValue,
        beforeValue: row.pointsAgainst,
        matchupIds: [],
        recordsRefresh: true,
      };
    }
    if (input.field === "result") {
      if (!["win", "loss", "tie"].includes(String(input.value))) {
        throw new Error("result must be a statistic result value");
      }
      const afterValue = String(input.value) as typeof row.result;
      await tx
        .update(weeklyStatistics)
        .set({ result: afterValue, updatedAt: new Date() })
        .where(eq(weeklyStatistics.id, row.id));
      return {
        afterValue,
        beforeValue: row.result,
        matchupIds: [],
        recordsRefresh: true,
      };
    }
    if (input.field === "scoring_period_span") {
      const afterValue = requirePositiveInteger(input.value, input.field);
      await tx
        .update(weeklyStatistics)
        .set({ scoringPeriodSpan: afterValue, updatedAt: new Date() })
        .where(eq(weeklyStatistics.id, row.id));
      return {
        afterValue,
        beforeValue: row.scoringPeriodSpan,
        matchupIds: [],
        recordsRefresh: true,
      };
    }
    if (input.field === "period_start") {
      const afterValue = optionalInteger(input.value, input.field);
      await tx
        .update(weeklyStatistics)
        .set({ periodStart: afterValue, updatedAt: new Date() })
        .where(eq(weeklyStatistics.id, row.id));
      return {
        afterValue,
        beforeValue: row.periodStart,
        matchupIds: [],
        recordsRefresh: true,
      };
    }
  }

  if (input.targetKind === "season_setting") {
    const [row] = await tx
      .select()
      .from(leagueSeasonSettings)
      .where(
        and(
          eq(leagueSeasonSettings.leagueId, input.leagueId),
          eq(leagueSeasonSettings.id, input.targetId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new Error("season settings row was not found");
    }
    const seasonMatchups = await tx
      .select({ id: fantasyMatchups.id })
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.leagueId, input.leagueId),
          eq(fantasyMatchups.season, row.season),
          eq(fantasyMatchups.status, "final"),
        ),
      );
    const matchupIds = seasonMatchups.map((matchup) => matchup.id);
    if (input.field === "matchup_period_count") {
      const afterValue = requirePositiveInteger(input.value, input.field);
      await tx
        .update(leagueSeasonSettings)
        .set({ matchupPeriodCount: afterValue, updatedAt: new Date() })
        .where(eq(leagueSeasonSettings.id, row.id));
      return {
        afterValue,
        beforeValue: row.matchupPeriodCount,
        matchupIds,
        recordsRefresh: false,
      };
    }
    const boundaryFields = {
      championship_scoring_period: "championshipScoringPeriod",
      playoff_start_scoring_period: "playoffStartScoringPeriod",
      playoff_team_count: "playoffTeamCount",
      regular_season_end_scoring_period: "regularSeasonEndScoringPeriod",
    } as const;
    if (input.field in boundaryFields) {
      const afterValue = optionalInteger(input.value, input.field);
      const property =
        boundaryFields[input.field as keyof typeof boundaryFields];
      await tx
        .update(leagueSeasonSettings)
        .set({ [property]: afterValue, updatedAt: new Date() })
        .where(eq(leagueSeasonSettings.id, row.id));
      return {
        afterValue,
        beforeValue: row[property],
        matchupIds,
        recordsRefresh: false,
      };
    }
    if (input.field === "scoring_settings") {
      const afterValue = requireObject(input.value, input.field);
      await tx
        .update(leagueSeasonSettings)
        .set({ scoringSettings: afterValue, updatedAt: new Date() })
        .where(eq(leagueSeasonSettings.id, row.id));
      return {
        afterValue,
        beforeValue: row.scoringSettings,
        matchupIds,
        recordsRefresh: false,
      };
    }
    if (input.field === "keeper_settings") {
      const afterValue = requireObject(input.value, input.field);
      await tx
        .update(leagueSeasonSettings)
        .set({ keeperSettings: afterValue, updatedAt: new Date() })
        .where(eq(leagueSeasonSettings.id, row.id));
      return {
        afterValue,
        beforeValue: row.keeperSettings,
        matchupIds,
        recordsRefresh: false,
      };
    }
  }

  if (input.targetKind === "grouping") {
    const [row] = await tx
      .select()
      .from(leagueSeasonGroupings)
      .where(
        and(
          eq(leagueSeasonGroupings.leagueId, input.leagueId),
          eq(leagueSeasonGroupings.id, input.targetId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new Error("season grouping was not found");
    }
    if (input.field === "name") {
      const afterValue = requireString(input.value, input.field);
      await tx
        .update(leagueSeasonGroupings)
        .set({ name: afterValue })
        .where(eq(leagueSeasonGroupings.id, row.id));
      return {
        afterValue,
        beforeValue: row.name,
        matchupIds: [],
        recordsRefresh: true,
      };
    }
    if (input.field === "config") {
      const afterValue = requireObject(input.value, input.field);
      await tx
        .update(leagueSeasonGroupings)
        .set({ config: afterValue })
        .where(eq(leagueSeasonGroupings.id, row.id));
      return {
        afterValue,
        beforeValue: row.config,
        matchupIds: [],
        recordsRefresh: true,
      };
    }
  }

  throw new Error(
    `${input.targetKind}.${input.field} is not an editable data field`,
  );
}

export async function applyLeagueDataEdit(
  db: Db,
  input: ApplyLeagueDataEditInput,
): Promise<ApplyLeagueDataEditResult> {
  const applied = await withLeagueContext(db, input.leagueId, async (tx) => {
    const update = await applyTargetUpdate(tx, input);
    const editId = await writeDataEdit(tx, {
      ...input,
      afterValue: update.afterValue,
      beforeValue: update.beforeValue,
    });
    let records = 0;
    if (update.recordsRefresh) {
      records = await recordScopedRecordsRefresh(tx, {
        field: input.field,
        leagueId: input.leagueId,
        targetId: input.targetId,
        targetKind: input.targetKind,
        trigger: "data_curation_edit",
      });
    }
    return { ...update, editId, records };
  });

  let matchups = 0;
  if (applied.matchupIds.length > 0) {
    const recompute = await recomputeChangedMatchupStatistics(db, {
      leagueId: input.leagueId,
      matchupIds: applied.matchupIds,
    });
    matchups = recompute.weeklyStatistics;
  }

  return {
    afterValue: applied.afterValue,
    beforeValue: applied.beforeValue,
    editId: applied.editId,
    recompute: {
      matchups,
      records: applied.records,
    },
  };
}

function groupingConfigForSeason(
  season: number,
  descriptors: ReadonlyMap<number, SeasonDescriptor>,
): LeagueSeasonGroupingConfig {
  const descriptor = descriptors.get(season);
  return {
    format_type: descriptor?.formatType ?? "traditional",
    member_count_hint: descriptor?.memberCount ?? undefined,
    roster_format: descriptor?.rosterFormat ?? undefined,
    scoring_format: descriptor?.scoringFormat ?? undefined,
  };
}

interface SeasonDescriptor {
  formatType: string;
  memberCount: number;
  ownerFingerprint: string;
  rosterFormat: unknown;
  rosterFingerprint: string;
  scoringFormat: unknown;
  scoringFingerprint: string;
}

function descriptorChanges(
  previous: SeasonDescriptor,
  next: SeasonDescriptor,
): string[] {
  const changes: string[] = [];
  if (previous.memberCount !== next.memberCount) {
    changes.push("member_count_change");
  }
  if (previous.ownerFingerprint !== next.ownerFingerprint) {
    changes.push("member_set_change");
  }
  if (previous.rosterFingerprint !== next.rosterFingerprint) {
    changes.push("roster_change");
  }
  if (previous.scoringFingerprint !== next.scoringFingerprint) {
    changes.push("scoring_change");
  }
  if (previous.formatType !== next.formatType) {
    changes.push("format_change");
  }
  return changes;
}

function settingFormatType(scoringSettings: Record<string, unknown>): string {
  const value = scoringSettings.format_type ?? scoringSettings.formatType;
  return typeof value === "string" && value.trim() ? value : "traditional";
}

function settingRosterFormat(
  scoringSettings: Record<string, unknown>,
): unknown {
  for (const key of [
    "roster_format",
    "rosterFormat",
    "rosterSlots",
    "lineupSlots",
  ]) {
    const value = scoringSettings[key];
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

export function detectSeasonGroupingProposals(input: {
  descriptors: ReadonlyMap<number, SeasonDescriptor>;
  kind?: string;
}): SeasonGroupingProposal[] {
  const seasons = sortedUniqueNumbers(input.descriptors.keys());
  if (seasons.length <= 1) {
    return [];
  }

  const groups: { changes: string[]; seasons: number[] }[] = [
    { changes: [], seasons: [seasons[0] as number] },
  ];
  for (const season of seasons.slice(1)) {
    const previousSeason = seasons[seasons.indexOf(season) - 1] as number;
    const previous = input.descriptors.get(previousSeason);
    const current = input.descriptors.get(season);
    if (!previous || !current) {
      continue;
    }
    const changes = descriptorChanges(previous, current);
    if (changes.length > 0) {
      groups.push({ changes, seasons: [season] });
    } else {
      groups.at(-1)?.seasons.push(season);
    }
  }

  if (groups.length <= 1) {
    return [];
  }

  const kind = input.kind ?? "era";
  return groups.map((group, index) => ({
    config: groupingConfigForSeason(
      group.seasons[0] as number,
      input.descriptors,
    ),
    derivedFrom: {
      boundaryReasons: group.changes,
      firstSeason: group.seasons[0],
      lastSeason: group.seasons.at(-1),
    },
    kind,
    name: `${kind === "era" ? "Era" : "Grouping"} ${index + 1}`,
    ordinal: index + 1,
    seasons: group.seasons,
  }));
}

async function loadSeasonDescriptors(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<Map<number, SeasonDescriptor>> {
  const settingsRows = await tx
    .select({
      scoringSettings: leagueSeasonSettings.scoringSettings,
      season: leagueSeasonSettings.season,
    })
    .from(leagueSeasonSettings)
    .where(eq(leagueSeasonSettings.leagueId, leagueId))
    .orderBy(asc(leagueSeasonSettings.season));
  const teamRows = await tx
    .select({
      ownerMemberIds: teamSeasons.ownerMemberIds,
      ownerNames: teamSeasons.ownerNames,
      season: teamSeasons.season,
    })
    .from(teamSeasons)
    .where(eq(teamSeasons.leagueId, leagueId))
    .orderBy(asc(teamSeasons.season));
  const settingsBySeason = new Map(
    settingsRows.map((row) => [row.season, row.scoringSettings]),
  );
  const teamsBySeason = new Map<number, typeof teamRows>();
  for (const row of teamRows) {
    teamsBySeason.set(row.season, [
      ...(teamsBySeason.get(row.season) ?? []),
      row,
    ]);
  }

  const seasons = sortedUniqueNumbers([
    ...settingsRows.map((row) => row.season),
    ...teamRows.map((row) => row.season),
  ]);
  const descriptors = new Map<number, SeasonDescriptor>();
  for (const season of seasons) {
    const scoringSettings = settingsBySeason.get(season) ?? {};
    const teams = teamsBySeason.get(season) ?? [];
    const owners = teams.flatMap((team) =>
      team.ownerMemberIds.length > 0 ? team.ownerMemberIds : team.ownerNames,
    );
    const rosterFormat = settingRosterFormat(scoringSettings);
    const scoringFormat = {
      ...scoringSettings,
      lineupSlots: undefined,
      rosterFormat: undefined,
      rosterSlots: undefined,
      roster_format: undefined,
    };
    descriptors.set(season, {
      formatType: settingFormatType(scoringSettings),
      memberCount: teams.length,
      ownerFingerprint: [...new Set(owners)].sort(compareStable).join("\u001f"),
      rosterFormat,
      rosterFingerprint: stableJson(rosterFormat),
      scoringFormat,
      scoringFingerprint: stableJson(scoringFormat),
    });
  }
  return descriptors;
}

async function groupingWithSeasons(
  tx: LeagueScopedTx,
  leagueId: string,
  groupingIds?: readonly string[],
): Promise<PersistedSeasonGrouping[]> {
  const groupingRows = await tx
    .select()
    .from(leagueSeasonGroupings)
    .where(
      groupingIds && groupingIds.length > 0
        ? and(
            eq(leagueSeasonGroupings.leagueId, leagueId),
            inArray(leagueSeasonGroupings.id, groupingIds),
          )
        : eq(leagueSeasonGroupings.leagueId, leagueId),
    )
    .orderBy(
      asc(leagueSeasonGroupings.ordinal),
      asc(leagueSeasonGroupings.name),
    );
  if (groupingRows.length === 0) {
    return [];
  }
  const seasonRows = await tx
    .select()
    .from(leagueGroupingSeasons)
    .where(
      and(
        eq(leagueGroupingSeasons.leagueId, leagueId),
        inArray(
          leagueGroupingSeasons.groupingId,
          groupingRows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(leagueGroupingSeasons.season));
  return groupingRows.map((row) => ({
    config: row.config,
    confirmedByUserId: row.confirmedByUserId,
    derivedFrom: row.derivedFrom,
    id: row.id,
    kind: row.kind,
    name: row.name,
    ordinal: row.ordinal,
    seasons: seasonRows
      .filter((season) => season.groupingId === row.id)
      .map((season) => season.season),
    status: row.status,
  }));
}

async function validateConfirmedGroupingSeasons(
  tx: LeagueScopedTx,
  input: {
    groupingId: string;
    kind: string;
    leagueId: string;
    seasons: readonly number[];
  },
): Promise<void> {
  const descriptors = await loadSeasonDescriptors(tx, input.leagueId);
  const knownSeasons = new Set(descriptors.keys());
  const unknownSeasons = input.seasons.filter(
    (season) => !knownSeasons.has(season),
  );
  if (unknownSeasons.length > 0) {
    throw new Error(
      `season grouping includes unknown league season(s): ${unknownSeasons.join(", ")}`,
    );
  }

  if (input.seasons.length === 0) {
    return;
  }

  const confirmedGroupings = await tx
    .select({ id: leagueSeasonGroupings.id })
    .from(leagueSeasonGroupings)
    .where(
      and(
        eq(leagueSeasonGroupings.leagueId, input.leagueId),
        eq(leagueSeasonGroupings.kind, input.kind),
        eq(leagueSeasonGroupings.status, "confirmed"),
      ),
    );
  const otherGroupingIds = confirmedGroupings
    .map((row) => row.id)
    .filter((id) => id !== input.groupingId);
  if (otherGroupingIds.length === 0) {
    return;
  }

  const overlappingRows = await tx
    .select({ season: leagueGroupingSeasons.season })
    .from(leagueGroupingSeasons)
    .where(
      and(
        eq(leagueGroupingSeasons.leagueId, input.leagueId),
        inArray(leagueGroupingSeasons.groupingId, otherGroupingIds),
        inArray(leagueGroupingSeasons.season, input.seasons),
      ),
    )
    .orderBy(asc(leagueGroupingSeasons.season));
  const overlappingSeasons = sortedUniqueNumbers(
    overlappingRows.map((row) => row.season),
  );
  if (overlappingSeasons.length > 0) {
    throw new Error(
      `season grouping overlaps confirmed ${input.kind} season(s): ${overlappingSeasons.join(", ")}`,
    );
  }
}

export async function proposeLeagueSeasonGroupings(
  db: Db,
  input: { kind?: string; leagueId: string },
): Promise<PersistedSeasonGrouping[]> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const kind = input.kind ?? "era";
    const existing = await tx
      .select({ id: leagueSeasonGroupings.id })
      .from(leagueSeasonGroupings)
      .where(
        and(
          eq(leagueSeasonGroupings.leagueId, input.leagueId),
          eq(leagueSeasonGroupings.kind, kind),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return groupingWithSeasons(tx, input.leagueId);
    }

    const descriptors = await loadSeasonDescriptors(tx, input.leagueId);
    const proposals = detectSeasonGroupingProposals({ descriptors, kind });
    const groupingIds: string[] = [];
    for (const proposal of proposals) {
      const [grouping] = await tx
        .insert(leagueSeasonGroupings)
        .values({
          config: proposal.config,
          derivedFrom: proposal.derivedFrom,
          kind: proposal.kind,
          leagueId: input.leagueId,
          name: proposal.name,
          ordinal: proposal.ordinal,
          status: "proposed",
        })
        .returning({ id: leagueSeasonGroupings.id });
      if (!grouping) {
        throw new Error("season grouping proposal was not created");
      }
      groupingIds.push(grouping.id);
      if (proposal.seasons.length > 0) {
        await tx.insert(leagueGroupingSeasons).values(
          proposal.seasons.map((season) => ({
            groupingId: grouping.id,
            leagueId: input.leagueId,
            season,
          })),
        );
      }
    }
    return groupingWithSeasons(tx, input.leagueId, groupingIds);
  });
}

export async function listLeagueSeasonGroupings(
  db: Db,
  input: { leagueId: string },
): Promise<PersistedSeasonGrouping[]> {
  return withLeagueContext(db, input.leagueId, (tx) =>
    groupingWithSeasons(tx, input.leagueId),
  );
}

export async function confirmLeagueSeasonGrouping(
  db: Db,
  input: {
    actorUserId: string;
    config?: LeagueSeasonGroupingConfig;
    groupingId: string;
    leagueId: string;
    name?: string;
    reason?: string;
    seasons: readonly number[];
  },
): Promise<PersistedSeasonGrouping> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [before] = await groupingWithSeasons(tx, input.leagueId, [
      input.groupingId,
    ]);
    if (!before) {
      throw new Error("season grouping was not found");
    }
    const seasons = sortedUniqueNumbers(input.seasons);
    await validateConfirmedGroupingSeasons(tx, {
      groupingId: input.groupingId,
      kind: before.kind,
      leagueId: input.leagueId,
      seasons,
    });
    await tx
      .update(leagueSeasonGroupings)
      .set({
        config: input.config ?? before.config,
        confirmedByUserId: input.actorUserId,
        name: input.name?.trim() || before.name,
        status: "confirmed",
      })
      .where(
        and(
          eq(leagueSeasonGroupings.leagueId, input.leagueId),
          eq(leagueSeasonGroupings.id, input.groupingId),
        ),
      );
    await tx
      .delete(leagueGroupingSeasons)
      .where(
        and(
          eq(leagueGroupingSeasons.leagueId, input.leagueId),
          eq(leagueGroupingSeasons.groupingId, input.groupingId),
        ),
      );
    if (seasons.length > 0) {
      await tx.insert(leagueGroupingSeasons).values(
        seasons.map((season) => ({
          groupingId: input.groupingId,
          leagueId: input.leagueId,
          season,
        })),
      );
    }
    const [after] = await groupingWithSeasons(tx, input.leagueId, [
      input.groupingId,
    ]);
    if (!after) {
      throw new Error("confirmed season grouping was not found");
    }
    await tx.insert(leagueDataEdits).values({
      actorUserId: input.actorUserId,
      afterValue: {
        config: after.config,
        seasons: after.seasons,
        status: after.status,
      },
      beforeValue: {
        config: before.config,
        seasons: before.seasons,
        status: before.status,
      },
      editClass: "substantive",
      field: "grouping_confirmation",
      leagueId: input.leagueId,
      reason: input.reason ?? "commissioner confirmed season grouping",
      targetId: input.groupingId,
      targetKind: "grouping",
    });
    await recordScopedRecordsRefresh(tx, {
      field: "grouping_confirmation",
      leagueId: input.leagueId,
      targetId: input.groupingId,
      targetKind: "grouping",
      trigger: "season_grouping_confirmed",
    });
    return after;
  });
}

export async function listUnifiedDataLedger(
  db: Db,
  input: {
    leagueId: string;
    limit?: number;
    targetId?: string;
    targetKind?: UnifiedLedgerTargetKind;
  },
): Promise<UnifiedLedgerEntry[]> {
  const limit = Math.max(1, Math.min(200, input.limit ?? 100));
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const dataEditTargetKind =
      input.targetKind && input.targetKind !== "integrity_check"
        ? input.targetKind
        : undefined;
    const dataRows =
      input.targetKind === "integrity_check"
        ? []
        : await tx
            .select()
            .from(leagueDataEdits)
            .where(
              and(
                eq(leagueDataEdits.leagueId, input.leagueId),
                dataEditTargetKind
                  ? eq(leagueDataEdits.targetKind, dataEditTargetKind)
                  : undefined,
                input.targetId
                  ? eq(leagueDataEdits.targetId, input.targetId)
                  : undefined,
              ),
            )
            .orderBy(desc(leagueDataEdits.createdAt))
            .limit(limit);

    const identityRows =
      input.targetKind && !["person", "team_season"].includes(input.targetKind)
        ? []
        : await tx
            .select()
            .from(identityAuditLog)
            .where(
              and(
                eq(identityAuditLog.leagueId, input.leagueId),
                input.targetKind === "person" && input.targetId
                  ? eq(identityAuditLog.personId, input.targetId)
                  : undefined,
                input.targetKind === "team_season" && input.targetId
                  ? eq(identityAuditLog.teamSeasonId, input.targetId)
                  : undefined,
                !input.targetKind && input.targetId
                  ? or(
                      eq(identityAuditLog.personId, input.targetId),
                      eq(identityAuditLog.teamSeasonId, input.targetId),
                    )
                  : undefined,
              ),
            )
            .orderBy(desc(identityAuditLog.createdAt))
            .limit(limit);

    const correctionRows =
      input.targetKind && input.targetKind !== "integrity_check"
        ? []
        : await tx
            .select()
            .from(dataCorrectionAuditLog)
            .where(
              and(
                eq(dataCorrectionAuditLog.leagueId, input.leagueId),
                input.targetId
                  ? eq(dataCorrectionAuditLog.integrityCheckId, input.targetId)
                  : undefined,
              ),
            )
            .orderBy(desc(dataCorrectionAuditLog.createdAt))
            .limit(limit);

    return [
      ...dataRows.map((row) => ({
        actorUserId: row.actorUserId,
        afterValue: row.afterValue,
        beforeValue: row.beforeValue,
        createdAt: row.createdAt.toISOString(),
        editClass: row.editClass,
        field: row.field,
        id: row.id,
        reason: row.reason,
        source: "league_data_edit" as const,
        targetId: row.targetId,
        targetKind: row.targetKind,
      })),
      ...identityRows.map((row) => ({
        actorUserId: row.actorUserId,
        afterValue: row.afterState,
        beforeValue: row.beforeState,
        createdAt: row.createdAt.toISOString(),
        editClass: "audit" as const,
        field: row.action,
        id: row.id,
        reason: row.reason,
        source: "identity_audit" as const,
        targetId: row.personId ?? row.teamSeasonId,
        targetKind: row.personId ? "person" : "team_season",
      })),
      ...correctionRows.map((row) => ({
        actorUserId: row.actorUserId,
        afterValue: row.afterState,
        beforeValue: row.beforeState,
        createdAt: row.createdAt.toISOString(),
        editClass: "audit" as const,
        field: row.action,
        id: row.id,
        reason: row.reason,
        source: "data_correction_audit" as const,
        targetId: row.integrityCheckId,
        targetKind: "integrity_check",
      })),
    ]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  });
}

export function groupingConfigIsEquivalent(
  left: LeagueSeasonGroupingConfig,
  right: LeagueSeasonGroupingConfig,
): boolean {
  return stableJson(left) === stableJson(right);
}
