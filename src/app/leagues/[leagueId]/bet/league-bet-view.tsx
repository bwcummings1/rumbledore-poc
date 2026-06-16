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
import { type FormEvent, useMemo, useState } from "react";
import type {
  LeagueBetData,
  LeagueBetMarket,
  LeagueBetSelection,
} from "@/betting";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Stepper } from "@/components/ui/stepper";
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
  balanceCents,
  onClear,
  onPlaceSlip,
  onRemoveSelection,
  onStakeChange,
  placementState,
  selections,
  stakeInput,
}: {
  balanceCents: number | null;
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
    !isSubmittingPlacement(placementState);

  function submitSlip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit && stakeCents !== null) {
      onPlaceSlip(stakeCents);
    }
  }

  return (
    <form
      className="rounded-card border border-border bg-card p-4"
      onSubmit={submitSlip}
    >
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
                Locked from {formatDateTime(selection.capturedAt)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No prices selected.</p>
        )}
      </div>

      <div className="mt-4 grid gap-3 border-border border-t pt-4">
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
        <div className="grid gap-2 rounded-control border border-border bg-muted/25 px-3 py-2 text-sm">
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
          <output
            className={cn(
              "text-sm",
              placementState.status === "success"
                ? "text-primary"
                : "text-destructive",
            )}
          >
            {placementState.message}
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
  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">
            This week's bankroll
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {balanceCents === null ? "No open week" : formatCents(balanceCents)}
          </h2>
        </div>
        <WalletCards className="size-5 text-primary" aria-hidden="true" />
      </div>
      {balance ? (
        <div className="mt-3 grid gap-3">
          <p className="text-sm text-muted-foreground">
            Floor {formatCents(balance.floorCents)} · week{" "}
            {formatDateTime(balance.weekStart)} to{" "}
            {formatDateTime(balance.weekEnd)}
          </p>
          <div className="grid gap-2 rounded-control border border-border bg-muted/25 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Already at risk</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatCents(balance.openExposureCents)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Open upside</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatCents(balance.openPotentialReturnCents)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Best-case balance</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatCents(
                  (balanceCents ?? balance.balanceCents) +
                    balance.openPotentialReturnCents,
                )}
              </span>
            </div>
          </div>
          <div className="grid gap-2 text-sm">
            <p className="text-muted-foreground">
              {bankrollOpeningCopy(balance)}
            </p>
            <p className="text-muted-foreground">
              Finish above the floor and that balance carries forward; finish at
              or below the floor and next week opens at the floor.
            </p>
            {balance.resetCreditCents > 0 ? (
              <p className="font-medium text-primary">
                Reset credit: {formatCents(balance.resetCreditCents)}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Your first placed slip opens this betting week at the{" "}
          {formatCents(balanceCents ?? 0)} floor.
        </p>
      )}
    </div>
  );
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
  const router = useRouter();
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

  function toggleSelection(
    market: LeagueBetMarket,
    selection: LeagueBetSelection,
  ) {
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
    router.refresh();
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
        <BankrollLoopCard balance={data.balance} balanceCents={balanceCents} />

        <StagedSlipPanel
          balanceCents={balanceCents}
          onClear={() => {
            setStagedSelections({});
            setPlacementState({ message: null, status: "idle" });
          }}
          onPlaceSlip={placeSlip}
          onRemoveSelection={(marketId) => {
            setStagedSelections((current) => {
              const next = { ...current };
              delete next[marketId];
              return next;
            });
            setPlacementState({ message: null, status: "idle" });
          }}
          onStakeChange={(value) => {
            setStakeInput(value);
            setPlacementState({ message: null, status: "idle" });
          }}
          placementState={placementState}
          selections={stagedSelectionList}
          stakeInput={stakeInput}
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
              href={`/arena?leagueId=${encodeURIComponent(data.league.id)}`}
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
