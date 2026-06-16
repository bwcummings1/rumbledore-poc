import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { leagueRealtimeChannel, REALTIME_EVENTS } from "@/realtime/interfaces";
import { MOTION_STORAGE_KEY } from "@/theme/settings";
import type { LeagueSwitcherViewItem } from "./league-switcher-model";

const realtimeMock = vi.hoisted(() => {
  const state = {
    lastRefresh: null as null | ((event: unknown) => void),
  };
  return {
    openRealtimePresenceSubscription: vi.fn(
      async (options: {
        leagueId: string;
        onPresence: (snapshot: {
          leagueId: string;
          onlineCount: number;
          status: "online";
        }) => void;
      }) => {
        options.onPresence({
          leagueId: options.leagueId,
          onlineCount: 3,
          status: "online",
        });
        return {
          expiresAt: "2026-06-12T00:05:00.000Z",
          unsubscribe: vi.fn(),
        };
      },
    ),
    openRealtimeRefreshSubscription: vi.fn(
      async (options: { onRefresh: (event: unknown) => void }) => {
        state.lastRefresh = options.onRefresh;
        return {
          expiresAt: "2026-06-12T00:05:00.000Z",
          unsubscribe: vi.fn(),
        };
      },
    ),
    state,
  };
});

vi.mock("@/realtime/client", () => {
  return {
    openRealtimePresenceSubscription:
      realtimeMock.openRealtimePresenceSubscription,
    openRealtimeRefreshSubscription:
      realtimeMock.openRealtimeRefreshSubscription,
  };
});

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
  realtimeMock.state.lastRefresh = null;
  realtimeMock.openRealtimePresenceSubscription.mockClear();
  realtimeMock.openRealtimeRefreshSubscription.mockClear();
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
    expect(screen.getAllByRole("region", { name: "Global wire" })).toHaveLength(
      2,
    );
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeDefined();
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
    ).toEqual(["Home", "The Press", "Bet", "Records", "Lore", "Members"]);
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
    expect(screen.getAllByRole("region", { name: "League wire" })).toHaveLength(
      2,
    );
  });

  it("opens the mobile scope switcher sheet with the unified league list", async () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a")}
        items={items}
      >
        <main>League home</main>
      </NavigationShellView>,
    );

    const trigger = screen.getByRole("button", { name: "Open scope switcher" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /Switch leagues/i });
    expect(dialog.getAttribute("data-slot")).toBe("sheet");
    expect(
      within(dialog).getByRole("button", { name: "Resize sheet" }),
    ).toBeDefined();
    const switcherLinks = within(dialog).getAllByRole("link");
    expect(switcherLinks[0]?.getAttribute("href")).toBe("/");
    expect(
      within(dialog).getByRole("link", { name: /NHS Alumni Annual/i }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("link", { name: /Zephyr League/i }),
    ).toBeDefined();
    expect(within(dialog).getByLabelText("Search leagues")).toBeDefined();
    expect(
      within(dialog).getByRole("link", {
        name: /Your Leagues, Global scope/i,
      }),
    ).toBeDefined();

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Switch leagues/i }),
      ).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
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
      within(screen.getByLabelText("Global sections"))
        .getByRole("link", {
          name: "Arena",
        })
        .getAttribute("href"),
    ).toBe("/arena?leagueId=league-a");
    expect(
      within(screen.getByLabelText("League sections")).getByRole("link", {
        name: "Records",
      }),
    ).toBeDefined();
    expect(
      within(screen.getByLabelText("League sections"))
        .getByRole("link", {
          name: "Lore",
        })
        .getAttribute("href"),
    ).toBe("/leagues/league-a/lore");

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

  it("surfaces notification chrome with unread state and mark-read action", () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a")}
        items={items}
      >
        <main>League home</main>
      </NavigationShellView>,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open notifications" })[0],
    );

    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(dialog).getByText("1 unread")).toBeDefined();
    expect(within(dialog).getByText("League wire online")).toBeDefined();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Mark all read" }),
    );
    expect(within(dialog).getByText("All read")).toBeDefined();
  });

  it("renders realtime-fed wire items and notifications", async () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a/lore")}
        items={items}
      >
        <main>League lore</main>
      </NavigationShellView>,
    );

    await waitFor(() => {
      expect(realtimeMock.openRealtimeRefreshSubscription).toHaveBeenCalled();
    });

    act(() => {
      realtimeMock.state.lastRefresh?.({
        event: REALTIME_EVENTS.loreVoteOpened,
        payload: {
          at: "2026-06-16T12:00:00.000Z",
          claimId: "claim-1",
          leagueId: "league-a",
          type: REALTIME_EVENTS.loreVoteOpened,
          v: 1,
          voteClosesAt: "2026-06-17T12:00:00.000Z",
        },
        topic: leagueRealtimeChannel("league-a", "lore"),
      });
    });

    expect(screen.getAllByText("Lore vote opened").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("link", { name: /Lore vote opened/i })[0]
        ?.getAttribute("href"),
    ).toBe("/leagues/league-a/lore/claim-1");

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open notifications" })[0],
    );
    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(
      within(dialog)
        .getByRole("link", { name: /Settle it: lore vote opened/i })
        .getAttribute("href"),
    ).toBe("/leagues/league-a/lore/claim-1");
  });

  it("persists the reduced-motion shell switch to the root data attribute", () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/arena")}
        items={items}
      >
        <main>Arena</main>
      </NavigationShellView>,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Reduced motion" }));

    expect(document.documentElement.getAttribute("data-motion")).toBe("off");
    expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("off");
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
