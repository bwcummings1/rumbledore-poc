import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { GenerationFailureQueueData } from "@/ai";
import { GenerationFailureQueueView } from "./generation-failure-queue-view";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";

const data: GenerationFailureQueueData = {
  generatedAt: "2026-07-09T12:00:00.000Z",
  items: [
    {
      contentItem: {
        href: `/leagues/${leagueId}/press/00000000-0000-4000-8000-000000000101`,
        id: "00000000-0000-4000-8000-000000000101",
        status: "published",
        title: "Original recap",
      },
      contentType: "weekly_recap",
      contentTypeLabel: "Weekly Recap",
      createdAt: "2026-07-09T11:00:00.000Z",
      errorMessage: null,
      id: "00000000-0000-4000-8000-000000000201",
      isJudgeSkip: true,
      persona: "narrator",
      promptPrefixHash: "a".repeat(64),
      reason: "llm_judge:persona:0.20",
      retryApiUrl: `/api/leagues/${leagueId}/press/failures/00000000-0000-4000-8000-000000000201/retry`,
      runTriggerKey: "weekly_recap:cron:weekly-wrap:regular:7",
      status: "skipped",
      triggerKey: "cron:weekly-wrap:regular:7",
      updatedAt: "2026-07-09T11:01:00.000Z",
    },
    {
      contentItem: null,
      contentType: "matchup_preview",
      contentTypeLabel: "Matchup Preview",
      createdAt: "2026-07-09T10:00:00.000Z",
      errorMessage: null,
      id: "00000000-0000-4000-8000-000000000202",
      isJudgeSkip: false,
      persona: "commissioner",
      promptPrefixHash: null,
      reason: "Pending for 60 minutes; stale threshold is 30 minutes.",
      retryApiUrl: `/api/leagues/${leagueId}/press/failures/00000000-0000-4000-8000-000000000202/retry`,
      runTriggerKey: "matchup_preview:cron:weekly-preview:regular:7",
      status: "stale_pending",
      triggerKey: "cron:weekly-preview:regular:7",
      updatedAt: "2026-07-09T10:00:00.000Z",
    },
  ],
  league: {
    id: leagueId,
    name: "Queue League",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  staleAfterMinutes: 30,
  summary: {
    failed: 0,
    judgeSkipped: 1,
    skipped: 1,
    stalePending: 1,
    total: 2,
  },
};

afterEach(() => {
  cleanup();
});

test("generation failure queue view renders failed-run details and retry affordances", () => {
  render(<GenerationFailureQueueView data={data} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "The Queue League Press" }),
  ).toBeDefined();
  expect(screen.getByText("Failure queue")).toBeDefined();
  expect(screen.getByText("2")).toBeDefined();
  expect(screen.getByText("Judge gate")).toBeDefined();
  expect(screen.getByText("llm_judge:persona:0.20")).toBeDefined();
  expect(screen.getByText(/stale threshold is 30 minutes/i)).toBeDefined();

  const queue = within(screen.getByLabelText("Generation failure queue"));
  expect(queue.getAllByRole("article")).toHaveLength(2);
  expect(queue.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
  expect(
    screen.getByRole("link", { name: "Original recap" }).getAttribute("href"),
  ).toBe(`/leagues/${leagueId}/press/00000000-0000-4000-8000-000000000101`);
});

test("generation failure queue view renders an empty state", () => {
  render(
    <GenerationFailureQueueView
      data={{
        ...data,
        items: [],
        summary: {
          failed: 0,
          judgeSkipped: 0,
          skipped: 0,
          stalePending: 0,
          total: 0,
        },
      }}
    />,
  );

  expect(screen.getByText("No failed generation runs")).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Open The Press" }).getAttribute("href"),
  ).toBe(`/leagues/${leagueId}/press`);
});
