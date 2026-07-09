import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, not, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  fantasyDraftPicks,
  fantasyMatchups,
  fantasyPlayers,
  fantasyRosterEntries,
  identityMappings,
  leagueCurationCheckpoints,
  leagueCurationSeasonPushes,
  leagueDataEdits,
  leagueGroupingSeasons,
  leagueSeasonGroupings,
  leagueSeasonSettings,
  persons,
  teamSeasons,
  weeklyStatistics,
} from "@/db/schema";

type PersonRow = typeof persons.$inferSelect;
type TeamSeasonRow = typeof teamSeasons.$inferSelect;
type IdentityMappingRow = typeof identityMappings.$inferSelect;
type SeasonSettingsRow = typeof leagueSeasonSettings.$inferSelect;
type MatchupRow = typeof fantasyMatchups.$inferSelect;
type WeeklyStatisticsRow = typeof weeklyStatistics.$inferSelect;
type GroupingRow = typeof leagueSeasonGroupings.$inferSelect;
type CheckpointRow = typeof leagueCurationCheckpoints.$inferSelect;
type SeasonPushRow = typeof leagueCurationSeasonPushes.$inferSelect;
type FantasyPlayerRow = typeof fantasyPlayers.$inferSelect;
type FantasyRosterEntryRow = typeof fantasyRosterEntries.$inferSelect;
type FantasyDraftPickRow = typeof fantasyDraftPicks.$inferSelect;

interface TimestampedSnapshot {
  createdAt: string;
  updatedAt?: string;
}

export interface CuratedPersonSnapshot extends TimestampedSnapshot {
  canonicalName: string;
  id: string;
  ownerHistory: PersonRow["ownerHistory"];
}

export interface CuratedTeamSeasonSnapshot extends TimestampedSnapshot {
  division: string | null;
  fantasyTeamId: string;
  id: string;
  leagueProviderId: string;
  ownerMemberIds: string[];
  ownerNames: string[];
  provider: TeamSeasonRow["provider"];
  providerTeamId: string;
  season: number;
  teamName: string;
}

export interface CuratedIdentityMappingSnapshot extends TimestampedSnapshot {
  confidence: number;
  id: string;
  leagueProviderId: string;
  method: IdentityMappingRow["method"];
  personId: string;
  provider: IdentityMappingRow["provider"];
  providerTeamId: string;
  resolvedBy: string;
  season: number;
  teamSeasonId: string;
}

export interface CuratedSeasonSettingsSnapshot extends TimestampedSnapshot {
  acquisitionBudget: number | null;
  acquisitionSettings: Record<string, unknown>;
  acquisitionType: string | null;
  championshipScoringPeriod: number | null;
  contentHash: string;
  id: string;
  isDynastyLeague: boolean;
  isKeeperLeague: boolean;
  keeperSettings: Record<string, unknown>;
  leagueProviderId: string;
  leagueSize: number;
  lineupSlotCounts: Record<string, number>;
  matchupPeriodCount: number;
  playoffMatchupPeriodLength: number | null;
  playoffStartScoringPeriod: number | null;
  playoffTeamCount: number | null;
  provider: SeasonSettingsRow["provider"];
  regularSeasonEndScoringPeriod: number | null;
  scoringSettings: Record<string, unknown>;
  scoringType: string;
  season: number;
}

export interface CuratedMatchupSnapshot extends TimestampedSnapshot {
  awayScore: number;
  awayTeamProviderId: string | null;
  contentHash: string;
  homeScore: number;
  homeTeamProviderId: string;
  id: string;
  kind: MatchupRow["kind"];
  leagueProviderId: string;
  periodStart: number | null;
  provider: MatchupRow["provider"];
  providerMatchupId: string;
  scoringPeriod: number;
  scoringPeriodSpan: number;
  season: number;
  status: MatchupRow["status"];
  winner: MatchupRow["winner"];
}

export interface CuratedWeeklyStatSnapshot extends TimestampedSnapshot {
  id: string;
  isBottomScorer: boolean;
  isChampionship: boolean;
  isPlayoff: boolean;
  isTopScorer: boolean;
  margin: number;
  matchupId: string;
  matchupKind: WeeklyStatisticsRow["matchupKind"];
  opponentPersonId: string | null;
  periodStart: number | null;
  personId: string;
  pointsAgainst: number;
  pointsFor: number;
  result: WeeklyStatisticsRow["result"];
  scoringPeriod: number;
  scoringPeriodSpan: number;
  season: number;
  teamSeasonId: string;
  weeklyRank: number;
}

export interface CuratedFantasyPlayerSnapshot extends TimestampedSnapshot {
  contentHash: string;
  fullName: string;
  id: string;
  leagueProviderId: string;
  metadata: Record<string, unknown>;
  nflPlayerId: string | null;
  position: string;
  proTeam: string | null;
  provider: FantasyPlayerRow["provider"];
  providerPlayerId: string;
  status: string | null;
}

export interface CuratedFantasyRosterEntrySnapshot extends TimestampedSnapshot {
  actualPoints: number | null;
  contentHash: string;
  fantasyPlayerId: string | null;
  id: string;
  isKeeper: boolean;
  leagueProviderId: string;
  metadata: Record<string, unknown>;
  points: number | null;
  projectedPoints: number | null;
  provider: FantasyRosterEntryRow["provider"];
  providerPlayerId: string;
  providerTeamId: string;
  scoringPeriod: number;
  season: number;
  slot: string;
  started: boolean;
  status: string;
}

export interface CuratedFantasyDraftPickSnapshot extends TimestampedSnapshot {
  auctionValue: number | null;
  contentHash: string;
  fantasyPlayerId: string | null;
  id: string;
  isKeeper: boolean;
  leagueProviderId: string;
  metadata: Record<string, unknown>;
  pickInRound: number | null;
  pickOverall: number | null;
  provider: FantasyDraftPickRow["provider"];
  providerPickId: string;
  providerPlayerId: string | null;
  providerTeamId: string;
  round: number;
  season: number;
}

export interface CuratedGroupingSnapshot {
  config: GroupingRow["config"];
  confirmedByUserId: string | null;
  createdAt: string;
  derivedFrom: Record<string, unknown>;
  id: string;
  kind: string;
  name: string;
  ordinal: number;
  seasons: number[];
  status: GroupingRow["status"];
}

export interface CuratedSeasonSnapshot {
  capturedAt: string;
  editIds: string[];
  fantasyDraftPicks?: CuratedFantasyDraftPickSnapshot[];
  fantasyPlayers?: CuratedFantasyPlayerSnapshot[];
  fantasyRosterEntries?: CuratedFantasyRosterEntrySnapshot[];
  groupings: CuratedGroupingSnapshot[];
  identityMappings: CuratedIdentityMappingSnapshot[];
  latestEditId: string | null;
  leagueId: string;
  matchups: CuratedMatchupSnapshot[];
  persons: CuratedPersonSnapshot[];
  season: number;
  seasonSettings: CuratedSeasonSettingsSnapshot[];
  teamSeasons: CuratedTeamSeasonSnapshot[];
  weeklyStatistics: CuratedWeeklyStatSnapshot[];
}

export interface CuratedLeagueSnapshot {
  capturedAt: string;
  editIds: string[];
  latestEditId: string | null;
  leagueId: string;
  seasonSnapshots: CuratedSeasonSnapshot[];
  seasons: number[];
}

export interface CurationCheckpoint {
  actorUserId: string | null;
  createdAt: string;
  editIds: string[];
  id: string;
  label: string | null;
  latestEditId: string | null;
  leagueId: string;
  markerEditId: string | null;
  note: string | null;
  seasons: number[];
  snapshot: CuratedLeagueSnapshot;
  snapshotHash: string;
}

export interface CurationCheckpointSummary
  extends Omit<CurationCheckpoint, "snapshot"> {}

export interface CurationSeasonPush {
  actorUserId: string | null;
  checkpointId: string | null;
  createdAt: string;
  editIds: string[];
  id: string;
  latestEditId: string | null;
  leagueId: string;
  markerEditId: string | null;
  reason: string | null;
  season: number;
  snapshot: CuratedSeasonSnapshot;
  snapshotHash: string;
}

export interface ComposedCanonicalSnapshot {
  composedAt: string;
  groupings: Array<CuratedGroupingSnapshot & { snapshotSeason: number }>;
  identityMappings: Array<
    CuratedIdentityMappingSnapshot & { snapshotSeason: number }
  >;
  latestPushes: Array<Omit<CurationSeasonPush, "snapshot">>;
  leagueId: string;
  matchups: Array<CuratedMatchupSnapshot & { snapshotSeason: number }>;
  persons: Array<CuratedPersonSnapshot & { snapshotSeason: number }>;
  fantasyDraftPicks: Array<
    CuratedFantasyDraftPickSnapshot & { snapshotSeason: number }
  >;
  fantasyPlayers: Array<
    CuratedFantasyPlayerSnapshot & { snapshotSeason: number }
  >;
  fantasyRosterEntries: Array<
    CuratedFantasyRosterEntrySnapshot & { snapshotSeason: number }
  >;
  seasonSettings: Array<
    CuratedSeasonSettingsSnapshot & { snapshotSeason: number }
  >;
  seasonSnapshots: CuratedSeasonSnapshot[];
  seasons: number[];
  teamSeasons: Array<CuratedTeamSeasonSnapshot & { snapshotSeason: number }>;
  weeklyStatistics: Array<
    CuratedWeeklyStatSnapshot & { snapshotSeason: number }
  >;
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
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

function snapshotHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function iso(value: Date): string {
  return value.toISOString();
}

function asDate(value: string): Date {
  return new Date(value);
}

function sortedUniqueNumbers(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function checkpointFromRow(row: CheckpointRow): CurationCheckpoint {
  return {
    actorUserId: row.actorUserId,
    createdAt: iso(row.createdAt),
    editIds: row.editIds,
    id: row.id,
    label: row.label,
    latestEditId: row.latestEditId,
    leagueId: row.leagueId,
    markerEditId: row.markerEditId,
    note: row.note,
    seasons: row.seasons,
    snapshot: row.snapshot as unknown as CuratedLeagueSnapshot,
    snapshotHash: row.snapshotHash,
  };
}

function checkpointSummary(row: CheckpointRow): CurationCheckpointSummary {
  const checkpoint = checkpointFromRow(row);
  const { snapshot: _snapshot, ...summary } = checkpoint;
  return summary;
}

function pushFromRow(row: SeasonPushRow): CurationSeasonPush {
  return {
    actorUserId: row.actorUserId,
    checkpointId: row.checkpointId,
    createdAt: iso(row.createdAt),
    editIds: row.editIds,
    id: row.id,
    latestEditId: row.latestEditId,
    leagueId: row.leagueId,
    markerEditId: row.markerEditId,
    reason: row.reason,
    season: row.season,
    snapshot: row.snapshot as unknown as CuratedSeasonSnapshot,
    snapshotHash: row.snapshotHash,
  };
}

function pushSummary(row: SeasonPushRow): Omit<CurationSeasonPush, "snapshot"> {
  const push = pushFromRow(row);
  const { snapshot: _snapshot, ...summary } = push;
  return summary;
}

async function latestEditMarker(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<{ editIds: string[]; latestEditId: string | null }> {
  const rows = await tx
    .select({ id: leagueDataEdits.id })
    .from(leagueDataEdits)
    .where(eq(leagueDataEdits.leagueId, leagueId))
    .orderBy(asc(leagueDataEdits.createdAt), asc(leagueDataEdits.id));
  return {
    editIds: rows.map((row) => row.id),
    latestEditId: rows.at(-1)?.id ?? null,
  };
}

async function knownSeasons(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<number[]> {
  const settingsRows = await tx
    .select({ season: leagueSeasonSettings.season })
    .from(leagueSeasonSettings)
    .where(eq(leagueSeasonSettings.leagueId, leagueId));
  const teamRows = await tx
    .select({ season: teamSeasons.season })
    .from(teamSeasons)
    .where(eq(teamSeasons.leagueId, leagueId));
  const matchupRows = await tx
    .select({ season: fantasyMatchups.season })
    .from(fantasyMatchups)
    .where(eq(fantasyMatchups.leagueId, leagueId));
  const weeklyRows = await tx
    .select({ season: weeklyStatistics.season })
    .from(weeklyStatistics)
    .where(eq(weeklyStatistics.leagueId, leagueId));
  const rosterRows = await tx
    .select({ season: fantasyRosterEntries.season })
    .from(fantasyRosterEntries)
    .where(eq(fantasyRosterEntries.leagueId, leagueId));
  const draftRows = await tx
    .select({ season: fantasyDraftPicks.season })
    .from(fantasyDraftPicks)
    .where(eq(fantasyDraftPicks.leagueId, leagueId));
  return sortedUniqueNumbers([
    ...settingsRows.map((row) => row.season),
    ...teamRows.map((row) => row.season),
    ...matchupRows.map((row) => row.season),
    ...weeklyRows.map((row) => row.season),
    ...rosterRows.map((row) => row.season),
    ...draftRows.map((row) => row.season),
  ]);
}

function personSnapshot(row: PersonRow): CuratedPersonSnapshot {
  return {
    canonicalName: row.canonicalName,
    createdAt: iso(row.createdAt),
    id: row.id,
    ownerHistory: row.ownerHistory,
    updatedAt: iso(row.updatedAt),
  };
}

function teamSeasonSnapshot(row: TeamSeasonRow): CuratedTeamSeasonSnapshot {
  return {
    createdAt: iso(row.createdAt),
    division: row.division,
    fantasyTeamId: row.fantasyTeamId,
    id: row.id,
    leagueProviderId: row.leagueProviderId,
    ownerMemberIds: row.ownerMemberIds,
    ownerNames: row.ownerNames,
    provider: row.provider,
    providerTeamId: row.providerTeamId,
    season: row.season,
    teamName: row.teamName,
    updatedAt: iso(row.updatedAt),
  };
}

function identityMappingSnapshot(
  row: IdentityMappingRow,
): CuratedIdentityMappingSnapshot {
  return {
    confidence: row.confidence,
    createdAt: iso(row.createdAt),
    id: row.id,
    leagueProviderId: row.leagueProviderId,
    method: row.method,
    personId: row.personId,
    provider: row.provider,
    providerTeamId: row.providerTeamId,
    resolvedBy: row.resolvedBy,
    season: row.season,
    teamSeasonId: row.teamSeasonId,
    updatedAt: iso(row.updatedAt),
  };
}

function seasonSettingsSnapshot(
  row: SeasonSettingsRow,
): CuratedSeasonSettingsSnapshot {
  return {
    acquisitionBudget: row.acquisitionBudget,
    acquisitionSettings: row.acquisitionSettings,
    acquisitionType: row.acquisitionType,
    championshipScoringPeriod: row.championshipScoringPeriod,
    contentHash: row.contentHash,
    createdAt: iso(row.createdAt),
    id: row.id,
    isDynastyLeague: row.isDynastyLeague,
    isKeeperLeague: row.isKeeperLeague,
    keeperSettings: row.keeperSettings,
    leagueProviderId: row.leagueProviderId,
    leagueSize: row.leagueSize,
    lineupSlotCounts: row.lineupSlotCounts,
    matchupPeriodCount: row.matchupPeriodCount,
    playoffMatchupPeriodLength: row.playoffMatchupPeriodLength,
    playoffStartScoringPeriod: row.playoffStartScoringPeriod,
    playoffTeamCount: row.playoffTeamCount,
    provider: row.provider,
    regularSeasonEndScoringPeriod: row.regularSeasonEndScoringPeriod,
    scoringSettings: row.scoringSettings,
    scoringType: row.scoringType,
    season: row.season,
    updatedAt: iso(row.updatedAt),
  };
}

function matchupSnapshot(row: MatchupRow): CuratedMatchupSnapshot {
  return {
    awayScore: row.awayScore,
    awayTeamProviderId: row.awayTeamProviderId,
    contentHash: row.contentHash,
    createdAt: iso(row.createdAt),
    homeScore: row.homeScore,
    homeTeamProviderId: row.homeTeamProviderId,
    id: row.id,
    kind: row.kind,
    leagueProviderId: row.leagueProviderId,
    periodStart: row.periodStart,
    provider: row.provider,
    providerMatchupId: row.providerMatchupId,
    scoringPeriod: row.scoringPeriod,
    scoringPeriodSpan: row.scoringPeriodSpan,
    season: row.season,
    status: row.status,
    updatedAt: iso(row.updatedAt),
    winner: row.winner,
  };
}

function weeklyStatSnapshot(
  row: WeeklyStatisticsRow,
): CuratedWeeklyStatSnapshot {
  return {
    createdAt: iso(row.createdAt),
    id: row.id,
    isBottomScorer: row.isBottomScorer,
    isChampionship: row.isChampionship,
    isPlayoff: row.isPlayoff,
    isTopScorer: row.isTopScorer,
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
    updatedAt: iso(row.updatedAt),
    weeklyRank: row.weeklyRank,
  };
}

function fantasyPlayerSnapshot(
  row: FantasyPlayerRow,
): CuratedFantasyPlayerSnapshot {
  return {
    contentHash: row.contentHash,
    createdAt: iso(row.createdAt),
    fullName: row.fullName,
    id: row.id,
    leagueProviderId: row.leagueProviderId,
    metadata: row.metadata,
    nflPlayerId: row.nflPlayerId,
    position: row.position,
    proTeam: row.proTeam,
    provider: row.provider,
    providerPlayerId: row.providerPlayerId,
    status: row.status,
    updatedAt: iso(row.updatedAt),
  };
}

function fantasyRosterEntrySnapshot(
  row: FantasyRosterEntryRow,
): CuratedFantasyRosterEntrySnapshot {
  return {
    actualPoints: row.actualPoints,
    contentHash: row.contentHash,
    createdAt: iso(row.createdAt),
    fantasyPlayerId: row.fantasyPlayerId,
    id: row.id,
    isKeeper: row.isKeeper,
    leagueProviderId: row.leagueProviderId,
    metadata: row.metadata,
    points: row.points,
    projectedPoints: row.projectedPoints,
    provider: row.provider,
    providerPlayerId: row.providerPlayerId,
    providerTeamId: row.providerTeamId,
    scoringPeriod: row.scoringPeriod,
    season: row.season,
    slot: row.slot,
    started: row.started,
    status: row.status,
    updatedAt: iso(row.updatedAt),
  };
}

function fantasyDraftPickSnapshot(
  row: FantasyDraftPickRow,
): CuratedFantasyDraftPickSnapshot {
  return {
    auctionValue: row.auctionValue,
    contentHash: row.contentHash,
    createdAt: iso(row.createdAt),
    fantasyPlayerId: row.fantasyPlayerId,
    id: row.id,
    isKeeper: row.isKeeper,
    leagueProviderId: row.leagueProviderId,
    metadata: row.metadata,
    pickInRound: row.pickInRound,
    pickOverall: row.pickOverall,
    provider: row.provider,
    providerPickId: row.providerPickId,
    providerPlayerId: row.providerPlayerId,
    providerTeamId: row.providerTeamId,
    round: row.round,
    season: row.season,
    updatedAt: iso(row.updatedAt),
  };
}

async function groupingSnapshotsForSeason(
  tx: LeagueScopedTx,
  leagueId: string,
  season: number,
): Promise<CuratedGroupingSnapshot[]> {
  const groupingSeasonRows = await tx
    .select({
      groupingId: leagueGroupingSeasons.groupingId,
      season: leagueGroupingSeasons.season,
    })
    .from(leagueGroupingSeasons)
    .where(eq(leagueGroupingSeasons.leagueId, leagueId))
    .orderBy(asc(leagueGroupingSeasons.season));
  const groupingIds = [
    ...new Set(
      groupingSeasonRows
        .filter((row) => row.season === season)
        .map((row) => row.groupingId),
    ),
  ];
  if (groupingIds.length === 0) {
    return [];
  }
  const groupingRows = await tx
    .select()
    .from(leagueSeasonGroupings)
    .where(
      and(
        eq(leagueSeasonGroupings.leagueId, leagueId),
        inArray(leagueSeasonGroupings.id, groupingIds),
      ),
    )
    .orderBy(asc(leagueSeasonGroupings.ordinal), asc(leagueSeasonGroupings.id));
  const seasonsByGrouping = new Map<string, number[]>();
  for (const row of groupingSeasonRows) {
    seasonsByGrouping.set(row.groupingId, [
      ...(seasonsByGrouping.get(row.groupingId) ?? []),
      row.season,
    ]);
  }
  return groupingRows.map((row) => ({
    config: row.config,
    confirmedByUserId: row.confirmedByUserId,
    createdAt: iso(row.createdAt),
    derivedFrom: row.derivedFrom,
    id: row.id,
    kind: row.kind,
    name: row.name,
    ordinal: row.ordinal,
    seasons: seasonsByGrouping.get(row.id) ?? [],
    status: row.status,
  }));
}

async function captureSeasonSnapshot(
  tx: LeagueScopedTx,
  input: {
    capturedAt: string;
    editIds: string[];
    latestEditId: string | null;
    leagueId: string;
    season: number;
  },
): Promise<CuratedSeasonSnapshot> {
  const teamRows = await tx
    .select()
    .from(teamSeasons)
    .where(
      and(
        eq(teamSeasons.leagueId, input.leagueId),
        eq(teamSeasons.season, input.season),
      ),
    )
    .orderBy(asc(teamSeasons.providerTeamId), asc(teamSeasons.id));
  const mappingRows =
    teamRows.length === 0
      ? []
      : await tx
          .select()
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
          .orderBy(
            asc(identityMappings.providerTeamId),
            asc(identityMappings.id),
          );
  const personIds = [...new Set(mappingRows.map((row) => row.personId))];
  const personRows =
    personIds.length === 0
      ? []
      : await tx
          .select()
          .from(persons)
          .where(
            and(
              eq(persons.leagueId, input.leagueId),
              inArray(persons.id, personIds),
            ),
          )
          .orderBy(asc(persons.canonicalName), asc(persons.id));
  const settingsRows = await tx
    .select()
    .from(leagueSeasonSettings)
    .where(
      and(
        eq(leagueSeasonSettings.leagueId, input.leagueId),
        eq(leagueSeasonSettings.season, input.season),
      ),
    )
    .orderBy(asc(leagueSeasonSettings.provider), asc(leagueSeasonSettings.id));
  const matchupRows = await tx
    .select()
    .from(fantasyMatchups)
    .where(
      and(
        eq(fantasyMatchups.leagueId, input.leagueId),
        eq(fantasyMatchups.season, input.season),
      ),
    )
    .orderBy(asc(fantasyMatchups.scoringPeriod), asc(fantasyMatchups.id));
  const weeklyRows = await tx
    .select()
    .from(weeklyStatistics)
    .where(
      and(
        eq(weeklyStatistics.leagueId, input.leagueId),
        eq(weeklyStatistics.season, input.season),
      ),
    )
    .orderBy(asc(weeklyStatistics.scoringPeriod), asc(weeklyStatistics.id));
  const rosterRows = await tx
    .select()
    .from(fantasyRosterEntries)
    .where(
      and(
        eq(fantasyRosterEntries.leagueId, input.leagueId),
        eq(fantasyRosterEntries.season, input.season),
      ),
    )
    .orderBy(
      asc(fantasyRosterEntries.scoringPeriod),
      asc(fantasyRosterEntries.providerTeamId),
      asc(fantasyRosterEntries.slot),
      asc(fantasyRosterEntries.providerPlayerId),
      asc(fantasyRosterEntries.id),
    );
  const draftRows = await tx
    .select()
    .from(fantasyDraftPicks)
    .where(
      and(
        eq(fantasyDraftPicks.leagueId, input.leagueId),
        eq(fantasyDraftPicks.season, input.season),
      ),
    )
    .orderBy(
      asc(fantasyDraftPicks.round),
      asc(fantasyDraftPicks.pickInRound),
      asc(fantasyDraftPicks.pickOverall),
      asc(fantasyDraftPicks.providerPickId),
    );
  const playerIds = [
    ...new Set(
      [...rosterRows, ...draftRows]
        .map((row) => row.fantasyPlayerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const playerProviderIds = [
    ...new Set(
      [
        ...rosterRows.map((row) => row.providerPlayerId),
        ...draftRows
          .map((row) => row.providerPlayerId)
          .filter((id): id is string => Boolean(id)),
      ].filter(Boolean),
    ),
  ];
  const playerRows =
    playerIds.length === 0 && playerProviderIds.length === 0
      ? []
      : await tx
          .select()
          .from(fantasyPlayers)
          .where(
            and(
              eq(fantasyPlayers.leagueId, input.leagueId),
              or(
                playerIds.length > 0
                  ? inArray(fantasyPlayers.id, playerIds)
                  : undefined,
                playerProviderIds.length > 0
                  ? inArray(fantasyPlayers.providerPlayerId, playerProviderIds)
                  : undefined,
              ),
            ),
          )
          .orderBy(asc(fantasyPlayers.fullName), asc(fantasyPlayers.id));

  return {
    capturedAt: input.capturedAt,
    editIds: input.editIds,
    fantasyDraftPicks: draftRows.map(fantasyDraftPickSnapshot),
    fantasyPlayers: playerRows.map(fantasyPlayerSnapshot),
    fantasyRosterEntries: rosterRows.map(fantasyRosterEntrySnapshot),
    groupings: await groupingSnapshotsForSeason(
      tx,
      input.leagueId,
      input.season,
    ),
    identityMappings: mappingRows.map(identityMappingSnapshot),
    latestEditId: input.latestEditId,
    leagueId: input.leagueId,
    matchups: matchupRows.map(matchupSnapshot),
    persons: personRows.map(personSnapshot),
    season: input.season,
    seasonSettings: settingsRows.map(seasonSettingsSnapshot),
    teamSeasons: teamRows.map(teamSeasonSnapshot),
    weeklyStatistics: weeklyRows.map(weeklyStatSnapshot),
  };
}

async function captureLeagueSnapshot(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<CuratedLeagueSnapshot> {
  const capturedAt = new Date().toISOString();
  const editMarker = await latestEditMarker(tx, leagueId);
  const seasons = await knownSeasons(tx, leagueId);
  const seasonSnapshots: CuratedSeasonSnapshot[] = [];
  for (const season of seasons) {
    seasonSnapshots.push(
      await captureSeasonSnapshot(tx, {
        capturedAt,
        editIds: editMarker.editIds,
        latestEditId: editMarker.latestEditId,
        leagueId,
        season,
      }),
    );
  }
  return {
    capturedAt,
    editIds: editMarker.editIds,
    latestEditId: editMarker.latestEditId,
    leagueId,
    seasonSnapshots,
    seasons,
  };
}

async function insertCheckpointMarker(
  tx: LeagueScopedTx,
  input: {
    actorUserId: string;
    checkpointId: string;
    hash: string;
    label?: string;
    leagueId: string;
    note?: string;
    previousCheckpointId?: string | null;
    seasons: number[];
  },
): Promise<string> {
  const [marker] = await tx
    .insert(leagueDataEdits)
    .values({
      actorUserId: input.actorUserId,
      afterValue: {
        checkpointId: input.checkpointId,
        label: input.label ?? null,
        seasons: input.seasons,
        snapshotHash: input.hash,
      },
      beforeValue: { previousCheckpointId: input.previousCheckpointId ?? null },
      editClass: "substantive",
      field: "checkpoint_save",
      leagueId: input.leagueId,
      reason: input.note ?? "saved curated data checkpoint",
      targetId: input.checkpointId,
      targetKind: "curation_checkpoint",
    })
    .returning({ id: leagueDataEdits.id });
  if (!marker) {
    throw new Error("checkpoint marker was not written");
  }
  return marker.id;
}

export async function createCurationCheckpoint(
  db: Db,
  input: {
    actorUserId: string;
    label?: string;
    leagueId: string;
    note?: string;
  },
): Promise<CurationCheckpoint> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const snapshot = await captureLeagueSnapshot(tx, input.leagueId);
    const hash = snapshotHash(snapshot);
    const [previous] = await tx
      .select({ id: leagueCurationCheckpoints.id })
      .from(leagueCurationCheckpoints)
      .where(eq(leagueCurationCheckpoints.leagueId, input.leagueId))
      .orderBy(desc(leagueCurationCheckpoints.createdAt))
      .limit(1);
    const checkpointId = randomUUID();
    const markerEditId = await insertCheckpointMarker(tx, {
      actorUserId: input.actorUserId,
      checkpointId,
      hash,
      label: input.label,
      leagueId: input.leagueId,
      note: input.note,
      previousCheckpointId: previous?.id ?? null,
      seasons: snapshot.seasons,
    });
    const [checkpoint] = await tx
      .insert(leagueCurationCheckpoints)
      .values({
        actorUserId: input.actorUserId,
        editIds: snapshot.editIds,
        id: checkpointId,
        label: input.label ?? null,
        latestEditId: snapshot.latestEditId,
        leagueId: input.leagueId,
        markerEditId,
        note: input.note ?? null,
        seasons: snapshot.seasons,
        snapshot: snapshot as unknown as Record<string, unknown>,
        snapshotHash: hash,
      })
      .returning();
    if (!checkpoint) {
      throw new Error("curation checkpoint was not written");
    }
    return checkpointFromRow(checkpoint);
  });
}

export async function listCurationCheckpoints(
  db: Db,
  input: { leagueId: string; limit?: number },
): Promise<CurationCheckpointSummary[]> {
  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const rows = await tx
      .select()
      .from(leagueCurationCheckpoints)
      .where(eq(leagueCurationCheckpoints.leagueId, input.leagueId))
      .orderBy(desc(leagueCurationCheckpoints.createdAt))
      .limit(limit);
    return rows.map(checkpointSummary);
  });
}

async function loadCheckpoint(
  tx: LeagueScopedTx,
  input: { checkpointId?: string; leagueId: string },
): Promise<CurationCheckpoint> {
  const rows = await tx
    .select()
    .from(leagueCurationCheckpoints)
    .where(
      and(
        eq(leagueCurationCheckpoints.leagueId, input.leagueId),
        input.checkpointId
          ? eq(leagueCurationCheckpoints.id, input.checkpointId)
          : undefined,
      ),
    )
    .orderBy(desc(leagueCurationCheckpoints.createdAt))
    .limit(1);
  const checkpoint = rows[0];
  if (!checkpoint) {
    throw new Error(
      input.checkpointId
        ? "curation checkpoint was not found"
        : "no saved curation checkpoint exists",
    );
  }
  return checkpointFromRow(checkpoint);
}

async function restorePersons(
  tx: LeagueScopedTx,
  leagueId: string,
  snapshot: CuratedLeagueSnapshot,
): Promise<void> {
  const byId = new Map<string, CuratedPersonSnapshot>();
  for (const seasonSnapshot of snapshot.seasonSnapshots) {
    for (const row of seasonSnapshot.persons) {
      byId.set(row.id, row);
    }
  }
  for (const row of byId.values()) {
    await tx
      .insert(persons)
      .values({
        canonicalName: row.canonicalName,
        createdAt: asDate(row.createdAt),
        id: row.id,
        leagueId,
        ownerHistory: row.ownerHistory,
        updatedAt: asDate(row.updatedAt ?? row.createdAt),
      })
      .onConflictDoUpdate({
        set: {
          canonicalName: row.canonicalName,
          ownerHistory: row.ownerHistory,
          updatedAt: asDate(row.updatedAt ?? row.createdAt),
        },
        target: persons.id,
      });
  }

  const personIds = [...byId.keys()];
  await tx.delete(persons).where(
    and(
      eq(persons.leagueId, leagueId),
      personIds.length > 0 ? not(inArray(persons.id, personIds)) : undefined,
      sql`not exists (
          select 1 from ${identityMappings}
          where ${identityMappings.leagueId} = ${persons.leagueId}
            and ${identityMappings.personId} = ${persons.id}
        )`,
    ),
  );
}

async function restoreGroupings(
  tx: LeagueScopedTx,
  leagueId: string,
  snapshot: CuratedLeagueSnapshot,
): Promise<void> {
  const byId = new Map<string, CuratedGroupingSnapshot>();
  for (const seasonSnapshot of snapshot.seasonSnapshots) {
    for (const row of seasonSnapshot.groupings) {
      byId.set(row.id, row);
    }
  }

  await tx
    .delete(leagueGroupingSeasons)
    .where(eq(leagueGroupingSeasons.leagueId, leagueId));

  const groupingIds = [...byId.keys()];
  await tx
    .delete(leagueSeasonGroupings)
    .where(
      and(
        eq(leagueSeasonGroupings.leagueId, leagueId),
        groupingIds.length > 0
          ? not(inArray(leagueSeasonGroupings.id, groupingIds))
          : undefined,
      ),
    );

  for (const row of byId.values()) {
    await tx
      .insert(leagueSeasonGroupings)
      .values({
        config: row.config,
        confirmedByUserId: row.confirmedByUserId,
        createdAt: asDate(row.createdAt),
        derivedFrom: row.derivedFrom,
        id: row.id,
        kind: row.kind,
        leagueId,
        name: row.name,
        ordinal: row.ordinal,
        status: row.status,
      })
      .onConflictDoUpdate({
        set: {
          config: row.config,
          confirmedByUserId: row.confirmedByUserId,
          derivedFrom: row.derivedFrom,
          kind: row.kind,
          name: row.name,
          ordinal: row.ordinal,
          status: row.status,
        },
        target: leagueSeasonGroupings.id,
      });

    if (row.seasons.length > 0) {
      await tx.insert(leagueGroupingSeasons).values(
        row.seasons.map((season) => ({
          groupingId: row.id,
          leagueId,
          season,
        })),
      );
    }
  }
}

async function restoreSeasonSnapshot(
  tx: LeagueScopedTx,
  input: { leagueId: string; snapshot: CuratedSeasonSnapshot },
): Promise<void> {
  const season = input.snapshot.season;
  const teamSeasonIds = input.snapshot.teamSeasons.map((row) => row.id);
  const mappingIds = input.snapshot.identityMappings.map((row) => row.id);
  const settingIds = input.snapshot.seasonSettings.map((row) => row.id);
  const matchupIds = input.snapshot.matchups.map((row) => row.id);
  const weeklyIds = input.snapshot.weeklyStatistics.map((row) => row.id);
  const rosterIds = (input.snapshot.fantasyRosterEntries ?? []).map(
    (row) => row.id,
  );
  const draftIds = (input.snapshot.fantasyDraftPicks ?? []).map(
    (row) => row.id,
  );

  await tx
    .delete(weeklyStatistics)
    .where(
      and(
        eq(weeklyStatistics.leagueId, input.leagueId),
        eq(weeklyStatistics.season, season),
        weeklyIds.length > 0
          ? not(inArray(weeklyStatistics.id, weeklyIds))
          : undefined,
      ),
    );
  await tx
    .delete(fantasyRosterEntries)
    .where(
      and(
        eq(fantasyRosterEntries.leagueId, input.leagueId),
        eq(fantasyRosterEntries.season, season),
        rosterIds.length > 0
          ? not(inArray(fantasyRosterEntries.id, rosterIds))
          : undefined,
      ),
    );
  await tx
    .delete(fantasyDraftPicks)
    .where(
      and(
        eq(fantasyDraftPicks.leagueId, input.leagueId),
        eq(fantasyDraftPicks.season, season),
        draftIds.length > 0
          ? not(inArray(fantasyDraftPicks.id, draftIds))
          : undefined,
      ),
    );
  await tx
    .delete(identityMappings)
    .where(
      and(
        eq(identityMappings.leagueId, input.leagueId),
        eq(identityMappings.season, season),
        mappingIds.length > 0
          ? not(inArray(identityMappings.id, mappingIds))
          : undefined,
      ),
    );
  await tx
    .delete(teamSeasons)
    .where(
      and(
        eq(teamSeasons.leagueId, input.leagueId),
        eq(teamSeasons.season, season),
        teamSeasonIds.length > 0
          ? not(inArray(teamSeasons.id, teamSeasonIds))
          : undefined,
      ),
    );
  await tx
    .delete(leagueSeasonSettings)
    .where(
      and(
        eq(leagueSeasonSettings.leagueId, input.leagueId),
        eq(leagueSeasonSettings.season, season),
        settingIds.length > 0
          ? not(inArray(leagueSeasonSettings.id, settingIds))
          : undefined,
      ),
    );
  await tx
    .delete(fantasyMatchups)
    .where(
      and(
        eq(fantasyMatchups.leagueId, input.leagueId),
        eq(fantasyMatchups.season, season),
        matchupIds.length > 0
          ? not(inArray(fantasyMatchups.id, matchupIds))
          : undefined,
      ),
    );

  for (const row of input.snapshot.teamSeasons) {
    await tx
      .insert(teamSeasons)
      .values({
        createdAt: asDate(row.createdAt),
        division: row.division,
        fantasyTeamId: row.fantasyTeamId,
        id: row.id,
        leagueId: input.leagueId,
        leagueProviderId: row.leagueProviderId,
        ownerMemberIds: row.ownerMemberIds,
        ownerNames: row.ownerNames,
        provider: row.provider,
        providerTeamId: row.providerTeamId,
        season: row.season,
        teamName: row.teamName,
        updatedAt: asDate(row.updatedAt ?? row.createdAt),
      })
      .onConflictDoUpdate({
        set: {
          division: row.division,
          ownerMemberIds: row.ownerMemberIds,
          ownerNames: row.ownerNames,
          teamName: row.teamName,
          updatedAt: asDate(row.updatedAt ?? row.createdAt),
        },
        target: teamSeasons.id,
      });
  }

  for (const row of input.snapshot.identityMappings) {
    await tx
      .insert(identityMappings)
      .values({
        confidence: row.confidence,
        createdAt: asDate(row.createdAt),
        id: row.id,
        leagueId: input.leagueId,
        leagueProviderId: row.leagueProviderId,
        method: row.method,
        personId: row.personId,
        provider: row.provider,
        providerTeamId: row.providerTeamId,
        resolvedBy: row.resolvedBy,
        season: row.season,
        teamSeasonId: row.teamSeasonId,
        updatedAt: asDate(row.updatedAt ?? row.createdAt),
      })
      .onConflictDoUpdate({
        set: {
          confidence: row.confidence,
          method: row.method,
          personId: row.personId,
          resolvedBy: row.resolvedBy,
          updatedAt: asDate(row.updatedAt ?? row.createdAt),
        },
        target: identityMappings.id,
      });
  }

  for (const row of input.snapshot.seasonSettings) {
    await tx
      .insert(leagueSeasonSettings)
      .values({
        acquisitionBudget: row.acquisitionBudget,
        acquisitionSettings: row.acquisitionSettings,
        acquisitionType: row.acquisitionType,
        championshipScoringPeriod: row.championshipScoringPeriod,
        contentHash: row.contentHash,
        createdAt: asDate(row.createdAt),
        id: row.id,
        isDynastyLeague: row.isDynastyLeague,
        isKeeperLeague: row.isKeeperLeague,
        keeperSettings: row.keeperSettings,
        leagueId: input.leagueId,
        leagueProviderId: row.leagueProviderId,
        leagueSize: row.leagueSize,
        lineupSlotCounts: row.lineupSlotCounts,
        matchupPeriodCount: row.matchupPeriodCount,
        playoffMatchupPeriodLength: row.playoffMatchupPeriodLength,
        playoffStartScoringPeriod: row.playoffStartScoringPeriod,
        playoffTeamCount: row.playoffTeamCount,
        provider: row.provider,
        regularSeasonEndScoringPeriod: row.regularSeasonEndScoringPeriod,
        scoringSettings: row.scoringSettings,
        scoringType: row.scoringType,
        season: row.season,
        updatedAt: asDate(row.updatedAt ?? row.createdAt),
      })
      .onConflictDoUpdate({
        set: {
          acquisitionBudget: row.acquisitionBudget,
          acquisitionSettings: row.acquisitionSettings,
          acquisitionType: row.acquisitionType,
          championshipScoringPeriod: row.championshipScoringPeriod,
          contentHash: row.contentHash,
          isDynastyLeague: row.isDynastyLeague,
          isKeeperLeague: row.isKeeperLeague,
          keeperSettings: row.keeperSettings,
          leagueSize: row.leagueSize,
          lineupSlotCounts: row.lineupSlotCounts,
          matchupPeriodCount: row.matchupPeriodCount,
          playoffMatchupPeriodLength: row.playoffMatchupPeriodLength,
          playoffStartScoringPeriod: row.playoffStartScoringPeriod,
          playoffTeamCount: row.playoffTeamCount,
          regularSeasonEndScoringPeriod: row.regularSeasonEndScoringPeriod,
          scoringSettings: row.scoringSettings,
          scoringType: row.scoringType,
          updatedAt: asDate(row.updatedAt ?? row.createdAt),
        },
        target: leagueSeasonSettings.id,
      });
  }

  for (const row of input.snapshot.matchups) {
    await tx
      .insert(fantasyMatchups)
      .values({
        awayScore: row.awayScore,
        awayTeamProviderId: row.awayTeamProviderId,
        contentHash: row.contentHash,
        createdAt: asDate(row.createdAt),
        homeScore: row.homeScore,
        homeTeamProviderId: row.homeTeamProviderId,
        id: row.id,
        kind: row.kind,
        leagueId: input.leagueId,
        leagueProviderId: row.leagueProviderId,
        periodStart: row.periodStart,
        provider: row.provider,
        providerMatchupId: row.providerMatchupId,
        scoringPeriod: row.scoringPeriod,
        scoringPeriodSpan: row.scoringPeriodSpan,
        season: row.season,
        status: row.status,
        updatedAt: asDate(row.updatedAt ?? row.createdAt),
        winner: row.winner,
      })
      .onConflictDoUpdate({
        set: {
          awayScore: row.awayScore,
          awayTeamProviderId: row.awayTeamProviderId,
          contentHash: row.contentHash,
          homeScore: row.homeScore,
          homeTeamProviderId: row.homeTeamProviderId,
          kind: row.kind,
          periodStart: row.periodStart,
          scoringPeriod: row.scoringPeriod,
          scoringPeriodSpan: row.scoringPeriodSpan,
          status: row.status,
          updatedAt: asDate(row.updatedAt ?? row.createdAt),
          winner: row.winner,
        },
        target: fantasyMatchups.id,
      });
  }

  for (const row of input.snapshot.fantasyPlayers ?? []) {
    await tx
      .insert(fantasyPlayers)
      .values({
        contentHash: row.contentHash,
        createdAt: asDate(row.createdAt),
        fullName: row.fullName,
        id: row.id,
        leagueId: input.leagueId,
        leagueProviderId: row.leagueProviderId,
        metadata: row.metadata,
        nflPlayerId: row.nflPlayerId,
        position: row.position,
        proTeam: row.proTeam,
        provider: row.provider,
        providerPlayerId: row.providerPlayerId,
        status: row.status,
        updatedAt: asDate(row.updatedAt ?? row.createdAt),
      })
      .onConflictDoUpdate({
        set: {
          contentHash: row.contentHash,
          fullName: row.fullName,
          leagueProviderId: row.leagueProviderId,
          metadata: row.metadata,
          nflPlayerId: row.nflPlayerId,
          position: row.position,
          proTeam: row.proTeam,
          provider: row.provider,
          providerPlayerId: row.providerPlayerId,
          status: row.status,
          updatedAt: asDate(row.updatedAt ?? row.createdAt),
        },
        target: fantasyPlayers.id,
      });
  }

  for (const row of input.snapshot.fantasyRosterEntries ?? []) {
    await tx
      .insert(fantasyRosterEntries)
      .values({
        actualPoints: row.actualPoints,
        contentHash: row.contentHash,
        createdAt: asDate(row.createdAt),
        fantasyPlayerId: row.fantasyPlayerId,
        id: row.id,
        isKeeper: row.isKeeper,
        leagueId: input.leagueId,
        leagueProviderId: row.leagueProviderId,
        metadata: row.metadata,
        points: row.points,
        projectedPoints: row.projectedPoints,
        provider: row.provider,
        providerPlayerId: row.providerPlayerId,
        providerTeamId: row.providerTeamId,
        scoringPeriod: row.scoringPeriod,
        season: row.season,
        slot: row.slot,
        started: row.started,
        status: row.status,
        updatedAt: asDate(row.updatedAt ?? row.createdAt),
      })
      .onConflictDoUpdate({
        set: {
          actualPoints: row.actualPoints,
          contentHash: row.contentHash,
          fantasyPlayerId: row.fantasyPlayerId,
          isKeeper: row.isKeeper,
          leagueProviderId: row.leagueProviderId,
          metadata: row.metadata,
          points: row.points,
          projectedPoints: row.projectedPoints,
          provider: row.provider,
          providerPlayerId: row.providerPlayerId,
          providerTeamId: row.providerTeamId,
          scoringPeriod: row.scoringPeriod,
          slot: row.slot,
          started: row.started,
          status: row.status,
          updatedAt: asDate(row.updatedAt ?? row.createdAt),
        },
        target: fantasyRosterEntries.id,
      });
  }

  for (const row of input.snapshot.fantasyDraftPicks ?? []) {
    await tx
      .insert(fantasyDraftPicks)
      .values({
        auctionValue: row.auctionValue,
        contentHash: row.contentHash,
        createdAt: asDate(row.createdAt),
        fantasyPlayerId: row.fantasyPlayerId,
        id: row.id,
        isKeeper: row.isKeeper,
        leagueId: input.leagueId,
        leagueProviderId: row.leagueProviderId,
        metadata: row.metadata,
        pickInRound: row.pickInRound,
        pickOverall: row.pickOverall,
        provider: row.provider,
        providerPickId: row.providerPickId,
        providerPlayerId: row.providerPlayerId,
        providerTeamId: row.providerTeamId,
        round: row.round,
        season: row.season,
        updatedAt: asDate(row.updatedAt ?? row.createdAt),
      })
      .onConflictDoUpdate({
        set: {
          auctionValue: row.auctionValue,
          contentHash: row.contentHash,
          fantasyPlayerId: row.fantasyPlayerId,
          isKeeper: row.isKeeper,
          leagueProviderId: row.leagueProviderId,
          metadata: row.metadata,
          pickInRound: row.pickInRound,
          pickOverall: row.pickOverall,
          provider: row.provider,
          providerPlayerId: row.providerPlayerId,
          providerTeamId: row.providerTeamId,
          round: row.round,
          updatedAt: asDate(row.updatedAt ?? row.createdAt),
        },
        target: fantasyDraftPicks.id,
      });
  }

  for (const row of input.snapshot.weeklyStatistics) {
    await tx
      .insert(weeklyStatistics)
      .values({
        createdAt: asDate(row.createdAt),
        id: row.id,
        isBottomScorer: row.isBottomScorer,
        isChampionship: row.isChampionship,
        isPlayoff: row.isPlayoff,
        isTopScorer: row.isTopScorer,
        leagueId: input.leagueId,
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
        updatedAt: asDate(row.updatedAt ?? row.createdAt),
        weeklyRank: row.weeklyRank,
      })
      .onConflictDoUpdate({
        set: {
          isBottomScorer: row.isBottomScorer,
          isChampionship: row.isChampionship,
          isPlayoff: row.isPlayoff,
          isTopScorer: row.isTopScorer,
          margin: row.margin,
          matchupKind: row.matchupKind,
          opponentPersonId: row.opponentPersonId,
          periodStart: row.periodStart,
          personId: row.personId,
          pointsAgainst: row.pointsAgainst,
          pointsFor: row.pointsFor,
          result: row.result,
          scoringPeriodSpan: row.scoringPeriodSpan,
          teamSeasonId: row.teamSeasonId,
          updatedAt: asDate(row.updatedAt ?? row.createdAt),
          weeklyRank: row.weeklyRank,
        },
        target: weeklyStatistics.id,
      });
  }
}

export async function restoreCurationCheckpoint(
  db: Db,
  input: {
    actorUserId: string;
    checkpointId: string;
    leagueId: string;
    reason?: string;
  },
): Promise<CurationCheckpoint> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const checkpoint = await loadCheckpoint(tx, {
      checkpointId: input.checkpointId,
      leagueId: input.leagueId,
    });
    await restorePersons(tx, input.leagueId, checkpoint.snapshot);
    await restoreGroupings(tx, input.leagueId, checkpoint.snapshot);
    for (const seasonSnapshot of checkpoint.snapshot.seasonSnapshots) {
      await restoreSeasonSnapshot(tx, {
        leagueId: input.leagueId,
        snapshot: seasonSnapshot,
      });
    }
    await restorePersons(tx, input.leagueId, checkpoint.snapshot);
    await tx.insert(leagueDataEdits).values({
      actorUserId: input.actorUserId,
      afterValue: {
        checkpointId: checkpoint.id,
        seasons: checkpoint.seasons,
        snapshotHash: checkpoint.snapshotHash,
      },
      beforeValue: null,
      editClass: "substantive",
      field: "checkpoint_restore",
      leagueId: input.leagueId,
      reason: input.reason ?? "restored curated data checkpoint",
      targetId: checkpoint.id,
      targetKind: "curation_checkpoint",
    });
    return checkpoint;
  });
}

async function latestPushForSeason(
  tx: LeagueScopedTx,
  input: { leagueId: string; season: number },
): Promise<SeasonPushRow | null> {
  const [row] = await tx
    .select()
    .from(leagueCurationSeasonPushes)
    .where(
      and(
        eq(leagueCurationSeasonPushes.leagueId, input.leagueId),
        eq(leagueCurationSeasonPushes.season, input.season),
      ),
    )
    .orderBy(desc(leagueCurationSeasonPushes.createdAt))
    .limit(1);
  return row ?? null;
}

async function insertSeasonPush(
  tx: LeagueScopedTx,
  input: {
    actorUserId: string;
    checkpoint: CurationCheckpoint;
    leagueId: string;
    reason?: string;
    season: number;
  },
): Promise<CurationSeasonPush> {
  const seasonSnapshot = input.checkpoint.snapshot.seasonSnapshots.find(
    (snapshot) => snapshot.season === input.season,
  );
  if (!seasonSnapshot) {
    throw new Error(`checkpoint does not contain season ${input.season}`);
  }
  const hash = snapshotHash(seasonSnapshot);
  const pushId = randomUUID();
  const previousPush = await latestPushForSeason(tx, {
    leagueId: input.leagueId,
    season: input.season,
  });
  const [marker] = await tx
    .insert(leagueDataEdits)
    .values({
      actorUserId: input.actorUserId,
      afterValue: {
        checkpointId: input.checkpoint.id,
        pushId,
        season: input.season,
        snapshotHash: hash,
      },
      beforeValue: previousPush
        ? {
            checkpointId: previousPush.checkpointId,
            pushId: previousPush.id,
            season: previousPush.season,
            snapshotHash: previousPush.snapshotHash,
          }
        : null,
      editClass: "substantive",
      field: "season_push",
      leagueId: input.leagueId,
      reason: input.reason ?? `pushed curated ${input.season} season`,
      targetId: pushId,
      targetKind: "curation_push",
    })
    .returning({ id: leagueDataEdits.id });
  if (!marker) {
    throw new Error("season push marker was not written");
  }
  const [push] = await tx
    .insert(leagueCurationSeasonPushes)
    .values({
      actorUserId: input.actorUserId,
      checkpointId: input.checkpoint.id,
      editIds: seasonSnapshot.editIds,
      id: pushId,
      latestEditId: seasonSnapshot.latestEditId,
      leagueId: input.leagueId,
      markerEditId: marker.id,
      reason: input.reason ?? null,
      season: input.season,
      snapshot: seasonSnapshot as unknown as Record<string, unknown>,
      snapshotHash: hash,
    })
    .returning();
  if (!push) {
    throw new Error("curation season push was not written");
  }
  return pushFromRow(push);
}

export async function pushCurationSeason(
  db: Db,
  input: {
    actorUserId: string;
    checkpointId?: string;
    leagueId: string;
    reason?: string;
    season: number;
  },
): Promise<CurationSeasonPush> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const checkpoint = await loadCheckpoint(tx, {
      checkpointId: input.checkpointId,
      leagueId: input.leagueId,
    });
    return insertSeasonPush(tx, {
      actorUserId: input.actorUserId,
      checkpoint,
      leagueId: input.leagueId,
      reason: input.reason,
      season: input.season,
    });
  });
}

export async function pushAllCurationSeasons(
  db: Db,
  input: {
    actorUserId: string;
    checkpointId?: string;
    leagueId: string;
    reason?: string;
  },
): Promise<CurationSeasonPush[]> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const checkpoint = await loadCheckpoint(tx, {
      checkpointId: input.checkpointId,
      leagueId: input.leagueId,
    });
    const pushes: CurationSeasonPush[] = [];
    for (const season of checkpoint.seasons) {
      pushes.push(
        await insertSeasonPush(tx, {
          actorUserId: input.actorUserId,
          checkpoint,
          leagueId: input.leagueId,
          reason: input.reason ?? "push all curated seasons",
          season,
        }),
      );
    }
    return pushes;
  });
}

export async function composeCanonicalSnapshot(
  db: Db,
  input: { leagueId: string },
): Promise<ComposedCanonicalSnapshot> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const rows = await tx
      .select()
      .from(leagueCurationSeasonPushes)
      .where(eq(leagueCurationSeasonPushes.leagueId, input.leagueId))
      .orderBy(
        asc(leagueCurationSeasonPushes.season),
        desc(leagueCurationSeasonPushes.createdAt),
      );
    const latestBySeason = new Map<number, SeasonPushRow>();
    for (const row of rows) {
      if (!latestBySeason.has(row.season)) {
        latestBySeason.set(row.season, row);
      }
    }
    const latestRows = [...latestBySeason.values()].sort(
      (left, right) => left.season - right.season,
    );
    const seasonSnapshots = latestRows.map(
      (row) => row.snapshot as unknown as CuratedSeasonSnapshot,
    );
    const withSeason = <T extends object>(
      values: T[],
      snapshotSeason: number,
    ): Array<T & { snapshotSeason: number }> =>
      values.map((value) => ({ ...value, snapshotSeason }));

    return {
      composedAt: new Date().toISOString(),
      groupings: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.groupings, snapshot.season),
      ),
      fantasyDraftPicks: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.fantasyDraftPicks ?? [], snapshot.season),
      ),
      fantasyPlayers: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.fantasyPlayers ?? [], snapshot.season),
      ),
      fantasyRosterEntries: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.fantasyRosterEntries ?? [], snapshot.season),
      ),
      identityMappings: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.identityMappings, snapshot.season),
      ),
      latestPushes: latestRows.map(pushSummary),
      leagueId: input.leagueId,
      matchups: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.matchups, snapshot.season),
      ),
      persons: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.persons, snapshot.season),
      ),
      seasonSettings: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.seasonSettings, snapshot.season),
      ),
      seasonSnapshots,
      seasons: latestRows.map((row) => row.season),
      teamSeasons: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.teamSeasons, snapshot.season),
      ),
      weeklyStatistics: seasonSnapshots.flatMap((snapshot) =>
        withSeason(snapshot.weeklyStatistics, snapshot.season),
      ),
    };
  });
}
