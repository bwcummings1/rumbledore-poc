import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  type AUSPEXChartSpec,
  Chart,
  type ChartSeries,
  chartKinds,
  chartTableForSpec,
} from "./chart";

const repoRoot = path.join(__dirname, "..", "..", "..");

const series = {
  data: [
    { label: "W1", value: 92 },
    { label: "W2", tone: "positive", value: 108 },
    { label: "W3", tone: "negative", value: 88 },
    { label: "W4", value: 122 },
  ],
  emphasized: true,
  id: "you",
  label: "You",
  tone: "primary",
} satisfies ChartSeries;

const valueData = [
  { label: "Alpha", tone: "positive", value: 12 },
  { label: "Beta", tone: "negative", value: -4 },
  { label: "Gamma", tone: "value", value: 8 },
] as const;

const groupedData = [
  {
    label: "Week 1",
    values: [
      { label: "PF", tone: "primary", value: 130 },
      { label: "PA", tone: "secondary", value: 118 },
    ],
  },
  {
    label: "Week 2",
    values: [
      { label: "PF", tone: "primary", value: 96 },
      { label: "PA", tone: "secondary", value: 111 },
    ],
  },
] as const;

const rangeData = [
  { label: "Projection", max: 130, min: 84, target: 112, value: 104 },
  { label: "Record", max: 150, min: 0, target: 130, value: 141 },
] as const;

const fixtures = [
  {
    caption: "Bankroll line fixture",
    kind: "line-area",
    series,
    title: "Line area chart",
  },
  {
    kind: "multi-line",
    series: [
      series,
      {
        data: [
          { label: "W1", value: 84 },
          { label: "W2", value: 94 },
          { label: "W3", value: 111 },
          { label: "W4", value: 103 },
        ],
        dash: "dashed",
        id: "rival",
        label: "Rival",
        tone: "secondary",
      },
    ],
    title: "Multi line chart",
  },
  { kind: "sparkline", series, title: "Sparkline chart" },
  { data: valueData, kind: "bars", title: "Bars chart" },
  { groups: groupedData, kind: "grouped-bars", title: "Grouped bars chart" },
  { groups: groupedData, kind: "stacked-bars", title: "Stacked bars chart" },
  { data: valueData, kind: "hbars", title: "Horizontal bars chart" },
  { data: rangeData, kind: "range", title: "Range chart" },
  {
    axes: [
      { label: "PF", max: 100, value: 88 },
      { label: "Luck", max: 100, value: 42 },
      { label: "Titles", max: 100, value: 65 },
      { label: "Consistency", max: 100, value: 74 },
    ],
    kind: "radar",
    title: "Radar chart",
  },
  {
    data: [
      { label: "Alpha", value: 1, x: 2, y: 8 },
      { label: "Beta", value: 2, x: 6, y: 3 },
    ],
    kind: "scatter",
    title: "Scatter chart",
  },
  { data: valueData, kind: "histogram", title: "Histogram chart" },
  {
    kind: "gauge",
    metric: { label: "Win probability", max: 100, min: 0, value: 64 },
    title: "Gauge chart",
  },
  {
    kind: "donut",
    segments: [
      { label: "Won", tone: "positive", value: 7 },
      { label: "Lost", tone: "negative", value: 4 },
      { label: "Push", tone: "secondary", value: 1 },
    ],
    title: "Donut chart",
  },
  {
    kind: "activity-rings",
    rings: [
      { label: "Reads", max: 20, value: 14 },
      { label: "Votes", max: 10, value: 6 },
      { label: "Bets", max: 12, value: 9 },
    ],
    title: "Activity rings chart",
  },
  { data: valueData, kind: "equalizer", title: "Equalizer chart" },
  {
    cells: [
      { label: "Mon", value: 1, x: 0, y: 0 },
      { label: "Tue", value: 3, x: 1, y: 0 },
      { label: "Wed", value: 5, x: 2, y: 0 },
      { label: "Thu", value: 2, x: 3, y: 0 },
    ],
    kind: "heatmap",
    title: "Heatmap chart",
  },
  { data: rangeData, kind: "bullet", title: "Bullet chart" },
  {
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ],
    kind: "node-graph",
    nodes: [
      { emphasized: true, id: "a", label: "You", value: 10, x: 0.2, y: 0.4 },
      { id: "b", label: "Rival", value: 8, x: 0.55, y: 0.25 },
      { id: "c", label: "Lore", value: 6, x: 0.78, y: 0.72 },
    ],
    title: "Node graph chart",
  },
  {
    floor: 10_000,
    kind: "bankroll-equity",
    series: {
      data: [
        {
          label: "Mon",
          meta: "week open carryover",
          secondaryValue: 10_000,
          value: 10_250,
        },
        {
          label: "Tue",
          meta: "settlement win",
          secondaryValue: 10_000,
          tone: "positive",
          value: 11_150,
        },
        {
          label: "Sun",
          meta: "reset to floor",
          secondaryValue: 10_000,
          tone: "negative",
          value: 9_700,
        },
      ],
      emphasized: true,
      id: "bankroll",
      label: "Bankroll",
      tone: "value",
    },
    title: "Bankroll equity chart",
  },
  {
    highlightedSeriesId: "you",
    kind: "standings-bump",
    series: [
      {
        data: [
          { label: "W1", secondaryValue: 0, value: 5 },
          { label: "W2", secondaryValue: -2, value: 3 },
          { label: "W3", secondaryValue: -1, value: 2 },
        ],
        emphasized: true,
        id: "you",
        label: "You",
        tone: "primary",
      },
      {
        data: [
          { label: "W1", secondaryValue: 0, value: 2 },
          { label: "W2", secondaryValue: 2, value: 4 },
          { label: "W3", secondaryValue: 1, value: 5 },
        ],
        dash: "dashed",
        id: "rival",
        label: "Rival",
        tone: "secondary",
      },
    ],
    title: "Standings bump chart",
  },
  {
    data: [
      { label: "Now", max: 62, min: 62, target: 55, value: 62 },
      { label: "W9", max: 76, min: 45, target: 55, value: 61 },
      { label: "W10", max: 88, min: 32, target: 55, value: 64 },
    ],
    kind: "playoff-odds-cone",
    title: "Playoff odds cone chart",
  },
  {
    kind: "win-probability-timeline",
    series: {
      data: [
        { label: "Q1", value: 48 },
        { label: "Q2", value: 58 },
        { label: "Q3", value: 41 },
        { label: "Final", meta: "FINAL", value: 82 },
      ],
      id: "wp",
      label: "You",
      tone: "primary",
    },
    swings: [
      { label: "Q2", meta: "touchdown", tone: "positive", value: 14 },
      { label: "Q3", meta: "turnover", tone: "negative", value: -19 },
    ],
    title: "Win probability timeline chart",
  },
  {
    kind: "odds-movement",
    lockedLabel: "Open",
    series: {
      data: [
        { label: "Open", tone: "positive", value: 145 },
        { label: "Mid", value: 130 },
        { label: "Now", tone: "primary", value: 118 },
      ],
      id: "line",
      label: "Spread",
      tone: "secondary",
    },
    title: "Odds movement chart",
  },
  {
    cells: [
      { label: "W1", meta: "win", secondaryValue: 0, value: 1 },
      { label: "W2", meta: "loss", secondaryValue: 0, value: -1 },
      { label: "W3", meta: "tie", secondaryValue: 0, value: 0 },
      { label: "W4", meta: "playoff", secondaryValue: 1, value: 1 },
    ],
    kind: "season-arc",
    title: "Season arc chart",
  },
  {
    kind: "head-to-head-flow",
    meetings: [
      { label: "2019", meta: "regular", value: 8 },
      { label: "2020", meta: "playoff", value: -12 },
      { label: "2021", meta: "title game", value: 3 },
    ],
    participantALabel: "Alpha",
    participantBLabel: "Beta",
    title: "Head to head flow chart",
  },
  {
    cells: [
      { label: "Mon", meta: "reads", value: 2, x: 0, y: 0 },
      { label: "Tue", meta: "bets", value: 8, x: 1, y: 0 },
      { label: "Wed", meta: "votes", value: 14, x: 2, y: 0 },
    ],
    kind: "activity-calendar",
    title: "Activity calendar chart",
  },
  {
    kind: "power-ranking-ladder",
    rankings: [
      { label: "Alpha", meta: "still rolling", secondaryValue: -1, value: 1 },
      { label: "Beta", meta: "injury luck", secondaryValue: 2, value: 2 },
      { label: "Gamma", meta: "steady", secondaryValue: 0, value: 3 },
    ],
    title: "Power ranking ladder chart",
  },
  {
    factors: [
      { label: "Playoff odds", value: 18 },
      { label: "Bankroll swing", value: 220 },
    ],
    kind: "leverage-gauge",
    metric: { label: "Leverage", max: 100, min: 0, value: 72 },
    title: "Leverage gauge chart",
  },
  {
    holderLabel: "Avery, 2021",
    kind: "record-chase",
    metric: { label: "Single week points", max: 180, target: 168, value: 154 },
    title: "Record chase chart",
  },
  {
    distribution: [
      { label: "80", value: 2 },
      { label: "95", value: 7 },
      { label: "110", value: 10 },
      { label: "125", value: 4 },
    ],
    kind: "projection-violin",
    summary: { label: "Projection", max: 128, min: 84, value: 108 },
    title: "Projection violin chart",
  },
  {
    currentWeek: 9,
    events: [
      { label: "Record fell", meta: "record", tone: "value", value: 7, x: 7 },
      { label: "Canon vote", meta: "lore", tone: "primary", value: 8, x: 8 },
    ],
    kind: "season-dial",
    title: "Season dial chart",
    totalWeeks: 17,
    weeks: [
      { label: "Week 1", meta: "regular", value: 1, x: 1 },
      { label: "Week 9", meta: "current", tone: "primary", value: 9, x: 9 },
      { label: "Week 15", meta: "playoffs", tone: "value", value: 15, x: 15 },
      {
        label: "Week 17",
        meta: "championship",
        tone: "value",
        value: 17,
        x: 17,
      },
    ],
  },
] as const satisfies readonly AUSPEXChartSpec[];

afterEach(() => {
  cleanup();
});

describe("Chart", () => {
  test("formalizes every AUSPEX and Rumbledore-native chart kind", () => {
    expect(fixtures.map((fixture) => fixture.kind).sort()).toEqual(
      [...chartKinds].sort(),
    );

    for (const spec of fixtures) {
      const { container, unmount } = render(<Chart spec={spec} />);

      expect(screen.getByRole("figure", { name: spec.title })).toBeDefined();
      expect(screen.getByRole("img", { name: spec.title })).toBeDefined();

      const figure = container.querySelector("[data-slot='chart']");
      expect(figure?.getAttribute("data-chart-kind")).toBe(spec.kind);
      expect(figure?.getAttribute("data-reduction")).toBeTruthy();

      const marks = container.querySelectorAll("[data-chart-mark='true']");
      expect(marks.length, spec.kind).toBeGreaterThan(0);
      expect(container.querySelector("[data-signal]"), spec.kind).toBeDefined();
      expect(
        container.querySelector("[tabindex='0']"),
        spec.kind,
      ).toBeDefined();

      const table = screen.getByRole("table", {
        hidden: true,
        name: spec.title,
      });
      expect(table.closest(".sr-only")).toBeDefined();
      expect(within(table).getAllByRole("row", { hidden: true }).length).toBe(
        chartTableForSpec(spec).rows.length + 1,
      );

      unmount();
    }
  });

  test("builds the visible svg and hidden table from the same fixture values", () => {
    const spec = fixtures.find((fixture) => fixture.kind === "grouped-bars");

    if (!spec) {
      throw new Error("missing grouped-bars fixture");
    }

    const { container } = render(<Chart spec={spec} />);

    const table = chartTableForSpec(spec);
    const svgValues = Array.from(
      container.querySelectorAll("[data-chart-mark='true'][data-value]"),
    ).map((mark) => mark.getAttribute("data-value"));
    const tableValues = table.rows.flatMap((row) =>
      row.values.filter((value) => value !== "").map((value) => String(value)),
    );

    expect(svgValues).toEqual(tableValues);

    for (const row of table.rows) {
      expect(
        screen.getByRole("row", { hidden: true, name: new RegExp(row.label) }),
      ).toBeDefined();
      for (const value of row.values) {
        if (value !== "") {
          expect(
            screen.getAllByText(String(value), { exact: false }).length,
          ).toBeGreaterThan(0);
        }
      }
    }

    expect(document.body.textContent).not.toContain("NaN");
  });

  test("renders loading, empty, error, partial, and stale states without blank boxes", () => {
    const readySpec = fixtures[0];

    const { rerender, container } = render(
      <Chart spec={{ ...readySpec, state: "loading" }} />,
    );
    expect(
      container.querySelector("[data-slot='chart-loading']"),
    ).toBeDefined();

    rerender(
      <Chart spec={{ ...readySpec, series: { ...series, data: [] } }} />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "No chart data yet",
    );

    rerender(<Chart spec={{ ...readySpec, state: "error" }} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Chart unavailable",
    );

    rerender(
      <Chart
        spec={{
          ...readySpec,
          state: "partial",
          statusNote: "as of Week 4",
        }}
      />,
    );
    expect(screen.getByText(/incomplete/)).toBeDefined();
    expect(screen.getByText("as of Week 4")).toBeDefined();

    rerender(
      <Chart
        spec={{
          ...readySpec,
          state: "stale",
          statusNote: "as of yesterday",
        }}
      />,
    );
    expect(screen.getByText(/stale/)).toBeDefined();
    expect(screen.getByText("as of yesterday")).toBeDefined();
  });

  test("keeps multi-series distinction available beyond color", () => {
    const spec = fixtures.find((fixture) => fixture.kind === "multi-line");

    if (!spec) {
      throw new Error("missing multi-line fixture");
    }

    const { container } = render(<Chart spec={spec} />);

    expect(container.querySelector("[data-dash='dashed']")).toBeDefined();
    expect(screen.getByText(/Rival 103/)).toBeDefined();
    expect(screen.getByLabelText(/Rival, W4: 103/)).toBeDefined();
  });

  test("defines chart reduced-motion and compact container behavior in global CSS", () => {
    const globalsCss = readFileSync(
      path.join(repoRoot, "src/app/globals.css"),
      "utf8",
    );

    expect(globalsCss).toContain(".auspex-chart");
    expect(globalsCss).toContain("container-type: inline-size;");
    expect(globalsCss).toContain("@container (max-width: 359px)");
    expect(globalsCss).toContain(".auspex-chart__draw");
    expect(globalsCss).toContain("animation: none;");
    expect(globalsCss).toContain("stroke-dashoffset: 0;");
  });
});
