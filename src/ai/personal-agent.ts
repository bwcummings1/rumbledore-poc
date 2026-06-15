import type { Db } from "@/db/client";
import type {
  EntitlementResolution,
  EntitlementResolverEnv,
} from "@/entitlements";
import { resolveEntitlement } from "@/entitlements";
import {
  getYourLeaguesLandingData,
  type YourLeagueCard,
  type YourLeagueMatchup,
  type YourLeagueMatchupSide,
} from "@/home/your-leagues";

export interface PersonalAgentBriefingInput {
  readonly db: Db;
  readonly env: EntitlementResolverEnv;
  readonly loadLandingData?: typeof getYourLeaguesLandingData;
  readonly now?: () => Date;
  readonly userId: string;
}

export type PersonalAgentBriefingResult =
  | PersonalAgentBriefingBlocked
  | PersonalAgentBriefingReady;

export interface PersonalAgentBriefingBlocked {
  readonly entitlement: EntitlementResolution;
  readonly status: "blocked";
}

export interface PersonalAgentBriefingReady {
  readonly briefing: PersonalAgentBriefing;
  readonly entitlement: EntitlementResolution;
  readonly status: "ready";
}

export interface PersonalAgentBriefing {
  readonly capped: boolean;
  readonly coveredLeagueCount: number;
  readonly generatedAt: string;
  readonly leagueLimit: number;
  readonly leagues: PersonalAgentLeagueBrief[];
  readonly totalLeagueCount: number;
}

export interface PersonalAgentLeagueBrief {
  readonly href: string;
  readonly latestPressTitle: string | null;
  readonly leagueId: string;
  readonly matchup: PersonalAgentMatchupBrief | null;
  readonly name: string;
  readonly providerLabel: string;
}

export interface PersonalAgentMatchupBrief {
  readonly label: string;
  readonly opponentScore: number | null;
  readonly opponentTeamName: string | null;
  readonly scoringPeriod: number;
  readonly status: YourLeagueMatchup["status"];
  readonly userScore: number | null;
  readonly userTeamName: string | null;
}

function currentTimestamp(input: PersonalAgentBriefingInput): Date {
  return input.now?.() ?? new Date();
}

function userAndOpponentSides(
  matchup: YourLeagueMatchup,
): { opponent: YourLeagueMatchupSide; user: YourLeagueMatchupSide } | null {
  if (!matchup.isUserMatchup) {
    return null;
  }

  if (matchup.home.isUserTeam) {
    return { opponent: matchup.away, user: matchup.home };
  }

  if (matchup.away.isUserTeam) {
    return { opponent: matchup.home, user: matchup.away };
  }

  return null;
}

function matchupBrief(matchup: YourLeagueMatchup): PersonalAgentMatchupBrief {
  const sides = userAndOpponentSides(matchup);
  if (sides) {
    return {
      label: `${sides.user.name} vs ${sides.opponent.name}`,
      opponentScore: sides.opponent.score,
      opponentTeamName: sides.opponent.name,
      scoringPeriod: matchup.scoringPeriod,
      status: matchup.status,
      userScore: sides.user.score,
      userTeamName: sides.user.name,
    };
  }

  return {
    label: `${matchup.away.name} at ${matchup.home.name}`,
    opponentScore: null,
    opponentTeamName: null,
    scoringPeriod: matchup.scoringPeriod,
    status: matchup.status,
    userScore: null,
    userTeamName: null,
  };
}

function leagueBrief(league: YourLeagueCard): PersonalAgentLeagueBrief {
  return {
    href: league.href,
    latestPressTitle: league.latestPress?.title ?? null,
    leagueId: league.leagueId,
    matchup: league.matchup ? matchupBrief(league.matchup) : null,
    name: league.name,
    providerLabel: league.providerLabel,
  };
}

export async function getPersonalAgentBriefing(
  input: PersonalAgentBriefingInput,
): Promise<PersonalAgentBriefingResult> {
  const generatedAt = currentTimestamp(input);
  const entitlement = await resolveEntitlement({
    capability: "ai.individual.agent",
    db: input.db,
    env: input.env,
    now: input.now,
    userId: input.userId,
  });

  if (!entitlement.allowed) {
    return {
      entitlement,
      status: "blocked",
    };
  }

  const loadLandingData = input.loadLandingData ?? getYourLeaguesLandingData;
  const landing = await loadLandingData(input.db, {
    userId: input.userId,
  });
  const leagueLimit = entitlement.caps.individualLeaguesCovered;
  const covered = landing.leagues.slice(0, leagueLimit);

  return {
    briefing: {
      capped: landing.leagues.length > covered.length,
      coveredLeagueCount: covered.length,
      generatedAt: generatedAt.toISOString(),
      leagueLimit,
      leagues: covered.map(leagueBrief),
      totalLeagueCount: landing.leagues.length,
    },
    entitlement,
    status: "ready",
  };
}
