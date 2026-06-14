import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ArenaLeaderboardData } from "@/betting";
import { ArenaLeaderboardView } from "./arena-leaderboard-view";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const data: ArenaLeaderboardData = {
  computedAt: "2026-09-09T00:00:00.000Z",
  individualStandings: [
    {
      currentBalanceCents: 130_000,
      displayName: "Arena Gamma",
      id: "user-gamma",
      netPnlCents: 30_000,
      previousRank: 3,
      pushVoidSlipCount: 0,
      rank: 1,
      rankDelta: 2,
      roiBps: 30_000,
      settledSlipCount: 1,
      totalReturnCents: 40_000,
      totalStakeCents: 10_000,
      weeksPlayed: 1,
      weeksSurvived: 1,
      winRateBps: 10_000,
      wonSlipCount: 1,
    },
  ],
  leagueStandings: [
    {
      currentBalanceCents: 130_000,
      displayName: "Arena League B",
      id: "league-b",
      netPnlCents: 30_000,
      previousRank: 2,
      pushVoidSlipCount: 0,
      rank: 1,
      rankDelta: 1,
      roiBps: 30_000,
      settledSlipCount: 1,
      totalReturnCents: 40_000,
      totalStakeCents: 10_000,
      weeksPlayed: 1,
      weeksSurvived: 1,
      winRateBps: 10_000,
      wonSlipCount: 1,
    },
  ],
  movers: {
    fallers: [],
    risers: [
      {
        displayName: "Arena Gamma",
        id: "user-gamma",
        kind: "individual",
        netPnlCents: 30_000,
        previousRank: 3,
        rank: 1,
        rankDelta: 2,
      },
    ],
  },
  season: {
    endsAt: "2026-09-30T00:00:00.000Z",
    id: "season-1",
    name: "2026 Arena",
    startsAt: "2026-09-01T00:00:00.000Z",
    status: "active",
  },
  seasons: [
    {
      computedAt: "2026-09-09T00:00:00.000Z",
      endsAt: "2026-09-30T00:00:00.000Z",
      id: "season-1",
      isSelected: true,
      name: "2026 Arena",
      startsAt: "2026-09-01T00:00:00.000Z",
      status: "active",
    },
    {
      computedAt: "2025-09-30T00:00:00.000Z",
      endsAt: "2025-09-30T00:00:00.000Z",
      id: "season-0",
      isSelected: false,
      name: "2025 Arena",
      startsAt: "2025-09-01T00:00:00.000Z",
      status: "complete",
    },
  ],
};

afterEach(() => {
  cleanup();
});

test("arena leaderboard view renders league and individual standings", () => {
  render(<ArenaLeaderboardView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Paper betting standings",
    }),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "League leaderboard" }),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Individual leaderboard" }),
  ).toBeDefined();
  expect(screen.getByText("Arena League B")).toBeDefined();
  expect(screen.getAllByText("Arena Gamma")).toHaveLength(2);
  expect(screen.getAllByText("+$300")).toHaveLength(2);
  expect(screen.getAllByText("+300%")).toHaveLength(2);
  expect(screen.getAllByText("1/1 wins · 1/1 weeks")).toHaveLength(2);
  expect(screen.getByRole("link", { name: /2026 Arena/ })).toBeDefined();
  expect(screen.getByRole("link", { name: /2025 Arena/ })).toBeDefined();
  expect(screen.getByText("Biggest risers")).toBeDefined();
  expect(screen.getByText("Player · #3 to #1")).toBeDefined();
  expect(screen.getAllByText("Up 2")).toHaveLength(1);
});

test("arena leaderboard view renders empty states", () => {
  render(
    <ArenaLeaderboardView
      data={{
        computedAt: null,
        individualStandings: [],
        leagueStandings: [],
        movers: { fallers: [], risers: [] },
        season: null,
        seasons: [],
      }}
    />,
  );

  expect(
    screen.getByText("No arena season has been created yet."),
  ).toBeDefined();
  expect(
    screen.getByText("No league standings have been materialized yet."),
  ).toBeDefined();
  expect(
    screen.getByText("No individual standings have been materialized yet."),
  ).toBeDefined();
  expect(screen.getByText("No rank movement yet")).toBeDefined();
});
