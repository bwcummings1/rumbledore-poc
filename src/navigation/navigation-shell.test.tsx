import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LeagueSwitcherViewItem } from "./league-switcher-model";
import {
  NavigationShellView,
  shouldShowNavigationShell,
} from "./navigation-shell";
import { deriveActiveNavigationState } from "./scope";

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
] satisfies readonly LeagueSwitcherViewItem[];

afterEach(() => {
  cleanup();
});

describe("shouldShowNavigationShell", () => {
  it("keeps app sections inside the shell and utility paths outside it", () => {
    expect(shouldShowNavigationShell("/")).toBe(true);
    expect(shouldShowNavigationShell("/news")).toBe(true);
    expect(shouldShowNavigationShell("/leagues/league-a/feed")).toBe(true);
    expect(shouldShowNavigationShell("/onboarding/espn")).toBe(false);
    expect(shouldShowNavigationShell("/invite/league/token")).toBe(false);
    expect(shouldShowNavigationShell("/offline")).toBe(false);
  });
});

describe("NavigationShellView", () => {
  it("renders global mobile tabs and the Global scope name without provider nav nodes", () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/news")}
        items={items}
      >
        <main>Central news</main>
      </NavigationShellView>,
    );

    const topBarButton = screen.getByRole("button", {
      name: "Open scope switcher",
    });
    expect(within(topBarButton).getByText("Your Leagues")).toBeDefined();

    const tabs = screen.getByLabelText("Current scope sections");
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Your Leagues", "News", "Arena", "You"]);
    expect(
      within(tabs).getByRole("link", { name: "News" }).getAttribute("href"),
    ).toBe("/news");
    expect(
      within(tabs)
        .getByRole("link", { name: "News" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(within(tabs).queryByText("ESPN")).toBeNull();
    expect(within(tabs).queryByText("Sleeper")).toBeNull();
  });

  it("renders league tabs from the active league and maps legacy paths to active sections", () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a/feed")}
        items={items}
      >
        <main>League press</main>
      </NavigationShellView>,
    );

    const topBarButton = screen.getByRole("button", {
      name: "Open scope switcher",
    });
    expect(within(topBarButton).getByText("NHS Alumni Annual")).toBeDefined();
    expect(within(topBarButton).getByText("ESPN")).toBeDefined();

    const tabs = screen.getByLabelText("Current scope sections");
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Home", "The Press", "Bet", "Records", "Members"]);
    expect(
      within(tabs)
        .getByRole("link", { name: "The Press" })
        .getAttribute("href"),
    ).toBe("/leagues/league-a/press");
    expect(
      within(tabs)
        .getByRole("link", { name: "The Press" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("opens the mobile scope switcher sheet with the unified league list", () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a")}
        items={items}
      >
        <main>League home</main>
      </NavigationShellView>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open scope switcher" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Scope switcher" });
    expect(
      within(dialog).getByRole("link", { name: /NHS Alumni Annual/i }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("link", { name: /Zephyr League/i }),
    ).toBeDefined();
    expect(within(dialog).getByLabelText("Search leagues")).toBeDefined();
    expect(
      within(dialog).getByRole("link", { name: "Your Leagues" }),
    ).toBeDefined();
  });

  it("keeps the desktop sidebar collapsible while preserving destinations", () => {
    const { container } = render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a/records")}
        items={items}
      >
        <main>Records</main>
      </NavigationShellView>,
    );

    const sidebar = container.querySelector('[data-slot="desktop-sidebar"]');
    expect(sidebar?.getAttribute("data-collapsed")).toBe("false");
    expect(
      within(screen.getByLabelText("Global sections"))
        .getByRole("link", {
          name: "News",
        })
        .getAttribute("href"),
    ).toBe("/news?leagueId=league-a");
    expect(
      within(screen.getByLabelText("Global sections")).getByRole("link", {
        name: "Arena",
      }),
    ).toBeDefined();
    expect(
      within(screen.getByLabelText("League sections")).getByRole("link", {
        name: "Records",
      }),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse navigation" }),
    );

    expect(sidebar?.getAttribute("data-collapsed")).toBe("true");
    expect(
      within(screen.getByLabelText("League sections")).getByRole("link", {
        name: "Records",
      }),
    ).toBeDefined();
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
