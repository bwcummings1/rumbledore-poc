import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { logger } from "@/core/logging";
import { err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  dataCoverage,
  dataIntegrityChecks,
  fantasyDraftPicks,
  fantasyMatchups,
  fantasyMembers,
  fantasyPlayers,
  fantasyRosterEntries,
  fantasyTeams,
  fantasyTransactions,
  leagueDataEdits,
  leagueSeasonSettings,
  leagues,
  nflPlayers,
  providerFinalStandings,
  teamSeasons,
} from "@/db/schema";
import type {
  DataCoverageStatus,
  FantasyProvider,
  FantasyProviderCapabilities,
  FantasyProviderSession,
  NormalizedDraftPick,
  NormalizedFinalStanding,
  NormalizedLeague,
  NormalizedMatchup,
  NormalizedMember,
  NormalizedPlayer,
  NormalizedRoster,
  NormalizedTeam,
  NormalizedTransaction,
  ProviderDataClass,
  ProviderDataSupport,
  ProviderError,
  ProviderLeagueRef,
} from "@/providers";
import { PROVIDER_DATA_CLASSES } from "@/providers";
import { REALTIME_EVENTS, type RealtimePublisher } from "@/realtime";
import {
  type RecordBrokenHook,
  type RecordBrokenLoreHookResult,
  recomputeChangedMatchupStatistics,
  seedRecordBrokenLoreHooks,
} from "@/stats";
import { stableContentHash } from "./hash";

export type CurrentLeagueProvider<Session extends FantasyProviderSession> =
  Pick<
    FantasyProvider<unknown, Session>,
    "capabilities" | "getLeague" | "getMatchups" | "getMembers" | "getTeams"
  > &
    Partial<
      Pick<FantasyProvider<unknown, Session>, "getDraftPicks" | "getRosters">
    > &
    Pick<FantasyProvider<unknown, Session>, "getTransactions">;

export interface EntitySyncStats {
  total: number;
  changed: number;
  unchanged: number;
}

export interface ChangedFinalMatchup {
  contentHash: string;
  id: string;
}

export interface ChangedTransaction {
  id: string;
  type: NormalizedTransaction["type"];
}

export interface CurrentLeagueSyncResult {
  changedFinalMatchups: ChangedFinalMatchup[];
  changedTransactions: ChangedTransaction[];
  recordBrokenHooks: RecordBrokenHook[];
  recordLoreClaims: RecordBrokenLoreHookResult[];
  league: {
    id: string;
    provider: NormalizedLeague["provider"];
    providerLeagueId: string;
    season: number;
    changed: number;
    unchanged: number;
  };
  teams: EntitySyncStats;
  members: EntitySyncStats;
  matchups: EntitySyncStats;
  players?: EntitySyncStats;
  rosters: EntitySyncStats;
  draftPicks?: EntitySyncStats;
  transactions: EntitySyncStats;
}

export interface PersistNormalizedLeagueRowsInput {
  db: Db;
  finalStandings?: readonly NormalizedFinalStanding[];
  draftPicks?: readonly NormalizedDraftPick[];
  league?: NormalizedLeague;
  leagueId: string;
  leagueProviderId?: string;
  matchups: readonly NormalizedMatchup[];
  members: readonly NormalizedMember[];
  players?: readonly NormalizedPlayer[];
  reconcileSeasons?: {
    draftPicks?: readonly number[];
    members?: readonly number[];
    rosters?: readonly number[];
    teams?: readonly number[];
    transactions?: readonly number[];
  };
  rosters?: readonly NormalizedRoster[];
  teams: readonly NormalizedTeam[];
  transactions?: readonly NormalizedTransaction[];
}

export interface PersistNormalizedLeagueRowsResult {
  changedMatchupIds: string[];
  changedMatchupScoringPeriods: number[];
  teamStats: EntitySyncStats;
  memberStats: EntitySyncStats;
  matchupStats: EntitySyncStats;
  playerStats: EntitySyncStats;
  rosterStats: EntitySyncStats;
  draftPickStats: EntitySyncStats;
  transactionStats: EntitySyncStats;
  changedTransactions: ChangedTransaction[];
  finalStandingStats: EntitySyncStats;
  leagueSeasonSettingsStats: EntitySyncStats;
}

export type CurrentLeagueSyncError = ProviderError;

export interface CurrentLeagueSyncInput<
  Session extends FantasyProviderSession,
> {
  currentScoringPeriod?: number;
  dataClasses?: readonly ProviderDataClass[];
  db: Db;
  leagueId?: string;
  now?: () => Date;
  provider: CurrentLeagueProvider<Session>;
  ref: ProviderLeagueRef;
  realtime?: RealtimePublisher;
  recomputeChangedMatchups?: typeof recomputeChangedMatchupStatistics;
  session: Session;
}

type LeagueUpsertResult = {
  id: string;
  changed: number;
};

interface MatchupUpsertResult {
  changedIds: string[];
  scoringPeriods: number[];
  stats: EntitySyncStats;
}

interface TransactionUpsertResult {
  changedTransactions: ChangedTransaction[];
  stats: EntitySyncStats;
}

type MatchupUpsertRow = {
  awayScore: number;
  awayTeamProviderId: string | null;
  contentHash: string;
  homeScore: number;
  homeTeamProviderId: string;
  kind: NormalizedMatchup["kind"] | "head_to_head";
  leagueId: string;
  leagueProviderId: string;
  periodStart: number;
  provider: NormalizedMatchup["provider"];
  providerMatchupId: string;
  scoringPeriod: number;
  scoringPeriodSpan: number;
  season: number;
  status: NormalizedMatchup["status"];
  winner: NormalizedMatchup["winner"];
};
type LeagueSeasonSettingsRow = typeof leagueSeasonSettings.$inferSelect;

type FinalizedStateRegressionNote = {
  detail: Record<string, unknown> & { dedupeKey: string };
  season: number;
};

function stats(total: number, changed: number): EntitySyncStats {
  return {
    total,
    changed,
    unchanged: total - changed,
  };
}

function emptyStats(): EntitySyncStats {
  return stats(0, 0);
}

function currentTime(
  deps: Pick<CurrentLeagueSyncInput<FantasyProviderSession>, "now">,
): Date {
  return deps.now?.() ?? new Date();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function valuesDiffer(left: unknown, right: unknown): boolean {
  return stableJson(left) !== stableJson(right);
}

interface StickyEditConflict {
  field: string;
  incomingValue: unknown;
  preservedValue: unknown;
  providerIdentity: Record<string, unknown>;
  season: number | null;
  targetId: string;
  targetKind: "matchup" | "season_setting";
}

async function recordStickyEditConflicts(
  tx: LeagueScopedTx,
  leagueId: string,
  conflicts: readonly StickyEditConflict[],
): Promise<void> {
  if (conflicts.length === 0) {
    return;
  }
  await tx.insert(dataIntegrityChecks).values(
    conflicts.map((conflict) => ({
      checkKey: "sticky_edit_conflict" as const,
      detail: {
        field: conflict.field,
        incomingValue: conflict.incomingValue,
        preservedValue: conflict.preservedValue,
        providerIdentity: conflict.providerIdentity,
        reason: "provider_import_conflicts_with_manual_edit",
        targetId: conflict.targetId,
        targetKind: conflict.targetKind,
      },
      leagueId,
      season: conflict.season,
      status: "fail" as const,
    })),
  );
}

function changedScoringPeriod(
  scoringPeriods: readonly number[],
): number | null {
  return scoringPeriods.length === 1 ? (scoringPeriods[0] ?? null) : null;
}

async function publishScoresUpdated<Session extends FantasyProviderSession>({
  input,
  leagueId,
  matchupIds,
  scoringPeriods,
}: {
  input: Pick<CurrentLeagueSyncInput<Session>, "now" | "realtime">;
  leagueId: string;
  matchupIds: readonly string[];
  scoringPeriods: readonly number[];
}): Promise<void> {
  if (!input.realtime || matchupIds.length === 0) {
    return;
  }

  try {
    await input.realtime.publishLeagueScoresUpdated({
      at: currentTime(input).toISOString(),
      leagueId,
      matchupIds: [...matchupIds],
      scoringPeriod: changedScoringPeriod(scoringPeriods),
      type: REALTIME_EVENTS.scoresUpdated,
      v: 1,
    });
  } catch (error) {
    logger.warn("Realtime scores update event failed", {
      error,
      leagueId,
      matchupCount: matchupIds.length,
    });
  }
}

async function loadChangedFinalMatchups({
  db,
  leagueId,
  matchupIds,
}: {
  db: Db;
  leagueId: string;
  matchupIds: readonly string[];
}): Promise<ChangedFinalMatchup[]> {
  if (matchupIds.length === 0) {
    return [];
  }

  const rows = await withLeagueContext(db, leagueId, (tx) =>
    tx
      .select({
        contentHash: fantasyMatchups.contentHash,
        id: fantasyMatchups.id,
      })
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.leagueId, leagueId),
          eq(fantasyMatchups.status, "final"),
          inArray(fantasyMatchups.id, [...matchupIds]),
        ),
      ),
  );

  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function teamHashPayload(team: NormalizedTeam) {
  return {
    abbrev: team.abbrev,
    division: team.division ?? null,
    leagueProviderId: team.leagueProviderId,
    logo: team.logo ?? null,
    name: team.name,
    ownerMemberIds: sortedUnique(team.ownerMemberIds),
    record: {
      losses: team.record.losses,
      pointsAgainst: team.record.pointsAgainst,
      pointsFor: team.record.pointsFor,
      ties: team.record.ties,
      wins: team.record.wins,
    },
    provider: team.provider,
    providerId: team.providerId,
    season: team.season,
  };
}

function memberHashPayload(member: NormalizedMember) {
  return {
    displayName: member.displayName,
    leagueProviderId: member.leagueProviderId,
    provider: member.provider,
    providerId: member.providerId,
    role: member.role ?? "unknown",
    season: member.season,
  };
}

function matchupHashPayload(matchup: NormalizedMatchup) {
  return {
    awayScore: matchup.awayScore ?? 0,
    awayTeamProviderId: matchup.awayTeamRef?.providerId ?? null,
    homeScore: matchup.homeScore,
    homeTeamProviderId: matchup.homeTeamRef.providerId,
    kind: matchup.kind ?? "head_to_head",
    leagueProviderId: matchup.leagueProviderId,
    periodStart: matchup.periodStart ?? matchup.scoringPeriod,
    provider: matchup.provider,
    providerId: matchup.providerId,
    scoringPeriod: matchup.scoringPeriod,
    scoringPeriodSpan: matchup.scoringPeriodSpan ?? 1,
    season: matchup.season,
    status: matchup.status,
    winner: matchup.winner,
  };
}

function matchupRowHashPayload(row: MatchupUpsertRow) {
  return {
    awayScore: row.awayScore,
    awayTeamProviderId: row.awayTeamProviderId,
    homeScore: row.homeScore,
    homeTeamProviderId: row.homeTeamProviderId,
    kind: row.kind,
    leagueProviderId: row.leagueProviderId,
    periodStart: row.periodStart,
    provider: row.provider,
    providerId: row.providerMatchupId,
    scoringPeriod: row.scoringPeriod,
    scoringPeriodSpan: row.scoringPeriodSpan,
    season: row.season,
    status: row.status,
    winner: row.winner,
  };
}

function positiveSpan(value: number | null | undefined): number {
  return Number.isInteger(value) && value !== undefined && value !== null
    ? Math.max(1, value)
    : 1;
}

function settingPlayoffStart(
  setting: LeagueSeasonSettingsRow | undefined,
): number | null {
  return (
    setting?.playoffStartScoringPeriod ??
    (setting?.matchupPeriodCount ? setting.matchupPeriodCount + 1 : null)
  );
}

function isSettingDerivedPlayoffMatchup(
  matchup: Pick<NormalizedMatchup, "periodStart" | "scoringPeriod">,
  setting: LeagueSeasonSettingsRow | undefined,
): boolean {
  const playoffStart = settingPlayoffStart(setting);
  if (!playoffStart) {
    return false;
  }
  const windowStart = matchup.periodStart ?? matchup.scoringPeriod;
  const championshipPeriod = setting?.championshipScoringPeriod ?? null;
  return (
    windowStart >= playoffStart &&
    (championshipPeriod === null || windowStart <= championshipPeriod)
  );
}

function settingDerivedScoringPeriodSpan(
  matchup: NormalizedMatchup,
  setting: LeagueSeasonSettingsRow | undefined,
): number {
  const providerSpan = positiveSpan(matchup.scoringPeriodSpan);
  const explicitPlayoffSpan = setting?.playoffMatchupPeriodLength;
  if (
    explicitPlayoffSpan === undefined ||
    explicitPlayoffSpan === null ||
    !isSettingDerivedPlayoffMatchup(matchup, setting)
  ) {
    return providerSpan;
  }
  return positiveSpan(explicitPlayoffSpan);
}

async function preserveStickyMatchupEdits(
  tx: LeagueScopedTx,
  leagueId: string,
  rows: readonly MatchupUpsertRow[],
): Promise<MatchupUpsertRow[]> {
  if (rows.length === 0) {
    return [];
  }
  const editRows = await tx
    .select({
      field: leagueDataEdits.field,
      targetId: leagueDataEdits.targetId,
    })
    .from(leagueDataEdits)
    .where(
      and(
        eq(leagueDataEdits.leagueId, leagueId),
        eq(leagueDataEdits.targetKind, "matchup"),
        inArray(leagueDataEdits.field, [
          "away_score",
          "home_score",
          "period_start",
          "scoring_period_span",
          "winner",
        ]),
      ),
    );
  const targetIds = [...new Set(editRows.map((row) => row.targetId))];
  if (targetIds.length === 0) {
    return [...rows];
  }
  const existingRows = await tx
    .select({
      awayScore: fantasyMatchups.awayScore,
      homeScore: fantasyMatchups.homeScore,
      id: fantasyMatchups.id,
      leagueProviderId: fantasyMatchups.leagueProviderId,
      periodStart: fantasyMatchups.periodStart,
      provider: fantasyMatchups.provider,
      providerMatchupId: fantasyMatchups.providerMatchupId,
      scoringPeriod: fantasyMatchups.scoringPeriod,
      scoringPeriodSpan: fantasyMatchups.scoringPeriodSpan,
      season: fantasyMatchups.season,
      winner: fantasyMatchups.winner,
    })
    .from(fantasyMatchups)
    .where(
      and(
        eq(fantasyMatchups.leagueId, leagueId),
        inArray(fantasyMatchups.id, targetIds),
      ),
    );
  const fieldsByTargetId = new Map<string, Set<string>>();
  for (const edit of editRows) {
    const fields = fieldsByTargetId.get(edit.targetId) ?? new Set<string>();
    fields.add(edit.field);
    fieldsByTargetId.set(edit.targetId, fields);
  }
  const existingByIdentity = new Map(
    existingRows.map((row) => [matchupIdentityKey(row), row]),
  );
  const conflicts: StickyEditConflict[] = [];
  const preserved = rows.map((row) => {
    const existing = existingByIdentity.get(matchupIdentityKey(row));
    const stickyFields = existing ? fieldsByTargetId.get(existing.id) : null;
    if (!existing || !stickyFields || stickyFields.size === 0) {
      return row;
    }
    const next = { ...row };
    const preserve = (
      field: string,
      incomingValue: unknown,
      preservedValue: unknown,
      apply: () => void,
    ) => {
      if (!stickyFields.has(field)) {
        return;
      }
      if (valuesDiffer(incomingValue, preservedValue)) {
        conflicts.push({
          field,
          incomingValue,
          preservedValue,
          providerIdentity: {
            leagueProviderId: row.leagueProviderId,
            provider: row.provider,
            providerMatchupId: row.providerMatchupId,
            scoringPeriod: row.scoringPeriod,
          },
          season: row.season,
          targetId: existing.id,
          targetKind: "matchup",
        });
      }
      apply();
    };
    preserve("home_score", row.homeScore, existing.homeScore, () => {
      next.homeScore = existing.homeScore;
    });
    preserve("away_score", row.awayScore, existing.awayScore, () => {
      next.awayScore = existing.awayScore;
    });
    preserve("winner", row.winner, existing.winner, () => {
      next.winner = existing.winner;
    });
    preserve("period_start", row.periodStart, existing.periodStart, () => {
      next.periodStart = existing.periodStart ?? existing.scoringPeriod;
    });
    preserve(
      "scoring_period_span",
      row.scoringPeriodSpan,
      existing.scoringPeriodSpan,
      () => {
        next.scoringPeriodSpan = existing.scoringPeriodSpan;
      },
    );
    next.contentHash = stableContentHash(matchupRowHashPayload(next));
    return next;
  });
  await recordStickyEditConflicts(tx, leagueId, conflicts);
  return preserved;
}

function finalStandingHashPayload(standing: NormalizedFinalStanding) {
  return {
    division: standing.division ?? null,
    divisionRank: standing.divisionRank ?? null,
    divisionWinner: standing.divisionWinner ?? false,
    finalRank: standing.rank,
    leagueProviderId: standing.leagueProviderId,
    losses: standing.losses,
    playoffSeed: standing.playoffSeed ?? null,
    pointsAgainst: standing.pointsAgainst,
    pointsFor: standing.pointsFor,
    provider: standing.teamRef.provider,
    rankConfidence: standing.rankConfidence ?? "high",
    rankSource: standing.rankSource ?? "provider_reported",
    providerTeamId: standing.teamRef.providerId,
    season: standing.teamRef.season,
    ties: standing.ties,
    wins: standing.wins,
  };
}

function leagueSeasonSettingsHashPayload(league: NormalizedLeague) {
  return {
    acquisitionBudget: league.acquisitionSettings?.acquisitionBudget ?? null,
    acquisitionSettings: league.acquisitionSettings ?? {},
    acquisitionType: league.acquisitionSettings?.acquisitionType ?? null,
    championshipScoringPeriod:
      league.postseason?.championshipScoringPeriod ?? null,
    isDynastyLeague: league.keeperSettings?.isDynasty ?? false,
    isKeeperLeague: league.keeperSettings?.isKeeper ?? false,
    keeperSettings: league.keeperSettings ?? {},
    leagueProviderId: league.providerId,
    leagueSize: league.size,
    lineupSlotCounts: league.rosterSettings?.lineupSlotCounts ?? {},
    matchupPeriodCount: league.postseason?.matchupPeriodCount ?? 1,
    playoffMatchupPeriodLength:
      league.postseason?.playoffMatchupPeriodLength ?? null,
    playoffStartScoringPeriod:
      league.postseason?.playoffStartScoringPeriod ?? null,
    playoffTeamCount: league.postseason?.playoffTeamCount ?? null,
    provider: league.provider,
    regularSeasonEndScoringPeriod:
      league.postseason?.regularSeasonEndScoringPeriod ?? null,
    scoringType: league.scoringType,
    scoringSettings: league.scoringSettings ?? {},
    season: league.season,
  };
}

type LeagueSeasonSettingsUpsertRow = typeof leagueSeasonSettings.$inferInsert;

function leagueSeasonSettingsRowHashPayload(
  row: LeagueSeasonSettingsUpsertRow,
) {
  return {
    acquisitionBudget: row.acquisitionBudget ?? null,
    acquisitionSettings: row.acquisitionSettings ?? {},
    acquisitionType: row.acquisitionType ?? null,
    championshipScoringPeriod: row.championshipScoringPeriod ?? null,
    isDynastyLeague: row.isDynastyLeague ?? false,
    isKeeperLeague: row.isKeeperLeague ?? false,
    keeperSettings: row.keeperSettings ?? {},
    leagueProviderId: row.leagueProviderId,
    leagueSize: row.leagueSize ?? 0,
    lineupSlotCounts: row.lineupSlotCounts ?? {},
    matchupPeriodCount: row.matchupPeriodCount ?? 1,
    playoffMatchupPeriodLength: row.playoffMatchupPeriodLength ?? null,
    playoffStartScoringPeriod: row.playoffStartScoringPeriod ?? null,
    playoffTeamCount: row.playoffTeamCount ?? null,
    provider: row.provider,
    regularSeasonEndScoringPeriod: row.regularSeasonEndScoringPeriod ?? null,
    scoringType: row.scoringType ?? "unknown",
    scoringSettings: row.scoringSettings ?? {},
    season: row.season,
  };
}

async function preserveStickySeasonSettingEdits(
  tx: LeagueScopedTx,
  leagueId: string,
  row: LeagueSeasonSettingsUpsertRow,
): Promise<LeagueSeasonSettingsUpsertRow> {
  const [existing] = await tx
    .select({
      acquisitionBudget: leagueSeasonSettings.acquisitionBudget,
      acquisitionSettings: leagueSeasonSettings.acquisitionSettings,
      acquisitionType: leagueSeasonSettings.acquisitionType,
      championshipScoringPeriod: leagueSeasonSettings.championshipScoringPeriod,
      id: leagueSeasonSettings.id,
      keeperSettings: leagueSeasonSettings.keeperSettings,
      leagueSize: leagueSeasonSettings.leagueSize,
      lineupSlotCounts: leagueSeasonSettings.lineupSlotCounts,
      matchupPeriodCount: leagueSeasonSettings.matchupPeriodCount,
      playoffMatchupPeriodLength:
        leagueSeasonSettings.playoffMatchupPeriodLength,
      playoffStartScoringPeriod: leagueSeasonSettings.playoffStartScoringPeriod,
      playoffTeamCount: leagueSeasonSettings.playoffTeamCount,
      regularSeasonEndScoringPeriod:
        leagueSeasonSettings.regularSeasonEndScoringPeriod,
      scoringType: leagueSeasonSettings.scoringType,
      scoringSettings: leagueSeasonSettings.scoringSettings,
      season: leagueSeasonSettings.season,
    })
    .from(leagueSeasonSettings)
    .where(
      and(
        eq(leagueSeasonSettings.leagueId, leagueId),
        eq(leagueSeasonSettings.provider, row.provider),
        eq(leagueSeasonSettings.leagueProviderId, row.leagueProviderId),
        eq(leagueSeasonSettings.season, row.season),
      ),
    )
    .limit(1);
  if (!existing) {
    return row;
  }
  const editRows = await tx
    .select({ field: leagueDataEdits.field })
    .from(leagueDataEdits)
    .where(
      and(
        eq(leagueDataEdits.leagueId, leagueId),
        eq(leagueDataEdits.targetKind, "season_setting"),
        eq(leagueDataEdits.targetId, existing.id),
      ),
    );
  const stickyFields = new Set(editRows.map((edit) => edit.field));
  if (stickyFields.size === 0) {
    return row;
  }

  const conflicts: StickyEditConflict[] = [];
  const next = { ...row };
  const preserve = (
    field: string,
    incomingValue: unknown,
    preservedValue: unknown,
    apply: () => void,
  ) => {
    if (!stickyFields.has(field)) {
      return;
    }
    if (valuesDiffer(incomingValue, preservedValue)) {
      conflicts.push({
        field,
        incomingValue,
        preservedValue,
        providerIdentity: {
          leagueProviderId: row.leagueProviderId,
          provider: row.provider,
          season: row.season,
        },
        season: row.season ?? null,
        targetId: existing.id,
        targetKind: "season_setting",
      });
    }
    apply();
  };
  preserve("league_size", row.leagueSize ?? 0, existing.leagueSize, () => {
    next.leagueSize = existing.leagueSize;
  });
  preserve(
    "matchup_period_count",
    row.matchupPeriodCount ?? 1,
    existing.matchupPeriodCount,
    () => {
      next.matchupPeriodCount = existing.matchupPeriodCount;
    },
  );
  preserve(
    "regular_season_end_scoring_period",
    row.regularSeasonEndScoringPeriod ?? null,
    existing.regularSeasonEndScoringPeriod,
    () => {
      next.regularSeasonEndScoringPeriod =
        existing.regularSeasonEndScoringPeriod;
    },
  );
  preserve(
    "playoff_matchup_period_length",
    row.playoffMatchupPeriodLength ?? null,
    existing.playoffMatchupPeriodLength,
    () => {
      next.playoffMatchupPeriodLength = existing.playoffMatchupPeriodLength;
    },
  );
  preserve(
    "playoff_start_scoring_period",
    row.playoffStartScoringPeriod ?? null,
    existing.playoffStartScoringPeriod,
    () => {
      next.playoffStartScoringPeriod = existing.playoffStartScoringPeriod;
    },
  );
  preserve(
    "championship_scoring_period",
    row.championshipScoringPeriod ?? null,
    existing.championshipScoringPeriod,
    () => {
      next.championshipScoringPeriod = existing.championshipScoringPeriod;
    },
  );
  preserve(
    "playoff_team_count",
    row.playoffTeamCount ?? null,
    existing.playoffTeamCount,
    () => {
      next.playoffTeamCount = existing.playoffTeamCount;
    },
  );
  preserve(
    "scoring_type",
    row.scoringType ?? "unknown",
    existing.scoringType,
    () => {
      next.scoringType = existing.scoringType;
    },
  );
  preserve(
    "scoring_settings",
    row.scoringSettings ?? {},
    existing.scoringSettings,
    () => {
      next.scoringSettings = existing.scoringSettings;
    },
  );
  preserve(
    "lineup_slot_counts",
    row.lineupSlotCounts ?? {},
    existing.lineupSlotCounts,
    () => {
      next.lineupSlotCounts = existing.lineupSlotCounts;
    },
  );
  preserve(
    "acquisition_type",
    row.acquisitionType ?? null,
    existing.acquisitionType,
    () => {
      next.acquisitionType = existing.acquisitionType;
    },
  );
  preserve(
    "acquisition_budget",
    row.acquisitionBudget ?? null,
    existing.acquisitionBudget,
    () => {
      next.acquisitionBudget = existing.acquisitionBudget;
    },
  );
  preserve(
    "acquisition_settings",
    row.acquisitionSettings ?? {},
    existing.acquisitionSettings,
    () => {
      next.acquisitionSettings = existing.acquisitionSettings;
    },
  );
  preserve(
    "keeper_settings",
    row.keeperSettings ?? {},
    existing.keeperSettings,
    () => {
      next.keeperSettings = existing.keeperSettings;
    },
  );
  next.contentHash = stableContentHash(
    leagueSeasonSettingsRowHashPayload(next),
  );
  await recordStickyEditConflicts(tx, leagueId, conflicts);
  return next;
}

function rosterEntryHashPayload({
  entry,
  roster,
}: {
  entry: NormalizedRoster["entries"][number];
  roster: NormalizedRoster;
}) {
  return {
    actualPoints: entry.actualPoints ?? entry.points ?? null,
    fantasyPlayerProviderId: entry.player?.providerId ?? null,
    isKeeper: entry.isKeeper ?? false,
    metadata: entry.metadata ?? {},
    playerProviderId: entry.playerRef.providerId,
    points: entry.points ?? null,
    projectedPoints: entry.projectedPoints ?? null,
    provider: roster.teamRef.provider,
    providerTeamId: roster.teamRef.providerId,
    scoringPeriod: roster.scoringPeriod,
    season: roster.season,
    slot: entry.slot,
    started: entry.started ?? false,
    status: entry.status,
  };
}

function playerHashPayload(player: NormalizedPlayer) {
  return {
    fullName: player.fullName,
    metadata: player.metadata ?? {},
    position: player.position,
    proTeam: player.proTeam ?? null,
    provider: player.provider,
    providerId: player.providerId,
    status: player.status ?? null,
  };
}

function draftPickHashPayload(pick: NormalizedDraftPick) {
  return {
    auctionValue: pick.auctionValue ?? null,
    isKeeper: pick.isKeeper ?? false,
    leagueProviderId: pick.leagueProviderId,
    metadata: pick.metadata ?? {},
    pickInRound: pick.pickInRound ?? null,
    pickOverall: pick.pickOverall ?? null,
    playerProviderId: pick.playerRef?.providerId ?? null,
    provider: pick.provider,
    providerId: pick.providerId,
    providerTeamId: pick.teamRef.providerId,
    round: pick.round,
    season: pick.season,
  };
}

function transactionHashPayload(transaction: NormalizedTransaction) {
  return {
    details: transaction.details,
    leagueProviderId: transaction.leagueProviderId,
    playerProviderIds: sortedUnique(
      transaction.playerRefs.map((player) => player.providerId),
    ),
    provider: transaction.provider,
    providerId: transaction.providerId,
    scoringPeriod: transaction.scoringPeriod ?? null,
    season: transaction.season,
    teamProviderIds: sortedUnique(
      transaction.teamRefs.map((team) => team.providerId),
    ),
    timestamp: transaction.timestamp.toISOString(),
    type: transaction.type,
  };
}

function finalizedRegressionDedupeKey(value: Record<string, unknown>): string {
  return stableContentHash({
    finalizedStateRegression: value,
  });
}

function isCompleteLeagueStatus(status: NormalizedLeague["status"]): boolean {
  switch (status) {
    case "complete":
      return true;
    default:
      return false;
  }
}

function matchupIdentityKey(
  row: Pick<
    MatchupUpsertRow,
    | "leagueProviderId"
    | "provider"
    | "providerMatchupId"
    | "scoringPeriod"
    | "season"
  >,
): string {
  return stableContentHash({
    leagueProviderId: row.leagueProviderId,
    provider: row.provider,
    providerMatchupId: row.providerMatchupId,
    scoringPeriod: row.scoringPeriod,
    season: row.season,
  });
}

async function recordFinalizedStateRegressionNotes(
  tx: LeagueScopedTx,
  leagueId: string,
  notes: readonly FinalizedStateRegressionNote[],
): Promise<void> {
  if (notes.length === 0) {
    return;
  }

  const existing = await tx
    .select({ detail: dataIntegrityChecks.detail })
    .from(dataIntegrityChecks)
    .where(
      and(
        eq(dataIntegrityChecks.leagueId, leagueId),
        eq(dataIntegrityChecks.checkKey, "finalized_state_regression"),
        eq(dataIntegrityChecks.status, "fail"),
      ),
    );
  const existingKeys = new Set(
    existing
      .map((row) => row.detail.dedupeKey)
      .filter((key): key is string => typeof key === "string"),
  );
  const newNotes = notes.filter(
    (note) => !existingKeys.has(note.detail.dedupeKey),
  );
  if (newNotes.length === 0) {
    return;
  }

  const rows: (typeof dataIntegrityChecks.$inferInsert)[] = newNotes.map(
    (note) => ({
      checkKey: "finalized_state_regression",
      detail: note.detail,
      leagueId,
      season: note.season,
      status: "fail",
    }),
  );
  await tx.insert(dataIntegrityChecks).values(rows);
}

async function finalizedLeagueStatusRegressionNotes(
  tx: LeagueScopedTx,
  leagueId: string,
  league?: NormalizedLeague,
): Promise<FinalizedStateRegressionNote[]> {
  if (!league || isCompleteLeagueStatus(league.status)) {
    return [];
  }

  const [persisted] = await tx
    .select({
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
      status: leagues.status,
    })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (!persisted || !isCompleteLeagueStatus(persisted.status)) {
    return [];
  }

  const identity = {
    entity: "league",
    incomingStatus: league.status,
    leagueProviderId: league.providerId,
    persistedStatus: persisted.status,
    provider: league.provider,
    season: league.season,
  };

  return [
    {
      detail: {
        dedupeKey: finalizedRegressionDedupeKey(identity),
        entity: "league",
        incoming: {
          status: league.status,
        },
        leagueProviderId: league.providerId,
        persisted: {
          status: persisted.status,
        },
        provider: league.provider,
        reason: "provider attempted to downgrade a completed season",
      },
      season: league.season,
    },
  ];
}

async function finalizedMatchupRegressionNotes(
  tx: LeagueScopedTx,
  leagueId: string,
  rows: readonly MatchupUpsertRow[],
): Promise<FinalizedStateRegressionNote[]> {
  const candidates = rows.filter((row) => row.status !== "final");
  if (candidates.length === 0) {
    return [];
  }

  const existingFinalMatchups = await tx
    .select({
      awayScore: fantasyMatchups.awayScore,
      contentHash: fantasyMatchups.contentHash,
      homeScore: fantasyMatchups.homeScore,
      leagueProviderId: fantasyMatchups.leagueProviderId,
      provider: fantasyMatchups.provider,
      providerMatchupId: fantasyMatchups.providerMatchupId,
      scoringPeriod: fantasyMatchups.scoringPeriod,
      season: fantasyMatchups.season,
      status: fantasyMatchups.status,
      winner: fantasyMatchups.winner,
    })
    .from(fantasyMatchups)
    .where(
      and(
        eq(fantasyMatchups.leagueId, leagueId),
        eq(fantasyMatchups.status, "final"),
      ),
    );
  if (existingFinalMatchups.length === 0) {
    return [];
  }

  const existingByIdentity = new Map(
    existingFinalMatchups.map((row) => [matchupIdentityKey(row), row]),
  );

  return candidates.flatMap((row) => {
    const existing = existingByIdentity.get(matchupIdentityKey(row));
    if (!existing || existing.contentHash === row.contentHash) {
      return [];
    }

    const identity = {
      entity: "fantasy_matchup",
      incomingContentHash: row.contentHash,
      incomingStatus: row.status,
      leagueProviderId: row.leagueProviderId,
      provider: row.provider,
      providerMatchupId: row.providerMatchupId,
      scoringPeriod: row.scoringPeriod,
      season: row.season,
    };

    return [
      {
        detail: {
          dedupeKey: finalizedRegressionDedupeKey(identity),
          entity: "fantasy_matchup",
          incoming: {
            awayScore: row.awayScore,
            contentHash: row.contentHash,
            homeScore: row.homeScore,
            status: row.status,
            winner: row.winner,
          },
          leagueProviderId: row.leagueProviderId,
          persisted: {
            awayScore: existing.awayScore,
            contentHash: existing.contentHash,
            homeScore: existing.homeScore,
            status: existing.status,
            winner: existing.winner,
          },
          provider: row.provider,
          providerMatchupId: row.providerMatchupId,
          reason: "provider attempted to downgrade a finalized matchup",
          scoringPeriod: row.scoringPeriod,
        },
        season: row.season,
      },
    ];
  });
}

async function upsertLeague(
  db: Db,
  league: NormalizedLeague,
): Promise<LeagueUpsertResult> {
  const [changed] = await db
    .insert(leagues)
    .values({
      provider: league.provider,
      providerLeagueId: league.providerId,
      name: league.name,
      season: league.season,
      sport: league.sport,
      scoringType: league.scoringType,
      scoringSettings: league.scoringSettings ?? {},
      size: league.size,
      currentScoringPeriod: league.currentScoringPeriod,
      status: league.status,
    })
    .onConflictDoUpdate({
      target: [leagues.provider, leagues.providerLeagueId],
      set: {
        currentScoringPeriod: sql`excluded.current_scoring_period`,
        name: sql`excluded.name`,
        scoringSettings: sql`excluded.scoring_settings`,
        scoringType: sql`excluded.scoring_type`,
        season: sql`excluded.season`,
        size: sql`excluded.size`,
        sport: sql`excluded.sport`,
        status: sql`
          case
            when ${leagues.season} = excluded.season
              and ${leagues.status} = 'complete'
              and excluded.status <> 'complete'
              then ${leagues.status}
            else excluded.status
          end
        `,
        updatedAt: sql`now()`,
      },
      where: sql`
        ${leagues.name} is distinct from excluded.name
        or ${leagues.season} is distinct from excluded.season
        or ${leagues.sport} is distinct from excluded.sport
        or ${leagues.scoringType} is distinct from excluded.scoring_type
        or ${leagues.scoringSettings} is distinct from excluded.scoring_settings
        or ${leagues.size} is distinct from excluded.size
        or ${leagues.currentScoringPeriod} is distinct from excluded.current_scoring_period
        or (
          not (
            ${leagues.season} = excluded.season
            and ${leagues.status} = 'complete'
            and excluded.status <> 'complete'
          )
          and ${leagues.status} is distinct from excluded.status
        )
      `,
    })
    .returning({ id: leagues.id });

  if (changed) {
    return { id: changed.id, changed: 1 };
  }

  const [existing] = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(
      and(
        eq(leagues.provider, league.provider),
        eq(leagues.providerLeagueId, league.providerId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("league upsert did not return or find the target league");
  }

  return { id: existing.id, changed: 0 };
}

async function upsertTeams(
  tx: LeagueScopedTx,
  leagueId: string,
  teams: readonly NormalizedTeam[],
): Promise<EntitySyncStats> {
  if (teams.length === 0) {
    return stats(0, 0);
  }

  const rows = teams.map((team) => {
    const ownerMemberIds = sortedUnique(team.ownerMemberIds);
    return {
      abbrev: team.abbrev,
      contentHash: stableContentHash({
        ...teamHashPayload(team),
        ownerMemberIds,
      }),
      division: team.division ?? null,
      leagueId,
      leagueProviderId: team.leagueProviderId,
      logo: team.logo ?? null,
      losses: team.record.losses,
      name: team.name,
      ownerMemberIds,
      pointsAgainst: team.record.pointsAgainst,
      pointsFor: team.record.pointsFor,
      provider: team.provider,
      providerTeamId: team.providerId,
      season: team.season,
      ties: team.record.ties,
      wins: team.record.wins,
    };
  });

  const changed = await tx
    .insert(fantasyTeams)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        fantasyTeams.provider,
        fantasyTeams.leagueProviderId,
        fantasyTeams.providerTeamId,
        fantasyTeams.season,
      ],
      set: {
        abbrev: sql`excluded.abbrev`,
        contentHash: sql`excluded.content_hash`,
        division: sql`excluded.division`,
        losses: sql`excluded.losses`,
        logo: sql`excluded.logo`,
        name: sql`excluded.name`,
        ownerMemberIds: sql`excluded.owner_member_ids`,
        pointsAgainst: sql`excluded.points_against`,
        pointsFor: sql`excluded.points_for`,
        ties: sql`excluded.ties`,
        updatedAt: sql`now()`,
        wins: sql`excluded.wins`,
      },
      where: sql`${fantasyTeams.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: fantasyTeams.id });

  return stats(rows.length, changed.length);
}

async function upsertMembers(
  tx: LeagueScopedTx,
  leagueId: string,
  members: readonly NormalizedMember[],
): Promise<EntitySyncStats> {
  if (members.length === 0) {
    return stats(0, 0);
  }

  const rows = members.map((member) => ({
    contentHash: stableContentHash(memberHashPayload(member)),
    displayName: member.displayName,
    leagueId,
    leagueProviderId: member.leagueProviderId,
    provider: member.provider,
    providerMemberId: member.providerId,
    role: member.role ?? "unknown",
    season: member.season,
  }));

  const changed = await tx
    .insert(fantasyMembers)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        fantasyMembers.provider,
        fantasyMembers.leagueProviderId,
        fantasyMembers.providerMemberId,
        fantasyMembers.season,
      ],
      set: {
        contentHash: sql`excluded.content_hash`,
        displayName: sql`excluded.display_name`,
        role: sql`excluded.role`,
        updatedAt: sql`now()`,
      },
      where: sql`${fantasyMembers.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: fantasyMembers.id });

  return stats(rows.length, changed.length);
}

function seasonsForFreshRows<T extends { season: number }>(
  rows: readonly T[],
  explicit?: readonly number[],
): number[] {
  return [...new Set([...(explicit ?? []), ...rows.map((row) => row.season)])]
    .filter((season) => Number.isInteger(season) && season > 0)
    .sort((left, right) => left - right);
}

function idsForSeason<T extends { season: number }>(
  rows: readonly T[],
  season: number,
  idFor: (row: T) => string,
): string[] {
  return sortedUnique(
    rows.filter((row) => row.season === season).map((row) => idFor(row)),
  );
}

function playerIdentityKey({
  leagueProviderId,
  provider,
  providerPlayerId,
}: {
  leagueProviderId: string;
  provider: string;
  providerPlayerId: string;
}): string {
  return `${provider}:${leagueProviderId}:${providerPlayerId}`;
}

function collectNormalizedPlayers({
  draftPicks,
  leagueProviderId,
  players,
  rosters,
}: {
  draftPicks: readonly NormalizedDraftPick[];
  leagueProviderId: string;
  players: readonly NormalizedPlayer[];
  rosters: readonly NormalizedRoster[];
}): NormalizedPlayer[] {
  const byIdentity = new Map<string, NormalizedPlayer>();
  const add = (player: NormalizedPlayer | undefined) => {
    if (
      !player ||
      player.providerId.length === 0 ||
      player.fullName.length === 0
    ) {
      return;
    }
    const playerLeagueProviderId = player.leagueProviderId ?? leagueProviderId;
    const key = playerIdentityKey({
      leagueProviderId: playerLeagueProviderId,
      provider: player.provider,
      providerPlayerId: player.providerId,
    });
    const existing = byIdentity.get(key);
    byIdentity.set(key, {
      ...existing,
      ...player,
      leagueProviderId: playerLeagueProviderId,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(player.metadata ?? {}),
      },
      status: player.status ?? existing?.status,
    });
  };

  for (const player of players) {
    add(player);
  }
  for (const roster of rosters) {
    for (const entry of roster.entries) {
      add(entry.player);
    }
  }
  for (const pick of draftPicks) {
    add(pick.player);
  }

  return [...byIdentity.values()].sort((left, right) =>
    left.providerId.localeCompare(right.providerId),
  );
}

async function reconcileImportedMembers({
  leagueId,
  leagueProviderId,
  members,
  seasons,
  tx,
}: {
  leagueId: string;
  leagueProviderId: string;
  members: readonly NormalizedMember[];
  seasons: readonly number[];
  tx: LeagueScopedTx;
}): Promise<void> {
  for (const season of seasons) {
    const provider = members.find(
      (member) => member.season === season,
    )?.provider;
    if (!provider) {
      continue;
    }
    const providerMemberIds = idsForSeason(
      members,
      season,
      (member) => member.providerId,
    );
    if (providerMemberIds.length === 0) {
      await tx
        .delete(fantasyMembers)
        .where(
          and(
            eq(fantasyMembers.leagueId, leagueId),
            eq(fantasyMembers.provider, provider),
            eq(fantasyMembers.leagueProviderId, leagueProviderId),
            eq(fantasyMembers.season, season),
          ),
        );
      continue;
    }

    await tx
      .delete(fantasyMembers)
      .where(
        and(
          eq(fantasyMembers.leagueId, leagueId),
          eq(fantasyMembers.provider, provider),
          eq(fantasyMembers.leagueProviderId, leagueProviderId),
          eq(fantasyMembers.season, season),
          notInArray(fantasyMembers.providerMemberId, providerMemberIds),
        ),
      );
  }
}

async function reconcileImportedTeams({
  leagueId,
  leagueProviderId,
  teams,
  seasons,
  tx,
}: {
  leagueId: string;
  leagueProviderId: string;
  seasons: readonly number[];
  teams: readonly NormalizedTeam[];
  tx: LeagueScopedTx;
}): Promise<void> {
  for (const season of seasons) {
    const provider = teams.find((team) => team.season === season)?.provider;
    if (!provider) {
      continue;
    }
    const providerTeamIds = idsForSeason(
      teams,
      season,
      (team) => team.providerId,
    );
    if (providerTeamIds.length === 0) {
      await tx
        .delete(fantasyTeams)
        .where(
          and(
            eq(fantasyTeams.leagueId, leagueId),
            eq(fantasyTeams.provider, provider),
            eq(fantasyTeams.leagueProviderId, leagueProviderId),
            eq(fantasyTeams.season, season),
          ),
        );
      await tx
        .delete(teamSeasons)
        .where(
          and(
            eq(teamSeasons.leagueId, leagueId),
            eq(teamSeasons.provider, provider),
            eq(teamSeasons.leagueProviderId, leagueProviderId),
            eq(teamSeasons.season, season),
          ),
        );
      continue;
    }

    await tx
      .delete(fantasyTeams)
      .where(
        and(
          eq(fantasyTeams.leagueId, leagueId),
          eq(fantasyTeams.provider, provider),
          eq(fantasyTeams.leagueProviderId, leagueProviderId),
          eq(fantasyTeams.season, season),
          notInArray(fantasyTeams.providerTeamId, providerTeamIds),
        ),
      );
    await tx
      .delete(teamSeasons)
      .where(
        and(
          eq(teamSeasons.leagueId, leagueId),
          eq(teamSeasons.provider, provider),
          eq(teamSeasons.leagueProviderId, leagueProviderId),
          eq(teamSeasons.season, season),
          notInArray(teamSeasons.providerTeamId, providerTeamIds),
        ),
      );
  }
}

async function reconcileImportedRosters({
  leagueId,
  leagueProviderId,
  provider,
  rosters,
  seasons,
  tx,
}: {
  leagueId: string;
  leagueProviderId: string;
  provider: NormalizedLeague["provider"];
  rosters: readonly NormalizedRoster[];
  seasons: readonly number[];
  tx: LeagueScopedTx;
}): Promise<void> {
  for (const season of seasons) {
    const seasonRosters = rosters.filter((roster) => roster.season === season);
    const validKeys = new Set(
      seasonRosters.flatMap((roster) =>
        roster.entries.map((entry) =>
          [
            roster.teamRef.providerId,
            String(roster.scoringPeriod),
            entry.playerRef.providerId,
          ].join(":"),
        ),
      ),
    );
    if (validKeys.size === 0) {
      await tx
        .delete(fantasyRosterEntries)
        .where(
          and(
            eq(fantasyRosterEntries.leagueId, leagueId),
            eq(fantasyRosterEntries.provider, provider),
            eq(fantasyRosterEntries.leagueProviderId, leagueProviderId),
            eq(fantasyRosterEntries.season, season),
          ),
        );
      continue;
    }

    const existingRows = await tx
      .select({
        id: fantasyRosterEntries.id,
        providerPlayerId: fantasyRosterEntries.providerPlayerId,
        providerTeamId: fantasyRosterEntries.providerTeamId,
        scoringPeriod: fantasyRosterEntries.scoringPeriod,
      })
      .from(fantasyRosterEntries)
      .where(
        and(
          eq(fantasyRosterEntries.leagueId, leagueId),
          eq(fantasyRosterEntries.provider, provider),
          eq(fantasyRosterEntries.leagueProviderId, leagueProviderId),
          eq(fantasyRosterEntries.season, season),
        ),
      );
    const staleIds = existingRows
      .filter(
        (row) =>
          !validKeys.has(
            [
              row.providerTeamId,
              String(row.scoringPeriod),
              row.providerPlayerId,
            ].join(":"),
          ),
      )
      .map((row) => row.id);
    if (staleIds.length > 0) {
      await tx
        .delete(fantasyRosterEntries)
        .where(inArray(fantasyRosterEntries.id, staleIds));
    }
  }
}

async function reconcileImportedDraftPicks({
  draftPicks,
  leagueId,
  leagueProviderId,
  provider,
  seasons,
  tx,
}: {
  draftPicks: readonly NormalizedDraftPick[];
  leagueId: string;
  leagueProviderId: string;
  provider: NormalizedLeague["provider"];
  seasons: readonly number[];
  tx: LeagueScopedTx;
}): Promise<void> {
  for (const season of seasons) {
    const providerPickIds = idsForSeason(
      draftPicks,
      season,
      (pick) => pick.providerId,
    );
    if (providerPickIds.length === 0) {
      await tx
        .delete(fantasyDraftPicks)
        .where(
          and(
            eq(fantasyDraftPicks.leagueId, leagueId),
            eq(fantasyDraftPicks.provider, provider),
            eq(fantasyDraftPicks.leagueProviderId, leagueProviderId),
            eq(fantasyDraftPicks.season, season),
          ),
        );
      continue;
    }

    await tx
      .delete(fantasyDraftPicks)
      .where(
        and(
          eq(fantasyDraftPicks.leagueId, leagueId),
          eq(fantasyDraftPicks.provider, provider),
          eq(fantasyDraftPicks.leagueProviderId, leagueProviderId),
          eq(fantasyDraftPicks.season, season),
          notInArray(fantasyDraftPicks.providerPickId, providerPickIds),
        ),
      );
  }
}

async function reconcileImportedTransactions({
  leagueId,
  leagueProviderId,
  provider,
  transactions,
  seasons,
  tx,
}: {
  leagueId: string;
  leagueProviderId: string;
  provider: NormalizedLeague["provider"];
  transactions: readonly NormalizedTransaction[];
  seasons: readonly number[];
  tx: LeagueScopedTx;
}): Promise<void> {
  for (const season of seasons) {
    const providerTransactionIds = idsForSeason(
      transactions,
      season,
      (transaction) => transaction.providerId,
    );
    if (providerTransactionIds.length === 0) {
      await tx
        .delete(fantasyTransactions)
        .where(
          and(
            eq(fantasyTransactions.leagueId, leagueId),
            eq(fantasyTransactions.provider, provider),
            eq(fantasyTransactions.leagueProviderId, leagueProviderId),
            eq(fantasyTransactions.season, season),
          ),
        );
      continue;
    }

    await tx
      .delete(fantasyTransactions)
      .where(
        and(
          eq(fantasyTransactions.leagueId, leagueId),
          eq(fantasyTransactions.provider, provider),
          eq(fantasyTransactions.leagueProviderId, leagueProviderId),
          eq(fantasyTransactions.season, season),
          notInArray(
            fantasyTransactions.providerTransactionId,
            providerTransactionIds,
          ),
        ),
      );
  }
}

async function reconcileImportedProviderTruth({
  draftPicks,
  leagueId,
  leagueProviderId,
  members,
  provider,
  reconcileSeasons,
  rosters,
  teams,
  transactions,
  tx,
}: {
  draftPicks: readonly NormalizedDraftPick[];
  leagueId: string;
  leagueProviderId: string;
  members: readonly NormalizedMember[];
  provider: NormalizedLeague["provider"];
  reconcileSeasons?: PersistNormalizedLeagueRowsInput["reconcileSeasons"];
  rosters: readonly NormalizedRoster[];
  teams: readonly NormalizedTeam[];
  transactions: readonly NormalizedTransaction[];
  tx: LeagueScopedTx;
}): Promise<void> {
  await reconcileImportedMembers({
    leagueId,
    leagueProviderId,
    members,
    seasons: seasonsForFreshRows(members, reconcileSeasons?.members),
    tx,
  });
  await reconcileImportedTeams({
    leagueId,
    leagueProviderId,
    seasons: seasonsForFreshRows(teams, reconcileSeasons?.teams),
    teams,
    tx,
  });
  await reconcileImportedRosters({
    leagueId,
    leagueProviderId,
    provider,
    rosters,
    seasons: seasonsForFreshRows(rosters, reconcileSeasons?.rosters),
    tx,
  });
  await reconcileImportedDraftPicks({
    draftPicks,
    leagueId,
    leagueProviderId,
    provider,
    seasons: seasonsForFreshRows(draftPicks, reconcileSeasons?.draftPicks),
    tx,
  });
  await reconcileImportedTransactions({
    leagueId,
    leagueProviderId,
    provider,
    seasons: seasonsForFreshRows(transactions, reconcileSeasons?.transactions),
    transactions,
    tx,
  });
}

async function cleanupOrphanFantasyPlayers({
  leagueId,
  leagueProviderId,
  tx,
}: {
  leagueId: string;
  leagueProviderId: string;
  tx: LeagueScopedTx;
}): Promise<void> {
  await tx.execute(sql`
    delete from fantasy_players player
    where player.league_id = ${leagueId}
      and player.league_provider_id = ${leagueProviderId}
      and not exists (
        select 1 from fantasy_roster_entries roster
        where roster.league_id = player.league_id
          and roster.provider = player.provider
          and roster.league_provider_id = player.league_provider_id
          and roster.provider_player_id = player.provider_player_id
      )
      and not exists (
        select 1 from fantasy_draft_picks pick
        where pick.league_id = player.league_id
          and pick.provider = player.provider
          and pick.league_provider_id = player.league_provider_id
          and pick.provider_player_id = player.provider_player_id
      )
      and not exists (
        select 1 from fantasy_transactions txn
        where txn.league_id = player.league_id
          and txn.provider = player.provider
          and txn.league_provider_id = player.league_provider_id
          and txn.player_provider_ids ? player.provider_player_id
      )
  `);
}

async function upsertMatchups(
  tx: LeagueScopedTx,
  leagueId: string,
  matchups: readonly NormalizedMatchup[],
): Promise<MatchupUpsertResult> {
  if (matchups.length === 0) {
    return { changedIds: [], scoringPeriods: [], stats: stats(0, 0) };
  }

  const matchupSeasons = [
    ...new Set(matchups.map((matchup) => matchup.season)),
  ].sort((left, right) => left - right);
  const settingsRows =
    matchupSeasons.length === 0
      ? []
      : await tx
          .select()
          .from(leagueSeasonSettings)
          .where(
            and(
              eq(leagueSeasonSettings.leagueId, leagueId),
              inArray(leagueSeasonSettings.season, matchupSeasons),
            ),
          );
  const settingsBySeason = new Map(
    settingsRows.map((setting) => [setting.season, setting]),
  );
  let rows: MatchupUpsertRow[] = matchups.map((matchup) => ({
    awayScore: matchup.awayScore ?? 0,
    awayTeamProviderId: matchup.awayTeamRef?.providerId ?? null,
    contentHash: stableContentHash(matchupHashPayload(matchup)),
    homeScore: matchup.homeScore,
    homeTeamProviderId: matchup.homeTeamRef.providerId,
    kind: matchup.kind ?? "head_to_head",
    leagueId,
    leagueProviderId: matchup.leagueProviderId,
    periodStart: matchup.periodStart ?? matchup.scoringPeriod,
    provider: matchup.provider,
    providerMatchupId: matchup.providerId,
    scoringPeriod: matchup.scoringPeriod,
    scoringPeriodSpan: settingDerivedScoringPeriodSpan(
      matchup,
      settingsBySeason.get(matchup.season),
    ),
    season: matchup.season,
    status: matchup.status,
    winner: matchup.winner,
  }));
  rows = rows.map((row) => ({
    ...row,
    contentHash: stableContentHash(matchupRowHashPayload(row)),
  }));
  rows = await preserveStickyMatchupEdits(tx, leagueId, rows);
  const regressionNotes = await finalizedMatchupRegressionNotes(
    tx,
    leagueId,
    rows,
  );

  const changed = await tx
    .insert(fantasyMatchups)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        fantasyMatchups.provider,
        fantasyMatchups.leagueProviderId,
        fantasyMatchups.providerMatchupId,
        fantasyMatchups.season,
        fantasyMatchups.scoringPeriod,
      ],
      set: {
        awayScore: sql`excluded.away_score`,
        awayTeamProviderId: sql`excluded.away_team_provider_id`,
        contentHash: sql`excluded.content_hash`,
        homeScore: sql`excluded.home_score`,
        homeTeamProviderId: sql`excluded.home_team_provider_id`,
        kind: sql`excluded.kind`,
        periodStart: sql`excluded.period_start`,
        scoringPeriodSpan: sql`excluded.scoring_period_span`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
        winner: sql`excluded.winner`,
      },
      where: sql`
        ${fantasyMatchups.contentHash} is distinct from excluded.content_hash
        and not (${fantasyMatchups.status} = 'final' and excluded.status <> 'final')
      `,
    })
    .returning({
      id: fantasyMatchups.id,
      scoringPeriod: fantasyMatchups.scoringPeriod,
    });
  await recordFinalizedStateRegressionNotes(tx, leagueId, regressionNotes);

  return {
    changedIds: changed.map((matchup) => matchup.id).sort(),
    scoringPeriods: [
      ...new Set(changed.map((matchup) => matchup.scoringPeriod)),
    ].sort((left, right) => left - right),
    stats: stats(rows.length, changed.length),
  };
}

async function upsertFinalStandings(
  tx: LeagueScopedTx,
  leagueId: string,
  finalStandings: readonly NormalizedFinalStanding[],
): Promise<EntitySyncStats> {
  if (finalStandings.length === 0) {
    return stats(0, 0);
  }

  const rows = finalStandings.map((standing) => ({
    contentHash: stableContentHash(finalStandingHashPayload(standing)),
    division: standing.division ?? null,
    divisionRank: standing.divisionRank ?? null,
    divisionWinner: standing.divisionWinner ?? false,
    finalRank: standing.rank,
    leagueId,
    leagueProviderId: standing.leagueProviderId,
    losses: standing.losses,
    playoffSeed: standing.playoffSeed ?? null,
    pointsAgainst: standing.pointsAgainst,
    pointsFor: standing.pointsFor,
    provider: standing.teamRef.provider,
    providerTeamId: standing.teamRef.providerId,
    rankConfidence: standing.rankConfidence ?? "high",
    rankSource: standing.rankSource ?? "provider_reported",
    season: standing.teamRef.season,
    ties: standing.ties,
    wins: standing.wins,
  }));

  const changed = await tx
    .insert(providerFinalStandings)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        providerFinalStandings.leagueId,
        providerFinalStandings.provider,
        providerFinalStandings.leagueProviderId,
        providerFinalStandings.providerTeamId,
        providerFinalStandings.season,
      ],
      set: {
        contentHash: sql`excluded.content_hash`,
        division: sql`excluded.division`,
        divisionRank: sql`excluded.division_rank`,
        divisionWinner: sql`excluded.division_winner`,
        finalRank: sql`excluded.final_rank`,
        losses: sql`excluded.losses`,
        playoffSeed: sql`excluded.playoff_seed`,
        pointsAgainst: sql`excluded.points_against`,
        pointsFor: sql`excluded.points_for`,
        rankConfidence: sql`excluded.rank_confidence`,
        rankSource: sql`excluded.rank_source`,
        ties: sql`excluded.ties`,
        updatedAt: sql`now()`,
        wins: sql`excluded.wins`,
      },
      where: sql`${providerFinalStandings.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: providerFinalStandings.id });

  return stats(rows.length, changed.length);
}

async function upsertLeagueSeasonSettings(
  tx: LeagueScopedTx,
  leagueId: string,
  league?: NormalizedLeague,
): Promise<EntitySyncStats> {
  if (!league) {
    return emptyStats();
  }

  let row: LeagueSeasonSettingsUpsertRow = {
    acquisitionBudget: league.acquisitionSettings?.acquisitionBudget ?? null,
    acquisitionSettings: league.acquisitionSettings ?? {},
    acquisitionType: league.acquisitionSettings?.acquisitionType ?? null,
    championshipScoringPeriod:
      league.postseason?.championshipScoringPeriod ?? null,
    contentHash: stableContentHash(leagueSeasonSettingsHashPayload(league)),
    isDynastyLeague: league.keeperSettings?.isDynasty ?? false,
    isKeeperLeague: league.keeperSettings?.isKeeper ?? false,
    keeperSettings: league.keeperSettings ?? {},
    leagueId,
    leagueProviderId: league.providerId,
    leagueSize: league.size,
    lineupSlotCounts: league.rosterSettings?.lineupSlotCounts ?? {},
    matchupPeriodCount: league.postseason?.matchupPeriodCount ?? 1,
    playoffMatchupPeriodLength:
      league.postseason?.playoffMatchupPeriodLength ?? null,
    playoffStartScoringPeriod:
      league.postseason?.playoffStartScoringPeriod ?? null,
    playoffTeamCount: league.postseason?.playoffTeamCount ?? null,
    provider: league.provider,
    regularSeasonEndScoringPeriod:
      league.postseason?.regularSeasonEndScoringPeriod ?? null,
    scoringType: league.scoringType,
    scoringSettings: league.scoringSettings ?? {},
    season: league.season,
  };
  row = await preserveStickySeasonSettingEdits(tx, leagueId, row);

  const changed = await tx
    .insert(leagueSeasonSettings)
    .values(row)
    .onConflictDoUpdate({
      target: [
        leagueSeasonSettings.leagueId,
        leagueSeasonSettings.provider,
        leagueSeasonSettings.leagueProviderId,
        leagueSeasonSettings.season,
      ],
      set: {
        acquisitionBudget: sql`excluded.acquisition_budget`,
        acquisitionSettings: sql`excluded.acquisition_settings`,
        acquisitionType: sql`excluded.acquisition_type`,
        championshipScoringPeriod: sql`excluded.championship_scoring_period`,
        contentHash: sql`excluded.content_hash`,
        isDynastyLeague: sql`excluded.is_dynasty_league`,
        isKeeperLeague: sql`excluded.is_keeper_league`,
        keeperSettings: sql`excluded.keeper_settings`,
        leagueSize: sql`excluded.league_size`,
        lineupSlotCounts: sql`excluded.lineup_slot_counts`,
        matchupPeriodCount: sql`excluded.matchup_period_count`,
        playoffMatchupPeriodLength: sql`excluded.playoff_matchup_period_length`,
        playoffStartScoringPeriod: sql`excluded.playoff_start_scoring_period`,
        playoffTeamCount: sql`excluded.playoff_team_count`,
        regularSeasonEndScoringPeriod: sql`excluded.regular_season_end_scoring_period`,
        scoringType: sql`excluded.scoring_type`,
        scoringSettings: sql`excluded.scoring_settings`,
        updatedAt: sql`now()`,
      },
      where: sql`${leagueSeasonSettings.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: leagueSeasonSettings.id });

  return stats(1, changed.length);
}

async function loadNflPlayerMappings(
  tx: LeagueScopedTx,
  provider: NormalizedLeague["provider"],
  providerPlayerIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = sortedUnique(providerPlayerIds);
  if (ids.length === 0) {
    return new Map();
  }
  const providerPlayerIdSql = sql<string>`${nflPlayers.fantasyProviderIds}->>${provider}`;
  const rows = await tx
    .select({
      id: nflPlayers.id,
      providerPlayerId: providerPlayerIdSql,
    })
    .from(nflPlayers)
    .where(inArray(providerPlayerIdSql, ids));
  return new Map(
    rows
      .filter((row) => row.providerPlayerId)
      .map((row) => [row.providerPlayerId, row.id]),
  );
}

async function upsertFantasyPlayers(
  tx: LeagueScopedTx,
  leagueId: string,
  leagueProviderId: string,
  provider: NormalizedLeague["provider"],
  players: readonly NormalizedPlayer[],
): Promise<{
  playerIdByIdentity: Map<string, string>;
  stats: EntitySyncStats;
}> {
  if (players.length === 0) {
    return { playerIdByIdentity: new Map(), stats: emptyStats() };
  }

  const nflPlayerIdByProviderId = await loadNflPlayerMappings(
    tx,
    provider,
    players.map((player) => player.providerId),
  );
  const rows = players.map((player) => {
    const rowLeagueProviderId = player.leagueProviderId ?? leagueProviderId;
    return {
      contentHash: stableContentHash(playerHashPayload(player)),
      fullName: player.fullName,
      leagueId,
      leagueProviderId: rowLeagueProviderId,
      metadata: player.metadata ?? {},
      nflPlayerId: nflPlayerIdByProviderId.get(player.providerId) ?? null,
      position: player.position || "unknown",
      proTeam: player.proTeam ?? null,
      provider: player.provider,
      providerPlayerId: player.providerId,
      status: player.status ?? null,
    };
  });

  const changed = await tx
    .insert(fantasyPlayers)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        fantasyPlayers.leagueId,
        fantasyPlayers.provider,
        fantasyPlayers.leagueProviderId,
        fantasyPlayers.providerPlayerId,
      ],
      set: {
        contentHash: sql`excluded.content_hash`,
        fullName: sql`excluded.full_name`,
        metadata: sql`excluded.metadata`,
        nflPlayerId: sql`excluded.nfl_player_id`,
        position: sql`excluded.position`,
        proTeam: sql`excluded.pro_team`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
      },
      where: sql`${fantasyPlayers.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: fantasyPlayers.id });

  const providerPlayerIds = sortedUnique(
    rows.map((row) => row.providerPlayerId),
  );
  const allRows = await tx
    .select({
      id: fantasyPlayers.id,
      leagueProviderId: fantasyPlayers.leagueProviderId,
      provider: fantasyPlayers.provider,
      providerPlayerId: fantasyPlayers.providerPlayerId,
    })
    .from(fantasyPlayers)
    .where(
      and(
        eq(fantasyPlayers.leagueId, leagueId),
        eq(fantasyPlayers.provider, provider),
        eq(fantasyPlayers.leagueProviderId, leagueProviderId),
        inArray(fantasyPlayers.providerPlayerId, providerPlayerIds),
      ),
    );
  const playerIdByIdentity = new Map(
    allRows.map((row) => [
      playerIdentityKey({
        leagueProviderId: row.leagueProviderId,
        provider: row.provider,
        providerPlayerId: row.providerPlayerId,
      }),
      row.id,
    ]),
  );

  return { playerIdByIdentity, stats: stats(rows.length, changed.length) };
}

async function upsertRosterEntries(
  tx: LeagueScopedTx,
  leagueId: string,
  leagueProviderId: string,
  rosters: readonly NormalizedRoster[],
  playerIdByIdentity: ReadonlyMap<string, string>,
): Promise<EntitySyncStats> {
  const rows = rosters.flatMap((roster) =>
    roster.entries.map((entry) => {
      const playerLeagueProviderId =
        entry.player?.leagueProviderId ?? leagueProviderId;
      return {
        actualPoints: entry.actualPoints ?? entry.points ?? null,
        contentHash: stableContentHash(
          rosterEntryHashPayload({ entry, roster }),
        ),
        fantasyPlayerId:
          playerIdByIdentity.get(
            playerIdentityKey({
              leagueProviderId: playerLeagueProviderId,
              provider: entry.playerRef.provider,
              providerPlayerId: entry.playerRef.providerId,
            }),
          ) ?? null,
        isKeeper: entry.isKeeper ?? false,
        leagueId,
        leagueProviderId,
        metadata: entry.metadata ?? {},
        points: entry.actualPoints ?? entry.points ?? null,
        projectedPoints: entry.projectedPoints ?? null,
        provider: roster.teamRef.provider,
        providerPlayerId: entry.playerRef.providerId,
        providerTeamId: roster.teamRef.providerId,
        scoringPeriod: roster.scoringPeriod,
        season: roster.season,
        slot: entry.slot,
        started: entry.started ?? false,
        status: entry.status,
      };
    }),
  );

  if (rows.length === 0) {
    return emptyStats();
  }

  const changed = await tx
    .insert(fantasyRosterEntries)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        fantasyRosterEntries.leagueId,
        fantasyRosterEntries.provider,
        fantasyRosterEntries.leagueProviderId,
        fantasyRosterEntries.providerTeamId,
        fantasyRosterEntries.season,
        fantasyRosterEntries.scoringPeriod,
        fantasyRosterEntries.providerPlayerId,
      ],
      set: {
        actualPoints: sql`excluded.actual_points`,
        contentHash: sql`excluded.content_hash`,
        fantasyPlayerId: sql`excluded.fantasy_player_id`,
        isKeeper: sql`excluded.is_keeper`,
        metadata: sql`excluded.metadata`,
        points: sql`excluded.points`,
        projectedPoints: sql`excluded.projected_points`,
        slot: sql`excluded.slot`,
        started: sql`excluded.started`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
      },
      where: sql`${fantasyRosterEntries.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: fantasyRosterEntries.id });

  return stats(rows.length, changed.length);
}

async function upsertDraftPicks(
  tx: LeagueScopedTx,
  leagueId: string,
  draftPicks: readonly NormalizedDraftPick[],
  playerIdByIdentity: ReadonlyMap<string, string>,
): Promise<EntitySyncStats> {
  if (draftPicks.length === 0) {
    return emptyStats();
  }

  const rows = draftPicks.map((pick) => ({
    auctionValue: pick.auctionValue ?? null,
    contentHash: stableContentHash(draftPickHashPayload(pick)),
    fantasyPlayerId: pick.playerRef
      ? (playerIdByIdentity.get(
          playerIdentityKey({
            leagueProviderId:
              pick.player?.leagueProviderId ?? pick.leagueProviderId,
            provider: pick.playerRef.provider,
            providerPlayerId: pick.playerRef.providerId,
          }),
        ) ?? null)
      : null,
    isKeeper: pick.isKeeper ?? false,
    leagueId,
    leagueProviderId: pick.leagueProviderId,
    metadata: pick.metadata ?? {},
    pickInRound: pick.pickInRound ?? null,
    pickOverall: pick.pickOverall ?? null,
    provider: pick.provider,
    providerPickId: pick.providerId,
    providerPlayerId: pick.playerRef?.providerId ?? null,
    providerTeamId: pick.teamRef.providerId,
    round: pick.round,
    season: pick.season,
  }));

  const changed = await tx
    .insert(fantasyDraftPicks)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        fantasyDraftPicks.leagueId,
        fantasyDraftPicks.provider,
        fantasyDraftPicks.leagueProviderId,
        fantasyDraftPicks.season,
        fantasyDraftPicks.providerPickId,
      ],
      set: {
        auctionValue: sql`excluded.auction_value`,
        contentHash: sql`excluded.content_hash`,
        fantasyPlayerId: sql`excluded.fantasy_player_id`,
        isKeeper: sql`excluded.is_keeper`,
        metadata: sql`excluded.metadata`,
        pickInRound: sql`excluded.pick_in_round`,
        pickOverall: sql`excluded.pick_overall`,
        providerPlayerId: sql`excluded.provider_player_id`,
        providerTeamId: sql`excluded.provider_team_id`,
        round: sql`excluded.round`,
        updatedAt: sql`now()`,
      },
      where: sql`${fantasyDraftPicks.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: fantasyDraftPicks.id });

  return stats(rows.length, changed.length);
}

async function upsertTransactions(
  tx: LeagueScopedTx,
  leagueId: string,
  transactions: readonly NormalizedTransaction[],
): Promise<TransactionUpsertResult> {
  if (transactions.length === 0) {
    return { changedTransactions: [], stats: emptyStats() };
  }

  const rows = transactions.map((transaction) => ({
    contentHash: stableContentHash(transactionHashPayload(transaction)),
    details: transaction.details,
    leagueId,
    leagueProviderId: transaction.leagueProviderId,
    occurredAt: transaction.timestamp,
    playerProviderIds: sortedUnique(
      transaction.playerRefs.map((player) => player.providerId),
    ),
    provider: transaction.provider,
    providerTransactionId: transaction.providerId,
    scoringPeriod: transaction.scoringPeriod ?? null,
    season: transaction.season,
    teamProviderIds: sortedUnique(
      transaction.teamRefs.map((team) => team.providerId),
    ),
    type: transaction.type,
  }));

  const changed = await tx
    .insert(fantasyTransactions)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        fantasyTransactions.leagueId,
        fantasyTransactions.provider,
        fantasyTransactions.leagueProviderId,
        fantasyTransactions.providerTransactionId,
        fantasyTransactions.season,
      ],
      set: {
        contentHash: sql`excluded.content_hash`,
        details: sql`excluded.details`,
        occurredAt: sql`excluded.occurred_at`,
        playerProviderIds: sql`excluded.player_provider_ids`,
        scoringPeriod: sql`excluded.scoring_period`,
        teamProviderIds: sql`excluded.team_provider_ids`,
        type: sql`excluded.type`,
        updatedAt: sql`now()`,
      },
      where: sql`${fantasyTransactions.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({
      id: fantasyTransactions.id,
      type: fantasyTransactions.type,
    });

  return {
    changedTransactions: changed.map((row) => ({
      id: row.id,
      type: row.type as NormalizedTransaction["type"],
    })),
    stats: stats(rows.length, changed.length),
  };
}

function resolveLeagueProviderId({
  draftPicks,
  explicit,
  finalStandings,
  matchups,
  members,
  teams,
  transactions,
}: {
  draftPicks: readonly NormalizedDraftPick[];
  explicit?: string;
  finalStandings: readonly NormalizedFinalStanding[];
  matchups: readonly NormalizedMatchup[];
  members: readonly NormalizedMember[];
  teams: readonly NormalizedTeam[];
  transactions: readonly NormalizedTransaction[];
}): string {
  const resolved =
    explicit ??
    teams[0]?.leagueProviderId ??
    members[0]?.leagueProviderId ??
    matchups[0]?.leagueProviderId ??
    finalStandings[0]?.leagueProviderId ??
    draftPicks[0]?.leagueProviderId ??
    transactions[0]?.leagueProviderId;

  if (!resolved) {
    throw new Error("normalized rows require a provider league id");
  }

  return resolved;
}

function resolveProvider({
  draftPicks,
  finalStandings,
  league,
  matchups,
  members,
  players,
  rosters,
  teams,
  transactions,
}: {
  draftPicks: readonly NormalizedDraftPick[];
  finalStandings: readonly NormalizedFinalStanding[];
  league?: NormalizedLeague;
  matchups: readonly NormalizedMatchup[];
  members: readonly NormalizedMember[];
  players: readonly NormalizedPlayer[];
  rosters: readonly NormalizedRoster[];
  teams: readonly NormalizedTeam[];
  transactions: readonly NormalizedTransaction[];
}): NormalizedLeague["provider"] {
  const resolved =
    league?.provider ??
    teams[0]?.provider ??
    members[0]?.provider ??
    matchups[0]?.provider ??
    finalStandings[0]?.teamRef.provider ??
    rosters[0]?.teamRef.provider ??
    draftPicks[0]?.provider ??
    players[0]?.provider ??
    transactions[0]?.provider;

  if (!resolved) {
    throw new Error("normalized rows require a provider id");
  }

  return resolved;
}

export async function persistNormalizedLeagueRows({
  db,
  draftPicks = [],
  finalStandings = [],
  league,
  leagueId,
  leagueProviderId,
  matchups,
  members,
  players = [],
  reconcileSeasons,
  rosters = [],
  teams,
  transactions = [],
}: PersistNormalizedLeagueRowsInput): Promise<PersistNormalizedLeagueRowsResult> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const resolvedLeagueProviderId = resolveLeagueProviderId({
      draftPicks,
      explicit: leagueProviderId,
      finalStandings,
      matchups,
      members,
      teams,
      transactions,
    });
    const resolvedProvider = resolveProvider({
      draftPicks,
      finalStandings,
      league,
      matchups,
      members,
      players,
      rosters,
      teams,
      transactions,
    });
    const leagueStatusRegressionNotes =
      await finalizedLeagueStatusRegressionNotes(tx, leagueId, league);
    await recordFinalizedStateRegressionNotes(
      tx,
      leagueId,
      leagueStatusRegressionNotes,
    );
    const teamStats = await upsertTeams(tx, leagueId, teams);
    const memberStats = await upsertMembers(tx, leagueId, members);
    const collectedPlayers = collectNormalizedPlayers({
      draftPicks,
      leagueProviderId: resolvedLeagueProviderId,
      players,
      rosters,
    });
    const playerUpsert = await upsertFantasyPlayers(
      tx,
      leagueId,
      resolvedLeagueProviderId,
      resolvedProvider,
      collectedPlayers,
    );
    await reconcileImportedProviderTruth({
      draftPicks,
      leagueId,
      leagueProviderId: resolvedLeagueProviderId,
      members,
      provider: resolvedProvider,
      reconcileSeasons,
      rosters,
      teams,
      transactions,
      tx,
    });
    const leagueSeasonSettingsStats = await upsertLeagueSeasonSettings(
      tx,
      leagueId,
      league,
    );
    const matchupUpsert = await upsertMatchups(tx, leagueId, matchups);
    const finalStandingStats = await upsertFinalStandings(
      tx,
      leagueId,
      finalStandings,
    );
    const rosterStats = await upsertRosterEntries(
      tx,
      leagueId,
      resolvedLeagueProviderId,
      rosters,
      playerUpsert.playerIdByIdentity,
    );
    const draftPickStats = await upsertDraftPicks(
      tx,
      leagueId,
      draftPicks,
      playerUpsert.playerIdByIdentity,
    );
    const transactionStats = await upsertTransactions(
      tx,
      leagueId,
      transactions,
    );
    await cleanupOrphanFantasyPlayers({
      leagueId,
      leagueProviderId: resolvedLeagueProviderId,
      tx,
    });

    return {
      changedTransactions: transactionStats.changedTransactions,
      changedMatchupIds: matchupUpsert.changedIds,
      changedMatchupScoringPeriods: matchupUpsert.scoringPeriods,
      draftPickStats,
      finalStandingStats,
      leagueSeasonSettingsStats,
      matchupStats: matchupUpsert.stats,
      memberStats,
      playerStats: playerUpsert.stats,
      rosterStats,
      teamStats,
      transactionStats: transactionStats.stats,
    };
  });
}

export interface DataCoverageObservation {
  details?: Record<string, unknown>;
  error?: ProviderError;
  itemCount: number;
  status?: DataCoverageStatus;
}

export type DataCoverageObservationMap = Partial<
  Record<ProviderDataClass, DataCoverageObservation | undefined>
>;

export interface RecordDataCoverageInput {
  capabilities: FantasyProviderCapabilities;
  dataClasses?: readonly ProviderDataClass[];
  db: Db;
  defaultDetails?: Record<string, unknown>;
  leagueId: string;
  observedAt?: Date;
  observations: DataCoverageObservationMap;
  provider: ProviderLeagueRef["provider"];
  providerLeagueId: string;
  season: number;
}

function dataCoverageStatus({
  capability,
  observation,
}: {
  capability: ProviderDataSupport;
  observation?: DataCoverageObservation;
}): DataCoverageStatus {
  if (observation?.error) {
    return "error";
  }
  if (capability === "none") {
    return "unavailable";
  }
  if (!observation) {
    return "stale";
  }
  if (observation.status) {
    return observation.status;
  }
  return capability === "partial" ? "partial" : "complete";
}

function coverageDetails({
  defaultDetails,
  observation,
}: {
  defaultDetails?: Record<string, unknown>;
  observation?: DataCoverageObservation;
}): Record<string, unknown> {
  return {
    ...(defaultDetails ?? {}),
    ...(observation?.details ?? {}),
  };
}

export async function recordDataCoverage({
  capabilities,
  dataClasses,
  db,
  defaultDetails,
  leagueId,
  observedAt = new Date(),
  observations,
  provider,
  providerLeagueId,
  season,
}: RecordDataCoverageInput): Promise<void> {
  const rows = (dataClasses ?? PROVIDER_DATA_CLASSES).map((dataClass) => {
    const observation = observations[dataClass];
    const capability = capabilities.dataClasses[dataClass];
    return {
      capability,
      dataClass,
      details: coverageDetails({ defaultDetails, observation }),
      errorCode: observation?.error?.code ?? null,
      errorMessage: observation?.error?.message ?? null,
      itemCount: observation?.itemCount ?? 0,
      leagueId,
      observedAt,
      provider,
      providerLeagueId,
      season,
      status: dataCoverageStatus({ capability, observation }),
    };
  });
  if (rows.length === 0) {
    return;
  }

  await withLeagueContext(db, leagueId, (tx) =>
    tx
      .insert(dataCoverage)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          dataCoverage.leagueId,
          dataCoverage.provider,
          dataCoverage.providerLeagueId,
          dataCoverage.season,
          dataCoverage.dataClass,
        ],
        set: {
          capability: sql`excluded.capability`,
          details: sql`excluded.details`,
          errorCode: sql`excluded.error_code`,
          errorMessage: sql`excluded.error_message`,
          itemCount: sql`excluded.item_count`,
          observedAt: sql`excluded.observed_at`,
          status: sql`excluded.status`,
          updatedAt: sql`now()`,
        },
      }),
  );
}

function currentLeagueDataClassSet(
  dataClasses: readonly ProviderDataClass[] | undefined,
): ReadonlySet<ProviderDataClass> {
  if (!dataClasses || dataClasses.length === 0) {
    return new Set(PROVIDER_DATA_CLASSES);
  }
  return new Set(dataClasses);
}

function positiveScoringPeriod(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function hasOwnKeys(value: Record<string, unknown> | undefined): boolean {
  return Object.keys(value ?? {}).length > 0;
}

function countKeeperRosterEntries(
  rosters: readonly NormalizedRoster[],
): number {
  return rosters.reduce(
    (total, roster) =>
      total + roster.entries.filter((entry) => entry.isKeeper).length,
    0,
  );
}

export function edgeCaseCoverageObservations({
  finalStandings = [],
  league,
  rosters = [],
  scoringDetailSource,
  teams,
}: {
  finalStandings?: readonly NormalizedFinalStanding[];
  league: NormalizedLeague;
  rosters?: readonly NormalizedRoster[];
  scoringDetailSource: string;
  teams: readonly NormalizedTeam[];
}): DataCoverageObservationMap {
  const teamsWithDivision = teams.filter((team) => team.division).length;
  const standingsWithDivision = finalStandings.filter(
    (standing) =>
      Boolean(standing.division) ||
      Boolean(standing.divisionRank) ||
      Boolean(standing.divisionWinner),
  ).length;
  const divisionItemCount = teamsWithDivision + standingsWithDivision;
  const keeperRosterEntries = countKeeperRosterEntries(rosters);
  const hasKeeperSettings = hasOwnKeys(league.keeperSettings);
  const keeperItemCount = (hasKeeperSettings ? 1 : 0) + keeperRosterEntries;

  return {
    divisions: {
      details: { standingsWithDivision, teamsWithDivision },
      itemCount: divisionItemCount,
      status: divisionItemCount > 0 ? "complete" : "unavailable",
    },
    keeper_dynasty: {
      details: {
        hasKeeperSettings,
        keeperRosterEntries,
      },
      itemCount: keeperItemCount,
      status: keeperItemCount > 0 ? "complete" : "unavailable",
    },
    scoring_detail: {
      details: {
        scoringSettingsKeys: Object.keys(league.scoringSettings ?? {}).sort(),
        scoringType: league.scoringType,
        source: scoringDetailSource,
      },
      itemCount: hasOwnKeys(league.scoringSettings) ? 1 : 0,
    },
  };
}

export async function syncCurrentLeague<Session extends FantasyProviderSession>(
  input: CurrentLeagueSyncInput<Session>,
): Promise<Result<CurrentLeagueSyncResult, CurrentLeagueSyncError>> {
  const { db, provider, ref, session } = input;
  const requestedDataClasses = currentLeagueDataClassSet(input.dataClasses);
  const hasExplicitDataClasses = (input.dataClasses?.length ?? 0) > 0;
  const requestedScoringPeriod = positiveScoringPeriod(
    input.currentScoringPeriod,
  );
  const shouldFetchTeams =
    requestedDataClasses.has("teams") || requestedDataClasses.has("divisions");
  const shouldFetchMembers = requestedDataClasses.has("members");
  const shouldFetchMatchups = requestedDataClasses.has("matchups");
  const shouldFetchRosters =
    requestedDataClasses.has("rosters") ||
    requestedDataClasses.has("keeper_dynasty");
  const shouldFetchTransactions = requestedDataClasses.has("transactions");
  const shouldFetchDraftPicks =
    !hasExplicitDataClasses && provider.getDraftPicks !== undefined;
  const needsScoringPeriod =
    hasExplicitDataClasses &&
    (shouldFetchMatchups || shouldFetchRosters || shouldFetchTransactions) &&
    requestedScoringPeriod === undefined;
  const shouldFetchLeague =
    !hasExplicitDataClasses ||
    !input.leagueId ||
    needsScoringPeriod ||
    requestedDataClasses.has("league") ||
    requestedDataClasses.has("keeper_dynasty") ||
    requestedDataClasses.has("scoring_detail");

  const league = shouldFetchLeague
    ? await provider.getLeague(session, ref)
    : undefined;
  if (league && !league.ok) {
    return err(league.error);
  }

  const leagueValue = league?.value;
  const currentScoringPeriod =
    requestedScoringPeriod ??
    positiveScoringPeriod(leagueValue?.currentScoringPeriod);
  const matchupsScoringPeriod = hasExplicitDataClasses
    ? currentScoringPeriod
    : undefined;

  const [teams, members, matchups] = await Promise.all([
    shouldFetchTeams
      ? provider.getTeams(session, ref)
      : Promise.resolve(ok<readonly NormalizedTeam[]>([])),
    shouldFetchMembers
      ? provider.getMembers(session, ref)
      : Promise.resolve(ok<readonly NormalizedMember[]>([])),
    shouldFetchMatchups
      ? provider.getMatchups(session, ref, matchupsScoringPeriod)
      : Promise.resolve(ok<readonly NormalizedMatchup[]>([])),
  ]);

  if (!teams.ok) {
    return err(teams.error);
  }
  if (!members.ok) {
    return err(members.error);
  }
  if (!matchups.ok) {
    return err(matchups.error);
  }

  let rosters: readonly NormalizedRoster[] = [];
  let rosterFetched = false;
  let rosterObservation: DataCoverageObservation | undefined;
  if (
    shouldFetchRosters &&
    provider.capabilities.dataClasses.rosters !== "none"
  ) {
    if (provider.getRosters) {
      const rosterResult = await provider.getRosters(
        session,
        ref,
        currentScoringPeriod,
      );
      if (rosterResult.ok) {
        rosters = rosterResult.value;
        rosterFetched = true;
        const itemCount = rosterResult.value.reduce(
          (total, roster) => total + roster.entries.length,
          0,
        );
        rosterObservation = {
          details: { rosterCount: rosterResult.value.length },
          itemCount,
          ...(itemCount === 0 ? { status: "unavailable" as const } : {}),
        };
      } else {
        rosterObservation = {
          error: rosterResult.error,
          itemCount: 0,
        };
      }
    } else {
      rosterObservation = {
        details: { reason: "adapter_method_missing" },
        itemCount: 0,
        status: "unavailable",
      };
    }
  }

  let transactions: readonly NormalizedTransaction[] = [];
  let transactionFetched = false;
  let transactionObservation: DataCoverageObservation | undefined;
  if (shouldFetchTransactions) {
    if (provider.capabilities.dataClasses.transactions !== "none") {
      const transactionResult = await provider.getTransactions(
        session,
        ref,
        currentScoringPeriod,
      );
      if (transactionResult.ok) {
        transactions = transactionResult.value;
        transactionFetched = true;
        transactionObservation = {
          details: { transactionCount: transactionResult.value.length },
          itemCount: transactionResult.value.length,
          ...(transactionResult.value.length === 0
            ? { status: "unavailable" as const }
            : {}),
        };
      } else {
        transactionObservation = {
          error: transactionResult.error,
          itemCount: 0,
        };
      }
    } else {
      transactionObservation = {
        details: { reason: "provider_capability_none" },
        itemCount: 0,
        status: "unavailable",
      };
    }
  }

  let draftPicks: readonly NormalizedDraftPick[] = [];
  let draftFetched = false;
  if (shouldFetchDraftPicks && provider.getDraftPicks) {
    const draftResult = await provider.getDraftPicks(session, ref);
    if (draftResult.ok) {
      draftPicks = draftResult.value;
      draftFetched = true;
    }
  }

  const leagueWrite = leagueValue
    ? await upsertLeague(db, leagueValue)
    : { changed: 0, id: input.leagueId };
  if (!leagueWrite.id) {
    throw new Error("current league sync requires a league id");
  }
  const scoped = await persistNormalizedLeagueRows({
    db,
    draftPicks,
    league: leagueValue,
    leagueId: leagueWrite.id,
    leagueProviderId: leagueValue?.providerId ?? ref.providerId,
    matchups: matchups.value,
    members: members.value,
    reconcileSeasons: {
      ...(draftFetched
        ? { draftPicks: [leagueValue?.season ?? ref.season] }
        : {}),
      ...(shouldFetchMembers
        ? { members: [leagueValue?.season ?? ref.season] }
        : {}),
      ...(rosterFetched
        ? { rosters: [leagueValue?.season ?? ref.season] }
        : {}),
      ...(shouldFetchTeams
        ? { teams: [leagueValue?.season ?? ref.season] }
        : {}),
      ...(transactionFetched
        ? { transactions: [leagueValue?.season ?? ref.season] }
        : {}),
    },
    rosters,
    teams: teams.value,
    transactions,
  });

  const observations: DataCoverageObservationMap = {};
  const coverageDataClasses = new Set<ProviderDataClass>(
    hasExplicitDataClasses ? requestedDataClasses : [],
  );
  if (leagueValue) {
    observations.league = { itemCount: 1 };
    coverageDataClasses.add("league");
  }
  if (shouldFetchTeams) {
    observations.teams = { itemCount: teams.value.length };
    coverageDataClasses.add("teams");
  }
  if (shouldFetchMembers) {
    observations.members = { itemCount: members.value.length };
    coverageDataClasses.add("members");
  }
  if (shouldFetchRosters) {
    observations.rosters = rosterObservation;
    coverageDataClasses.add("rosters");
  }
  if (shouldFetchMatchups) {
    observations.matchups = { itemCount: matchups.value.length };
    coverageDataClasses.add("matchups");
  }
  if (shouldFetchTransactions) {
    observations.transactions = transactionObservation;
    coverageDataClasses.add("transactions");
  }
  const edgeCaseObservations = leagueValue
    ? edgeCaseCoverageObservations({
        league: leagueValue,
        rosters,
        scoringDetailSource: "current.league.scoringSettings",
        teams: teams.value,
      })
    : {};
  if (
    leagueValue &&
    (!hasExplicitDataClasses ||
      requestedDataClasses.has("league") ||
      requestedDataClasses.has("scoring_detail"))
  ) {
    observations.scoring_detail = edgeCaseObservations.scoring_detail;
    coverageDataClasses.add("scoring_detail");
  }
  if (
    shouldFetchTeams &&
    (!hasExplicitDataClasses ||
      requestedDataClasses.has("teams") ||
      requestedDataClasses.has("divisions"))
  ) {
    observations.divisions = edgeCaseObservations.divisions;
    coverageDataClasses.add("divisions");
  }
  if (
    leagueValue &&
    shouldFetchRosters &&
    (!hasExplicitDataClasses ||
      requestedDataClasses.has("rosters") ||
      requestedDataClasses.has("keeper_dynasty"))
  ) {
    observations.keeper_dynasty = edgeCaseObservations.keeper_dynasty;
    coverageDataClasses.add("keeper_dynasty");
  }

  await recordDataCoverage({
    capabilities: provider.capabilities,
    dataClasses: hasExplicitDataClasses ? [...coverageDataClasses] : undefined,
    db,
    defaultDetails: { sync: "current" },
    leagueId: leagueWrite.id,
    observations,
    provider: leagueValue?.provider ?? ref.provider,
    providerLeagueId: leagueValue?.providerId ?? ref.providerId,
    season: leagueValue?.season ?? ref.season,
  });

  const changedFinalMatchups = await loadChangedFinalMatchups({
    db,
    leagueId: leagueWrite.id,
    matchupIds: scoped.changedMatchupIds,
  });
  await publishScoresUpdated({
    input,
    leagueId: leagueWrite.id,
    matchupIds: scoped.changedMatchupIds,
    scoringPeriods: scoped.changedMatchupScoringPeriods,
  });
  const recompute = await (
    input.recomputeChangedMatchups ?? recomputeChangedMatchupStatistics
  )(db, {
    leagueId: leagueWrite.id,
    matchupIds: scoped.changedMatchupIds,
  });
  const recordLoreClaims =
    recompute.recordBrokenHooks.length > 0
      ? await seedRecordBrokenLoreHooks({
          db,
          hooks: recompute.recordBrokenHooks,
          leagueId: leagueWrite.id,
          now: input.now,
          realtime: input.realtime,
        })
      : [];

  return ok({
    changedFinalMatchups,
    changedTransactions: scoped.changedTransactions,
    recordBrokenHooks: recompute.recordBrokenHooks,
    recordLoreClaims,
    league: {
      id: leagueWrite.id,
      provider: leagueValue?.provider ?? ref.provider,
      providerLeagueId: leagueValue?.providerId ?? ref.providerId,
      season: leagueValue?.season ?? ref.season,
      changed: leagueWrite.changed,
      unchanged: 1 - leagueWrite.changed,
    },
    teams: scoped.teamStats,
    members: scoped.memberStats,
    matchups: scoped.matchupStats,
    players: scoped.playerStats,
    rosters: scoped.rosterStats,
    draftPicks: scoped.draftPickStats,
    transactions: scoped.transactionStats,
  });
}
