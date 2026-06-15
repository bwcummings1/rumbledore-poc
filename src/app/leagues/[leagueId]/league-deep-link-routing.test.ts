import { describe, expect, it } from "vitest";
import {
  leagueDeepLinkOnboardingHref,
  leagueDeepLinkPath,
} from "./league-deep-link-routing";

describe("league deep-link routing", () => {
  it("builds canonical league-scope destinations with encoded path segments", () => {
    expect(
      leagueDeepLinkPath({
        leagueId: "league id",
        segments: ["press", "post/id"],
      }),
    ).toBe("/leagues/league%20id/press/post%2Fid");
  });

  it("preserves search params in saved destinations", () => {
    expect(
      leagueDeepLinkPath({
        leagueId: "league-1",
        searchParams: {
          empty: undefined,
          tag: ["rivalry week", "injuries"],
        },
        segments: ["press"],
      }),
    ).toBe("/leagues/league-1/press?tag=rivalry+week&tag=injuries");
  });

  it("routes unauthenticated league links through onboarding with returnTo", () => {
    expect(
      leagueDeepLinkOnboardingHref({
        leagueId: "league-1",
        searchParams: { slip: "open-123" },
        segments: ["bet"],
      }),
    ).toBe(
      "/onboarding/espn?returnTo=%2Fleagues%2Fleague-1%2Fbet%3Fslip%3Dopen-123",
    );
  });
});
