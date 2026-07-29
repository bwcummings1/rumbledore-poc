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
          expiresAt: "2026-06-12T00:05:00.000Z" as string | null,
          retry: false,
          unsubscribe: vi.fn(),
        };
      },
    ),
    openRealtimeRefreshSubscription: vi.fn(
      async (options: { onRefresh: (event: unknown) => void }) => {
        state.lastRefresh = options.onRefresh;
        return {
          expiresAt: "2026-06-12T00:05:00.000Z" as string | null,
          retry: false,
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

const routerMock = vi.hoisted(() => ({
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

const pathnameMock = vi.hoisted(() => ({ current: "/leagues/league-a" }));

/**
 * The palette, both sheets, and both menu panels are `next/dynamic` surfaces:
 * clicking their trigger starts a real module import, so they land a tick or
 * more after the event rather than in the same commit. Testing Library's
 * default 1s window is tight for that when the suite is running at full worker
 * concurrency, which showed up as a rare flake in the scope-switcher test. This
 * is headroom for an import, not a slack budget for a broken assertion — the
 * suite's own `testTimeout` is 30s, so a genuinely missing surface still fails
 * the test, just later.
 */
const DYNAMIC_SURFACE = { timeout: 10_000 } as const;

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.current,
  useRouter: () => routerMock,
}));

let NavigationShell!: typeof NavigationShellModule.NavigationShell;
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
  pathnameMock.current = "/leagues/league-a";
  const shellModule = await import("./navigation-shell");
  const scopeModule = await import("./scope");
  NavigationShell = shellModule.NavigationShell;
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
  routerMock.push.mockClear();
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
      "The Wire",
      "The Rundown",
      "Weekend Recap + MNF Projection",
      "MNF Recap",
      "Pre-waiver",
      "Post-waiver",
      "Matchups",
      "Rankings & Projections",
      "Start/Sit",
      "Injuries",
    ]);
    expect(
      within(screen.getByRole("navigation", { name: "News sections" }))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Front", "The Wire", "The Rundown"]);
    expect(
      within(screen.getByRole("navigation", { name: "Fantasy sections" }))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Weekend Recap + MNF Projection",
      "MNF Recap",
      "Pre-waiver",
      "Post-waiver",
      "Matchups",
      "Rankings & Projections",
      "Start/Sit",
      "Injuries",
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
    ).toEqual([
      "Home",
      "The Press",
      "Bet",
      "League Data",
      "Records",
      "Lore",
      "Members",
    ]);
    expect(
      within(tabs)
        .getByRole("link", { name: "League Data" })
        .getAttribute("href"),
    ).toBe("/leagues/league-a/data");
    expect(
      within(tabs).queryByRole("link", { name: "Edit Ledger" }),
    ).toBeNull();
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

  it("marks League Data active on the Edit Ledger route without rendering a separate ledger item", () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a/ledger")}
        items={items}
      >
        <main>Edit Ledger</main>
      </NavigationShellView>,
    );

    const tabs = screen.getByLabelText("Current scope sections");
    expect(
      within(tabs)
        .getByRole("link", { name: "League Data" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(tabs).queryByRole("link", { name: "Edit Ledger" }),
    ).toBeNull();
    expect(
      within(tabs).getByRole("link", { name: "Records" }).getAttribute("href"),
    ).toBe("/leagues/league-a/records");
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

    // The sheet is `next/dynamic`-loaded on the interaction, so it arrives a
    // microtask after the click rather than in the same commit.
    const dialog = await screen.findByRole(
      "dialog",
      { name: /Switch environments/i },
      DYNAMIC_SURFACE,
    );
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
    }, DYNAMIC_SURFACE);
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    }, DYNAMIC_SURFACE);
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

  it("surfaces notification chrome with unread state and mark-read action", async () => {
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

    // The panel is `next/dynamic`-loaded on the interaction; only its trigger
    // and unread badge are in the initial render.
    const dialog = await screen.findByRole(
      "dialog",
      { name: "Notifications" },
      DYNAMIC_SURFACE,
    );
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
    const dialog = await screen.findByRole(
      "dialog",
      { name: "Notifications" },
      DYNAMIC_SURFACE,
    );
    expect(
      within(dialog)
        .getByRole("link", { name: /Settle it: lore vote opened/i })
        .getAttribute("href"),
    ).toBe("/leagues/league-a/lore/claim-1");
  });

  it("reconnects the shell after a transient unauthorized realtime grant", async () => {
    vi.useFakeTimers();
    realtimeMock.openRealtimeRefreshSubscription
      .mockImplementationOnce(async () => ({
        expiresAt: null,
        retry: true,
        unsubscribe: vi.fn(),
      }))
      .mockImplementationOnce(async (options) => {
        realtimeMock.state.lastRefresh = options.onRefresh;
        return {
          expiresAt: "2026-06-12T00:05:00.000Z",
          retry: false,
          unsubscribe: vi.fn(),
        };
      });

    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a/lore")}
        items={items}
      >
        <main>League lore</main>
      </NavigationShellView>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(realtimeMock.openRealtimeRefreshSubscription).toHaveBeenCalledTimes(
      1,
    );
    expect(
      screen
        .getAllByRole("region", { name: "League wire" })[0]
        ?.getAttribute("data-state"),
    ).toBe("reconnecting");

    // Before the fix a `retry` handle scheduled nothing, so this second attempt never came
    // and the pill stayed "offline" for the rest of the tab's life.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(realtimeMock.openRealtimeRefreshSubscription).toHaveBeenCalledTimes(
      2,
    );

    act(() => {
      realtimeMock.state.lastRefresh?.({
        event: REALTIME_EVENTS.loreVoteOpened,
        payload: {
          at: "2026-06-16T12:00:00.000Z",
          claimId: "claim-9",
          leagueId: "league-a",
          type: REALTIME_EVENTS.loreVoteOpened,
          v: 1,
          voteClosesAt: "2026-06-17T12:00:00.000Z",
        },
        topic: leagueRealtimeChannel("league-a", "lore"),
      });
    });

    expect(
      screen
        .getAllByRole("region", { name: "League wire" })[0]
        ?.getAttribute("data-state"),
    ).toBe("live");
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

    const { container } = render(
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

    const desktopTopBar = container.querySelector(
      '[data-slot="desktop-top-bar"]',
    );
    fireEvent.click(
      within(desktopTopBar as HTMLElement).getByRole("button", {
        name: "Your players",
      }),
    );

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

  it("keeps the wire feed toggle reachable in the top bar", () => {
    const { container } = render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/news")}
        items={items}
      >
        <main>Central news</main>
      </NavigationShellView>,
    );

    const desktopTopBar = container.querySelector(
      '[data-slot="desktop-top-bar"]',
    );
    const shellWire = container.querySelector('[data-slot="shell-wire"]');
    const wireModeToggle = (desktopTopBar as HTMLElement).querySelector(
      '[data-slot="wire-mode-toggle"]',
    );
    const searchButton = within(desktopTopBar as HTMLElement).getByRole(
      "button",
      { name: "Open command palette" },
    );

    expect(searchButton.nextElementSibling).toBe(wireModeToggle);
    expect(
      (shellWire as HTMLElement).querySelector(
        '[data-slot="wire-mode-toggle"]',
      ),
    ).toBeNull();
    const globalNews = within(wireModeToggle as HTMLElement).getByRole(
      "button",
      {
        name: "Global news",
      },
    );
    const yourPlayers = within(wireModeToggle as HTMLElement).getByRole(
      "button",
      {
        name: "Your players",
      },
    );
    expect(globalNews.textContent).toBe("G");
    expect(yourPlayers.textContent).toBe("P");
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

  it("navigates command palette selections through the client router", async () => {
    // `window.location.assign` is non-configurable in jsdom, so the whole
    // `location` object is stubbed to observe it.
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a")}
        items={items}
      >
        <main>League home</main>
      </NavigationShellView>,
    );

    const [searchButton] = screen.getAllByRole("button", {
      name: "Open command palette",
    });
    if (!searchButton) {
      throw new Error("expected a command palette trigger in the shell");
    }
    fireEvent.click(searchButton);

    const option = await screen.findByRole(
      "option",
      { name: /Rumbledore News/i },
      DYNAMIC_SURFACE,
    );
    fireEvent.click(option);

    expect(routerMock.push).toHaveBeenCalledWith("/news");
    // A full document load would discard the realtime subscriptions and the
    // RSC cache and re-download the bundle, which is the whole point of the
    // palette staying on the client router.
    expect(assign).not.toHaveBeenCalled();
  });

  it("opens the command palette from Cmd/Ctrl+K", async () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a")}
        items={items}
      >
        <main>League home</main>
      </NavigationShellView>,
    );

    // The palette is only rendered while open now, so it can no longer own the
    // shortcut that opens it — the shell does. Without that the hotkey would
    // silently do nothing.
    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).toBeNull();

    fireEvent.keyDown(window, { ctrlKey: true, key: "k" });

    expect(
      await screen.findByRole(
        "dialog",
        { name: "Command palette" },
        DYNAMIC_SURFACE,
      ),
    ).toBeDefined();
  });

  it("opens the account panel on demand with the connected providers", async () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a")}
        items={items}
      >
        <main>League home</main>
      </NavigationShellView>,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open account menu" })[0],
    );

    const dialog = await screen.findByRole(
      "dialog",
      { name: "Account" },
      DYNAMIC_SURFACE,
    );
    // "ESPN" appears twice: as the active scope's provider label and as a
    // connected-provider tag.
    expect(within(dialog).getAllByText("ESPN").length).toBe(2);
    expect(within(dialog).getByText("Sleeper")).toBeDefined();
    // Rendered by the shell and handed in as a node, so it must survive the
    // move into the deferred chunk.
    expect(within(dialog).getByRole("switch", { name: "Reduced motion" }));
    expect(
      within(dialog).getAllByText("NHS Alumni Annual").length,
    ).toBeGreaterThan(0);
  });

  it("opens the expanded wire sheet from the mobile wire strip", async () => {
    render(
      <NavigationShellView
        activeState={deriveActiveNavigationState("/leagues/league-a")}
        items={items}
      >
        <main>League home</main>
      </NavigationShellView>,
    );

    const trigger = screen.getByRole("button", { name: "Open The Wire" });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole(
      "dialog",
      { name: "The Wire" },
      DYNAMIC_SURFACE,
    );
    expect(dialog.getAttribute("data-slot")).toBe("sheet");
    // The ticker is passed as children from the shell rather than imported by
    // the lazy module, so the sheet must still receive it — in its expanded
    // list form, not the marquee strip.
    const ticker = dialog.querySelector('[data-slot="wire-ticker"]');
    expect(ticker).not.toBeNull();
    expect(ticker?.getAttribute("aria-label")).toBe("The Wire");
    expect(ticker?.querySelector('[data-slot="wire-marquee"]')).toBeNull();

    // The sheet is mounted lazily but then stays mounted and closed, exactly as
    // it behaved when statically imported, so Escape must still dismiss it
    // rather than leave a dialog stranded in the tree.
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "The Wire" })).toBeNull();
    }, DYNAMIC_SURFACE);
    // Re-opening must not need a second chunk fetch or a remount.
    fireEvent.click(trigger);
    expect(
      await screen.findByRole("dialog", { name: "The Wire" }, DYNAMIC_SURFACE),
    ).toBeDefined();
  });
});

describe("NavigationShell", () => {
  it("fetches the league switcher once per session instead of once per route", async () => {
    const fetchMock = stubShellFetch();

    const { rerender } = render(
      <NavigationShell>
        <main>League home</main>
      </NavigationShell>,
    );

    await waitFor(() => {
      expect(switcherFetchCount(fetchMock)).toBe(1);
    });

    for (const pathname of [
      "/leagues/league-a/records",
      "/news",
      "/arena",
      "/leagues/league-b/lore",
    ]) {
      pathnameMock.current = pathname;
      rerender(
        <NavigationShell>
          <main>League home</main>
        </NavigationShell>,
      );
      await waitFor(() => {
        expect(
          screen.getAllByRole("button", { name: "Open command palette" })
            .length,
        ).toBeGreaterThan(0);
      });
    }

    // The endpoint answers from the session alone, so four in-app navigations
    // must not cost four authenticated round trips.
    expect(switcherFetchCount(fetchMock)).toBe(1);
  });

  it("refetches the league switcher when the shell re-enters after an auth-boundary route", async () => {
    const fetchMock = stubShellFetch();

    const { rerender } = render(
      <NavigationShell>
        <main>League home</main>
      </NavigationShell>,
    );

    await waitFor(() => {
      expect(switcherFetchCount(fetchMock)).toBe(1);
    });

    // `/onboarding` hides the shell; coming back is the one route transition
    // that can carry a changed session.
    pathnameMock.current = "/onboarding/espn";
    rerender(
      <NavigationShell>
        <main>Onboarding</main>
      </NavigationShell>,
    );

    pathnameMock.current = "/leagues/league-b";
    rerender(
      <NavigationShell>
        <main>League home</main>
      </NavigationShell>,
    );

    await waitFor(() => {
      expect(switcherFetchCount(fetchMock)).toBe(2);
    });
  });
});

function stubShellFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/navigation/league-switcher")) {
      return new Response(JSON.stringify({ items }), { status: 200 });
    }
    if (url.startsWith("/news/wire")) {
      return new Response(
        JSON.stringify({ items: [], mode: "general", status: "ready" }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function switcherFetchCount(fetchMock: ReturnType<typeof stubShellFetch>) {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).startsWith("/api/navigation/league-switcher"),
  ).length;
}

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
