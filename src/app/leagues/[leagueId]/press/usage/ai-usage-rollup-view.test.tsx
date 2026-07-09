import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { AiUsageRollupData } from "@/ai";
import { AiUsageRollupView } from "./ai-usage-rollup-view";

const data: AiUsageRollupData = {
  generatedAt: "2026-07-09T12:30:00.000Z",
  league: {
    id: "00000000-0000-4000-8000-000000000019",
    name: "Usage League",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  recentCalls: [
    {
      billableUnits: 129,
      contentType: "weekly_recap",
      contentTypeLabel: "Weekly Recap",
      costMicrosUsd: 0,
      createdAt: "2026-07-09T12:00:00.000Z",
      estimated: true,
      id: "00000000-0000-4000-8000-000000000101",
      inputTokens: 80,
      model: "mock-rumbledore-llm-v1",
      outputTokens: 30,
      persona: "narrator",
      provider: "mock",
      totalTokens: 129,
      triggerKey: "weekly:2026:1",
    },
  ],
  summary: {
    callCount: 1,
    estimatedCallCount: 1,
    firstCallAt: "2026-07-09T12:00:00.000Z",
    lastCallAt: "2026-07-09T12:00:00.000Z",
    totalCostMicrosUsd: 0,
    totalTokens: 129,
  },
  weekly: [
    {
      callCount: 1,
      estimatedCallCount: 1,
      totalCostMicrosUsd: 0,
      totalTokens: 129,
      weekStart: "2026-07-06T00:00:00.000Z",
    },
  ],
  weeklyBreakdown: [
    {
      callCount: 1,
      contentType: "weekly_recap",
      contentTypeLabel: "Weekly Recap",
      model: "mock-rumbledore-llm-v1",
      persona: "narrator",
      provider: "mock",
      totalCostMicrosUsd: 0,
      totalTokens: 129,
      weekStart: "2026-07-06T00:00:00.000Z",
    },
  ],
};

afterEach(() => {
  cleanup();
});

test("AI usage rollup renders weekly totals and recent calls", () => {
  render(<AiUsageRollupView data={data} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "The Usage League Press" }),
  ).toBeDefined();
  expect(screen.getByText("AI usage")).toBeDefined();
  expect(screen.getByText("mock pricing")).toBeDefined();
  expect(screen.getAllByText("$0.000000").length).toBeGreaterThan(0);

  const weekly = within(screen.getByLabelText("Weekly AI usage rollup"));
  expect(weekly.getByText("League x week usage")).toBeDefined();
  expect(weekly.getAllByText("Weekly Recap").length).toBeGreaterThan(0);
  expect(weekly.getAllByText("mock/mock-rumbledore-llm-v1").length).toBe(1);

  const recent = within(screen.getByLabelText("Recent AI usage calls"));
  expect(recent.getByText("Per-call rows")).toBeDefined();
  expect(recent.getAllByText("mock/mock-rumbledore-llm-v1").length).toBe(1);
});

test("AI usage rollup renders an empty state", () => {
  render(
    <AiUsageRollupView
      data={{
        ...data,
        recentCalls: [],
        summary: {
          callCount: 0,
          estimatedCallCount: 0,
          firstCallAt: null,
          lastCallAt: null,
          totalCostMicrosUsd: 0,
          totalTokens: 0,
        },
        weekly: [],
        weeklyBreakdown: [],
      }}
    />,
  );

  expect(screen.getByText("No AI usage recorded")).toBeDefined();
  expect(
    screen.getByRole("link", { name: /open the press/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000019/press");
});
