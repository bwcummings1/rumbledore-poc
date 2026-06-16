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

type AUSPEXChartSpec =
  | ActivityRingsChartSpec
  | DonutChartSpec
  | GaugeChartSpec
  | GroupedChartSpec
  | HeatmapChartSpec
  | MultiLineChartSpec
  | NodeGraphChartSpec
  | RadarChartSpec
  | RangeChartSpec
  | ScatterChartSpec
  | SingleSeriesChartSpec
  | ValueListChartSpec;

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
  bars: "Bars",
  bullet: "Bullet",
  donut: "Donut",
  equalizer: "Equalizer",
  gauge: "Gauge",
  "grouped-bars": "Grouped bars",
  hbars: "Horizontal bars",
  heatmap: "Heatmap",
  histogram: "Histogram",
  "line-area": "Line and area",
  "multi-line": "Multi-line",
  "node-graph": "Node graph",
  radar: "Radar",
  range: "Range",
  scatter: "Scatter",
  sparkline: "Sparkline",
  "stacked-bars": "Stacked bars",
} satisfies Record<ChartKind, string>;

const compactReductions = {
  "activity-rings": "meters",
  bars: "hbars",
  bullet: "bullet",
  donut: "stacked-bar",
  equalizer: "intensity-bar",
  gauge: "gauge",
  "grouped-bars": "stacked-or-top-n",
  hbars: "hbars",
  heatmap: "scrolling-grid",
  histogram: "coarse-bins",
  "line-area": "sparkline",
  "multi-line": "top-series",
  "node-graph": "ranked-list",
  radar: "stat-list",
  range: "bullet",
  scatter: "binned-hbars",
  sparkline: "sparkline",
  "stacked-bars": "single-total",
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
          <h3 className="heading-auspex h-grad text-sm font-semibold">
            {spec.title}
          </h3>
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
    kind === "activity-rings" ||
    kind === "radar" ||
    kind === "node-graph"
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
      {safeGroups.map((group, groupIndex) =>
        group.values.map((value, valueIndex) => {
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
        }),
      )}
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

        return group.values.map((value, valueIndex) => {
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
        });
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
  AUSPEXChartSpec,
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
};
