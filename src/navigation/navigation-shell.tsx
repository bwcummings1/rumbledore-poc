"use client";

import {
  Bell,
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Clock3,
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
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/ui/command-palette";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import {
  getLeagueAvatarFallback,
  LEAGUE_SWITCHER_CONNECT_LINKS,
  type LeagueSwitcherViewItem,
  sortLeagueSwitcherItems,
} from "./league-switcher-model";
import { LeagueSwitcherView } from "./league-switcher-view";
import {
  type ActiveNavigationState,
  GLOBAL_NAVIGATION_SECTIONS,
  type GlobalSectionId,
  getLeagueNavigationSections,
  getLeagueSectionHref,
  getLeagueSwitchHref,
  LEAGUE_NAVIGATION_SECTIONS,
  type NavigationIconName,
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
  | ReturnType<typeof getLeagueNavigationSections>[number];

const NAVIGATION_SHELL_HIDDEN_SEGMENTS = new Set([
  "_next",
  "api",
  "favicon.ico",
  "invite",
  "offline",
  "onboarding",
]);

const NAVIGATION_ICON_COMPONENTS = {
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
const MOTION_STORAGE_KEY = "rumbledore:motion";

type ShellNotificationKind = "arena" | "blog" | "lore" | "scores";
type ShellMotionMode = "auto" | "off";
type ShellWireItemKind =
  | "bet"
  | "cast"
  | "lore"
  | "record"
  | "score"
  | "swing"
  | "system";

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
  const showShell = shouldShowNavigationShell(activeState.pathname);

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
          console.error("Failed to load navigation leagues", error);
        }
      }
    }

    void loadItems();

    return () => {
      controller.abort();
    };
  }, [showShell]);

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
  const [readNotificationIds, setReadNotificationIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const sortedItems = useMemo(() => sortLeagueSwitcherItems(items), [items]);
  const activeLeague =
    activeState.scope === "league"
      ? (sortedItems.find((item) => item.leagueId === activeState.leagueId) ??
        null)
      : null;
  const currentNavItems: readonly NavigationShellItem[] =
    activeState.scope === "league"
      ? getLeagueNavigationSections(activeState.leagueId)
      : GLOBAL_NAVIGATION_SECTIONS;
  const commandItems = useMemo(
    () => buildCommandItems(activeState, sortedItems),
    [activeState, sortedItems],
  );
  const motionMode: ShellMotionMode = motionOff ? "off" : "auto";
  const wireItems = useMemo(
    () => buildWireItems(activeState, activeLeague),
    [activeState, activeLeague],
  );
  const shellNotifications = useMemo(
    () =>
      buildShellNotifications(activeState, activeLeague).map(
        (notification) => ({
          ...notification,
          read:
            notification.read === true ||
            readNotificationIds.has(notification.id),
        }),
      ),
    [activeState, activeLeague, readNotificationIds],
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
      <DesktopSidebar
        activeLeague={activeLeague}
        activeState={activeState}
        collapsed={sidebarCollapsed}
        currentNavItems={currentNavItems}
        desktopSwitcherOpen={desktopSwitcherOpen}
        items={sortedItems}
        onToggleCollapsed={toggleSidebarCollapsed}
        onToggleSwitcher={() => setDesktopSwitcherOpen((value) => !value)}
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
        unreadNotificationCount={unreadNotificationCount}
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
        unreadNotificationCount={unreadNotificationCount}
      />

      <ShellWire
        activeState={activeState}
        collapsed={sidebarCollapsed}
        items={wireItems}
        motion={motionMode}
        onOpenWire={() => setWireSheetOpen(true)}
      />

      <div
        id="rumbledore-main-content"
        className={cn(
          "min-h-dvh pt-[8rem] pb-[calc(4.5rem+env(safe-area-inset-bottom))] transition-[padding-left] duration-base ease-out md:pt-[8rem] md:pb-0",
          sidebarCollapsed ? "md:pl-[4.5rem]" : "md:pl-72",
        )}
      >
        {children}
      </div>

      <MobileBottomTabs
        activeState={activeState}
        currentNavItems={currentNavItems}
      />

      {mobileSwitcherOpen ? (
        <MobileSwitcherSheet
          activeState={activeState}
          items={sortedItems}
          onClose={() => setMobileSwitcherOpen(false)}
        />
      ) : null}

      <WireSheet
        items={wireItems}
        motion={motionMode}
        onOpenChange={setWireSheetOpen}
        open={wireSheetOpen}
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
}: {
  readonly activeLeague: LeagueSwitcherViewItem | null;
  readonly activeState: ActiveNavigationState;
  readonly collapsed: boolean;
  readonly currentNavItems: readonly NavigationShellItem[];
  readonly desktopSwitcherOpen: boolean;
  readonly items: readonly LeagueSwitcherViewItem[];
  readonly onToggleCollapsed: () => void;
  readonly onToggleSwitcher: () => void;
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
            "flex min-w-0 items-center gap-2 rounded-control text-sidebar-foreground outline-none transition-colors hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]",
            collapsed ? "justify-center" : "truncate",
          )}
        >
          <span className="chip-glyph size-8 text-xs">R</span>
          <span
            className={cn(
              "heading-auspex truncate text-sm text-foreground",
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
          items={GLOBAL_NAVIGATION_SECTIONS}
          label="Global"
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
              <LeagueSwitcherView activeState={activeState} items={items} />
            </div>
          ) : null}
        </div>

        {activeState.scope === "league" ? (
          <NavigationSection
            activeState={activeState}
            collapsed={collapsed}
            items={currentNavItems}
            label="League"
          />
        ) : null}
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
  unreadNotificationCount,
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
  readonly unreadNotificationCount: number;
}) {
  return (
    <header
      className={cn(
        "fixed top-0 right-0 z-20 hidden h-14 items-center gap-3 border-b border-[var(--hair)] bg-[var(--panel)] px-4 shadow-raised backdrop-blur-xl md:flex motion-reduce:backdrop-blur-none",
        collapsed ? "left-[4.5rem]" : "left-72",
      )}
      data-slot="desktop-top-bar"
    >
      <ShellBreadcrumbs
        className="flex-1"
        items={buildBreadcrumbItems(activeState, activeLeague)}
      />
      <Button
        aria-label="Open command palette"
        className="max-lg:size-10 max-lg:min-w-10 max-lg:px-0"
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
      <NotificationsMenu
        notifications={notifications}
        onMarkAllRead={onMarkAllNotificationsRead}
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
  unreadNotificationCount,
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
  readonly unreadNotificationCount: number;
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
            <span className="mt-0.5 inline-flex rounded-sm border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
              {activeLeague.providerLabel}
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
      <NotificationsMenu
        notifications={notifications}
        onMarkAllRead={onMarkAllNotificationsRead}
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
      className="fixed inset-x-0 bottom-0 z-30 grid min-h-16 grid-cols-[repeat(var(--nav-count),minmax(0,1fr))] border-t border-[var(--hair)] bg-[var(--panel-solid)]/95 px-1 pb-safe shadow-overlay backdrop-blur md:hidden motion-reduce:backdrop-blur-none"
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
}: {
  readonly activeState: ActiveNavigationState;
  readonly items: readonly LeagueSwitcherViewItem[];
  readonly onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        aria-label="Close scope switcher"
        className="absolute inset-0 bg-background/70"
        onClick={onClose}
        type="button"
      />
      <div
        aria-label="Scope switcher"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-sheet border border-border bg-background p-3 pb-[calc(--spacing(3)+env(safe-area-inset-bottom))] shadow-xl"
        data-slot="mobile-switcher-sheet"
        role="dialog"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Scope
            </p>
            <h2 className="text-base font-semibold tracking-tight">
              Switch leagues
            </h2>
          </div>
          <Button
            aria-label="Close scope switcher"
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
        <LeagueSwitcherView activeState={activeState} items={items} />
      </div>
    </div>
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
          "px-2 text-xs font-medium text-muted-foreground uppercase",
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
  const isActive =
    activeState.scope === item.scope && activeState.sectionId === item.id;
  const Icon = NAVIGATION_ICON_COMPONENTS[item.icon];
  const href =
    activeState.scope === "league" && item.scope === "global"
      ? globalHrefForLeagueScope(item.id, activeState.leagueId, item.href)
      : item.href;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center justify-center gap-2 rounded-control px-2 font-display text-xs font-semibold text-muted-foreground transition-[background-color,color,box-shadow,transform] hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none md:text-sm",
        isActive &&
          "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_var(--hair),0_0_18px_var(--glow-lilac)]",
        compact ? "md:size-11 md:px-0" : "md:justify-start",
      )}
      href={href}
      title={compact ? item.label : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-transparent",
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
}: {
  readonly activeState: ActiveNavigationState;
  readonly collapsed: boolean;
  readonly items: readonly ShellWireItem[];
  readonly motion: ShellMotionMode;
  readonly onOpenWire: () => void;
}) {
  const status = items.length > 0 ? "live" : "empty";
  const variant = wireVariantForScope(activeState.scope);
  const mobileItems = items.map(({ href: _href, ...item }) => item);

  return (
    <div
      className={cn(
        "fixed top-14 right-0 z-20 px-2 py-2 md:px-4",
        collapsed ? "md:left-[4.5rem]" : "md:left-72",
      )}
      data-slot="shell-wire"
    >
      <div className="mx-auto max-w-7xl">
        <ShellWireTicker
          aria-label={
            activeState.scope === "league" ? "League wire" : "Global wire"
          }
          className="hidden md:grid"
          items={items}
          motion={motion}
          status={status}
          variant={variant}
        />
        <button
          aria-label="Open The Wire"
          className="block w-full text-left outline-none focus-visible:shadow-[var(--focus-ring-shadow)] md:hidden"
          onClick={onOpenWire}
          type="button"
        >
          <ShellWireTicker
            aria-label={
              activeState.scope === "league" ? "League wire" : "Global wire"
            }
            className="pointer-events-none"
            items={mobileItems}
            motion="off"
            status={status}
            variant={variant}
          />
        </button>
      </div>
    </div>
  );
}

function WireSheet({
  items,
  motion,
  onOpenChange,
  open,
}: {
  readonly items: readonly ShellWireItem[];
  readonly motion: ShellMotionMode;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        aria-label="Close The Wire"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm motion-reduce:backdrop-blur-none"
        onClick={() => onOpenChange(false)}
        type="button"
      />
      <section
        aria-label="The Wire"
        aria-modal="true"
        className="panel absolute inset-x-0 bottom-0 grid max-h-[85dvh] gap-3 overflow-y-auto rounded-b-none rounded-t-sheet border-x-0 border-b-0 p-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))] shadow-overlay"
        data-slot="wire-sheet"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Live strip</p>
            <h2 className="font-display text-base font-semibold text-foreground">
              The Wire
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Recent league and arena signals, newest first.
            </p>
          </div>
          <Button
            aria-label="Close The Wire"
            onClick={() => onOpenChange(false)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>
        <ShellWireTicker
          aria-label="The Wire"
          expanded
          items={items}
          motion={motion}
          status="live"
          variant="live"
        />
      </section>
    </div>
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
  readonly status: "empty" | "live";
  readonly variant: "digest" | "live";
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "auspex-wire panel grid gap-2 overflow-hidden p-2",
        variant === "live"
          ? "border-primary/40 bg-primary/10 shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]"
          : "border-input bg-[var(--panel)]",
        className,
      )}
      data-expanded={expanded ? "true" : undefined}
      data-motion={motion}
      data-slot="wire-ticker"
      data-state={status}
      data-variant={variant}
    >
      <div className="flex min-h-8 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <ScrollText aria-hidden="true" className="size-4 text-primary" />
          <span className="eyebrow text-foreground">WIRE</span>
          <output
            aria-label={status === "live" ? "live" : "quiet"}
            className={cn(
              "inline-flex items-center gap-1.5",
              motion === "off" && "motion-reduce:animate-none",
            )}
            data-motion={motion}
            data-slot="live-pulse"
          >
            <span
              aria-hidden="true"
              className={cn(
                "auspex-live-dot inline-flex size-2.5 shrink-0 rounded-full ring-2 ring-background",
                status === "live"
                  ? "bg-primary shadow-[0_0_14px_var(--glow-lilac)]"
                  : "bg-muted-foreground",
              )}
              data-status={status === "live" ? "live" : "static"}
            />
            <span className="sr-only">
              {status === "live" ? "live" : "quiet"}
            </span>
          </output>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-control border border-input bg-[var(--panel)] px-3 py-2 text-sm text-muted-foreground">
          The wire is quiet.
        </p>
      ) : (
        <>
          <div className="auspex-wire__viewport" data-slot="wire-marquee">
            <ul className="auspex-wire__track gap-2">
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
          <ul
            className="auspex-wire__static-list gap-2"
            data-slot="wire-static-list"
          >
            {items.map((item) => (
              <ShellWireTickerItem item={item} key={`static-${item.id}`} />
            ))}
          </ul>
        </>
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
      className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-control border border-input bg-[var(--panel)] px-3 text-sm"
      data-kind={kind}
      data-slot="wire-item"
      {...props}
    >
      {item.href ? (
        <a
          className="inline-flex min-h-10 items-center gap-2 text-inherit focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
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

function NotificationsMenu({
  notifications,
  onMarkAllRead,
  unreadCount,
}: {
  readonly notifications: readonly ShellNotification[];
  readonly onMarkAllRead: () => void;
  readonly unreadCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <Button
        aria-expanded={open}
        aria-label="Open notifications"
        className="relative"
        onClick={() => setOpen((value) => !value)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Bell aria-hidden="true" />
        {unreadCount > 0 ? (
          <Badge
            className="absolute -top-1 -right-1"
            label={`${unreadCount} unread notifications`}
            value={unreadCount}
          />
        ) : null}
      </Button>
      {open ? (
        <div
          aria-label="Notifications"
          className="panel fixed inset-x-3 bottom-[calc(var(--space-3)+env(safe-area-inset-bottom))] z-50 grid max-h-[80dvh] gap-3 overflow-y-auto p-3 shadow-overlay md:absolute md:inset-x-auto md:right-0 md:bottom-auto md:top-12 md:w-80"
          data-slot="notifications-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-foreground">
                Notifications
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Live shell notices and recent league activity.
              </p>
            </div>
            <Button
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
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
                    onClick={() => setOpen(false)}
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
            className="inline-flex min-h-10 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
            href="/you"
            onClick={() => setOpen(false)}
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

  return (
    <div className="relative shrink-0">
      <Button
        aria-expanded={open}
        aria-label="Open account menu"
        onClick={() => setOpen((value) => !value)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <CircleUserRound aria-hidden="true" />
      </Button>
      {open ? (
        <div
          aria-label="Account"
          className="panel fixed inset-x-3 bottom-[calc(var(--space-3)+env(safe-area-inset-bottom))] z-50 grid max-h-[82dvh] gap-4 overflow-y-auto p-3 shadow-overlay md:absolute md:inset-x-auto md:right-0 md:bottom-auto md:top-12 md:w-80"
          data-slot="account-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-foreground">
                Account
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {scopeDisplayName(activeState, activeLeague)}
              </p>
            </div>
            <Button
              aria-label="Close account menu"
              onClick={() => setOpen(false)}
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
              className="inline-flex min-h-10 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
              href="/you"
              onClick={() => setOpen(false)}
            >
              <Settings className="size-4" aria-hidden="true" />
              Account and settings
            </Link>
            <Link
              className="inline-flex min-h-10 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
              href="/you"
              onClick={() => setOpen(false)}
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
        aria-label="Disable motion"
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-input bg-[var(--hull-3)] p-0.5 shadow-[var(--bevel)] outline-none transition-[background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)]",
          motionOff && "border-primary bg-primary",
        )}
        onClick={() => onMotionChange(!motionOff)}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "block size-5 rounded-full border border-[var(--line-2)] bg-foreground shadow-raised transition-transform motion-reduce:transition-none",
            motionOff && "translate-x-4",
          )}
        />
      </button>
      <span className="font-display text-xs font-semibold text-muted-foreground uppercase">
        Motion
      </span>
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
  const [time, setTime] = useState(() => formatClock(new Date()));

  useEffect(() => {
    if (motionOff) {
      return;
    }
    const interval = window.setInterval(() => {
      setTime(formatClock(new Date()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [motionOff]);

  return (
    <output
      aria-label={`Local time ${time}`}
      className={cn(
        "lcd min-h-10 items-center gap-2 rounded-control border border-input bg-[var(--panel)] px-3 text-xs",
        className,
      )}
      data-slot="live-clock"
    >
      <Clock3 className="size-3.5" aria-hidden="true" />
      {time}
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
        storedMotion === "off" ||
        document.documentElement.getAttribute("data-motion") === "off";
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
        nextMotionOff ? "off" : "auto",
      );
    } catch {
      // Local storage may be unavailable in private browsing.
    }
  }, []);

  return [motionOff, setMotionOff] as const;
}

function applyShellMotionPreference(motionOff: boolean): void {
  if (typeof document === "undefined") {
    return;
  }
  if (motionOff) {
    document.documentElement.setAttribute("data-motion", "off");
    return;
  }
  document.documentElement.removeAttribute("data-motion");
}

function buildWireItems(
  activeState: ActiveNavigationState,
  activeLeague: LeagueSwitcherViewItem | null,
): readonly ShellWireItem[] {
  if (activeState.scope === "league") {
    const leagueBase = `/leagues/${encodeURIComponent(activeState.leagueId)}`;
    const leagueName = activeLeague?.name ?? "League";

    return [
      {
        fresh: true,
        href: leagueBase,
        id: `scores:${activeState.leagueId}`,
        kind: "score",
        label: `${leagueName} scoreboard ready`,
        meta: "SCORES",
      },
      {
        href: `${leagueBase}/press`,
        id: `press:${activeState.leagueId}`,
        kind: "cast",
        label: "The Press drops appear here",
        meta: "PRESS",
      },
      {
        href: `${leagueBase}/bet`,
        id: `odds:${activeState.leagueId}`,
        kind: "bet",
        label: "Line movement and slips feed the wire",
        meta: "ODDS",
      },
      {
        href: `${leagueBase}/lore`,
        id: `lore:${activeState.leagueId}`,
        kind: "lore",
        label: "Lore votes and canon moments surface live",
        meta: "LORE",
      },
    ];
  }

  return [
    {
      fresh: true,
      href: "/news",
      id: "global:news",
      kind: "cast",
      label: "Central news signals feed the global wire",
      meta: "NEWS",
    },
    {
      href: "/arena",
      id: "global:arena",
      kind: "swing",
      label: "Arena movement spans every league",
      meta: "ARENA",
    },
    {
      href: "/you",
      id: "global:account",
      kind: "system",
      label: "Provider, push, and install controls live under You",
      meta: "ACCOUNT",
    },
  ];
}

function wireVariantForScope(
  scope: ActiveNavigationState["scope"],
): "digest" | "live" {
  switch (scope) {
    case "league":
      return "live";
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

  return [
    {
      detail:
        "Arena standings, central news, and account notices appear here while you move across scopes.",
      href: "/arena",
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
  if (sectionId === "news" || sectionId === "arena") {
    return `${fallbackHref}?leagueId=${encodeURIComponent(leagueId)}`;
  }

  return fallbackHref;
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
        {activeState.scope === "league" ? "L" : "RL"}
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
  if (activeState.scope === "league") {
    return activeLeague?.name ?? "League";
  }

  return "Your Leagues";
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

  const leagueLabel = activeLeague?.name ?? "League";
  const leagueHref = getLeagueSectionHref(activeState.leagueId, "home");
  const section = LEAGUE_NAVIGATION_SECTIONS.find(
    (candidate) => candidate.id === activeState.sectionId,
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
    ...leagueSectionItems,
    ...leagueItems,
    ...connectItems,
  ];
}

function iconFor(icon: NavigationIconName): ReactNode {
  const Icon = NAVIGATION_ICON_COMPONENTS[icon];
  return <Icon aria-hidden="true" />;
}
