import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
    const switcher = screen.getByLabelText("League switcher");
    const links = within(switcher).getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toBe("/");
    expect(links[0]?.textContent).toContain("Your Leagues");
    expect(links[0]?.textContent).toContain("Global scope");
    expect(links[1]?.getAttribute("href")).toBe("/news");
    expect(links[1]?.textContent).toContain("Rumbledore News");
    expect(links[2]?.getAttribute("href")).toBe("/arena");
    expect(links[2]?.textContent).toContain("Central Arena");

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

  it("keeps global and provider connect affordances in the switcher", () => {
    render(<LeagueSwitcherView activeState={activeState} items={items} />);

    expect(
      screen
        .getByRole("link", { name: /Your Leagues, Global scope/i })
        .getAttribute("href"),
    ).toBe("/");
    expect(
      screen
        .getByRole("link", { name: /Rumbledore News, News environment/i })
        .getAttribute("href"),
    ).toBe("/news");
    expect(
      screen
        .getByRole("link", { name: /Central Arena, Arena environment/i })
        .getAttribute("href"),
    ).toBe("/arena");
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

  it("keeps the zero-league state focused on global and connect actions", () => {
    render(
      <LeagueSwitcherView
        activeState={deriveActiveNavigationState("/")}
        items={[]}
      />,
    );

    expect(
      screen
        .getByRole("link", { name: /Your Leagues, Global scope/i })
        .getAttribute("href"),
    ).toBe("/");
    expect(
      screen.getByRole("link", {
        name: /Rumbledore News, News environment/i,
      }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", {
        name: /Central Arena, Arena environment/i,
      }),
    ).toBeDefined();
    expect(screen.queryByText("No leagues match that search.")).toBeNull();
    expect(screen.getByRole("link", { name: /^ESPN$/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /^Sleeper$/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /^Yahoo$/i })).toBeDefined();
  });

  it("supports keyboard row navigation and non-color-only presence labels", () => {
    render(
      <LeagueSwitcherView
        activeState={activeState}
        items={items}
        presenceByLeagueId={{ "league-b": 3 }}
      />,
    );

    const globalRow = screen.getByRole("link", {
      name: /Your Leagues, Global scope/i,
    });
    const newsRow = screen.getByRole("link", {
      name: /Rumbledore News, News environment/i,
    });
    const arenaRow = screen.getByRole("link", {
      name: /Central Arena, Arena environment/i,
    });
    const activeLeague = screen.getByRole("link", {
      name: /NHS Alumni Annual/i,
    });

    globalRow.focus();
    fireEvent.keyDown(globalRow, { key: "ArrowDown" });
    expect(document.activeElement).toBe(newsRow);

    fireEvent.keyDown(newsRow, { key: "ArrowDown" });
    expect(document.activeElement).toBe(arenaRow);

    fireEvent.keyDown(arenaRow, { key: "ArrowDown" });
    expect(document.activeElement).toBe(activeLeague);
    expect(screen.getByLabelText("3 members online")).toBeDefined();
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
