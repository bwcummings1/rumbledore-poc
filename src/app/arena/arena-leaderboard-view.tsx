import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Minus,
  Radio,
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
import {
  type AUSPEXChartSpec,
  Chart,
  type ChartDatum,
  type ChartSeries,
} from "@/components/ui/chart";
import type { DataCardRow } from "@/components/ui/data-card-table";
import { Edge, type EdgeTone } from "@/components/ui/edge";
import { EmptyState } from "@/components/ui/empty-state";
import { type KVItem, KVList, type KVTone } from "@/components/ui/kv";
import { Ladder } from "@/components/ui/ladder";
import { Pagination } from "@/components/ui/pagination";
import { Presence } from "@/components/ui/presence";
import { Progress } from "@/components/ui/progress";
import { CountUpValue, LivePulseDot } from "@/components/ui/spectacle";
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
import {
  ARENA_NAVIGATION_SECTIONS,
  type ArenaSectionId,
} from "@/navigation/scope";
import { ArenaRealtimeRefresh } from "@/realtime/client";

const ARENA_BANKROLL_FLOOR_CENTS = 100_000;
const AS_OF_STALE_MS = 1000 * 60 * 60 * 24;

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

function formatSeasonWindow(startsAt: string, endsAt: string): string {
  return `${formatDate(startsAt)}-${formatDate(endsAt)}`;
}

function arenaHref(input: {
  leagueId?: string | null;
  rivalLeagueId?: string | null;
  seasonId?: string | null;
}): string {
  return arenaSectionHref("/arena", input);
}

function arenaSectionHref(
  path: string,
  input: {
    leagueId?: string | null;
    rivalLeagueId?: string | null;
    seasonId?: string | null;
  },
): string {
  const params = new URLSearchParams();
  if (input.seasonId) params.set("seasonId", input.seasonId);
  if (input.leagueId) params.set("leagueId", input.leagueId);
  if (input.rivalLeagueId) params.set("rivalLeagueId", input.rivalLeagueId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
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

function chartTone(value: number): ChartDatum["tone"] {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "secondary";
}

function chartSeriesTone(
  index: number,
  emphasized = false,
): ChartSeries["tone"] {
  if (emphasized) return "primary";
  return index % 3 === 0 ? "secondary" : index % 3 === 1 ? "value" : "muted";
}

function asOfStatus(
  computedAt: string | null,
  season: ArenaLeaderboardData["season"],
): { label: string; tone: StatusTone } {
  if (!computedAt) {
    return { label: "Not materialized", tone: "warning" };
  }

  if (season?.status === "complete") {
    return {
      label: `Final as of ${formatTimestamp(computedAt)}`,
      tone: "success",
    };
  }

  const computedMs = new Date(computedAt).getTime();
  const isStale =
    Number.isFinite(computedMs) && Date.now() - computedMs > AS_OF_STALE_MS;

  return {
    label: `${isStale ? "Stale as of" : "As of"} ${formatTimestamp(computedAt)}`,
    tone: isStale ? "warning" : "live",
  };
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
  return row.currentBalanceCents - ARENA_BANKROLL_FLOOR_CENTS;
}

function leaderboardBumpSpec(
  rows: readonly ArenaLeaderboardRow[],
  highlightedRowId: string | null,
): AUSPEXChartSpec {
  const topRows = rows.slice(0, 6);

  return {
    ariaLabel: "Arena rank movement from prior materialization to now",
    caption:
      "Rank lines compare the previous materialized rank to the current aggregate rank.",
    highlightedSeriesId: highlightedRowId ?? undefined,
    kind: "standings-bump",
    series: topRows.map((row, index) => {
      const previousRank = row.previousRank ?? row.rank;
      const emphasized = row.id === highlightedRowId || index === 0;

      return {
        data: [
          {
            label: "Prior",
            meta: `#${previousRank}`,
            value: previousRank,
          },
          {
            label: "Now",
            meta: movementLabel(row.rankDelta),
            secondaryValue: row.rankDelta,
            tone: chartTone(row.rankDelta),
            value: row.rank,
          },
        ],
        emphasized,
        id: row.id,
        label: row.displayName,
        tone: chartSeriesTone(index, emphasized),
      };
    }),
    state: topRows.length > 0 ? "ready" : "empty",
    statusNote: `${topRows.length} tracked`,
    title: "Rank race",
  };
}

function pnlDistributionSpec(
  rows: readonly ArenaLeaderboardRow[],
): AUSPEXChartSpec {
  const sortedRows = [...rows].sort((a, b) => b.netPnlCents - a.netPnlCents);

  return {
    ariaLabel: "Arena net paper profit distribution by league",
    caption:
      "Only aggregate league paper P&L is shown here; raw slips stay inside each league.",
    data: sortedRows.map((row) => ({
      label: row.displayName,
      meta: formatPaperMoney(row.netPnlCents),
      tone: chartTone(row.netPnlCents),
      value: Math.round(row.netPnlCents / 100),
    })),
    kind: "histogram",
    state: sortedRows.length > 0 ? "ready" : "empty",
    statusNote: "aggregate dollars",
    title: "Net P&L spread",
  };
}

function roiBarsSpec(rows: readonly ArenaLeaderboardRow[]): AUSPEXChartSpec {
  const sortedRows = [...rows].sort((a, b) => b.roiBps - a.roiBps).slice(0, 8);

  return {
    ariaLabel: "Arena league ROI leaders",
    caption:
      "ROI keeps the league table deterministic after net paper P&L, balance, and win rate tie-breaks.",
    data: sortedRows.map((row) => ({
      label: row.displayName,
      meta: formatPercentBps(row.roiBps),
      tone: chartTone(row.roiBps),
      value: row.roiBps / 100,
    })),
    kind: "hbars",
    state: sortedRows.length > 0 ? "ready" : "empty",
    statusNote: "basis points",
    title: "ROI ladder",
  };
}

function headToHeadBulletSpec(
  headToHead: ArenaHeadToHead | null,
): AUSPEXChartSpec {
  const marginDollars = headToHead
    ? Math.round(headToHead.marginCents / 100)
    : 0;
  const signedMargin =
    headToHead?.comparison === "trailing" ? -marginDollars : marginDollars;
  const domain = Math.max(Math.abs(signedMargin), 1);

  return {
    ariaLabel: "League head-to-head paper profit margin",
    caption: headToHead
      ? `${headToHead.anchor.displayName} versus ${headToHead.rival.displayName}; center is dead even.`
      : "The duel chart appears after two leagues have standings.",
    data: headToHead
      ? [
          {
            label: "Margin",
            max: domain,
            meta: comparisonCopy(headToHead),
            min: -domain,
            target: 0,
            tone: chartTone(signedMargin),
            value: signedMargin,
          },
        ]
      : [],
    kind: "bullet",
    state: headToHead ? "ready" : "empty",
    statusNote: headToHead
      ? formatPaperAmount(headToHead.marginCents)
      : "waiting",
    title: "Duel margin",
  };
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
  const selectedIndex = Math.max(
    seasons.findIndex((season) => season.isSelected),
    0,
  );
  const selectedSeason = seasons[selectedIndex] ?? seasons[0];
  const pages = seasons.map((season, index) => ({
    ariaLabel: `${season.name} ${seasonStatusLabel(season.status)}`,
    href: arenaHref({
      leagueId,
      rivalLeagueId,
      seasonId: season.id,
    }),
    label: season.name,
    page: index + 1,
  }));

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
      {selectedSeason ? (
        <div className="cell flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {selectedSeason.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatSeasonWindow(
                selectedSeason.startsAt,
                selectedSeason.endsAt,
              )}
            </p>
          </div>
          <StatusPill tone={seasonStatusTone(selectedSeason.status)}>
            {seasonStatusLabel(selectedSeason.status)}
          </StatusPill>
        </div>
      ) : null}
      <Pagination
        aria-label="Seasons"
        currentPage={selectedIndex + 1}
        mobileSelectLabel="Jump to arena season"
        pages={pages}
      />
    </section>
  );
}

function MovementSummary({ fallers, risers }: ArenaLeaderboardData["movers"]) {
  if (risers.length === 0 && fallers.length === 0) {
    return (
      <EmptyState
        className="border-dashed"
        title="No rank movement yet"
        icon={<Radio className="size-4" />}
      >
        <p>
          The next standings rebuild will compare against this season's prior
          ranks.
        </p>
      </EmptyState>
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
        <h2 className="heading-auspex text-base">{title}</h2>
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
      <EmptyState
        className="border-dashed"
        icon={<Swords className="size-4" />}
        title="League rivalry waiting"
      >
        <p>
          At least two leagues need materialized arena standings before the
          head-to-head table can pick a rival.
        </p>
      </EmptyState>
    );
  }

  const rivalOptions = leagueOptions.filter(
    (option) => option.id !== headToHead.anchor.id,
  );

  return (
    <section className="panel overflow-hidden p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Swords className="size-4" aria-hidden="true" />
            <Tag>League head-to-head</Tag>
          </div>
          <h2 className="mt-1 text-lg font-medium">
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

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatTile
          caption="aggregate net vs. floor"
          label="Focus P&L"
          tone="amber"
          value={
            <CountUpValue
              formatValue={(value) => formatPaperMoney(Number(value))}
              label={`${headToHead.anchor.displayName} aggregate paper P&L`}
              tone="value"
              value={headToHead.anchor.netPnlCents}
            />
          }
        />
        <StatTile
          caption="distance between leagues"
          label="Duel margin"
          tone="amber"
          value={
            <CountUpValue
              formatValue={(value) => formatPaperAmount(Number(value))}
              label="Head-to-head paper P&L margin"
              tone="value"
              value={headToHead.marginCents}
            />
          }
        />
        <StatTile
          caption="aggregate net vs. floor"
          label="Rival P&L"
          tone="amber"
          value={
            <CountUpValue
              formatValue={(value) => formatPaperMoney(Number(value))}
              label={`${headToHead.rival.displayName} aggregate paper P&L`}
              tone="value"
              value={headToHead.rival.netPnlCents}
            />
          }
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

function ArenaAnalytics({
  focusedLeagueId,
  data,
}: {
  data: ArenaLeaderboardData;
  focusedLeagueId: string | null;
}) {
  return (
    <section aria-label="Arena charts" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">aggregate telemetry</p>
          <h2 className="heading-auspex text-lg">Arena movement board</h2>
        </div>
        <StatusPill tone="neutral">
          charts expose aggregate ranks only
        </StatusPill>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Chart
          spec={leaderboardBumpSpec(data.leagueStandings, focusedLeagueId)}
        />
        <Chart spec={headToHeadBulletSpec(data.headToHead)} />
        <Chart spec={pnlDistributionSpec(data.leagueStandings)} />
        <Chart spec={roiBarsSpec(data.leagueStandings)} />
      </div>
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
          <h2 className="heading-auspex text-lg">{title}</h2>
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

function ArenaEntryPoints({
  focusedLeagueId,
  rivalLeagueId,
  seasonId,
}: {
  focusedLeagueId: string | null;
  rivalLeagueId: string | null;
  seasonId: string | null;
}) {
  const entrySections = ARENA_NAVIGATION_SECTIONS.filter(
    (section) => section.id !== "leaderboard",
  );

  return (
    <section aria-label="Arena sections" className="panel p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">environment sections</p>
          <h2 className="heading-auspex text-lg">Choose the arena angle</h2>
        </div>
        <StatusPill tone="neutral">aggregate-only views</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {entrySections.map((section) => (
          <Link
            className="cell grid min-h-32 content-between gap-3 p-3 outline-none transition-[border-color,box-shadow,transform] hover:border-[var(--hair-3)] hover:shadow-[0_0_18px_var(--glow-lilac),var(--bevel)] focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)]"
            href={arenaSectionHref(section.href, {
              leagueId: focusedLeagueId,
              rivalLeagueId,
              seasonId,
            })}
            key={section.id}
          >
            <span className="eyebrow">{section.label}</span>
            <span className="font-display text-sm font-semibold text-foreground">
              {arenaSectionDeck(section.id)}
            </span>
            <Edge tone="neutral" value="Open" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function ArenaRulesSection() {
  return (
    <section className="panel grid gap-4 p-4" aria-label="Arena rules">
      <div>
        <p className="eyebrow">rules of engagement</p>
        <h2 className="heading-auspex text-lg">Aggregate bragging rights</h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="cell p-3">
          <Tag>Play money only</Tag>
          <p className="mt-3 text-sm text-muted-foreground">
            Arena balances rank paper-betting performance. There are no prizes,
            deposits, cash-outs, or real-money payouts.
          </p>
        </div>
        <div className="cell p-3">
          <Tag>League isolation</Tag>
          <p className="mt-3 text-sm text-muted-foreground">
            The Arena can show league ranks, P&L, ROI, and movement. Raw slips
            stay inside their league and user-scoped betting history.
          </p>
        </div>
        <div className="cell p-3">
          <Tag>Rolling floor</Tag>
          <p className="mt-3 text-sm text-muted-foreground">
            Rankings come from aggregate bankroll ledgers over the selected
            Arena season, including the weekly rolling-minimum floor.
          </p>
        </div>
      </div>
      <KVList
        className="grid gap-x-4 sm:grid-cols-3 sm:divide-y-0"
        items={[
          { label: "League ladder", value: "Avg aggregate P&L" },
          { label: "Individual ladder", value: "Net paper P&L" },
          { label: "Movement", value: "Delta vs prior materialization" },
        ]}
      />
    </section>
  );
}

function arenaSectionDeck(sectionId: ArenaSectionId): string {
  switch (sectionId) {
    case "leaderboard":
      return "The main league and individual ladders.";
    case "leagues":
      return "Your league's aggregate duel against the field.";
    case "matchups":
      return "Head-to-head rival framing and duel margin.";
    case "movers":
      return "Rank jumps, drops, and movement telemetry.";
    case "rules":
      return "The play-money and isolation contract.";
    case "seasons":
      return "Active windows and prior Arena history.";
  }
}

export function ArenaLeaderboardView({
  data,
  sectionId = "leaderboard",
}: {
  data: ArenaLeaderboardData;
  sectionId?: ArenaSectionId;
}) {
  const focusedLeagueId = data.headToHead?.anchor.id ?? null;
  const rivalLeagueId = data.headToHead?.rival.id ?? null;
  const topLeague = data.leagueStandings[0] ?? null;
  const topIndividual = data.individualStandings[0] ?? null;
  const asOf = asOfStatus(data.computedAt, data.season);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <ArenaRealtimeRefresh />
      <header className="panel relative overflow-hidden p-4 sm:p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        />
        <Link
          href="/"
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          Home
        </Link>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-primary">
              <Users className="size-5" aria-hidden="true" />
              <Tag>Central arena</Tag>
              <LivePulseDot
                status={data.computedAt ? "live" : "static"}
                withText
              />
            </div>
            <h1 className="heading-auspex mt-3 text-2xl sm:text-4xl">
              CENTRAL ARENA
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
              League-vs-league and individual paper standings, built from
              aggregate bankroll ledgers without exposing another league's raw
              slips.
            </p>
            {data.season ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {data.season.name} ·{" "}
                  {formatSeasonWindow(data.season.startsAt, data.season.endsAt)}
                </span>
                <StatusPill tone={seasonStatusTone(data.season.status)}>
                  {seasonStatusLabel(data.season.status)}
                </StatusPill>
                <StatusPill tone={asOf.tone}>{asOf.label}</StatusPill>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No arena season has been created yet.
              </p>
            )}
          </div>
          <div className="cell grid gap-2 p-3 text-sm lg:min-w-72">
            <p className="eyebrow">rivalry frame</p>
            <p className="font-display text-base font-medium text-foreground">
              {data.headToHead
                ? `${data.headToHead.anchor.displayName} vs. ${data.headToHead.rival.displayName}`
                : "Waiting for a second league"}
            </p>
            <p className="text-muted-foreground">
              {data.headToHead
                ? comparisonCopy(data.headToHead)
                : "The first materialized rival unlocks the duel panel."}
            </p>
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
            value={
              <CountUpValue
                label="Materialized league rows"
                tone="live"
                value={data.leagueStandings.length}
              />
            }
          />
          <StatTile
            caption="Individual arena rows"
            label="Players"
            value={
              <CountUpValue
                label="Individual arena rows"
                value={data.individualStandings.length}
              />
            }
          />
          <StatTile
            caption={topLeague?.displayName ?? "No leader yet"}
            delta={topLeague ? movementLabel(topLeague.rankDelta) : undefined}
            label="Top league"
            tone="amber"
            value={
              topLeague ? (
                <CountUpValue
                  formatValue={(value) => formatPaperMoney(Number(value))}
                  label="Top league net paper P&L"
                  tone="value"
                  value={topLeague.netPnlCents}
                />
              ) : (
                "--"
              )
            }
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
              topIndividual ? (
                <CountUpValue
                  formatValue={(value) => formatPaperMoney(Number(value))}
                  label="Top player net paper P&L"
                  value={topIndividual.netPnlCents}
                />
              ) : (
                "--"
              )
            }
          />
        </section>

        {sectionId === "leaderboard" ? (
          <>
            <div className="grid gap-6">
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
            <ArenaEntryPoints
              focusedLeagueId={focusedLeagueId}
              rivalLeagueId={rivalLeagueId}
              seasonId={data.season?.id ?? null}
            />
          </>
        ) : null}

        {sectionId === "leagues" ? (
          <>
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
          </>
        ) : null}

        {sectionId === "movers" ? (
          <>
            <MovementSummary {...data.movers} />
            <ArenaAnalytics data={data} focusedLeagueId={focusedLeagueId} />
          </>
        ) : null}

        {sectionId === "matchups" ? (
          <>
            <RivalryPanel
              headToHead={data.headToHead}
              leagueOptions={data.leagueOptions}
              seasonId={data.season?.id ?? null}
            />
            <ArenaAnalytics data={data} focusedLeagueId={focusedLeagueId} />
          </>
        ) : null}

        {sectionId === "seasons" ? (
          <>
            <SeasonStrip
              leagueId={focusedLeagueId}
              rivalLeagueId={rivalLeagueId}
              seasons={data.seasons}
            />
            <LeaderboardSection
              emptyText="No league standings have been materialized yet."
              highlightedRowId={focusedLeagueId}
              netLabel="Avg P&L"
              rows={data.leagueStandings}
              title="Season league standings"
            />
            <LeaderboardSection
              emptyText="No individual standings have been materialized yet."
              netLabel="Net P&L"
              rows={data.individualStandings}
              title="Season individual standings"
            />
          </>
        ) : null}

        {sectionId === "rules" ? <ArenaRulesSection /> : null}
      </div>
    </main>
  );
}
