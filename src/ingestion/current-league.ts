import { and, eq, sql } from "drizzle-orm";
import { err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  leagues,
} from "@/db/schema";
import type {
  FantasyProvider,
  FantasyProviderSession,
  NormalizedLeague,
  NormalizedMatchup,
  NormalizedMember,
  NormalizedTeam,
  ProviderError,
  ProviderLeagueRef,
} from "@/providers";
import { stableContentHash } from "./hash";

export type CurrentLeagueProvider<Session extends FantasyProviderSession> =
  Pick<
    FantasyProvider<unknown, Session>,
    "getLeague" | "getMatchups" | "getMembers" | "getTeams"
  >;

export interface EntitySyncStats {
  total: number;
  changed: number;
  unchanged: number;
}

export interface CurrentLeagueSyncResult {
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
}

export type CurrentLeagueSyncError = ProviderError;

export interface CurrentLeagueSyncInput<
  Session extends FantasyProviderSession,
> {
  db: Db;
  provider: CurrentLeagueProvider<Session>;
  ref: ProviderLeagueRef;
  session: Session;
}

type LeagueUpsertResult = {
  id: string;
  changed: number;
};

function stats(total: number, changed: number): EntitySyncStats {
  return {
    total,
    changed,
    unchanged: total - changed,
  };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function teamHashPayload(team: NormalizedTeam) {
  return {
    abbrev: team.abbrev,
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
    leagueProviderId: matchup.leagueProviderId,
    provider: matchup.provider,
    providerId: matchup.providerId,
    scoringPeriod: matchup.scoringPeriod,
    season: matchup.season,
    status: matchup.status,
    winner: matchup.winner,
  };
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
      size: league.size,
      currentScoringPeriod: league.currentScoringPeriod,
      status: league.status,
    })
    .onConflictDoUpdate({
      target: [leagues.provider, leagues.providerLeagueId],
      set: {
        currentScoringPeriod: sql`excluded.current_scoring_period`,
        name: sql`excluded.name`,
        scoringType: sql`excluded.scoring_type`,
        season: sql`excluded.season`,
        size: sql`excluded.size`,
        sport: sql`excluded.sport`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
      },
      where: sql`
        ${leagues.name} is distinct from excluded.name
        or ${leagues.season} is distinct from excluded.season
        or ${leagues.sport} is distinct from excluded.sport
        or ${leagues.scoringType} is distinct from excluded.scoring_type
        or ${leagues.size} is distinct from excluded.size
        or ${leagues.currentScoringPeriod} is distinct from excluded.current_scoring_period
        or ${leagues.status} is distinct from excluded.status
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
): Promise<EntitySyncStats> {
  if (matchups.length === 0) {
    return stats(0, 0);
  }

  const rows = matchups.map((matchup) => ({
    awayScore: matchup.awayScore,
    awayTeamProviderId: matchup.awayTeamRef.providerId,
    contentHash: stableContentHash(matchupHashPayload(matchup)),
    homeScore: matchup.homeScore,
    homeTeamProviderId: matchup.homeTeamRef.providerId,
    leagueId,
    leagueProviderId: matchup.leagueProviderId,
    provider: matchup.provider,
    providerMatchupId: matchup.providerId,
    scoringPeriod: matchup.scoringPeriod,
    season: matchup.season,
    status: matchup.status,
    winner: matchup.winner,
  }));

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
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
        winner: sql`excluded.winner`,
      },
      where: sql`${fantasyMatchups.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: fantasyMatchups.id });

  return stats(rows.length, changed.length);
}

export async function syncCurrentLeague<
  Session extends FantasyProviderSession,
>({
  db,
  provider,
  ref,
  session,
}: CurrentLeagueSyncInput<Session>): Promise<
  Result<CurrentLeagueSyncResult, CurrentLeagueSyncError>
> {
  const league = await provider.getLeague(session, ref);
  if (!league.ok) {
    return err(league.error);
  }

  const [teams, members, matchups] = await Promise.all([
    provider.getTeams(session, ref),
    provider.getMembers(session, ref),
    provider.getMatchups(session, ref),
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

  const leagueWrite = await upsertLeague(db, league.value);
  const scoped = await withLeagueContext(db, leagueWrite.id, async (tx) => {
    const teamStats = await upsertTeams(tx, leagueWrite.id, teams.value);
    const memberStats = await upsertMembers(tx, leagueWrite.id, members.value);
    const matchupStats = await upsertMatchups(
      tx,
      leagueWrite.id,
      matchups.value,
    );

    return { matchupStats, memberStats, teamStats };
  });

  return ok({
    league: {
      id: leagueWrite.id,
      provider: league.value.provider,
      providerLeagueId: league.value.providerId,
      season: league.value.season,
      changed: leagueWrite.changed,
      unchanged: 1 - leagueWrite.changed,
    },
    teams: scoped.teamStats,
    members: scoped.memberStats,
    matchups: scoped.matchupStats,
  });
}
