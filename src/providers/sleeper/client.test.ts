import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import draftPicks2025Fixture from "../../../test/fixtures/sleeper/draft-picks-2025.json";
import draftPicks2026Fixture from "../../../test/fixtures/sleeper/draft-picks-2026.json";
import drafts2025Fixture from "../../../test/fixtures/sleeper/drafts-2025.json";
import drafts2026Fixture from "../../../test/fixtures/sleeper/drafts-2026.json";
import league2024Fixture from "../../../test/fixtures/sleeper/league-2024.json";
import league2025Fixture from "../../../test/fixtures/sleeper/league-2025.json";
import leagues2026Fixture from "../../../test/fixtures/sleeper/leagues-2026.json";
import losersBracket2025Fixture from "../../../test/fixtures/sleeper/losers-bracket-2025.json";
import matchupsWeek1Fixture from "../../../test/fixtures/sleeper/matchups-2026-week1.json";
import matchupsWeek2Fixture from "../../../test/fixtures/sleeper/matchups-2026-week2.json";
import playersFixture from "../../../test/fixtures/sleeper/players-nfl.json";
import rostersFixture from "../../../test/fixtures/sleeper/rosters-2026.json";
import stateFixture from "../../../test/fixtures/sleeper/state-2026.json";
import transactionsWeek1Fixture from "../../../test/fixtures/sleeper/transactions-2026-week1.json";
import userFixture from "../../../test/fixtures/sleeper/user-fixture.json";
import usersFixture from "../../../test/fixtures/sleeper/users-2026.json";
import winnersBracket2025Fixture from "../../../test/fixtures/sleeper/winners-bracket-2025.json";
import { providerCodeDecodingIssues } from "../decoding";
import {
  AuthExpiredError,
  ProviderBlockedError,
  type ProviderLeagueRef,
  ProviderParseError,
} from "../model";
import {
  createSleeperClient as createBaseSleeperClient,
  createSleeperProvider as createBaseSleeperProvider,
  type SleeperClientOptions,
  type SleeperFetch,
  type SleeperSession,
} from "./client";
import type {
  SleeperCatalogPlayer,
  SleeperPlayerCatalog,
} from "./player-catalog";
import {
  encodeSleeperPosition,
  encodeSleeperRosterSlot,
  encodeSleeperScoringSetting,
  encodeSleeperTransactionType,
} from "./reference-data";

const league2026Fixture = leagues2026Fixture[0];

const fixtureCatalogPlayers = new Map<string, SleeperCatalogPlayer>(
  Object.entries(playersFixture).map(([id, player]) => [
    id,
    {
      active: player.active,
      fantasyPositions: player.fantasy_positions,
      fullName: player.full_name,
      playerId: player.player_id,
      position: player.position,
      proTeam: player.team,
      status: player.status,
    },
  ]),
);
const fixturePlayerCatalog: SleeperPlayerCatalog = {
  load: async () => ({ ok: true, value: fixtureCatalogPlayers }),
};

function createSleeperClient(options: SleeperClientOptions = {}) {
  return createBaseSleeperClient({
    ...options,
    playerCatalog: options.playerCatalog ?? fixturePlayerCatalog,
  });
}

function createSleeperProvider(options: SleeperClientOptions = {}) {
  return createBaseSleeperProvider({
    ...options,
    playerCatalog: options.playerCatalog ?? fixturePlayerCatalog,
  });
}

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

function requiredCode(value: number | undefined): number {
  if (value === undefined) throw new Error("expected a Sleeper adapter code");
  return value;
}

function lineupSlotCounts(slots: readonly string[]): Record<string, number> {
  const counts = new Map<number, number>();
  for (const slot of slots) {
    const slotId = requiredCode(encodeSleeperRosterSlot(slot));
    counts.set(slotId, (counts.get(slotId) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].map(([slotId, count]) => [String(slotId), count]),
  );
}

type FixtureRouteValue = Response | unknown;

function fixtureRoutes(): Record<string, FixtureRouteValue> {
  return {
    "https://api.sleeper.app/v1/user/fixture_sleeper": userFixture,
    "https://api.sleeper.app/v1/user/user-123": userFixture,
    "https://api.sleeper.app/v1/players/nfl": playersFixture,
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
    "https://api.sleeper.app/v1/league/sleeper-2026/drafts": drafts2026Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2025/drafts": drafts2025Fixture,
    "https://api.sleeper.app/v1/draft/draft-sleeper-2026/picks":
      draftPicks2026Fixture,
    "https://api.sleeper.app/v1/draft/draft-sleeper-2025/picks":
      draftPicks2025Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2026/winners_bracket": [],
    "https://api.sleeper.app/v1/league/sleeper-2026/losers_bracket": [],
    "https://api.sleeper.app/v1/league/sleeper-2025/winners_bracket":
      winnersBracket2025Fixture,
    "https://api.sleeper.app/v1/league/sleeper-2025/losers_bracket":
      losersBracket2025Fixture,
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
          matchups: "partial",
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
    expect(provider.getDraftPicks).toBeTypeOf("function");
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
        previousProviderId: "sleeper-2025",
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
      scoringSettings: {
        idp: false,
        rec: 1,
        rosterPositions: ["QB", "RB", "WR", "TE", "FLEX", "BN", "BN", "IR"],
        scoringItems: [
          {
            points: 1,
            statId: requiredCode(encodeSleeperScoringSetting("rec")),
            statKey: "rec",
          },
        ],
      },
      rosterSettings: {
        lineupSlotCounts: lineupSlotCounts([
          "QB",
          "RB",
          "WR",
          "TE",
          "FLEX",
          "BN",
          "BN",
          "IR",
        ]),
        source: "sleeper.league.roster_positions",
      },
      size: 4,
      currentScoringPeriod: 2,
      status: "in_season",
      postseason: {
        playoffTeamCount: 2,
        playoffStartScoringPeriod: 15,
        regularSeasonEndScoringPeriod: 14,
      },
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
    expect(result.value[1]?.ownerMemberIds).toEqual(["user-2"]);
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

  it("attaches named players, decoded identity, lineup state, and weekly actuals", async () => {
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
    const entries = result.value[0].entries;
    expect(entries).toHaveLength(6);
    expect(entries[0]).toMatchObject({
      actualPoints: 22.4,
      player: {
        provider: "sleeper",
        providerId: "QB1",
        leagueProviderId: "sleeper-2026",
        fullName: "Quentin Banks",
        position: "QB",
        proTeam: "BUF",
        metadata: {
          catalogMissing: false,
          catalogSource: "sleeper.players.nfl",
          rawPosition: "QB",
          rawProTeam: "BUF",
        },
      },
      playerRef: { provider: "sleeper", providerId: "QB1" },
      points: 22.4,
      slot: "QB",
      started: true,
      status: "active",
      metadata: {
        lineupSlotId: requiredCode(encodeSleeperRosterSlot("QB")),
        lineupSlotLabel: "QB",
        rawLineupSlot: "QB",
      },
    });
    expect(
      entries.find((entry) => entry.playerRef.providerId === "BN1"),
    ).toMatchObject({
      actualPoints: 7,
      player: { fullName: "Bennett North", position: "TE" },
      slot: "BN",
      started: false,
      status: "bench",
    });
    expect(
      entries.find((entry) => entry.playerRef.providerId === "IR1"),
    ).toMatchObject({
      actualPoints: 0,
      player: { fullName: "Isaiah Rivers", position: "RB" },
      slot: "IR",
      started: false,
      status: "reserve",
    });
    expect(
      entries.find((entry) => entry.playerRef.providerId === "ARI"),
    ).toMatchObject({
      actualPoints: 8,
      player: {
        fullName: "Arizona Cardinals",
        position: "DEF",
        proTeam: "ARI",
        metadata: {
          defenseProviderIdConvention: "nfl_team_code",
          isTeamDefense: true,
        },
      },
      playerRef: { provider: "sleeper", providerId: "ARI" },
      slot: "BN",
      started: false,
    });
    expect(entries.map((entry) => entry.player?.position)).not.toContain(
      "unknown",
    );
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

  it("normalizes listed Sleeper drafts and their picks", async () => {
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getDraftPicks(fixtureSession(), leagueRef);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]).toMatchObject({
      provider: "sleeper",
      providerId: "draft-sleeper-2026:1",
      leagueProviderId: "sleeper-2026",
      season: 2026,
      round: 1,
      pickOverall: 1,
      pickInRound: 1,
      isKeeper: true,
      teamRef: { provider: "sleeper", providerId: "1", season: 2026 },
      playerRef: { provider: "sleeper", providerId: "QB1" },
      player: {
        fullName: "Quentin Banks",
        position: "QB",
        proTeam: "BUF",
      },
      metadata: {
        draftId: "draft-sleeper-2026",
        draftSlot: 1,
        draftStatus: "complete",
        draftType: "snake",
        pickedBy: "user-1",
      },
    });
    expect(result.value[2]).toMatchObject({
      providerId: "draft-sleeper-2026:5",
      round: 2,
      pickOverall: 5,
      pickInRound: 1,
      isKeeper: false,
      teamRef: { providerId: "4" },
      metadata: { draftSlot: 4 },
    });
  });

  it("persists an unknown catalog position as a loud decoding issue", async () => {
    const players = new Map(fixtureCatalogPlayers);
    const qb = players.get("QB1");
    if (!qb) throw new Error("QB1 fixture player is missing");
    players.set("QB1", { ...qb, position: "MYSTERY_POSITION" });
    const playerCatalog: SleeperPlayerCatalog = {
      load: async () => ({ ok: true, value: players }),
    };
    const { fetch } = createFixtureFetch();
    const client = createSleeperClient({
      fetch,
      playerCatalog,
      retryDelayMs: 0,
    });

    const result = await client.getRosters(fixtureSession(), leagueRef, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    const normalized = result.value[0].entries.find(
      (entry) => entry.playerRef.providerId === "QB1",
    )?.player;
    expect(normalized?.position).toBe("unknown");
    const positionId = normalized?.metadata?.defaultPositionId;
    expect(positionId).toBe(
      requiredCode(encodeSleeperPosition("MYSTERY_POSITION")),
    );
    expect(positionId).toBeTypeOf("number");
    expect(
      providerCodeDecodingIssues("sleeper", {
        positions: [positionId as number],
      }),
    ).toEqual([
      {
        id: positionId,
        kind: "position",
        provider: "sleeper",
        reason: "unknown_code",
      },
    ]);
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
        homeScore: 54.7,
        awayScore: 110.02,
        winner: "away",
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
      awayScore: 18,
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
      postseason: {
        playoffTeamCount: 2,
        playoffStartScoringPeriod: 2,
        regularSeasonEndScoringPeriod: 1,
      },
    });
    expect(result.value[0].teams).toHaveLength(4);
    expect(result.value[0].members).toHaveLength(4);
    expect(result.value[0].matchups).toHaveLength(4);
    expect(result.value[0].rosters).toHaveLength(8);
    expect(result.value[0].players).toHaveLength(15);
    expect(result.value[0].players).toContainEqual(
      expect.objectContaining({
        providerId: "QB1",
        fullName: "Quentin Banks",
        position: "QB",
        proTeam: "BUF",
      }),
    );
    expect(
      result.value[0].rosters
        ?.find(
          (roster) =>
            roster.teamRef.providerId === "1" && roster.scoringPeriod === 1,
        )
        ?.entries.find((entry) => entry.playerRef.providerId === "QB1"),
    ).toMatchObject({
      actualPoints: 22.4,
      player: { fullName: "Quentin Banks", position: "QB" },
      started: true,
    });
    expect(result.value[0].finalStandings[0]).toMatchObject({
      rank: 1,
      rankConfidence: "high",
      rankSource: "provider_calculated_final",
      teamRef: { provider: "sleeper", providerId: "2", season: 2025 },
      pointsFor: 210.02,
    });
    expect(
      result.value[0].finalStandings.map((standing) => standing.rank),
    ).toEqual([1, 2, 3, 4]);
    expect(result.value[0].draftPicks).toHaveLength(2);
    expect(result.value[0].draftPicks?.[0]).toMatchObject({
      providerId: "draft-sleeper-2025:1",
      isKeeper: true,
      teamRef: { providerId: "2", season: 2025 },
      player: { fullName: "Caleb Stone", position: "QB" },
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
          rawTransactionType: "free_agent",
          rawType: requiredCode(encodeSleeperTransactionType("free_agent")),
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
          rawTransactionType: "trade",
          rawType: requiredCode(encodeSleeperTransactionType("trade")),
          status: "complete",
          week: 1,
        },
      },
    ]);
  });

  it("keeps a changing roster vocabulary across a multi-season history chain", async () => {
    const league2025WithHistory = {
      ...league2025Fixture,
      previous_league_id: "sleeper-2024",
    };
    const { fetch } = createFixtureFetch({
      ...fixtureRoutes(),
      "https://api.sleeper.app/v1/league/sleeper-2025": league2025WithHistory,
      "https://api.sleeper.app/v1/league/sleeper-2024": league2024Fixture,
      "https://api.sleeper.app/v1/league/sleeper-2024/rosters": rostersFixture,
      "https://api.sleeper.app/v1/league/sleeper-2024/users": usersFixture,
      "https://api.sleeper.app/v1/league/sleeper-2024/drafts": [],
      "https://api.sleeper.app/v1/league/sleeper-2024/winners_bracket": [],
      "https://api.sleeper.app/v1/league/sleeper-2024/losers_bracket": [],
      "https://api.sleeper.app/v1/league/sleeper-2024/matchups/1":
        matchupsWeek1Fixture,
      "https://api.sleeper.app/v1/league/sleeper-2024/matchups/2":
        matchupsWeek2Fixture,
      "https://api.sleeper.app/v1/league/sleeper-2024/transactions/1": [],
      "https://api.sleeper.app/v1/league/sleeper-2024/transactions/2": [],
    });
    const client = createSleeperClient({ fetch, retryDelayMs: 0 });

    const result = await client.getHistory(fixtureSession(), leagueRef, {
      seasons: [2025, 2024],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.map((bundle) => bundle.league.season)).toEqual([
      2025, 2024,
    ]);
    expect(result.value[0].league.scoringSettings?.rosterPositions).toEqual([
      "QB",
      "RB",
      "WR",
      "TE",
      "FLEX",
      "BN",
      "BN",
      "IR",
    ]);
    expect(result.value[1].league.scoringSettings?.rosterPositions).toEqual([
      "SUPER_FLEX",
      "WRRB_FLEX",
      "REC_FLEX",
      "BN",
      "BN",
      "TAXI",
      "IR",
    ]);
    expect(
      result.value[1].rosters?.[0]?.entries.find(
        (entry) => entry.playerRef.providerId === "QB1",
      ),
    ).toMatchObject({ slot: "SUPER_FLEX", started: true });
    expect(result.value[1].finalStandings[0]).toMatchObject({
      rankConfidence: "low",
      rankSource: "regular_season_fallback",
      teamRef: { providerId: "1", season: 2024 },
    });
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
