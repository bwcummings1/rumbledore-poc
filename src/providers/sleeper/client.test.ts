import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import league2025Fixture from "../../../test/fixtures/sleeper/league-2025.json";
import leagues2026Fixture from "../../../test/fixtures/sleeper/leagues-2026.json";
import matchupsWeek1Fixture from "../../../test/fixtures/sleeper/matchups-2026-week1.json";
import matchupsWeek2Fixture from "../../../test/fixtures/sleeper/matchups-2026-week2.json";
import rostersFixture from "../../../test/fixtures/sleeper/rosters-2026.json";
import stateFixture from "../../../test/fixtures/sleeper/state-2026.json";
import transactionsWeek1Fixture from "../../../test/fixtures/sleeper/transactions-2026-week1.json";
import userFixture from "../../../test/fixtures/sleeper/user-fixture.json";
import usersFixture from "../../../test/fixtures/sleeper/users-2026.json";
import {
  AuthExpiredError,
  ProviderBlockedError,
  type ProviderLeagueRef,
  ProviderParseError,
} from "../model";
import {
  createSleeperClient,
  createSleeperProvider,
  type SleeperFetch,
  type SleeperSession,
} from "./client";

const league2026Fixture = leagues2026Fixture[0];

const leagueRef = {
  provider: "sleeper",
  providerId: "sleeper-2026",
  season: 2026,
  sport: "ffl",
  name: "Sleeper Fixture League",
  size: 4,
} satisfies ProviderLeagueRef;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function fixtureSession(
  overrides: Partial<SleeperSession> = {},
): SleeperSession {
  return {
    provider: "sleeper",
    authKind: "none",
    subjectProviderId: "user-123",
    username: "fixture_sleeper",
    displayName: "Fixture Sleeper",
    currentLeagueSeason: 2026,
    discoverySeasons: [2026, 2025],
    ...overrides,
  };
}

type FixtureRouteValue = Response | unknown;

function fixtureRoutes(): Record<string, FixtureRouteValue> {
  return {
    "https://api.sleeper.app/v1/user/fixture_sleeper": userFixture,
    "https://api.sleeper.app/v1/user/user-123": userFixture,
    "https://api.sleeper.app/v1/state/nfl": stateFixture,
    "https://api.sleeper.app/v1/user/user-123/leagues/nfl/2026":
      leagues2026Fixture,
    "https://api.sleeper.app/v1/user/user-123/leagues/nfl/2025": [
      league2025Fixture,
    ],
    "https://api.sleeper.app/v1/league/sleeper-2026": league2026Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2025": league2025Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2026/rosters": rostersFixture,
    "https://api.sleeper.app/v1/league/sleeper-2025/rosters": rostersFixture,
    "https://api.sleeper.app/v1/league/sleeper-2026/users": usersFixture,
    "https://api.sleeper.app/v1/league/sleeper-2025/users": usersFixture,
    "https://api.sleeper.app/v1/league/sleeper-2026/matchups/1":
      matchupsWeek1Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2026/matchups/2":
      matchupsWeek2Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2025/matchups/1":
      matchupsWeek1Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2025/matchups/2":
      matchupsWeek2Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2026/transactions/1":
      transactionsWeek1Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2026/transactions/2": [],
    "https://api.sleeper.app/v1/league/sleeper-2025/transactions/1":
      transactionsWeek1Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2025/transactions/2": [],
  };
}

function createFixtureFetch(
  routes: Record<string, FixtureRouteValue> = fixtureRoutes(),
): {
  calls: { init: RequestInit | undefined; url: string }[];
  fetch: SleeperFetch;
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

describe("Sleeper provider", () => {
  it("authenticates a public username without tokens", async () => {
    const { calls, fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate({
      usernameOrUserId: "fixture_sleeper",
      seasons: [2026, 2025],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual({
      provider: "sleeper",
      authKind: "none",
      subjectProviderId: "user-123",
      username: "fixture_sleeper",
      displayName: "Fixture Sleeper",
      currentLeagueSeason: 2026,
      discoverySeasons: [2026, 2025],
    });
    expect(calls.map((call) => call.url).sort()).toEqual([
      "https://api.sleeper.app/v1/state/nfl",
      "https://api.sleeper.app/v1/user/fixture_sleeper",
    ]);
  });

  it("exposes a complete FantasyProvider with Sleeper capabilities", async () => {
    const { fetch } = createFixtureFetch();
    const provider = createSleeperProvider({ fetch, retryDelayMs: 0 });

    expect(provider).toMatchObject({
      id: "sleeper",
      name: "Sleeper Fantasy Football",
      capabilities: {
        authKind: "none",
        dataClasses: {
          league: "full",
          teams: "full",
          members: "full",
          rosters: "full",
          matchups: "full",
          final_standings: "partial",
          transactions: "full",
          history: "partial",
          divisions: "none",
          keeper_dynasty: "partial",
          scoring_detail: "partial",
        },
        requiresOAuth: false,
        supportsHistory: true,
        supportsRosters: true,
        supportsTransactions: true,
      },
    });
    expect(provider.getRosters).toBeTypeOf("function");
    await expect(
      provider.authenticate({
        usernameOrUserId: "fixture_sleeper",
        seasons: [2026],
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("uses JSON headers without credentials on Sleeper requests", async () => {
    const { calls, fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    await client.authenticate({ usernameOrUserId: "fixture_sleeper" });

    for (const call of calls) {
      const headers = call.init?.headers as Record<string, string>;
      expect(headers).toMatchObject({
        Accept: "application/json",
        "User-Agent": "Rumbledore/2.0 (+https://rumbledore.app)",
      });
      expect(headers).not.toHaveProperty("Authorization");
      expect(headers).not.toHaveProperty("Cookie");
    }
  });

  it("discovers normalized NFL leagues across requested seasons", async () => {
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.discoverLeagues(fixtureSession());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual([
      {
        provider: "sleeper",
        providerId: "sleeper-2026",
        season: 2026,
        sport: "ffl",
        name: "Sleeper Fixture League",
        size: 4,
      },
      {
        provider: "sleeper",
        providerId: "sleeper-2025",
        season: 2025,
        sport: "ffl",
        name: "Sleeper Fixture League 2025",
        size: 4,
      },
    ]);
  });

  it("normalizes a Sleeper league with current NFL state", async () => {
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getLeague(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual({
      provider: "sleeper",
      providerId: "sleeper-2026",
      season: 2026,
      sport: "ffl",
      name: "Sleeper Fixture League",
      scoringType: "PPR",
      size: 4,
      currentScoringPeriod: 2,
      status: "in_season",
    });
  });

  it("normalizes Sleeper rosters into fantasy teams with owner links", async () => {
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getTeams(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(4);
    expect(result.value[0]).toEqual({
      provider: "sleeper",
      providerId: "1",
      leagueProviderId: "sleeper-2026",
      season: 2026,
      name: "Alpha Aces",
      abbrev: "AAA",
      logo: "https://sleepercdn.com/avatars/thumbs/avatar-alpha",
      ownerMemberIds: ["user-1", "user-3"],
      record: {
        wins: 2,
        losses: 0,
        ties: 0,
        pointsFor: 250.75,
        pointsAgainst: 199.05,
      },
    });
  });

  it("normalizes league users into durable members", async () => {
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMembers(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(4);
    expect(result.value[0]).toEqual({
      provider: "sleeper",
      providerId: "user-1",
      leagueProviderId: "sleeper-2026",
      season: 2026,
      displayName: "Alpha Manager",
      role: "commissioner",
    });
    expect(result.value[1].role).toBe("member");
  });

  it("normalizes roster entries with slots, statuses, and week points", async () => {
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getRosters(fixtureSession(), leagueRef, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(4);
    expect(result.value[0]).toMatchObject({
      teamRef: { provider: "sleeper", providerId: "1", season: 2026 },
      season: 2026,
      scoringPeriod: 1,
    });
    expect(result.value[0].entries).toEqual([
      {
        playerRef: { provider: "sleeper", providerId: "QB1" },
        slot: "QB",
        status: "active",
        points: 22.4,
      },
      {
        playerRef: { provider: "sleeper", providerId: "RB1" },
        slot: "RB",
        status: "active",
        points: 18.1,
      },
      {
        playerRef: { provider: "sleeper", providerId: "WR1" },
        slot: "WR",
        status: "active",
        points: 14.2,
      },
      {
        playerRef: { provider: "sleeper", providerId: "BN1" },
        slot: "BN",
        status: "bench",
        points: 7,
      },
      {
        playerRef: { provider: "sleeper", providerId: "IR1" },
        slot: "IR",
        status: "reserve",
        points: 0,
      },
    ]);
  });

  it("defaults rosters to the current NFL display week", async () => {
    const { calls, fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getRosters(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value[0].scoringPeriod).toBe(2);
    expect(calls.map((call) => call.url)).toContain(
      "https://api.sleeper.app/v1/state/nfl",
    );
    expect(calls.map((call) => call.url)).toContain(
      "https://api.sleeper.app/v1/league/sleeper-2026/matchups/2",
    );
  });

  it("normalizes one week of paired Sleeper matchup rows", async () => {
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMatchups(fixtureSession(), leagueRef, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual([
      {
        provider: "sleeper",
        providerId: "1:1",
        leagueProviderId: "sleeper-2026",
        season: 2026,
        scoringPeriod: 1,
        homeTeamRef: { provider: "sleeper", providerId: "1", season: 2026 },
        awayTeamRef: { provider: "sleeper", providerId: "2", season: 2026 },
        homeScore: 125.75,
        awayScore: 110.02,
        winner: "home",
        status: "final",
      },
      {
        provider: "sleeper",
        providerId: "1:2",
        leagueProviderId: "sleeper-2026",
        season: 2026,
        scoringPeriod: 1,
        homeTeamRef: { provider: "sleeper", providerId: "3", season: 2026 },
        awayTeamRef: { provider: "sleeper", providerId: "4", season: 2026 },
        homeScore: 99.05,
        awayScore: 120,
        winner: "away",
        status: "final",
      },
    ]);
  });

  it("fetches current-season matchups through the current display week", async () => {
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMatchups(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(4);
    expect(result.value[2]).toMatchObject({
      providerId: "2:1",
      scoringPeriod: 2,
      status: "in_progress",
      winner: "unknown",
      homeScore: 12,
      awayScore: 8,
    });
  });

  it("builds historical season bundles by following previous_league_id", async () => {
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getHistory(fixtureSession(), leagueRef, {
      seasons: [2025],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].league).toMatchObject({
      provider: "sleeper",
      providerId: "sleeper-2025",
      season: 2025,
      scoringType: "HALF_PPR",
      status: "complete",
    });
    expect(result.value[0].teams).toHaveLength(4);
    expect(result.value[0].members).toHaveLength(4);
    expect(result.value[0].matchups).toHaveLength(4);
    expect(result.value[0].finalStandings[0]).toMatchObject({
      rank: 1,
      teamRef: { provider: "sleeper", providerId: "1", season: 2025 },
      pointsFor: 250.75,
    });
    expect(result.value[0].transactions).toEqual([
      {
        provider: "sleeper",
        providerId: "tx-add-1",
        leagueProviderId: "sleeper-2025",
        season: 2025,
        type: "add",
        teamRefs: [{ provider: "sleeper", providerId: "1", season: 2025 }],
        playerRefs: [
          { provider: "sleeper", providerId: "BN0" },
          { provider: "sleeper", providerId: "BN1" },
        ],
        timestamp: new Date(1800000000000),
        details: {
          creator: "user-1",
          status: "complete",
          week: 1,
        },
      },
      {
        provider: "sleeper",
        providerId: "tx-trade-1",
        leagueProviderId: "sleeper-2025",
        season: 2025,
        type: "trade",
        teamRefs: [
          { provider: "sleeper", providerId: "1", season: 2025 },
          { provider: "sleeper", providerId: "2", season: 2025 },
        ],
        playerRefs: [],
        timestamp: new Date(1800000100000),
        details: {
          creator: "user-2",
          status: "complete",
          week: 1,
        },
      },
    ]);
  });

  it("rejects an empty username before making requests", async () => {
    const { calls, fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate({ usernameOrUserId: " " });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(AuthExpiredError);
    expect(calls).toHaveLength(0);
  });

  it("maps missing Sleeper users to AuthExpiredError", async () => {
    const { fetch } = createFixtureFetch({
      ...fixtureRoutes(),
      "https://api.sleeper.app/v1/user/missing": jsonResponse(
        {},
        { status: 404 },
      ),
    });
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate({ usernameOrUserId: "missing" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(AuthExpiredError);
  });

  it("retries retryable Sleeper failures before returning ProviderBlockedError", async () => {
    const calls: string[] = [];
    const fetch: SleeperFetch = async (input) => {
      calls.push(input.toString());
      return jsonResponse({}, { status: 503 });
    };
    const client = createSleeperClient({
      fetch,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    const result = await client.getLeague(fixtureSession(), leagueRef);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected getLeague to fail");
    expect(result.error).toBeInstanceOf(ProviderBlockedError);
    expect(calls).toHaveLength(4);
  });

  it("returns ProviderParseError for malformed Sleeper payloads", async () => {
    const { fetch } = createFixtureFetch({
      ...fixtureRoutes(),
      "https://api.sleeper.app/v1/user/fixture_sleeper": [],
    });
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate({
      usernameOrUserId: "fixture_sleeper",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(ProviderParseError);
  });

  it("keeps the public Sleeper provider entry server-only", () => {
    const source = readFileSync(
      join(process.cwd(), "src/providers/sleeper/index.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
  });
});
