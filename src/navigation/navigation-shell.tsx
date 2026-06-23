"use client";

import {
  Bell,
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Database,
  Home,
  Landmark,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Settings,
  Smartphone,
  Ticket,
  Trophy,
  User,
  Users,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AmbientAgentPanel } from "@/components/ambient-agent/ambient-agent-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/ui/command-palette";
import { Presence } from "@/components/ui/presence";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import type {
  RealtimeRefreshEvent,
  RealtimeRefreshHandle,
  RealtimeRefreshSubscription,
} from "@/realtime/client";
import {
  leagueRealtimeChannel,
  REALTIME_EVENTS,
  type RealtimeEventType,
} from "@/realtime/interfaces";
import { MOTION_OFF_VALUE, MOTION_STORAGE_KEY } from "@/theme/settings";
import {
  getLeagueAvatarFallback,
  LEAGUE_SWITCHER_CONNECT_LINKS,
  type LeagueSwitcherViewItem,
  sortLeagueSwitcherItems,
} from "./league-switcher-model";
import { LeagueSwitcherView } from "./league-switcher-view";
import {
  type ActiveNavigationState,
  ARENA_NAVIGATION_SECTIONS,
  GLOBAL_NAVIGATION_SECTIONS,
  type GlobalSectionId,
  getArenaSectionHref,
  getLeagueNavigationSections,
  getLeagueSectionHref,
  getLeagueSwitchHref,
  getNewsSectionHref,
  LEAGUE_NAVIGATION_SECTIONS,
  type NavigationIconName,
  NEWS_NAVIGATION_SECTIONS,
} from "./scope";
import { useActiveNavigationState } from "./use-active-navigation-state";

const DeferredInstallAffordance = dynamic(
  () =>
    import("@/components/pwa/install-affordance").then(
      (mod) => mod.InstallAffordance,
    ),
  { loading: () => null, ssr: false },
);

const DeferredSignOutButton = dynamic(
  () => import("@/app/you/sign-out-button").then((mod) => mod.SignOutButton),
  {
    loading: () => (
      <Button disabled size="sm" type="button" variant="outline">
        Sign out
      </Button>
    ),
    ssr: false,
  },
);

type NavigationShellItem =
  | (typeof GLOBAL_NAVIGATION_SECTIONS)[number]
  | ReturnType<typeof getLeagueNavigationSections>[number]
  | (typeof NEWS_NAVIGATION_SECTIONS)[number]
  | (typeof ARENA_NAVIGATION_SECTIONS)[number];

const NAVIGATION_SHELL_HIDDEN_SEGMENTS = new Set([
  "_next",
  "api",
  "favicon.ico",
  "invite",
  "offline",
  "onboarding",
]);

const NAVIGATION_ICON_COMPONENTS = {
  database: Database,
  "book-open": BookOpen,
  home: Home,
  landmark: Landmark,
  newspaper: Newspaper,
  "scroll-text": ScrollText,
  ticket: Ticket,
  trophy: Trophy,
  user: User,
  users: Users,
} satisfies Record<NavigationIconName, typeof Home>;

const EMPTY_NAVIGATION_ITEMS: readonly LeagueSwitcherViewItem[] = [];
const SHELL_REALTIME_MAX_ITEMS = 8;
const SHELL_REALTIME_RECONNECT_MS = 60_000;
const SHELL_REALTIME_TOKEN_REFRESH_SKEW_MS = 30_000;
const WIRE_MODE_STORAGE_KEY = "rumbledore:wire-mode";

type ShellNotificationKind = "arena" | "blog" | "lore" | "odds" | "scores";
type ShellMotionMode = "auto" | "off";
type ShellRealtimeStatus = "connecting" | "live" | "offline" | "reconnecting";
type ShellWireMode = "general" | "personal";
type ShellWireItemKind =
  | "bet"
  | "cast"
  | "lore"
  | "record"
  | "score"
  | "swing"
  | "system";
type ShellWireStatus = "empty" | "live" | "offline" | "reconnecting";

interface ShellWireItem {
  readonly fresh?: boolean;
  readonly href?: string;
  readonly id: string;
  readonly kind?: ShellWireItemKind;
  readonly label: ReactNode;
  readonly meta?: ReactNode;
}

interface BreadcrumbItem {
  readonly current?: boolean;
  readonly href?: string;
  readonly label: ReactNode;
}

interface ShellNotification {
  readonly detail: string;
  readonly href: string;
  readonly id: string;
  readonly kind: ShellNotificationKind;
  readonly read?: boolean;
  readonly timestamp: string;
  readonly title: string;
}

interface ShellRealtimeState {
  readonly notifications: readonly ShellNotification[];
  readonly presenceByLeagueId: Readonly<Record<string, number>>;
  readonly status: ShellRealtimeStatus;
  readonly wireItems: readonly ShellWireItem[];
}

interface NewsWireApiItem {
  readonly href: string;
  readonly id: string;
  readonly matchedLabels?: readonly string[];
  readonly publishedAt: string;
  readonly section: string;
  readonly source: string;
  readonly title: string;
}

interface NewsWireApiResponse {
  readonly items: readonly NewsWireApiItem[];
  readonly mode: ShellWireMode;
  readonly rosteredPlayerCount?: number;
  readonly status:
    | "empty"
    | "no_matches"
    | "no_rosters"
    | "ready"
    | "signed_out";
}

interface NewsWireFeedState {
  readonly data: NewsWireApiResponse | null;
  readonly status: "error" | "loading" | "ready";
}

export interface NavigationShellProps {
  readonly children: ReactNode;
  readonly initialItems?: readonly LeagueSwitcherViewItem[];
}

export interface NavigationShellViewProps extends NavigationShellProps {
  readonly activeState: ActiveNavigationState;
  readonly items: readonly LeagueSwitcherViewItem[];
}

export function NavigationShell({
  children,
  initialItems = EMPTY_NAVIGATION_ITEMS,
}: NavigationShellProps) {
  const activeState = useActiveNavigationState();
  const [items, setItems] =
    useState<readonly LeagueSwitcherViewItem[]>(initialItems);
  const pathname = activeState.pathname;
  const showShell = shouldShowNavigationShell(pathname);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (!showShell) {
      return;
    }

    const controller = new AbortController();

    async function loadItems() {
      try {
        const response = await fetch("/api/navigation/league-switcher", {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          items?: LeagueSwitcherViewItem[];
        };
        if (!controller.signal.aborted && Array.isArray(payload.items)) {
          setItems(payload.items);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(
            `Failed to load navigation leagues for ${pathname}`,
            error,
          );
        }
      }
    }

    void loadItems();

    return () => {
      controller.abort();
    };
  }, [pathname, showShell]);

  if (!showShell) {
    return <>{children}</>;
  }

  return (
    <NavigationShellView activeState={activeState} items={items}>
      {children}
    </NavigationShellView>
  );
}

export function NavigationShellView({
  activeState,
  children,
  items,
}: NavigationShellViewProps) {
  const [mobileSwitcherOpen, setMobileSwitcherOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [desktopSwitcherOpen, setDesktopSwitcherOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [wireSheetOpen, setWireSheetOpen] = useState(false);
  const [motionOff, setMotionOff] = useShellMotionPreference();
  const [wireMode, setWireMode] = useWireModePreference();
  const [readNotificationIds, setReadNotificationIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const sortedItems = useMemo(() => sortLeagueSwitcherItems(items), [items]);
  const shellRealtime = useShellRealtime(activeState);
  const newsWireFeed = useNewsWireFeed(wireMode);
  const activeLeague =
    activeState.scope === "league"
      ? (sortedItems.find((item) => item.leagueId === activeState.leagueId) ??
        null)
      : null;
  const currentNavItems: readonly NavigationShellItem[] =
    getNavigationItemsForActiveState(activeState);
  const commandItems = useMemo(
    () => buildCommandItems(activeState, sortedItems),
    [activeState, sortedItems],
  );
  const motionMode: ShellMotionMode = motionOff ? "off" : "auto";
  const fallbackWireItems = useMemo(
    () => buildWireItems(wireMode, newsWireFeed),
    [newsWireFeed, wireMode],
  );
  const wireItems = useMemo(
    () => mergeShellItems(shellRealtime.wireItems, fallbackWireItems),
    [fallbackWireItems, shellRealtime.wireItems],
  );
  const shellNotifications = useMemo(
    () =>
      mergeShellItems(
        shellRealtime.notifications,
        buildShellNotifications(activeState, activeLeague),
      ).map((notification) => ({
        ...notification,
        read:
          notification.read === true ||
          readNotificationIds.has(notification.id),
      })),
    [
      activeState,
      activeLeague,
      readNotificationIds,
      shellRealtime.notifications,
    ],
  );
  const unreadNotificationCount = shellNotifications.filter(
    (notification) => !notification.read,
  ).length;
  const pathname = activeState.pathname;
  const markAllNotificationsRead = useCallback(() => {
    setReadNotificationIds(
      new Set(shellNotifications.map((notification) => notification.id)),
    );
  }, [shellNotifications]);
  const closeMobileSwitcher = useCallback(() => {
    setMobileSwitcherOpen(false);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-slot="mobile-scope-trigger"]')
        ?.focus();
    });
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("rumbledore:sidebar");
      if (stored === "collapsed") {
        setSidebarCollapsed(true);
        return;
      }
      if (stored === "expanded") {
        setSidebarCollapsed(false);
        return;
      }
      setSidebarCollapsed(
        window.matchMedia?.("(min-width: 768px) and (max-width: 1023px)")
          .matches === true,
      );
    } catch {
      // Sidebar persistence is an enhancement; the shell remains usable.
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(
          "rumbledore:sidebar",
          next ? "collapsed" : "expanded",
        );
      } catch {
        // Persistence is best-effort.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (pathname.length === 0) {
      return;
    }

    setDesktopSwitcherOpen(false);
    setMobileSwitcherOpen(false);
  }, [pathname]);

  return (
    <div data-slot="navigation-shell" className="min-h-dvh">
      <a
        className="fixed top-2 left-2 z-[60] -translate-y-16 rounded-control bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-overlay transition-transform focus:translate-y-0 focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)] focus-visible:outline-none"
        href="#rumbledore-main-content"
      >
        Skip to content
      </a>
      <ShellBootOverlay motion={motionMode} />
      <DesktopSidebar
        activeLeague={activeLeague}
        activeState={activeState}
        collapsed={sidebarCollapsed}
        currentNavItems={currentNavItems}
        desktopSwitcherOpen={desktopSwitcherOpen}
        items={sortedItems}
        onToggleCollapsed={toggleSidebarCollapsed}
        onToggleSwitcher={() => setDesktopSwitcherOpen((value) => !value)}
        presenceByLeagueId={shellRealtime.presenceByLeagueId}
        realtimeStatus={shellRealtime.status}
      />

      <DesktopTopBar
        activeLeague={activeLeague}
        activeState={activeState}
        collapsed={sidebarCollapsed}
        items={sortedItems}
        motionOff={motionOff}
        notifications={shellNotifications}
        onMarkAllNotificationsRead={markAllNotificationsRead}
        onMotionChange={setMotionOff}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onWireModeChange={setWireMode}
        realtimeStatus={shellRealtime.status}
        unreadNotificationCount={unreadNotificationCount}
        wireMode={wireMode}
      />

      <MobileTopBar
        activeLeague={activeLeague}
        activeState={activeState}
        items={sortedItems}
        motionOff={motionOff}
        notifications={shellNotifications}
        onMarkAllNotificationsRead={markAllNotificationsRead}
        onMotionChange={setMotionOff}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenSwitcher={() => setMobileSwitcherOpen(true)}
        onWireModeChange={setWireMode}
        presenceByLeagueId={shellRealtime.presenceByLeagueId}
        realtimeStatus={shellRealtime.status}
        unreadNotificationCount={unreadNotificationCount}
        wireMode={wireMode}
      />

      <ShellWire
        activeState={activeState}
        collapsed={sidebarCollapsed}
        items={wireItems}
        motion={motionMode}
        onOpenWire={() => setWireSheetOpen(true)}
        realtimeStatus={shellRealtime.status}
      />

      <div
        id="rumbledore-main-content"
        className={cn(
          "min-h-dvh pt-[6.25rem] pb-[calc(4.5rem+env(safe-area-inset-bottom))] transition-[padding-left] duration-base ease-out md:pt-[6.25rem] md:pb-0",
          sidebarCollapsed ? "md:pl-[4.5rem]" : "md:pl-72",
        )}
      >
        {children}
      </div>

      <AmbientAgentPanel
        activeLeagueName={activeLeague?.name}
        activeState={activeState}
      />

      <MobileBottomTabs
        activeState={activeState}
        currentNavItems={currentNavItems}
      />

      {mobileSwitcherOpen ? (
        <MobileSwitcherSheet
          activeState={activeState}
          items={sortedItems}
          onClose={closeMobileSwitcher}
          presenceByLeagueId={shellRealtime.presenceByLeagueId}
        />
      ) : null}

      <WireSheet
        items={wireItems}
        motion={motionMode}
        onOpenChange={setWireSheetOpen}
        open={wireSheetOpen}
        realtimeStatus={shellRealtime.status}
      />

      <CommandPalette
        items={commandItems}
        onOpenChange={setCommandPaletteOpen}
        onSelect={(item) => {
          if (item.href) {
            window.location.assign(item.href);
          }
        }}
        open={commandPaletteOpen}
      />
    </div>
  );
}

export function shouldShowNavigationShell(pathname: string): boolean {
  const firstSegment = pathname
    .split(/[?#]/u, 1)[0]
    ?.split("/")
    .filter(Boolean)[0]
    ?.toLowerCase();

  return !(firstSegment && NAVIGATION_SHELL_HIDDEN_SEGMENTS.has(firstSegment));
}

function DesktopSidebar({
  activeLeague,
  activeState,
  collapsed,
  currentNavItems,
  desktopSwitcherOpen,
  items,
  onToggleCollapsed,
  onToggleSwitcher,
  presenceByLeagueId,
  realtimeStatus,
}: {
  readonly activeLeague: LeagueSwitcherViewItem | null;
  readonly activeState: ActiveNavigationState;
  readonly collapsed: boolean;
  readonly currentNavItems: readonly NavigationShellItem[];
  readonly desktopSwitcherOpen: boolean;
  readonly items: readonly LeagueSwitcherViewItem[];
  readonly onToggleCollapsed: () => void;
  readonly onToggleSwitcher: () => void;
  readonly presenceByLeagueId: Readonly<Record<string, number>>;
  readonly realtimeStatus: ShellRealtimeStatus;
}) {
  const sidebarWidth = collapsed ? "w-[4.5rem]" : "w-72";

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[var(--hair)] bg-[var(--panel)] shadow-overlay backdrop-blur-xl md:flex motion-reduce:backdrop-blur-none",
        sidebarWidth,
      )}
      data-collapsed={collapsed ? "true" : "false"}
      data-slot="desktop-sidebar"
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-[var(--hair)] px-3">
        <Link
          aria-label="Rumbledore home"
          href="/"
          className={cn(
            "flex min-h-11 min-w-11 items-center gap-2 rounded-control text-sidebar-foreground outline-none transition-colors hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]",
            collapsed ? "justify-center" : "truncate",
          )}
        >
          <span className="chip-glyph size-8 text-xs">R</span>
          <span
            className={cn(
              "truncate font-heading text-sm uppercase tracking-[0.15em] text-foreground [text-shadow:0_0_18px_var(--glow-lilac)]",
              collapsed && "sr-only",
            )}
          >
            Rumbledore
          </span>
        </Link>
        <Button
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={onToggleCollapsed}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        <NavigationSection
          activeState={activeState}
          collapsed={collapsed}
          items={currentNavItems}
          label={navigationGroupLabel(activeState.scope)}
        />

        <div className="relative border-y border-[var(--hair)] py-3">
          <Button
            aria-expanded={desktopSwitcherOpen}
            aria-label="Open league switcher"
            className={cn(
              "w-full justify-start",
              collapsed && "justify-center px-0",
            )}
            onClick={onToggleSwitcher}
            title={collapsed ? "League switcher" : undefined}
            type="button"
            variant="ghost"
          >
            <ScopeAvatar
              activeLeague={activeLeague}
              activeState={activeState}
            />
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">
                    {scopeDisplayName(activeState, activeLeague)}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5">
                    {activeLeague ? (
                      <Tag className="min-h-5 px-1.5 py-0 text-xs">
                        {activeLeague.providerLabel}
                      </Tag>
                    ) : (
                      <span className="block truncate text-xs text-muted-foreground">
                        League switcher
                      </span>
                    )}
                    {activeLeague ? (
                      <Presence
                        className="min-h-5"
                        label={presenceLabelForLeague(
                          activeLeague.leagueId,
                          presenceByLeagueId,
                          realtimeStatus,
                        )}
                        status={presenceStatusForLeague(
                          activeLeague.leagueId,
                          presenceByLeagueId,
                          realtimeStatus,
                        )}
                      />
                    ) : null}
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </>
            )}
          </Button>

          {desktopSwitcherOpen ? (
            <div
              className={cn(
                "fixed top-16 z-40 w-80",
                collapsed ? "left-20" : "left-[18.5rem]",
              )}
            >
              <LeagueSwitcherView
                activeState={activeState}
                items={items}
                presenceByLeagueId={presenceByLeagueId}
              />
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function DesktopTopBar({
  activeLeague,
  activeState,
  collapsed,
  items,
  motionOff,
  notifications,
  onMarkAllNotificationsRead,
  onMotionChange,
  onOpenCommandPalette,
  onWireModeChange,
  realtimeStatus,
  unreadNotificationCount,
  wireMode,
}: {
  readonly activeLeague: LeagueSwitcherViewItem | null;
  readonly activeState: ActiveNavigationState;
  readonly collapsed: boolean;
  readonly items: readonly LeagueSwitcherViewItem[];
  readonly motionOff: boolean;
  readonly notifications: readonly ShellNotification[];
  readonly onMarkAllNotificationsRead: () => void;
  readonly onMotionChange: (motionOff: boolean) => void;
  readonly onOpenCommandPalette: () => void;
  readonly onWireModeChange: (mode: ShellWireMode) => void;
  readonly realtimeStatus: ShellRealtimeStatus;
  readonly unreadNotificationCount: number;
  readonly wireMode: ShellWireMode;
}) {
  return (
    <header
      className={cn(
        "fixed top-0 right-0 z-20 hidden h-14 items-center gap-3 border-b border-[var(--hair)] bg-[var(--panel)] px-4 shadow-raised backdrop-blur-xl md:flex motion-reduce:backdrop-blur-none",
        collapsed ? "left-[4.5rem]" : "left-72",
      )}
      data-slot="desktop-top-bar"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,var(--lilac),transparent)] opacity-40"
      />
      <ShellBreadcrumbs
        className="flex-1"
        items={buildBreadcrumbItems(activeState, activeLeague)}
      />
      <Button
        aria-label="Open command palette"
        className="max-lg:size-11 max-lg:min-w-11 max-lg:px-0"
        onClick={onOpenCommandPalette}
        type="button"
        variant="steel"
      >
        <Search data-icon="inline-start" />
        <span className="max-lg:sr-only">Search</span>
        <kbd className="kbd ml-1 rounded-control border border-border px-2 py-0.5 text-xs max-lg:hidden">
          Ctrl K
        </kbd>
      </Button>
      <WireModeToggle mode={wireMode} onModeChange={onWireModeChange} />
      <NotificationsMenu
        notifications={notifications}
        onMarkAllRead={onMarkAllNotificationsRead}
        realtimeStatus={realtimeStatus}
        unreadCount={unreadNotificationCount}
      />
      <AccountMenu
        activeLeague={activeLeague}
        activeState={activeState}
        items={items}
        motionOff={motionOff}
        onMotionChange={onMotionChange}
      />
      <MotionToggle
        className="hidden lg:flex"
        motionOff={motionOff}
        onMotionChange={onMotionChange}
      />
      <LiveClock className="hidden lg:inline-flex" motionOff={motionOff} />
    </header>
  );
}

function MobileTopBar({
  activeLeague,
  activeState,
  items,
  motionOff,
  notifications,
  onMarkAllNotificationsRead,
  onMotionChange,
  onOpenCommandPalette,
  onOpenSwitcher,
  onWireModeChange,
  presenceByLeagueId,
  realtimeStatus,
  unreadNotificationCount,
  wireMode,
}: {
  readonly activeLeague: LeagueSwitcherViewItem | null;
  readonly activeState: ActiveNavigationState;
  readonly items: readonly LeagueSwitcherViewItem[];
  readonly motionOff: boolean;
  readonly notifications: readonly ShellNotification[];
  readonly onMarkAllNotificationsRead: () => void;
  readonly onMotionChange: (motionOff: boolean) => void;
  readonly onOpenCommandPalette: () => void;
  readonly onOpenSwitcher: () => void;
  readonly onWireModeChange: (mode: ShellWireMode) => void;
  readonly presenceByLeagueId: Readonly<Record<string, number>>;
  readonly realtimeStatus: ShellRealtimeStatus;
  readonly unreadNotificationCount: number;
  readonly wireMode: ShellWireMode;
}) {
  return (
    <header
      className="fixed inset-x-0 top-0 z-30 flex min-h-14 items-center border-b border-[var(--hair)] bg-[var(--panel-solid)]/95 px-3 pt-safe shadow-raised backdrop-blur md:hidden motion-reduce:backdrop-blur-none"
      data-slot="mobile-top-bar"
    >
      <Button
        aria-label="Open scope switcher"
        aria-haspopup="dialog"
        className="min-w-0 flex-1 justify-start"
        data-slot="mobile-scope-trigger"
        onClick={onOpenSwitcher}
        type="button"
        variant="ghost"
      >
        <ScopeAvatar activeLeague={activeLeague} activeState={activeState} />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold">
            {scopeDisplayName(activeState, activeLeague)}
          </span>
          {activeLeague ? (
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <span className="inline-flex rounded-sm border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                {activeLeague.providerLabel}
              </span>
              <Presence
                className="min-h-5"
                label={presenceLabelForLeague(
                  activeLeague.leagueId,
                  presenceByLeagueId,
                  realtimeStatus,
                )}
                status={presenceStatusForLeague(
                  activeLeague.leagueId,
                  presenceByLeagueId,
                  realtimeStatus,
                )}
              />
            </span>
          ) : null}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Button>
      <Button
        aria-label="Open command palette"
        onClick={onOpenCommandPalette}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Search aria-hidden="true" />
      </Button>
      <WireModeToggle mode={wireMode} onModeChange={onWireModeChange} />
      <NotificationsMenu
        notifications={notifications}
        onMarkAllRead={onMarkAllNotificationsRead}
        realtimeStatus={realtimeStatus}
        unreadCount={unreadNotificationCount}
      />
      <AccountMenu
        activeLeague={activeLeague}
        activeState={activeState}
        items={items}
        motionOff={motionOff}
        onMotionChange={onMotionChange}
      />
    </header>
  );
}

function MobileBottomTabs({
  activeState,
  currentNavItems,
}: {
  readonly activeState: ActiveNavigationState;
  readonly currentNavItems: readonly NavigationShellItem[];
}) {
  return (
    <nav
      aria-label="Current scope sections"
      className="fixed inset-x-0 bottom-0 z-30 grid min-h-16 grid-cols-[repeat(var(--nav-count),minmax(4.25rem,1fr))] overflow-x-auto overscroll-x-contain border-t border-[var(--hair)] bg-[var(--panel-solid)]/95 px-1 pb-safe shadow-overlay backdrop-blur md:hidden motion-reduce:backdrop-blur-none"
      data-slot="mobile-bottom-tabs"
      style={{ "--nav-count": currentNavItems.length } as CSSProperties}
    >
      {currentNavItems.map((item) => (
        <NavigationItem
          activeState={activeState}
          compact={false}
          item={item}
          key={item.id}
        />
      ))}
    </nav>
  );
}

function MobileSwitcherSheet({
  activeState,
  items,
  onClose,
  presenceByLeagueId,
}: {
  readonly activeState: ActiveNavigationState;
  readonly items: readonly LeagueSwitcherViewItem[];
  readonly onClose: () => void;
  readonly presenceByLeagueId: Readonly<Record<string, number>>;
}) {
  return (
    <Sheet
      closeLabel="Close scope switcher"
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={true}
      title={
        <span className="grid gap-1">
          <span className="eyebrow">Scope</span>
          <span>Switch environments</span>
        </span>
      }
    >
      <LeagueSwitcherView
        activeState={activeState}
        className="border-0 bg-transparent p-0 shadow-none"
        items={items}
        presenceByLeagueId={presenceByLeagueId}
        showHeader={false}
      />
    </Sheet>
  );
}

function NavigationSection({
  activeState,
  collapsed,
  items,
  label,
}: {
  readonly activeState: ActiveNavigationState;
  readonly collapsed: boolean;
  readonly items: readonly NavigationShellItem[];
  readonly label: string;
}) {
  return (
    <nav aria-label={`${label} sections`} className="grid gap-1">
      <p
        className={cn(
          "px-2 pt-2 pb-1 font-mono text-xs uppercase tracking-[0.22em] text-ink-4",
          collapsed && "sr-only",
        )}
      >
        {label}
      </p>
      {items.map((item) => (
        <NavigationItem
          activeState={activeState}
          compact={collapsed}
          item={item}
          key={item.id}
        />
      ))}
    </nav>
  );
}

function NavigationItem({
  activeState,
  compact,
  item,
}: {
  readonly activeState: ActiveNavigationState;
  readonly compact: boolean;
  readonly item: NavigationShellItem;
}) {
  const isActive = isNavigationItemActive(activeState, item);
  const Icon = NAVIGATION_ICON_COMPONENTS[item.icon];
  const href =
    activeState.scope === "league" && item.scope === "global"
      ? globalHrefForLeagueScope(item.id, activeState.leagueId, item.href)
      : item.href;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center justify-center gap-2.5 rounded-control px-2.5 font-display text-xs font-medium tracking-[0.04em] text-ink-3 transition-[background-color,color,box-shadow,transform] hover:bg-primary/5 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none max-md:h-full max-md:flex-col max-md:gap-1 max-md:px-1 md:text-sm",
        isActive &&
          "bg-[linear-gradient(90deg,var(--primary-soft),transparent)] text-lilac [&_svg]:drop-shadow-[0_0_6px_var(--glow-lilac)]",
        compact ? "md:size-11 md:px-0" : "md:justify-start",
      )}
      href={href}
      title={compact ? item.label : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-transparent max-md:hidden",
          isActive && "bg-primary shadow-[0_0_12px_var(--glow-lilac)]",
          compact &&
            "md:top-auto md:right-2 md:bottom-0 md:left-2 md:h-0.5 md:w-auto",
        )}
      />
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className={cn("truncate", compact && "md:sr-only")}>
        {item.label}
      </span>
    </Link>
  );
}

function isNavigationItemActive(
  activeState: ActiveNavigationState,
  item: NavigationShellItem,
): boolean {
  if (activeState.scope !== item.scope) {
    return false;
  }

  if (activeState.scope === "league" && item.scope === "league") {
    return leagueShellSectionId(activeState.sectionId) === item.id;
  }

  return activeState.sectionId === item.id;
}

function leagueShellSectionId(
  sectionId: Extract<ActiveNavigationState, { scope: "league" }>["sectionId"],
) {
  return sectionId === "ledger" ? "data" : sectionId;
}

function ShellBreadcrumbs({
  className,
  items,
}: {
  readonly className?: string;
  readonly items: readonly BreadcrumbItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("min-w-0", className)}
      data-slot="breadcrumbs"
    >
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {items.map((item, index) => (
          <li
            className="flex min-w-0 items-center gap-1"
            key={`${item.href ?? "crumb"}-${String(item.label)}-${index}`}
          >
            {index > 0 ? (
              <ChevronDown
                aria-hidden="true"
                className="-rotate-90 size-4 shrink-0 text-muted-foreground/70"
              />
            ) : null}
            <ShellBreadcrumbLink item={item} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ShellBreadcrumbLink({ item }: { readonly item: BreadcrumbItem }) {
  const className = cn(
    "min-w-0 truncate rounded-control px-2 py-1 font-display text-xs uppercase tracking-normal outline-none focus-visible:shadow-[var(--focus-ring-shadow)]",
    item.current
      ? "text-foreground"
      : "text-muted-foreground transition-colors hover:text-foreground",
  );

  if (!item.href || item.current) {
    return (
      <span
        aria-current={item.current ? "page" : undefined}
        className={className}
      >
        {item.label}
      </span>
    );
  }

  return (
    <Link className={className} href={item.href}>
      {item.label}
    </Link>
  );
}

function ShellWire({
  activeState,
  collapsed,
  items,
  motion,
  onOpenWire,
  realtimeStatus,
}: {
  readonly activeState: ActiveNavigationState;
  readonly collapsed: boolean;
  readonly items: readonly ShellWireItem[];
  readonly motion: ShellMotionMode;
  readonly onOpenWire: () => void;
  readonly realtimeStatus: ShellRealtimeStatus;
}) {
  const status = wireStatusForRealtime(realtimeStatus, items);
  const variant = wireVariantForScope(activeState.scope);
  const mobileItems = items.map(({ href: _href, ...item }) => item);

  return (
    <div
      className={cn(
        "fixed top-14 right-0 left-0 z-20",
        collapsed ? "md:left-[4.5rem]" : "md:left-72",
      )}
      data-slot="shell-wire"
    >
      <ShellWireTicker
        aria-label={wireAriaLabel(activeState.scope)}
        className="hidden md:flex"
        items={items}
        motion={motion}
        status={status}
        variant={variant}
      />
      <button
        aria-label="Open The Wire"
        className="flex w-full text-left outline-none focus-visible:shadow-[var(--focus-ring-shadow)] md:hidden"
        onClick={onOpenWire}
        type="button"
      >
        <ShellWireTicker
          aria-label={wireAriaLabel(activeState.scope)}
          className="pointer-events-none w-full"
          items={mobileItems}
          motion="off"
          status={status}
          variant={variant}
        />
      </button>
    </div>
  );
}

function WireSheet({
  items,
  motion,
  onOpenChange,
  open,
  realtimeStatus,
}: {
  readonly items: readonly ShellWireItem[];
  readonly motion: ShellMotionMode;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly realtimeStatus: ShellRealtimeStatus;
}) {
  return (
    <Sheet
      closeLabel="Close The Wire"
      description="General NFL and fantasy headlines, or the same wire filtered to your rostered players."
      onOpenChange={onOpenChange}
      open={open}
      title="The Wire"
    >
      <ShellWireTicker
        aria-label="The Wire"
        expanded
        items={items}
        motion={motion}
        status={wireStatusForRealtime(realtimeStatus, items)}
        variant="live"
      />
    </Sheet>
  );
}

function ShellWireTicker({
  "aria-label": ariaLabel,
  className,
  expanded = false,
  items,
  motion,
  status,
  variant,
}: {
  readonly "aria-label": string;
  readonly className?: string;
  readonly expanded?: boolean;
  readonly items: readonly ShellWireItem[];
  readonly motion: ShellMotionMode;
  readonly status: ShellWireStatus;
  readonly variant: "digest" | "live";
}) {
  const statusLabel = wireStatusLabel(status);
  const dotClass =
    status === "live"
      ? "bg-jade shadow-[0_0_8px_var(--glow-lilac)]"
      : status === "reconnecting"
        ? "bg-warning"
        : "bg-ink-4";

  // Expanded (mobile sheet): a plain vertical list, not the ticker strip.
  if (expanded) {
    return (
      <section
        aria-label={ariaLabel}
        className={cn("auspex-wire grid gap-2", className)}
        data-motion={motion}
        data-slot="wire-ticker"
        data-state={status}
        data-variant={variant}
      >
        {items.length === 0 ? (
          <p className="cell px-3 py-2 font-mono text-xs text-ink-3">
            {wireEmptyMessage(status)}
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {items.map((item) => (
              <ShellWireTickerItem item={item} key={item.id} />
            ))}
          </ul>
        )}
      </section>
    );
  }

  // Thin ticker strip directly under the top bar (reference `.ticker`).
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "auspex-wire flex h-11 items-stretch overflow-hidden border-b border-[var(--hair)] bg-[var(--panel)] backdrop-blur-xl motion-reduce:backdrop-blur-none",
        className,
      )}
      data-motion={motion}
      data-slot="wire-ticker"
      data-state={status}
      data-variant={variant}
    >
      <div className="flex shrink-0 items-center gap-2 border-r border-[var(--lilac-deep)] bg-primary/15 px-3 text-lilac-hi">
        <span
          aria-hidden="true"
          className={cn(
            "auspex-live-dot inline-block size-1.5 shrink-0 rounded-full",
            dotClass,
          )}
          data-status={status === "live" ? "live" : "static"}
        />
        <span className="font-mono text-xs uppercase tracking-[0.18em]">
          Wire
        </span>
        <span className="sr-only">{statusLabel}</span>
      </div>
      {items.length === 0 ? (
        <span className="flex items-center px-3 font-mono text-xs text-ink-3">
          {wireEmptyMessage(status)}
        </span>
      ) : (
        <div className="auspex-wire__viewport flex-1" data-slot="wire-marquee">
          <ul className="auspex-wire__track h-full items-center gap-2">
            {items.map((item) => (
              <ShellWireTickerItem item={item} key={item.id} />
            ))}
            {items.map((item) => (
              <ShellWireTickerItem
                aria-hidden="true"
                item={item}
                key={`repeat-${item.id}`}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ShellWireTickerItem({
  item,
  ...props
}: ComponentPropsWithoutRef<"li"> & {
  readonly item: ShellWireItem;
}) {
  const kind = item.kind ?? "system";
  const content = (
    <>
      {item.fresh ? (
        <output
          aria-label="Fresh wire item"
          className="inline-flex items-center gap-1.5"
        >
          <span
            aria-hidden="true"
            className="auspex-live-dot inline-flex size-2.5 shrink-0 rounded-full bg-highlight shadow-[0_0_14px_var(--glow-lilac)] ring-2 ring-background"
            data-status="fresh"
          />
          <span className="sr-only">Fresh wire item</span>
        </output>
      ) : null}
      <span className={cn("font-medium", wireKindClass(kind))}>
        {item.label}
      </span>
      {item.meta ? (
        <span className="metric text-xs text-muted-foreground">
          {item.meta}
        </span>
      ) : null}
    </>
  );

  return (
    <li
      className="inline-flex shrink-0 items-center gap-2 px-2 font-mono text-xs"
      data-kind={kind}
      data-slot="wire-item"
      {...props}
    >
      {item.href ? (
        <a
          className="inline-flex min-h-11 items-center gap-2 text-inherit transition-colors hover:text-lilac focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
          href={item.href}
        >
          {content}
        </a>
      ) : (
        content
      )}
    </li>
  );
}

function WireModeToggle({
  className,
  mode,
  onModeChange,
}: {
  readonly className?: string;
  readonly mode: ShellWireMode;
  readonly onModeChange: (mode: ShellWireMode) => void;
}) {
  const options = [
    { label: "Global news", shortLabel: "G", value: "general" },
    { label: "Your players", shortLabel: "P", value: "personal" },
  ] as const;

  return (
    <fieldset
      aria-label="Wire feed"
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full border border-[var(--hair)] bg-[var(--panel)] p-0.5 shadow-[var(--bevel)]",
        className,
      )}
      data-slot="wire-mode-toggle"
    >
      <legend className="sr-only">Wire feed</legend>
      {options.map(({ label, shortLabel, value }) => {
        const active = mode === value;
        return (
          <button
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 font-mono text-xs uppercase tracking-[0.14em] outline-none transition-[background-color,border-color,color,box-shadow] focus-visible:shadow-[var(--focus-ring-shadow)]",
              active
                ? "border-primary/60 bg-primary/15 text-lilac-hi shadow-[0_0_14px_var(--glow-lilac)]"
                : "border-[var(--hair)] bg-transparent text-ink-3 hover:border-primary/40 hover:text-foreground",
            )}
            key={value}
            onClick={() => onModeChange(value)}
            title={label}
            type="button"
          >
            <span aria-hidden="true">{shortLabel}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

function NotificationsMenu({
  notifications,
  onMarkAllRead,
  realtimeStatus,
  unreadCount,
}: {
  readonly notifications: readonly ShellNotification[];
  readonly onMarkAllRead: () => void;
  readonly realtimeStatus: ShellRealtimeStatus;
  readonly unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  function closePanel() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="relative shrink-0">
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open notifications"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Bell aria-hidden="true" />
      </Button>
      {unreadCount > 0 ? (
        <Badge
          className="pointer-events-none absolute -top-1 -right-1"
          label={`${unreadCount} unread notifications`}
          value={unreadCount}
        />
      ) : null}
      {open ? (
        <div
          aria-labelledby="notifications-panel-title"
          className="panel fixed inset-x-3 bottom-[calc(var(--space-3)+env(safe-area-inset-bottom))] z-50 grid max-h-[80dvh] gap-3 overflow-y-auto p-3 shadow-overlay md:absolute md:inset-x-auto md:right-0 md:bottom-auto md:top-12 md:w-80"
          data-slot="notifications-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closePanel();
            }
          }}
          ref={panelRef}
          role="dialog"
          tabIndex={-1}
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2
                className="font-display text-sm font-semibold text-foreground"
                id="notifications-panel-title"
              >
                Notifications
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Live shell notices and recent league activity.
              </p>
            </div>
            <Button
              aria-label="Close notifications"
              onClick={closePanel}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </header>
          <div className="flex items-center justify-between gap-3">
            <span className="metric text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </span>
            <Button
              disabled={unreadCount === 0}
              onClick={onMarkAllRead}
              size="sm"
              type="button"
              variant="ghost"
            >
              Mark all read
            </Button>
          </div>
          {realtimeStatus === "reconnecting" || realtimeStatus === "offline" ? (
            <div
              aria-live="polite"
              className="cell flex min-h-11 items-center gap-2 border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground"
            >
              <Presence
                label={realtimeStatusLabel(realtimeStatus)}
                status={realtimeStatus === "offline" ? "offline" : "idle"}
              />
              <span>{realtimeStatusLabel(realtimeStatus)}</span>
            </div>
          ) : null}
          {notifications.length === 0 ? (
            <div className="cell grid gap-1 p-4 text-sm text-muted-foreground">
              <p className="font-display font-semibold text-foreground">
                All caught up.
              </p>
              <p>The notification stream is quiet.</p>
            </div>
          ) : (
            <ul className="grid gap-2">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    className={cn(
                      "cell grid min-h-14 gap-1 p-3 text-sm outline-none transition-colors hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring-shadow)]",
                      !notification.read &&
                        "border-primary/40 shadow-[inset_3px_0_0_var(--primary),var(--bevel)]",
                    )}
                    href={notification.href}
                    onClick={closePanel}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-display font-semibold text-foreground">
                        {notification.title}
                      </span>
                      <span className="metric shrink-0 text-xs text-muted-foreground">
                        {notification.timestamp}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {notification.detail}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
            href="/you"
            onClick={closePanel}
          >
            <Settings className="size-4" aria-hidden="true" />
            Notification settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function AccountMenu({
  activeLeague,
  activeState,
  items,
  motionOff,
  onMotionChange,
}: {
  readonly activeLeague: LeagueSwitcherViewItem | null;
  readonly activeState: ActiveNavigationState;
  readonly items: readonly LeagueSwitcherViewItem[];
  readonly motionOff: boolean;
  readonly onMotionChange: (motionOff: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const connectedProviders = useMemo(() => {
    const providerLabels = new Map<string, string>();
    for (const item of items) {
      providerLabels.set(item.provider, item.providerLabel);
    }
    return [...providerLabels.entries()].map(([provider, label]) => ({
      label,
      provider,
    }));
  }, [items]);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  function closePanel() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="relative shrink-0">
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open account menu"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        size="icon"
        type="button"
        variant="ghost"
      >
        <CircleUserRound aria-hidden="true" />
      </Button>
      {open ? (
        <div
          aria-labelledby="account-panel-title"
          className="panel fixed inset-x-3 bottom-[calc(var(--space-3)+env(safe-area-inset-bottom))] z-50 grid max-h-[82dvh] gap-4 overflow-y-auto p-3 shadow-overlay md:absolute md:inset-x-auto md:right-0 md:bottom-auto md:top-12 md:w-80"
          data-slot="account-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closePanel();
            }
          }}
          ref={panelRef}
          role="dialog"
          tabIndex={-1}
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2
                className="font-display text-sm font-semibold text-foreground"
                id="account-panel-title"
              >
                Account
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {scopeDisplayName(activeState, activeLeague)}
              </p>
            </div>
            <Button
              aria-label="Close account menu"
              onClick={closePanel}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </header>
          <div className="cell grid gap-2 p-3">
            <span className="eyebrow">Current scope</span>
            <div className="flex min-w-0 items-center gap-3">
              <ScopeAvatar
                activeLeague={activeLeague}
                activeState={activeState}
              />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold">
                  {scopeDisplayName(activeState, activeLeague)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeLeague?.providerLabel ?? "Global"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <span className="eyebrow">Connected providers</span>
            <div className="flex flex-wrap gap-2">
              {connectedProviders.length > 0 ? (
                connectedProviders.map((provider) => (
                  <Tag key={provider.provider}>{provider.label}</Tag>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  No connected league providers yet.
                </span>
              )}
            </div>
          </div>

          <MotionToggle motionOff={motionOff} onMotionChange={onMotionChange} />

          <DeferredInstallAffordance />

          <div className="grid gap-2 border-t border-[var(--hair)] pt-3">
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
              href="/you"
              onClick={closePanel}
            >
              <Settings className="size-4" aria-hidden="true" />
              Account and settings
            </Link>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
              href="/you"
              onClick={closePanel}
            >
              <Smartphone className="size-4" aria-hidden="true" />
              Push, install, and providers
            </Link>
            <DeferredSignOutButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MotionToggle({
  className,
  motionOff,
  onMotionChange,
}: {
  readonly className?: string;
  readonly motionOff: boolean;
  readonly onMotionChange: (motionOff: boolean) => void;
}) {
  return (
    <div
      className={cn("min-h-11 items-center gap-2 text-sm", className ?? "flex")}
    >
      <button
        aria-checked={motionOff}
        aria-label="Reduced motion"
        className="group/shell-switch relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control border border-transparent outline-none transition-[box-shadow] focus-visible:shadow-[var(--focus-ring-shadow)]"
        onClick={() => onMotionChange(!motionOff)}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative inline-flex h-6 w-10 items-center rounded-full border border-input bg-[var(--hull-3)] p-0.5 shadow-[var(--bevel)] transition-[background-color,border-color]",
            motionOff && "border-primary bg-primary",
          )}
        >
          <span
            className={cn(
              "block size-5 rounded-full border border-[var(--line-2)] bg-foreground shadow-raised transition-transform motion-reduce:transition-none",
              motionOff && "translate-x-4",
            )}
          />
        </span>
      </button>
      <span className="font-display text-xs font-semibold text-muted-foreground uppercase">
        Motion
      </span>
    </div>
  );
}

function useShellRealtime(
  activeState: ActiveNavigationState,
): ShellRealtimeState {
  const activeLeagueId =
    activeState.scope === "league" ? activeState.leagueId : null;
  const scopeKey = activeLeagueId ? `league:${activeLeagueId}` : "global";
  const subscriptions = useMemo(
    () => buildShellRealtimeSubscriptions(activeState.scope, activeLeagueId),
    [activeState.scope, activeLeagueId],
  );
  const leagueIds = useMemo(
    () => (activeLeagueId ? [activeLeagueId] : []),
    [activeLeagueId],
  );
  const [state, setState] = useState<ShellRealtimeState>(() =>
    emptyShellRealtimeState(),
  );

  useEffect(() => {
    if (scopeKey.length > 0) {
      setState(emptyShellRealtimeState());
    }
  }, [scopeKey]);

  useEffect(() => {
    const updateOnlineState = () => {
      if (!window.navigator.onLine) {
        setState((current) => ({ ...current, status: "offline" }));
        return;
      }
      setState((current) =>
        current.status === "offline"
          ? { ...current, status: "reconnecting" }
          : current,
      );
    };

    updateOnlineState();
    window.addEventListener("offline", updateOnlineState);
    window.addEventListener("online", updateOnlineState);
    return () => {
      window.removeEventListener("offline", updateOnlineState);
      window.removeEventListener("online", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    let closed = false;
    let handle: RealtimeRefreshHandle | null = null;
    let reconnectTimer: number | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const setStatus = (status: ShellRealtimeStatus) => {
      if (closed) {
        return;
      }
      setState((current) =>
        current.status === status ? current : { ...current, status },
      );
    };

    const scheduleReconnect = () => {
      if (closed) {
        return;
      }
      setStatus(window.navigator.onLine ? "reconnecting" : "offline");
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        void connect();
      }, SHELL_REALTIME_RECONNECT_MS);
    };

    async function connect() {
      if (subscriptions.length === 0) {
        setStatus("offline");
        return;
      }

      try {
        handle?.unsubscribe();
        const { openRealtimeRefreshSubscription } = await import(
          "@/realtime/client"
        );
        handle = await openRealtimeRefreshSubscription({
          leagueIds,
          onError: scheduleReconnect,
          onRefresh: (event) => {
            if (closed) {
              return;
            }
            const wireItem = shellWireItemFromRealtimeEvent(event);
            const notification = shellNotificationFromRealtimeEvent(event);
            setState((current) => ({
              ...current,
              notifications: notification
                ? prependShellItem(current.notifications, notification)
                : current.notifications,
              status: "live",
              wireItems: wireItem
                ? prependShellItem(current.wireItems, wireItem)
                : current.wireItems,
            }));
          },
          subscriptions,
        });
        if (closed) {
          handle.unsubscribe();
          return;
        }

        clearReconnectTimer();
        setStatus(handle.expiresAt ? "live" : "offline");
        if (handle.expiresAt) {
          const refreshInMs = Math.max(
            SHELL_REALTIME_RECONNECT_MS,
            new Date(handle.expiresAt).getTime() -
              Date.now() -
              SHELL_REALTIME_TOKEN_REFRESH_SKEW_MS,
          );
          reconnectTimer = window.setTimeout(() => {
            void connect();
          }, refreshInMs);
        }
      } catch {
        scheduleReconnect();
      }
    }

    void connect();

    return () => {
      closed = true;
      clearReconnectTimer();
      handle?.unsubscribe();
    };
  }, [leagueIds, subscriptions]);

  useEffect(() => {
    if (!activeLeagueId) {
      return;
    }

    const leagueId = activeLeagueId;
    let closed = false;
    let handle: RealtimeRefreshHandle | null = null;
    let reconnectTimer: number | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) {
        return;
      }
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        void connectPresence();
      }, SHELL_REALTIME_RECONNECT_MS);
    };

    async function connectPresence() {
      try {
        handle?.unsubscribe();
        const { openRealtimePresenceSubscription } = await import(
          "@/realtime/client"
        );
        handle = await openRealtimePresenceSubscription({
          leagueId,
          onError: scheduleReconnect,
          onPresence: (snapshot) => {
            if (closed) {
              return;
            }
            setState((current) => ({
              ...current,
              presenceByLeagueId: {
                ...current.presenceByLeagueId,
                [snapshot.leagueId]: snapshot.onlineCount,
              },
            }));
          },
        });
        if (closed) {
          handle.unsubscribe();
          return;
        }
        clearReconnectTimer();
        if (handle.expiresAt) {
          const refreshInMs = Math.max(
            SHELL_REALTIME_RECONNECT_MS,
            new Date(handle.expiresAt).getTime() -
              Date.now() -
              SHELL_REALTIME_TOKEN_REFRESH_SKEW_MS,
          );
          reconnectTimer = window.setTimeout(() => {
            void connectPresence();
          }, refreshInMs);
        }
      } catch {
        setState((current) => ({
          ...current,
          presenceByLeagueId: {
            ...current.presenceByLeagueId,
            [leagueId]: 0,
          },
        }));
        scheduleReconnect();
      }
    }

    void connectPresence();

    return () => {
      closed = true;
      clearReconnectTimer();
      handle?.unsubscribe();
    };
  }, [activeLeagueId]);

  return state;
}

function emptyShellRealtimeState(): ShellRealtimeState {
  return {
    notifications: [],
    presenceByLeagueId: {},
    status: "connecting",
    wireItems: [],
  };
}

function buildShellRealtimeSubscriptions(
  scope: ActiveNavigationState["scope"],
  activeLeagueId: string | null,
): RealtimeRefreshSubscription[] {
  if (scope === "league" && activeLeagueId) {
    const leagueId = activeLeagueId;
    return [
      realtimeSubscription(leagueRealtimeChannel(leagueId, "scores"), [
        REALTIME_EVENTS.scoresUpdated,
      ]),
      realtimeSubscription(leagueRealtimeChannel(leagueId, "odds"), [
        REALTIME_EVENTS.oddsUpdated,
      ]),
      realtimeSubscription(leagueRealtimeChannel(leagueId, "leaderboard"), [
        REALTIME_EVENTS.leagueLeaderboardUpdated,
      ]),
      realtimeSubscription(leagueRealtimeChannel(leagueId, "blog"), [
        REALTIME_EVENTS.blogPublished,
      ]),
      realtimeSubscription(leagueRealtimeChannel(leagueId, "lore"), [
        REALTIME_EVENTS.loreVoteOpened,
        REALTIME_EVENTS.loreCanonized,
      ]),
    ];
  }

  return [
    realtimeSubscription("central:news", [REALTIME_EVENTS.centralNewsUpdated]),
    realtimeSubscription("arena:leaderboard", [
      REALTIME_EVENTS.arenaLeaderboardUpdated,
      REALTIME_EVENTS.arenaStandingsSwing,
    ]),
  ];
}

function realtimeSubscription(
  topic: RealtimeRefreshSubscription["topic"],
  events: readonly RealtimeEventType[],
): RealtimeRefreshSubscription {
  return { events, topic };
}

function prependShellItem<T extends { readonly id: string }>(
  items: readonly T[],
  item: T,
): readonly T[] {
  return [item, ...items.filter((candidate) => candidate.id !== item.id)].slice(
    0,
    SHELL_REALTIME_MAX_ITEMS,
  );
}

function mergeShellItems<T extends { readonly id: string }>(
  liveItems: readonly T[],
  fallbackItems: readonly T[],
): readonly T[] {
  const liveIds = new Set(liveItems.map((item) => item.id));
  return [
    ...liveItems,
    ...fallbackItems.filter((item) => !liveIds.has(item.id)),
  ];
}

function shellWireItemFromRealtimeEvent(
  event: RealtimeRefreshEvent,
): ShellWireItem | null {
  const payload = event.payload;
  if (!payload) {
    return null;
  }

  if (payload.type === REALTIME_EVENTS.scoresUpdated) {
    return {
      fresh: true,
      href: leagueHref(payload.leagueId),
      id: `rt:${payload.type}:${payload.leagueId}:${payload.at}`,
      kind: "score",
      label: `${formatCount(payload.matchupIds.length, "matchup")} updated`,
      meta:
        payload.scoringPeriod === null
          ? "SCORES"
          : `WK ${payload.scoringPeriod}`,
    };
  }

  if (payload.type === REALTIME_EVENTS.oddsUpdated) {
    return {
      fresh: true,
      href: leagueHref(payload.leagueId, "/bet"),
      id: `rt:${payload.type}:${payload.leagueId}:${payload.at}`,
      kind: "bet",
      label: `${formatCount(payload.marketIds.length, "market")} moved`,
      meta: "ODDS",
    };
  }

  if (payload.type === REALTIME_EVENTS.leagueLeaderboardUpdated) {
    return {
      fresh: true,
      href: leagueHref(payload.leagueId, "/bet"),
      id: `rt:${payload.type}:${payload.leagueId}:${payload.at}`,
      kind: "swing",
      label: "Bankroll standings refreshed",
      meta: "BANKROLL",
    };
  }

  if (payload.type === REALTIME_EVENTS.blogPublished) {
    return {
      fresh: true,
      href: leagueHref(payload.leagueId, `/press/${payload.contentItemId}`),
      id: `rt:${payload.type}:${payload.leagueId}:${payload.contentItemId}`,
      kind: "cast",
      label: payload.title,
      meta: "PRESS",
    };
  }

  if (payload.type === REALTIME_EVENTS.loreVoteOpened) {
    return {
      fresh: true,
      href: leagueHref(payload.leagueId, `/lore/${payload.claimId}`),
      id: `rt:${payload.type}:${payload.leagueId}:${payload.claimId}`,
      kind: "lore",
      label: "Lore vote opened",
      meta: "SETTLE IT",
    };
  }

  if (payload.type === REALTIME_EVENTS.loreCanonized) {
    return {
      fresh: true,
      href: leagueHref(payload.leagueId, `/lore/${payload.claimId}`),
      id: `rt:${payload.type}:${payload.leagueId}:${payload.claimId}`,
      kind: "lore",
      label: "Canon updated",
      meta: payload.ratifiedBy.toUpperCase(),
    };
  }

  if (payload.type === REALTIME_EVENTS.centralNewsUpdated) {
    return {
      fresh: true,
      href: "/news",
      id: `rt:${payload.type}:${payload.at}`,
      kind: "cast",
      label: `${formatCount(payload.contentItemIds.length, "story")} hit central news`,
      meta: "NEWS",
    };
  }

  if (payload.type === REALTIME_EVENTS.arenaLeaderboardUpdated) {
    return {
      fresh: true,
      href: arenaHref(payload.seasonId),
      id: `rt:${payload.type}:${payload.at}`,
      kind: "swing",
      label: "Arena leaderboard refreshed",
      meta: "ARENA",
    };
  }

  if (payload.type === REALTIME_EVENTS.arenaStandingsSwing) {
    return {
      fresh: true,
      href: arenaHref(payload.seasonId),
      id: `rt:${payload.type}:${payload.seasonId}:${payload.computedAt}`,
      kind: "swing",
      label:
        payload.swings.length > 0
          ? `${formatCount(payload.swings.length, "arena rank")} moved`
          : "Arena standings settled",
      meta: "ARENA",
    };
  }

  return null;
}

function shellNotificationFromRealtimeEvent(
  event: RealtimeRefreshEvent,
): ShellNotification | null {
  const payload = event.payload;
  if (!payload) {
    return null;
  }

  const timestamp = formatWireTimestamp(payload.at);

  if (payload.type === REALTIME_EVENTS.scoresUpdated) {
    return {
      detail: `${formatCount(payload.matchupIds.length, "matchup")} changed on the live scoreboard.`,
      href: leagueHref(payload.leagueId),
      id: `notice:${payload.type}:${payload.leagueId}:${payload.at}`,
      kind: "scores",
      timestamp,
      title: "Scoreboard updated",
    };
  }

  if (payload.type === REALTIME_EVENTS.oddsUpdated) {
    return {
      detail: `${formatCount(payload.marketIds.length, "market")} has a fresh locked line available.`,
      href: leagueHref(payload.leagueId, "/bet"),
      id: `notice:${payload.type}:${payload.leagueId}:${payload.at}`,
      kind: "odds",
      timestamp,
      title: "Odds board moved",
    };
  }

  if (payload.type === REALTIME_EVENTS.leagueLeaderboardUpdated) {
    return {
      detail: "The rolling bankroll standings have a new materialized view.",
      href: leagueHref(payload.leagueId, "/bet"),
      id: `notice:${payload.type}:${payload.leagueId}:${payload.at}`,
      kind: "arena",
      timestamp,
      title: "Bankroll standings refreshed",
    };
  }

  if (payload.type === REALTIME_EVENTS.blogPublished) {
    return {
      detail: payload.title,
      href: leagueHref(payload.leagueId, `/press/${payload.contentItemId}`),
      id: `notice:${payload.type}:${payload.leagueId}:${payload.contentItemId}`,
      kind: "blog",
      timestamp,
      title: "The Press published",
    };
  }

  if (payload.type === REALTIME_EVENTS.loreVoteOpened) {
    return {
      detail: "A claim needs the league to settle it.",
      href: leagueHref(payload.leagueId, `/lore/${payload.claimId}`),
      id: `notice:${payload.type}:${payload.leagueId}:${payload.claimId}`,
      kind: "lore",
      timestamp,
      title: "Settle it: lore vote opened",
    };
  }

  if (payload.type === REALTIME_EVENTS.loreCanonized) {
    return {
      detail: `A claim became canon by ${payload.ratifiedBy}.`,
      href: leagueHref(payload.leagueId, `/lore/${payload.claimId}`),
      id: `notice:${payload.type}:${payload.leagueId}:${payload.claimId}`,
      kind: "lore",
      timestamp,
      title: "Canon updated",
    };
  }

  if (payload.type === REALTIME_EVENTS.centralNewsUpdated) {
    return {
      detail: `${formatCount(payload.contentItemIds.length, "story")} refreshed in central news.`,
      href: "/news",
      id: `notice:${payload.type}:${payload.at}`,
      kind: "blog",
      timestamp,
      title: "Central news refreshed",
    };
  }

  if (payload.type === REALTIME_EVENTS.arenaLeaderboardUpdated) {
    return {
      detail: "The inter-league board has fresh standings.",
      href: arenaHref(payload.seasonId),
      id: `notice:${payload.type}:${payload.at}`,
      kind: "arena",
      timestamp,
      title: "Arena leaderboard refreshed",
    };
  }

  if (payload.type === REALTIME_EVENTS.arenaStandingsSwing) {
    return {
      detail:
        payload.swings.length > 0
          ? `${formatCount(payload.swings.length, "rank movement")} landed across the arena.`
          : "Arena standings settled without a rank change.",
      href: arenaHref(payload.seasonId),
      id: `notice:${payload.type}:${payload.seasonId}:${payload.computedAt}`,
      kind: "arena",
      timestamp,
      title: "Arena movement landed",
    };
  }

  return null;
}

function ShellBootOverlay({ motion }: { readonly motion: ShellMotionMode }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (motion === "off" || prefersReducedMotion) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setVisible(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [motion]);

  if (!visible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/95 backdrop-blur-xl motion-reduce:hidden"
      data-motion={motion}
      data-slot="boot-shell"
    >
      <div className="panel grid w-[min(22rem,calc(100vw-var(--space-8)))] justify-items-center gap-4 p-6 text-center shadow-overlay">
        <span className="orb think size-14" data-state="thinking" />
        <div className="grid gap-1">
          <p className="heading-auspex text-sm">Rumbledore</p>
          <p className="lcd text-xs text-muted-foreground">
            LINK ... WIRE ... READY
          </p>
        </div>
      </div>
    </div>
  );
}

function LiveClock({
  className,
  motionOff,
}: {
  readonly className?: string;
  readonly motionOff: boolean;
}) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    setTime(formatClock(new Date()));
    if (motionOff) {
      return;
    }
    const interval = window.setInterval(() => {
      setTime(formatClock(new Date()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [motionOff]);

  const renderedTime = time ?? "--:--:--";

  return (
    <output
      aria-busy={time ? undefined : true}
      aria-label={time ? `Local time ${time}` : "Local time loading"}
      className={cn(
        "lcd min-h-10 items-center gap-2 rounded-control border border-input bg-[var(--panel)] px-3 text-xs",
        className,
      )}
      data-slot="live-clock"
    >
      <Clock3 className="size-3.5" aria-hidden="true" />
      {renderedTime}
    </output>
  );
}

function useShellMotionPreference(): readonly [
  boolean,
  (motionOff: boolean) => void,
] {
  const [motionOff, setMotionOffState] = useState(false);

  useEffect(() => {
    try {
      const storedMotion = window.localStorage.getItem(MOTION_STORAGE_KEY);
      const resolvedMotionOff =
        storedMotion === MOTION_OFF_VALUE ||
        document.documentElement.getAttribute("data-motion") ===
          MOTION_OFF_VALUE;
      setMotionOffState(resolvedMotionOff);
      applyShellMotionPreference(resolvedMotionOff);
    } catch {
      // Motion preference is best-effort; OS reduced-motion still applies.
    }
  }, []);

  const setMotionOff = useCallback((nextMotionOff: boolean) => {
    setMotionOffState(nextMotionOff);
    applyShellMotionPreference(nextMotionOff);
    try {
      window.localStorage.setItem(
        MOTION_STORAGE_KEY,
        nextMotionOff ? MOTION_OFF_VALUE : "auto",
      );
    } catch {
      // Local storage may be unavailable in private browsing.
    }
  }, []);

  return [motionOff, setMotionOff] as const;
}

function useWireModePreference(): readonly [
  ShellWireMode,
  (mode: ShellWireMode) => void,
] {
  const [mode, setModeState] = useState<ShellWireMode>("general");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(WIRE_MODE_STORAGE_KEY);
      if (stored === "personal" || stored === "general") {
        setModeState(stored);
      }
    } catch {
      // The wire still defaults to general when storage is unavailable.
    }
  }, []);

  const setMode = useCallback((nextMode: ShellWireMode) => {
    setModeState(nextMode);
    try {
      window.localStorage.setItem(WIRE_MODE_STORAGE_KEY, nextMode);
    } catch {
      // Preference persistence is best-effort.
    }
  }, []);

  return [mode, setMode] as const;
}

function useNewsWireFeed(mode: ShellWireMode): NewsWireFeedState {
  const [state, setState] = useState<NewsWireFeedState>({
    data: null,
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({
      data: current.data?.mode === mode ? current.data : null,
      status: "loading",
    }));

    async function loadWire() {
      try {
        const params = new URLSearchParams({
          limit: String(SHELL_REALTIME_MAX_ITEMS),
          mode,
        });
        const response = await fetch(`/news/wire?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`wire feed returned ${response.status}`);
        }

        const payload = (await response.json()) as NewsWireApiResponse;
        if (!controller.signal.aborted) {
          setState({ data: payload, status: "ready" });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ data: null, status: "error" });
        }
      }
    }

    void loadWire();

    return () => {
      controller.abort();
    };
  }, [mode]);

  return state;
}

function applyShellMotionPreference(motionOff: boolean): void {
  if (typeof document === "undefined") {
    return;
  }
  if (motionOff) {
    document.documentElement.setAttribute("data-motion", MOTION_OFF_VALUE);
    return;
  }
  document.documentElement.removeAttribute("data-motion");
}

function buildWireItems(
  wireMode: ShellWireMode,
  feed: NewsWireFeedState,
): readonly ShellWireItem[] {
  if (feed.status === "ready" && feed.data?.items.length) {
    return feed.data.items.map((item, index) => ({
      fresh: index === 0,
      href: item.href,
      id: `news-wire:${wireMode}:${item.id}`,
      kind: wireMode === "personal" ? "record" : "cast",
      label: item.title,
      meta:
        wireMode === "personal" && item.matchedLabels?.length
          ? item.matchedLabels.slice(0, 2).join(", ")
          : `${item.section} · ${item.source}`,
    }));
  }

  const fallback = newsWireFallbackItem(wireMode, feed);
  return fallback ? [fallback] : [];
}

function newsWireFallbackItem(
  wireMode: ShellWireMode,
  feed: NewsWireFeedState,
): ShellWireItem | null {
  if (feed.status === "loading") {
    return {
      id: `news-wire:${wireMode}:loading`,
      kind: "system",
      label:
        wireMode === "personal"
          ? "Personal roster wire loading"
          : "Central news wire loading",
      meta: wireMode === "personal" ? "PERSONAL" : "GENERAL",
    };
  }

  if (feed.status === "error" || !feed.data) {
    return {
      href: "/news",
      id: `news-wire:${wireMode}:error`,
      kind: "system",
      label: "News wire will retry on the next route",
      meta: "WIRE",
    };
  }

  switch (feed.data.status) {
    case "empty":
      return {
        href: "/news",
        id: "news-wire:general:empty",
        kind: "system",
        label: "Central news firehose is quiet",
        meta: "GENERAL",
      };
    case "no_matches":
      return {
        href: "/news",
        id: "news-wire:personal:no-matches",
        kind: "system",
        label: "No rostered-player headlines yet",
        meta: "PERSONAL",
      };
    case "no_rosters":
      return {
        href: "/",
        id: "news-wire:personal:no-rosters",
        kind: "system",
        label: "Claim your team to personalize the wire",
        meta: "PERSONAL",
      };
    case "signed_out":
      return {
        href: "/you",
        id: "news-wire:personal:signed-out",
        kind: "system",
        label: "Sign in to filter the wire to your roster",
        meta: "PERSONAL",
      };
    case "ready":
      return null;
  }
}

function leagueHref(leagueId: string, suffix = ""): string {
  return `/leagues/${encodeURIComponent(leagueId)}${suffix}`;
}

function arenaHref(seasonId: string | null): string {
  return seasonId ? `/arena?season=${encodeURIComponent(seasonId)}` : "/arena";
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatWireTimestamp(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) {
    return "live";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(date);
}

function wireStatusForRealtime(
  realtimeStatus: ShellRealtimeStatus,
  items: readonly ShellWireItem[],
): ShellWireStatus {
  if (realtimeStatus === "offline") {
    return "offline";
  }
  if (realtimeStatus === "connecting" || realtimeStatus === "reconnecting") {
    return "reconnecting";
  }
  return items.length > 0 ? "live" : "empty";
}

function wireStatusLabel(status: ShellWireStatus): string {
  switch (status) {
    case "empty":
      return "quiet";
    case "live":
      return "live";
    case "offline":
      return "offline";
    case "reconnecting":
      return "reconnecting";
  }
}

function wireEmptyMessage(status: ShellWireStatus): string {
  switch (status) {
    case "offline":
      return "The wire is offline.";
    case "reconnecting":
      return "Reconnecting to the wire.";
    case "empty":
    case "live":
      return "The wire is quiet.";
  }
}

function realtimeStatusLabel(status: ShellRealtimeStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting to realtime.";
    case "live":
      return "Realtime connected.";
    case "offline":
      return "Realtime offline.";
    case "reconnecting":
      return "Reconnecting to realtime.";
  }
}

function presenceLabelForLeague(
  leagueId: string,
  presenceByLeagueId: Readonly<Record<string, number>>,
  realtimeStatus: ShellRealtimeStatus,
): string {
  const count = presenceByLeagueId[leagueId];
  if (typeof count === "number") {
    return `${count} member${count === 1 ? "" : "s"} online`;
  }
  return realtimeStatusLabel(realtimeStatus);
}

function presenceStatusForLeague(
  leagueId: string,
  presenceByLeagueId: Readonly<Record<string, number>>,
  realtimeStatus: ShellRealtimeStatus,
): "idle" | "live" | "offline" | "online" {
  const count = presenceByLeagueId[leagueId];
  if (typeof count === "number") {
    return count > 0 ? "online" : "offline";
  }
  if (realtimeStatus === "offline") {
    return "offline";
  }
  if (realtimeStatus === "live") {
    return "live";
  }
  return "idle";
}

function wireVariantForScope(
  scope: ActiveNavigationState["scope"],
): "digest" | "live" {
  switch (scope) {
    case "arena":
    case "league":
      return "live";
    case "news":
    case "global":
      return "digest";
  }
}

function wireKindClass(kind: ShellWireItemKind): string {
  switch (kind) {
    case "bet":
    case "record":
      return "text-warning";
    case "cast":
    case "lore":
      return "text-primary";
    case "score":
      return "text-foreground";
    case "swing":
      return "text-positive";
    case "system":
      return "text-muted-foreground";
  }
}

function buildShellNotifications(
  activeState: ActiveNavigationState,
  activeLeague: LeagueSwitcherViewItem | null,
): readonly ShellNotification[] {
  if (activeState.scope === "league") {
    const leagueBase = `/leagues/${encodeURIComponent(activeState.leagueId)}`;
    const leagueName = activeLeague?.name ?? "League";

    return [
      {
        detail: `${leagueName} has live shell signals ready for score, odds, press, and lore updates.`,
        href: leagueBase,
        id: `shell:${activeState.leagueId}:wire`,
        kind: "scores",
        timestamp: "now",
        title: "League wire online",
      },
      {
        detail:
          "Open notification preferences to choose the push categories this league can send.",
        href: "/you",
        id: `shell:${activeState.leagueId}:prefs`,
        kind: "blog",
        read: true,
        timestamp: "prefs",
        title: "Push settings available",
      },
    ];
  }

  if (activeState.scope === "news") {
    return [
      {
        detail:
          "General headlines, players, rankings, start/sit, injuries, waivers, and analysis live here.",
        href: "/news",
        id: "shell:news:wire",
        kind: "blog",
        timestamp: "now",
        title: "Rumbledore News online",
      },
      {
        detail:
          "Use the environment switcher to jump back to leagues or the Arena.",
        href: "/",
        id: "shell:news:switcher",
        kind: "scores",
        read: true,
        timestamp: "scope",
        title: "Environment switcher ready",
      },
    ];
  }

  if (activeState.scope === "arena") {
    return [
      {
        detail:
          "Arena standings and movement notices appear here as aggregate leaderboards refresh.",
        href: "/arena",
        id: "shell:arena:wire",
        kind: "arena",
        timestamp: "now",
        title: "Arena wire online",
      },
      {
        detail:
          "League-vs-league views expose aggregate ranks only, never raw slips.",
        href: "/arena/rules",
        id: "shell:arena:rules",
        kind: "arena",
        read: true,
        timestamp: "rules",
        title: "Arena rules available",
      },
    ];
  }

  return [
    {
      detail:
        "League lobby and account notices appear here while News and Arena live as their own environments.",
      href: "/",
      id: "shell:global:arena",
      kind: "arena",
      timestamp: "now",
      title: "Global shell online",
    },
    {
      detail: "Connect another league from the switcher or the account menu.",
      href: "/",
      id: "shell:global:leagues",
      kind: "blog",
      read: true,
      timestamp: "setup",
      title: "Your leagues stay one tap away",
    },
  ];
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function globalHrefForLeagueScope(
  sectionId: GlobalSectionId,
  leagueId: string,
  fallbackHref: string,
): string {
  if (sectionId === "your-leagues") {
    void leagueId;
    return fallbackHref;
  }

  if (sectionId === "you") {
    return `${fallbackHref}?leagueId=${encodeURIComponent(leagueId)}`;
  }

  return fallbackHref;
}

function getNavigationItemsForActiveState(
  activeState: ActiveNavigationState,
): readonly NavigationShellItem[] {
  switch (activeState.scope) {
    case "arena":
      return ARENA_NAVIGATION_SECTIONS;
    case "global":
      return GLOBAL_NAVIGATION_SECTIONS;
    case "league":
      return getLeagueNavigationSections(activeState.leagueId);
    case "news":
      return NEWS_NAVIGATION_SECTIONS;
  }
}

function navigationGroupLabel(scope: ActiveNavigationState["scope"]): string {
  switch (scope) {
    case "arena":
      return "Arena";
    case "global":
      return "Global";
    case "league":
      return "League";
    case "news":
      return "News";
  }
}

function wireAriaLabel(scope: ActiveNavigationState["scope"]): string {
  switch (scope) {
    case "arena":
      return "Arena wire";
    case "global":
      return "Global wire";
    case "league":
      return "League wire";
    case "news":
      return "News wire";
  }
}

function scopeAvatarLabel(scope: ActiveNavigationState["scope"]): string {
  switch (scope) {
    case "arena":
      return "AR";
    case "global":
      return "RL";
    case "league":
      return "L";
    case "news":
      return "NW";
  }
}

function ScopeAvatar({
  activeLeague,
  activeState,
}: {
  readonly activeLeague: LeagueSwitcherViewItem | null;
  readonly activeState: ActiveNavigationState;
}) {
  if (!activeLeague) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-elevated text-xs font-semibold text-muted-foreground">
        {scopeAvatarLabel(activeState.scope)}
      </span>
    );
  }

  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-elevated text-xs font-semibold text-muted-foreground">
      {activeLeague.logo ? (
        <span
          aria-hidden="true"
          className="size-full bg-cover bg-center"
          style={{
            backgroundImage: `url(${JSON.stringify(activeLeague.logo)})`,
          }}
        />
      ) : (
        getLeagueAvatarFallback(activeLeague.name)
      )}
    </span>
  );
}

function scopeDisplayName(
  activeState: ActiveNavigationState,
  activeLeague: LeagueSwitcherViewItem | null,
): string {
  switch (activeState.scope) {
    case "arena":
      return "Central Arena";
    case "global":
      return "Your Leagues";
    case "league":
      return activeLeague?.name ?? "League";
    case "news":
      return "Rumbledore News";
  }
}

function buildBreadcrumbItems(
  activeState: ActiveNavigationState,
  activeLeague: LeagueSwitcherViewItem | null,
): readonly BreadcrumbItem[] {
  if (activeState.scope === "global") {
    const section = GLOBAL_NAVIGATION_SECTIONS.find(
      (candidate) => candidate.id === activeState.sectionId,
    );
    if (!section || section.id === "your-leagues") {
      return [{ current: true, href: "/", label: "Your Leagues" }];
    }

    return [
      { href: "/", label: "Your Leagues" },
      { current: true, href: section.href, label: section.label },
    ];
  }

  if (activeState.scope === "news") {
    const section = NEWS_NAVIGATION_SECTIONS.find(
      (candidate) => candidate.id === activeState.sectionId,
    );
    if (!section || section.id === "front") {
      return [{ current: true, href: "/news", label: "Rumbledore News" }];
    }

    return [
      { href: "/news", label: "Rumbledore News" },
      {
        current: true,
        href: getNewsSectionHref(section.id),
        label: section.label,
      },
    ];
  }

  if (activeState.scope === "arena") {
    const section = ARENA_NAVIGATION_SECTIONS.find(
      (candidate) => candidate.id === activeState.sectionId,
    );
    if (!section || section.id === "leaderboard") {
      return [{ current: true, href: "/arena", label: "Central Arena" }];
    }

    return [
      { href: "/arena", label: "Central Arena" },
      {
        current: true,
        href: getArenaSectionHref(section.id),
        label: section.label,
      },
    ];
  }

  const leagueLabel = activeLeague?.name ?? "League";
  const leagueHref = getLeagueSectionHref(activeState.leagueId, "home");
  const activeLeagueShellSectionId = leagueShellSectionId(
    activeState.sectionId,
  );
  const section = LEAGUE_NAVIGATION_SECTIONS.find(
    (candidate) => candidate.id === activeLeagueShellSectionId,
  );

  if (!section || section.id === "home") {
    return [{ current: true, href: leagueHref, label: leagueLabel }];
  }

  return [
    { href: leagueHref, label: leagueLabel },
    {
      current: true,
      href: getLeagueSectionHref(activeState.leagueId, section.id),
      label: section.label,
    },
  ];
}

function buildCommandItems(
  activeState: ActiveNavigationState,
  leagues: readonly LeagueSwitcherViewItem[],
): readonly CommandPaletteItem[] {
  const globalItems = GLOBAL_NAVIGATION_SECTIONS.map((section) => ({
    group: "Global",
    href:
      activeState.scope === "league"
        ? globalHrefForLeagueScope(
            section.id,
            activeState.leagueId,
            section.href,
          )
        : section.href,
    icon: iconFor(section.icon),
    id: `global-${section.id}`,
    keywords: [section.id],
    label: section.label,
  }));

  const newsItems = NEWS_NAVIGATION_SECTIONS.map((section) => ({
    group: "News",
    href: section.href,
    icon: iconFor(section.icon),
    id: `news-${section.id}`,
    keywords: ["news", section.id],
    label: section.id === "front" ? "Rumbledore News" : section.label,
  }));

  const arenaItems = ARENA_NAVIGATION_SECTIONS.map((section) => ({
    group: "Arena",
    href: section.href,
    icon: iconFor(section.icon),
    id: `arena-${section.id}`,
    keywords: ["arena", section.id],
    label: section.id === "leaderboard" ? "Arena Leaderboard" : section.label,
  }));

  const leagueSectionItems =
    activeState.scope === "league"
      ? getLeagueNavigationSections(activeState.leagueId).map((section) => ({
          group: "League",
          href: section.href,
          icon: iconFor(section.icon),
          id: `league-section-${section.id}`,
          keywords: [section.id],
          label: section.label,
        }))
      : [];

  const leagueItems = leagues.map((league) => ({
    description: league.providerLabel,
    group: "Leagues",
    href: getLeagueSwitchHref(league.leagueId, activeState),
    icon: (
      <span aria-hidden="true" className="font-mono text-xs">
        {getLeagueAvatarFallback(league.name)}
      </span>
    ),
    id: `league-${league.leagueId}`,
    keywords: [league.provider, league.providerLabel],
    label: league.name,
  }));

  const connectItems = LEAGUE_SWITCHER_CONNECT_LINKS.map((link) => ({
    description: "Connect another league",
    group: "Actions",
    href: link.href,
    icon: <Ticket aria-hidden="true" />,
    id: `connect-${link.provider}`,
    keywords: [link.provider, "connect", "onboarding"],
    label: `Connect ${link.label}`,
  }));

  return [
    ...globalItems,
    ...newsItems,
    ...arenaItems,
    ...leagueSectionItems,
    ...leagueItems,
    ...connectItems,
  ];
}

function iconFor(icon: NavigationIconName): ReactNode {
  const Icon = NAVIGATION_ICON_COMPONENTS[icon];
  return <Icon aria-hidden="true" />;
}
