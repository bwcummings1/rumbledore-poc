"use client";

import { Check, Home, ListFilter, Newspaper, Plus, Trophy } from "lucide-react";
import Link from "next/link";
import type { KeyboardEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Presence } from "@/components/ui/presence";
import { SearchInput } from "@/components/ui/search-input";
import { Tag } from "@/components/ui/tag";
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
  readonly presenceByLeagueId?: Readonly<Record<string, number>>;
  readonly showHeader?: boolean;
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
  presenceByLeagueId = {},
  showHeader = true,
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
      className={cn("panel flex w-full flex-col gap-3 p-3", className)}
      data-slot="league-switcher"
      onKeyDown={handleSwitcherListKeyDown}
    >
      {showHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Scope</p>
            <h2 className="truncate font-display text-base font-semibold text-foreground">
              Switch environments
            </h2>
          </div>
          <GroupToggle
            groupByProvider={groupByProvider}
            onToggle={() => setGroupByProvider((value) => !value)}
          />
        </div>
      ) : (
        <div className="flex justify-end">
          <GroupToggle
            groupByProvider={groupByProvider}
            onToggle={() => setGroupByProvider((value) => !value)}
          />
        </div>
      )}

      <EnvironmentScopeRows activeState={activeState} />

      <SearchInput
        aria-label="Search leagues"
        onChange={(event) => setQuery(event.currentTarget.value)}
        onClear={() => setQuery("")}
        placeholder="Search leagues"
        value={query}
      />

      <div className="flex flex-col gap-2">
        {visibleItems.length === 0 && query.length > 0 ? (
          <p className="cell border-dashed px-3 py-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : groupByProvider ? (
          groupedItems.map((group) => (
            <section
              aria-label={`${group.providerLabel} leagues`}
              className="flex flex-col gap-1.5"
              key={group.provider}
            >
              <h3 className="eyebrow px-1">{group.providerLabel}</h3>
              {group.items.map((item) => (
                <LeagueSwitcherRow
                  activeState={activeState}
                  item={item}
                  key={item.leagueId}
                  onlineMemberCount={presenceByLeagueId[item.leagueId]}
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
              onlineMemberCount={presenceByLeagueId[item.leagueId]}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--hair)] pt-3">
        <div>
          <p className="eyebrow mb-2 px-1">Connect another league</p>
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

function GroupToggle({
  groupByProvider,
  onToggle,
}: {
  readonly groupByProvider: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <Button
      aria-pressed={groupByProvider}
      onClick={onToggle}
      type="button"
      variant={groupByProvider ? "primary" : "outline"}
    >
      <ListFilter data-icon="inline-start" />
      Group
    </Button>
  );
}

function EnvironmentScopeRows({
  activeState,
}: {
  readonly activeState: ActiveNavigationState;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Environment scopes</legend>
      <EnvironmentScopeRow
        active={activeState.scope === "global"}
        description="Cross-league lobby"
        href="/"
        icon={<Home aria-hidden="true" className="size-4" />}
        label="Your Leagues"
        tag="Global scope"
      />
      <EnvironmentScopeRow
        active={activeState.scope === "news"}
        description="NFL and fantasy sections"
        href="/news"
        icon={<Newspaper aria-hidden="true" className="size-4" />}
        label="Rumbledore News"
        tag="News environment"
      />
      <EnvironmentScopeRow
        active={activeState.scope === "arena"}
        description="League-vs-league board"
        href="/arena"
        icon={<Trophy aria-hidden="true" className="size-4" />}
        label="Central Arena"
        tag="Arena environment"
      />
    </fieldset>
  );
}

function EnvironmentScopeRow({
  active,
  description,
  href,
  icon,
  label,
  tag,
}: {
  readonly active: boolean;
  readonly description: string;
  readonly href: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly tag: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={`${label}, ${tag}`}
      className={cn(
        switcherRowClasses,
        "border-[var(--hair-2)] bg-primary/10",
        active &&
          "border-primary/50 shadow-[inset_3px_0_0_var(--primary),0_0_18px_var(--glow-lilac),var(--bevel)]",
      )}
      data-switcher-option="true"
      href={href}
    >
      <span className="chip-glyph size-10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm font-semibold text-foreground">
          {label}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <Tag className="min-h-5 px-1.5 py-0 text-xs">{tag}</Tag>
          <span className="truncate text-xs text-muted-foreground">
            {description}
          </span>
        </span>
      </span>
      {active ? (
        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
      ) : null}
    </Link>
  );
}

function LeagueSwitcherRow({
  activeState,
  item,
  onlineMemberCount,
}: {
  readonly activeState: ActiveNavigationState;
  readonly item: LeagueSwitcherViewItem;
  readonly onlineMemberCount?: number;
}) {
  const isActive =
    activeState.scope === "league" && activeState.leagueId === item.leagueId;
  const presenceLabel =
    typeof onlineMemberCount === "number"
      ? `${onlineMemberCount} member${onlineMemberCount === 1 ? "" : "s"} online`
      : undefined;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        switcherRowClasses,
        isActive &&
          "border-primary/50 bg-primary/10 shadow-[inset_3px_0_0_var(--primary),0_0_18px_var(--glow-lilac),var(--bevel)]",
      )}
      data-switcher-option="true"
      href={getLeagueSwitchHref(item.leagueId, activeState)}
    >
      <span className="chip-glyph size-10 overflow-hidden text-xs font-semibold">
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
        <span className="block truncate font-display text-sm font-semibold text-foreground">
          {item.name}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <Tag className="min-h-5 px-1.5 py-0 text-xs">
            {item.providerLabel}
          </Tag>
          {presenceLabel ? (
            <Presence
              className="min-h-5"
              label={presenceLabel}
              status={
                onlineMemberCount && onlineMemberCount > 0
                  ? "online"
                  : "offline"
              }
              withText
            />
          ) : null}
        </span>
      </span>
      {isActive ? (
        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
      ) : null}
    </Link>
  );
}

const switcherRowClasses =
  "cell flex min-h-14 items-center gap-3 px-3 py-2 text-left transition-[background-color,border-color,box-shadow,color] hover:border-[var(--hair-3)] hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)] focus-visible:outline-none";

function handleSwitcherListKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowUp" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const root = target.closest('[data-slot="league-switcher"]');
  if (!root) {
    return;
  }

  const options = Array.from(
    root.querySelectorAll<HTMLElement>('[data-switcher-option="true"]'),
  );
  if (options.length === 0) {
    return;
  }

  const currentIndex = options.indexOf(target);
  const fallbackIndex =
    event.key === "ArrowUp" || event.key === "End" ? options.length - 1 : 0;
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : currentIndex < 0
          ? fallbackIndex
          : event.key === "ArrowDown"
            ? (currentIndex + 1) % options.length
            : (currentIndex - 1 + options.length) % options.length;

  event.preventDefault();
  options[nextIndex]?.focus();
}
