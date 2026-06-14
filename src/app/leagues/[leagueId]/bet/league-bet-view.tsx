"use client";

import {
  ArrowLeft,
  ReceiptText,
  Ticket,
  Trash2,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  LeagueBetData,
  LeagueBetMarket,
  LeagueBetSelection,
} from "@/betting";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EventGroup = {
  readonly awayTeam: string;
  readonly eventId: string;
  readonly eventStatus: LeagueBetMarket["eventStatus"];
  readonly homeTeam: string;
  readonly markets: LeagueBetMarket[];
  readonly startTime: string;
};

type StagedSelection = {
  readonly capturedAt: string;
  readonly eventId: string;
  readonly line: number | null;
  readonly lineLabel: string | null;
  readonly marketId: string;
  readonly marketLabel: string;
  readonly matchup: string;
  readonly price: number;
  readonly selection: LeagueBetSelection["selection"];
  readonly selectionLabel: string;
  readonly snapshotId: string;
};

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function formatAmericanOdds(price: number): string {
  return price > 0 ? `+${price}` : String(price);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatLine(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatSignedLine(value: number): string {
  return value > 0 ? `+${formatLine(value)}` : formatLine(value);
}

function marketTypeLabel(type: LeagueBetMarket["marketType"]): string {
  switch (type) {
    case "moneyline":
      return "Moneyline";
    case "spread":
      return "Spread";
    case "total":
      return "Total";
    case "player_prop":
      return "Player prop";
  }
}

function propTypeLabel(propType: string | null): string {
  if (!propType) {
    return "player prop";
  }
  return propType.replaceAll("_", " ");
}

function marketSubtitle(market: LeagueBetMarket): string {
  switch (market.marketType) {
    case "moneyline":
      return "Game winner";
    case "spread":
      return market.line === null
        ? "Handicap"
        : `Home line ${formatSignedLine(market.line)}`;
    case "total":
      return market.line === null
        ? "Game total"
        : `Total ${formatLine(market.line)}`;
    case "player_prop":
      return `${market.subjectLabel} · ${propTypeLabel(market.propType)}`;
  }
}

function selectionLineLabel(
  market: LeagueBetMarket,
  selection: Pick<LeagueBetSelection, "line">,
): string | null {
  if (selection.line === null) {
    return null;
  }
  return market.marketType === "spread"
    ? formatSignedLine(selection.line)
    : formatLine(selection.line);
}

function groupMarkets(markets: readonly LeagueBetMarket[]): EventGroup[] {
  const byEvent = new Map<string, EventGroup>();
  for (const market of markets) {
    const existing = byEvent.get(market.eventId);
    if (existing) {
      existing.markets.push(market);
      continue;
    }
    byEvent.set(market.eventId, {
      awayTeam: market.awayTeam,
      eventId: market.eventId,
      eventStatus: market.eventStatus,
      homeTeam: market.homeTeam,
      markets: [market],
      startTime: market.startTime,
    });
  }
  return [...byEvent.values()].map((group) => ({
    ...group,
    markets: [...group.markets].sort(compareMarkets),
  }));
}

function compareMarkets(left: LeagueBetMarket, right: LeagueBetMarket): number {
  return (
    marketOrder(left.marketType) - marketOrder(right.marketType) ||
    left.subjectLabel.localeCompare(right.subjectLabel) ||
    left.marketId.localeCompare(right.marketId)
  );
}

function marketOrder(type: LeagueBetMarket["marketType"]): number {
  switch (type) {
    case "moneyline":
      return 0;
    case "spread":
      return 1;
    case "total":
      return 2;
    case "player_prop":
      return 3;
  }
}

function bettable(market: LeagueBetMarket): boolean {
  return (
    market.marketStatus === "open" &&
    (market.eventStatus === "scheduled" || market.eventStatus === "in_progress")
  );
}

function stagedSelectionFrom(
  market: LeagueBetMarket,
  selection: LeagueBetSelection,
): StagedSelection {
  return {
    capturedAt: market.capturedAt,
    eventId: market.eventId,
    line: selection.line,
    lineLabel: selectionLineLabel(market, selection),
    marketId: market.marketId,
    marketLabel: marketTypeLabel(market.marketType),
    matchup: `${market.awayTeam} at ${market.homeTeam}`,
    price: selection.price,
    selection: selection.selection,
    selectionLabel: selection.label,
    snapshotId: market.snapshotId,
  };
}

function SelectionButton({
  disabled,
  isSelected,
  market,
  onSelect,
  selection,
}: {
  disabled: boolean;
  isSelected: boolean;
  market: LeagueBetMarket;
  onSelect: () => void;
  selection: LeagueBetSelection;
}) {
  const line = selectionLineLabel(market, selection);
  return (
    <button
      aria-label={[
        selection.label,
        line,
        formatAmericanOdds(selection.price),
        "locked price",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={isSelected}
      className={cn(
        "grid min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-control border px-3 py-2 text-left text-sm transition-colors",
        isSelected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-muted",
        disabled && "cursor-not-allowed opacity-55 hover:bg-background",
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{selection.label}</span>
        {line ? <span className="block text-xs opacity-75">{line}</span> : null}
      </span>
      <span className="font-mono font-semibold tabular-nums">
        {formatAmericanOdds(selection.price)}
      </span>
    </button>
  );
}

function MarketRow({
  market,
  onToggleSelection,
  stagedSelection,
}: {
  market: LeagueBetMarket;
  onToggleSelection: (
    market: LeagueBetMarket,
    selection: LeagueBetSelection,
  ) => void;
  stagedSelection: StagedSelection | undefined;
}) {
  const isBettable = bettable(market);
  return (
    <div className="grid gap-3 border-border border-t py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {marketTypeLabel(market.marketType)}
          </h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {marketSubtitle(market)} · captured{" "}
            {formatDateTime(market.capturedAt)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-control border px-2 py-1 text-xs font-medium",
            isBettable
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {isBettable ? "Open" : "Locked"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {market.selections.map((selection) => (
          <SelectionButton
            disabled={!isBettable}
            isSelected={stagedSelection?.selection === selection.selection}
            key={`${market.snapshotId}-${selection.selection}`}
            market={market}
            onSelect={() => onToggleSelection(market, selection)}
            selection={selection}
          />
        ))}
      </div>
    </div>
  );
}

function EventCard({
  group,
  onToggleSelection,
  stagedSelections,
}: {
  group: EventGroup;
  onToggleSelection: (
    market: LeagueBetMarket,
    selection: LeagueBetSelection,
  ) => void;
  stagedSelections: Readonly<Record<string, StagedSelection>>;
}) {
  const standardMarkets = group.markets.filter(
    (market) => market.marketType !== "player_prop",
  );
  const playerProps = group.markets.filter(
    (market) => market.marketType === "player_prop",
  );

  return (
    <article className="rounded-card border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary">
            {group.eventStatus.replaceAll("_", " ")}
          </p>
          <h2 className="mt-1 text-base font-semibold">
            {group.awayTeam} at {group.homeTeam}
          </h2>
        </div>
        <time
          className="shrink-0 text-xs text-muted-foreground"
          dateTime={group.startTime}
        >
          {formatDateTime(group.startTime)}
        </time>
      </div>

      <div className="grid gap-0">
        {standardMarkets.map((market) => (
          <MarketRow
            key={market.marketId}
            market={market}
            onToggleSelection={onToggleSelection}
            stagedSelection={stagedSelections[market.marketId]}
          />
        ))}
      </div>

      {playerProps.length > 0 ? (
        <details className="mt-4 rounded-control border border-border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            More markets · {playerProps.length} player prop
            {playerProps.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-3 grid gap-0">
            {playerProps.map((market) => (
              <MarketRow
                key={market.marketId}
                market={market}
                onToggleSelection={onToggleSelection}
                stagedSelection={stagedSelections[market.marketId]}
              />
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function StagedSlipPanel({
  onClear,
  selections,
}: {
  onClear: () => void;
  selections: readonly StagedSelection[];
}) {
  const kind =
    selections.length === 0
      ? "Empty"
      : selections.length === 1
        ? "Single"
        : "Parlay";

  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">Picks in slip</p>
          <h2 className="mt-1 text-lg font-semibold">
            {kind} · {selections.length}
          </h2>
        </div>
        {selections.length > 0 ? (
          <button
            aria-label="Clear selected prices"
            className={cn(buttonVariants({ size: "icon", variant: "ghost" }))}
            onClick={onClear}
            type="button"
          >
            <Trash2 aria-hidden="true" />
          </button>
        ) : (
          <Ticket className="size-5 text-primary" aria-hidden="true" />
        )}
      </div>
      <div aria-live="polite" className="mt-3 grid gap-2">
        {selections.length > 0 ? (
          selections.map((selection) => (
            <div
              className="grid gap-1 rounded-control border border-border bg-muted/25 px-3 py-2 text-sm"
              key={`${selection.marketId}-${selection.selection}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <span className="min-w-0 truncate font-medium">
                  {selection.selectionLabel}
                  {selection.lineLabel ? ` ${selection.lineLabel}` : ""}
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatAmericanOdds(selection.price)}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {selection.marketLabel} · {selection.matchup}
              </p>
              <p className="text-xs text-muted-foreground">
                Locked from {formatDateTime(selection.capturedAt)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No prices selected.</p>
        )}
      </div>
    </div>
  );
}

export function LeagueBetView({ data }: { data: LeagueBetData }) {
  const [stagedSelections, setStagedSelections] = useState<
    Record<string, StagedSelection>
  >({});
  const eventGroups = useMemo(() => groupMarkets(data.markets), [data.markets]);
  const stagedSelectionList = useMemo(
    () =>
      data.markets
        .map((market) => stagedSelections[market.marketId])
        .filter(
          (selection): selection is StagedSelection => selection !== undefined,
        ),
    [data.markets, stagedSelections],
  );

  function toggleSelection(
    market: LeagueBetMarket,
    selection: LeagueBetSelection,
  ) {
    setStagedSelections((current) => {
      const existing = current[market.marketId];
      const next = { ...current };
      if (existing?.selection === selection.selection) {
        delete next[market.marketId];
        return next;
      }
      next[market.marketId] = stagedSelectionFrom(market, selection);
      return next;
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <Link
          href={`/leagues/${data.league.id}`}
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          League home
        </Link>
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Ticket className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">Bet</p>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold sm:text-2xl">
              {data.league.name} betting desk
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Paper odds, fake bankroll, real bragging rights. Arena standings
              roll up from these league-scoped slips.
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-card border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">Bankroll</p>
              <h2 className="mt-1 text-lg font-semibold">
                {data.balance
                  ? formatCents(data.balance.balanceCents)
                  : "No open week"}
              </h2>
            </div>
            <WalletCards className="size-5 text-primary" aria-hidden="true" />
          </div>
          {data.balance ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Floor {formatCents(data.balance.floorCents)} · week{" "}
              {formatDateTime(data.balance.weekStart)} to{" "}
              {formatDateTime(data.balance.weekEnd)}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              The first placed slip opens the rolling-minimum week for this
              league member.
            </p>
          )}
        </div>

        <StagedSlipPanel
          onClear={() => setStagedSelections({})}
          selections={stagedSelectionList}
        />

        <div className="rounded-card border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">Recent slips</p>
              <h2 className="mt-1 text-lg font-semibold">
                {data.recentSlips.length}
              </h2>
            </div>
            <ReceiptText className="size-5 text-primary" aria-hidden="true" />
          </div>
          {data.recentSlips.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {data.recentSlips.map((slip) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-control border border-border bg-muted/25 px-3 py-2 text-sm"
                  key={slip.id}
                >
                  <span className="min-w-0 truncate">
                    {slip.kind} · {slip.status} ·{" "}
                    {formatDateTime(slip.placedAt)}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatCents(slip.stakeCents)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No slips have been placed in this league yet.
            </p>
          )}
        </div>
      </section>

      {eventGroups.length > 0 ? (
        <section aria-label="Open betting markets" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Open markets</h2>
            <Link
              href="/arena"
              className={cn(
                buttonVariants({ className: "w-fit", variant: "outline" }),
              )}
            >
              Arena
            </Link>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {eventGroups.map((group) => (
              <EventCard
                group={group}
                key={group.eventId}
                onToggleSelection={toggleSelection}
                stagedSelections={stagedSelections}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold">No open markets</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The odds polling job has not published an open NFL board yet.
          </p>
        </section>
      )}
    </main>
  );
}
