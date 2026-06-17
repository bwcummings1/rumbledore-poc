import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";

const chartKinds = [
  "line-area",
  "multi-line",
  "sparkline",
  "bars",
  "grouped-bars",
  "stacked-bars",
  "hbars",
  "range",
  "radar",
  "scatter",
  "histogram",
  "gauge",
  "donut",
  "activity-rings",
  "equalizer",
  "heatmap",
  "bullet",
  "node-graph",
  "bankroll-equity",
  "standings-bump",
  "playoff-odds-cone",
  "win-probability-timeline",
  "odds-movement",
  "season-arc",
  "head-to-head-flow",
  "activity-calendar",
  "power-ranking-ladder",
  "leverage-gauge",
  "record-chase",
  "projection-violin",
  "season-dial",
] as const;

type ChartKind = (typeof chartKinds)[number];
type ChartTone =
  | "muted"
  | "negative"
  | "positive"
  | "primary"
  | "secondary"
  | "value";
type ChartState = "empty" | "error" | "loading" | "partial" | "ready" | "stale";
type ChartDash = "dashed" | "dotted" | "solid";

interface ChartCommon {
  readonly ariaLabel?: string;
  readonly caption?: ReactNode;
  readonly state?: ChartState;
  readonly statusNote?: ReactNode;
  readonly title: string;
}

interface ChartDatum {
  readonly label: string;
  readonly max?: number;
  readonly meta?: string;
  readonly min?: number;
  readonly secondaryValue?: number;
  readonly target?: number;
  readonly tone?: ChartTone;
  readonly value: number;
  readonly x?: number;
  readonly y?: number;
}

interface ChartSeries {
  readonly dash?: ChartDash;
  readonly data: readonly ChartDatum[];
  readonly emphasized?: boolean;
  readonly id: string;
  readonly label: string;
  readonly tone?: ChartTone;
}

interface ChartGroup {
  readonly label: string;
  readonly values: readonly ChartDatum[];
}

interface ChartNode {
  readonly emphasized?: boolean;
  readonly id: string;
  readonly label: string;
  readonly tone?: ChartTone;
  readonly value?: number;
  readonly x: number;
  readonly y: number;
}

interface ChartEdge {
  readonly label?: string;
  readonly source: string;
  readonly target: string;
}

type SingleSeriesChartSpec = ChartCommon & {
  readonly kind: "line-area" | "sparkline";
  readonly series: ChartSeries;
};

type MultiLineChartSpec = ChartCommon & {
  readonly kind: "multi-line";
  readonly series: readonly ChartSeries[];
};

type ValueListChartSpec = ChartCommon & {
  readonly data: readonly ChartDatum[];
  readonly kind: "bars" | "equalizer" | "hbars" | "histogram";
};

type GroupedChartSpec = ChartCommon & {
  readonly groups: readonly ChartGroup[];
  readonly kind: "grouped-bars" | "stacked-bars";
};

type RangeChartSpec = ChartCommon & {
  readonly data: readonly ChartDatum[];
  readonly kind: "bullet" | "range";
};

type RadarChartSpec = ChartCommon & {
  readonly axes: readonly ChartDatum[];
  readonly kind: "radar";
};

type ScatterChartSpec = ChartCommon & {
  readonly data: readonly ChartDatum[];
  readonly kind: "scatter";
};

type GaugeChartSpec = ChartCommon & {
  readonly kind: "gauge";
  readonly metric: ChartDatum;
};

type DonutChartSpec = ChartCommon & {
  readonly kind: "donut";
  readonly segments: readonly ChartDatum[];
};

type ActivityRingsChartSpec = ChartCommon & {
  readonly kind: "activity-rings";
  readonly rings: readonly ChartDatum[];
};

type HeatmapChartSpec = ChartCommon & {
  readonly cells: readonly ChartDatum[];
  readonly kind: "heatmap";
};

type NodeGraphChartSpec = ChartCommon & {
  readonly edges: readonly ChartEdge[];
  readonly kind: "node-graph";
  readonly nodes: readonly ChartNode[];
};

type BankrollEquityChartSpec = ChartCommon & {
  readonly floor: number;
  readonly kind: "bankroll-equity";
  readonly series: ChartSeries;
};

type StandingsBumpChartSpec = ChartCommon & {
  readonly highlightedSeriesId?: string;
  readonly kind: "standings-bump";
  readonly series: readonly ChartSeries[];
};

type PlayoffOddsConeChartSpec = ChartCommon & {
  readonly data: readonly ChartDatum[];
  readonly kind: "playoff-odds-cone";
};

type WinProbabilityTimelineChartSpec = ChartCommon & {
  readonly kind: "win-probability-timeline";
  readonly series: ChartSeries;
  readonly swings?: readonly ChartDatum[];
};

type OddsMovementChartSpec = ChartCommon & {
  readonly kind: "odds-movement";
  readonly lockedLabel?: string;
  readonly series: ChartSeries;
};

type SeasonArcChartSpec = ChartCommon & {
  readonly cells: readonly ChartDatum[];
  readonly kind: "season-arc";
};

type HeadToHeadFlowChartSpec = ChartCommon & {
  readonly meetings: readonly ChartDatum[];
  readonly participantALabel: string;
  readonly participantBLabel: string;
  readonly kind: "head-to-head-flow";
};

type ActivityCalendarChartSpec = ChartCommon & {
  readonly cells: readonly ChartDatum[];
  readonly kind: "activity-calendar";
};

type PowerRankingLadderChartSpec = ChartCommon & {
  readonly kind: "power-ranking-ladder";
  readonly rankings: readonly ChartDatum[];
};

type LeverageGaugeChartSpec = ChartCommon & {
  readonly factors?: readonly ChartDatum[];
  readonly kind: "leverage-gauge";
  readonly metric: ChartDatum;
};

type RecordChaseChartSpec = ChartCommon & {
  readonly holderLabel?: string;
  readonly kind: "record-chase";
  readonly metric: ChartDatum;
};

type ProjectionViolinChartSpec = ChartCommon & {
  readonly distribution: readonly ChartDatum[];
  readonly kind: "projection-violin";
  readonly summary: ChartDatum;
};

type SeasonDialChartSpec = ChartCommon & {
  readonly currentWeek: number;
  readonly events?: readonly ChartDatum[];
  readonly kind: "season-dial";
  readonly totalWeeks: number;
  readonly weeks: readonly ChartDatum[];
};

type AUSPEXChartSpec =
  | ActivityRingsChartSpec
  | ActivityCalendarChartSpec
  | BankrollEquityChartSpec
  | DonutChartSpec
  | GaugeChartSpec
  | GroupedChartSpec
  | HeadToHeadFlowChartSpec
  | HeatmapChartSpec
  | LeverageGaugeChartSpec
  | MultiLineChartSpec
  | NodeGraphChartSpec
  | OddsMovementChartSpec
  | PlayoffOddsConeChartSpec
  | PowerRankingLadderChartSpec
  | ProjectionViolinChartSpec
  | RadarChartSpec
  | RangeChartSpec
  | RecordChaseChartSpec
  | ScatterChartSpec
  | SeasonArcChartSpec
  | SeasonDialChartSpec
  | SingleSeriesChartSpec
  | StandingsBumpChartSpec
  | ValueListChartSpec
  | WinProbabilityTimelineChartSpec;

interface ChartProps extends ComponentPropsWithoutRef<"figure"> {
  readonly spec: AUSPEXChartSpec;
}

interface ChartTable {
  readonly columns: readonly string[];
  readonly rows: readonly ChartTableRow[];
}

interface ChartTableRow {
  readonly label: string;
  readonly values: readonly (number | string)[];
}

interface RenderContext {
  readonly height: number;
  readonly table: ChartTable;
  readonly width: number;
}

const chartKindLabels = {
  "activity-rings": "Activity rings",
  "activity-calendar": "Activity calendar",
  "bankroll-equity": "Bankroll equity",
  bars: "Bars",
  bullet: "Bullet",
  donut: "Donut",
  equalizer: "Equalizer",
  gauge: "Gauge",
  "grouped-bars": "Grouped bars",
  "head-to-head-flow": "Head-to-head flow",
  hbars: "Horizontal bars",
  heatmap: "Heatmap",
  histogram: "Histogram",
  "leverage-gauge": "Leverage gauge",
  "line-area": "Line and area",
  "multi-line": "Multi-line",
  "node-graph": "Node graph",
  "odds-movement": "Odds movement",
  "playoff-odds-cone": "Playoff odds cone",
  "power-ranking-ladder": "Power ranking ladder",
  "projection-violin": "Projection violin",
  radar: "Radar",
  range: "Range",
  "record-chase": "Record chase",
  scatter: "Scatter",
  "season-arc": "Season arc",
  "season-dial": "Season dial",
  sparkline: "Sparkline",
  "stacked-bars": "Stacked bars",
  "standings-bump": "Standings bump",
  "win-probability-timeline": "Win probability timeline",
} satisfies Record<ChartKind, string>;

const compactReductions = {
  "activity-rings": "meters",
  "activity-calendar": "equalizer-week",
  "bankroll-equity": "sparkline-lcd-floor",
  bars: "hbars",
  bullet: "bullet",
  donut: "stacked-bar",
  equalizer: "intensity-bar",
  gauge: "gauge",
  "grouped-bars": "stacked-or-top-n",
  "head-to-head-flow": "ledger-tug-of-war",
  hbars: "hbars",
  heatmap: "scrolling-grid",
  histogram: "coarse-bins",
  "leverage-gauge": "bullet",
  "line-area": "sparkline",
  "multi-line": "top-series",
  "node-graph": "ranked-list",
  "odds-movement": "sparkline",
  "playoff-odds-cone": "gauge-trend-pip",
  "power-ranking-ladder": "disclosure-ladder",
  "projection-violin": "three-number-lcd",
  radar: "stat-list",
  range: "bullet",
  "record-chase": "bullet",
  scatter: "binned-hbars",
  "season-arc": "streak-chip-row",
  "season-dial": "linear-season-bullet",
  sparkline: "sparkline",
  "stacked-bars": "single-total",
  "standings-bump": "rank-delta-list",
  "win-probability-timeline": "gauge-swing-feed",
} satisfies Record<ChartKind, string>;

const toneCssVariables = {
  muted: "var(--muted-foreground)",
  negative: "var(--negative)",
  positive: "var(--positive)",
  primary: "var(--primary)",
  secondary: "var(--steel)",
  value: "var(--warning)",
} satisfies Record<ChartTone, string>;

const toneGlyphs = {
  muted: "=",
  negative: "-",
  positive: "+",
  primary: "*",
  secondary: "~",
  value: "$",
} satisfies Record<ChartTone, string>;

const dashPatterns = {
  dashed: "10 8",
  dotted: "2 8",
  solid: undefined,
} satisfies Record<ChartDash, string | undefined>;

const margin = {
  bottom: 42,
  left: 52,
  right: 32,
  top: 28,
} as const;

const viewBox = {
  height: 320,
  width: 640,
} as const;

function Chart({ className, spec, ...props }: ChartProps) {
  const state = spec.state ?? "ready";
  const table = chartTableForSpec(spec);
  const hasRenderableData = hasData(spec);
  const label = spec.ariaLabel ?? spec.title;
  const statusText = statusLabel(state);

  return (
    <figure
      aria-label={label}
      className={cn("auspex-chart panel grid gap-3 p-4", className)}
      data-chart-kind={spec.kind}
      data-reduction={compactReductions[spec.kind]}
      data-slot="chart"
      {...props}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="heading-auspex text-sm">{spec.title}</h3>
          <p className="eyebrow">
            {chartKindLabels[spec.kind]}
            {statusText ? ` / ${statusText}` : ""}
          </p>
        </div>
        {spec.statusNote ? (
          <p className="metric text-xs text-muted-foreground">
            {spec.statusNote}
          </p>
        ) : null}
      </header>

      {state === "loading" ? (
        <Skeleton
          className="min-h-72 rounded-card"
          data-slot="chart-loading"
          variant="card"
        />
      ) : state === "error" ? (
        <div
          className="cell border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
          data-slot="chart-error"
          role="alert"
        >
          Chart unavailable. Use the table fallback when data returns.
        </div>
      ) : !hasRenderableData || state === "empty" ? (
        <EmptyState
          className="min-h-72"
          data-slot="chart-empty"
          title="No chart data yet"
        >
          The chart will render when the underlying fixture has values.
        </EmptyState>
      ) : (
        <div className="relative min-h-72 overflow-hidden rounded-control border border-border bg-[var(--panel-2)]">
          <svg
            aria-label={label}
            className="auspex-chart__svg h-full min-h-72 w-full"
            data-slot="chart-svg"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          >
            <title>{label}</title>
            <ChartGrid kind={spec.kind} />
            {renderChartSvg(spec, {
              height: viewBox.height,
              table,
              width: viewBox.width,
            })}
          </svg>
        </div>
      )}

      {spec.caption ? (
        <figcaption className="text-sm text-muted-foreground">
          {spec.caption}
        </figcaption>
      ) : null}
      <ChartTableDetails table={table} title={spec.title} />
    </figure>
  );
}

function ChartGrid({ kind }: { readonly kind: ChartKind }) {
  if (
    kind === "donut" ||
    kind === "gauge" ||
    kind === "leverage-gauge" ||
    kind === "activity-rings" ||
    kind === "radar" ||
    kind === "node-graph" ||
    kind === "season-dial"
  ) {
    return (
      <g className="auspex-chart__grid">
        <circle
          className="stroke-border"
          cx={viewBox.width / 2}
          cy={viewBox.height / 2}
          fill="none"
          r={120}
          strokeDasharray="2 10"
        />
      </g>
    );
  }

  return (
    <g className="auspex-chart__grid">
      {[0, 1, 2, 3].map((tick) => {
        const y = margin.top + tick * 68;
        return (
          <line
            className={cn(
              "stroke-border",
              tick > 0 ? "auspex-chart__minor" : "",
            )}
            key={`grid-y-${tick}`}
            strokeDasharray={tick === 0 ? undefined : "2 10"}
            x1={margin.left}
            x2={viewBox.width - margin.right}
            y1={y}
            y2={y}
          />
        );
      })}
      {[0, 1, 2, 3, 4].map((tick) => {
        const x = margin.left + tick * 126;
        return (
          <line
            className="auspex-chart__minor stroke-border"
            key={`grid-x-${tick}`}
            strokeDasharray="2 12"
            x1={x}
            x2={x}
            y1={margin.top}
            y2={viewBox.height - margin.bottom}
          />
        );
      })}
    </g>
  );
}

function renderChartSvg(spec: AUSPEXChartSpec, context: RenderContext) {
  switch (spec.kind) {
    case "line-area":
      return renderLineArea(spec.series, context);
    case "multi-line":
      return renderMultiLine(spec.series, context);
    case "sparkline":
      return renderSparkline(spec.series, context);
    case "bars":
      return renderBars(spec.data, context);
    case "grouped-bars":
      return renderGroupedBars(spec.groups, context);
    case "stacked-bars":
      return renderStackedBars(spec.groups, context);
    case "hbars":
      return renderHorizontalBars(spec.data, context);
    case "range":
      return renderRanges(spec.data, context);
    case "radar":
      return renderRadar(spec.axes, context);
    case "scatter":
      return renderScatter(spec.data, context);
    case "histogram":
      return renderHistogram(spec.data, context);
    case "gauge":
      return renderGauge(spec.metric, context);
    case "donut":
      return renderDonut(spec.segments, context);
    case "activity-rings":
      return renderActivityRings(spec.rings, context);
    case "equalizer":
      return renderEqualizer(spec.data, context);
    case "heatmap":
      return renderHeatmap(spec.cells, context);
    case "bullet":
      return renderBullets(spec.data, context);
    case "node-graph":
      return renderNodeGraph(spec.nodes, spec.edges, context);
    case "bankroll-equity":
      return renderBankrollEquity(spec.series, spec.floor, context);
    case "standings-bump":
      return renderStandingsBump(
        spec.series,
        context,
        spec.highlightedSeriesId,
      );
    case "playoff-odds-cone":
      return renderPlayoffOddsCone(spec.data, context);
    case "win-probability-timeline":
      return renderWinProbabilityTimeline(spec.series, context, spec.swings);
    case "odds-movement":
      return renderOddsMovement(spec.series, context, spec.lockedLabel);
    case "season-arc":
      return renderSeasonArc(spec.cells, context);
    case "head-to-head-flow":
      return renderHeadToHeadFlow(
        spec.meetings,
        context,
        spec.participantALabel,
        spec.participantBLabel,
      );
    case "activity-calendar":
      return renderActivityCalendar(spec.cells, context);
    case "power-ranking-ladder":
      return renderPowerRankingLadder(spec.rankings, context);
    case "leverage-gauge":
      return renderLeverageGauge(spec.metric, spec.factors, context);
    case "record-chase":
      return renderRecordChase(spec.metric, context, spec.holderLabel);
    case "projection-violin":
      return renderProjectionViolin(spec.distribution, spec.summary, context);
    case "season-dial":
      return renderSeasonDial(
        spec.weeks,
        spec.currentWeek,
        spec.totalWeeks,
        context,
        spec.events,
      );
  }
}

function renderLineArea(series: ChartSeries, context: RenderContext) {
  const points = safePoints(series.data);
  const domain = valueDomain(points.map((point) => point.value));
  const path = linePath(points, domain, context);
  const area = areaPath(points, domain, context);
  const tone = series.tone ?? "value";
  const last = points.at(-1);

  return (
    <g data-series={series.id}>
      <path
        className="auspex-chart__area"
        d={area}
        fill={toneColor(tone)}
        opacity={0.18}
      />
      <ChartPath
        ariaLabel={`${series.label} line, ${points.length} points`}
        d={path}
        dash={series.dash}
        emphasized={series.emphasized}
        tone={tone}
      />
      {points.map((point, index) => (
        <ChartPointMark
          key={`${series.id}-${point.label}`}
          label={`${point.label}: ${formatNumber(point.value)}`}
          tone={point.tone ?? tone}
          value={point.value}
          x={xForIndex(index, points.length, context)}
          y={yForValue(point.value, domain, context)}
        />
      ))}
      {last ? (
        <EndLabel
          label={`${series.label} ${formatNumber(last.value)}`}
          tone={tone}
          x={xForIndex(points.length - 1, points.length, context)}
          y={yForValue(last.value, domain, context)}
        />
      ) : null}
    </g>
  );
}

function renderMultiLine(
  series: readonly ChartSeries[],
  context: RenderContext,
) {
  const allValues = series.flatMap((item) =>
    safePoints(item.data).map((point) => point.value),
  );
  const domain = valueDomain(allValues);

  return (
    <g>
      {series.map((item, seriesIndex) => {
        const points = safePoints(item.data);
        const tone = item.tone ?? (item.emphasized ? "primary" : "secondary");
        const dash = item.dash ?? (seriesIndex % 2 === 0 ? "solid" : "dashed");
        const path = linePath(points, domain, context);
        const last = points.at(-1);

        return (
          <g
            className={item.emphasized ? "" : "auspex-chart__secondary-series"}
            data-series={item.id}
            key={item.id}
          >
            <ChartPath
              ariaLabel={`${item.label} line, ${points.length} points`}
              d={path}
              dash={dash}
              emphasized={item.emphasized}
              tone={tone}
            />
            {points.map((point, index) => (
              <ChartPointMark
                key={`${item.id}-${point.label}`}
                label={`${item.label}, ${point.label}: ${formatNumber(
                  point.value,
                )}`}
                tone={point.tone ?? tone}
                value={point.value}
                x={xForIndex(index, points.length, context)}
                y={yForValue(point.value, domain, context)}
              />
            ))}
            {last ? (
              <EndLabel
                label={`${item.label} ${formatNumber(last.value)}`}
                tone={tone}
                x={xForIndex(points.length - 1, points.length, context)}
                y={yForValue(last.value, domain, context)}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function renderSparkline(series: ChartSeries, context: RenderContext) {
  const points = safePoints(series.data);
  const domain = valueDomain(points.map((point) => point.value));
  const tone = series.tone ?? "secondary";

  return (
    <g data-series={series.id}>
      <ChartPath
        ariaLabel={`${series.label} sparkline, ${points.length} points`}
        d={linePath(points, domain, context)}
        dash={series.dash}
        emphasized={true}
        tone={tone}
      />
      {points.map((point, index) => (
        <ChartPointMark
          key={`${series.id}-${point.label}`}
          label={`${point.label}: ${formatNumber(point.value)}`}
          tone={point.tone ?? tone}
          value={point.value}
          x={xForIndex(index, points.length, context)}
          y={yForValue(point.value, domain, context)}
        />
      ))}
    </g>
  );
}

function renderBars(data: readonly ChartDatum[], context: RenderContext) {
  const points = safePoints(data);
  const domain = valueDomain([0, ...points.map((point) => point.value)]);
  const availableWidth = context.width - margin.left - margin.right;
  const barWidth = Math.max(
    18,
    availableWidth / Math.max(points.length, 1) - 14,
  );

  return (
    <g>
      {points.map((point, index) => {
        const x = xForIndex(index, points.length, context) - barWidth / 2;
        const y = yForValue(Math.max(point.value, 0), domain, context);
        const zero = yForValue(0, domain, context);
        const height = Math.abs(zero - y);
        const tone = point.tone ?? toneForSigned(point.value);

        return (
          <ChartRectMark
            height={height}
            key={point.label}
            label={`${point.label}: ${formatNumber(point.value)}`}
            tone={tone}
            value={point.value}
            width={barWidth}
            x={x}
            y={Math.min(y, zero)}
          />
        );
      })}
    </g>
  );
}

function renderGroupedBars(
  groups: readonly ChartGroup[],
  context: RenderContext,
) {
  const safeGroups = groups.filter((group) => group.values.length > 0);
  const allValues = safeGroups.flatMap((group) =>
    group.values.map((value) => value.value),
  );
  const domain = valueDomain([0, ...allValues]);
  const groupWidth =
    (context.width - margin.left - margin.right) /
    Math.max(safeGroups.length, 1);
  const barWidth = Math.max(8, groupWidth / 5);

  return (
    <g>
      {safeGroups.map((group, groupIndex) => (
        <g key={group.label}>
          {group.values.map((value, valueIndex) => {
            const x =
              margin.left +
              groupIndex * groupWidth +
              groupWidth / 2 -
              (group.values.length * barWidth) / 2 +
              valueIndex * barWidth;
            const y = yForValue(value.value, domain, context);
            const zero = yForValue(0, domain, context);
            const tone = value.tone ?? toneByIndex(valueIndex);

            return (
              <ChartRectMark
                height={Math.abs(zero - y)}
                key={`${group.label}-${value.label}`}
                label={`${group.label}, ${value.label}: ${formatNumber(
                  value.value,
                )}`}
                tone={tone}
                value={value.value}
                width={barWidth - 2}
                x={x}
                y={Math.min(y, zero)}
              />
            );
          })}
        </g>
      ))}
    </g>
  );
}

function renderStackedBars(
  groups: readonly ChartGroup[],
  context: RenderContext,
) {
  const safeGroups = groups.filter((group) => group.values.length > 0);
  const totals = safeGroups.map((group) =>
    group.values.reduce((sum, value) => sum + Math.max(value.value, 0), 0),
  );
  const domain = valueDomain([0, ...totals]);
  const availableWidth = context.width - margin.left - margin.right;
  const barWidth = Math.max(
    18,
    availableWidth / Math.max(safeGroups.length, 1) - 18,
  );

  return (
    <g>
      {safeGroups.map((group, groupIndex) => {
        let yCursor = yForValue(0, domain, context);
        const x =
          xForIndex(groupIndex, safeGroups.length, context) - barWidth / 2;

        return (
          <g key={group.label}>
            {group.values.map((value, valueIndex) => {
              const segmentHeight =
                yForValue(0, domain, context) -
                yForValue(Math.max(value.value, 0), domain, context);
              yCursor -= segmentHeight;

              return (
                <ChartRectMark
                  height={segmentHeight}
                  key={`${group.label}-${value.label}`}
                  label={`${group.label}, ${value.label}: ${formatNumber(
                    value.value,
                  )}`}
                  tone={value.tone ?? toneByIndex(valueIndex)}
                  value={value.value}
                  width={barWidth}
                  x={x}
                  y={yCursor}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function renderHorizontalBars(
  data: readonly ChartDatum[],
  context: RenderContext,
) {
  const points = safePoints(data);
  const maxValue = Math.max(1, ...points.map((point) => Math.abs(point.value)));
  const rowHeight =
    (context.height - margin.top - margin.bottom) / Math.max(points.length, 1);

  return (
    <g>
      {points.map((point, index) => {
        const width =
          ((context.width - margin.left - margin.right) *
            Math.abs(point.value)) /
          maxValue;
        const y = margin.top + index * rowHeight + rowHeight * 0.18;
        const tone = point.tone ?? toneForSigned(point.value);

        return (
          <g key={point.label}>
            <text
              className="auspex-chart__label fill-muted-foreground"
              x={margin.left - 8}
              y={y + rowHeight * 0.32}
            >
              {point.label}
            </text>
            <ChartRectMark
              height={Math.max(12, rowHeight * 0.44)}
              label={`${point.label}: ${formatNumber(point.value)}`}
              tone={tone}
              value={point.value}
              width={Math.max(8, width)}
              x={margin.left}
              y={y}
            />
          </g>
        );
      })}
    </g>
  );
}

function renderRanges(data: readonly ChartDatum[], context: RenderContext) {
  const points = safePoints(data);
  const values = points.flatMap((point) => [
    point.min ?? point.value,
    point.max ?? point.value,
    point.target ?? point.value,
    point.value,
  ]);
  const domain = valueDomain(values);
  const rowHeight =
    (context.height - margin.top - margin.bottom) / Math.max(points.length, 1);

  return (
    <g>
      {points.map((point, index) => {
        const low =
          point.min ?? Math.min(point.value, point.target ?? point.value);
        const high =
          point.max ?? Math.max(point.value, point.target ?? point.value);
        const y = margin.top + index * rowHeight + rowHeight / 2;
        const xLow = xForValue(low, domain, context);
        const xHigh = xForValue(high, domain, context);
        const xValue = xForValue(point.value, domain, context);
        const target = point.target;
        const tone = point.tone ?? "primary";

        return (
          <g key={point.label}>
            <line
              className="stroke-border"
              strokeLinecap="round"
              strokeWidth={10}
              x1={xLow}
              x2={xHigh}
              y1={y}
              y2={y}
            />
            {typeof target === "number" ? (
              <line
                className="stroke-warning"
                strokeWidth={3}
                x1={xForValue(target, domain, context)}
                x2={xForValue(target, domain, context)}
                y1={y - 18}
                y2={y + 18}
              />
            ) : null}
            <ChartPointMark
              label={`${point.label}: ${formatNumber(point.value)} in range ${formatNumber(
                low,
              )} to ${formatNumber(high)}`}
              radius={8}
              tone={tone}
              value={point.value}
              x={xValue}
              y={y}
            />
            <text
              className="auspex-chart__label fill-muted-foreground"
              x={margin.left - 8}
              y={y + 4}
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function renderRadar(axes: readonly ChartDatum[], context: RenderContext) {
  const safeAxes = safePoints(axes);
  const center = { x: context.width / 2, y: context.height / 2 };
  const radius = 112;
  const points = safeAxes.map((axis, index) => {
    const angle = angleForIndex(index, safeAxes.length) - Math.PI / 2;
    const max = Math.max(axis.max ?? 100, 1);
    const axisRadius = (clamp(axis.value, 0, max) / max) * radius;

    return {
      axis,
      x: center.x + Math.cos(angle) * axisRadius,
      xAxis: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * axisRadius,
      yAxis: center.y + Math.sin(angle) * radius,
    };
  });

  return (
    <g>
      {points.map((point) => (
        <g key={point.axis.label}>
          <line
            className="stroke-border"
            x1={center.x}
            x2={point.xAxis}
            y1={center.y}
            y2={point.yAxis}
          />
          <text
            className="auspex-chart__label fill-muted-foreground"
            x={point.xAxis}
            y={point.yAxis}
          >
            {point.axis.label}
          </text>
        </g>
      ))}
      <polygon
        className="auspex-chart__area"
        fill={toneColor("primary")}
        opacity={0.16}
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        stroke={toneColor("primary")}
        strokeWidth={3}
      />
      {points.map((point) => (
        <ChartPointMark
          key={`radar-${point.axis.label}`}
          label={`${point.axis.label}: ${formatNumber(point.axis.value)} of ${formatNumber(
            point.axis.max ?? 100,
          )}`}
          tone={point.axis.tone ?? "primary"}
          value={point.axis.value}
          x={point.x}
          y={point.y}
        />
      ))}
    </g>
  );
}

function renderScatter(data: readonly ChartDatum[], context: RenderContext) {
  const points = safePoints(data);
  const xDomain = valueDomain(points.map((point) => point.x ?? point.value));
  const yDomain = valueDomain(points.map((point) => point.y ?? point.value));

  return (
    <g>
      {points.map((point) => {
        const xValue = point.x ?? point.value;
        const yValue = point.y ?? point.value;

        return (
          <ChartPointMark
            key={point.label}
            label={`${point.label}: x ${formatNumber(xValue)}, y ${formatNumber(
              yValue,
            )}`}
            radius={7}
            tone={point.tone ?? "primary"}
            value={point.value}
            x={xForValue(xValue, xDomain, context)}
            y={yForValue(yValue, yDomain, context)}
          />
        );
      })}
    </g>
  );
}

function renderHistogram(data: readonly ChartDatum[], context: RenderContext) {
  return renderBars(data, context);
}

function renderGauge(metric: ChartDatum, context: RenderContext) {
  const min = metric.min ?? 0;
  const max = Math.max(metric.max ?? 100, min + 1);
  const percent = clamp((metric.value - min) / (max - min), 0, 1);
  const center = { x: context.width / 2, y: context.height / 2 + 52 };
  const radius = 118;
  const start = Math.PI;
  const end = Math.PI + percent * Math.PI;
  const needleAngle = end;
  const needle = {
    x: center.x + Math.cos(needleAngle) * (radius - 20),
    y: center.y + Math.sin(needleAngle) * (radius - 20),
  };

  return (
    <g>
      <path
        className="stroke-border"
        d={arcPath(center.x, center.y, radius, start, Math.PI * 2)}
        fill="none"
        strokeLinecap="round"
        strokeWidth={18}
      />
      <path
        aria-label={`${metric.label}: ${formatNumber(metric.value)} of ${formatNumber(
          max,
        )}`}
        className="auspex-chart__draw stroke-primary"
        d={arcPath(center.x, center.y, radius, start, end)}
        data-chart-mark="true"
        data-label={metric.label}
        data-signal="gauge"
        data-value={metric.value}
        fill="none"
        strokeLinecap="round"
        strokeWidth={18}
        tabIndex={0}
      >
        <title>{`${metric.label}: ${formatNumber(metric.value)} of ${formatNumber(
          max,
        )}`}</title>
      </path>
      <line
        className="stroke-warning"
        strokeLinecap="round"
        strokeWidth={4}
        x1={center.x}
        x2={needle.x}
        y1={center.y}
        y2={needle.y}
      />
      <text
        className="auspex-chart__value fill-warning"
        textAnchor="middle"
        x={center.x}
        y={center.y + 34}
      >
        {formatNumber(metric.value)}
      </text>
      <text
        className="auspex-chart__label fill-muted-foreground"
        textAnchor="middle"
        x={center.x}
        y={center.y + 58}
      >
        {metric.label}
      </text>
    </g>
  );
}

function renderDonut(segments: readonly ChartDatum[], context: RenderContext) {
  const safeSegments = safePoints(segments);
  const total = Math.max(
    1,
    safeSegments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0),
  );
  const center = { x: context.width / 2, y: context.height / 2 };
  const radius = 112;
  let cursor = -Math.PI / 2;

  return (
    <g>
      {safeSegments.map((segment, index) => {
        const angle = (Math.max(segment.value, 0) / total) * Math.PI * 2;
        const start = cursor;
        const end = cursor + angle;
        cursor = end;
        const tone = segment.tone ?? toneByIndex(index);

        return (
          <path
            aria-label={`${toneGlyphs[tone]} ${segment.label}: ${formatNumber(
              segment.value,
            )}`}
            className="auspex-chart__draw"
            d={arcPath(center.x, center.y, radius, start, end)}
            data-chart-mark="true"
            data-label={segment.label}
            data-signal={toneGlyphs[tone]}
            data-value={segment.value}
            fill="none"
            key={segment.label}
            stroke={toneColor(tone)}
            strokeLinecap="round"
            strokeWidth={28}
            tabIndex={0}
          >
            <title>{`${segment.label}: ${formatNumber(segment.value)}`}</title>
          </path>
        );
      })}
      <text
        className="auspex-chart__value fill-warning"
        textAnchor="middle"
        x={center.x}
        y={center.y + 6}
      >
        {formatNumber(total)}
      </text>
    </g>
  );
}

function renderActivityRings(
  rings: readonly ChartDatum[],
  context: RenderContext,
) {
  const safeRings = safePoints(rings);
  const center = { x: context.width / 2, y: context.height / 2 };

  return (
    <g>
      {safeRings.map((ring, index) => {
        const radius = 58 + index * 26;
        const max = Math.max(ring.max ?? 100, 1);
        const percent = clamp(ring.value / max, 0, 1);
        const tone = ring.tone ?? toneByIndex(index);

        return (
          <g key={ring.label}>
            <circle
              className="stroke-border"
              cx={center.x}
              cy={center.y}
              fill="none"
              r={radius}
              strokeWidth={14}
            />
            <path
              aria-label={`${toneGlyphs[tone]} ${ring.label}: ${formatNumber(
                ring.value,
              )} of ${formatNumber(max)}`}
              className="auspex-chart__draw"
              d={arcPath(
                center.x,
                center.y,
                radius,
                -Math.PI / 2,
                -Math.PI / 2 + percent * Math.PI * 2,
              )}
              data-chart-mark="true"
              data-label={ring.label}
              data-signal={toneGlyphs[tone]}
              data-value={ring.value}
              fill="none"
              stroke={toneColor(tone)}
              strokeLinecap="round"
              strokeWidth={14}
              tabIndex={0}
            >
              <title>{`${ring.label}: ${formatNumber(ring.value)} of ${formatNumber(
                max,
              )}`}</title>
            </path>
          </g>
        );
      })}
    </g>
  );
}

function renderEqualizer(data: readonly ChartDatum[], context: RenderContext) {
  return renderBars(data, context);
}

function renderHeatmap(cells: readonly ChartDatum[], context: RenderContext) {
  const safeCells = safePoints(cells);
  const maxX = Math.max(1, ...safeCells.map((cell) => cell.x ?? 0));
  const maxY = Math.max(1, ...safeCells.map((cell) => cell.y ?? 0));
  const cellWidth = (context.width - margin.left - margin.right) / (maxX + 1);
  const cellHeight = (context.height - margin.top - margin.bottom) / (maxY + 1);
  const maxValue = Math.max(1, ...safeCells.map((cell) => cell.value));

  return (
    <g>
      {safeCells.map((cell) => {
        const level = Math.ceil((clamp(cell.value / maxValue, 0, 1) || 0) * 4);
        const tone = cell.tone ?? "primary";

        return (
          <rect
            aria-label={`${cell.label}: level ${level}, ${formatNumber(
              cell.value,
            )}`}
            className="auspex-chart__mark"
            data-chart-mark="true"
            data-label={cell.label}
            data-level={level}
            data-signal={`${level}`}
            data-value={cell.value}
            fill={toneColor(tone)}
            fillOpacity={0.18 + level * 0.16}
            height={Math.max(16, cellHeight - 6)}
            key={cell.label}
            rx={6}
            tabIndex={0}
            width={Math.max(16, cellWidth - 6)}
            x={margin.left + (cell.x ?? 0) * cellWidth}
            y={margin.top + (cell.y ?? 0) * cellHeight}
          >
            <title>{`${cell.label}: ${formatNumber(cell.value)}`}</title>
          </rect>
        );
      })}
    </g>
  );
}

function renderBullets(data: readonly ChartDatum[], context: RenderContext) {
  return renderRanges(data, context);
}

function renderNodeGraph(
  nodes: readonly ChartNode[],
  edges: readonly ChartEdge[],
  context: RenderContext,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <g>
      {edges.map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);

        if (!source || !target) {
          return null;
        }

        return (
          <line
            className="stroke-border"
            key={`${edge.source}-${edge.target}`}
            strokeDasharray="6 8"
            x1={nodeX(source, context)}
            x2={nodeX(target, context)}
            y1={nodeY(source, context)}
            y2={nodeY(target, context)}
          />
        );
      })}
      {nodes.map((node) => {
        const tone = node.tone ?? (node.emphasized ? "primary" : "secondary");
        const label = `${toneGlyphs[tone]} ${node.label}${
          typeof node.value === "number" ? `: ${formatNumber(node.value)}` : ""
        }`;

        return (
          <g key={node.id}>
            <circle
              aria-label={label}
              className="auspex-chart__mark"
              cx={nodeX(node, context)}
              cy={nodeY(node, context)}
              data-chart-mark="true"
              data-label={node.label}
              data-signal={toneGlyphs[tone]}
              data-value={node.value ?? node.x}
              fill={toneColor(tone)}
              r={node.emphasized ? 14 : 10}
              stroke="var(--background)"
              strokeWidth={3}
              tabIndex={0}
            >
              <title>{label}</title>
            </circle>
            <text
              className="auspex-chart__label fill-muted-foreground"
              textAnchor="middle"
              x={nodeX(node, context)}
              y={nodeY(node, context) + 28}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function renderBankrollEquity(
  series: ChartSeries,
  floor: number,
  context: RenderContext,
) {
  const points = safePoints(series.data);
  const domain = valueDomain([
    floor,
    ...points.flatMap((point) => [point.value, point.secondaryValue ?? floor]),
  ]);
  const floorPath = linePath(
    points.map((point) => ({
      label: point.label,
      value: point.secondaryValue ?? floor,
    })),
    domain,
    context,
  );
  const last = points.at(-1);

  return (
    <g data-series={series.id}>
      <path
        className="auspex-chart__area"
        d={areaToBaselinePath(points, domain, context, floor)}
        data-signal={last && last.value <= floor ? "floor-crossing" : "$"}
        fill={toneColor(last && last.value <= floor ? "negative" : "value")}
        opacity={0.18}
      />
      <ChartPath
        ariaLabel={`${series.label} bankroll balance, ${points.length} points`}
        d={linePath(points, domain, context)}
        emphasized={true}
        tone="value"
      />
      <path
        aria-label={`$ floor baseline: ${formatNumber(floor)}`}
        className="auspex-chart__draw"
        d={floorPath}
        data-chart-mark="true"
        data-signal="floor"
        fill="none"
        stroke={toneColor("secondary")}
        strokeDasharray="8 8"
        strokeLinecap="round"
        strokeWidth={2.5}
        tabIndex={0}
      >
        <title>{`floor baseline: ${formatNumber(floor)}`}</title>
      </path>
      {points.map((point, index) => {
        const pointFloor = point.secondaryValue ?? floor;
        const tone =
          point.tone ?? (point.value >= pointFloor ? "positive" : "negative");
        return (
          <ChartPointMark
            key={`${series.id}-${point.label}`}
            label={`${point.label}: ${formatNumber(
              point.value,
            )}, floor ${formatNumber(pointFloor)}${
              point.meta ? `, ${point.meta}` : ""
            }`}
            radius={point.meta ? 7 : 5}
            tone={tone}
            value={point.value}
            x={xForIndex(index, points.length, context)}
            y={yForValue(point.value, domain, context)}
          />
        );
      })}
      {last ? (
        <EndLabel
          label={`${series.label} ${formatNumber(last.value)}`}
          tone="value"
          x={xForIndex(points.length - 1, points.length, context)}
          y={yForValue(last.value, domain, context)}
        />
      ) : null}
    </g>
  );
}

function renderStandingsBump(
  series: readonly ChartSeries[],
  context: RenderContext,
  highlightedSeriesId?: string,
) {
  const allRanks = series.flatMap((item) =>
    safePoints(item.data).map((point) => point.value),
  );
  const maxRank = Math.max(1, ...allRanks);

  return (
    <g>
      <text
        className="auspex-chart__label fill-muted-foreground"
        x={margin.left - 8}
        y={margin.top + 4}
      >
        #1
      </text>
      <text
        className="auspex-chart__label fill-muted-foreground"
        x={margin.left - 8}
        y={context.height - margin.bottom}
      >
        #{maxRank}
      </text>
      {series.map((item, seriesIndex) => {
        const points = safePoints(item.data);
        const emphasized =
          item.emphasized ||
          item.id === highlightedSeriesId ||
          seriesIndex === 0;
        const tone = item.tone ?? (emphasized ? "primary" : "secondary");
        const dash = item.dash ?? (seriesIndex % 2 === 0 ? "solid" : "dashed");
        const last = points.at(-1);

        return (
          <g
            className={emphasized ? "" : "auspex-chart__secondary-series"}
            data-series={item.id}
            key={item.id}
          >
            <ChartPath
              ariaLabel={`${item.label} rank line, ${points.length} weeks`}
              d={rankPath(points, maxRank, context)}
              dash={dash}
              emphasized={emphasized}
              tone={tone}
            />
            {points.map((point, index) => (
              <ChartPointMark
                key={`${item.id}-${point.label}`}
                label={`${item.label}, ${point.label}: rank ${formatNumber(
                  point.value,
                )}${rankDeltaLabel(point)}`}
                tone={point.tone ?? tone}
                value={point.value}
                x={xForIndex(index, points.length, context)}
                y={yForRank(point.value, maxRank, context)}
              />
            ))}
            {last ? (
              <EndLabel
                label={`${item.label} #${formatNumber(last.value)}`}
                tone={tone}
                x={xForIndex(points.length - 1, points.length, context)}
                y={yForRank(last.value, maxRank, context)}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function renderPlayoffOddsCone(
  data: readonly ChartDatum[],
  context: RenderContext,
) {
  const points = safePoints(data);
  const domain = valueDomain([
    0,
    100,
    ...points.flatMap((point) => [
      point.min ?? point.value,
      point.value,
      point.max ?? point.value,
      point.target ?? 50,
    ]),
  ]);
  const threshold = points.find(
    (point) => typeof point.target === "number",
  )?.target;

  return (
    <g>
      <path
        aria-label="P10 to P90 playoff odds uncertainty band"
        className="auspex-chart__area"
        d={bandPath(points, domain, context, "min", "max")}
        data-signal="p10-p90"
        fill={toneColor("secondary")}
        opacity={0.22}
      >
        <title>p10 to p90 percentile band</title>
      </path>
      {typeof threshold === "number" ? (
        <line
          aria-label={`threshold: ${formatNumber(threshold)} percent`}
          className="stroke-warning"
          data-chart-mark="true"
          data-signal="threshold"
          data-value={threshold}
          strokeDasharray="5 8"
          strokeWidth={2}
          tabIndex={0}
          x1={margin.left}
          x2={context.width - margin.right}
          y1={yForValue(threshold, domain, context)}
          y2={yForValue(threshold, domain, context)}
        >
          <title>{`threshold ${formatNumber(threshold)} percent`}</title>
        </line>
      ) : null}
      <ChartPath
        ariaLabel={`median playoff odds, ${points.length} points`}
        d={linePath(points, domain, context)}
        emphasized={true}
        tone="primary"
      />
      {points.map((point, index) => (
        <ChartPointMark
          key={point.label}
          label={`${point.label}: ${formatNumber(
            point.value,
          )}% median, band ${formatNumber(
            point.min ?? point.value,
          )}-${formatNumber(point.max ?? point.value)}%`}
          tone={point.tone ?? oddsTone(point.value)}
          value={point.value}
          x={xForIndex(index, points.length, context)}
          y={yForValue(point.value, domain, context)}
        />
      ))}
    </g>
  );
}

function renderWinProbabilityTimeline(
  series: ChartSeries,
  context: RenderContext,
  swings: readonly ChartDatum[] = [],
) {
  const points = safePoints(series.data);
  const domain = [0, 100] as const;
  const midlineY = yForValue(50, domain, context);

  return (
    <g data-series={series.id}>
      <line
        className="stroke-border"
        strokeDasharray="5 8"
        x1={margin.left}
        x2={context.width - margin.right}
        y1={midlineY}
        y2={midlineY}
      />
      <text
        className="auspex-chart__label fill-muted-foreground"
        x={context.width - margin.right - 44}
        y={midlineY - 8}
      >
        even
      </text>
      <ChartPath
        ariaLabel={`${series.label} win probability, ${points.length} updates`}
        d={linePath(points, domain, context)}
        emphasized={true}
        tone="primary"
      />
      {points.map((point, index) => (
        <ChartPointMark
          key={`${series.id}-${point.label}`}
          label={`${point.label}: ${formatNumber(point.value)}% win probability`}
          tone={point.tone ?? oddsTone(point.value)}
          value={point.value}
          x={xForIndex(index, points.length, context)}
          y={yForValue(point.value, domain, context)}
        />
      ))}
      {swings.map((swing) => {
        const index = pointIndexForLabel(points, swing.label);
        return (
          <ChartDiamondMark
            key={`swing-${swing.label}`}
            label={`swing ${swing.label}: ${formatNumber(swing.value)} points${
              swing.meta ? `, ${swing.meta}` : ""
            }`}
            tone={swing.tone ?? toneForSigned(swing.value)}
            value={swing.value}
            x={xForIndex(index, points.length, context)}
            y={yForValue(points[index]?.value ?? 50, domain, context)}
          />
        );
      })}
    </g>
  );
}

function renderOddsMovement(
  series: ChartSeries,
  context: RenderContext,
  lockedLabel?: string,
) {
  const points = safePoints(series.data);
  const domain = valueDomain(points.map((point) => point.value));
  const lockedIndex =
    lockedLabel === undefined
      ? -1
      : points.findIndex((point) => point.label === lockedLabel);
  const last = points.at(-1);

  return (
    <g data-series={series.id}>
      <ChartPath
        ariaLabel={`${series.label} odds movement, ${points.length} snapshots`}
        d={linePath(points, domain, context)}
        emphasized={true}
        tone="secondary"
      />
      {points.map((point, index) => {
        const isLocked = index === lockedIndex;
        const isCurrent = index === points.length - 1;
        return (
          <ChartPointMark
            key={`${series.id}-${point.label}`}
            label={`${point.label}: ${formatNumber(point.value)}${
              isLocked ? ", locked" : ""
            }${isCurrent ? ", current" : ""}`}
            radius={isLocked || isCurrent ? 7 : 4}
            tone={
              point.tone ??
              (isLocked ? "positive" : isCurrent ? "primary" : "secondary")
            }
            value={point.value}
            x={xForIndex(index, points.length, context)}
            y={yForValue(point.value, domain, context)}
          />
        );
      })}
      {last ? (
        <EndLabel
          label={`current ${formatNumber(last.value)}`}
          tone="value"
          x={xForIndex(points.length - 1, points.length, context)}
          y={yForValue(last.value, domain, context)}
        />
      ) : null}
    </g>
  );
}

function renderSeasonArc(cells: readonly ChartDatum[], context: RenderContext) {
  const points = safePoints(cells);
  const cellWidth =
    (context.width - margin.left - margin.right) / Math.max(points.length, 1);
  const y = context.height / 2 - 24;

  return (
    <g>
      {points.map((cell, index) => {
        const tone = cell.tone ?? toneForSigned(cell.value);
        const glyph = resultGlyph(cell.value, cell.meta);
        const x = margin.left + index * cellWidth;

        return (
          <g key={cell.label}>
            <rect
              aria-label={`${cell.label}: ${glyph}, score ${formatNumber(
                Math.abs(cell.value),
              )}${cell.meta ? `, ${cell.meta}` : ""}`}
              className="auspex-chart__mark auspex-chart__grow"
              data-chart-mark="true"
              data-label={cell.label}
              data-signal={glyph}
              data-value={cell.value}
              fill={toneColor(tone)}
              fillOpacity={0.82}
              height={48}
              rx={7}
              tabIndex={0}
              width={Math.max(18, cellWidth - 8)}
              x={x}
              y={y}
            >
              <title>{`${cell.label}: ${glyph}`}</title>
            </rect>
            <text
              className="auspex-chart__label fill-background"
              textAnchor="middle"
              x={x + Math.max(18, cellWidth - 8) / 2}
              y={y + 30}
            >
              {glyph}
            </text>
            {cell.secondaryValue ? (
              <line
                className="stroke-warning"
                strokeWidth={3}
                x1={x}
                x2={x + Math.max(18, cellWidth - 8)}
                y1={y - 8}
                y2={y - 8}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function renderHeadToHeadFlow(
  meetings: readonly ChartDatum[],
  context: RenderContext,
  participantALabel: string,
  participantBLabel: string,
) {
  const points = safePoints(meetings);
  const maxMargin = Math.max(
    1,
    ...points.map((point) => Math.abs(point.value)),
  );
  const centerY = context.height / 2;
  const path = points
    .map((point, index) => {
      const x = xForIndex(index, points.length, context);
      const y =
        centerY -
        (point.value / maxMargin) *
          ((context.height - margin.top - margin.bottom) / 2 - 16);
      return `${index === 0 ? "M" : "L"} ${round(x)} ${round(y)}`;
    })
    .join(" ");

  return (
    <g>
      <line
        className="stroke-border"
        key="projection-centerline"
        x1={margin.left}
        x2={context.width - margin.right}
        y1={centerY}
        y2={centerY}
      />
      <text
        className="auspex-chart__label fill-primary"
        x={margin.left}
        y={centerY - 82}
      >
        {participantALabel}
      </text>
      <text
        className="auspex-chart__label fill-muted-foreground"
        x={margin.left}
        y={centerY + 92}
      >
        {participantBLabel}
      </text>
      <ChartPath
        ariaLabel={`${participantALabel} versus ${participantBLabel} meeting flow`}
        d={path}
        emphasized={true}
        tone="primary"
      />
      {points.map((point, index) => {
        const winner = point.value >= 0 ? participantALabel : participantBLabel;
        const y =
          centerY -
          (point.value / maxMargin) *
            ((context.height - margin.top - margin.bottom) / 2 - 16);
        return (
          <ChartPointMark
            key={point.label}
            label={`${point.label}: ${winner} by ${formatNumber(
              Math.abs(point.value),
            )}${point.meta ? `, ${point.meta}` : ""}`}
            radius={5 + Math.min(8, (Math.abs(point.value) / maxMargin) * 8)}
            tone={point.tone ?? (point.value >= 0 ? "primary" : "secondary")}
            value={point.value}
            x={xForIndex(index, points.length, context)}
            y={y}
          />
        );
      })}
    </g>
  );
}

function renderActivityCalendar(
  cells: readonly ChartDatum[],
  context: RenderContext,
) {
  return renderHeatmap(cells, context);
}

function renderPowerRankingLadder(
  rankings: readonly ChartDatum[],
  context: RenderContext,
) {
  const points = [...safePoints(rankings)].sort((a, b) => a.value - b.value);
  const rowHeight =
    (context.height - margin.top - margin.bottom) / Math.max(points.length, 1);
  const maxDelta = Math.max(
    1,
    ...points.map((point) => Math.abs(point.secondaryValue ?? 0)),
  );

  return (
    <g>
      {points.map((point, index) => {
        const delta = point.secondaryValue ?? 0;
        const tone = point.tone ?? toneForSigned(-delta);
        const width =
          (context.width - margin.left - margin.right) *
          (1 - Math.min(Math.abs(delta) / (maxDelta * 5), 0.25));
        const y = margin.top + index * rowHeight + rowHeight * 0.14;

        return (
          <g key={point.label}>
            <rect
              aria-label={`rank ${formatNumber(point.value)}, ${
                point.label
              }, movement ${movementGlyph(delta)}${formatNumber(
                Math.abs(delta),
              )}${point.meta ? `, ${point.meta}` : ""}`}
              className="auspex-chart__mark auspex-chart__grow"
              data-chart-mark="true"
              data-label={point.label}
              data-signal={movementGlyph(delta)}
              data-value={point.value}
              fill={toneColor(point.tone ?? "primary")}
              fillOpacity={point.tone === "primary" ? 0.28 : 0.14}
              height={Math.max(18, rowHeight * 0.58)}
              rx={7}
              stroke={toneColor(tone)}
              strokeWidth={1.5}
              tabIndex={0}
              width={Math.max(180, width)}
              x={margin.left}
              y={y}
            >
              <title>{`${point.label}: rank ${formatNumber(point.value)}`}</title>
            </rect>
            <text
              className="auspex-chart__label fill-foreground"
              x={margin.left + 12}
              y={y + rowHeight * 0.36}
            >
              #{formatNumber(point.value)} {point.label}
            </text>
            <text
              className="auspex-chart__label"
              fill={toneColor(tone)}
              textAnchor="end"
              x={context.width - margin.right - 8}
              y={y + rowHeight * 0.36}
            >
              {movementGlyph(delta)}
              {formatNumber(Math.abs(delta))}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function renderLeverageGauge(
  metric: ChartDatum,
  factors: readonly ChartDatum[] = [],
  context: RenderContext,
) {
  return (
    <g>
      <g key="leverage-gauge-core">
        {renderGauge(
          {
            ...metric,
            label: `${metric.label} ${leverageTier(metric.value, metric.max)}`,
          },
          context,
        )}
      </g>
      {factors.slice(0, 3).map((factor, index) => (
        <text
          className="auspex-chart__label fill-muted-foreground"
          key={factor.label}
          x={margin.left}
          y={context.height - margin.bottom + 6 + index * 18}
        >
          {factor.label}: {formatNumber(factor.value)}
        </text>
      ))}
    </g>
  );
}

function renderRecordChase(
  metric: ChartDatum,
  context: RenderContext,
  holderLabel?: string,
) {
  const min = metric.min ?? 0;
  const target = metric.target ?? metric.max ?? Math.max(metric.value, 1);
  const max = Math.max(metric.max ?? target * 1.1, target, metric.value, 1);
  const domain = [min, max] as const;
  const y = context.height / 2;
  const xMin = xForValue(min, domain, context);
  const xValue = xForValue(metric.value, domain, context);
  const xTarget = xForValue(target, domain, context);
  const crossed = metric.value >= target;
  const needed = Math.max(0, target - metric.value);

  return (
    <g>
      <line
        className="stroke-border"
        strokeLinecap="round"
        strokeWidth={18}
        x1={xMin}
        x2={xForValue(max, domain, context)}
        y1={y}
        y2={y}
      />
      <ChartRectMark
        height={18}
        label={`${metric.label}: current ${formatNumber(
          metric.value,
        )}, target ${formatNumber(target)}, needs ${formatNumber(needed)}`}
        tone={crossed ? "positive" : (metric.tone ?? "primary")}
        value={metric.value}
        width={Math.max(8, xValue - xMin)}
        x={xMin}
        y={y - 9}
      />
      <line
        aria-label={`record target: ${formatNumber(target)}${
          holderLabel ? `, held by ${holderLabel}` : ""
        }`}
        className="stroke-warning"
        data-chart-mark="true"
        data-signal="record"
        data-value={target}
        strokeWidth={4}
        tabIndex={0}
        x1={xTarget}
        x2={xTarget}
        y1={y - 34}
        y2={y + 34}
      >
        <title>{`record target ${formatNumber(target)}`}</title>
      </line>
      <text
        className="auspex-chart__value"
        fill={toneColor(crossed ? "positive" : "value")}
        textAnchor="middle"
        x={context.width / 2}
        y={y + 62}
      >
        {crossed ? "RECORD" : `${formatNumber(needed)} to go`}
      </text>
    </g>
  );
}

function renderProjectionViolin(
  distribution: readonly ChartDatum[],
  summary: ChartDatum,
  context: RenderContext,
) {
  const points = safePoints(distribution);
  const maxDensity = Math.max(1, ...points.map((point) => point.value));
  const centerY = context.height / 2;
  const rowWidth =
    (context.width - margin.left - margin.right) / Math.max(points.length, 1);
  const domain = valueDomain([
    summary.min ?? 0,
    summary.value,
    summary.max ?? summary.value,
  ]);

  return (
    <g>
      <line
        className="stroke-border"
        x1={margin.left}
        x2={context.width - margin.right}
        y1={centerY}
        y2={centerY}
      />
      {points.map((point, index) => {
        const height =
          (point.value / maxDensity) *
          ((context.height - margin.top - margin.bottom) / 2 - 12);
        const x = margin.left + index * rowWidth + rowWidth * 0.18;
        return (
          <rect
            aria-label={`${point.label}: density ${formatNumber(point.value)}`}
            className="auspex-chart__mark auspex-chart__grow"
            data-chart-mark="true"
            data-label={point.label}
            data-signal="density"
            data-value={point.value}
            fill={toneColor(point.tone ?? "secondary")}
            fillOpacity={0.32}
            height={Math.max(2, height * 2)}
            key={point.label}
            rx={7}
            tabIndex={0}
            width={Math.max(8, rowWidth * 0.64)}
            x={x}
            y={centerY - height}
          >
            <title>{`${point.label}: density ${formatNumber(point.value)}`}</title>
          </rect>
        );
      })}
      <g key="projection-summary">
        <line
          aria-label={`floor: ${formatNumber(summary.min ?? summary.value)}`}
          className="stroke-warning"
          data-chart-mark="true"
          data-signal="floor"
          data-value={summary.min ?? summary.value}
          strokeDasharray="4 6"
          strokeWidth={2}
          tabIndex={0}
          x1={xForValue(summary.min ?? summary.value, domain, context)}
          x2={xForValue(summary.min ?? summary.value, domain, context)}
          y1={margin.top}
          y2={context.height - margin.bottom}
        />
        <line
          aria-label={`median: ${formatNumber(summary.value)}`}
          className="stroke-primary"
          data-chart-mark="true"
          data-signal="median"
          data-value={summary.value}
          strokeWidth={3}
          tabIndex={0}
          x1={xForValue(summary.value, domain, context)}
          x2={xForValue(summary.value, domain, context)}
          y1={margin.top}
          y2={context.height - margin.bottom}
        />
        <line
          aria-label={`ceiling: ${formatNumber(summary.max ?? summary.value)}`}
          className="stroke-warning"
          data-chart-mark="true"
          data-signal="ceiling"
          data-value={summary.max ?? summary.value}
          strokeDasharray="4 6"
          strokeWidth={2}
          tabIndex={0}
          x1={xForValue(summary.max ?? summary.value, domain, context)}
          x2={xForValue(summary.max ?? summary.value, domain, context)}
          y1={margin.top}
          y2={context.height - margin.bottom}
        />
      </g>
    </g>
  );
}

function renderSeasonDial(
  weeks: readonly ChartDatum[],
  currentWeek: number,
  totalWeeks: number,
  context: RenderContext,
  events: readonly ChartDatum[] = [],
) {
  const center = { x: context.width / 2, y: context.height / 2 };
  const radius = 112;
  const progress = clamp(currentWeek / Math.max(totalWeeks, 1), 0, 1);

  return (
    <g>
      <path
        className="stroke-border"
        d={arcPath(center.x, center.y, radius, -Math.PI / 2, Math.PI * 1.5)}
        fill="none"
        strokeLinecap="round"
        strokeWidth={22}
      />
      <path
        aria-label={`season progress: week ${formatNumber(
          currentWeek,
        )} of ${formatNumber(totalWeeks)}`}
        className="auspex-chart__draw"
        d={arcPath(
          center.x,
          center.y,
          radius,
          -Math.PI / 2,
          -Math.PI / 2 + progress * Math.PI * 2,
        )}
        data-chart-mark="true"
        data-signal="season-progress"
        data-value={currentWeek}
        fill="none"
        stroke={toneColor("primary")}
        strokeLinecap="round"
        strokeWidth={22}
        tabIndex={0}
      >
        <title>{`Week ${formatNumber(currentWeek)} of ${formatNumber(
          totalWeeks,
        )}`}</title>
      </path>
      {weeks.map((week) => {
        const weekNumber = week.x ?? week.value;
        const angle =
          -Math.PI / 2 +
          clamp(weekNumber / Math.max(totalWeeks, 1), 0, 1) * Math.PI * 2;
        const inner = radius - 18;
        const outer = radius + 18;
        return (
          <line
            aria-label={`${week.label}: ${week.meta ?? "regular season"}`}
            className="auspex-chart__mark"
            data-chart-mark="true"
            data-label={week.label}
            data-signal={week.meta ?? "week"}
            data-value={weekNumber}
            key={week.label}
            stroke={toneColor(week.tone ?? "secondary")}
            strokeWidth={week.tone === "value" ? 4 : 2}
            tabIndex={0}
            x1={center.x + Math.cos(angle) * inner}
            x2={center.x + Math.cos(angle) * outer}
            y1={center.y + Math.sin(angle) * inner}
            y2={center.y + Math.sin(angle) * outer}
          >
            <title>{`${week.label}: ${week.meta ?? "regular season"}`}</title>
          </line>
        );
      })}
      {events.map((event) => {
        const weekNumber = event.x ?? event.value;
        const angle =
          -Math.PI / 2 +
          clamp(weekNumber / Math.max(totalWeeks, 1), 0, 1) * Math.PI * 2;
        return (
          <ChartDiamondMark
            key={`season-event-${event.label}`}
            label={`${event.label}: week ${formatNumber(weekNumber)}${
              event.meta ? `, ${event.meta}` : ""
            }`}
            tone={event.tone ?? "value"}
            value={weekNumber}
            x={center.x + Math.cos(angle) * (radius + 34)}
            y={center.y + Math.sin(angle) * (radius + 34)}
          />
        );
      })}
      <text
        className="auspex-chart__value fill-warning"
        textAnchor="middle"
        x={center.x}
        y={center.y + 2}
      >
        W{formatNumber(currentWeek)}
      </text>
      <text
        className="auspex-chart__label fill-muted-foreground"
        textAnchor="middle"
        x={center.x}
        y={center.y + 28}
      >
        of {formatNumber(totalWeeks)}
      </text>
    </g>
  );
}

function ChartPath({
  ariaLabel,
  d,
  dash,
  emphasized,
  tone,
}: {
  readonly ariaLabel: string;
  readonly d: string;
  readonly dash?: ChartDash;
  readonly emphasized?: boolean;
  readonly tone: ChartTone;
}) {
  const style = {
    "--chart-path-length": String(pathLengthEstimate(d)),
  } as CSSProperties;

  return (
    <path
      aria-label={ariaLabel}
      className="auspex-chart__draw"
      d={d}
      data-chart-mark="true"
      data-dash={dash ?? "solid"}
      data-signal={dash ?? "solid"}
      fill="none"
      stroke={toneColor(tone)}
      strokeDasharray={
        dashPatterns[dash ?? "solid"] ?? "var(--chart-path-length)"
      }
      strokeDashoffset={
        dashPatterns[dash ?? "solid"] ? undefined : "var(--chart-path-length)"
      }
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={emphasized ? 4 : 2.5}
      style={style}
      tabIndex={0}
    >
      <title>{ariaLabel}</title>
    </path>
  );
}

function ChartPointMark({
  label,
  radius = 5,
  tone,
  value,
  x,
  y,
}: {
  readonly label: string;
  readonly radius?: number;
  readonly tone: ChartTone;
  readonly value: number;
  readonly x: number;
  readonly y: number;
}) {
  return (
    <circle
      aria-label={`${toneGlyphs[tone]} ${label}`}
      className="auspex-chart__mark"
      cx={x}
      cy={y}
      data-chart-mark="true"
      data-label={label}
      data-signal={toneGlyphs[tone]}
      data-value={value}
      fill={toneColor(tone)}
      r={radius}
      stroke="var(--background)"
      strokeWidth={2}
      tabIndex={0}
    >
      <title>{`${toneGlyphs[tone]} ${label}`}</title>
    </circle>
  );
}

function ChartDiamondMark({
  label,
  radius = 7,
  tone,
  value,
  x,
  y,
}: {
  readonly label: string;
  readonly radius?: number;
  readonly tone: ChartTone;
  readonly value: number;
  readonly x: number;
  readonly y: number;
}) {
  return (
    <rect
      aria-label={`${toneGlyphs[tone]} ${label}`}
      className="auspex-chart__mark auspex-chart__grow"
      data-chart-mark="true"
      data-label={label}
      data-signal={`${toneGlyphs[tone]} diamond`}
      data-value={value}
      fill={toneColor(tone)}
      height={radius * 2}
      rx={3}
      tabIndex={0}
      transform={`rotate(45 ${x} ${y})`}
      width={radius * 2}
      x={x - radius}
      y={y - radius}
    >
      <title>{`${toneGlyphs[tone]} ${label}`}</title>
    </rect>
  );
}

function ChartRectMark({
  height,
  label,
  tone,
  value,
  width,
  x,
  y,
}: {
  readonly height: number;
  readonly label: string;
  readonly tone: ChartTone;
  readonly value: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}) {
  return (
    <rect
      aria-label={`${toneGlyphs[tone]} ${label}`}
      className="auspex-chart__mark auspex-chart__grow"
      data-chart-mark="true"
      data-label={label}
      data-signal={toneGlyphs[tone]}
      data-value={value}
      fill={toneColor(tone)}
      height={Math.max(1, height)}
      rx={7}
      tabIndex={0}
      width={Math.max(1, width)}
      x={x}
      y={y}
    >
      <title>{`${toneGlyphs[tone]} ${label}`}</title>
    </rect>
  );
}

function EndLabel({
  label,
  tone,
  x,
  y,
}: {
  readonly label: string;
  readonly tone: ChartTone;
  readonly x: number;
  readonly y: number;
}) {
  return (
    <text
      className="auspex-chart__label"
      fill={toneColor(tone)}
      x={Math.min(x + 10, viewBox.width - 120)}
      y={y + 4}
    >
      {label}
    </text>
  );
}

function ChartTableDetails({
  table,
  title,
}: {
  readonly table: ChartTable;
  readonly title: string;
}) {
  return (
    <details className="auspex-chart-table" data-slot="chart-table-toggle">
      <summary className="metric cursor-pointer text-xs text-muted-foreground focus-visible:shadow-[var(--focus-ring-shadow)]">
        View as table
      </summary>
      <div className="auspex-chart-table__data sr-only">
        <table className="w-full text-left text-sm" data-slot="chart-table">
          <caption>{title}</caption>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th className="eyebrow px-2 py-1" key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr data-label={row.label} key={row.label}>
                <th className="px-2 py-1 text-muted-foreground" scope="row">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td
                    className="metric px-2 py-1"
                    key={`${row.label}-${index}`}
                  >
                    {String(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function chartTableForSpec(spec: AUSPEXChartSpec): ChartTable {
  switch (spec.kind) {
    case "line-area":
    case "sparkline":
      return tableForSeries(spec.series);
    case "multi-line":
      return tableForMultiSeries(spec.series);
    case "bars":
    case "equalizer":
    case "hbars":
    case "histogram":
      return {
        columns: ["Label", "Value", "Signal"],
        rows: safePoints(spec.data).map((point) => ({
          label: point.label,
          values: [
            point.value,
            toneGlyphs[point.tone ?? toneForSigned(point.value)],
          ],
        })),
      };
    case "grouped-bars":
    case "stacked-bars":
      return tableForGroups(spec.groups);
    case "range":
    case "bullet":
      return {
        columns: ["Label", "Min", "Value", "Max", "Target"],
        rows: safePoints(spec.data).map((point) => ({
          label: point.label,
          values: [
            point.min ?? "",
            point.value,
            point.max ?? "",
            point.target ?? "",
          ],
        })),
      };
    case "radar":
      return {
        columns: ["Axis", "Value", "Max"],
        rows: safePoints(spec.axes).map((axis) => ({
          label: axis.label,
          values: [axis.value, axis.max ?? 100],
        })),
      };
    case "scatter":
      return {
        columns: ["Point", "X", "Y"],
        rows: safePoints(spec.data).map((point) => ({
          label: point.label,
          values: [point.x ?? point.value, point.y ?? point.value],
        })),
      };
    case "gauge":
      return {
        columns: ["Metric", "Min", "Value", "Max"],
        rows: [
          {
            label: spec.metric.label,
            values: [
              spec.metric.min ?? 0,
              spec.metric.value,
              spec.metric.max ?? 100,
            ],
          },
        ],
      };
    case "donut":
      return {
        columns: ["Segment", "Value", "Signal"],
        rows: safePoints(spec.segments).map((segment, index) => ({
          label: segment.label,
          values: [
            segment.value,
            toneGlyphs[segment.tone ?? toneByIndex(index)],
          ],
        })),
      };
    case "activity-rings":
      return {
        columns: ["Ring", "Value", "Max"],
        rows: safePoints(spec.rings).map((ring) => ({
          label: ring.label,
          values: [ring.value, ring.max ?? 100],
        })),
      };
    case "heatmap":
      return {
        columns: ["Cell", "X", "Y", "Value"],
        rows: safePoints(spec.cells).map((cell) => ({
          label: cell.label,
          values: [cell.x ?? 0, cell.y ?? 0, cell.value],
        })),
      };
    case "node-graph":
      return {
        columns: ["Node", "X", "Y", "Value"],
        rows: spec.nodes.map((node) => ({
          label: node.label,
          values: [node.x, node.y, node.value ?? ""],
        })),
      };
    case "bankroll-equity":
      return {
        columns: ["Point", "Balance", "Floor", "Event", "Signal"],
        rows: safePoints(spec.series.data).map((point) => {
          const pointFloor = point.secondaryValue ?? spec.floor;
          return {
            label: point.label,
            values: [
              point.value,
              pointFloor,
              point.meta ?? "",
              point.value >= pointFloor ? "+" : "-",
            ],
          };
        }),
      };
    case "standings-bump":
      return tableForMultiSeries(spec.series);
    case "playoff-odds-cone":
      return {
        columns: ["Point", "P10", "Median", "P90", "Threshold"],
        rows: safePoints(spec.data).map((point) => ({
          label: point.label,
          values: [
            point.min ?? point.value,
            point.value,
            point.max ?? point.value,
            point.target ?? "",
          ],
        })),
      };
    case "win-probability-timeline":
      return {
        columns: ["Update", "Win probability", "Swing", "Event"],
        rows: [
          ...safePoints(spec.series.data).map((point) => ({
            label: point.label,
            values: [point.value, "", point.meta ?? ""],
          })),
          ...(spec.swings ?? []).map((swing) => ({
            label: `Swing ${swing.label}`,
            values: ["", swing.value, swing.meta ?? ""],
          })),
        ],
      };
    case "odds-movement":
      return {
        columns: ["Snapshot", "Line", "State"],
        rows: safePoints(spec.series.data).map((point) => ({
          label: point.label,
          values: [
            point.value,
            point.label === spec.lockedLabel
              ? "locked"
              : point === spec.series.data.at(-1)
                ? "current"
                : "",
          ],
        })),
      };
    case "season-arc":
      return {
        columns: ["Week", "Result", "Score", "Flag"],
        rows: safePoints(spec.cells).map((cell) => ({
          label: cell.label,
          values: [
            resultGlyph(cell.value, cell.meta),
            Math.abs(cell.value),
            cell.meta ?? "",
          ],
        })),
      };
    case "head-to-head-flow":
      return {
        columns: ["Meeting", "Winner", "Margin", "Context"],
        rows: safePoints(spec.meetings).map((meeting) => ({
          label: meeting.label,
          values: [
            meeting.value >= 0
              ? spec.participantALabel
              : spec.participantBLabel,
            Math.abs(meeting.value),
            meeting.meta ?? "",
          ],
        })),
      };
    case "activity-calendar":
      return {
        columns: ["Date", "X", "Y", "Activity", "Level"],
        rows: safePoints(spec.cells).map((cell) => ({
          label: cell.label,
          values: [
            cell.x ?? 0,
            cell.y ?? 0,
            cell.value,
            cell.meta ?? activityLevel(cell.value),
          ],
        })),
      };
    case "power-ranking-ladder":
      return {
        columns: ["Rank", "Manager", "Movement", "Rationale"],
        rows: safePoints(spec.rankings).map((point) => ({
          label: point.label,
          values: [
            point.value,
            `${movementGlyph(point.secondaryValue ?? 0)}${formatNumber(
              Math.abs(point.secondaryValue ?? 0),
            )}`,
            point.meta ?? "",
          ],
        })),
      };
    case "leverage-gauge":
      return {
        columns: ["Factor", "Tier", "Value", "Max"],
        rows: [
          {
            label: spec.metric.label,
            values: [
              leverageTier(spec.metric.value, spec.metric.max),
              spec.metric.value,
              spec.metric.max ?? 100,
            ],
          },
          ...(spec.factors ?? []).map((factor) => ({
            label: factor.label,
            values: [factor.meta ?? "", factor.value, factor.max ?? ""],
          })),
        ],
      };
    case "record-chase": {
      const target = spec.metric.target ?? spec.metric.max ?? spec.metric.value;
      return {
        columns: ["Metric", "Current", "Record", "Holder", "Needed"],
        rows: [
          {
            label: spec.metric.label,
            values: [
              spec.metric.value,
              target,
              spec.holderLabel ?? "",
              Math.max(0, target - spec.metric.value),
            ],
          },
        ],
      };
    }
    case "projection-violin":
      return {
        columns: ["Bucket", "Density", "Floor", "Median", "Ceiling"],
        rows: [
          ...safePoints(spec.distribution).map((point) => ({
            label: point.label,
            values: [point.value, "", "", ""],
          })),
          {
            label: spec.summary.label,
            values: [
              "",
              spec.summary.min ?? "",
              spec.summary.value,
              spec.summary.max ?? "",
            ],
          },
        ],
      };
    case "season-dial":
      return {
        columns: ["Week", "Phase", "Signal", "Event"],
        rows: [
          ...safePoints(spec.weeks).map((week) => ({
            label: week.label,
            values: [
              week.x ?? week.value,
              week.meta ?? "regular",
              toneGlyphs[week.tone ?? "secondary"],
              "",
            ],
          })),
          ...(spec.events ?? []).map((event) => ({
            label: event.label,
            values: [
              event.x ?? event.value,
              event.meta ?? "",
              toneGlyphs[event.tone ?? "value"],
              "event",
            ],
          })),
        ],
      };
  }
}

function tableForSeries(series: ChartSeries): ChartTable {
  return {
    columns: ["Point", series.label],
    rows: safePoints(series.data).map((point) => ({
      label: point.label,
      values: [point.value],
    })),
  };
}

function tableForMultiSeries(series: readonly ChartSeries[]): ChartTable {
  const labels = Array.from(
    new Set(
      series.flatMap((item) =>
        safePoints(item.data).map((point) => point.label),
      ),
    ),
  );

  return {
    columns: ["Point", ...series.map((item) => item.label)],
    rows: labels.map((label) => ({
      label,
      values: series.map((item) => {
        const point = item.data.find((candidate) => candidate.label === label);
        return point?.value ?? "";
      }),
    })),
  };
}

function tableForGroups(groups: readonly ChartGroup[]): ChartTable {
  const seriesLabels = Array.from(
    new Set(
      groups.flatMap((group) => group.values.map((value) => value.label)),
    ),
  );

  return {
    columns: ["Group", ...seriesLabels],
    rows: groups.map((group) => ({
      label: group.label,
      values: seriesLabels.map((label) => {
        const value = group.values.find(
          (candidate) => candidate.label === label,
        );
        return value?.value ?? "";
      }),
    })),
  };
}

function hasData(spec: AUSPEXChartSpec): boolean {
  switch (spec.kind) {
    case "line-area":
    case "sparkline":
      return spec.series.data.length > 0;
    case "multi-line":
      return spec.series.some((series) => series.data.length > 0);
    case "bars":
    case "equalizer":
    case "hbars":
    case "histogram":
    case "range":
    case "bullet":
    case "scatter":
      return spec.data.length > 0;
    case "grouped-bars":
    case "stacked-bars":
      return spec.groups.some((group) => group.values.length > 0);
    case "radar":
      return spec.axes.length > 0;
    case "gauge":
      return Number.isFinite(spec.metric.value);
    case "donut":
      return spec.segments.length > 0;
    case "activity-rings":
      return spec.rings.length > 0;
    case "heatmap":
      return spec.cells.length > 0;
    case "node-graph":
      return spec.nodes.length > 0;
    case "bankroll-equity":
      return spec.series.data.length > 0;
    case "standings-bump":
      return spec.series.some((series) => series.data.length > 0);
    case "playoff-odds-cone":
      return spec.data.length > 0;
    case "win-probability-timeline":
      return spec.series.data.length > 0;
    case "odds-movement":
      return spec.series.data.length > 0;
    case "season-arc":
      return spec.cells.length > 0;
    case "head-to-head-flow":
      return spec.meetings.length > 0;
    case "activity-calendar":
      return spec.cells.length > 0;
    case "power-ranking-ladder":
      return spec.rankings.length > 0;
    case "leverage-gauge":
      return Number.isFinite(spec.metric.value);
    case "record-chase":
      return Number.isFinite(spec.metric.value);
    case "projection-violin":
      return (
        spec.distribution.length > 0 || Number.isFinite(spec.summary.value)
      );
    case "season-dial":
      return spec.weeks.length > 0 && spec.totalWeeks > 0;
  }
}

function statusLabel(state: ChartState): string {
  if (state === "partial") {
    return "incomplete";
  }
  if (state === "stale") {
    return "stale";
  }
  return "";
}

function safePoints(points: readonly ChartDatum[]): readonly ChartDatum[] {
  return points.filter((point) => Number.isFinite(point.value));
}

function valueDomain(values: readonly number[]): readonly [number, number] {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) {
    return [0, 1];
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.12, 1);
    return [min - padding, max + padding];
  }

  const padding = (max - min) * 0.1;
  return [min - padding, max + padding];
}

function linePath(
  points: readonly ChartDatum[],
  domain: readonly [number, number],
  context: RenderContext,
): string {
  return points
    .map((point, index) => {
      const x = xForIndex(index, points.length, context);
      const y = yForValue(point.value, domain, context);
      return `${index === 0 ? "M" : "L"} ${round(x)} ${round(y)}`;
    })
    .join(" ");
}

function areaPath(
  points: readonly ChartDatum[],
  domain: readonly [number, number],
  context: RenderContext,
): string {
  if (points.length === 0) {
    return "";
  }

  const zero = yForValue(Math.max(domain[0], 0), domain, context);
  const line = linePath(points, domain, context);
  const lastX = xForIndex(points.length - 1, points.length, context);
  const firstX = xForIndex(0, points.length, context);
  return `${line} L ${round(lastX)} ${round(zero)} L ${round(firstX)} ${round(
    zero,
  )} Z`;
}

function areaToBaselinePath(
  points: readonly ChartDatum[],
  domain: readonly [number, number],
  context: RenderContext,
  baseline: number,
): string {
  if (points.length === 0) {
    return "";
  }

  const line = linePath(points, domain, context);
  const lastX = xForIndex(points.length - 1, points.length, context);
  const firstX = xForIndex(0, points.length, context);
  const baselineY = yForValue(baseline, domain, context);

  return `${line} L ${round(lastX)} ${round(baselineY)} L ${round(
    firstX,
  )} ${round(baselineY)} Z`;
}

function bandPath(
  points: readonly ChartDatum[],
  domain: readonly [number, number],
  context: RenderContext,
  lowerKey: "min",
  upperKey: "max",
): string {
  if (points.length === 0) {
    return "";
  }

  const upper = points.map((point, index) => {
    const x = xForIndex(index, points.length, context);
    const y = yForValue(point[upperKey] ?? point.value, domain, context);
    return `${index === 0 ? "M" : "L"} ${round(x)} ${round(y)}`;
  });
  const lower = [...points].reverse().map((point, reverseIndex) => {
    const index = points.length - 1 - reverseIndex;
    const x = xForIndex(index, points.length, context);
    const y = yForValue(point[lowerKey] ?? point.value, domain, context);
    return `L ${round(x)} ${round(y)}`;
  });

  return `${upper.join(" ")} ${lower.join(" ")} Z`;
}

function rankPath(
  points: readonly ChartDatum[],
  maxRank: number,
  context: RenderContext,
): string {
  return points
    .map((point, index) => {
      const x = xForIndex(index, points.length, context);
      const y = yForRank(point.value, maxRank, context);
      return `${index === 0 ? "M" : "L"} ${round(x)} ${round(y)}`;
    })
    .join(" ");
}

function yForRank(
  rank: number,
  maxRank: number,
  context: RenderContext,
): number {
  const usable = context.height - margin.top - margin.bottom;
  const ratio = maxRank <= 1 ? 0 : (rank - 1) / (maxRank - 1);
  return margin.top + clamp(ratio, 0, 1) * usable;
}

function xForIndex(
  index: number,
  length: number,
  context: RenderContext,
): number {
  const usable = context.width - margin.left - margin.right;
  if (length <= 1) {
    return margin.left + usable / 2;
  }
  return margin.left + (index / (length - 1)) * usable;
}

function yForValue(
  value: number,
  domain: readonly [number, number],
  context: RenderContext,
): number {
  const [min, max] = domain;
  const usable = context.height - margin.top - margin.bottom;
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  return context.height - margin.bottom - clamp(ratio, 0, 1) * usable;
}

function xForValue(
  value: number,
  domain: readonly [number, number],
  context: RenderContext,
): number {
  const [min, max] = domain;
  const usable = context.width - margin.left - margin.right;
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  return margin.left + clamp(ratio, 0, 1) * usable;
}

function nodeX(node: ChartNode, context: RenderContext): number {
  return (
    margin.left +
    clamp(node.x, 0, 1) * (context.width - margin.left - margin.right)
  );
}

function nodeY(node: ChartNode, context: RenderContext): number {
  return (
    margin.top +
    clamp(node.y, 0, 1) * (context.height - margin.top - margin.bottom)
  );
}

function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = {
    x: cx + Math.cos(startAngle) * radius,
    y: cy + Math.sin(startAngle) * radius,
  };
  const end = {
    x: cx + Math.cos(endAngle) * radius,
    y: cy + Math.sin(endAngle) * radius,
  };
  const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
  const sweep = endAngle >= startAngle ? 1 : 0;

  return `M ${round(start.x)} ${round(start.y)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${round(end.x)} ${round(end.y)}`;
}

function angleForIndex(index: number, length: number): number {
  return (index / Math.max(length, 1)) * Math.PI * 2;
}

function toneByIndex(index: number): ChartTone {
  const tones: readonly ChartTone[] = [
    "primary",
    "value",
    "secondary",
    "positive",
    "negative",
  ];
  return tones[index % tones.length] ?? "secondary";
}

function toneForSigned(value: number): ChartTone {
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "secondary";
}

function oddsTone(value: number): ChartTone {
  if (value >= 60) {
    return "positive";
  }
  if (value <= 40) {
    return "negative";
  }
  return "primary";
}

function pointIndexForLabel(
  points: readonly ChartDatum[],
  label: string,
): number {
  const index = points.findIndex((point) => point.label === label);
  return index >= 0 ? index : Math.max(0, points.length - 1);
}

function resultGlyph(value: number, meta?: string): string {
  if (meta?.toLowerCase().includes("tie")) {
    return "T";
  }
  if (value > 0) {
    return "W";
  }
  if (value < 0) {
    return "L";
  }
  return "T";
}

function movementGlyph(delta: number): string {
  if (delta < 0) {
    return "▲";
  }
  if (delta > 0) {
    return "▼";
  }
  return "→";
}

function rankDeltaLabel(point: ChartDatum): string {
  if (typeof point.secondaryValue !== "number") {
    return "";
  }
  return `, ${movementGlyph(point.secondaryValue)}${formatNumber(
    Math.abs(point.secondaryValue),
  )}`;
}

function activityLevel(value: number): string {
  if (value >= 12) {
    return "very high";
  }
  if (value >= 6) {
    return "high";
  }
  if (value > 0) {
    return "active";
  }
  return "quiet";
}

function leverageTier(value: number, max = 100): string {
  const ratio = clamp(value / Math.max(max, 1), 0, 1);
  if (ratio >= 0.85) {
    return "Critical";
  }
  if (ratio >= 0.6) {
    return "High";
  }
  if (ratio >= 0.3) {
    return "Medium";
  }
  return "Low";
}

function toneColor(tone: ChartTone): string {
  return toneCssVariables[tone];
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toLocaleString("en-US");
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

function pathLengthEstimate(path: string): number {
  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/gu)].map((match) =>
    Number(match[0]),
  );
  return Math.max(1, numbers.length * 24);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export { Chart, chartKinds, chartTableForSpec };
export type {
  ActivityCalendarChartSpec,
  ActivityRingsChartSpec,
  AUSPEXChartSpec,
  BankrollEquityChartSpec,
  ChartDatum,
  ChartEdge,
  ChartGroup,
  ChartKind,
  ChartNode,
  ChartProps,
  ChartSeries,
  ChartState,
  ChartTable,
  ChartTableRow,
  ChartTone,
  DonutChartSpec,
  GaugeChartSpec,
  GroupedChartSpec,
  HeadToHeadFlowChartSpec,
  HeatmapChartSpec,
  LeverageGaugeChartSpec,
  MultiLineChartSpec,
  NodeGraphChartSpec,
  OddsMovementChartSpec,
  PlayoffOddsConeChartSpec,
  PowerRankingLadderChartSpec,
  ProjectionViolinChartSpec,
  RadarChartSpec,
  RangeChartSpec,
  RecordChaseChartSpec,
  ScatterChartSpec,
  SeasonArcChartSpec,
  SeasonDialChartSpec,
  SingleSeriesChartSpec,
  StandingsBumpChartSpec,
  ValueListChartSpec,
  WinProbabilityTimelineChartSpec,
};
