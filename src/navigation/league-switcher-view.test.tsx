import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LeagueSwitcherViewItem } from "./league-switcher-model";
import { LeagueSwitcherView } from "./league-switcher-view";
import { deriveActiveNavigationState } from "./scope";

const activeState = deriveActiveNavigationState("/leagues/league-a/records");

const items = [
  item({
    leagueId: "league-a",
    lastOpenedAt: "2026-06-14T10:00:00.000Z",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLabel: "ESPN",
  }),
  item({
    leagueId: "league-b",
    lastOpenedAt: "2026-06-14T09:00:00.000Z",
    name: "Zephyr League",
    provider: "sleeper",
    providerLabel: "Sleeper",
  }),
  item({
    leagueId: "league-c",
    lastOpenedAt: null,
    name: "Alpha Bowl",
    provider: "yahoo",
    providerLabel: "Yahoo",
  }),
] satisfies readonly LeagueSwitcherViewItem[];

afterEach(() => {
  cleanup();
});

describe("LeagueSwitcherView", () => {
  it("renders one flat MRU list with provider badges and section-preserving links", () => {
    render(<LeagueSwitcherView activeState={activeState} items={items} />);

    expect(screen.queryByRole("heading", { name: "ESPN" })).toBeNull();

    const activeLeague = screen.getByRole("link", {
      name: /NHS Alumni Annual/i,
    });
    expect(activeLeague.getAttribute("aria-current")).toBe("page");
    expect(activeLeague.getAttribute("href")).toBe("/leagues/league-a/records");
    expect(screen.getAllByText("ESPN").length).toBeGreaterThan(0);

    const sleeperLeague = screen.getByRole("link", {
      name: /Zephyr League/i,
    });
    expect(sleeperLeague.getAttribute("href")).toBe(
      "/leagues/league-b/records",
    );
    expect(screen.getAllByText("Sleeper").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yahoo").length).toBeGreaterThan(0);
  });

  it("filters by league name and provider label", () => {
    render(<LeagueSwitcherView activeState={activeState} items={items} />);

    fireEvent.change(screen.getByLabelText("Search leagues"), {
      target: { value: "sleeper" },
    });

    expect(
      screen.queryByRole("link", { name: /NHS Alumni Annual/i }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: /Zephyr League/i })).toBeDefined();
  });

  it("regroups by provider only after the group toggle is enabled", () => {
    render(<LeagueSwitcherView activeState={activeState} items={items} />);

    fireEvent.click(screen.getByRole("button", { name: /group/i }));

    expect(screen.getByRole("heading", { name: "ESPN" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Sleeper" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Yahoo" })).toBeDefined();
  });

  it("keeps global and provider connect affordances in the switcher footer", () => {
    render(<LeagueSwitcherView activeState={activeState} items={items} />);

    expect(
      screen.getByRole("link", { name: "Your Leagues" }).getAttribute("href"),
    ).toBe("/");
    expect(
      screen.getByRole("link", { name: /^ESPN$/i }).getAttribute("href"),
    ).toBe("/onboarding/espn");
    expect(
      screen.getByRole("link", { name: /^Sleeper$/i }).getAttribute("href"),
    ).toBe("/onboarding/sleeper");
    expect(
      screen.getByRole("link", { name: /^Yahoo$/i }).getAttribute("href"),
    ).toBe("/onboarding/yahoo");
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
