"use client";

import {
  BookOpen,
  ChevronDown,
  Home,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Ticket,
  Trophy,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getLeagueAvatarFallback,
  type LeagueSwitcherViewItem,
  sortLeagueSwitcherItems,
} from "./league-switcher-model";
import { LeagueSwitcherView } from "./league-switcher-view";
import {
  type ActiveNavigationState,
  GLOBAL_NAVIGATION_SECTIONS,
  getLeagueNavigationSections,
  type NavigationIconName,
} from "./scope";
import { useActiveNavigationState } from "./use-active-navigation-state";

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
  newspaper: Newspaper,
  "scroll-text": ScrollText,
  ticket: Ticket,
  trophy: Trophy,
  user: User,
  users: Users,
} satisfies Record<NavigationIconName, typeof Home>;

const EMPTY_NAVIGATION_ITEMS: readonly LeagueSwitcherViewItem[] = [];

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
  const [desktopSwitcherOpen, setDesktopSwitcherOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
  const pathname = activeState.pathname;

  useEffect(() => {
    if (pathname.length === 0) {
      return;
    }

    setDesktopSwitcherOpen(false);
    setMobileSwitcherOpen(false);
  }, [pathname]);

  return (
    <div data-slot="navigation-shell" className="min-h-dvh">
      <DesktopSidebar
        activeLeague={activeLeague}
        activeState={activeState}
        collapsed={sidebarCollapsed}
        currentNavItems={currentNavItems}
        desktopSwitcherOpen={desktopSwitcherOpen}
        items={sortedItems}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onToggleSwitcher={() => setDesktopSwitcherOpen((value) => !value)}
      />

      <MobileTopBar
        activeLeague={activeLeague}
        activeState={activeState}
        onOpenSwitcher={() => setMobileSwitcherOpen(true)}
      />

      <div
        className={cn(
          "min-h-dvh pt-14 pb-[calc(4.5rem+env(safe-area-inset-bottom))] transition-[padding-left] duration-200 ease-out md:pt-0 md:pb-0",
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
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar md:flex",
        sidebarWidth,
      )}
      data-collapsed={collapsed ? "true" : "false"}
      data-slot="desktop-sidebar"
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-sidebar-border px-3">
        <Link
          href="/"
          className={cn(
            "min-w-0 font-semibold tracking-tight text-sidebar-foreground",
            collapsed ? "sr-only" : "truncate",
          )}
        >
          Rumbledore
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

        <div className="relative border-y border-sidebar-border py-3">
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
                  <span className="block truncate text-xs text-muted-foreground">
                    League switcher
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

function MobileTopBar({
  activeLeague,
  activeState,
  onOpenSwitcher,
}: {
  readonly activeLeague: LeagueSwitcherViewItem | null;
  readonly activeState: ActiveNavigationState;
  readonly onOpenSwitcher: () => void;
}) {
  return (
    <header
      className="fixed inset-x-0 top-0 z-30 flex min-h-14 items-center border-b border-border bg-background/95 px-3 pt-safe backdrop-blur md:hidden"
      data-slot="mobile-top-bar"
    >
      <Button
        aria-label="Open scope switcher"
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
            <span className="mt-0.5 inline-flex rounded-sm border border-border px-1.5 py-0.5 text-[0.75rem] leading-none text-muted-foreground">
              {activeLeague.providerLabel}
            </span>
          ) : null}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Button>
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
      className="fixed inset-x-0 bottom-0 z-30 grid min-h-16 grid-cols-[repeat(var(--nav-count),minmax(0,1fr))] border-t border-border bg-background/95 px-1 pb-safe backdrop-blur md:hidden"
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
    activeState.scope === "league" &&
    item.scope === "global" &&
    item.id === "news"
      ? `/news?leagueId=${encodeURIComponent(activeState.leagueId)}`
      : item.href;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        isActive && "bg-primary/10 text-foreground",
        compact ? "md:size-11 md:px-0" : "md:justify-start",
      )}
      href={href}
      title={compact ? item.label : undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className={cn("truncate", compact && "md:sr-only")}>
        {item.label}
      </span>
    </Link>
  );
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
