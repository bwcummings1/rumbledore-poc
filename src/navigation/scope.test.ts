import { describe, expect, it } from "vitest";
import {
  deriveActiveNavigationState,
  GLOBAL_NAVIGATION_SECTIONS,
  getLeagueNavigationSections,
  getLeagueSectionHref,
  getLeagueSwitchHref,
  getProviderBadgeLabel,
  LEAGUE_NAVIGATION_SECTIONS,
} from "./scope";

describe("navigation scope taxonomy", () => {
  it("defines the exact global sections without provider nav nodes", () => {
    expect(GLOBAL_NAVIGATION_SECTIONS.map((section) => section.label)).toEqual([
      "Your Leagues",
      "News",
      "Arena",
      "You",
    ]);
    expect(GLOBAL_NAVIGATION_SECTIONS.map((section) => section.href)).toEqual([
      "/",
      "/news",
      "/arena",
      "/you",
    ]);

    expectNoProviderSections(GLOBAL_NAVIGATION_SECTIONS);
  });

  it("defines the exact league sections without provider nav nodes", () => {
    expect(LEAGUE_NAVIGATION_SECTIONS.map((section) => section.label)).toEqual([
      "Home",
      "The Press",
      "Bet",
      "Records",
      "Members",
    ]);
    expect(
      getLeagueNavigationSections("league-1").map((section) => section.href),
    ).toEqual([
      "/leagues/league-1",
      "/leagues/league-1/press",
      "/leagues/league-1/bet",
      "/leagues/league-1/records",
      "/leagues/league-1/members",
    ]);

    expectNoProviderSections(LEAGUE_NAVIGATION_SECTIONS);
  });

  it("keeps providers as badge labels only", () => {
    expect(getProviderBadgeLabel("espn")).toBe("ESPN");
    expect(getProviderBadgeLabel("sleeper")).toBe("Sleeper");
    expect(getProviderBadgeLabel("yahoo")).toBe("Yahoo");
  });
});

describe("deriveActiveNavigationState", () => {
  it("derives global scope and section from root routes", () => {
    expect(deriveActiveNavigationState("/")).toEqual({
      leagueId: null,
      pathname: "/",
      scope: "global",
      sectionId: "your-leagues",
    });
    expect(deriveActiveNavigationState("/news")).toMatchObject({
      scope: "global",
      sectionId: "news",
    });
    expect(deriveActiveNavigationState("/news/injuries")).toMatchObject({
      scope: "global",
      sectionId: "news",
    });
    expect(deriveActiveNavigationState("/arena")).toMatchObject({
      scope: "global",
      sectionId: "arena",
    });
    expect(deriveActiveNavigationState("/you")).toMatchObject({
      scope: "global",
      sectionId: "you",
    });
  });

  it("treats non-league utility and onboarding paths as global scope", () => {
    expect(deriveActiveNavigationState("/onboarding/espn")).toMatchObject({
      leagueId: null,
      scope: "global",
      sectionId: null,
    });
    expect(deriveActiveNavigationState("/invite/league/token")).toMatchObject({
      leagueId: null,
      scope: "global",
      sectionId: null,
    });
    expect(deriveActiveNavigationState("/offline")).toMatchObject({
      leagueId: null,
      scope: "global",
      sectionId: null,
    });
  });

  it("derives league scope and active league from every league path", () => {
    expect(deriveActiveNavigationState("/leagues/abc")).toEqual({
      leagueId: "abc",
      pathname: "/leagues/abc",
      scope: "league",
      sectionId: "home",
    });
    expect(deriveActiveNavigationState("/leagues/abc/press")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "press",
    });
    expect(deriveActiveNavigationState("/leagues/abc/bet")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "bet",
    });
    expect(deriveActiveNavigationState("/leagues/abc/records")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "records",
    });
    expect(deriveActiveNavigationState("/leagues/abc/members")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "members",
    });
    expect(deriveActiveNavigationState("/leagues/abc/unknown")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: null,
    });
  });

  it("maps legacy league routes to their new active sections", () => {
    expect(deriveActiveNavigationState("/leagues/abc/feed")).toMatchObject({
      scope: "league",
      sectionId: "press",
    });
    expect(
      deriveActiveNavigationState("/leagues/abc/posts/post-1"),
    ).toMatchObject({
      scope: "league",
      sectionId: "press",
    });
    expect(deriveActiveNavigationState("/leagues/abc/invite")).toMatchObject({
      scope: "league",
      sectionId: "members",
    });
  });

  it("normalizes path input from URLs, search strings, and trailing slashes", () => {
    expect(
      deriveActiveNavigationState("https://app.test/leagues/abc/press?x=1#top"),
    ).toEqual({
      leagueId: "abc",
      pathname: "/leagues/abc/press",
      scope: "league",
      sectionId: "press",
    });
    expect(deriveActiveNavigationState("news/")).toMatchObject({
      pathname: "/news",
      scope: "global",
      sectionId: "news",
    });
    expect(deriveActiveNavigationState(null)).toEqual({
      leagueId: null,
      pathname: "/",
      scope: "global",
      sectionId: "your-leagues",
    });
  });
});

describe("league navigation hrefs", () => {
  it("builds section hrefs from a league id", () => {
    expect(getLeagueSectionHref("league 1", "home")).toBe(
      "/leagues/league%201",
    );
    expect(getLeagueSectionHref("league 1", "press")).toBe(
      "/leagues/league%201/press",
    );
  });

  it("preserves the active league section when switching leagues", () => {
    const active = deriveActiveNavigationState("/leagues/current/records");

    expect(getLeagueSwitchHref("next", active)).toBe("/leagues/next/records");
    expect(
      getLeagueSwitchHref(
        "next",
        deriveActiveNavigationState("/leagues/current/feed"),
      ),
    ).toBe("/leagues/next/press");
    expect(
      getLeagueSwitchHref("next", deriveActiveNavigationState("/news")),
    ).toBe("/leagues/next");
  });
});

function expectNoProviderSections(
  sections: ReadonlyArray<{ readonly label: string }>,
) {
  const labels = sections.map((section) => section.label.toLowerCase());
  expect(labels.some((label) => label.includes("espn"))).toBe(false);
  expect(labels.some((label) => label.includes("sleeper"))).toBe(false);
  expect(labels.some((label) => label.includes("yahoo"))).toBe(false);
}
