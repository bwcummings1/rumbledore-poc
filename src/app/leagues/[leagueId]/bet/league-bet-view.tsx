import { ArrowLeft, ReceiptText, Ticket, WalletCards } from "lucide-react";
import Link from "next/link";
import type { LeagueBetData, LeagueBetMarket } from "@/betting";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

function lineLabel(market: LeagueBetMarket): string | null {
  if (market.line === null) {
    return null;
  }
  return market.marketType === "total"
    ? `Total ${market.line}`
    : `Line ${market.line}`;
}

function MarketCard({ market }: { market: LeagueBetMarket }) {
  return (
    <article className="rounded-card border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-medium text-primary">
          {marketTypeLabel(market.marketType)}
          {lineLabel(market) ? ` · ${lineLabel(market)}` : ""}
        </p>
        <time
          className="shrink-0 text-xs text-muted-foreground"
          dateTime={market.startTime}
        >
          {formatDateTime(market.startTime)}
        </time>
      </div>
      <h2 className="text-base font-semibold tracking-tight">
        {market.awayTeam} at {market.homeTeam}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {market.subject} · {market.period.replaceAll("_", " ")} · captured{" "}
        {formatDateTime(market.capturedAt)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {market.selections.map((selection) => (
          <span
            className="rounded-control border border-border bg-muted/35 px-3 py-2 text-sm"
            key={`${market.snapshotId}-${selection.label}`}
          >
            <span className="text-muted-foreground">{selection.label}</span>{" "}
            <span className="font-mono font-semibold tabular-nums">
              {formatAmericanOdds(selection.price)}
            </span>
          </span>
        ))}
      </div>
    </article>
  );
}

export function LeagueBetView({ data }: { data: LeagueBetData }) {
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
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {data.league.name} betting desk
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Paper odds, fake bankroll, real bragging rights. Arena standings
              roll up from these league-scoped slips.
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)]">
        <div className="rounded-card border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">Bankroll</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">
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

        <div className="rounded-card border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">Recent slips</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">
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

      {data.markets.length > 0 ? (
        <section aria-label="Open betting markets" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Open markets
            </h2>
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
            {data.markets.map((market) => (
              <MarketCard key={market.marketId} market={market} />
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold tracking-tight">
            No open markets
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The odds polling job has not published an open NFL board yet.
          </p>
        </section>
      )}
    </main>
  );
}
