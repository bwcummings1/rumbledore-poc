import { createFixtureEspnProvider } from "@/onboarding/fixture-espn";
import { createFixtureYahooProvider } from "@/onboarding/fixture-yahoo";
import type { FantasyProviderId } from "@/providers";
import {
  createSleeperProvider,
  type SleeperFetch,
} from "@/providers/sleeper/client";
import league2025Fixture from "../../test/fixtures/sleeper/league-2025.json";
import leagues2026Fixture from "../../test/fixtures/sleeper/leagues-2026.json";
import matchupsWeek1Fixture from "../../test/fixtures/sleeper/matchups-2026-week1.json";
import matchupsWeek2Fixture from "../../test/fixtures/sleeper/matchups-2026-week2.json";
import stateFixture from "../../test/fixtures/sleeper/state-2026.json";
import userFixture from "../../test/fixtures/sleeper/user-fixture.json";
import type { ProviderPayloadCanaryProvider } from "./drift-canary";

interface FixtureCanaryTarget {
  provider: Extract<FantasyProviderId, "espn" | "sleeper" | "yahoo">;
  providerLeagueId: string;
  season: number;
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

function retargetSleeperFixture<T>(
  value: T,
  target: Pick<FixtureCanaryTarget, "providerLeagueId" | "season">,
): T {
  return JSON.parse(
    JSON.stringify(value)
      .replaceAll("sleeper-2026", target.providerLeagueId)
      .replaceAll('"2026"', JSON.stringify(String(target.season))),
  ) as T;
}

function createFixtureSleeperCanaryFetch(
  target: Pick<FixtureCanaryTarget, "providerLeagueId" | "season">,
): SleeperFetch {
  const currentLeague = retargetSleeperFixture(leagues2026Fixture[0], target);
  const previousLeague = retargetSleeperFixture(league2025Fixture, target);
  const state = retargetSleeperFixture(stateFixture, target);
  const week1 = retargetSleeperFixture(matchupsWeek1Fixture, target);
  const week2 = retargetSleeperFixture(matchupsWeek2Fixture, target);

  return async (input) => {
    const url = new URL(input.toString());
    if (url.pathname.startsWith("/v1/user/")) {
      return jsonResponse(userFixture);
    }
    if (url.pathname === "/v1/state/nfl") {
      return jsonResponse(state);
    }
    if (url.pathname.endsWith("/matchups/1")) {
      return jsonResponse(week1);
    }
    if (url.pathname.endsWith("/matchups/2")) {
      return jsonResponse(week2);
    }
    if (url.pathname.startsWith("/v1/league/")) {
      return jsonResponse(
        url.pathname.includes(target.providerLeagueId)
          ? currentLeague
          : previousLeague,
      );
    }
    return jsonResponse(
      { message: `missing fixture for ${url.pathname}` },
      {
        status: 404,
      },
    );
  };
}

export function createFixtureProviderPayloadCanaryProvider(
  target: FixtureCanaryTarget,
): ProviderPayloadCanaryProvider {
  switch (target.provider) {
    case "espn":
      return createFixtureEspnProvider();
    case "sleeper":
      return createSleeperProvider({
        fetch: createFixtureSleeperCanaryFetch(target),
        retryDelayMs: 0,
      });
    case "yahoo":
      return createFixtureYahooProvider({
        currentLeagueKey: target.providerLeagueId,
      });
  }
}
