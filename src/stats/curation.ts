import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  identityAuditLog,
  identityMappings,
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
import {
  recomputeChangedMatchupStatistics,
  recomputeLeagueStatistics,
} from "./engine";
import { refreshRecordBookAggregates } from "./records-catalog";

type LeagueDataEditInsert = typeof leagueDataEdits.$inferInsert;
export type LeagueDataEditTargetKind = LeagueDataEditInsert["targetKind"];
export type LeagueDataEditClass = LeagueDataEditInsert["editClass"];
export type CuratedEditScope = "all_years" | "this_year_only";
export type CuratedEditScopeInput = CuratedEditScope | "smart";
export type UnifiedLedgerTargetKind =
  | LeagueDataEditTargetKind
  | "integrity_check";

export interface ApplyLeagueDataEditInput {
  actorUserId: string;
  editClass: LeagueDataEditClass;
  field: string;
  leagueId: string;
  reason?: string;
  scope?: CuratedEditScope;
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

export interface ApplyCuratedDataEditInput
  extends Omit<ApplyLeagueDataEditInput, "scope"> {
  scope?: CuratedEditScopeInput;
  season?: number;
}

export interface ApplyCuratedDataEditResult extends ApplyLeagueDataEditResult {
  affectedTargetIds: string[];
  editIds: string[];
  scope: CuratedEditScope;
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
  scope: CuratedEditScope | null;
  targetId: string | null;
  targetKind: string;
}

export interface UnifiedLedgerPage {
  entries: UnifiedLedgerEntry[];
  hasMore: boolean;
  limit: number;
  offset: number;
  total: number;
}

export interface SeasonGroupingProposal {
  config: LeagueSeasonGroupingConfig;
  derivedFrom: Record<string, unknown>;
  kind: string;
  name: string;
  ordinal: number;
  rationale: string;
  seasons: number[];
}

export type SeasonGroupingStatus = "proposed" | "confirmed" | "dismissed";

export interface PersistedSeasonGrouping extends SeasonGroupingProposal {
  confirmedByUserId: string | null;
  id: string;
  status: SeasonGroupingStatus;
}

export interface SeasonGroupingSettingsDescriptor {
  leagueSize?: number | null;
  lineupSlotCounts?: Record<string, number> | null;
  matchupPeriodCount?: number | null;
  playoffMatchupPeriodLength?: number | null;
  playoffTeamCount?: number | null;
  regularSeasonEndScoringPeriod?: number | null;
  scoringSettings?: Record<string, unknown> | null;
  scoringType?: string | null;
  season: number;
  teamCount?: number | null;
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

function winnerFromScores(homeScore: number, awayScore: number) {
  if (homeScore > awayScore) {
    return "home" as const;
  }
  if (awayScore > homeScore) {
    return "away" as const;
  }
  return "tie" as const;
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

function optionalPositiveInteger(value: unknown, field: string): number | null {
  const integer = optionalInteger(value, field);
  if (integer !== null && integer < 1) {
    throw new Error(`${field} must be a positive integer or null`);
  }
  return integer;
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
      scope: input.scope ?? null,
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
  ledgerTarget?: Pick<
    ApplyLeagueDataEditInput,
    "field" | "targetId" | "targetKind"
  >;
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
      const afterValue = optionalPositiveInteger(input.value, input.field);
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
    const [backingMatchup] = await tx
      .select()
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.leagueId, input.leagueId),
          eq(fantasyMatchups.id, row.matchupId),
        ),
      )
      .limit(1);
    const [teamSeason] = await tx
      .select({ providerTeamId: teamSeasons.providerTeamId })
      .from(teamSeasons)
      .where(
        and(
          eq(teamSeasons.leagueId, input.leagueId),
          eq(teamSeasons.id, row.teamSeasonId),
        ),
      )
      .limit(1);
    const side =
      backingMatchup &&
      teamSeason?.providerTeamId === backingMatchup.homeTeamProviderId
        ? "home"
        : backingMatchup &&
            teamSeason?.providerTeamId === backingMatchup.awayTeamProviderId
          ? "away"
          : null;
    if (input.field === "points_for") {
      const afterValue = requireNumber(input.value, input.field);
      if (backingMatchup && side) {
        const homeScore =
          side === "home" ? afterValue : backingMatchup.homeScore;
        const awayScore =
          side === "away" ? afterValue : backingMatchup.awayScore;
        await tx
          .update(fantasyMatchups)
          .set({
            awayScore,
            homeScore,
            updatedAt: new Date(),
            winner: winnerFromScores(homeScore, awayScore),
          })
          .where(eq(fantasyMatchups.id, backingMatchup.id));
        return {
          afterValue,
          beforeValue: row.pointsFor,
          ledgerTarget: {
            field: side === "home" ? "home_score" : "away_score",
            targetId: backingMatchup.id,
            targetKind: "matchup",
          },
          matchupIds: [backingMatchup.id],
          recordsRefresh: false,
        };
      }
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
      if (backingMatchup && side) {
        const homeScore =
          side === "away" ? afterValue : backingMatchup.homeScore;
        const awayScore =
          side === "home" ? afterValue : backingMatchup.awayScore;
        await tx
          .update(fantasyMatchups)
          .set({
            awayScore,
            homeScore,
            updatedAt: new Date(),
            winner: winnerFromScores(homeScore, awayScore),
          })
          .where(eq(fantasyMatchups.id, backingMatchup.id));
        return {
          afterValue,
          beforeValue: row.pointsAgainst,
          ledgerTarget: {
            field: side === "home" ? "away_score" : "home_score",
            targetId: backingMatchup.id,
            targetKind: "matchup",
          },
          matchupIds: [backingMatchup.id],
          recordsRefresh: false,
        };
      }
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
      if (backingMatchup) {
        await tx
          .update(fantasyMatchups)
          .set({ scoringPeriodSpan: afterValue, updatedAt: new Date() })
          .where(eq(fantasyMatchups.id, backingMatchup.id));
        return {
          afterValue,
          beforeValue: row.scoringPeriodSpan,
          ledgerTarget: {
            field: "scoring_period_span",
            targetId: backingMatchup.id,
            targetKind: "matchup",
          },
          matchupIds: [backingMatchup.id],
          recordsRefresh: false,
        };
      }
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
      const afterValue = optionalPositiveInteger(input.value, input.field);
      if (backingMatchup) {
        await tx
          .update(fantasyMatchups)
          .set({ periodStart: afterValue, updatedAt: new Date() })
          .where(eq(fantasyMatchups.id, backingMatchup.id));
        return {
          afterValue,
          beforeValue: row.periodStart,
          ledgerTarget: {
            field: "period_start",
            targetId: backingMatchup.id,
            targetKind: "matchup",
          },
          matchupIds: [backingMatchup.id],
          recordsRefresh: false,
        };
      }
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
      const afterValue = optionalPositiveInteger(input.value, input.field);
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
    const ledgerTarget = update.ledgerTarget ?? {
      field: input.field,
      targetId: input.targetId,
      targetKind: input.targetKind,
    };
    const editId = await writeDataEdit(tx, {
      ...input,
      afterValue: update.afterValue,
      beforeValue: update.beforeValue,
      field: ledgerTarget.field,
      targetId: ledgerTarget.targetId,
      targetKind: ledgerTarget.targetKind,
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

function resolveCuratedEditScope(input: ApplyCuratedDataEditInput) {
  if (input.scope && input.scope !== "smart") {
    return input.scope;
  }
  if (input.targetKind === "person" && input.field === "canonical_name") {
    return "all_years" as const;
  }
  if (input.targetKind === "team_season" && input.field === "team_name") {
    return "this_year_only" as const;
  }
  return "this_year_only" as const;
}

function requireScopeSeason(input: ApplyCuratedDataEditInput): number {
  if (!Number.isInteger(input.season)) {
    throw new Error("season is required for this-year-only dimension edits");
  }
  return Number(input.season);
}

async function applyPersonNameForOneSeason(
  db: Db,
  input: ApplyCuratedDataEditInput,
): Promise<ApplyCuratedDataEditResult> {
  const season = requireScopeSeason(input);
  const afterName = requireString(input.value, input.field);
  const applied = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [person] = await tx
      .select()
      .from(persons)
      .where(
        and(
          eq(persons.leagueId, input.leagueId),
          eq(persons.id, input.targetId),
        ),
      )
      .limit(1);
    if (!person) {
      throw new Error("person was not found");
    }

    const mappedRows = await tx
      .select()
      .from(identityMappings)
      .where(
        and(
          eq(identityMappings.leagueId, input.leagueId),
          eq(identityMappings.personId, input.targetId),
        ),
      );
    const targetSeasonMappings = mappedRows.filter(
      (mapping) => mapping.season === season,
    );
    if (targetSeasonMappings.length === 0) {
      throw new Error(`person has no mapped team-season for ${season}`);
    }

    const otherSeasonMappings = mappedRows.filter(
      (mapping) => mapping.season !== season,
    );
    if (otherSeasonMappings.length === 0) {
      await tx
        .update(persons)
        .set({ canonicalName: afterName, updatedAt: new Date() })
        .where(eq(persons.id, person.id));
      const editId = await writeDataEdit(tx, {
        ...input,
        afterValue: afterName,
        beforeValue: person.canonicalName,
        scope: "this_year_only",
      });
      const records = await recordScopedRecordsRefresh(tx, {
        field: input.field,
        leagueId: input.leagueId,
        targetId: input.targetId,
        targetKind: input.targetKind,
        trigger: "curated_scoped_person_name",
      });
      return {
        afterValue: afterName,
        beforeValue: person.canonicalName,
        editIds: [editId],
        newPersonId: person.id,
        records,
        targetTeamSeasonIds: targetSeasonMappings.map(
          (mapping) => mapping.teamSeasonId,
        ),
      };
    }

    const [scopedPerson] = await tx
      .insert(persons)
      .values({
        canonicalName: afterName,
        leagueId: input.leagueId,
        ownerHistory: person.ownerHistory,
      })
      .returning({ id: persons.id });
    if (!scopedPerson) {
      throw new Error("scoped person was not created");
    }

    await tx
      .update(identityMappings)
      .set({
        confidence: 1,
        method: "manual",
        personId: scopedPerson.id,
        resolvedBy: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(
        inArray(
          identityMappings.id,
          targetSeasonMappings.map((mapping) => mapping.id),
        ),
      );

    await tx.insert(identityAuditLog).values(
      targetSeasonMappings.map((mapping) => ({
        action: "remap" as const,
        actorUserId: input.actorUserId,
        afterState: {
          canonicalName: afterName,
          personId: scopedPerson.id,
          scope: "this_year_only",
          season,
          teamSeasonId: mapping.teamSeasonId,
        },
        beforeState: {
          canonicalName: person.canonicalName,
          personId: person.id,
          season,
          teamSeasonId: mapping.teamSeasonId,
        },
        leagueId: input.leagueId,
        personId: scopedPerson.id,
        reason:
          input.reason ??
          "this-year-only real-name edit split a season mapping",
        teamSeasonId: mapping.teamSeasonId,
      })),
    );

    const beforeValue = {
      canonicalName: person.canonicalName,
      personId: person.id,
      season,
      teamSeasonIds: targetSeasonMappings.map(
        (mapping) => mapping.teamSeasonId,
      ),
    };
    const afterValue = {
      canonicalName: afterName,
      personId: scopedPerson.id,
      season,
      teamSeasonIds: targetSeasonMappings.map(
        (mapping) => mapping.teamSeasonId,
      ),
    };
    const editId = await writeDataEdit(tx, {
      ...input,
      afterValue,
      beforeValue,
      scope: "this_year_only",
      targetId: scopedPerson.id,
    });
    return {
      afterValue,
      beforeValue,
      editIds: [editId],
      newPersonId: scopedPerson.id,
      records: 0,
      targetTeamSeasonIds: targetSeasonMappings.map(
        (mapping) => mapping.teamSeasonId,
      ),
    };
  });

  const recompute = await recomputeLeagueStatistics(db, {
    leagueId: input.leagueId,
  });

  return {
    afterValue: applied.afterValue,
    affectedTargetIds: [applied.newPersonId, ...applied.targetTeamSeasonIds],
    beforeValue: applied.beforeValue,
    editId: applied.editIds[0] as string,
    editIds: applied.editIds,
    recompute: {
      matchups: recompute.weeklyStatistics,
      records:
        applied.records + recompute.records + recompute.recordBookAggregates,
    },
    scope: "this_year_only",
  };
}

async function applyTeamNameForAllYears(
  db: Db,
  input: ApplyCuratedDataEditInput,
): Promise<ApplyCuratedDataEditResult> {
  const afterName = requireString(input.value, input.field);
  const applied = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [targetTeam] = await tx
      .select()
      .from(teamSeasons)
      .where(
        and(
          eq(teamSeasons.leagueId, input.leagueId),
          eq(teamSeasons.id, input.targetId),
        ),
      )
      .limit(1);
    if (!targetTeam) {
      throw new Error("team-season was not found");
    }

    const [targetMapping] = await tx
      .select()
      .from(identityMappings)
      .where(
        and(
          eq(identityMappings.leagueId, input.leagueId),
          eq(identityMappings.teamSeasonId, targetTeam.id),
        ),
      )
      .limit(1);

    let affectedRows = [targetTeam];
    if (targetMapping) {
      const personMappings = await tx
        .select({ teamSeasonId: identityMappings.teamSeasonId })
        .from(identityMappings)
        .where(
          and(
            eq(identityMappings.leagueId, input.leagueId),
            eq(identityMappings.personId, targetMapping.personId),
          ),
        );
      const mappedTeamSeasonIds = personMappings.map(
        (mapping) => mapping.teamSeasonId,
      );
      if (mappedTeamSeasonIds.length > 0) {
        affectedRows = await tx
          .select()
          .from(teamSeasons)
          .where(
            and(
              eq(teamSeasons.leagueId, input.leagueId),
              inArray(teamSeasons.id, mappedTeamSeasonIds),
            ),
          )
          .orderBy(asc(teamSeasons.season), asc(teamSeasons.id));
      }
    }

    const editIds: string[] = [];
    for (const row of affectedRows) {
      await tx
        .update(teamSeasons)
        .set({ teamName: afterName, updatedAt: new Date() })
        .where(eq(teamSeasons.id, row.id));
      const editId = await writeDataEdit(tx, {
        ...input,
        afterValue: afterName,
        beforeValue: row.teamName,
        scope: "all_years",
        targetId: row.id,
        targetKind: "team_season",
      });
      editIds.push(editId);
    }

    const records = await recordScopedRecordsRefresh(tx, {
      field: input.field,
      leagueId: input.leagueId,
      targetId: input.targetId,
      targetKind: "team_season",
      trigger: "curated_scoped_team_name",
    });

    return {
      afterValue: afterName,
      beforeValue:
        affectedRows.length === 1
          ? affectedRows[0]?.teamName
          : affectedRows.map((row) => ({
              targetId: row.id,
              teamName: row.teamName,
            })),
      editIds,
      records,
      targetIds: affectedRows.map((row) => row.id),
    };
  });

  return {
    afterValue: applied.afterValue,
    affectedTargetIds: applied.targetIds,
    beforeValue: applied.beforeValue,
    editId: applied.editIds[0] as string,
    editIds: applied.editIds,
    recompute: {
      matchups: 0,
      records: applied.records,
    },
    scope: "all_years",
  };
}

export async function applyCuratedDataEdit(
  db: Db,
  input: ApplyCuratedDataEditInput,
): Promise<ApplyCuratedDataEditResult> {
  const scope = resolveCuratedEditScope(input);
  if (
    input.targetKind === "person" &&
    input.field === "canonical_name" &&
    scope === "this_year_only"
  ) {
    return applyPersonNameForOneSeason(db, input);
  }
  if (
    input.targetKind === "team_season" &&
    input.field === "team_name" &&
    scope === "all_years"
  ) {
    return applyTeamNameForAllYears(db, input);
  }

  const edit = await applyLeagueDataEdit(db, {
    ...input,
    scope,
  });
  return {
    ...edit,
    affectedTargetIds: [input.targetId],
    editIds: [edit.editId],
    scope,
  };
}

interface EraFormatSignature {
  leagueSize: number | null;
  lineupFingerprint: string;
  lineupMode: "flex" | "hybrid" | "op" | "standard";
  lineupSlotCounts: Record<string, number>;
  playoffMatchupPeriodLength: number | null;
  playoffTeamCount: number | null;
  regularSeasonWeeks: number | null;
  scoringType: string;
}

interface EraDescriptor extends SeasonGroupingSettingsDescriptor {
  signature: EraFormatSignature;
}

type EraBoundaryReason =
  | "team_count_change"
  | "playoff_matchup_length_change"
  | "playoff_team_count_change"
  | "regular_season_week_count_change"
  | "roster_lineup_slot_counts_change";

const BOUNDARY_REASON_LABELS: Record<EraBoundaryReason, string> = {
  playoff_matchup_length_change: "playoff matchup length",
  playoff_team_count_change: "playoff team count",
  regular_season_week_count_change: "regular-season week count",
  roster_lineup_slot_counts_change: "lineup slot counts",
  team_count_change: "team count",
};

const OP_LINEUP_SLOTS = ["7", "24"] as const;
const FLEX_LINEUP_SLOT = "23";

function positiveIntegerOrNull(
  value: number | null | undefined,
): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function normalizeLineupSlotCounts(
  value: Record<string, number> | null | undefined,
): Record<string, number> {
  const entries = Object.entries(value ?? {})
    .map(([slot, count]) => [slot, Number(count)] as const)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([left], [right]) => compareStable(left, right));
  return Object.fromEntries(entries);
}

function lineupSlotCount(
  counts: Readonly<Record<string, number>>,
  slots: readonly string[],
): number {
  return slots.reduce((sum, slot) => sum + (counts[slot] ?? 0), 0);
}

function lineupMode(
  counts: Readonly<Record<string, number>>,
): EraFormatSignature["lineupMode"] {
  const opCount = lineupSlotCount(counts, OP_LINEUP_SLOTS);
  const flexCount = lineupSlotCount(counts, [FLEX_LINEUP_SLOT]);
  if (opCount > 0 && flexCount > 0) {
    return "hybrid";
  }
  if (opCount > 0) {
    return "op";
  }
  if (flexCount > 0) {
    return "flex";
  }
  return "standard";
}

function regularSeasonWeeksFor(
  descriptor: SeasonGroupingSettingsDescriptor,
): number | null {
  return (
    positiveIntegerOrNull(descriptor.regularSeasonEndScoringPeriod) ??
    positiveIntegerOrNull(descriptor.matchupPeriodCount)
  );
}

function signatureForDescriptor(
  descriptor: SeasonGroupingSettingsDescriptor,
): EraFormatSignature {
  const lineupSlotCounts = normalizeLineupSlotCounts(
    descriptor.lineupSlotCounts,
  );
  return {
    leagueSize:
      positiveIntegerOrNull(descriptor.leagueSize) ??
      positiveIntegerOrNull(descriptor.teamCount),
    lineupFingerprint: stableJson(lineupSlotCounts),
    lineupMode: lineupMode(lineupSlotCounts),
    lineupSlotCounts,
    playoffMatchupPeriodLength: positiveIntegerOrNull(
      descriptor.playoffMatchupPeriodLength,
    ),
    playoffTeamCount: positiveIntegerOrNull(descriptor.playoffTeamCount),
    regularSeasonWeeks: regularSeasonWeeksFor(descriptor),
    scoringType: descriptor.scoringType?.trim() || "H2H_POINTS",
  };
}

function eraDescriptors(
  descriptors: Iterable<SeasonGroupingSettingsDescriptor>,
): Map<number, EraDescriptor> {
  const bySeason = new Map<number, SeasonGroupingSettingsDescriptor>();
  for (const descriptor of descriptors) {
    if (!Number.isInteger(descriptor.season)) {
      continue;
    }
    bySeason.set(descriptor.season, descriptor);
  }
  return new Map(
    [...bySeason.values()]
      .sort((left, right) => left.season - right.season)
      .map((descriptor) => [
        descriptor.season,
        { ...descriptor, signature: signatureForDescriptor(descriptor) },
      ]),
  );
}

function formatMaybeInteger(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function playoffLengthLabel(value: number | null): string {
  if (value === null) {
    return "unknown playoff length";
  }
  return value === 1 ? "1-week playoffs" : `${value}-week playoffs`;
}

function lineupModeLabel(mode: EraFormatSignature["lineupMode"]): string {
  switch (mode) {
    case "flex":
      return "FLEX lineup";
    case "hybrid":
      return "OP/FLEX hybrid lineup";
    case "op":
      return "OP lineup";
    case "standard":
      return "standard lineup";
  }
}

function signatureSummary(signature: EraFormatSignature): string {
  return [
    `${formatMaybeInteger(signature.leagueSize)} teams`,
    playoffLengthLabel(signature.playoffMatchupPeriodLength),
    `${formatMaybeInteger(signature.playoffTeamCount)} playoff teams`,
    `${formatMaybeInteger(signature.regularSeasonWeeks)} regular-season weeks`,
    lineupModeLabel(signature.lineupMode),
  ].join(", ");
}

function valueLabel(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function formatValuesDiffer<T>(previous: T, next: T): boolean {
  return !Object.is(previous, next);
}

function formatValuesMatch<T>(previous: T, next: T): boolean {
  return Object.is(previous, next);
}

function descriptorChanges(
  previous: EraDescriptor,
  next: EraDescriptor,
): EraBoundaryReason[] {
  const changes: EraBoundaryReason[] = [];
  // Raw point-value scoring settings can drift often; auto-eras only split on
  // durable league structure so one-point scoring tweaks do not over-segment.
  if (
    formatValuesDiffer(previous.signature.leagueSize, next.signature.leagueSize)
  ) {
    changes.push("team_count_change");
  }
  if (
    formatValuesDiffer(
      previous.signature.playoffMatchupPeriodLength,
      next.signature.playoffMatchupPeriodLength,
    )
  ) {
    changes.push("playoff_matchup_length_change");
  }
  if (
    formatValuesDiffer(
      previous.signature.playoffTeamCount,
      next.signature.playoffTeamCount,
    )
  ) {
    changes.push("playoff_team_count_change");
  }
  if (
    formatValuesDiffer(
      previous.signature.regularSeasonWeeks,
      next.signature.regularSeasonWeeks,
    )
  ) {
    changes.push("regular_season_week_count_change");
  }
  if (
    formatValuesDiffer(
      previous.signature.lineupFingerprint,
      next.signature.lineupFingerprint,
    )
  ) {
    changes.push("roster_lineup_slot_counts_change");
  }
  return changes;
}

function reasonChangeDetail(
  reason: EraBoundaryReason,
  previous: EraDescriptor,
  next: EraDescriptor,
): string {
  switch (reason) {
    case "team_count_change":
      return `team count changed ${valueLabel(previous.signature.leagueSize)} -> ${valueLabel(next.signature.leagueSize)}`;
    case "playoff_matchup_length_change":
      return `playoff matchup length changed ${valueLabel(previous.signature.playoffMatchupPeriodLength)} -> ${valueLabel(next.signature.playoffMatchupPeriodLength)} week(s)`;
    case "playoff_team_count_change":
      return `playoff field changed ${valueLabel(previous.signature.playoffTeamCount)} -> ${valueLabel(next.signature.playoffTeamCount)} teams`;
    case "regular_season_week_count_change":
      return `regular season changed ${valueLabel(previous.signature.regularSeasonWeeks)} -> ${valueLabel(next.signature.regularSeasonWeeks)} weeks`;
    case "roster_lineup_slot_counts_change":
      if (
        formatValuesMatch(
          previous.signature.lineupMode,
          next.signature.lineupMode,
        )
      ) {
        return `lineup slot counts changed within ${lineupModeLabel(next.signature.lineupMode)}`;
      }
      return `lineup slots changed from ${lineupModeLabel(previous.signature.lineupMode)} to ${lineupModeLabel(next.signature.lineupMode)}`;
  }
}

function seasonRangeLabel(
  seasons: readonly number[],
  allSeasons: readonly number[],
): string {
  const first = seasons[0] ?? 0;
  const last = seasons.at(-1) ?? first;
  if (first === last) {
    return String(first);
  }
  return last === allSeasons.at(-1) ? `${first}-present` : `${first}-${last}`;
}

function proposalName(input: {
  allSeasons: readonly number[];
  changes: readonly EraBoundaryReason[];
  descriptor: EraDescriptor;
  seasons: readonly number[];
}): string {
  const signature = input.descriptor.signature;
  const range = seasonRangeLabel(input.seasons, input.allSeasons);
  if (input.changes.includes("team_count_change") && signature.leagueSize) {
    return `${signature.leagueSize}-team era (${range})`;
  }
  if (
    input.changes.includes("playoff_matchup_length_change") &&
    signature.playoffMatchupPeriodLength
  ) {
    return `${signature.playoffMatchupPeriodLength}-week playoffs (${range})`;
  }
  if (input.changes.includes("roster_lineup_slot_counts_change")) {
    return `${lineupModeLabel(signature.lineupMode)} era (${range})`;
  }
  if (
    input.changes.includes("regular_season_week_count_change") &&
    signature.regularSeasonWeeks
  ) {
    return `${signature.regularSeasonWeeks}-week regular season (${range})`;
  }
  if (
    input.changes.includes("playoff_team_count_change") &&
    signature.playoffTeamCount
  ) {
    return `${signature.playoffTeamCount}-team playoff field (${range})`;
  }
  if (
    signature.playoffMatchupPeriodLength &&
    signature.playoffMatchupPeriodLength > 1
  ) {
    return `${signature.playoffMatchupPeriodLength}-week playoffs (${range})`;
  }
  if (signature.leagueSize) {
    return `${signature.leagueSize}-team era (${range})`;
  }
  return `Era ${range}`;
}

function proposalRationale(input: {
  changes: readonly EraBoundaryReason[];
  current: EraDescriptor;
  previous: EraDescriptor | null;
  seasons: readonly number[];
}): string {
  const range =
    input.seasons.length === 1
      ? `${input.seasons[0]} shares`
      : `${input.seasons[0]}-${input.seasons.at(-1)} share`;
  const summary = signatureSummary(input.current.signature);
  if (!input.previous || input.changes.length === 0) {
    return `${range} ${summary}.`;
  }
  const changeText = input.changes
    .map((reason) =>
      reasonChangeDetail(
        reason,
        input.previous as EraDescriptor,
        input.current,
      ),
    )
    .join("; ");
  return `Boundary starts at ${input.current.season}: ${changeText}. ${range} ${summary}.`;
}

function groupingConfigForDescriptor(
  descriptor: EraDescriptor,
  rationale: string,
): LeagueSeasonGroupingConfig {
  return {
    format_type: "traditional",
    member_count_hint: descriptor.signature.leagueSize ?? undefined,
    notes: rationale,
    roster_format: {
      lineup_mode: descriptor.signature.lineupMode,
      lineup_slot_counts: descriptor.signature.lineupSlotCounts,
    },
    scoring_format: {
      playoff_matchup_period_length:
        descriptor.signature.playoffMatchupPeriodLength,
      playoff_team_count: descriptor.signature.playoffTeamCount,
      regular_season_weeks: descriptor.signature.regularSeasonWeeks,
      scoring_type: descriptor.signature.scoringType,
    },
  };
}

export function detectSeasonGroupingProposals(input: {
  descriptors: Iterable<SeasonGroupingSettingsDescriptor>;
  kind?: string;
}): SeasonGroupingProposal[] {
  const descriptorMap = eraDescriptors(input.descriptors);
  const seasons = sortedUniqueNumbers(descriptorMap.keys());
  if (seasons.length <= 1) {
    return [];
  }

  const groups: Array<{
    changes: EraBoundaryReason[];
    previous: EraDescriptor | null;
    seasons: number[];
  }> = [{ changes: [], previous: null, seasons: [seasons[0] as number] }];

  for (let index = 1; index < seasons.length; index += 1) {
    const season = seasons[index] as number;
    const previousSeason = seasons[index - 1] as number;
    const previous = descriptorMap.get(previousSeason);
    const current = descriptorMap.get(season);
    if (!previous || !current) {
      continue;
    }
    const changes = descriptorChanges(previous, current);
    if (changes.length > 0) {
      groups.push({ changes, previous, seasons: [season] });
    } else {
      groups.at(-1)?.seasons.push(season);
    }
  }

  if (groups.length <= 1) {
    return [];
  }

  const kind = input.kind ?? "era";
  return groups.map((group, index) => {
    const firstSeason = group.seasons[0] as number;
    const descriptor = descriptorMap.get(firstSeason);
    if (!descriptor) {
      throw new Error(`season descriptor was not found for ${firstSeason}`);
    }
    const rationale = proposalRationale({
      changes: group.changes,
      current: descriptor,
      previous: group.previous,
      seasons: group.seasons,
    });
    return {
      config: groupingConfigForDescriptor(descriptor, rationale),
      derivedFrom: {
        boundaryReasons: group.changes,
        boundaryReasonLabels: group.changes.map(
          (reason) => BOUNDARY_REASON_LABELS[reason],
        ),
        firstSeason,
        lastSeason: group.seasons.at(-1),
        rationale,
        signature: descriptor.signature,
        source: "league_season_settings",
      },
      kind,
      name: proposalName({
        allSeasons: seasons,
        changes: group.changes,
        descriptor,
        seasons: group.seasons,
      }),
      ordinal: index + 1,
      rationale,
      seasons: group.seasons,
    };
  });
}

async function loadSeasonDescriptors(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<SeasonGroupingSettingsDescriptor[]> {
  const settingsRows = await tx
    .select({
      leagueSize: leagueSeasonSettings.leagueSize,
      lineupSlotCounts: leagueSeasonSettings.lineupSlotCounts,
      matchupPeriodCount: leagueSeasonSettings.matchupPeriodCount,
      playoffMatchupPeriodLength:
        leagueSeasonSettings.playoffMatchupPeriodLength,
      playoffTeamCount: leagueSeasonSettings.playoffTeamCount,
      regularSeasonEndScoringPeriod:
        leagueSeasonSettings.regularSeasonEndScoringPeriod,
      scoringSettings: leagueSeasonSettings.scoringSettings,
      scoringType: leagueSeasonSettings.scoringType,
      season: leagueSeasonSettings.season,
    })
    .from(leagueSeasonSettings)
    .where(eq(leagueSeasonSettings.leagueId, leagueId))
    .orderBy(asc(leagueSeasonSettings.season));
  const teamRows = await tx
    .select({
      providerTeamId: teamSeasons.providerTeamId,
      season: teamSeasons.season,
    })
    .from(teamSeasons)
    .where(eq(teamSeasons.leagueId, leagueId))
    .orderBy(asc(teamSeasons.season));

  const settingsBySeason = new Map(
    settingsRows.map((row) => [row.season, row]),
  );
  const teamsBySeason = new Map<number, Set<string>>();
  for (const row of teamRows) {
    const teams = teamsBySeason.get(row.season) ?? new Set<string>();
    teams.add(row.providerTeamId);
    teamsBySeason.set(row.season, teams);
  }

  const seasons = sortedUniqueNumbers([
    ...settingsRows.map((row) => row.season),
    ...teamRows.map((row) => row.season),
  ]);
  return seasons.map((season) => {
    const settings = settingsBySeason.get(season);
    return {
      leagueSize: settings?.leagueSize ?? null,
      lineupSlotCounts: settings?.lineupSlotCounts ?? {},
      matchupPeriodCount: settings?.matchupPeriodCount ?? null,
      playoffMatchupPeriodLength: settings?.playoffMatchupPeriodLength ?? null,
      playoffTeamCount: settings?.playoffTeamCount ?? null,
      regularSeasonEndScoringPeriod:
        settings?.regularSeasonEndScoringPeriod ?? null,
      scoringSettings: settings?.scoringSettings ?? null,
      scoringType: settings?.scoringType ?? null,
      season,
      teamCount: teamsBySeason.get(season)?.size ?? null,
    };
  });
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
    rationale:
      typeof row.derivedFrom.rationale === "string"
        ? row.derivedFrom.rationale
        : (row.config.notes ?? "Owner-defined season grouping."),
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
  const knownSeasons = new Set(
    descriptors.map((descriptor) => descriptor.season),
  );
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
    if (before.status === "dismissed") {
      throw new Error("dismissed season groupings cannot be confirmed");
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

export async function dismissLeagueSeasonGrouping(
  db: Db,
  input: {
    actorUserId: string;
    groupingId: string;
    leagueId: string;
    reason?: string;
  },
): Promise<PersistedSeasonGrouping> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [before] = await groupingWithSeasons(tx, input.leagueId, [
      input.groupingId,
    ]);
    if (!before) {
      throw new Error("season grouping was not found");
    }
    if (before.status !== "proposed") {
      throw new Error("only proposed season groupings can be dismissed");
    }

    await tx
      .update(leagueSeasonGroupings)
      .set({ status: "dismissed" })
      .where(
        and(
          eq(leagueSeasonGroupings.leagueId, input.leagueId),
          eq(leagueSeasonGroupings.id, input.groupingId),
        ),
      );

    const [after] = await groupingWithSeasons(tx, input.leagueId, [
      input.groupingId,
    ]);
    if (!after) {
      throw new Error("dismissed season grouping was not found");
    }

    await tx.insert(leagueDataEdits).values({
      actorUserId: input.actorUserId,
      afterValue: {
        seasons: after.seasons,
        status: after.status,
      },
      beforeValue: {
        seasons: before.seasons,
        status: before.status,
      },
      editClass: "cosmetic",
      field: "grouping_dismissal",
      leagueId: input.leagueId,
      reason: input.reason ?? "dismissed season grouping proposal",
      targetId: input.groupingId,
      targetKind: "grouping",
    });

    return after;
  });
}

export async function listUnifiedDataLedger(
  db: Db,
  input: {
    leagueId: string;
    limit?: number;
    offset?: number;
    targetId?: string;
    targetKind?: UnifiedLedgerTargetKind;
  },
): Promise<UnifiedLedgerEntry[]> {
  return (
    await listUnifiedDataLedgerPage(db, {
      leagueId: input.leagueId,
      limit: input.limit,
      offset: input.offset,
      targetId: input.targetId,
      targetKind: input.targetKind,
    })
  ).entries;
}

export async function listUnifiedDataLedgerPage(
  db: Db,
  input: {
    leagueId: string;
    limit?: number;
    offset?: number;
    targetId?: string;
    targetKind?: UnifiedLedgerTargetKind;
  },
): Promise<UnifiedLedgerPage> {
  const limit = Math.max(1, Math.min(200, input.limit ?? 100));
  const offset = Math.max(0, input.offset ?? 0);
  const targetId = input.targetId ?? null;
  const targetKind = input.targetKind ?? null;
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const result = await tx.execute(sql<RawUnifiedLedgerRow>`
      with unified as (
        select
          actor_user_id,
          after_value,
          before_value,
          created_at,
          edit_class::text as edit_class,
          field,
          id,
          reason,
          scope,
          'league_data_edit'::text as source,
          target_id,
          target_kind::text as target_kind
        from league_data_edits
        where league_id = ${input.leagueId}::uuid
          and (${targetKind}::text is null or ${targetKind}::text <> 'integrity_check')
          and (${targetKind}::text is null or target_kind::text = ${targetKind}::text)
          and (${targetId}::uuid is null or target_id = ${targetId}::uuid)

        union all

        select
          actor_user_id,
          after_state as after_value,
          before_state as before_value,
          created_at,
          'audit'::text as edit_class,
          action::text as field,
          id,
          reason,
          null::text as scope,
          'identity_audit'::text as source,
          coalesce(person_id, team_season_id) as target_id,
          case when person_id is not null then 'person' else 'team_season' end as target_kind
        from identity_audit_log
        where league_id = ${input.leagueId}::uuid
          and (${targetKind}::text is null or ${targetKind}::text in ('person', 'team_season'))
          and (
            ${targetKind}::text is null
            or (${targetKind}::text = 'person' and person_id is not null)
            or (${targetKind}::text = 'team_season' and team_season_id is not null)
          )
          and (
            ${targetId}::uuid is null
            or (${targetKind}::text = 'person' and person_id = ${targetId}::uuid)
            or (${targetKind}::text = 'team_season' and team_season_id = ${targetId}::uuid)
            or (
              ${targetKind}::text is null
              and (person_id = ${targetId}::uuid or team_season_id = ${targetId}::uuid)
            )
          )

        union all

        select
          actor_user_id,
          after_state as after_value,
          before_state as before_value,
          created_at,
          'audit'::text as edit_class,
          action::text as field,
          id,
          reason,
          null::text as scope,
          'data_correction_audit'::text as source,
          integrity_check_id as target_id,
          'integrity_check'::text as target_kind
        from data_correction_audit_log
        where league_id = ${input.leagueId}::uuid
          and (${targetKind}::text is null or ${targetKind}::text = 'integrity_check')
          and (${targetId}::uuid is null or integrity_check_id = ${targetId}::uuid)
      ),
      counted as (
        select count(*)::int as total_count from unified
      ),
      page as (
        select *
        from unified
        order by created_at desc, id desc
        limit ${limit}
        offset ${offset}
      )
      select
        page.actor_user_id,
        page.after_value,
        page.before_value,
        page.created_at,
        page.edit_class,
        page.field,
        page.id,
        page.reason,
        page.scope,
        page.source,
        page.target_id,
        page.target_kind,
        counted.total_count
      from counted
      left join page on true
      order by page.created_at desc nulls last, page.id desc nulls last
    `);

    const rows = result.rows as unknown as RawUnifiedLedgerRow[];
    const total = rowCount(rows[0]?.total_count);
    const entries = rows
      .filter((row) => typeof row.id === "string")
      .map(normalizeUnifiedLedgerRow);

    return {
      entries,
      hasMore: offset + entries.length < total,
      limit,
      offset,
      total,
    };
  });
}

interface RawUnifiedLedgerRow {
  actor_user_id: string | null;
  after_value: unknown;
  before_value: unknown;
  created_at: Date | string | null;
  edit_class: string | null;
  field: string | null;
  id: string | null;
  reason: string | null;
  scope: string | null;
  source: string | null;
  target_id: string | null;
  target_kind: string | null;
  total_count: number | string | bigint;
}

function normalizeUnifiedLedgerRow(
  row: RawUnifiedLedgerRow,
): UnifiedLedgerEntry {
  return {
    actorUserId: row.actor_user_id,
    afterValue: row.after_value,
    beforeValue: row.before_value,
    createdAt: timestampIso(row.created_at),
    editClass:
      row.edit_class === "audit"
        ? "audit"
        : (row.edit_class as LeagueDataEditClass),
    field: row.field ?? "unknown",
    id: row.id ?? "",
    reason: row.reason,
    scope:
      row.scope === "all_years" || row.scope === "this_year_only"
        ? row.scope
        : null,
    source:
      row.source === "identity_audit" || row.source === "data_correction_audit"
        ? row.source
        : "league_data_edit",
    targetId: row.target_id,
    targetKind: row.target_kind ?? "unknown",
  };
}

function timestampIso(value: Date | string | null): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  return new Date(0).toISOString();
}

function rowCount(value: number | string | bigint | undefined): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function groupingConfigIsEquivalent(
  left: LeagueSeasonGroupingConfig,
  right: LeagueSeasonGroupingConfig,
): boolean {
  return stableJson(left) === stableJson(right);
}
