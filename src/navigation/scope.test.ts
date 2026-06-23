import { describe, expect, it } from "vitest";
import {
  ARENA_NAVIGATION_SECTIONS,
  deriveActiveNavigationState,
  GLOBAL_NAVIGATION_SECTIONS,
  getArenaSectionHref,
  getLeagueNavigationSections,
  getLeagueSectionHref,
  getLeagueSwitchHref,
  getNewsSectionHref,
  getProviderBadgeLabel,
  LEAGUE_NAVIGATION_SECTIONS,
  NEWS_NAVIGATION_SECTIONS,
} from "./scope";

describe("navigation scope taxonomy", () => {
  it("defines the exact global sections without provider nav nodes", () => {
    expect(GLOBAL_NAVIGATION_SECTIONS.map((section) => section.label)).toEqual([
      "Your Leagues",
      "You",
    ]);
    expect(GLOBAL_NAVIGATION_SECTIONS.map((section) => section.href)).toEqual([
      "/",
      "/you",
    ]);

    expectNoProviderSections(GLOBAL_NAVIGATION_SECTIONS);
  });

  it("defines news as its own browsable environment", () => {
    expect(NEWS_NAVIGATION_SECTIONS.map((section) => section.label)).toEqual([
      "Front",
      "Headlines",
      "Players",
      "Rankings",
      "Start/Sit",
      "Injuries",
      "Waivers",
      "Analysis",
    ]);
    expect(NEWS_NAVIGATION_SECTIONS.map((section) => section.href)).toEqual([
      "/news",
      "/news/headlines",
      "/news/players",
      "/news/rankings",
      "/news/start-sit",
      "/news/injuries",
      "/news/waivers",
      "/news/analysis",
    ]);
    expect(getNewsSectionHref("front")).toBe("/news");
    expect(getNewsSectionHref("injuries")).toBe("/news/injuries");
    expect(getNewsSectionHref("waivers")).toBe("/news/waivers");
    expectNoProviderSections(NEWS_NAVIGATION_SECTIONS);
  });

  it("defines arena as its own browsable environment", () => {
    expect(ARENA_NAVIGATION_SECTIONS.map((section) => section.label)).toEqual([
      "Leaderboard",
      "League vs League",
      "Movers",
      "Matchups",
      "Seasons",
      "Rules",
    ]);
    expect(ARENA_NAVIGATION_SECTIONS.map((section) => section.href)).toEqual([
      "/arena",
      "/arena/leagues",
      "/arena/movers",
      "/arena/matchups",
      "/arena/seasons",
      "/arena/rules",
    ]);
    expect(getArenaSectionHref("leaderboard")).toBe("/arena");
    expect(getArenaSectionHref("movers")).toBe("/arena/movers");
    expectNoProviderSections(ARENA_NAVIGATION_SECTIONS);
  });

  it("defines the exact league sections without provider nav nodes", () => {
    expect(LEAGUE_NAVIGATION_SECTIONS.map((section) => section.label)).toEqual([
      "Home",
      "The Press",
      "Bet",
      "League Data",
      "Records",
      "Lore",
      "Members",
    ]);
    expect(
      getLeagueNavigationSections("league-1").map((section) => section.href),
    ).toEqual([
      "/leagues/league-1",
      "/leagues/league-1/press",
      "/leagues/league-1/bet",
      "/leagues/league-1/data",
      "/leagues/league-1/records",
      "/leagues/league-1/lore",
      "/leagues/league-1/members",
    ]);
    expect(
      LEAGUE_NAVIGATION_SECTIONS.map((section) => section.label),
    ).not.toContain("Edit Ledger");

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
    expect(deriveActiveNavigationState("/you")).toMatchObject({
      scope: "global",
      sectionId: "you",
    });
  });

  it("derives news scope and active news sections", () => {
    expect(deriveActiveNavigationState("/news")).toMatchObject({
      scope: "news",
      sectionId: "front",
    });
    expect(deriveActiveNavigationState("/news/injuries")).toMatchObject({
      scope: "news",
      sectionId: "injuries",
    });
    expect(deriveActiveNavigationState("/news/start-sit")).toMatchObject({
      scope: "news",
      sectionId: "start-sit",
    });
    expect(deriveActiveNavigationState("/news/waivers")).toMatchObject({
      scope: "news",
      sectionId: "waivers",
    });
    expect(deriveActiveNavigationState("/news/articles/story-1")).toMatchObject(
      {
        scope: "news",
        sectionId: "front",
      },
    );
  });

  it("derives arena scope and active arena sections", () => {
    expect(deriveActiveNavigationState("/arena")).toMatchObject({
      scope: "arena",
      sectionId: "leaderboard",
    });
    expect(deriveActiveNavigationState("/arena/movers")).toMatchObject({
      scope: "arena",
      sectionId: "movers",
    });
    expect(deriveActiveNavigationState("/arena/rules")).toMatchObject({
      scope: "arena",
      sectionId: "rules",
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
    expect(deriveActiveNavigationState("/leagues/abc/cast")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "press",
    });
    expect(deriveActiveNavigationState("/leagues/abc/bet")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "bet",
    });
    expect(deriveActiveNavigationState("/leagues/abc/data")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "data",
    });
    expect(deriveActiveNavigationState("/leagues/abc/ledger")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "ledger",
    });
    expect(deriveActiveNavigationState("/leagues/abc/records")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "records",
    });
    expect(deriveActiveNavigationState("/leagues/abc/lore")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "lore",
    });
    expect(deriveActiveNavigationState("/leagues/abc/lore/new")).toMatchObject({
      leagueId: "abc",
      scope: "league",
      sectionId: "lore",
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
      scope: "news",
      sectionId: "front",
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
    expect(getLeagueSectionHref("league 1", "data")).toBe(
      "/leagues/league%201/data",
    );
    expect(getLeagueSectionHref("league 1", "ledger")).toBe(
      "/leagues/league%201/ledger",
    );
    expect(getLeagueSectionHref("league 1", "lore")).toBe(
      "/leagues/league%201/lore",
    );
  });

  it("preserves the active league section when switching leagues", () => {
    const active = deriveActiveNavigationState("/leagues/current/records");

    expect(getLeagueSwitchHref("next", active)).toBe("/leagues/next/records");
    expect(
      getLeagueSwitchHref(
        "next",
        deriveActiveNavigationState("/leagues/current/data"),
      ),
    ).toBe("/leagues/next/data");
    expect(
      getLeagueSwitchHref(
        "next",
        deriveActiveNavigationState("/leagues/current/ledger"),
      ),
    ).toBe("/leagues/next/ledger");
    expect(
      getLeagueSwitchHref(
        "next",
        deriveActiveNavigationState("/leagues/current/lore/new"),
      ),
    ).toBe("/leagues/next/lore");
    expect(
      getLeagueSwitchHref(
        "next",
        deriveActiveNavigationState("/leagues/current/cast"),
      ),
    ).toBe("/leagues/next/press");
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
