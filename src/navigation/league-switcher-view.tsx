"use client";

import { Check, ListFilter, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import {
  filterLeagueSwitcherItems,
  getLeagueAvatarFallback,
  groupLeagueSwitcherItems,
  LEAGUE_SWITCHER_CONNECT_LINKS,
  type LeagueSwitcherViewItem,
  sortLeagueSwitcherItems,
} from "./league-switcher-model";
import { type ActiveNavigationState, getLeagueSwitchHref } from "./scope";
import { useActiveNavigationState } from "./use-active-navigation-state";

export interface LeagueSwitcherProps {
  readonly className?: string;
  readonly items: readonly LeagueSwitcherViewItem[];
}

export interface LeagueSwitcherViewProps extends LeagueSwitcherProps {
  readonly activeState: ActiveNavigationState;
  readonly emptyMessage?: string;
}

export function LeagueSwitcher({ className, items }: LeagueSwitcherProps) {
  const activeState = useActiveNavigationState();

  return (
    <LeagueSwitcherView
      activeState={activeState}
      className={className}
      items={items}
    />
  );
}

export function LeagueSwitcherView({
  activeState,
  className,
  emptyMessage = "No leagues match that search.",
  items,
}: LeagueSwitcherViewProps) {
  const [query, setQuery] = useState("");
  const [groupByProvider, setGroupByProvider] = useState(false);
  const sortedItems = useMemo(() => sortLeagueSwitcherItems(items), [items]);
  const visibleItems = useMemo(
    () => filterLeagueSwitcherItems(sortedItems, query),
    [query, sortedItems],
  );
  const groupedItems = useMemo(
    () => groupLeagueSwitcherItems(visibleItems),
    [visibleItems],
  );

  return (
    <section
      aria-label="League switcher"
      className={cn(
        "flex w-full flex-col gap-3 rounded-sheet border border-border bg-surface p-3 shadow-sm",
        className,
      )}
      data-slot="league-switcher"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            League switcher
          </p>
          <h2 className="truncate text-base font-semibold tracking-tight">
            All leagues
          </h2>
        </div>
        <Button
          aria-pressed={groupByProvider}
          onClick={() => setGroupByProvider((value) => !value)}
          type="button"
          variant="outline"
        >
          <ListFilter data-icon="inline-start" />
          Group
        </Button>
      </div>

      <SearchInput
        aria-label="Search leagues"
        onChange={(event) => setQuery(event.currentTarget.value)}
        onClear={() => setQuery("")}
        placeholder="Search leagues"
        value={query}
      />

      <div className="flex flex-col gap-2">
        {visibleItems.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : groupByProvider ? (
          groupedItems.map((group) => (
            <section
              aria-label={`${group.providerLabel} leagues`}
              className="flex flex-col gap-1.5"
              key={group.provider}
            >
              <h3 className="px-1 text-xs font-medium text-muted-foreground uppercase">
                {group.providerLabel}
              </h3>
              {group.items.map((item) => (
                <LeagueSwitcherRow
                  activeState={activeState}
                  item={item}
                  key={item.leagueId}
                />
              ))}
            </section>
          ))
        ) : (
          visibleItems.map((item) => (
            <LeagueSwitcherRow
              activeState={activeState}
              item={item}
              key={item.leagueId}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <Link
          className={cn(
            buttonVariants({
              className: "w-full justify-start",
              variant: "ghost",
            }),
          )}
          href="/"
        >
          Your Leagues
        </Link>
        <div>
          <p className="mb-2 px-1 text-xs font-medium text-muted-foreground uppercase">
            Connect another league
          </p>
          <div className="grid grid-cols-3 gap-2">
            {LEAGUE_SWITCHER_CONNECT_LINKS.map((link) => (
              <Link
                className={cn(
                  buttonVariants({
                    className: "min-w-0",
                    size: "sm",
                    variant: "secondary",
                  }),
                )}
                href={link.href}
                key={link.provider}
              >
                <Plus data-icon="inline-start" />
                <span className="truncate">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LeagueSwitcherRow({
  activeState,
  item,
}: {
  readonly activeState: ActiveNavigationState;
  readonly item: LeagueSwitcherViewItem;
}) {
  const isActive =
    activeState.scope === "league" && activeState.leagueId === item.leagueId;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-elevated focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        isActive && "border-primary/40 bg-primary/10",
      )}
      href={getLeagueSwitchHref(item.leagueId, activeState)}
    >
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-elevated text-xs font-semibold text-muted-foreground">
        {item.logo ? (
          <span
            aria-hidden="true"
            className="size-full bg-cover bg-center"
            style={{ backgroundImage: `url(${JSON.stringify(item.logo)})` }}
          />
        ) : (
          getLeagueAvatarFallback(item.name)
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.name}</span>
        <span className="mt-1 inline-flex rounded-sm border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
          {item.providerLabel}
        </span>
      </span>
      {isActive ? (
        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
      ) : null}
    </Link>
  );
}
