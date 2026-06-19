import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leagueRealtimeChannel, REALTIME_EVENTS } from "@/realtime/interfaces";
import { MOTION_STORAGE_KEY } from "@/theme/settings";
import type { LeagueSwitcherViewItem } from "./league-switcher-model";
import type * as NavigationShellModule from "./navigation-shell";
import type * as ScopeModule from "./scope";

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

let NavigationShellView!: typeof NavigationShellModule.NavigationShellView;
let shouldShowNavigationShell!: typeof NavigationShellModule.shouldShowNavigationShell;
let deriveActiveNavigationState!: typeof ScopeModule.deriveActiveNavigationState;

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

beforeEach(async () => {
  assertJsdomHarness();
  vi.resetModules();
  const shellModule = await import("./navigation-shell");
  const scopeModule = await import("./scope");
  NavigationShellView = shellModule.NavigationShellView;
  shouldShowNavigationShell = shellModule.shouldShowNavigationShell;
  deriveActiveNavigationState = scopeModule.deriveActiveNavigationState;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-motion");
  window.localStorage.removeItem(MOTION_STORAGE_KEY);
  window.localStorage.removeItem("rumbledore:wire-mode");
  realtimeMock.state.lastRefresh = null;
  realtimeMock.openRealtimePresenceSubscription.mockClear();
  realtimeMock.openRealtimeRefreshSubscription.mockClear();
});

function assertJsdomHarness() {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof window.localStorage === "undefined"
  ) {
    throw new Error(
      "navigation-shell.test.tsx requires Vitest's jsdom environment before importing the shell module.",
    );
  }
}

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
  it("renders news environment tabs and the News scope name without provider nav nodes", () => {
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
    expect(within(topBarButton).getByText("Rumbledore News")).toBeDefined();

    const tabs = screen.getByLabelText("Current scope sections");
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Front",
      "Headlines",
      "Players",
      "Rankings",
      "Start/Sit",
      "Injuries",
      "Waivers",
      "Analysis",
    ]);
    expect(
      within(tabs).getByRole("link", { name: "Front" }).getAttribute("href"),
    ).toBe("/news");
    expect(
      within(tabs)
        .getByRole("link", { name: "Front" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(within(tabs).queryByText("ESPN")).toBeNull();
    expect(within(tabs).queryByText("Sleeper")).toBeNull();
    expect(screen.getAllByRole("region", { name: "News wire" })).toHaveLength(
      2,
    );
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeDefined();
  });

  it("renders global tabs as the lobby environment", () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/")}
        items={items}
      >
        <main>Lobby</main>
      </NavigationShellView>,
    );

    const tabs = screen.getByLabelText("Current scope sections");
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Your Leagues", "You"]);
    expect(
      within(tabs)
        .getByRole("link", { name: "Your Leagues" })
        .getAttribute("aria-current"),
    ).toBe("page");
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

    const dialog = screen.getByRole("dialog", {
      name: /Switch environments/i,
    });
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
    expect(
      within(dialog).getByRole("link", {
        name: /Rumbledore News, News environment/i,
      }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("link", {
        name: /Central Arena, Arena environment/i,
      }),
    ).toBeDefined();

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Switch environments/i }),
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

  it("anchors desktop and mobile notification badges outside the icon buttons", () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a")}
        items={items}
      >
        <main>League home</main>
      </NavigationShellView>,
    );

    const badges = screen.getAllByLabelText("1 unread notifications");

    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge.closest("button")).toBeNull();
      expect(badge.parentElement?.classList.contains("relative")).toBe(true);
      expect(badge.parentElement?.classList.contains("shrink-0")).toBe(true);
      expect(badge.classList.contains("pointer-events-none")).toBe(true);
      expect(badge.classList.contains("absolute")).toBe(true);
      expect(badge.classList.contains("-top-1")).toBe(true);
      expect(badge.classList.contains("-right-1")).toBe(true);
    }
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

  it("toggles the wire between general and personal news and persists the preference", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/navigation/league-switcher")) {
        return new Response(JSON.stringify({ items }), { status: 200 });
      }
      if (url.startsWith("/news/wire")) {
        const mode = new URL(url, "https://rumbledore.test").searchParams.get(
          "mode",
        );
        return new Response(
          JSON.stringify({
            items: [
              {
                href:
                  mode === "personal"
                    ? "/news/articles/personal-1"
                    : "/news/articles/general-1",
                id: mode === "personal" ? "personal-1" : "general-1",
                matchedLabels:
                  mode === "personal" ? ["Fixture Starter"] : undefined,
                mode,
                publishedAt: "2026-06-16T12:00:00.000Z",
                section: mode === "personal" ? "Injuries" : "Headlines",
                source: "Wire Desk",
                title:
                  mode === "personal"
                    ? "Fixture Starter injury watch"
                    : "General NFL headline",
              },
            ],
            mode,
            status: "ready",
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/news")}
        items={items}
      >
        <main>Central news</main>
      </NavigationShellView>,
    );

    await waitFor(() => {
      expect(
        screen.getAllByText("General NFL headline").length,
      ).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Personal" }));

    await waitFor(() => {
      expect(
        screen.getAllByText("Fixture Starter injury watch").length,
      ).toBeGreaterThan(0);
    });
    expect(window.localStorage.getItem("rumbledore:wire-mode")).toBe(
      "personal",
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/news/wire?limit=8&mode=personal"),
      ),
    ).toBe(true);
  });

  it("keeps the wire feed toggle reachable in the tablet ticker", () => {
    const { container } = render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/news")}
        items={items}
      >
        <main>Central news</main>
      </NavigationShellView>,
    );

    const wireModeToggle = container.querySelector(
      '[data-slot="wire-mode-toggle"]',
    );
    expect(wireModeToggle?.className).toContain("md:flex");
    expect(wireModeToggle?.className).not.toContain("lg:flex");
    expect(
      within(wireModeToggle as HTMLElement).getByRole("button", {
        name: "General",
      }),
    ).toBeDefined();
    expect(
      within(wireModeToggle as HTMLElement).getByRole("button", {
        name: "Personal",
      }),
    ).toBeDefined();
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

  it("server-renders the live clock with a deterministic hydration placeholder", () => {
    const html = renderToString(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/arena")}
        items={items}
      >
        <main>Arena</main>
      </NavigationShellView>,
    );

    expect(html).toContain('data-slot="live-clock"');
    expect(html).toContain("Local time loading");
    expect(html).toContain("--:--:--");
  });

  it("starts the live clock on the client after mount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 16, 12, 34, 56));

    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/arena")}
        items={items}
      >
        <main>Arena</main>
      </NavigationShellView>,
    );

    expect(screen.getByLabelText("Local time 12:34:56")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByLabelText("Local time 12:34:57")).toBeDefined();
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
