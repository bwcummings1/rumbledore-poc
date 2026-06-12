import {
  createYahooProvider,
  type YahooFetch,
  type YahooProvider,
} from "@/providers/yahoo/client";
import league2025Fixture from "../../test/fixtures/yahoo/league-2025.json";
import league2026Fixture from "../../test/fixtures/yahoo/league-2026.json";
import rosterTeam1Week1Fixture from "../../test/fixtures/yahoo/roster-461-team1-week1.json";
import scoreboard2025Week1Fixture from "../../test/fixtures/yahoo/scoreboard-2025-week1.json";
import scoreboard2025Week2Fixture from "../../test/fixtures/yahoo/scoreboard-2025-week2.json";
import scoreboard2026Week1Fixture from "../../test/fixtures/yahoo/scoreboard-2026-week1.json";
import scoreboard2026Week2Fixture from "../../test/fixtures/yahoo/scoreboard-2026-week2.json";
import transactions2025Fixture from "../../test/fixtures/yahoo/transactions-2025.json";
import userTeamsFixture from "../../test/fixtures/yahoo/user-teams.json";

export const FIXTURE_YAHOO_ACCESS_TOKEN = "fixture-yahoo-access-token"; // ubs:ignore — fake OAuth token for fixture-backed Yahoo onboarding
export const FIXTURE_YAHOO_REFRESH_TOKEN = "fixture-yahoo-refresh-token"; // ubs:ignore — fake OAuth token for fixture-backed Yahoo onboarding

type FixtureRouteValue = Response | unknown;
export interface FixtureYahooOptions {
  currentLeagueKey?: string;
  previousLeagueKey?: string;
}

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
            players: { count: 0 },
            week: String(week),
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

function cloneFixture<T>(value: T, options: Required<FixtureYahooOptions>): T {
  try {
    return JSON.parse(
      JSON.stringify(value)
        .replaceAll("461.l.95050", options.currentLeagueKey)
        .replaceAll("449.l.95050", options.previousLeagueKey),
    ) as T;
  } catch (cause) {
    throw new Error("Yahoo fixture could not be retargeted", { cause });
  }
}

function fixtureRoutes(
  options: Required<FixtureYahooOptions>,
): Record<string, FixtureRouteValue> {
  const userTeams = cloneFixture(userTeamsFixture, options);
  const currentLeague = cloneFixture(league2026Fixture, options);
  const previousLeague = cloneFixture(league2025Fixture, options);
  const currentScoreboardWeek1 = cloneFixture(
    scoreboard2026Week1Fixture,
    options,
  );
  const currentScoreboardWeek2 = cloneFixture(
    scoreboard2026Week2Fixture,
    options,
  );
  const previousScoreboardWeek1 = cloneFixture(
    scoreboard2025Week1Fixture,
    options,
  );
  const previousScoreboardWeek2 = cloneFixture(
    scoreboard2025Week2Fixture,
    options,
  );
  const currentRosterTeam1 = cloneFixture(rosterTeam1Week1Fixture, options);
  const previousTransactions = cloneFixture(transactions2025Fixture, options);

  return {
    "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/teams?format=json":
      userTeams,
    "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=461/teams?format=json":
      userTeams,
    "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=449/teams?format=json":
      userTeams,
    [`https://fantasysports.yahooapis.com/fantasy/v2/league/${options.currentLeagueKey};out=settings,standings?format=json`]:
      currentLeague,
    [`https://fantasysports.yahooapis.com/fantasy/v2/league/${options.previousLeagueKey};out=settings,standings?format=json`]:
      previousLeague,
    [`https://fantasysports.yahooapis.com/fantasy/v2/league/${options.currentLeagueKey}/scoreboard;week=1?format=json`]:
      currentScoreboardWeek1,
    [`https://fantasysports.yahooapis.com/fantasy/v2/league/${options.currentLeagueKey}/scoreboard;week=2?format=json`]:
      currentScoreboardWeek2,
    [`https://fantasysports.yahooapis.com/fantasy/v2/league/${options.previousLeagueKey}/scoreboard;week=1?format=json`]:
      previousScoreboardWeek1,
    [`https://fantasysports.yahooapis.com/fantasy/v2/league/${options.previousLeagueKey}/scoreboard;week=2?format=json`]:
      previousScoreboardWeek2,
    [`https://fantasysports.yahooapis.com/fantasy/v2/league/${options.currentLeagueKey}/transactions?format=json`]:
      emptyTransactionsFixture(options.currentLeagueKey),
    [`https://fantasysports.yahooapis.com/fantasy/v2/league/${options.previousLeagueKey}/transactions?format=json`]:
      previousTransactions,
    [`https://fantasysports.yahooapis.com/fantasy/v2/team/${options.currentLeagueKey}.t.1/roster;week=1?format=json`]:
      currentRosterTeam1,
    [`https://fantasysports.yahooapis.com/fantasy/v2/team/${options.currentLeagueKey}.t.2/roster;week=1?format=json`]:
      emptyRosterFixture(`${options.currentLeagueKey}.t.2`, 1),
    [`https://fantasysports.yahooapis.com/fantasy/v2/team/${options.currentLeagueKey}.t.3/roster;week=1?format=json`]:
      emptyRosterFixture(`${options.currentLeagueKey}.t.3`, 1),
    [`https://fantasysports.yahooapis.com/fantasy/v2/team/${options.currentLeagueKey}.t.4/roster;week=1?format=json`]:
      emptyRosterFixture(`${options.currentLeagueKey}.t.4`, 1),
  };
}

export function createFixtureYahooFetch(
  options: FixtureYahooOptions = {},
): YahooFetch {
  const resolvedOptions = {
    currentLeagueKey: options.currentLeagueKey ?? "461.l.95050",
    previousLeagueKey: options.previousLeagueKey ?? "449.l.95050",
  };
  const routes = fixtureRoutes(resolvedOptions);
  return async (input) => {
    const url = input.toString();
    if (!(url in routes)) {
      return jsonResponse(
        { message: `missing fixture for ${url}` },
        { status: 404 },
      );
    }

    const route = routes[url];
    return route instanceof Response ? route : jsonResponse(route);
  };
}

export function createFixtureYahooProvider(
  options: FixtureYahooOptions = {},
): YahooProvider {
  return createYahooProvider({
    fetch: createFixtureYahooFetch(options),
    retryDelayMs: 0,
  });
}
