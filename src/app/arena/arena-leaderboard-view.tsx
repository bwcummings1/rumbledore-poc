import { ArrowLeft, Trophy, Users } from "lucide-react";
import Link from "next/link";
import type { ArenaLeaderboardData, ArenaLeaderboardRow } from "@/betting";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArenaRealtimeRefresh } from "@/realtime/client";

function formatPaperMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
    style: "currency",
  }).format(value / 100);
}

function formatPercentBps(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
    signDisplay: "exceptZero",
    style: "percent",
  }).format(value / 10_000);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function metricColor(value: number): string {
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-muted-foreground";
}

function LeaderboardSection({
  emptyText,
  netLabel,
  rows,
  title,
}: {
  emptyText: string;
  netLabel: string;
  rows: ArenaLeaderboardRow[];
  title: string;
}) {
  return (
    <section className="rounded-card border border-border bg-card">
      <div className="flex items-center justify-between gap-3 p-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Trophy className="size-5 text-primary" aria-hidden="true" />
      </div>
      {rows.length > 0 ? (
        <>
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_5.75rem_4.75rem] gap-2 px-3 pb-2 text-xs font-medium text-muted-foreground sm:grid-cols-[2.75rem_minmax(0,1fr)_6.5rem_5.5rem_5.5rem]">
            <span>#</span>
            <span>Name</span>
            <span className="text-right">{netLabel}</span>
            <span className="text-right">ROI</span>
            <span className="hidden text-right sm:block">Win rate</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid min-h-16 grid-cols-[2.75rem_minmax(0,1fr)_5.75rem_4.75rem] items-center gap-2 border-border border-t px-3 py-2 text-sm sm:grid-cols-[2.75rem_minmax(0,1fr)_6.5rem_5.5rem_5.5rem]"
            >
              <p className="font-mono text-muted-foreground tabular-nums">
                {row.rank}
              </p>
              <div className="min-w-0">
                <p className="truncate font-medium">{row.displayName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.wonSlipCount}/{row.settledSlipCount} wins ·{" "}
                  {row.weeksSurvived}/{row.weeksPlayed} weeks
                </p>
              </div>
              <p
                className={cn(
                  "text-right font-mono font-semibold tabular-nums",
                  metricColor(row.netPnlCents),
                )}
              >
                {formatPaperMoney(row.netPnlCents)}
              </p>
              <p
                className={cn(
                  "text-right font-mono tabular-nums",
                  metricColor(row.roiBps),
                )}
              >
                {formatPercentBps(row.roiBps)}
              </p>
              <p className="hidden text-right font-mono text-muted-foreground tabular-nums sm:block">
                {formatPercentBps(row.winRateBps)}
              </p>
            </div>
          ))}
        </>
      ) : (
        <div className="p-4 pt-0">
          <p className="rounded-control border border-dashed border-border bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
            {emptyText}
          </p>
        </div>
      )}
    </section>
  );
}

export function ArenaLeaderboardView({ data }: { data: ArenaLeaderboardData }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <ArenaRealtimeRefresh />
      <header className="grid gap-4">
        <Link
          href="/"
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          Home
        </Link>
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Users className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">Central arena</p>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Paper betting standings
            </h1>
            {data.season ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {data.season.name} · {formatDate(data.season.startsAt)}-
                {formatDate(data.season.endsAt)}
                {data.computedAt
                  ? ` · Updated ${formatTimestamp(data.computedAt)}`
                  : ""}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No arena season has been created yet.
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6">
        <LeaderboardSection
          emptyText="No league standings have been materialized yet."
          netLabel="Avg P&L"
          rows={data.leagueStandings}
          title="League leaderboard"
        />
        <LeaderboardSection
          emptyText="No individual standings have been materialized yet."
          netLabel="Net P&L"
          rows={data.individualStandings}
          title="Individual leaderboard"
        />
      </div>
    </main>
  );
}
