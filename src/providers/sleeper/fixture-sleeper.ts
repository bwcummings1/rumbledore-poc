import draftPicks2025Fixture from "../../../test/fixtures/sleeper/draft-picks-2025.json";
import draftPicks2026Fixture from "../../../test/fixtures/sleeper/draft-picks-2026.json";
import drafts2025Fixture from "../../../test/fixtures/sleeper/drafts-2025.json";
import drafts2026Fixture from "../../../test/fixtures/sleeper/drafts-2026.json";
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
import {
  createSleeperProvider,
  type SleeperFetch,
  type SleeperProvider,
} from "./client";
import {
  FIXTURE_SLEEPER_PREVIOUS_PROVIDER_LEAGUE_ID,
  FIXTURE_SLEEPER_PROVIDER_LEAGUE_ID,
  FIXTURE_SLEEPER_USER_ID,
  FIXTURE_SLEEPER_USERNAME,
} from "./fixture-values";
import type {
  SleeperCatalogPlayer,
  SleeperPlayerCatalog,
} from "./player-catalog";

const SLEEPER_API_HOSTNAME = "api.sleeper.app";

export interface FixtureSleeperOptions {
  currentLeagueId?: string;
  currentLeagueName?: string;
  onRequest?: (url: URL, init: RequestInit | undefined) => void;
  previousLeagueId?: string;
  previousLeagueName?: string;
  userId?: string;
  username?: string;
}

interface ResolvedFixtureSleeperOptions {
  currentLeagueId: string;
  currentLeagueName: string;
  onRequest?: (url: URL, init: RequestInit | undefined) => void;
  previousLeagueId: string;
  previousLeagueName: string;
  userId: string;
  username: string;
}

function resolveOptions(
  options: FixtureSleeperOptions,
): ResolvedFixtureSleeperOptions {
  return {
    currentLeagueId:
      options.currentLeagueId ?? FIXTURE_SLEEPER_PROVIDER_LEAGUE_ID,
    currentLeagueName: options.currentLeagueName ?? "Sleeper Fixture League",
    ...(options.onRequest ? { onRequest: options.onRequest } : {}),
    previousLeagueId:
      options.previousLeagueId ?? FIXTURE_SLEEPER_PREVIOUS_PROVIDER_LEAGUE_ID,
    previousLeagueName:
      options.previousLeagueName ?? "Sleeper Fixture League 2025",
    userId: options.userId ?? FIXTURE_SLEEPER_USER_ID,
    username: options.username ?? FIXTURE_SLEEPER_USERNAME,
  };
}

function cloneFixture<T>(value: T, options: ResolvedFixtureSleeperOptions): T {
  try {
    return JSON.parse(
      JSON.stringify(value)
        .replaceAll("Sleeper Fixture League 2025", options.previousLeagueName)
        .replaceAll("Sleeper Fixture League", options.currentLeagueName)
        .replaceAll("sleeper-2026", options.currentLeagueId)
        .replaceAll("sleeper-2025", options.previousLeagueId)
        .replaceAll(FIXTURE_SLEEPER_USERNAME, options.username)
        .replaceAll(FIXTURE_SLEEPER_USER_ID, options.userId),
    ) as T;
  } catch (cause) {
    throw new Error("Sleeper fixture could not be retargeted", { cause });
  }
}

function cloneRosterFixture(
  leagueId: string,
  options: ResolvedFixtureSleeperOptions,
): unknown {
  return JSON.parse(
    JSON.stringify(rostersFixture)
      .replaceAll("sleeper-2026", leagueId)
      .replaceAll(FIXTURE_SLEEPER_USER_ID, options.userId),
  ) as unknown;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function fixturePlayerCatalog(): SleeperPlayerCatalog {
  const players = new Map<string, SleeperCatalogPlayer>(
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
  return {
    load: async () => ({ ok: true, value: players }),
  };
}

export function createFixtureSleeperFetch(
  options: FixtureSleeperOptions = {},
): SleeperFetch {
  const resolved = resolveOptions(options);
  const currentLeague = cloneFixture(leagues2026Fixture[0], resolved);
  const previousLeague = cloneFixture(league2025Fixture, resolved);
  const currentDrafts = cloneFixture(drafts2026Fixture, resolved);
  const previousDrafts = cloneFixture(drafts2025Fixture, resolved);
  const currentDraftPicks = cloneFixture(draftPicks2026Fixture, resolved);
  const previousDraftPicks = cloneFixture(draftPicks2025Fixture, resolved);
  const user = cloneFixture(userFixture, resolved);
  const users = cloneFixture(usersFixture, resolved);
  const state = {
    ...cloneFixture(stateFixture, resolved),
    display_week: 1,
    week: 1,
  };

  return async (input, init) => {
    const url = new URL(input.toString());
    resolved.onRequest?.(url, init);
    if (url.hostname !== SLEEPER_API_HOSTNAME) {
      return jsonResponse(
        { message: "fixture host not found" },
        { status: 404 },
      );
    }

    const path = url.pathname;
    if (
      path === `/v1/user/${encodeURIComponent(resolved.username)}` ||
      path === `/v1/user/${encodeURIComponent(resolved.userId)}`
    ) {
      return jsonResponse(user);
    }
    if (path === "/v1/state/nfl") {
      return jsonResponse(state);
    }
    if (path === "/v1/players/nfl") {
      return jsonResponse(playersFixture);
    }

    const userLeagueMatch = path.match(
      /^\/v1\/user\/([^/]+)\/leagues\/nfl\/(\d{4})$/,
    );
    if (userLeagueMatch) {
      const [, encodedUserId, season] = userLeagueMatch;
      if (decodeURIComponent(encodedUserId ?? "") !== resolved.userId) {
        return jsonResponse([]);
      }
      switch (season) {
        case "2026":
          return jsonResponse([currentLeague]);
        case "2025":
          return jsonResponse([previousLeague]);
        default:
          return jsonResponse([]);
      }
    }

    const currentLeaguePath = `/v1/league/${encodeURIComponent(resolved.currentLeagueId)}`;
    const previousLeaguePath = `/v1/league/${encodeURIComponent(resolved.previousLeagueId)}`;
    if (path === currentLeaguePath) {
      return jsonResponse(currentLeague);
    }
    if (path === previousLeaguePath) {
      return jsonResponse(previousLeague);
    }
    if (path === `${currentLeaguePath}/rosters`) {
      return jsonResponse(
        cloneRosterFixture(resolved.currentLeagueId, resolved),
      );
    }
    if (path === `${previousLeaguePath}/rosters`) {
      return jsonResponse(
        cloneRosterFixture(resolved.previousLeagueId, resolved),
      );
    }
    if (
      path === `${currentLeaguePath}/users` ||
      path === `${previousLeaguePath}/users`
    ) {
      return jsonResponse(users);
    }
    if (path === `${currentLeaguePath}/drafts`) {
      return jsonResponse(currentDrafts);
    }
    if (path === `${previousLeaguePath}/drafts`) {
      return jsonResponse(previousDrafts);
    }
    if (path === `/v1/draft/draft-${resolved.currentLeagueId}/picks`) {
      return jsonResponse(currentDraftPicks);
    }
    if (path === `/v1/draft/draft-${resolved.previousLeagueId}/picks`) {
      return jsonResponse(previousDraftPicks);
    }
    if (path === `${currentLeaguePath}/winners_bracket`) {
      return jsonResponse([]);
    }
    if (path === `${currentLeaguePath}/losers_bracket`) {
      return jsonResponse([]);
    }
    if (path === `${previousLeaguePath}/winners_bracket`) {
      return jsonResponse(winnersBracket2025Fixture);
    }
    if (path === `${previousLeaguePath}/losers_bracket`) {
      return jsonResponse(losersBracket2025Fixture);
    }

    const leagueDataMatch = path.match(
      /^\/v1\/league\/([^/]+)\/(matchups|transactions)\/(\d+)$/,
    );
    if (leagueDataMatch) {
      const [, encodedLeagueId, resource, period] = leagueDataMatch;
      const leagueId = decodeURIComponent(encodedLeagueId ?? "");
      if (
        leagueId !== resolved.currentLeagueId &&
        leagueId !== resolved.previousLeagueId
      ) {
        return jsonResponse(
          { message: "fixture league not found" },
          { status: 404 },
        );
      }
      if (resource === "matchups") {
        switch (period) {
          case "1":
            return jsonResponse(matchupsWeek1Fixture);
          case "2":
            return jsonResponse(matchupsWeek2Fixture);
          default:
            return jsonResponse([]);
        }
      }
      return jsonResponse(period === "1" ? transactionsWeek1Fixture : []);
    }

    return jsonResponse(
      { message: `missing Sleeper fixture for ${path}` },
      { status: 404 },
    );
  };
}

export function createFixtureSleeperProvider(
  options: FixtureSleeperOptions = {},
): SleeperProvider {
  return createSleeperProvider({
    fetch: createFixtureSleeperFetch(options),
    maxAttempts: 1,
    playerCatalog: fixturePlayerCatalog(),
    retryDelayMs: 0,
  });
}
