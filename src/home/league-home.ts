import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  members as authMembers,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  leagues,
  type Member,
  persons,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import { RECORD_TYPE_LABELS, type RecordType } from "@/stats";

export interface LeagueHomeTeam {
  id: string;
  providerTeamId: string;
  name: string;
  abbrev: string;
  logo: string | null;
  managerNames: string[];
}

export interface LeagueHomeStanding extends LeagueHomeTeam {
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  gamesBack: number;
  playoffLineAfter: boolean;
}

export interface LeagueHomeMatchupSide {
  teamId: string;
  name: string;
  abbrev: string;
  score: number;
  isWinner: boolean;
}

export interface LeagueHomeMatchup {
  id: string;
  scoringPeriod: number;
  status: "scheduled" | "in_progress" | "final" | "unknown";
  home: LeagueHomeMatchupSide;
  away: LeagueHomeMatchupSide;
}

export interface LeagueHomeRecord {
  id: string;
  label: string;
  recordType: RecordType;
  holderName: string | null;
  opponentName: string | null;
  value: number;
  season: number | null;
  scoringPeriod: number | null;
  previousRecordId: string | null;
}

export interface LeagueHomeData {
  league: {
    id: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    name: string;
    season: number;
    sport: "ffl" | "unknown";
    scoringType: string;
    size: number;
    currentScoringPeriod: number;
    status: "preseason" | "in_season" | "complete" | "unknown";
  };
  userRole: Member["role"];
  records: LeagueHomeRecord[];
  standings: LeagueHomeStanding[];
  teams: LeagueHomeTeam[];
  currentScoringPeriod: number | null;
  currentMatchups: LeagueHomeMatchup[];
  totals: {
    teams: number;
    members: number;
    matchups: number;
  };
}

export type LeagueHomeLoadResult =
  | { status: "ready"; data: LeagueHomeData }
  | { status: "not_found" }
  | { status: "forbidden" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FantasyTeamRow = Pick<
  typeof fantasyTeams.$inferSelect,
  | "abbrev"
  | "id"
  | "logo"
  | "losses"
  | "name"
  | "ownerMemberIds"
  | "pointsAgainst"
  | "pointsFor"
  | "providerTeamId"
  | "ties"
  | "wins"
>;

type FantasyMemberRow = Pick<
  typeof fantasyMembers.$inferSelect,
  "displayName" | "providerMemberId"
>;

type FantasyMatchupRow = Pick<
  typeof fantasyMatchups.$inferSelect,
  | "awayScore"
  | "awayTeamProviderId"
  | "homeScore"
  | "homeTeamProviderId"
  | "id"
  | "providerMatchupId"
  | "scoringPeriod"
  | "status"
  | "winner"
>;

type RecordRow = Pick<
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

function compareTeamsByProviderId(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareTeamsByProviderId);
}

function managerNamesFor(
  ownerMemberIds: readonly string[],
  membersByProviderId: ReadonlyMap<string, string>,
): string[] {
  const names = ownerMemberIds
    .map((ownerId) => membersByProviderId.get(ownerId))
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names : ["Unknown manager"];
}

function toHomeTeam(
  team: FantasyTeamRow,
  membersByProviderId: ReadonlyMap<string, string>,
): LeagueHomeTeam {
  return {
    abbrev: team.abbrev,
    id: team.id,
    logo: team.logo,
    managerNames: managerNamesFor(team.ownerMemberIds, membersByProviderId),
    name: team.name,
    providerTeamId: team.providerTeamId,
  };
}

function recordGamesBack(
  team: Pick<FantasyTeamRow, "losses" | "wins">,
  leader: Pick<FantasyTeamRow, "losses" | "wins"> | undefined,
): number {
  if (!leader) {
    return 0;
  }
  return Math.max(
    0,
    (leader.wins - team.wins + team.losses - leader.losses) / 2,
  );
}

function buildStandings(
  teams: readonly FantasyTeamRow[],
  membersByProviderId: ReadonlyMap<string, string>,
): LeagueHomeStanding[] {
  const sorted = [...teams].sort((left, right) => {
    return (
      right.wins - left.wins ||
      left.losses - right.losses ||
      right.ties - left.ties ||
      right.pointsFor - left.pointsFor ||
      left.pointsAgainst - right.pointsAgainst ||
      left.name.localeCompare(right.name)
    );
  });
  const leader = sorted[0];
  const playoffCut = sorted.length >= 8 ? Math.ceil(sorted.length / 2) : 0;

  return sorted.map((team, index) => ({
    ...toHomeTeam(team, membersByProviderId),
    gamesBack: recordGamesBack(team, leader),
    losses: team.losses,
    playoffLineAfter: playoffCut > 0 && index + 1 === playoffCut,
    pointsAgainst: team.pointsAgainst,
    pointsFor: team.pointsFor,
    rank: index + 1,
    ties: team.ties,
    wins: team.wins,
  }));
}

function activeScoringPeriod(
  leagueCurrentPeriod: number,
  matchups: readonly FantasyMatchupRow[],
): number | null {
  if (leagueCurrentPeriod > 0) {
    return leagueCurrentPeriod;
  }

  const periods = matchups
    .map((matchup) => matchup.scoringPeriod)
    .filter((period) => period > 0);
  return periods.length > 0 ? Math.min(...periods) : null;
}

function buildCurrentMatchups(
  matchups: readonly FantasyMatchupRow[],
  teamsByProviderId: ReadonlyMap<string, LeagueHomeTeam>,
  period: number | null,
): LeagueHomeMatchup[] {
  if (period === null) {
    return [];
  }

  return matchups
    .filter((matchup) => matchup.scoringPeriod === period)
    .sort((left, right) =>
      compareTeamsByProviderId(left.providerMatchupId, right.providerMatchupId),
    )
    .map((matchup) => {
      const homeTeam = teamsByProviderId.get(matchup.homeTeamProviderId);
      const awayTeam = teamsByProviderId.get(matchup.awayTeamProviderId);
      return {
        away: {
          abbrev: awayTeam?.abbrev ?? matchup.awayTeamProviderId,
          isWinner: matchup.winner === "away",
          name: awayTeam?.name ?? `Team ${matchup.awayTeamProviderId}`,
          score: matchup.awayScore,
          teamId: matchup.awayTeamProviderId,
        },
        home: {
          abbrev: homeTeam?.abbrev ?? matchup.homeTeamProviderId,
          isWinner: matchup.winner === "home",
          name: homeTeam?.name ?? `Team ${matchup.homeTeamProviderId}`,
          score: matchup.homeScore,
          teamId: matchup.homeTeamProviderId,
        },
        id: matchup.id,
        scoringPeriod: matchup.scoringPeriod,
        status: matchup.status,
      };
    });
}

function recordLabel(recordType: string): string {
  return (
    RECORD_TYPE_LABELS[recordType as RecordType] ??
    recordType.replaceAll("_", " ")
  );
}

function buildRecords(
  records: readonly RecordRow[],
  personNamesById: ReadonlyMap<string, string>,
): LeagueHomeRecord[] {
  return records
    .filter((record) => record.recordType in RECORD_TYPE_LABELS)
    .sort((left, right) =>
      recordLabel(left.recordType).localeCompare(recordLabel(right.recordType)),
    )
    .map((record) => ({
      holderName: record.holderPersonId
        ? (personNamesById.get(record.holderPersonId) ?? null)
        : null,
      id: record.id,
      label: recordLabel(record.recordType),
      opponentName: record.opponentPersonId
        ? (personNamesById.get(record.opponentPersonId) ?? null)
        : null,
      previousRecordId: record.previousRecordId,
      recordType: record.recordType as RecordType,
      scoringPeriod: record.scoringPeriod,
      season: record.season,
      value: record.value,
    }));
}

export async function getLeagueHomeData(
  db: Db,
  input: { leagueId: string; userId: string },
): Promise<LeagueHomeLoadResult> {
  if (!UUID_RE.test(input.leagueId)) {
    return { status: "not_found" };
  }

  const [league] = await db
    .select({
      currentScoringPeriod: leagues.currentScoringPeriod,
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      scoringType: leagues.scoringType,
      season: leagues.season,
      size: leagues.size,
      sport: leagues.sport,
      status: leagues.status,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const [membership] = await db
    .select({ role: authMembers.role })
    .from(authMembers)
    .where(
      and(
        eq(authMembers.organizationId, input.leagueId),
        eq(authMembers.userId, input.userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return { status: "forbidden" };
  }

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const teamRows = await tx
      .select({
        abbrev: fantasyTeams.abbrev,
        id: fantasyTeams.id,
        logo: fantasyTeams.logo,
        losses: fantasyTeams.losses,
        name: fantasyTeams.name,
        ownerMemberIds: fantasyTeams.ownerMemberIds,
        pointsAgainst: fantasyTeams.pointsAgainst,
        pointsFor: fantasyTeams.pointsFor,
        providerTeamId: fantasyTeams.providerTeamId,
        ties: fantasyTeams.ties,
        wins: fantasyTeams.wins,
      })
      .from(fantasyTeams)
      .where(
        and(
          eq(fantasyTeams.leagueId, input.leagueId),
          eq(fantasyTeams.season, league.season),
        ),
      )
      .orderBy(asc(fantasyTeams.name));

    const memberRows = await tx
      .select({
        displayName: fantasyMembers.displayName,
        providerMemberId: fantasyMembers.providerMemberId,
      })
      .from(fantasyMembers)
      .where(
        and(
          eq(fantasyMembers.leagueId, input.leagueId),
          eq(fantasyMembers.season, league.season),
        ),
      );

    const matchupRows = await tx
      .select({
        awayScore: fantasyMatchups.awayScore,
        awayTeamProviderId: fantasyMatchups.awayTeamProviderId,
        homeScore: fantasyMatchups.homeScore,
        homeTeamProviderId: fantasyMatchups.homeTeamProviderId,
        id: fantasyMatchups.id,
        providerMatchupId: fantasyMatchups.providerMatchupId,
        scoringPeriod: fantasyMatchups.scoringPeriod,
        status: fantasyMatchups.status,
        winner: fantasyMatchups.winner,
      })
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.leagueId, input.leagueId),
          eq(fantasyMatchups.season, league.season),
        ),
      )
      .orderBy(
        asc(fantasyMatchups.scoringPeriod),
        asc(fantasyMatchups.providerMatchupId),
      );

    const recordRows = await tx
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
      .orderBy(asc(allTimeRecords.recordType));

    const personIds = sortedUnique(
      recordRows.flatMap((record) => [
        ...(record.holderPersonId ? [record.holderPersonId] : []),
        ...(record.opponentPersonId ? [record.opponentPersonId] : []),
      ]),
    );
    const personRows =
      personIds.length > 0
        ? await tx
            .select({
              canonicalName: persons.canonicalName,
              id: persons.id,
            })
            .from(persons)
            .where(
              and(
                eq(persons.leagueId, input.leagueId),
                inArray(persons.id, personIds),
              ),
            )
        : [];

    return {
      matchups: matchupRows satisfies FantasyMatchupRow[],
      members: memberRows satisfies FantasyMemberRow[],
      personNamesById: new Map(
        personRows.map((person) => [person.id, person.canonicalName]),
      ),
      records: recordRows satisfies RecordRow[],
      teams: teamRows satisfies FantasyTeamRow[],
    };
  });

  const membersByProviderId = new Map(
    scoped.members.map((member) => [
      member.providerMemberId,
      member.displayName,
    ]),
  );
  const teams = scoped.teams.map((team) =>
    toHomeTeam(team, membersByProviderId),
  );
  const teamsByProviderId = new Map(
    teams.map((team) => [team.providerTeamId, team]),
  );
  const currentPeriod = activeScoringPeriod(
    league.currentScoringPeriod,
    scoped.matchups,
  );

  return {
    status: "ready",
    data: {
      currentMatchups: buildCurrentMatchups(
        scoped.matchups,
        teamsByProviderId,
        currentPeriod,
      ),
      currentScoringPeriod: currentPeriod,
      league,
      records: buildRecords(scoped.records, scoped.personNamesById),
      standings: buildStandings(scoped.teams, membersByProviderId),
      teams,
      totals: {
        matchups: scoped.matchups.length,
        members: scoped.members.length,
        teams: scoped.teams.length,
      },
      userRole: membership.role,
    },
  };
}
