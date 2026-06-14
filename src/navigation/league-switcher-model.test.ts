import { describe, expect, it } from "vitest";
import {
  filterLeagueSwitcherItems,
  getLeagueAvatarFallback,
  groupLeagueSwitcherItems,
  LEAGUE_SWITCHER_CONNECT_LINKS,
  type LeagueSwitcherViewItem,
  sortLeagueSwitcherItems,
} from "./league-switcher-model";

const items = [
  item({
    leagueId: "league-b",
    lastOpenedAt: null,
    name: "Zephyr League",
    provider: "sleeper",
    providerLabel: "Sleeper",
  }),
  item({
    leagueId: "league-a",
    lastOpenedAt: "2026-06-14T09:00:00.000Z",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLabel: "ESPN",
  }),
  item({
    leagueId: "league-c",
    lastOpenedAt: "2026-06-14T10:00:00.000Z",
    name: "Alpha Bowl",
    provider: "yahoo",
    providerLabel: "Yahoo",
  }),
  item({
    leagueId: "league-d",
    lastOpenedAt: null,
    name: "Alpha After Dark",
    provider: "espn",
    providerLabel: "ESPN",
  }),
] satisfies readonly LeagueSwitcherViewItem[];

describe("league switcher model", () => {
  it("sorts MRU first with alphabetical fallback for never-opened leagues", () => {
    expect(sortLeagueSwitcherItems(items).map((league) => league.name)).toEqual(
      ["Alpha Bowl", "NHS Alumni Annual", "Alpha After Dark", "Zephyr League"],
    );
  });

  it("filters by league name and provider label case-insensitively", () => {
    expect(
      filterLeagueSwitcherItems(items, "alumni").map(
        (league) => league.leagueId,
      ),
    ).toEqual(["league-a"]);
    expect(
      filterLeagueSwitcherItems(items, "YAH").map((league) => league.leagueId),
    ).toEqual(["league-c"]);
  });

  it("groups by provider only when requested by the caller", () => {
    const sorted = sortLeagueSwitcherItems(items);
    const groups = groupLeagueSwitcherItems(sorted);

    expect(groups.map((group) => group.providerLabel)).toEqual([
      "ESPN",
      "Sleeper",
      "Yahoo",
    ]);
    expect(groups[0]?.items.map((league) => league.name)).toEqual([
      "NHS Alumni Annual",
      "Alpha After Dark",
    ]);
  });

  it("builds stable avatar monograms from league names", () => {
    expect(getLeagueAvatarFallback("NHS Alumni Annual")).toBe("NA");
    expect(getLeagueAvatarFallback("95050")).toBe("95");
    expect(getLeagueAvatarFallback("  !!! ")).toBe("RL");
  });

  it("surfaces providers only as connect choices", () => {
    expect(LEAGUE_SWITCHER_CONNECT_LINKS).toEqual([
      { href: "/onboarding/espn", label: "ESPN", provider: "espn" },
      { href: "/onboarding/sleeper", label: "Sleeper", provider: "sleeper" },
      { href: "/onboarding/yahoo", label: "Yahoo", provider: "yahoo" },
    ]);
  });
});

function item(
  overrides: Partial<LeagueSwitcherViewItem>,
): LeagueSwitcherViewItem {
  return {
    lastOpenedAt: null,
    leagueId: "league",
    logo: null,
    name: "League",
    provider: "espn",
    providerLabel: "ESPN",
    role: "member",
    ...overrides,
  };
}
