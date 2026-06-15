import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import league2025Fixture from "../../../test/fixtures/yahoo/league-2025.json";
import league2026Fixture from "../../../test/fixtures/yahoo/league-2026.json";
import rosterTeam1Week1Fixture from "../../../test/fixtures/yahoo/roster-461-team1-week1.json";
import scoreboard2025Week1Fixture from "../../../test/fixtures/yahoo/scoreboard-2025-week1.json";
import scoreboard2025Week2Fixture from "../../../test/fixtures/yahoo/scoreboard-2025-week2.json";
import scoreboard2026Week1Fixture from "../../../test/fixtures/yahoo/scoreboard-2026-week1.json";
import scoreboard2026Week2Fixture from "../../../test/fixtures/yahoo/scoreboard-2026-week2.json";
import transactions2025Fixture from "../../../test/fixtures/yahoo/transactions-2025.json";
import userTeamsFixture from "../../../test/fixtures/yahoo/user-teams.json";
import {
  AuthExpiredError,
  ProviderBlockedError,
  type ProviderLeagueRef,
  ProviderParseError,
} from "../model";
import {
  createYahooClient,
  createYahooProvider,
  type YahooCredentials,
  type YahooFetch,
  type YahooSession,
} from "./client";

const leagueRef = {
  provider: "yahoo",
  providerId: "461.l.95050",
  season: 2026,
  sport: "ffl",
  name: "Yahoo Fixture League",
  size: 4,
} satisfies ProviderLeagueRef;

const fixtureYahooAccessToken = "fixture-access-token"; // ubs:ignore — fake OAuth token for provider tests
const expiredYahooAccessToken = "expired-token"; // ubs:ignore — fake OAuth token for provider tests

const credentials = {
  accessToken: fixtureYahooAccessToken,
  expiresAt: "2030-01-01T00:00:00.000Z",
  leagueKeys: ["449.l.95050"],
} satisfies YahooCredentials;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function emptyRosterFixture(teamKey: string, week: number) {
  return {
    fantasy_content: {
      team: [
        { team_key: teamKey },
        {
          roster: {
            coverage_type: "week",
            week: String(week),
            players: { count: 0 },
          },
        },
      ],
    },
  };
}

function emptyTransactionsFixture(leagueKey: string) {
  return {
    fantasy_content: {
      league: [{ league_key: leagueKey }, { transactions: { count: 0 } }],
    },
  };
}

type FixtureRouteValue = Response | unknown;

function fixtureRoutes(): Record<string, FixtureRouteValue> {
  return {
    "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/teams?format=json":
      userTeamsFixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=461/teams?format=json":
      userTeamsFixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=449/teams?format=json":
      userTeamsFixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/league/461.l.95050;out=settings,standings?format=json":
      league2026Fixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/league/449.l.95050;out=settings,standings?format=json":
      league2025Fixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/league/461.l.95050/scoreboard;week=1?format=json":
      scoreboard2026Week1Fixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/league/461.l.95050/scoreboard;week=2?format=json":
      scoreboard2026Week2Fixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/league/449.l.95050/scoreboard;week=1?format=json":
      scoreboard2025Week1Fixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/league/449.l.95050/scoreboard;week=2?format=json":
      scoreboard2025Week2Fixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/league/461.l.95050/transactions?format=json":
      emptyTransactionsFixture("461.l.95050"),
    "https://fantasysports.yahooapis.com/fantasy/v2/league/449.l.95050/transactions?format=json":
      transactions2025Fixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/team/461.l.95050.t.1/roster;week=1?format=json":
      rosterTeam1Week1Fixture,
    "https://fantasysports.yahooapis.com/fantasy/v2/team/461.l.95050.t.2/roster;week=1?format=json":
      emptyRosterFixture("461.l.95050.t.2", 1),
    "https://fantasysports.yahooapis.com/fantasy/v2/team/461.l.95050.t.3/roster;week=1?format=json":
      emptyRosterFixture("461.l.95050.t.3", 1),
    "https://fantasysports.yahooapis.com/fantasy/v2/team/461.l.95050.t.4/roster;week=1?format=json":
      emptyRosterFixture("461.l.95050.t.4", 1),
  };
}

function createFixtureFetch(
  routes: Record<string, FixtureRouteValue> = fixtureRoutes(),
): {
  calls: { init: RequestInit | undefined; url: string }[];
  fetch: YahooFetch;
} {
  const calls: { init: RequestInit | undefined; url: string }[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      const url = input.toString();
      calls.push({ init, url });
      if (!(url in routes)) {
        return jsonResponse(
          { message: `missing fixture for ${url}` },
          { status: 404 },
        );
      }
      const route = routes[url];
      if (route instanceof Response) {
        return route;
      }
      return jsonResponse(route);
    },
  };
}

function fixtureSession(overrides: Partial<YahooSession> = {}): YahooSession {
  return {
    provider: "yahoo",
    authKind: "oauth2",
    subjectProviderId: "YAHOO-GUID-123",
    accessToken: fixtureYahooAccessToken,
    discoveryGameKeys: ["nfl"],
    discoverySeasons: [],
    historicalLeagueKeysByLeagueKey: {
      "461.l.95050": ["449.l.95050"],
    },
    leagueKeys: ["449.l.95050"],
    tokenType: "Bearer",
    ...overrides,
  };
}

describe("Yahoo provider", () => {
  it("authenticates OAuth credentials by validating the Yahoo user teams API", async () => {
    const { calls, fetch } = createFixtureFetch();
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate(credentials);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({
      provider: "yahoo",
      authKind: "oauth2",
      subjectProviderId: "YAHOO-GUID-123",
      accessToken: credentials.accessToken,
      tokenType: "Bearer",
      leagueKeys: ["449.l.95050"],
    });
    expect(calls.map((call) => call.url)).toEqual([
      "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/teams?format=json",
    ]);
  });

  it("exposes a complete FantasyProvider with Yahoo OAuth capabilities", async () => {
    const { fetch } = createFixtureFetch();
    const provider = createYahooProvider({ fetch, retryDelayMs: 0 });

    expect(provider).toMatchObject({
      id: "yahoo",
      name: "Yahoo Fantasy Football",
      capabilities: {
        authKind: "oauth2",
        dataClasses: {
          league: "full",
          teams: "full",
          members: "full",
          rosters: "full",
          matchups: "full",
          final_standings: "partial",
          transactions: "partial",
          history: "partial",
          divisions: "none",
          keeper_dynasty: "none",
          scoring_detail: "partial",
        },
        requiresOAuth: true,
        supportsHistory: true,
        supportsRosters: true,
        supportsTransactions: true,
      },
    });
    await expect(provider.authenticate(credentials)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("uses bearer auth headers on Yahoo requests", async () => {
    const { calls, fetch } = createFixtureFetch();
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    await client.discoverLeagues(fixtureSession());

    for (const call of calls) {
      const headers = call.init?.headers as Record<string, string>;
      expect(headers).toMatchObject({
        Accept: "application/json",
        Authorization: `Bearer ${fixtureYahooAccessToken}`,
        "User-Agent": "Rumbledore/2.0 (+https://rumbledore.app)",
      });
      expect(headers).not.toHaveProperty("Cookie");
    }
  });

  it("discovers normalized Yahoo NFL leagues from user teams", async () => {
    const { fetch } = createFixtureFetch();
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    const result = await client.discoverLeagues(fixtureSession());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual([
      {
        provider: "yahoo",
        providerId: "461.l.95050",
        providerTeamId: "1",
        season: 2026,
        sport: "ffl",
        name: "Yahoo Fixture League",
        teamName: "Yahoo Alpha",
        size: 4,
      },
      {
        provider: "yahoo",
        providerId: "449.l.95050",
        providerTeamId: "1",
        season: 2025,
        sport: "ffl",
        name: "Yahoo Fixture League 2025",
        teamName: "Yahoo Alpha 2025",
        size: 4,
      },
    ]);
  });

  it("normalizes Yahoo league metadata and standings", async () => {
    const { fetch } = createFixtureFetch();
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    const league = await client.getLeague(fixtureSession(), leagueRef);
    const teams = await client.getTeams(fixtureSession(), leagueRef);

    expect(league.ok).toBe(true);
    if (!league.ok) throw league.error;
    expect(league.value).toEqual({
      provider: "yahoo",
      providerId: "461.l.95050",
      season: 2026,
      sport: "ffl",
      name: "Yahoo Fixture League",
      scoringType: "H2H",
      scoringSettings: {
        endWeek: 2,
        rawScoringType: "head",
        startWeek: 1,
      },
      size: 4,
      currentScoringPeriod: 2,
      status: "in_season",
    });
    expect(teams.ok).toBe(true);
    if (!teams.ok) throw teams.error;
    expect(teams.value[0]).toEqual({
      provider: "yahoo",
      providerId: "1",
      leagueProviderId: "461.l.95050",
      season: 2026,
      name: "Alpha Aces",
      abbrev: "AAA",
      logo: "https://s.yimg.com/cv/apiv2/default/nfl/icon_01_48.gif",
      ownerMemberIds: ["YAHOO-MANAGER-1"],
      record: {
        wins: 2,
        losses: 0,
        ties: 0,
        pointsFor: 250.75,
        pointsAgainst: 199.05,
      },
    });
  });

  it("normalizes Yahoo managers into durable members", async () => {
    const { fetch } = createFixtureFetch();
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMembers(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(4);
    expect(result.value[0]).toEqual({
      provider: "yahoo",
      providerId: "YAHOO-MANAGER-1",
      leagueProviderId: "461.l.95050",
      season: 2026,
      displayName: "Alpha Manager",
      role: "commissioner",
    });
  });

  it("normalizes Yahoo rosters with selected slots and week points", async () => {
    const { fetch } = createFixtureFetch();
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    const result = await client.getRosters(fixtureSession(), leagueRef, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(4);
    expect(result.value[0]).toEqual({
      teamRef: { provider: "yahoo", providerId: "1", season: 2026 },
      season: 2026,
      scoringPeriod: 1,
      entries: [
        {
          playerRef: { provider: "yahoo", providerId: "1001" },
          slot: "QB",
          status: "active",
          points: 22.4,
        },
        {
          playerRef: { provider: "yahoo", providerId: "2001" },
          slot: "BN",
          status: "bench",
          points: 7,
        },
      ],
    });
  });

  it("normalizes Yahoo scoreboards into matchup rows", async () => {
    const { fetch } = createFixtureFetch();
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMatchups(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual([
      {
        provider: "yahoo",
        providerId: "1:1:2",
        leagueProviderId: "461.l.95050",
        season: 2026,
        scoringPeriod: 1,
        homeTeamRef: { provider: "yahoo", providerId: "1", season: 2026 },
        awayTeamRef: { provider: "yahoo", providerId: "2", season: 2026 },
        homeScore: 125.75,
        awayScore: 110.02,
        winner: "home",
        status: "final",
      },
      {
        provider: "yahoo",
        providerId: "2:1:3",
        leagueProviderId: "461.l.95050",
        season: 2026,
        scoringPeriod: 2,
        homeTeamRef: { provider: "yahoo", providerId: "1", season: 2026 },
        awayTeamRef: { provider: "yahoo", providerId: "3", season: 2026 },
        homeScore: 12,
        awayScore: 8,
        winner: "unknown",
        status: "in_progress",
      },
    ]);
  });

  it("builds historical season bundles from explicit Yahoo league keys", async () => {
    const { fetch } = createFixtureFetch();
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    const result = await client.getHistory(fixtureSession(), leagueRef, {
      seasons: [2025],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].league).toMatchObject({
      provider: "yahoo",
      providerId: "449.l.95050",
      season: 2025,
      status: "complete",
    });
    expect(result.value[0].teams).toHaveLength(2);
    expect(result.value[0].members).toHaveLength(2);
    expect(result.value[0].matchups).toHaveLength(1);
    expect(result.value[0].finalStandings[0]).toMatchObject({
      rank: 1,
      teamRef: { provider: "yahoo", providerId: "1", season: 2025 },
      pointsFor: 240,
    });
    expect(result.value[0].transactions).toEqual([
      {
        provider: "yahoo",
        providerId: "449.l.95050.tr.1",
        leagueProviderId: "449.l.95050",
        season: 2025,
        type: "add",
        teamRefs: [],
        playerRefs: [
          { provider: "yahoo", providerId: "1001" },
          { provider: "yahoo", providerId: "2001" },
        ],
        timestamp: new Date(1800000000000),
        details: {},
      },
    ]);
  });

  it("rejects expired Yahoo access tokens before making requests", async () => {
    const { calls, fetch } = createFixtureFetch();
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate({
      accessToken: expiredYahooAccessToken,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(AuthExpiredError);
    expect(calls).toHaveLength(0);
  });

  it("retries retryable Yahoo failures before returning ProviderBlockedError", async () => {
    const calls: string[] = [];
    const fetch: YahooFetch = async (input) => {
      calls.push(input.toString());
      return jsonResponse({}, { status: 503 });
    };
    const client = createYahooClient({
      fetch,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    const result = await client.getLeague(fixtureSession(), leagueRef);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected getLeague to fail");
    expect(result.error).toBeInstanceOf(ProviderBlockedError);
    expect(calls).toHaveLength(2);
  });

  it("returns ProviderParseError for malformed Yahoo JSON", async () => {
    const fetch: YahooFetch = async () =>
      new Response("{", {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    const client = createYahooClient({ fetch, retryDelayMs: 0 });

    const result = await client.getLeague(fixtureSession(), leagueRef);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected getLeague to fail");
    expect(result.error).toBeInstanceOf(ProviderParseError);
  });

  it("keeps the Yahoo provider entry server-only", () => {
    const source = readFileSync(
      join(process.cwd(), "src/providers/yahoo/index.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
  });
});
