import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Minus,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import type {
  ArenaHeadToHead,
  ArenaHeadToHeadLeague,
  ArenaLeaderboardData,
  ArenaLeaderboardRow,
  ArenaLeagueRivalOption,
  ArenaMover,
  ArenaSeasonSummary,
} from "@/betting";
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

function formatPaperAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
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

function arenaHref(input: {
  leagueId?: string | null;
  rivalLeagueId?: string | null;
  seasonId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.seasonId) params.set("seasonId", input.seasonId);
  if (input.leagueId) params.set("leagueId", input.leagueId);
  if (input.rivalLeagueId) params.set("rivalLeagueId", input.rivalLeagueId);
  const query = params.toString();
  return query ? `/arena?${query}` : "/arena";
}

function seasonStatusLabel(status: ArenaSeasonSummary["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "complete":
      return "Final";
    case "upcoming":
      return "Upcoming";
  }
}

function subjectKindLabel(kind: ArenaMover["kind"]): string {
  return kind === "league" ? "League" : "Player";
}

function movementLabel(value: number): string {
  const steps = Math.abs(value);
  if (steps === 0) return "Even";
  return `${value > 0 ? "Up" : "Down"} ${steps}`;
}

function metricColor(value: number): string {
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-muted-foreground";
}

function movementColor(value: number): string {
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-muted-foreground";
}

function comparisonCopy(headToHead: ArenaHeadToHead): string {
  if (headToHead.comparison === "tied") {
    return "Dead even on average paper P&L";
  }

  if (headToHead.comparison === "leading") {
    return `${headToHead.anchor.displayName} leads by ${formatPaperAmount(
      headToHead.marginCents,
    )}`;
  }

  return `${headToHead.rival.displayName} leads by ${formatPaperAmount(
    headToHead.marginCents,
  )}`;
}

function MovementIcon({ value }: { value: number }) {
  if (value > 0) {
    return <ArrowUp className="size-3.5" aria-hidden="true" />;
  }
  if (value < 0) {
    return <ArrowDown className="size-3.5" aria-hidden="true" />;
  }
  return <Minus className="size-3.5" aria-hidden="true" />;
}

function SeasonStrip({
  leagueId,
  rivalLeagueId,
  seasons,
}: {
  leagueId: string | null;
  rivalLeagueId: string | null;
  seasons: ArenaSeasonSummary[];
}) {
  if (seasons.length === 0) return null;

  return (
    <section aria-label="Arena seasons" className="grid gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CalendarDays className="size-4 text-primary" aria-hidden="true" />
        Seasons
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Seasons">
        {seasons.map((season) => (
          <Link
            aria-current={season.isSelected ? "page" : undefined}
            className={cn(
              buttonVariants({
                className:
                  "min-w-36 shrink-0 justify-start px-3 text-left sm:min-w-44",
                size: "sm",
                variant: season.isSelected ? "default" : "outline",
              }),
            )}
            href={arenaHref({
              leagueId,
              rivalLeagueId,
              seasonId: season.id,
            })}
            key={season.id}
          >
            <span className="min-w-0">
              <span className="block truncate">{season.name}</span>
              <span className="block truncate text-xs opacity-80">
                {seasonStatusLabel(season.status)} ·{" "}
                {formatDate(season.startsAt)}-{formatDate(season.endsAt)}
              </span>
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}

function MovementSummary({ fallers, risers }: ArenaLeaderboardData["movers"]) {
  if (risers.length === 0 && fallers.length === 0) {
    return (
      <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
        <h2 className="text-base font-semibold">No rank movement yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The next standings rebuild will compare against this season's prior
          ranks.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-3 sm:grid-cols-2" aria-label="Rank movement">
      <MoverList title="Biggest risers" movers={risers} emptyText="No risers" />
      <MoverList
        title="Biggest fallers"
        movers={fallers}
        emptyText="No fallers"
      />
    </section>
  );
}

function MoverList({
  emptyText,
  movers,
  title,
}: {
  emptyText: string;
  movers: ArenaMover[];
  title: string;
}) {
  return (
    <article className="rounded-card border border-border bg-card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {movers.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {movers.map((mover) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3 border-border border-t pt-2 first:border-t-0 first:pt-0"
              key={`${mover.kind}:${mover.id}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {mover.displayName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {subjectKindLabel(mover.kind)} · #{mover.previousRank} to #
                  {mover.rank}
                </p>
              </div>
              <div
                className={cn(
                  "flex items-center justify-end gap-1 font-mono text-sm font-semibold tabular-nums",
                  movementColor(mover.rankDelta),
                )}
              >
                <MovementIcon value={mover.rankDelta} />
                {Math.abs(mover.rankDelta)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </article>
  );
}

function RivalryPanel({
  headToHead,
  leagueOptions,
  seasonId,
}: {
  headToHead: ArenaHeadToHead | null;
  leagueOptions: ArenaLeagueRivalOption[];
  seasonId: string | null;
}) {
  if (!headToHead) {
    return (
      <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
        <div className="flex items-center gap-2">
          <Swords className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">League rivalry waiting</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          At least two leagues need materialized arena standings before the
          head-to-head table can pick a rival.
        </p>
      </section>
    );
  }

  const rivalOptions = leagueOptions.filter(
    (option) => option.id !== headToHead.anchor.id,
  );

  return (
    <section className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Swords className="size-4" aria-hidden="true" />
            <p className="text-sm font-medium">League head-to-head</p>
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            {headToHead.anchor.displayName} vs. {headToHead.rival.displayName}
          </h2>
        </div>
        <p
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            metricColor(
              headToHead.anchor.netPnlCents - headToHead.rival.netPnlCents,
            ),
          )}
        >
          {comparisonCopy(headToHead)}
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
        <HeadToHeadLeagueCard league={headToHead.anchor} label="Focus" />
        <div className="flex items-center justify-center text-xs font-medium text-muted-foreground uppercase">
          vs
        </div>
        <HeadToHeadLeagueCard league={headToHead.rival} label="Rival" />
      </div>

      <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
        <p>
          Rank gap{" "}
          <span className="font-mono text-foreground tabular-nums">
            {headToHead.rankGap}
          </span>
        </p>
        <p>
          Paper P&L gap{" "}
          <span className="font-mono text-foreground tabular-nums">
            {formatPaperAmount(headToHead.marginCents)}
          </span>
        </p>
        <p>
          Leader{" "}
          <span className="font-medium text-foreground">
            {headToHead.leader?.displayName ?? "Tied"}
          </span>
        </p>
      </div>

      {rivalOptions.length > 0 ? (
        <nav
          aria-label="Compare rival leagues"
          className="mt-4 flex gap-2 overflow-x-auto pb-1"
        >
          {rivalOptions.map((option) => (
            <Link
              className={cn(
                buttonVariants({
                  className: "min-w-36 shrink-0 justify-start px-3 text-left",
                  size: "sm",
                  variant:
                    option.id === headToHead.rival.id ? "default" : "outline",
                }),
              )}
              href={arenaHref({
                leagueId: headToHead.anchor.id,
                rivalLeagueId: option.id,
                seasonId,
              })}
              key={option.id}
            >
              <span className="min-w-0">
                <span className="block truncate">#{option.rank}</span>
                <span className="block truncate text-xs opacity-80">
                  {option.displayName}
                </span>
              </span>
            </Link>
          ))}
        </nav>
      ) : null}
    </section>
  );
}

function HeadToHeadLeagueCard({
  label,
  league,
}: {
  label: string;
  league: ArenaHeadToHeadLeague;
}) {
  return (
    <div className="rounded-control border border-border bg-muted/25 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 truncate text-sm font-semibold">
            #{league.rank} {league.displayName}
          </p>
        </div>
        <p
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            metricColor(league.netPnlCents),
          )}
        >
          {formatPaperMoney(league.netPnlCents)}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <p>
          ROI{" "}
          <span
            className={cn("font-mono tabular-nums", metricColor(league.roiBps))}
          >
            {formatPercentBps(league.roiBps)}
          </span>
        </p>
        <p>
          Win rate{" "}
          <span
            className={cn(
              "font-mono tabular-nums",
              metricColor(league.winRateBps),
            )}
          >
            {formatPercentBps(league.winRateBps)}
          </span>
        </p>
        <p>
          Weeks{" "}
          <span className="font-mono text-foreground tabular-nums">
            {league.weeksSurvived}/{league.weeksPlayed}
          </span>
        </p>
        <p
          className={cn(
            "flex items-center gap-1 font-mono tabular-nums",
            movementColor(league.rankDelta),
          )}
        >
          <MovementIcon value={league.rankDelta} />
          {movementLabel(league.rankDelta)}
        </p>
      </div>
    </div>
  );
}

function LeaderboardSection({
  emptyText,
  highlightedRowId,
  netLabel,
  rows,
  title,
}: {
  emptyText: string;
  highlightedRowId?: string | null;
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
              className={cn(
                "grid min-h-16 grid-cols-[2.75rem_minmax(0,1fr)_5.75rem_4.75rem] items-center gap-2 border-border border-t px-3 py-2 text-sm sm:grid-cols-[2.75rem_minmax(0,1fr)_6.5rem_5.5rem_5.5rem]",
                row.id === highlightedRowId && "bg-primary/10",
              )}
            >
              <div>
                <p className="font-mono text-muted-foreground tabular-nums">
                  {row.rank}
                </p>
                <p
                  className={cn(
                    "mt-1 flex items-center gap-1 text-xs",
                    movementColor(row.rankDelta),
                  )}
                  title={
                    row.previousRank
                      ? `Previous rank ${row.previousRank}`
                      : "No previous rank"
                  }
                >
                  <MovementIcon value={row.rankDelta} />
                  {movementLabel(row.rankDelta)}
                </p>
              </div>
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
  const focusedLeagueId = data.headToHead?.anchor.id ?? null;
  const rivalLeagueId = data.headToHead?.rival.id ?? null;

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
                {" · "}
                {seasonStatusLabel(data.season.status)}
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
        <SeasonStrip
          leagueId={focusedLeagueId}
          rivalLeagueId={rivalLeagueId}
          seasons={data.seasons}
        />
        <MovementSummary {...data.movers} />
        <RivalryPanel
          headToHead={data.headToHead}
          leagueOptions={data.leagueOptions}
          seasonId={data.season?.id ?? null}
        />
        <LeaderboardSection
          emptyText="No league standings have been materialized yet."
          highlightedRowId={focusedLeagueId}
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
