"use client";

import {
  ArrowLeft,
  ReceiptText,
  Ticket,
  Trash2,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  LeagueBetData,
  LeagueBetMarket,
  LeagueBetSelection,
} from "@/betting";
import { Banner } from "@/components/ui/banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Stepper } from "@/components/ui/stepper";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Toaster } from "@/components/ui/toaster";
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

type PlaceSlipState =
  | { readonly message: string | null; readonly status: "idle" }
  | { readonly message: string | null; readonly status: "submitting" }
  | { readonly message: string; readonly status: "success" }
  | { readonly message: string; readonly status: "error" };

type PlaceSlipResponse = {
  readonly balanceCents: number | null;
};

let fallbackIdempotencyCounter = 0;

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

function decimalOddsFromAmerican(price: number): number {
  return price > 0 ? 1 + price / 100 : 1 + 100 / Math.abs(price);
}

function formatDecimalOdds(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value)}x`;
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

function formatStakeInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatSelectionCount(count: number): string {
  return `${count} selection${count === 1 ? "" : "s"}`;
}

function parseStakeCents(value: string): number | null {
  const normalized = value.trim().replaceAll("$", "").replaceAll(",", "");
  if (!normalized) {
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const [dollars = "0", cents = ""] = normalized.split(".");
  const parsedDollars = Number(dollars);
  const parsedCents = Number(cents.padEnd(2, "0"));
  if (
    !Number.isSafeInteger(parsedDollars) ||
    !Number.isSafeInteger(parsedCents)
  ) {
    return null;
  }
  return parsedDollars * 100 + parsedCents;
}

function generateIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackIdempotencyCounter += 1;
  return `${Date.now()}-${fallbackIdempotencyCounter}`;
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
        "cell grid min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left text-sm transition-[border-color,background-color,box-shadow,color]",
        isSelected
          ? "border-primary bg-primary/15 text-foreground shadow-[0_0_16px_var(--glow-lilac),var(--bevel)]"
          : "hover:border-primary/50 hover:bg-primary/10",
        disabled &&
          "cursor-not-allowed border-input opacity-55 hover:border-input hover:bg-[var(--panel)] hover:shadow-[var(--bevel)]",
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
  isOffline,
  market,
  onToggleSelection,
  stagedSelection,
}: {
  isOffline: boolean;
  market: LeagueBetMarket;
  onToggleSelection: (
    market: LeagueBetMarket,
    selection: LeagueBetSelection,
  ) => void;
  stagedSelection: StagedSelection | undefined;
}) {
  const isBettable = bettable(market);
  const isDisabled = !isBettable || isOffline;
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
        <StatusPill tone={isBettable && !isOffline ? "live" : "neutral"}>
          {isOffline ? "Read-only" : isBettable ? "Open" : "Locked"}
        </StatusPill>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {market.selections.map((selection) => (
          <SelectionButton
            disabled={isDisabled}
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
  isOffline,
  onToggleSelection,
  stagedSelections,
}: {
  group: EventGroup;
  isOffline: boolean;
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
    <article className="panel p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <StatusPill tone={eventStatusTone(group.eventStatus)}>
            {group.eventStatus.replaceAll("_", " ")}
          </StatusPill>
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
            isOffline={isOffline}
            key={market.marketId}
            market={market}
            onToggleSelection={onToggleSelection}
            stagedSelection={stagedSelections[market.marketId]}
          />
        ))}
      </div>

      {playerProps.length > 0 ? (
        <details className="mt-4 rounded-control border border-border bg-[var(--panel)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            More markets · {playerProps.length} player prop
            {playerProps.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-3 grid gap-0">
            {playerProps.map((market) => (
              <MarketRow
                isOffline={isOffline}
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
  balanceCents,
  embedded = false,
  isOffline,
  onClear,
  onPlaceSlip,
  onRemoveSelection,
  onStakeChange,
  placementState,
  selections,
  stakeInput,
}: {
  balanceCents: number | null;
  embedded?: boolean;
  isOffline: boolean;
  onClear: () => void;
  onPlaceSlip: (stakeCents: number) => void;
  onRemoveSelection: (marketId: string) => void;
  onStakeChange: (value: string) => void;
  placementState: PlaceSlipState;
  selections: readonly StagedSelection[];
  stakeInput: string;
}) {
  const kind =
    selections.length === 0
      ? "Empty"
      : selections.length === 1
        ? "Single"
        : "Parlay";
  const stakeCents = parseStakeCents(stakeInput);
  const stakeDollars = stakeCents === null ? null : stakeCents / 100;
  const maxStakeDollars = balanceCents === null ? 0 : balanceCents / 100;
  const combinedDecimalOdds = selections.reduce(
    (combined, selection) =>
      combined * decimalOddsFromAmerican(selection.price),
    1,
  );
  const potentialPayoutCents =
    stakeCents && selections.length > 0
      ? Math.round(stakeCents * combinedDecimalOdds)
      : null;
  const stakeError = stakeValidationMessage({
    balanceCents,
    selections,
    stakeCents,
    stakeInput,
  });
  const canSubmit =
    selections.length > 0 &&
    stakeCents !== null &&
    stakeCents > 0 &&
    balanceCents !== null &&
    stakeCents <= balanceCents &&
    !isOffline &&
    !isSubmittingPlacement(placementState);

  function submitSlip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit && stakeCents !== null) {
      onPlaceSlip(stakeCents);
    }
  }

  return (
    <form
      aria-label="Parlay Console"
      className={cn(embedded ? "grid gap-4" : "panel grid gap-4 p-4")}
      onSubmit={submitSlip}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Parlay Console</p>
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
      <div aria-live="polite" className="grid gap-2">
        {selections.length > 0 ? (
          selections.map((selection) => (
            <div
              className="cell grid gap-1 px-3 py-2 text-sm"
              key={`${selection.marketId}-${selection.selection}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <span className="min-w-0 truncate font-medium">
                  {selection.selectionLabel}
                  {selection.lineLabel ? ` ${selection.lineLabel}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono font-semibold tabular-nums">
                    {formatAmericanOdds(selection.price)}
                  </span>
                  <button
                    aria-label={`Remove ${selection.selectionLabel}`}
                    className={cn(
                      buttonVariants({ size: "icon-sm", variant: "ghost" }),
                    )}
                    onClick={() => onRemoveSelection(selection.marketId)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {selection.marketLabel} · {selection.matchup}
              </p>
              <p className="text-xs text-muted-foreground">
                Locked at {formatAmericanOdds(selection.price)} from{" "}
                {formatDateTime(selection.capturedAt)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No prices selected.</p>
        )}
      </div>

      <div className="grid gap-3 border-border border-t pt-4">
        {isOffline ? (
          <Banner title="Board offline" tone="warn">
            Can't place while offline. Cached markets stay visible for review.
          </Banner>
        ) : null}
        <Field
          controlId="stake"
          error={stakeError ?? undefined}
          label="Stake amount"
        >
          {({ controlProps }) => (
            <Stepper
              {...controlProps}
              allowOutOfRange={true}
              disabled={balanceCents === null}
              format={{ currency: "USD", style: "currency" }}
              max={maxStakeDollars}
              min={0}
              money={true}
              onValueChange={(value) =>
                onStakeChange(value === null ? "" : value.toFixed(2))
              }
              smallStep={0.25}
              step={1}
              value={stakeDollars}
            />
          )}
        </Field>
        {balanceCents !== null && balanceCents > 0 ? (
          <Slider
            aria-label="Stake amount slider"
            max={maxStakeDollars}
            min={0}
            onValueChange={(value) =>
              onStakeChange(
                (Array.isArray(value) ? value[0] : value).toFixed(2),
              )
            }
            step={1}
            value={stakeDollars ?? 0}
            valueLabel={(values) => formatCents(Math.round(values[0] * 100))}
          />
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: "1/4",
              value: balanceCents ? Math.floor(balanceCents / 4) : 0,
            },
            {
              label: "1/2",
              value: balanceCents ? Math.floor(balanceCents / 2) : 0,
            },
            { label: "Max", value: balanceCents ?? 0 },
          ].map((chip) => (
            <Chip
              disabled={balanceCents === null || chip.value <= 0}
              key={chip.label}
              onClick={() => onStakeChange(formatStakeInput(chip.value))}
            >
              {chip.label}
            </Chip>
          ))}
        </div>
        <div className="cell grid gap-2 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Slip odds</span>
            <span className="font-mono font-semibold tabular-nums">
              {selections.length > 0
                ? formatDecimalOdds(combinedDecimalOdds)
                : "-"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Potential payout</span>
            <span className="font-mono font-semibold tabular-nums">
              {potentialPayoutCents === null
                ? "-"
                : formatCents(potentialPayoutCents)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Available</span>
            <span className="font-mono font-semibold tabular-nums">
              {balanceCents === null
                ? "No open week"
                : formatCents(balanceCents)}
            </span>
          </div>
        </div>
        {placementState.message ? (
          <output aria-live="polite">
            <Banner
              title={
                placementState.status === "success"
                  ? "Slip placed"
                  : placementBannerTitle(placementState.message)
              }
              tone={placementState.status === "success" ? "ok" : "danger"}
            >
              {placementState.message}
            </Banner>
          </output>
        ) : null}
        <Button
          block={true}
          disabled={!canSubmit}
          loading={isSubmittingPlacement(placementState)}
          type="submit"
        >
          <Ticket data-icon="inline-start" />
          Place {selections.length <= 1 ? "single" : "parlay"}
        </Button>
      </div>
    </form>
  );
}

function isSubmittingPlacement(state: PlaceSlipState): boolean {
  return state.status.startsWith("submitting");
}

function bankrollOpeningCopy(
  balance: NonNullable<LeagueBetData["balance"]>,
): string {
  switch (balance.openingKind) {
    case "carryover":
      return `This week carried ${formatCents(balance.weekOpenEntryCents)} forward from last week's close.`;
    case "floor_open":
      return balance.previousWeekClosingBalanceCents === null
        ? `This week opened at the ${formatCents(balance.floorCents)} floor.`
        : `This week opened at the floor after last week closed at ${formatCents(balance.previousWeekClosingBalanceCents)}.`;
    case "fresh_floor":
      return `This week opened at the ${formatCents(balance.floorCents)} floor.`;
    case "reset_to_floor": {
      const close = balance.previousWeekClosingBalanceCents;
      const carry = balance.weekOpenEntryCents;
      if (Number.isSafeInteger(close)) {
        return `Last week closed at ${formatCents(close as number)}. The ledger carried ${formatCents(carry)} and credited ${formatCents(balance.resetCreditCents)} back to the floor.`;
      }
      return `The ledger credited ${formatCents(balance.resetCreditCents)} to restore the weekly floor.`;
    }
  }
}

function BankrollLoopCard({
  balance,
  balanceCents,
}: {
  balance: LeagueBetData["balance"];
  balanceCents: number | null;
}) {
  const displayBalance = balanceCents ?? balance?.balanceCents ?? 0;
  const floorCents = balance?.floorCents ?? displayBalance;
  const gaugeMax = Math.max(floorCents * 2, displayBalance, 1);
  const closingBalanceCopy = Number.isFinite(balance?.closingBalanceCents)
    ? `Closed at ${formatCents(balance?.closingBalanceCents as number)}.`
    : null;

  return (
    <section className="panel grid gap-4 p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-warning">Rolling bankroll</p>
              <h2 className="mt-1 text-lg font-semibold">
                This week's bankroll
              </h2>
            </div>
            <WalletCards className="size-5 text-warning" aria-hidden="true" />
          </div>
          <div>
            <p className="lcd text-4xl font-bold sm:text-5xl">
              {balanceCents === null
                ? "No open week"
                : formatCents(displayBalance)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Floor {formatCents(floorCents)}
              {balance ? (
                <>
                  {" "}
                  · week {formatDateTime(balance.weekStart)} to{" "}
                  {formatDateTime(balance.weekEnd)}
                </>
              ) : null}
            </p>
          </div>
          <Progress
            label="Bankroll versus weekly floor"
            max={gaugeMax}
            showValue={true}
            tone="amber"
            value={displayBalance}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            caption={
              balance
                ? `${balance.pendingSlipCount} pending slip${balance.pendingSlipCount === 1 ? "" : "s"}`
                : "No active week yet"
            }
            label="Already at risk"
            tone="amber"
            value={formatCents(balance?.openExposureCents ?? 0)}
          />
          <StatTile
            caption="Gross return if every open slip hits"
            label="Open upside"
            tone="lilac"
            value={formatCents(balance?.openPotentialReturnCents ?? 0)}
          />
          <StatTile
            caption="Current balance plus open potential return"
            label="Best-case balance"
            tone="amber"
            value={formatCents(
              displayBalance + (balance?.openPotentialReturnCents ?? 0),
            )}
          />
        </div>
      </div>
      {balance ? (
        <div className="grid gap-2 text-sm">
          <p className="text-muted-foreground">
            {bankrollOpeningCopy(balance)}
          </p>
          <p className="text-muted-foreground">
            Finish above the floor and that balance carries forward; finish at
            or below the floor and next week opens at the floor.
          </p>
          {balance.resetCreditCents > 0 ? (
            <p className="font-medium text-warning">
              Reset credit: {formatCents(balance.resetCreditCents)}
            </p>
          ) : null}
          {closingBalanceCopy ? (
            <p className="text-muted-foreground">{closingBalanceCopy}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Your first placed slip opens this betting week at the{" "}
          {formatCents(displayBalance)} floor.
        </p>
      )}
    </section>
  );
}

function RecentSlipsPanel({
  recentSlips,
}: {
  recentSlips: readonly LeagueBetData["recentSlips"][number][];
}) {
  const openSlips = recentSlips.filter((slip) => slip.status === "pending");
  const settledSlips = recentSlips.filter((slip) => slip.status !== "pending");

  return (
    <section
      className="panel grid gap-4 p-4"
      aria-label="Open bets and history"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Slip ledger</p>
          <h2 className="mt-1 text-lg font-semibold">Recent slips</h2>
        </div>
        <ReceiptText className="size-5 text-primary" aria-hidden="true" />
      </div>
      <Tabs
        defaultValue="open"
        items={[
          {
            label: `Open bets (${openSlips.length})`,
            panel:
              openSlips.length > 0 ? (
                <SlipRows slips={openSlips} />
              ) : (
                <EmptyState title="No pending slips.">
                  Selected prices appear in the Parlay Console before you place.
                </EmptyState>
              ),
            value: "open",
          },
          {
            label: `History (${settledSlips.length})`,
            panel:
              settledSlips.length > 0 ? (
                <SlipRows slips={settledSlips} />
              ) : (
                <EmptyState title="No settled slips yet.">
                  Settled outcomes will land here after final scoring.
                </EmptyState>
              ),
            value: "history",
          },
        ]}
        listLabel="Bet slip ledger"
      />
    </section>
  );
}

function SlipRows({
  slips,
}: {
  slips: readonly LeagueBetData["recentSlips"][number][];
}) {
  return (
    <div className="grid gap-2">
      {slips.map((slip) => (
        <div
          className="cell grid gap-3 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
          key={slip.id}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={slipStatusTone(slip.status)}>
                {slip.status.replaceAll("_", " ")}
              </StatusPill>
              <p className="min-w-0 truncate">
                {slip.kind} · {slip.status} · {formatDateTime(slip.placedAt)}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Locked slip details stay fixed after placement.
            </p>
          </div>
          <div className="grid gap-1 text-right max-sm:text-left">
            <span className="font-mono font-semibold tabular-nums">
              Stake {formatCents(slip.stakeCents)}
            </span>
            <span className="text-xs text-muted-foreground">
              Potential {formatCents(slip.potentialPayoutCents)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function eventStatusTone(status: LeagueBetMarket["eventStatus"]): StatusTone {
  switch (status) {
    case "in_progress":
      return "live";
    case "scheduled":
      return "info";
    case "final":
      return "success";
    case "postponed":
      return "warning";
    case "canceled":
      return "danger";
  }
}

function slipStatusTone(
  status: LeagueBetData["recentSlips"][number]["status"],
): StatusTone {
  switch (status) {
    case "pending":
      return "live";
    case "won":
      return "success";
    case "lost":
      return "danger";
    case "partial_void":
    case "push":
    case "void":
      return "warning";
  }
}

function placementBannerTitle(message: string): string {
  if (message.startsWith("Line moved")) {
    return "Line moved";
  }
  if (message.startsWith("Stake exceeds")) {
    return "Insufficient bankroll";
  }
  if (message.includes("no longer open")) {
    return "Market closed";
  }
  return "Slip not placed";
}

function stakeValidationMessage({
  balanceCents,
  selections,
  stakeCents,
  stakeInput,
}: {
  balanceCents: number | null;
  selections: readonly StagedSelection[];
  stakeCents: number | null;
  stakeInput: string;
}): string | null {
  if (selections.length === 0) {
    return null;
  }
  if (balanceCents === null) {
    return "A bankroll week could not be opened.";
  }
  if (!stakeInput.trim()) {
    return null;
  }
  if (stakeCents === null) {
    return "Enter a stake in dollars and cents.";
  }
  if (stakeCents <= 0) {
    return "Stake must be more than $0.";
  }
  if (stakeCents > balanceCents) {
    return `Stake exceeds your ${formatCents(balanceCents)} balance.`;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function placementErrorMessage(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return "Slip could not be placed. Try again.";
  }
  const code = payload.error.code;
  switch (code) {
    case "BET_ODDS_STALE":
      return "Line moved. Re-confirm the current price before placing.";
    case "BET_INSUFFICIENT_FUNDS":
      return "Stake exceeds your current bankroll balance.";
    case "BET_MARKET_CLOSED":
      return "That market is no longer open for betting.";
    case "BANKROLL_WEEK_NOT_FOUND":
      return "Bankroll week could not be opened. Refresh and try again.";
    default:
      return typeof payload.error.message === "string"
        ? payload.error.message
        : "Slip could not be placed. Try again.";
  }
}

function placementErrorCode(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return null;
  }
  return typeof payload.error.code === "string" ? payload.error.code : null;
}

function parsePlaceSlipResponse(payload: unknown): PlaceSlipResponse {
  if (!isRecord(payload)) {
    return { balanceCents: null };
  }
  return {
    balanceCents:
      typeof payload.balanceCents === "number" ? payload.balanceCents : null,
  };
}

export function LeagueBetView({ data }: { data: LeagueBetData }) {
  return (
    <Toaster>
      <LeagueBetViewContent data={data} />
    </Toaster>
  );
}

function LeagueBetViewContent({ data }: { readonly data: LeagueBetData }) {
  const router = useRouter();
  const { notify } = useToast();
  const [stagedSelections, setStagedSelections] = useState<
    Record<string, StagedSelection>
  >({});
  const [stakeInput, setStakeInput] = useState("");
  const [balanceOverrideCents, setBalanceOverrideCents] = useState<
    number | null
  >(null);
  const [placementState, setPlacementState] = useState<PlaceSlipState>({
    message: null,
    status: "idle",
  });
  const [isOffline, setIsOffline] = useState(false);
  const balanceCents =
    balanceOverrideCents ??
    data.balance?.balanceCents ??
    data.firstBetFloorCents;
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

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOffline(
        typeof navigator !== "undefined" && navigator.onLine === false,
      );
    }

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  function clearSelections() {
    setStagedSelections({});
    setPlacementState({ message: null, status: "idle" });
  }

  function removeSelection(marketId: string) {
    setStagedSelections((current) => {
      const next = { ...current };
      delete next[marketId];
      return next;
    });
    setPlacementState({ message: null, status: "idle" });
  }

  function changeStake(value: string) {
    setStakeInput(value);
    setPlacementState({ message: null, status: "idle" });
  }

  function toggleSelection(
    market: LeagueBetMarket,
    selection: LeagueBetSelection,
  ) {
    if (isOffline) {
      return;
    }
    setPlacementState({ message: null, status: "idle" });
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

  async function placeSlip(stakeCents: number) {
    const selections = stagedSelectionList;
    if (selections.length === 0) {
      return;
    }

    setPlacementState({ message: null, status: "submitting" });
    let response: Response;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
    try {
      response = await fetch(`/api/leagues/${data.league.id}/bet/slips`, {
        body: JSON.stringify({
          idempotencyKey: generateIdempotencyKey(),
          kind: selections.length === 1 ? "single" : "parlay",
          legs: selections.map((selection) => ({
            oddsSnapshotId: selection.snapshotId,
            selection: selection.selection,
          })),
          stakeCents,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
    } catch (error) {
      setPlacementState({
        message:
          error instanceof DOMException && error.name === "AbortError"
            ? "Slip placement timed out. Try again."
            : "Slip could not be placed. Check your connection.",
        status: "error",
      });
      return;
    } finally {
      window.clearTimeout(timeoutId);
    }
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = placementErrorCode(payload);
      setPlacementState({
        message: placementErrorMessage(payload),
        status: "error",
      });
      if (code === "BET_ODDS_STALE" || code === "BET_MARKET_CLOSED") {
        router.refresh();
      }
      return;
    }

    const parsed = parsePlaceSlipResponse(payload);
    if (parsed.balanceCents !== null) {
      setBalanceOverrideCents(parsed.balanceCents);
    }
    setStagedSelections({});
    setStakeInput("");
    setPlacementState({
      message: "Slip placed. Odds are locked.",
      status: "success",
    });
    notify({
      description:
        "The stake was debited once and the selected odds are locked.",
      title: "Slip placed",
      tone: "ok",
    });
    router.refresh();
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-7xl gap-6 px-4 py-5 pb-[calc(var(--space-20)+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-8">
      <header className="panel grid gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/leagues/${data.league.id}`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "ghost" }),
            )}
          >
            <ArrowLeft data-icon="inline-start" />
            League home
          </Link>
          <StatusPill tone={isOffline ? "warning" : "live"}>
            {isOffline ? "Offline" : "Board live"}
          </StatusPill>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-primary">
              <Ticket className="size-5" aria-hidden="true" />
              <p className="eyebrow">Sportsbook</p>
              <StatusPill tone="neutral" variant="outline">
                {data.league.providerLabel} · {data.league.season}
              </StatusPill>
            </div>
            <h1 className="mt-2 text-xl font-semibold sm:text-2xl">
              {data.league.name} betting desk
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Paper bankroll, licensed odds feeds, and league-scoped slips.
              Arena standings roll up from these play-money outcomes.
            </p>
          </div>
          <Link
            href={`/arena?leagueId=${encodeURIComponent(data.league.id)}`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "outline" }),
            )}
          >
            Arena standings
          </Link>
        </div>
      </header>

      {isOffline ? (
        <Banner title="Offline mode" tone="warn">
          Markets and bankroll can be reviewed from cached data, but placement
          is disabled until the connection returns.
        </Banner>
      ) : null}

      <BankrollLoopCard balance={data.balance} balanceCents={balanceCents} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <section aria-label="Open betting markets" className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-primary">Market board</p>
              <h2 className="mt-1 text-lg font-semibold">Open markets</h2>
            </div>
            <StatusPill tone="info">
              {eventGroups.length} event{eventGroups.length === 1 ? "" : "s"}
            </StatusPill>
          </div>
          {eventGroups.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {eventGroups.map((group) => (
                <EventCard
                  group={group}
                  isOffline={isOffline}
                  key={group.eventId}
                  onToggleSelection={toggleSelection}
                  stagedSelections={stagedSelections}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No open markets">
              The odds polling job has not published an open NFL board yet.
            </EmptyState>
          )}
        </section>

        <aside
          aria-label="Parlay Console"
          className="hidden self-start lg:sticky lg:top-24 lg:block"
        >
          <StagedSlipPanel
            balanceCents={balanceCents}
            isOffline={isOffline}
            onClear={clearSelections}
            onPlaceSlip={placeSlip}
            onRemoveSelection={removeSelection}
            onStakeChange={changeStake}
            placementState={placementState}
            selections={stagedSelectionList}
            stakeInput={stakeInput}
          />
        </aside>
      </div>

      <RecentSlipsPanel recentSlips={data.recentSlips} />

      <Sheet
        description="Selections stay locked to the snapshot you tapped."
        title="Parlay Console"
        trigger={
          <Button
            aria-label={`Open Parlay Console slip with ${formatSelectionCount(stagedSelectionList.length)}`}
            className="fixed right-4 bottom-[calc(var(--space-16)+env(safe-area-inset-bottom))] z-30 shadow-overlay lg:hidden"
            type="button"
            variant="amber"
          >
            <Ticket data-icon="inline-start" />
            Slip ({stagedSelectionList.length})
          </Button>
        }
      >
        <StagedSlipPanel
          balanceCents={balanceCents}
          embedded={true}
          isOffline={isOffline}
          onClear={clearSelections}
          onPlaceSlip={placeSlip}
          onRemoveSelection={removeSelection}
          onStakeChange={changeStake}
          placementState={placementState}
          selections={stagedSelectionList}
          stakeInput={stakeInput}
        />
      </Sheet>
    </main>
  );
}
