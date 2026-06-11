import {
  createEspnDiscoveryProvider,
  type EspnFetch,
  type EspnProvider,
} from "@/providers/espn/client";
import fanApiFixture from "../../test/fixtures/espn/fan-api-95050.json";
import leagueFixture from "../../test/fixtures/espn/league-95050-2026.json";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

export function createFixtureEspnFetch(): EspnFetch {
  return async (input) => {
    const url = new URL(input.toString());
    if (url.hostname === "fan.api.espn.com") {
      return jsonResponse(fanApiFixture);
    }
    if (url.hostname === "lm-api-reads.fantasy.espn.com") {
      return jsonResponse(leagueFixture);
    }
    return jsonResponse({ error: "fixture not found" }, { status: 404 });
  };
}

export function createFixtureEspnProvider(): EspnProvider {
  return createEspnDiscoveryProvider({
    fetch: createFixtureEspnFetch(),
    retryDelayMs: 0,
  });
}
