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
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Capacity } from "@/components/ui/capacity";
import type { DataCardRow } from "@/components/ui/data-card-table";
import { Edge, type EdgeTone } from "@/components/ui/edge";
import { type KVItem, KVList, type KVTone } from "@/components/ui/kv";
import { Ladder } from "@/components/ui/ladder";
import { Presence } from "@/components/ui/presence";
import { Progress } from "@/components/ui/progress";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import {
  type CellTone,
  DataTable,
  type DataTableColumn,
  SignedValue,
} from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
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

function seasonStatusTone(status: ArenaSeasonSummary["status"]): StatusTone {
  switch (status) {
    case "active":
      return "live";
    case "complete":
      return "success";
    case "upcoming":
      return "warning";
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

function metricTone(value: number): KVTone {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "muted";
}

function cellTone(value: number): CellTone {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "muted";
}

function edgeTone(value: number): EdgeTone {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
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

function currentBalanceDelta(row: ArenaLeaderboardRow): number {
  return row.currentBalanceCents - 100_000;
}

function leaderboardMobileRow(
  row: ArenaLeaderboardRow,
  netLabel: string,
  highlightedRowId?: string | null,
): DataCardRow {
  const isHighlighted = row.id === highlightedRowId;
  return {
    cells: leaderboardKVItems(row, netLabel),
    id: row.id,
    leading: (
      <span className="relative inline-flex">
        <Avatar name={row.displayName} size="sm" />
        {isHighlighted ? (
          <Presence
            className="absolute -right-1 -bottom-1"
            label="focused league"
            status="live"
          />
        ) : null}
      </span>
    ),
    meta: `${row.wonSlipCount}/${row.settledSlipCount} wins · ${row.weeksSurvived}/${row.weeksPlayed} weeks`,
    selected: isHighlighted,
    title: row.displayName,
  };
}

function leaderboardKVItems(
  row: ArenaLeaderboardRow,
  netLabel: string,
): readonly KVItem[] {
  return [
    { label: "Rank", value: `#${row.rank}` },
    {
      label: "Movement",
      tone: metricTone(row.rankDelta),
      value: movementLabel(row.rankDelta),
    },
    {
      label: netLabel,
      tone: metricTone(row.netPnlCents),
      value: formatPaperMoney(row.netPnlCents),
    },
    {
      label: "ROI",
      tone: metricTone(row.roiBps),
      value: formatPercentBps(row.roiBps),
    },
    {
      label: "Win rate",
      tone: metricTone(row.winRateBps),
      value: formatPercentBps(row.winRateBps),
    },
    {
      label: "Current balance",
      tone: "money",
      value: formatPaperAmount(row.currentBalanceCents),
    },
  ];
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
        <Badge
          label={`${seasons.length} arena seasons`}
          value={seasons.length}
        />
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
              <span className="mt-1 flex items-center gap-2 text-xs opacity-80">
                <StatusPill tone={seasonStatusTone(season.status)}>
                  {seasonStatusLabel(season.status)}
                </StatusPill>
                <span className="truncate">
                  {formatDate(season.startsAt)}-{formatDate(season.endsAt)}
                </span>
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
      <section className="cell border-dashed p-4">
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
    <article className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <Badge
          label={`${movers.length} ${title.toLowerCase()}`}
          value={movers.length}
        />
      </div>
      {movers.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {movers.map((mover) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-border border-t pt-2 first:border-t-0 first:pt-0"
              key={`${mover.kind}:${mover.id}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={mover.displayName} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {mover.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {subjectKindLabel(mover.kind)} · #{mover.previousRank} to #
                    {mover.rank}
                  </p>
                </div>
              </div>
              <Edge
                tone={edgeTone(mover.rankDelta)}
                value={Math.abs(mover.rankDelta)}
              />
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
      <section className="cell border-dashed p-4">
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
    <section className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Swords className="size-4" aria-hidden="true" />
            <Tag>League head-to-head</Tag>
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            {headToHead.anchor.displayName} vs. {headToHead.rival.displayName}
          </h2>
        </div>
        <Edge
          eyebrow="Margin"
          tone={edgeTone(
            headToHead.anchor.netPnlCents - headToHead.rival.netPnlCents,
          )}
          value={comparisonCopy(headToHead)}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
        <HeadToHeadLeagueCard league={headToHead.anchor} label="Focus" />
        <div className="flex items-center justify-center text-xs font-medium text-muted-foreground uppercase">
          vs
        </div>
        <HeadToHeadLeagueCard league={headToHead.rival} label="Rival" />
      </div>

      <KVList
        className="mt-4 grid gap-x-4 sm:grid-cols-3 sm:divide-y-0"
        items={[
          { label: "Rank gap", value: headToHead.rankGap },
          {
            label: "Paper P&L gap",
            tone: "money",
            value: formatPaperAmount(headToHead.marginCents),
          },
          { label: "Leader", value: headToHead.leader?.displayName ?? "Tied" },
        ]}
      />

      {leagueOptions.length > 0 ? (
        <div className="mt-4">
          <Ladder
            label="Arena league rank ladder"
            pips={leagueOptions.map((option) => ({
              id: option.id,
              isCurrent: option.id === headToHead.anchor.id,
              label: option.displayName,
              rank: option.rank,
            }))}
          />
        </div>
      ) : null}

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
    <div className="cell p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={league.displayName} size="sm" />
          <div className="min-w-0">
            <p className="eyebrow">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold">
              #{league.rank} {league.displayName}
            </p>
          </div>
        </div>
        <Edge
          tone={edgeTone(league.netPnlCents)}
          value={formatPaperMoney(league.netPnlCents)}
        />
      </div>
      <div className="mt-3 grid gap-3">
        <KVList
          className="grid gap-x-4 sm:grid-cols-2 sm:divide-y-0"
          items={[
            {
              label: "ROI",
              tone: metricTone(league.roiBps),
              value: formatPercentBps(league.roiBps),
            },
            {
              label: "Win rate",
              tone: metricTone(league.winRateBps),
              value: formatPercentBps(league.winRateBps),
            },
            {
              label: "Movement",
              tone: metricTone(league.rankDelta),
              value: (
                <span className="inline-flex items-center gap-1">
                  <MovementIcon value={league.rankDelta} />
                  {movementLabel(league.rankDelta)}
                </span>
              ),
            },
            {
              label: "Balance",
              tone: "money",
              value: formatPaperAmount(league.currentBalanceCents),
            },
          ]}
        />
        <Progress
          label={`${league.displayName} win rate`}
          showValue={true}
          value={league.winRateBps / 100}
        />
        <Capacity
          label="Weeks survived"
          total={league.weeksPlayed}
          used={league.weeksSurvived}
        />
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
  const columns: readonly DataTableColumn<ArenaLeaderboardRow>[] = [
    {
      cell: (row) => (
        <div>
          <p className="metric text-muted-foreground">#{row.rank}</p>
          <Edge
            className="mt-1"
            tone={edgeTone(row.rankDelta)}
            value={movementLabel(row.rankDelta)}
          />
        </div>
      ),
      header: "#",
      id: "rank",
    },
    {
      cell: (row) => {
        const isHighlighted = row.id === highlightedRowId;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative inline-flex">
              <Avatar name={row.displayName} size="sm" />
              {isHighlighted ? (
                <Presence
                  className="absolute -right-1 -bottom-1"
                  label="focused league"
                  status="live"
                />
              ) : null}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.wonSlipCount}/{row.settledSlipCount} wins ·{" "}
                {row.weeksSurvived}/{row.weeksPlayed} weeks
              </p>
            </div>
          </div>
        );
      },
      header: "Name",
      id: "name",
    },
    {
      align: "right",
      cell: (row) => (
        <SignedValue className="font-semibold" tone={cellTone(row.netPnlCents)}>
          {formatPaperMoney(row.netPnlCents)}
        </SignedValue>
      ),
      header: netLabel,
      id: "net",
    },
    {
      align: "right",
      cell: (row) => (
        <SignedValue tone={cellTone(row.roiBps)}>
          {formatPercentBps(row.roiBps)}
        </SignedValue>
      ),
      header: "ROI",
      id: "roi",
    },
    {
      align: "right",
      cell: (row) => (
        <SignedValue tone={cellTone(row.winRateBps)}>
          {formatPercentBps(row.winRateBps)}
        </SignedValue>
      ),
      header: "Win rate",
      id: "win-rate",
      priority: "desktop",
    },
  ];
  const mobileRows = rows.map((row) =>
    leaderboardMobileRow(row, netLabel, highlightedRowId),
  );

  return (
    <section className="panel">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <Badge label={`${rows.length} rows`} value={rows.length} />
        </div>
        <Tag leadingIcon={<Trophy aria-hidden="true" />}>Standings</Tag>
      </div>
      <div className="px-4 pb-4">
        <DataTable
          ariaLabel={title}
          columns={columns}
          empty={
            <p className="rounded-control border border-dashed border-border bg-elevated px-3 py-3 text-sm text-muted-foreground">
              {emptyText}
            </p>
          }
          getRowId={(row) => row.id}
          getRowName={(row) => row.displayName}
          mobileRows={mobileRows}
          rows={rows}
          selectedRowIds={highlightedRowId ? [highlightedRowId] : []}
        />
      </div>
    </section>
  );
}

export function ArenaLeaderboardView({ data }: { data: ArenaLeaderboardData }) {
  const focusedLeagueId = data.headToHead?.anchor.id ?? null;
  const rivalLeagueId = data.headToHead?.rival.id ?? null;
  const topLeague = data.leagueStandings[0] ?? null;
  const topIndividual = data.individualStandings[0] ?? null;

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
            <Tag>Central arena</Tag>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Paper betting standings
            </h1>
            {data.season ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {data.season.name} · {formatDate(data.season.startsAt)}-
                  {formatDate(data.season.endsAt)}
                </span>
                <StatusPill tone={seasonStatusTone(data.season.status)}>
                  {seasonStatusLabel(data.season.status)}
                </StatusPill>
                {data.computedAt
                  ? `Updated ${formatTimestamp(data.computedAt)}`
                  : ""}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No arena season has been created yet.
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6">
        <section
          aria-label="Arena snapshot"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatTile
            caption="Materialized league rows"
            label="Leagues"
            tone="lilac"
            value={data.leagueStandings.length}
          />
          <StatTile
            caption="Individual arena rows"
            label="Players"
            value={data.individualStandings.length}
          />
          <StatTile
            caption={topLeague?.displayName ?? "No leader yet"}
            delta={topLeague ? movementLabel(topLeague.rankDelta) : undefined}
            label="Top league"
            tone="amber"
            value={topLeague ? formatPaperMoney(topLeague.netPnlCents) : "--"}
          />
          <StatTile
            caption={topIndividual?.displayName ?? "No leader yet"}
            delta={
              topIndividual
                ? formatPaperMoney(currentBalanceDelta(topIndividual))
                : undefined
            }
            label="Top player"
            value={
              topIndividual ? formatPaperMoney(topIndividual.netPnlCents) : "--"
            }
          />
        </section>
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
