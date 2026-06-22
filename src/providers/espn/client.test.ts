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

function fixtureSettings(
  fixture: typeof leagueFixture,
): Record<string, unknown> {
  return fixture.settings as Record<string, unknown>;
}

function twoWeekEspnMatchupFixture() {
  const fixture = structuredClone(leagueFixture);
  Object.assign(fixture.settings.scheduleSettings, {
    matchupPeriods: { "14": [14, 15] },
    playoffMatchupPeriodLength: 2,
  });
  Object.assign(fixture, {
    scoringPeriodId: 15,
    seasonId: 2025,
    schedule: [
      {
        away: {
          pointsByScoringPeriod: { "14": 98 },
          teamId: 2,
          totalPoints: 98,
        },
        home: {
          pointsByScoringPeriod: { "14": 120 },
          teamId: 1,
          totalPoints: 120,
        },
        id: 90,
        matchupPeriodId: 14,
        scoringPeriodId: 14,
        winner: "UNDECIDED",
      },
      {
        away: {
          pointsByScoringPeriod: { "15": 112 },
          teamId: 2,
          totalPoints: 210,
        },
        home: {
          pointsByScoringPeriod: { "15": 110 },
          teamId: 1,
          totalPoints: 230,
        },
        id: 90,
        matchupPeriodId: 14,
        scoringPeriodId: 15,
        winner: "HOME",
      },
    ],
  });
  return fixture;
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
        dataClasses: {
          league: "full",
          teams: "full",
          members: "full",
          rosters: "none",
          matchups: "full",
          final_standings: "partial",
          transactions: "none",
          history: "partial",
          divisions: "partial",
          keeper_dynasty: "none",
          scoring_detail: "partial",
        },
        requiresOAuth: false,
        supportsHistory: true,
        supportsRosters: false,
        supportsTransactions: false,
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
        providerTeamId: "9",
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
      scoringSettings: { scoringType: "H2H_POINTS" },
      size: 12,
      currentScoringPeriod: 0,
      status: "preseason",
      postseason: {
        championshipScoringPeriod: 17,
        matchupPeriodCount: 14,
        playoffStartScoringPeriod: 15,
        playoffTeamCount: 6,
        regularSeasonEndScoringPeriod: 14,
      },
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

  it("normalizes modern ESPN mSettings groups including FLEX and acquisition type", async () => {
    const fixture = structuredClone(leagueFixture);
    Object.assign(fixture.settings.scheduleSettings, {
      matchupPeriodCount: "14",
      playoffMatchupPeriodLength: "1",
      playoffTeamCount: "6",
    });
    Object.assign(fixtureSettings(fixture), {
      acquisitionSettings: {
        acquisitionBudget: "100",
        acquisitionType: "FREE_AGENT_BUDGET",
        minimumBid: 1,
      },
      rosterSettings: {
        lineupSlotCounts: {
          "0": "1",
          "2": "2",
          "4": "2",
          "6": "1",
          "16": "1",
          "17": "1",
          "20": "7",
          "23": "1",
        },
      },
      scoringSettings: {
        scoringItems: [
          { points: 0.1, statId: 3 },
          { points: 6, statId: 25 },
        ],
        scoringType: "H2H_POINTS",
      },
    });
    const { fetch } = createCapturingFetch(jsonResponse(fixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getLeague(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({
      acquisitionSettings: {
        acquisitionBudget: 100,
        acquisitionType: "FREE_AGENT_BUDGET",
        minimumBid: 1,
        source: "espn.settings.acquisitionSettings",
      },
      postseason: {
        matchupPeriodCount: 14,
        playoffMatchupPeriodLength: 1,
        playoffTeamCount: 6,
        regularSeasonEndScoringPeriod: 14,
      },
      rosterSettings: {
        lineupSlotCounts: {
          "0": 1,
          "2": 2,
          "4": 2,
          "6": 1,
          "16": 1,
          "17": 1,
          "20": 7,
          "23": 1,
        },
        source: "espn.settings.rosterSettings",
      },
      scoringSettings: {
        scoringItems: [
          { points: 0.1, statId: 3 },
          { points: 6, statId: 25 },
        ],
        scoringType: "H2H_POINTS",
      },
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

  it("derives a stable matchup id when ESPN omits schedule row ids", async () => {
    const fixture = structuredClone(leagueFixture);
    const firstMatchup = fixture.schedule[0] as { id?: unknown };
    delete firstMatchup.id;
    const { fetch } = createCapturingFetch(jsonResponse(fixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMatchups(fixtureSession(), leagueRef, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value[0]).toMatchObject({
      providerId: "1:7:5",
      scoringPeriod: 1,
      homeTeamRef: { providerId: "7" },
      awayTeamRef: { providerId: "5" },
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
      "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/95050?view=mMatchup&view=mMatchupScore&view=mSettings&scoringPeriodId=1",
    );
  });

  it("keeps ESPN two-week matchup windows when filtering by raw scoring period", async () => {
    const { fetch } = createCapturingFetch(
      jsonResponse(twoWeekEspnMatchupFixture()),
    );
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getMatchups(
      fixtureSession(),
      { ...leagueRef, season: 2025 },
      15,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      providerId: "90",
      scoringPeriod: 14,
      periodStart: 14,
      scoringPeriodSpan: 2,
      homeScore: 230,
      awayScore: 210,
      winner: "home",
      status: "final",
    });
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
      postseason: {
        championshipScoringPeriod: 17,
        matchupPeriodCount: 14,
        playoffStartScoringPeriod: 15,
        playoffTeamCount: 6,
        regularSeasonEndScoringPeriod: 14,
      },
    });
    expect(result.value[0].teams).toHaveLength(12);
    expect(result.value[0].members).toHaveLength(16);
    expect(result.value[0].matchups[0]).toMatchObject({
      provider: "espn",
      providerId: "1",
      season: 2025,
      periodStart: 1,
      scoringPeriod: 1,
      scoringPeriodSpan: 1,
      homeScore: 120.5,
      awayScore: 99.25,
      winner: "home",
      status: "final",
    });
    expect(result.value[0].finalStandings[0]).toMatchObject({
      rank: 1,
      rankConfidence: "high",
      rankSource: "provider_calculated_final",
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

  it("normalizes a 2011 OP and two-week playoff settings shape from history", async () => {
    const historyFixture = structuredClone(leagueFixture);
    historyFixture.seasonId = 2011;
    historyFixture.scoringPeriodId = 15;
    historyFixture.status.finalScoringPeriod = 16;
    historyFixture.status.isExpired = true;
    historyFixture.status.isActive = false;
    Object.assign(historyFixture.settings, { size: "10" });
    Object.assign(historyFixture.settings.scheduleSettings, {
      matchupPeriodCount: "13",
      playoffMatchupPeriodLength: "2",
      playoffTeamCount: "4",
    });
    Object.assign(fixtureSettings(historyFixture), {
      acquisitionSettings: {
        acquisitionBudget: "100",
        acquisitionType: "WAIVERS_TRADITIONAL",
      },
      rosterSettings: {
        lineupSlotCounts: {
          "0": "1",
          "2": "2",
          "4": "2",
          "6": "1",
          "7": "1",
          "16": "1",
          "17": "1",
          "20": "6",
        },
      },
      scoringSettings: {
        scoringItems: [{ points: 6, statId: 25 }],
        scoringType: "H2H_POINTS",
      },
    });
    const { fetch } = createCapturingFetch(jsonResponse([historyFixture]));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getHistory(fixtureSession(), leagueRef, {
      seasons: [2011],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value[0].league).toMatchObject({
      acquisitionSettings: {
        acquisitionBudget: 100,
        acquisitionType: "WAIVERS_TRADITIONAL",
      },
      postseason: {
        championshipScoringPeriod: 16,
        matchupPeriodCount: 13,
        playoffMatchupPeriodLength: 2,
        playoffStartScoringPeriod: 14,
        playoffTeamCount: 4,
        regularSeasonEndScoringPeriod: 13,
      },
      rosterSettings: {
        lineupSlotCounts: {
          "0": 1,
          "2": 2,
          "4": 2,
          "6": 1,
          "7": 1,
          "16": 1,
          "17": 1,
          "20": 6,
        },
      },
      scoringType: "H2H_POINTS",
      size: 10,
    });
  });

  it("normalizes ESPN history two-week schedule rows into one span-aware matchup", async () => {
    const { fetch } = createCapturingFetch(
      jsonResponse([twoWeekEspnMatchupFixture()]),
    );
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getHistory(fixtureSession(), leagueRef, {
      seasons: [2025],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value[0].matchups).toHaveLength(1);
    expect(result.value[0].matchups[0]).toMatchObject({
      providerId: "90",
      scoringPeriod: 14,
      periodStart: 14,
      scoringPeriodSpan: 2,
      homeScore: 230,
      awayScore: 210,
      winner: "home",
      status: "final",
    });
  });

  it("skips one-sided ESPN history rows until bye ingestion is implemented", async () => {
    const historyFixture = structuredClone(leagueFixture);
    historyFixture.seasonId = 2025;
    historyFixture.schedule.push({
      home: {
        pointsByScoringPeriod: { "14": 88 },
        teamId: 1,
        totalPoints: 88,
      },
      matchupPeriodId: 14,
      scoringPeriodId: 14,
      winner: "UNDECIDED",
    } as unknown as (typeof historyFixture.schedule)[number]);
    const { fetch } = createCapturingFetch(jsonResponse([historyFixture]));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getHistory(fixtureSession(), leagueRef, {
      seasons: [2025],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value[0].matchups).toHaveLength(84);
  });

  it("marks regular-season fallback final standings as low confidence", async () => {
    const historyFixture = structuredClone(leagueFixture);
    historyFixture.seasonId = 2024;
    historyFixture.status.isExpired = true;
    historyFixture.status.isActive = false;
    for (const team of historyFixture.teams) {
      const mutableTeam = team as {
        playoffSeed?: unknown;
        rankCalculatedFinal?: unknown;
        rankFinal?: unknown;
      };
      delete mutableTeam.rankCalculatedFinal;
      delete mutableTeam.rankFinal;
      delete mutableTeam.playoffSeed;
    }
    historyFixture.teams[0].record.overall.wins = 10;
    historyFixture.teams[0].record.overall.ties = 0;
    historyFixture.teams[0].record.overall.pointsFor = 1500;
    historyFixture.teams[1].record.overall.wins = 9;
    historyFixture.teams[1].record.overall.ties = 0;
    historyFixture.teams[1].record.overall.pointsFor = 1600;

    const { fetch } = createCapturingFetch(jsonResponse([historyFixture]));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.getHistory(fixtureSession(), leagueRef, {
      seasons: [2024],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value[0].finalStandings[0]).toMatchObject({
      rank: 1,
      rankConfidence: "low",
      rankSource: "regular_season_fallback",
      teamRef: { provider: "espn", providerId: "1", season: 2024 },
    });
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
