import {
  createEspnDiscoveryProvider,
  type EspnFetch,
  type EspnProvider,
} from "@/providers/espn/client";
import fanApiFixture from "../../test/fixtures/espn/fan-api-95050.json";
import leagueFixture from "../../test/fixtures/espn/league-95050-2026.json";

export const FIXTURE_ESPN_PROVIDER_LEAGUE_ID = "fixture-espn-95050";

type MutableFanFixture = typeof fanApiFixture;
type MutableLeagueFixture = Omit<typeof leagueFixture, "id"> & {
  id: string | number;
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function retargetFanFixture(providerLeagueId: string): MutableFanFixture {
  const fixture = structuredClone(fanApiFixture) as MutableFanFixture;
  const entry = fixture.preferences[0]?.metaData.entry;
  const group = entry?.groups[0] as
    | ({ groupId: string | number } & Record<string, unknown>)
    | undefined;
  if (group) {
    group.groupId = providerLeagueId;
  }
  return fixture;
}

function retargetLeagueFixture(providerLeagueId: string): MutableLeagueFixture {
  const fixture = structuredClone(leagueFixture) as MutableLeagueFixture;
  fixture.id = providerLeagueId;
  return fixture;
}

export function createFixtureEspnFetch(): EspnFetch {
  const fanFixture = retargetFanFixture(FIXTURE_ESPN_PROVIDER_LEAGUE_ID);
  const currentLeagueFixture = retargetLeagueFixture(
    FIXTURE_ESPN_PROVIDER_LEAGUE_ID,
  );
  return async (input) => {
    const url = new URL(input.toString());
    if (url.hostname === "fan.api.espn.com") {
      return jsonResponse(fanFixture);
    }
    if (url.hostname === "lm-api-reads.fantasy.espn.com") {
      if (url.pathname.includes("/leagueHistory/")) {
        return jsonResponse([currentLeagueFixture]);
      }
      return jsonResponse(currentLeagueFixture);
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
