import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fanApiFixture from "../../../test/fixtures/espn/fan-api-95050.json";
import leagueFixture from "../../../test/fixtures/espn/league-95050-2026.json";
import {
  AuthExpiredError,
  ProviderBlockedError,
  type ProviderLeagueRef,
  ProviderParseError,
} from "../model";
import {
  createEspnDiscoveryClient,
  createEspnDiscoveryProvider,
  type EspnCookieCredentials,
  type EspnFetch,
  type EspnSession,
} from "./client";

const fixtureSwid = "{00000000-0000-4000-8000-000000000001}";
const fixtureEspnS2 = "fixture-session-value"; // ubs:ignore — fake ESPN cookie value for adapter tests
const leagueRef = {
  provider: "espn",
  providerId: "95050",
  season: 2026,
  sport: "ffl",
  name: "NHS Alumni Annual",
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

function createCapturingFetch(response: Response): {
  calls: { init: RequestInit | undefined; url: string }[];
  fetch: EspnFetch;
} {
  const calls: { init: RequestInit | undefined; url: string }[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      calls.push({ init, url: input.toString() });
      return response;
    },
  };
}

function fixtureCredentials(
  overrides: Partial<EspnCookieCredentials> = {},
): EspnCookieCredentials {
  return {
    swid: fixtureSwid,
    espn_s2: fixtureEspnS2,
    ...overrides,
  };
}

function fixtureSession(overrides: Partial<EspnSession> = {}): EspnSession {
  return {
    provider: "espn",
    authKind: "cookie",
    subjectProviderId: fixtureSwid,
    swid: fixtureSwid,
    espn_s2: fixtureEspnS2,
    ...overrides,
  };
}

describe("ESPN Fan API discovery client", () => {
  it("authenticates cookie credentials against the Fan API", async () => {
    const { calls, fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate(fixtureCredentials());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({
      provider: "espn",
      authKind: "cookie",
      subjectProviderId: fanApiFixture.id,
      swid: fixtureSwid,
      espn_s2: fixtureEspnS2,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://fan.api.espn.com/apis/v2/fans/%7B00000000-0000-4000-8000-000000000001%7D",
    );
  });

  it("exposes an ESPN auth/discovery provider with declared capabilities", async () => {
    const { fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const provider = createEspnDiscoveryProvider({ fetch, retryDelayMs: 0 });

    expect(provider).toMatchObject({
      id: "espn",
      name: "ESPN Fantasy Football",
      capabilities: {
        authKind: "cookie",
        requiresOAuth: false,
        supportsHistory: true,
        supportsRosters: true,
        supportsTransactions: true,
      },
    });
    await expect(
      provider.authenticate(fixtureCredentials()),
    ).resolves.toMatchObject({ ok: true });
    expect(provider.getLeague).toBeTypeOf("function");
    expect(provider.getTeams).toBeTypeOf("function");
    expect(provider.getMembers).toBeTypeOf("function");
    expect(provider.getMatchups).toBeTypeOf("function");
    expect(provider.getHistory).toBeTypeOf("function");
  });

  it("uses ESPN's required spoofed headers on Fan API requests", async () => {
    const { calls, fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    await client.authenticate(
      fixtureCredentials({ swid: fixtureSwid.slice(1, -1) }),
    );

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers).toMatchObject({
      Accept: "application/json",
      "x-fantasy-source": "kona",
      "x-fantasy-platform": "kona",
      "X-Personalization-Source": "ESPN.com - FAM",
    });
    expect(headers.Cookie).toBe(
      `SWID=${fixtureSwid}; espn_s2=${fixtureEspnS2}`,
    );
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
  });

  it("discovers normalized FFL leagues from the scrubbed Fan API fixture", async () => {
    const { fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.discoverLeagues(fixtureSession());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual([
      {
        provider: "espn",
        providerId: "95050",
        season: 2026,
        sport: "ffl",
        name: "NHS Alumni Annual",
        size: 12,
        teamName: "Fixture Team",
      },
    ]);
  });

  it("rejects malformed or missing cookie credentials before making a request", async () => {
    const { calls, fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate(
      fixtureCredentials({ swid: "not-a-guid", espn_s2: "" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(AuthExpiredError);
    expect(calls).toHaveLength(0);
  });

  it("maps an ESPN auth failure to AuthExpiredError", async () => {
    const { fetch } = createCapturingFetch(jsonResponse({}, { status: 401 }));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate(fixtureCredentials());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(AuthExpiredError);
  });

  it("retries retryable ESPN blocks before returning ProviderBlockedError", async () => {
    const calls: string[] = [];
    const fetch: EspnFetch = async (input) => {
      calls.push(input.toString());
      return jsonResponse({}, { status: 403 });
    };
    const client = createEspnDiscoveryClient({
      fetch,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    const result = await client.authenticate(fixtureCredentials());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(ProviderBlockedError);
    expect(calls).toHaveLength(2);
  });

  it("returns ProviderParseError for non-object Fan API payloads", async () => {
    const { fetch } = createCapturingFetch(jsonResponse([]));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate(fixtureCredentials());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(ProviderParseError);
  });

  it("keeps the public ESPN provider entry server-only", () => {
    const source = readFileSync(
      join(process.cwd(), "src/providers/espn/index.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
  });
});

describe("ESPN current league client", () => {
  it("normalizes the scrubbed 95050 league fixture", async () => {
    const { calls, fetch } = createCapturingFetch(jsonResponse(leagueFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getLeague(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual({
      provider: "espn",
      providerId: "95050",
      season: 2026,
      sport: "ffl",
      name: "NHS Alumni Annual",
      scoringType: "H2H_POINTS",
      size: 12,
      currentScoringPeriod: 0,
      status: "preseason",
    });
    expect(calls[0].url).toBe(
      "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/95050?view=mSettings",
    );
    expect(calls[0].init?.headers).toMatchObject({
      Accept: "application/json",
      "x-fantasy-source": "kona",
      "x-fantasy-platform": "kona",
      "X-Personalization-Source": "ESPN.com - FAM",
    });
  });

  it("normalizes 12 ESPN teams with owner member links", async () => {
    const { fetch } = createCapturingFetch(jsonResponse(leagueFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getTeams(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(12);
    expect(result.value[0]).toMatchObject({
      provider: "espn",
      providerId: "1",
      leagueProviderId: "95050",
      season: 2026,
      name: "Fixture Team 01",
      abbrev: "T01",
      ownerMemberIds: ["member-12"],
      record: {
        losses: 0,
        pointsAgainst: 0,
        pointsFor: 0,
        ties: 0,
        wins: 0,
      },
    });
  });

  it("normalizes ESPN members to durable provider ids", async () => {
    const { fetch } = createCapturingFetch(jsonResponse(leagueFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMembers(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(16);
    expect(result.value[0]).toEqual({
      provider: "espn",
      providerId: "member-01",
      leagueProviderId: "95050",
      season: 2026,
      displayName: "Fixture Manager 01",
      role: "member",
    });
  });

  it("normalizes all ESPN schedule matchups", async () => {
    const { fetch } = createCapturingFetch(jsonResponse(leagueFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMatchups(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(84);
    expect(result.value[0]).toMatchObject({
      provider: "espn",
      providerId: "1",
      leagueProviderId: "95050",
      season: 2026,
      scoringPeriod: 1,
      homeTeamRef: { provider: "espn", providerId: "7", season: 2026 },
      awayTeamRef: { provider: "espn", providerId: "5", season: 2026 },
      homeScore: 0,
      awayScore: 0,
      winner: "unknown",
      status: "scheduled",
    });
  });

  it("passes scoringPeriodId and locally filters matchup periods", async () => {
    const { calls, fetch } = createCapturingFetch(jsonResponse(leagueFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMatchups(fixtureSession(), leagueRef, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(6);
    expect(result.value.map((matchup) => matchup.scoringPeriod)).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
    expect(calls[0].url).toBe(
      "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/95050?view=mMatchup&view=mMatchupScore&scoringPeriodId=1",
    );
  });

  it("normalizes ESPN leagueHistory seasons into season bundles", async () => {
    const historyFixture = structuredClone(leagueFixture);
    historyFixture.seasonId = 2025;
    historyFixture.scoringPeriodId = 14;
    historyFixture.status.isExpired = true;
    historyFixture.status.isActive = false;
    historyFixture.teams[0].record.overall.wins = 11;
    historyFixture.teams[0].record.overall.losses = 3;
    historyFixture.teams[0].record.overall.pointsFor = 1777.25;
    historyFixture.teams[0].record.overall.pointsAgainst = 1450.5;
    Object.assign(historyFixture.teams[0], {
      playoffSeed: 4,
      rankCalculatedFinal: 1,
      rankFinal: 3,
    });
    historyFixture.teams[1].record.overall.wins = 12;
    historyFixture.teams[1].record.overall.pointsFor = 2000;
    Object.assign(historyFixture.teams[1], {
      playoffSeed: 1,
      rankCalculatedFinal: 2,
      rankFinal: 1,
    });
    historyFixture.schedule[0].winner = "HOME";
    historyFixture.schedule[0].home.totalPoints = 120.5;
    historyFixture.schedule[0].away.totalPoints = 99.25;

    const { calls, fetch } = createCapturingFetch(
      jsonResponse([historyFixture]),
    );
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getHistory(fixtureSession(), leagueRef, {
      seasons: [2025],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].league).toMatchObject({
      provider: "espn",
      providerId: "95050",
      season: 2025,
      status: "complete",
    });
    expect(result.value[0].teams).toHaveLength(12);
    expect(result.value[0].members).toHaveLength(16);
    expect(result.value[0].matchups[0]).toMatchObject({
      provider: "espn",
      providerId: "1",
      season: 2025,
      homeScore: 120.5,
      awayScore: 99.25,
      winner: "home",
      status: "final",
    });
    expect(result.value[0].finalStandings[0]).toMatchObject({
      rank: 1,
      teamRef: { provider: "espn", providerId: "1", season: 2025 },
      leagueProviderId: "95050",
      playoffSeed: 4,
      wins: 11,
      losses: 3,
      pointsFor: 1777.25,
      pointsAgainst: 1450.5,
    });
    expect(result.value[0].transactions).toEqual([]);
    expect(calls[0].url).toBe(
      "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/95050?seasonId=2025&view=mSettings&view=mTeam&view=mStandings&view=mMembers&view=mMatchup&view=mMatchupScore",
    );
  });

  it("falls back cleanly when ESPN omits optional team fields", async () => {
    const sparseFixture = structuredClone(leagueFixture);
    sparseFixture.teams[0].abbrev = "";
    sparseFixture.teams[0].logo = "";
    sparseFixture.teams[0].name = "";

    const { fetch } = createCapturingFetch(jsonResponse(sparseFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getTeams(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value[0]).toMatchObject({
      providerId: "1",
      name: "ESPN Team 1",
      abbrev: "1",
    });
    expect(result.value[0]).not.toHaveProperty("logo");
  });

  it("maps unknown ESPN matchup winners without throwing", async () => {
    const unknownWinnerFixture = structuredClone(leagueFixture);
    unknownWinnerFixture.schedule[0].winner = "COIN_FLIP";
    unknownWinnerFixture.schedule[0].home.totalPoints = 12;
    unknownWinnerFixture.schedule[0].away.totalPoints = 12;

    const { fetch } = createCapturingFetch(jsonResponse(unknownWinnerFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMatchups(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value[0]).toMatchObject({
      winner: "unknown",
      status: "unknown",
    });
  });
});
