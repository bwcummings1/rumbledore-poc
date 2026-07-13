// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSleeperProvider } from "./client";
import {
  createFixtureSleeperFetch,
  createFixtureSleeperProvider,
} from "./fixture-sleeper";
import {
  FIXTURE_SLEEPER_PREVIOUS_PROVIDER_LEAGUE_ID,
  FIXTURE_SLEEPER_PROVIDER_LEAGUE_ID,
  FIXTURE_SLEEPER_USERNAME,
} from "./fixture-values";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Sleeper fixture provider", () => {
  it("drives discovery and deep history without a network request", async () => {
    const requests: URL[] = [];
    const provider = createFixtureSleeperProvider({
      onRequest: (url) => requests.push(url),
    });
    const authenticated = await provider.authenticate({
      seasons: [2026, 2025],
      usernameOrUserId: FIXTURE_SLEEPER_USERNAME,
    });
    expect(authenticated.ok).toBe(true);
    if (!authenticated.ok) throw authenticated.error;

    const discovered = await provider.discoverLeagues(authenticated.value);
    expect(discovered.ok).toBe(true);
    if (!discovered.ok) throw discovered.error;
    expect(discovered.value).toEqual([
      expect.objectContaining({
        name: "Sleeper Fixture League",
        providerId: FIXTURE_SLEEPER_PROVIDER_LEAGUE_ID,
        season: 2026,
      }),
      expect.objectContaining({
        name: "Sleeper Fixture League 2025",
        providerId: FIXTURE_SLEEPER_PREVIOUS_PROVIDER_LEAGUE_ID,
        season: 2025,
      }),
    ]);

    const currentLeague = discovered.value[0];
    if (!currentLeague) throw new Error("current fixture league was missing");
    const history = await provider.getHistory(
      authenticated.value,
      currentLeague,
      { seasons: [2026, 2025] },
    );
    expect(history.ok).toBe(true);
    if (!history.ok) throw history.error;
    expect(history.value.map((bundle) => bundle.league.season)).toEqual([
      2026, 2025,
    ]);
    expect(history.value[0]?.draftPicks).toHaveLength(3);
    expect(history.value[1]?.draftPicks).toHaveLength(2);
    expect(history.value[1]?.finalStandings.slice(0, 2)).toEqual([
      expect.objectContaining({
        rank: 1,
        rankConfidence: "high",
        rankSource: "provider_calculated_final",
        teamRef: expect.objectContaining({ providerId: "2" }),
      }),
      expect.objectContaining({
        rank: 2,
        rankConfidence: "high",
        rankSource: "provider_calculated_final",
        teamRef: expect.objectContaining({ providerId: "1" }),
      }),
    ]);
    expect(history.value.flatMap((bundle) => bundle.players ?? [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fullName: "Quentin Banks",
          position: "QB",
          proTeam: "BUF",
          providerId: "QB1",
        }),
      ]),
    );
    expect(
      history.value
        .flatMap((bundle) => bundle.players ?? [])
        .some((player) => player.position === "unknown"),
    ).toBe(false);
    expect(requests.length).toBeGreaterThan(20);
    expect(
      requests.every((request) => request.hostname === "api.sleeper.app"),
    ).toBe(true);
  });

  it("retargets fixture identities and reports unhandled routes explicitly", async () => {
    const fetch = createFixtureSleeperFetch({
      currentLeagueId: "fixture-custom-current",
      currentLeagueName: "Custom Current",
      previousLeagueId: "fixture-custom-previous",
      previousLeagueName: "Custom Previous",
    });

    const current = await fetch(
      "https://api.sleeper.app/v1/league/fixture-custom-current",
    );
    expect(current.ok).toBe(true);
    expect(await current.json()).toMatchObject({
      league_id: "fixture-custom-current",
      name: "Custom Current",
      previous_league_id: "fixture-custom-previous",
    });

    const missing = await fetch(
      "https://api.sleeper.app/v1/league/fixture-custom-current/missing",
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      message:
        "missing Sleeper fixture for /v1/league/fixture-custom-current/missing",
    });
  });

  it("uses the fixture provider for the reserved local onboarding identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("the reserved fixture identity reached the network");
      }),
    );
    const provider = createSleeperProvider();

    const authenticated = await provider.authenticate({
      seasons: [2026],
      usernameOrUserId: FIXTURE_SLEEPER_USERNAME,
    });
    expect(authenticated.ok).toBe(true);
    if (!authenticated.ok) throw authenticated.error;

    const discovered = await provider.discoverLeagues(authenticated.value);
    expect(discovered.ok).toBe(true);
    if (!discovered.ok) throw discovered.error;
    expect(discovered.value[0]?.providerId).toBe(
      FIXTURE_SLEEPER_PROVIDER_LEAGUE_ID,
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
