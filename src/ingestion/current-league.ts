import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "@/core/logging";
import { err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  dataCoverage,
  dataIntegrityChecks,
  fantasyMatchups,
  fantasyMembers,
  fantasyRosterEntries,
  fantasyTeams,
  fantasyTransactions,
  leagueSeasonSettings,
  leagues,
  providerFinalStandings,
} from "@/db/schema";
import type {
  DataCoverageStatus,
  FantasyProvider,
  FantasyProviderCapabilities,
  FantasyProviderSession,
  NormalizedFinalStanding,
  NormalizedLeague,
  NormalizedMatchup,
  NormalizedMember,
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
    Partial<Pick<FantasyProvider<unknown, Session>, "getRosters">> &
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
  rosters: EntitySyncStats;
  transactions: EntitySyncStats;
}

export interface PersistNormalizedLeagueRowsInput {
  db: Db;
  finalStandings?: readonly NormalizedFinalStanding[];
  league?: NormalizedLeague;
  leagueId: string;
  leagueProviderId?: string;
  matchups: readonly NormalizedMatchup[];
  members: readonly NormalizedMember[];
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
  rosterStats: EntitySyncStats;
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
  awayTeamProviderId: string;
  contentHash: string;
  homeScore: number;
  homeTeamProviderId: string;
  kind: NormalizedMatchup["kind"] | "head_to_head";
  leagueId: string;
  leagueProviderId: string;
  provider: NormalizedMatchup["provider"];
  providerMatchupId: string;
  scoringPeriod: number;
  season: number;
  status: NormalizedMatchup["status"];
  winner: NormalizedMatchup["winner"];
};

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
    awayScore: matchup.awayScore,
    awayTeamProviderId: matchup.awayTeamRef.providerId,
    homeScore: matchup.homeScore,
    homeTeamProviderId: matchup.homeTeamRef.providerId,
    kind: matchup.kind ?? "head_to_head",
    leagueProviderId: matchup.leagueProviderId,
    provider: matchup.provider,
    providerId: matchup.providerId,
    scoringPeriod: matchup.scoringPeriod,
    season: matchup.season,
    status: matchup.status,
    winner: matchup.winner,
  };
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
    championshipScoringPeriod:
      league.postseason?.championshipScoringPeriod ?? null,
    isDynastyLeague: league.keeperSettings?.isDynasty ?? false,
    isKeeperLeague: league.keeperSettings?.isKeeper ?? false,
    keeperSettings: league.keeperSettings ?? {},
    leagueProviderId: league.providerId,
    playoffStartScoringPeriod:
      league.postseason?.playoffStartScoringPeriod ?? null,
    playoffTeamCount: league.postseason?.playoffTeamCount ?? null,
    provider: league.provider,
    regularSeasonEndScoringPeriod:
      league.postseason?.regularSeasonEndScoringPeriod ?? null,
    scoringSettings: league.scoringSettings ?? {},
    season: league.season,
  };
}

function rosterEntryHashPayload({
  entry,
  roster,
}: {
  entry: NormalizedRoster["entries"][number];
  roster: NormalizedRoster;
}) {
  return {
    isKeeper: entry.isKeeper ?? false,
    metadata: entry.metadata ?? {},
    playerProviderId: entry.playerRef.providerId,
    points: entry.points ?? null,
    provider: roster.teamRef.provider,
    providerTeamId: roster.teamRef.providerId,
    scoringPeriod: roster.scoringPeriod,
    season: roster.season,
    slot: entry.slot,
    status: entry.status,
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

async function upsertMatchups(
  tx: LeagueScopedTx,
  leagueId: string,
  matchups: readonly NormalizedMatchup[],
): Promise<MatchupUpsertResult> {
  if (matchups.length === 0) {
    return { changedIds: [], scoringPeriods: [], stats: stats(0, 0) };
  }

  const rows: MatchupUpsertRow[] = matchups.map((matchup) => ({
    awayScore: matchup.awayScore,
    awayTeamProviderId: matchup.awayTeamRef.providerId,
    contentHash: stableContentHash(matchupHashPayload(matchup)),
    homeScore: matchup.homeScore,
    homeTeamProviderId: matchup.homeTeamRef.providerId,
    kind: matchup.kind ?? "head_to_head",
    leagueId,
    leagueProviderId: matchup.leagueProviderId,
    provider: matchup.provider,
    providerMatchupId: matchup.providerId,
    scoringPeriod: matchup.scoringPeriod,
    season: matchup.season,
    status: matchup.status,
    winner: matchup.winner,
  }));
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

  const row = {
    championshipScoringPeriod:
      league.postseason?.championshipScoringPeriod ?? null,
    contentHash: stableContentHash(leagueSeasonSettingsHashPayload(league)),
    isDynastyLeague: league.keeperSettings?.isDynasty ?? false,
    isKeeperLeague: league.keeperSettings?.isKeeper ?? false,
    keeperSettings: league.keeperSettings ?? {},
    leagueId,
    leagueProviderId: league.providerId,
    playoffStartScoringPeriod:
      league.postseason?.playoffStartScoringPeriod ?? null,
    playoffTeamCount: league.postseason?.playoffTeamCount ?? null,
    provider: league.provider,
    regularSeasonEndScoringPeriod:
      league.postseason?.regularSeasonEndScoringPeriod ?? null,
    scoringSettings: league.scoringSettings ?? {},
    season: league.season,
  };

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
        championshipScoringPeriod: sql`excluded.championship_scoring_period`,
        contentHash: sql`excluded.content_hash`,
        isDynastyLeague: sql`excluded.is_dynasty_league`,
        isKeeperLeague: sql`excluded.is_keeper_league`,
        keeperSettings: sql`excluded.keeper_settings`,
        playoffStartScoringPeriod: sql`excluded.playoff_start_scoring_period`,
        playoffTeamCount: sql`excluded.playoff_team_count`,
        regularSeasonEndScoringPeriod: sql`excluded.regular_season_end_scoring_period`,
        scoringSettings: sql`excluded.scoring_settings`,
        updatedAt: sql`now()`,
      },
      where: sql`${leagueSeasonSettings.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: leagueSeasonSettings.id });

  return stats(1, changed.length);
}

async function upsertRosterEntries(
  tx: LeagueScopedTx,
  leagueId: string,
  leagueProviderId: string,
  rosters: readonly NormalizedRoster[],
): Promise<EntitySyncStats> {
  const rows = rosters.flatMap((roster) =>
    roster.entries.map((entry) => ({
      contentHash: stableContentHash(rosterEntryHashPayload({ entry, roster })),
      isKeeper: entry.isKeeper ?? false,
      leagueId,
      leagueProviderId,
      metadata: entry.metadata ?? {},
      points: entry.points ?? null,
      provider: roster.teamRef.provider,
      providerPlayerId: entry.playerRef.providerId,
      providerTeamId: roster.teamRef.providerId,
      scoringPeriod: roster.scoringPeriod,
      season: roster.season,
      slot: entry.slot,
      status: entry.status,
    })),
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
        contentHash: sql`excluded.content_hash`,
        isKeeper: sql`excluded.is_keeper`,
        metadata: sql`excluded.metadata`,
        points: sql`excluded.points`,
        slot: sql`excluded.slot`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
      },
      where: sql`${fantasyRosterEntries.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: fantasyRosterEntries.id });

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
  explicit,
  finalStandings,
  matchups,
  members,
  teams,
  transactions,
}: {
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
    transactions[0]?.leagueProviderId;

  if (!resolved) {
    throw new Error("normalized rows require a provider league id");
  }

  return resolved;
}

export async function persistNormalizedLeagueRows({
  db,
  finalStandings = [],
  league,
  leagueId,
  leagueProviderId,
  matchups,
  members,
  rosters = [],
  teams,
  transactions = [],
}: PersistNormalizedLeagueRowsInput): Promise<PersistNormalizedLeagueRowsResult> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const resolvedLeagueProviderId = resolveLeagueProviderId({
      explicit: leagueProviderId,
      finalStandings,
      matchups,
      members,
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
    const matchupUpsert = await upsertMatchups(tx, leagueId, matchups);
    const finalStandingStats = await upsertFinalStandings(
      tx,
      leagueId,
      finalStandings,
    );
    const leagueSeasonSettingsStats = await upsertLeagueSeasonSettings(
      tx,
      leagueId,
      league,
    );
    const rosterStats = await upsertRosterEntries(
      tx,
      leagueId,
      resolvedLeagueProviderId,
      rosters,
    );
    const transactionStats = await upsertTransactions(
      tx,
      leagueId,
      transactions,
    );

    return {
      changedTransactions: transactionStats.changedTransactions,
      changedMatchupIds: matchupUpsert.changedIds,
      changedMatchupScoringPeriods: matchupUpsert.scoringPeriods,
      finalStandingStats,
      leagueSeasonSettingsStats,
      matchupStats: matchupUpsert.stats,
      memberStats,
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
        rosterObservation = {
          details: { rosterCount: rosterResult.value.length },
          itemCount: rosterResult.value.reduce(
            (total, roster) => total + roster.entries.length,
            0,
          ),
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
        transactionObservation = {
          details: { transactionCount: transactionResult.value.length },
          itemCount: transactionResult.value.length,
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

  const leagueWrite = leagueValue
    ? await upsertLeague(db, leagueValue)
    : { changed: 0, id: input.leagueId };
  if (!leagueWrite.id) {
    throw new Error("current league sync requires a league id");
  }
  const scoped = await persistNormalizedLeagueRows({
    db,
    league: leagueValue,
    leagueId: leagueWrite.id,
    leagueProviderId: leagueValue?.providerId ?? ref.providerId,
    matchups: matchups.value,
    members: members.value,
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
    rosters: scoped.rosterStats,
    transactions: scoped.transactionStats,
  });
}
