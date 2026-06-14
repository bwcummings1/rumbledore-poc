import { describe, expect, it } from "vitest";
import { err, ok } from "@/core/result";
import {
  AuthExpiredError,
  type FantasyProvider,
  type FantasyProviderSession,
  ProviderBlockedError,
  ProviderNotFoundError,
  ProviderParseError,
  RateLimitedError,
} from "./model";

interface FixtureCredentials {
  proof: "fixture";
}

interface FixtureSession extends FantasyProviderSession {
  provider: "espn";
  authKind: "cookie";
  subjectProviderId: "fixture-user";
}

const leagueRef = {
  provider: "espn",
  providerId: "95050",
  season: 2026,
  sport: "ffl",
  name: "NHS Alumni Annual",
} as const;

const fixtureProvider: FantasyProvider<FixtureCredentials, FixtureSession> = {
  id: "espn",
  name: "ESPN Fantasy Football",
  capabilities: {
    authKind: "cookie",
    dataClasses: {
      league: "full",
      teams: "full",
      members: "full",
      rosters: "full",
      matchups: "full",
      final_standings: "full",
      transactions: "full",
      history: "full",
      divisions: "none",
      keeper_dynasty: "none",
      scoring_detail: "partial",
    },
    requiresOAuth: false,
    supportsHistory: true,
    supportsRosters: true,
    supportsTransactions: true,
  },
  async authenticate(credentials) {
    if (credentials.proof !== "fixture") {
      return err(new AuthExpiredError("espn"));
    }
    return ok({
      provider: "espn",
      authKind: "cookie",
      subjectProviderId: "fixture-user",
    });
  },
  async discoverLeagues() {
    return ok([leagueRef]);
  },
  async getLeague() {
    return ok({
      ...leagueRef,
      scoringType: "H2H_POINTS",
      size: 12,
      currentScoringPeriod: 1,
      status: "in_season",
    });
  },
  async getTeams() {
    return ok([
      {
        provider: "espn",
        providerId: "1",
        leagueProviderId: "95050",
        season: 2026,
        name: "Fixture Team",
        abbrev: "FIX",
        ownerMemberIds: ["member-1"],
        record: {
          losses: 0,
          pointsAgainst: 97.25,
          pointsFor: 101.5,
          ties: 0,
          wins: 1,
        },
      },
    ]);
  },
  async getRosters() {
    return ok([
      {
        teamRef: { provider: "espn", providerId: "1", season: 2026 },
        season: 2026,
        scoringPeriod: 1,
        entries: [
          {
            playerRef: { provider: "espn", providerId: "player-1" },
            slot: "QB",
            status: "active",
            points: 12.4,
          },
        ],
      },
    ]);
  },
  async getMembers() {
    return ok([
      {
        provider: "espn",
        providerId: "member-1",
        leagueProviderId: "95050",
        season: 2026,
        displayName: "Fixture Manager",
        role: "member",
      },
    ]);
  },
  async getMatchups() {
    return ok([
      {
        provider: "espn",
        providerId: "1-2-week-1",
        leagueProviderId: "95050",
        season: 2026,
        scoringPeriod: 1,
        homeTeamRef: { provider: "espn", providerId: "1", season: 2026 },
        awayTeamRef: { provider: "espn", providerId: "2", season: 2026 },
        homeScore: 101.5,
        awayScore: 97.25,
        winner: "home",
        status: "final",
      },
    ]);
  },
  async getHistory() {
    return ok([
      {
        league: {
          ...leagueRef,
          scoringType: "H2H_POINTS",
          size: 12,
          currentScoringPeriod: 14,
          status: "complete",
        },
        teams: [],
        members: [],
        matchups: [],
        finalStandings: [],
        transactions: [],
      },
    ]);
  },
};

describe("FantasyProvider contract", () => {
  it("supports the normalized league/team/member/matchup flow", async () => {
    const auth = await fixtureProvider.authenticate({ proof: "fixture" });
    expect(auth.ok).toBe(true);
    if (!auth.ok) throw auth.error;

    const discovered = await fixtureProvider.discoverLeagues(auth.value);
    expect(discovered).toEqual(ok([leagueRef]));

    const [league, teams, members, matchups] = await Promise.all([
      fixtureProvider.getLeague(auth.value, leagueRef),
      fixtureProvider.getTeams(auth.value, leagueRef),
      fixtureProvider.getMembers(auth.value, leagueRef),
      fixtureProvider.getMatchups(auth.value, leagueRef),
    ]);

    expect(league.ok && league.value.scoringType).toBe("H2H_POINTS");
    expect(teams.ok && teams.value[0].ownerMemberIds).toEqual(["member-1"]);
    expect(members.ok && members.value[0].providerId).toBe("member-1");
    expect(matchups.ok && matchups.value[0].winner).toBe("home");
  });

  it("uses typed provider errors with stable codes and statuses", () => {
    expect(new AuthExpiredError("espn").toJSON()).toMatchObject({
      code: "PROVIDER_AUTH_EXPIRED",
      status: 401,
    });
    expect(new ProviderBlockedError("espn").toJSON()).toMatchObject({
      code: "PROVIDER_BLOCKED",
      status: 503,
    });
    expect(new RateLimitedError("espn", 30).details).toEqual({
      retryAfterSeconds: 30,
    });
    expect(new ProviderNotFoundError("espn").status).toBe(404);
    expect(new ProviderParseError("espn").status).toBe(502);
  });
});
