import { and, asc, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { AiPersona } from "@/ai";
import {
  buildPersonaBylineMap,
  type PersonaBylineMap,
  resolvePersonaByline,
} from "@/ai/persona-display";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  allTimeRecords,
  members as authMembers,
  contentItems,
  dataIntegrityChecks,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  identityMappings,
  leagueMemberIdentityClaims,
  leagues,
  type Member,
  persons,
  seasonStatistics,
} from "@/db/schema";
import { articleDek, articleHeroImageUrl } from "@/news/article-metadata";
import {
  type LeaguePublicationSectionId,
  type PublicationSection,
  resolveLeaguePublicationSection,
} from "@/news/sections";
import type { FantasyProviderId } from "@/providers";
import { RECORD_TYPE_LABELS, type RecordType } from "@/stats";

export interface LeagueHomeTeam {
  id: string;
  providerTeamId: string;
  name: string;
  abbrev: string;
  logo: string | null;
  isClaimedByUser?: boolean;
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

export interface LeagueHomeStoryline {
  id: string;
  title: string;
  summary: string;
  dek: string;
  authorPersona: AiPersona | null;
  byline: string;
  publishedAt: string;
  section: PublicationSection<LeaguePublicationSectionId>;
  thumbnailUrl: string;
}

export interface LeagueHomeActivationAllTime {
  losses: number;
  pointsAgainst: number;
  pointsFor: number;
  seasons: number;
  ties: number;
  winPercentage: number;
  wins: number;
}

export interface LeagueHomeActivation {
  allTime: LeagueHomeActivationAllTime | null;
  castTeaser: {
    mode: "team_reference" | "latest" | "empty";
    message: string;
    storyline: LeagueHomeStoryline | null;
  };
  currentMatchup: LeagueHomeMatchup | null;
  providerMemberId: string;
  records: LeagueHomeRecord[];
  team: LeagueHomeStanding;
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
  storylines: LeagueHomeStoryline[];
  standings: LeagueHomeStanding[];
  teams: LeagueHomeTeam[];
  activation: LeagueHomeActivation | null;
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

type IdentityClaimRow = Pick<
  typeof leagueMemberIdentityClaims.$inferSelect,
  "providerMemberId" | "providerTeamIds"
>;

type IdentityMappingRow = Pick<
  typeof identityMappings.$inferSelect,
  "personId" | "season"
>;

type SeasonStatisticRow = Pick<
  typeof seasonStatistics.$inferSelect,
  "losses" | "pointsAgainst" | "pointsFor" | "season" | "ties" | "wins"
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

type StorylineRow = Pick<
  typeof contentItems.$inferSelect,
  "authorPersona" | "id" | "metadata" | "publishedAt" | "summary" | "title"
>;

interface ScopedActivationRows {
  identityClaim: IdentityClaimRow;
  matchedStoryline: StorylineRow | null;
  personIds: string[];
  seasonStats: SeasonStatisticRow[];
}

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
  claimedProviderTeamIds: ReadonlySet<string>,
): LeagueHomeTeam {
  return {
    abbrev: team.abbrev,
    id: team.id,
    isClaimedByUser: claimedProviderTeamIds.has(team.providerTeamId),
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
  claimedProviderTeamIds: ReadonlySet<string>,
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
    ...toHomeTeam(team, membersByProviderId, claimedProviderTeamIds),
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
      const awayTeam = matchup.awayTeamProviderId
        ? teamsByProviderId.get(matchup.awayTeamProviderId)
        : undefined;
      return {
        away: {
          abbrev: awayTeam?.abbrev ?? matchup.awayTeamProviderId ?? "BYE",
          isWinner: matchup.winner === "away",
          name:
            awayTeam?.name ??
            (matchup.awayTeamProviderId
              ? `Team ${matchup.awayTeamProviderId}`
              : "BYE"),
          score: matchup.awayScore,
          teamId: matchup.awayTeamProviderId ?? "bye",
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

function buildStorylines(
  rows: readonly StorylineRow[],
  personaBylines: PersonaBylineMap,
): LeagueHomeStoryline[] {
  return rows.map((row) => ({
    authorPersona: row.authorPersona,
    byline: resolvePersonaByline(row.authorPersona, personaBylines).label,
    dek: articleDek(row.metadata, row.summary),
    id: row.id,
    publishedAt: row.publishedAt.toISOString(),
    section: resolveLeaguePublicationSection({
      authorPersona: row.authorPersona,
      kind: "blog",
      metadata: row.metadata,
      summary: row.summary,
      title: row.title,
    }),
    summary: row.summary,
    thumbnailUrl: articleHeroImageUrl(row.metadata),
    title: row.title,
  }));
}

function normalizedSearchTerm(value: string): string {
  return value.replace(/[%_]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function searchPattern(value: string): string {
  return `%${normalizedSearchTerm(value).replace(/\s+/g, "%")}%`;
}

function contentMatchesSearchTerm(term: string): SQL {
  const pattern = searchPattern(term);
  return sql`(
    lower(${contentItems.title}) like ${pattern}
    or lower(${contentItems.summary}) like ${pattern}
    or lower(${contentItems.body}) like ${pattern}
    or lower(${contentItems.metadata}::text) like ${pattern}
  )`;
}

function activationSearchTerms({
  identityClaim,
  members,
  teams,
}: {
  identityClaim: IdentityClaimRow;
  members: readonly FantasyMemberRow[];
  teams: readonly FantasyTeamRow[];
}): string[] {
  const claimedTeamIds = new Set(identityClaim.providerTeamIds);
  const ownerMemberIds = new Set([identityClaim.providerMemberId]);
  const claimedTeams = teams.filter(
    (team) =>
      claimedTeamIds.has(team.providerTeamId) ||
      team.ownerMemberIds.includes(identityClaim.providerMemberId),
  );
  for (const team of claimedTeams) {
    for (const ownerMemberId of team.ownerMemberIds) {
      ownerMemberIds.add(ownerMemberId);
    }
  }

  return sortedUnique([
    ...claimedTeams.map((team) => team.name),
    ...members
      .filter((member) => ownerMemberIds.has(member.providerMemberId))
      .map((member) => member.displayName),
  ]).filter((term) => normalizedSearchTerm(term).length >= 3);
}

function selectedActivationPersonIds(
  mappings: readonly IdentityMappingRow[],
  leagueSeason: number,
): string[] {
  const currentSeasonIds = mappings
    .filter((mapping) => mapping.season === leagueSeason)
    .map((mapping) => mapping.personId);
  return sortedUnique(
    currentSeasonIds.length > 0
      ? currentSeasonIds
      : mappings.map((mapping) => mapping.personId),
  );
}

function buildAllTimeStats(
  rows: readonly SeasonStatisticRow[],
): LeagueHomeActivationAllTime | null {
  if (rows.length === 0) {
    return null;
  }

  const totals = rows.reduce(
    (acc, row) => ({
      losses: acc.losses + row.losses,
      pointsAgainst: acc.pointsAgainst + row.pointsAgainst,
      pointsFor: acc.pointsFor + row.pointsFor,
      ties: acc.ties + row.ties,
      wins: acc.wins + row.wins,
    }),
    {
      losses: 0,
      pointsAgainst: 0,
      pointsFor: 0,
      ties: 0,
      wins: 0,
    },
  );
  const decisions = totals.wins + totals.losses + totals.ties;

  return {
    ...totals,
    pointsAgainst: Math.round(totals.pointsAgainst * 100) / 100,
    pointsFor: Math.round(totals.pointsFor * 100) / 100,
    seasons: new Set(rows.map((row) => row.season)).size,
    winPercentage:
      decisions > 0 ? (totals.wins + totals.ties / 2) / decisions : 0,
  };
}

function currentMatchupForTeam(
  matchups: readonly LeagueHomeMatchup[],
  providerTeamId: string,
): LeagueHomeMatchup | null {
  return (
    matchups.find(
      (matchup) =>
        matchup.home.teamId === providerTeamId ||
        matchup.away.teamId === providerTeamId,
    ) ?? null
  );
}

function buildActivation({
  activation,
  currentMatchups,
  latestStoryline,
  personaBylines,
  personNamesById,
  recordRows,
  standings,
}: {
  activation: ScopedActivationRows | null;
  currentMatchups: readonly LeagueHomeMatchup[];
  latestStoryline: LeagueHomeStoryline | null;
  personaBylines: PersonaBylineMap;
  personNamesById: ReadonlyMap<string, string>;
  recordRows: readonly RecordRow[];
  standings: readonly LeagueHomeStanding[];
}): LeagueHomeActivation | null {
  if (!activation) {
    return null;
  }

  const claimedProviderTeamIds = new Set(
    activation.identityClaim.providerTeamIds,
  );
  const team = standings.find((candidate) =>
    claimedProviderTeamIds.has(candidate.providerTeamId),
  );
  if (!team) {
    return null;
  }

  const activationRecords = buildRecords(
    recordRows.filter(
      (record) =>
        Boolean(record.holderPersonId) &&
        activation.personIds.includes(record.holderPersonId ?? ""),
    ),
    personNamesById,
  ).slice(0, 3);
  const matchedStorylines = buildStorylines(
    activation.matchedStoryline ? [activation.matchedStoryline] : [],
    personaBylines,
  );
  const matchedStoryline = matchedStorylines[0] ?? null;

  return {
    allTime: buildAllTimeStats(activation.seasonStats),
    castTeaser: matchedStoryline
      ? {
          message: `The cast has been covering ${team.name}.`,
          mode: "team_reference",
          storyline: matchedStoryline,
        }
      : latestStoryline
        ? {
            message: `The cast has been covering this league. ${team.name} is in the next one.`,
            mode: "latest",
            storyline: latestStoryline,
          }
        : {
            message: `${team.name} is on the board. The cast will have them in the next dispatch.`,
            mode: "empty",
            storyline: null,
          },
    currentMatchup: currentMatchupForTeam(currentMatchups, team.providerTeamId),
    providerMemberId: activation.identityClaim.providerMemberId,
    records: activationRecords,
    team,
  };
}

export async function getLeagueHomeData(
  db: Db,
  input: { leagueId: string; userId: string; userRole?: Member["role"] },
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

  const userRole =
    input.userRole ??
    (
      await db
        .select({ role: authMembers.role })
        .from(authMembers)
        .where(
          and(
            eq(authMembers.organizationId, input.leagueId),
            eq(authMembers.userId, input.userId),
          ),
        )
        .limit(1)
    )[0]?.role;

  if (!userRole) {
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

    const [identityClaim] = await tx
      .select({
        providerMemberId: leagueMemberIdentityClaims.providerMemberId,
        providerTeamIds: leagueMemberIdentityClaims.providerTeamIds,
      })
      .from(leagueMemberIdentityClaims)
      .where(
        and(
          eq(leagueMemberIdentityClaims.leagueId, input.leagueId),
          eq(leagueMemberIdentityClaims.userId, input.userId),
          eq(leagueMemberIdentityClaims.provider, league.provider),
        ),
      )
      .limit(1);

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

    const unresolvedIntegrityFailures = await tx
      .select({ id: dataIntegrityChecks.id })
      .from(dataIntegrityChecks)
      .where(
        and(
          eq(dataIntegrityChecks.leagueId, input.leagueId),
          eq(dataIntegrityChecks.status, "fail"),
        ),
      )
      .limit(1);

    const recordRows =
      unresolvedIntegrityFailures.length > 0
        ? []
        : await tx
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

    const storylineRows = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        id: contentItems.id,
        metadata: contentItems.metadata,
        publishedAt: contentItems.publishedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.kind, "blog"),
          contentItemIsPublished(),
        ),
      )
      .orderBy(desc(contentItems.publishedAt))
      .limit(3);

    const personaBylines = buildPersonaBylineMap(
      await tx
        .select({
          name: aiPersonaCards.name,
          persona: aiPersonaCards.persona,
          purpose: aiPersonaCards.purpose,
        })
        .from(aiPersonaCards)
        .where(eq(aiPersonaCards.leagueId, input.leagueId)),
    );

    let activation: ScopedActivationRows | null = null;
    if (identityClaim) {
      const providerTeamIds = sortedUnique(
        identityClaim.providerTeamIds.length > 0
          ? identityClaim.providerTeamIds
          : teamRows
              .filter((team) =>
                team.ownerMemberIds.includes(identityClaim.providerMemberId),
              )
              .map((team) => team.providerTeamId),
      );
      const mappingRows =
        providerTeamIds.length > 0
          ? await tx
              .select({
                personId: identityMappings.personId,
                season: identityMappings.season,
              })
              .from(identityMappings)
              .where(
                and(
                  eq(identityMappings.leagueId, input.leagueId),
                  eq(identityMappings.provider, league.provider),
                  inArray(identityMappings.providerTeamId, providerTeamIds),
                ),
              )
          : [];
      const personIds = selectedActivationPersonIds(mappingRows, league.season);
      const seasonStatRows =
        personIds.length > 0
          ? await tx
              .select({
                losses: seasonStatistics.losses,
                pointsAgainst: seasonStatistics.pointsAgainst,
                pointsFor: seasonStatistics.pointsFor,
                season: seasonStatistics.season,
                ties: seasonStatistics.ties,
                wins: seasonStatistics.wins,
              })
              .from(seasonStatistics)
              .where(
                and(
                  eq(seasonStatistics.leagueId, input.leagueId),
                  inArray(seasonStatistics.personId, personIds),
                ),
              )
              .orderBy(asc(seasonStatistics.season))
          : [];
      const searchTerms = activationSearchTerms({
        identityClaim: {
          ...identityClaim,
          providerTeamIds,
        },
        members: memberRows,
        teams: teamRows,
      });
      const searchConditions = searchTerms.map(contentMatchesSearchTerm);
      const [matchedStoryline] =
        searchConditions.length > 0
          ? await tx
              .select({
                authorPersona: contentItems.authorPersona,
                id: contentItems.id,
                metadata: contentItems.metadata,
                publishedAt: contentItems.publishedAt,
                summary: contentItems.summary,
                title: contentItems.title,
              })
              .from(contentItems)
              .where(
                and(
                  eq(contentItems.leagueId, input.leagueId),
                  eq(contentItems.kind, "blog"),
                  contentItemIsPublished(),
                  or(...searchConditions),
                ),
              )
              .orderBy(
                desc(contentItems.publishedAt),
                desc(contentItems.createdAt),
              )
              .limit(1)
          : [];

      activation = {
        identityClaim: {
          ...identityClaim,
          providerTeamIds,
        },
        matchedStoryline: matchedStoryline ?? null,
        personIds,
        seasonStats: seasonStatRows satisfies SeasonStatisticRow[],
      };
    }

    return {
      activation,
      matchups: matchupRows satisfies FantasyMatchupRow[],
      members: memberRows satisfies FantasyMemberRow[],
      personaBylines,
      personNamesById: new Map(
        personRows.map((person) => [person.id, person.canonicalName]),
      ),
      records: recordRows satisfies RecordRow[],
      storylines: storylineRows satisfies StorylineRow[],
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
    toHomeTeam(
      team,
      membersByProviderId,
      new Set(scoped.activation?.identityClaim.providerTeamIds ?? []),
    ),
  );
  const teamsByProviderId = new Map(
    teams.map((team) => [team.providerTeamId, team]),
  );
  const currentPeriod = activeScoringPeriod(
    league.currentScoringPeriod,
    scoped.matchups,
  );
  const claimedProviderTeamIds = new Set(
    scoped.activation?.identityClaim.providerTeamIds ?? [],
  );
  const currentMatchups = buildCurrentMatchups(
    scoped.matchups,
    teamsByProviderId,
    currentPeriod,
  );
  const records = buildRecords(scoped.records, scoped.personNamesById);
  const standings = buildStandings(
    scoped.teams,
    membersByProviderId,
    claimedProviderTeamIds,
  );
  const storylines = buildStorylines(scoped.storylines, scoped.personaBylines);

  return {
    status: "ready",
    data: {
      activation: buildActivation({
        activation: scoped.activation,
        currentMatchups,
        latestStoryline: storylines[0] ?? null,
        personaBylines: scoped.personaBylines,
        personNamesById: scoped.personNamesById,
        recordRows: scoped.records,
        standings,
      }),
      currentMatchups,
      currentScoringPeriod: currentPeriod,
      league,
      records,
      storylines,
      standings,
      teams,
      totals: {
        matchups: scoped.matchups.length,
        members: scoped.members.length,
        teams: scoped.teams.length,
      },
      userRole,
    },
  };
}
