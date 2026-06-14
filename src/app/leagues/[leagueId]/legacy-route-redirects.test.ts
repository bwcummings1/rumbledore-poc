import { describe, expect, it } from "vitest";
import {
  legacyLeagueFeedRedirectHref,
  legacyLeagueInviteRedirectHref,
  legacyLeaguePostRedirectHref,
} from "./legacy-route-redirects";

describe("legacy league route redirects", () => {
  it("maps the old feed route into The Press", () => {
    expect(legacyLeagueFeedRedirectHref("league one")).toBe(
      "/leagues/league%20one/press",
    );
  });

  it("maps old post detail routes into Press articles", () => {
    expect(legacyLeaguePostRedirectHref("league one", "post/1")).toBe(
      "/leagues/league%20one/press/post%2F1",
    );
  });

  it("maps the old invite route into Members", () => {
    expect(legacyLeagueInviteRedirectHref("league one")).toBe(
      "/leagues/league%20one/members",
    );
  });
});
