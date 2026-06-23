// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createFixtureEspnProvider,
  FIXTURE_ESPN_PROVIDER_LEAGUE_ID,
} from "./fixture-espn";

const fixtureCredentials = {
  espn_s2: "fixture-session-value", // ubs:ignore — fake ESPN cookie value for fixture isolation
  swid: "{00000000-0000-4000-8000-000000000001}",
};

describe("fixture ESPN provider", () => {
  it("uses a reserved non-real provider league id for app-facing fixture imports", async () => {
    const provider = createFixtureEspnProvider();
    const session = await provider.authenticate(fixtureCredentials);
    expect(session.ok).toBe(true);
    if (!session.ok) throw session.error;

    const discovered = await provider.discoverLeagues(session.value);
    expect(discovered.ok).toBe(true);
    if (!discovered.ok) throw discovered.error;
    expect(discovered.value).toHaveLength(1);
    expect(discovered.value[0]).toMatchObject({
      provider: "espn",
      providerId: FIXTURE_ESPN_PROVIDER_LEAGUE_ID,
      season: 2026,
    });
    expect(FIXTURE_ESPN_PROVIDER_LEAGUE_ID).toMatch(/^fixture-/);
    expect(FIXTURE_ESPN_PROVIDER_LEAGUE_ID).not.toBe("95050");
    expect(FIXTURE_ESPN_PROVIDER_LEAGUE_ID).not.toMatch(/^\d+$/);

    const members = await provider.getMembers(
      session.value,
      discovered.value[0],
    );
    expect(members.ok).toBe(true);
    if (!members.ok) throw members.error;
    expect(members.value[0]).toMatchObject({
      displayName: "Fixture Manager 01",
      leagueProviderId: FIXTURE_ESPN_PROVIDER_LEAGUE_ID,
      providerId: "member-01",
    });
  });
});
