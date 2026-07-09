import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AiPersona } from "@/ai/personas";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  fantasyMatchups,
  fantasyTeams,
  leagueMemberIdentityClaims,
  leagues,
  onboardingDiscoveredLeagues,
  providerCredentials,
} from "@/db/schema";
import {
  type ListLeagueSwitcherItemsInput,
  listLeagueSwitcherItemsForUser,
} from "@/navigation/league-switcher-data";
import type { LeagueSwitcherItem } from "@/navigation/league-switcher-model";
import type { FantasyProviderId } from "@/providers";

export interface YourLeaguesLandingData {
  readonly leagues: YourLeagueCard[];
}

export interface YourLeagueCard {
  readonly href: string;
  readonly latestPress: YourLeaguePressHeadline | null;
  readonly leagueId: string;
  readonly logo: string | null;
  readonly matchup: YourLeagueMatchup | null;
  readonly name: string;
  readonly provider: FantasyProviderId;
  readonly providerLabel: string;
}

export interface YourLeaguePressHeadline {
  readonly authorPersona: AiPersona | null;
  readonly id: string;
  readonly publishedAt: string;
  readonly summary: string;
  readonly title: string;
}

export interface YourLeagueMatchup {
  readonly away: YourLeagueMatchupSide;
  readonly home: YourLeagueMatchupSide;
  readonly id: string;
  readonly isUserMatchup: boolean;
  readonly opponentTeamName: string | null;
  readonly scoringPeriod: number;
  readonly status: "scheduled" | "in_progress" | "final" | "unknown";
  readonly userTeamName: string | null;
}

export interface YourLeagueMatchupSide {
  readonly isUserTeam: boolean;
  readonly name: string;
  readonly providerTeamId: string;
  readonly score: number;
}

type LeagueRow = Pick<
  typeof leagues.$inferSelect,
  "currentScoringPeriod" | "id" | "provider" | "providerLeagueId" | "season"
>;

type TeamRow = Pick<
  typeof fantasyTeams.$inferSelect,
  "name" | "ownerMemberIds" | "providerTeamId"
>;

type MatchupRow = Pick<
  typeof fantasyMatchups.$inferSelect,
  | "awayScore"
  | "awayTeamProviderId"
  | "homeScore"
  | "homeTeamProviderId"
  | "id"
  | "providerMatchupId"
  | "scoringPeriod"
  | "status"
>;

type IdentityClaimRow = Pick<
  typeof leagueMemberIdentityClaims.$inferSelect,
  "providerMemberId" | "providerTeamIds"
>;

type PressRow = Pick<
  typeof contentItems.$inferSelect,
  "authorPersona" | "id" | "publishedAt" | "summary" | "title"
>;

type CredentialRow = Pick<
  typeof providerCredentials.$inferSelect,
  "provider" | "subjectProviderId"
>;

type DiscoveredLeagueRow = Pick<
  typeof onboardingDiscoveredLeagues.$inferSelect,
  "provider" | "providerLeagueId" | "season" | "teamName"
>;

export async function getYourLeaguesLandingData(
  db: Db,
  input: Pick<ListLeagueSwitcherItemsInput, "userId">,
): Promise<YourLeaguesLandingData> {
  const listed = await listLeagueSwitcherItemsForUser(db, {
    userId: input.userId,
  });
  if (!listed.ok) {
    throw listed.error;
  }

  const items = listed.value;
  if (items.length === 0) {
    return { leagues: [] };
  }

  const leagueIds = items.map((item) => item.leagueId);
  const leagueRows = await db
    .select({
      currentScoringPeriod: leagues.currentScoringPeriod,
      id: leagues.id,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues)
    .where(inArray(leagues.id, leagueIds));
  const leagueById = new Map(leagueRows.map((row) => [row.id, row]));

  const credentialRows = await db
    .select({
      provider: providerCredentials.provider,
      subjectProviderId: providerCredentials.subjectProviderId,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.userId, input.userId));
  const credentialMemberIds = providerMemberIdsByProvider(credentialRows);

  const discoveredRows = await db
    .select({
      provider: onboardingDiscoveredLeagues.provider,
      providerLeagueId: onboardingDiscoveredLeagues.providerLeagueId,
      season: onboardingDiscoveredLeagues.season,
      teamName: onboardingDiscoveredLeagues.teamName,
    })
    .from(onboardingDiscoveredLeagues)
    .where(eq(onboardingDiscoveredLeagues.userId, input.userId));
  const discoveredTeamNames = discoveredTeamNamesByLeague(discoveredRows);

  const cards: YourLeagueCard[] = [];
  for (const item of items) {
    const league = leagueById.get(item.leagueId);
    if (!league) {
      continue;
    }
    const credentialIdsForProvider =
      credentialMemberIds.get(league.provider) ?? new Set<string>();

    cards.push(
      await buildLeagueCard(db, {
        credentialMemberIds: credentialIdsForProvider,
        discoveredTeamNames,
        item,
        league,
        userId: input.userId,
      }),
    );
  }

  return { leagues: cards };
}

async function buildLeagueCard(
  db: Db,
  input: {
    credentialMemberIds: ReadonlySet<string>;
    discoveredTeamNames: ReadonlyMap<string, Set<string>>;
    item: LeagueSwitcherItem;
    league: LeagueRow;
    userId: string;
  },
): Promise<YourLeagueCard> {
  const scoped = await withLeagueContext(db, input.league.id, async (tx) => {
    const claims = await tx
      .select({
        providerMemberId: leagueMemberIdentityClaims.providerMemberId,
        providerTeamIds: leagueMemberIdentityClaims.providerTeamIds,
      })
      .from(leagueMemberIdentityClaims)
      .where(
        and(
          eq(leagueMemberIdentityClaims.leagueId, input.league.id),
          eq(leagueMemberIdentityClaims.userId, input.userId),
          eq(leagueMemberIdentityClaims.provider, input.league.provider),
        ),
      );

    const teams = await tx
      .select({
        name: fantasyTeams.name,
        ownerMemberIds: fantasyTeams.ownerMemberIds,
        providerTeamId: fantasyTeams.providerTeamId,
      })
      .from(fantasyTeams)
      .where(
        and(
          eq(fantasyTeams.leagueId, input.league.id),
          eq(fantasyTeams.season, input.league.season),
        ),
      )
      .orderBy(asc(fantasyTeams.providerTeamId));

    const matchups = await tx
      .select({
        awayScore: fantasyMatchups.awayScore,
        awayTeamProviderId: fantasyMatchups.awayTeamProviderId,
        homeScore: fantasyMatchups.homeScore,
        homeTeamProviderId: fantasyMatchups.homeTeamProviderId,
        id: fantasyMatchups.id,
        providerMatchupId: fantasyMatchups.providerMatchupId,
        scoringPeriod: fantasyMatchups.scoringPeriod,
        status: fantasyMatchups.status,
      })
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.leagueId, input.league.id),
          eq(fantasyMatchups.season, input.league.season),
        ),
      )
      .orderBy(
        desc(fantasyMatchups.scoringPeriod),
        asc(fantasyMatchups.providerMatchupId),
      );

    const [latestPress] = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        id: contentItems.id,
        publishedAt: contentItems.publishedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.leagueId, input.league.id),
          eq(contentItems.kind, "blog"),
          contentItemIsPublished(),
        ),
      )
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
      .limit(1);

    return {
      claims: claims satisfies IdentityClaimRow[],
      latestPress: latestPress satisfies PressRow | undefined,
      matchups: matchups satisfies MatchupRow[],
      teams: teams satisfies TeamRow[],
    };
  });

  const discoveredTeamNames =
    input.discoveredTeamNames.get(
      discoveryKey(
        input.league.provider,
        input.league.providerLeagueId,
        input.league.season,
      ),
    ) ?? new Set<string>();
  const userTeamProviderId = findUserTeamProviderId({
    claims: scoped.claims,
    credentialMemberIds: input.credentialMemberIds,
    discoveredTeamNames,
    teams: scoped.teams,
  });

  return {
    href: `/leagues/${input.item.leagueId}`,
    latestPress: scoped.latestPress
      ? {
          authorPersona: scoped.latestPress.authorPersona,
          id: scoped.latestPress.id,
          publishedAt: scoped.latestPress.publishedAt.toISOString(),
          summary: scoped.latestPress.summary,
          title: scoped.latestPress.title,
        }
      : null,
    leagueId: input.item.leagueId,
    logo: input.item.logo,
    matchup: buildMatchup({
      currentScoringPeriod: input.league.currentScoringPeriod,
      matchups: scoped.matchups,
      teams: scoped.teams,
      userTeamProviderId,
    }),
    name: input.item.name,
    provider: input.item.provider,
    providerLabel: input.item.providerLabel,
  };
}

function buildMatchup(input: {
  currentScoringPeriod: number;
  matchups: readonly MatchupRow[];
  teams: readonly TeamRow[];
  userTeamProviderId: string | null;
}): YourLeagueMatchup | null {
  const scoringPeriod = displayScoringPeriod(
    input.currentScoringPeriod,
    input.matchups,
  );
  if (scoringPeriod === null) {
    return null;
  }

  const periodMatchups = input.matchups
    .filter((matchup) => matchup.scoringPeriod === scoringPeriod)
    .sort((left, right) =>
      left.providerMatchupId.localeCompare(right.providerMatchupId, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  const userTeamProviderId = input.userTeamProviderId;
  const selected =
    (userTeamProviderId
      ? periodMatchups.find((matchup) =>
          matchupIncludesTeam(matchup, userTeamProviderId),
        )
      : undefined) ?? periodMatchups[0];

  if (!selected) {
    return null;
  }

  const teamsByProviderId = new Map(
    input.teams.map((team) => [team.providerTeamId, team]),
  );
  const homeTeam = teamsByProviderId.get(selected.homeTeamProviderId);
  const awayTeam = selected.awayTeamProviderId
    ? teamsByProviderId.get(selected.awayTeamProviderId)
    : undefined;
  const homeName = homeTeam?.name ?? `Team ${selected.homeTeamProviderId}`;
  const awayName =
    awayTeam?.name ??
    (selected.awayTeamProviderId
      ? `Team ${selected.awayTeamProviderId}`
      : "BYE");
  const userSide = input.userTeamProviderId
    ? matchupSideForTeam(selected, input.userTeamProviderId)
    : null;

  return {
    away: {
      isUserTeam: userSide === "away",
      name: awayName,
      providerTeamId: selected.awayTeamProviderId ?? "bye",
      score: selected.awayScore,
    },
    home: {
      isUserTeam: userSide === "home",
      name: homeName,
      providerTeamId: selected.homeTeamProviderId,
      score: selected.homeScore,
    },
    id: selected.id,
    isUserMatchup: userSide !== null,
    opponentTeamName:
      userSide === "home" ? awayName : userSide === "away" ? homeName : null,
    scoringPeriod,
    status: selected.status,
    userTeamName:
      userSide === "home" ? homeName : userSide === "away" ? awayName : null,
  };
}

function findUserTeamProviderId(input: {
  claims: readonly IdentityClaimRow[];
  credentialMemberIds: ReadonlySet<string>;
  discoveredTeamNames: ReadonlySet<string>;
  teams: readonly TeamRow[];
}): string | null {
  const teamProviderIds = new Set(
    input.claims.flatMap((claim) => claim.providerTeamIds),
  );
  const claimedTeam = input.teams.find((team) =>
    teamProviderIds.has(team.providerTeamId),
  );
  if (claimedTeam) {
    return claimedTeam.providerTeamId;
  }

  const ownerMemberIds = new Set([
    ...input.credentialMemberIds,
    ...input.claims.map((claim) => claim.providerMemberId),
  ]);
  const ownerMatchedTeam = input.teams.find((team) =>
    team.ownerMemberIds.some((ownerMemberId) =>
      ownerMemberIds.has(ownerMemberId),
    ),
  );
  if (ownerMatchedTeam) {
    return ownerMatchedTeam.providerTeamId;
  }

  const discoveredTeam = input.teams.find((team) =>
    input.discoveredTeamNames.has(normalizeTeamName(team.name)),
  );
  return discoveredTeam?.providerTeamId ?? null;
}

function displayScoringPeriod(
  currentScoringPeriod: number,
  matchups: readonly MatchupRow[],
): number | null {
  if (matchups.length === 0) {
    return null;
  }

  const periods = [
    ...new Set(matchups.map((matchup) => matchup.scoringPeriod)),
  ];
  if (currentScoringPeriod > 0 && periods.includes(currentScoringPeriod)) {
    return currentScoringPeriod;
  }

  return Math.max(...periods);
}

function matchupIncludesTeam(
  matchup: MatchupRow,
  providerTeamId: string,
): boolean {
  return matchupTeamIds(matchup).has(providerTeamId);
}

function matchupSideForTeam(
  matchup: MatchupRow,
  providerTeamId: string,
): "home" | "away" | null {
  return (
    new Map<string, "home" | "away">(
      [
        [matchup.homeTeamProviderId, "home"] as const,
        matchup.awayTeamProviderId
          ? ([matchup.awayTeamProviderId, "away"] as const)
          : null,
      ].filter(
        (entry): entry is readonly [string, "home" | "away"] => entry !== null,
      ),
    ).get(providerTeamId) ?? null
  );
}

function matchupTeamIds(matchup: MatchupRow): ReadonlySet<string> {
  return new Set(
    [matchup.homeTeamProviderId, matchup.awayTeamProviderId].filter(
      (providerTeamId): providerTeamId is string => providerTeamId !== null,
    ),
  );
}

function providerMemberIdsByProvider(
  rows: readonly CredentialRow[],
): ReadonlyMap<FantasyProviderId, Set<string>> {
  const byProvider = new Map<FantasyProviderId, Set<string>>();
  for (const row of rows) {
    const subjectProviderId = row.subjectProviderId.trim();
    if (subjectProviderId.length === 0) {
      continue;
    }
    const providerIds = byProvider.get(row.provider) ?? new Set<string>();
    providerIds.add(subjectProviderId);
    byProvider.set(row.provider, providerIds);
  }
  return byProvider;
}

function discoveredTeamNamesByLeague(
  rows: readonly DiscoveredLeagueRow[],
): ReadonlyMap<string, Set<string>> {
  const byLeague = new Map<string, Set<string>>();
  for (const row of rows) {
    const teamName = normalizeTeamName(row.teamName ?? "");
    if (teamName.length === 0) {
      continue;
    }
    const key = discoveryKey(row.provider, row.providerLeagueId, row.season);
    const names = byLeague.get(key) ?? new Set<string>();
    names.add(teamName);
    byLeague.set(key, names);
  }
  return byLeague;
}

function discoveryKey(
  provider: FantasyProviderId,
  providerLeagueId: string,
  season: number,
): string {
  return `${provider}:${providerLeagueId}:${season}`;
}

function normalizeTeamName(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}
