import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ArenaLeaderboardData } from "@/betting";
import { ArenaLeaderboardView } from "./arena-leaderboard-view";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const data: ArenaLeaderboardData = {
  computedAt: "2026-09-09T00:00:00.000Z",
  headToHead: {
    anchor: {
      accuracyBps: 7_500,
      correctPicks: 30,
      displayName: "Arena League B",
      eligibleWeeks: 1,
      id: "league-b",
      rank: 1,
      rankDelta: 1,
      scorablePicks: 40,
      weeksPlayed: 1,
    },
    comparison: "leading",
    leader: {
      accuracyBps: 7_500,
      correctPicks: 30,
      displayName: "Arena League B",
      eligibleWeeks: 1,
      id: "league-b",
      rank: 1,
      rankDelta: 1,
      scorablePicks: 40,
      weeksPlayed: 1,
    },
    marginBps: 2_500,
    rankGap: 1,
    rival: {
      accuracyBps: 5_000,
      correctPicks: 20,
      displayName: "Arena League A",
      eligibleWeeks: 1,
      id: "league-a",
      rank: 2,
      rankDelta: -1,
      scorablePicks: 40,
      weeksPlayed: 1,
    },
  },
  individualStandings: [
    {
      accuracyBps: 7_500,
      correctPicks: 15,
      displayName: "Arena Gamma",
      eligibleWeeks: 1,
      id: "user-gamma",
      previousRank: 3,
      rank: 1,
      rankDelta: 2,
      scorablePicks: 20,
      submittedPicks: 20,
      voidPicks: 0,
      weeksPlayed: 1,
    },
  ],
  leagueStandings: [
    {
      accuracyBps: 7_500,
      correctPicks: 30,
      displayName: "Arena League B",
      eligibleWeeks: 1,
      id: "league-b",
      previousRank: 2,
      rank: 1,
      rankDelta: 1,
      scorablePicks: 40,
      submittedPicks: 40,
      voidPicks: 0,
      weeksPlayed: 1,
    },
    {
      accuracyBps: 5_000,
      correctPicks: 20,
      displayName: "Arena League A",
      eligibleWeeks: 1,
      id: "league-a",
      previousRank: 1,
      rank: 2,
      rankDelta: -1,
      scorablePicks: 40,
      submittedPicks: 40,
      voidPicks: 0,
      weeksPlayed: 1,
    },
  ],
  leagueOptions: [
    {
      accuracyBps: 7_500,
      displayName: "Arena League B",
      id: "league-b",
      rank: 1,
    },
    {
      accuracyBps: 5_000,
      displayName: "Arena League A",
      id: "league-a",
      rank: 2,
    },
  ],
  movers: {
    fallers: [],
    risers: [
      {
        accuracyBps: 7_500,
        displayName: "Arena Gamma",
        id: "user-gamma",
        kind: "individual",
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
      name: "CENTRAL ARENA",
    }),
  ).toBeDefined();
  expect(
    screen.getByText(
      /built from collective pick accuracy without exposing which games another league picked/i,
    ),
  ).toBeDefined();
  expect(screen.getByText(/As of Sep 9/i)).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "League leaderboard" }),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Individual leaderboard" }),
  ).toBeDefined();
  const arenaTabs = screen.getByRole("tablist", { name: "Arena sections" });
  expect(
    within(arenaTabs)
      .getByRole("tab", { name: "Leaderboard" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.getAllByText("Arena League B").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Arena League A").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Arena Gamma").length).toBeGreaterThanOrEqual(2);
  // 7,500 bps renders as the accuracy itself, and again as its distance from
  // a coin flip -- 75% is only meaningful next to the 50% baseline.
  expect(screen.getAllByText("75%").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText("+25 pts").length).toBeGreaterThanOrEqual(2);
  expect(
    screen.getAllByText("30/40 correct · 1/1 weeks").length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    within(arenaTabs)
      .getByRole("tab", { name: /League vs League/i })
      .getAttribute("href"),
  ).toBe(
    "/arena/leagues?seasonId=season-1&leagueId=league-b&rivalLeagueId=league-a",
  );
  expect(
    within(arenaTabs).getByRole("tab", { name: "Movers" }).getAttribute("href"),
  ).toBe(
    "/arena/movers?seasonId=season-1&leagueId=league-b&rivalLeagueId=league-a",
  );
  expect(
    within(arenaTabs).getByRole("tab", { name: "Rules" }).getAttribute("href"),
  ).toBe(
    "/arena/rules?seasonId=season-1&leagueId=league-b&rivalLeagueId=league-a",
  );
  expect(
    screen.queryByRole("heading", { name: "Choose the arena angle" }),
  ).toBeNull();
  expect(screen.queryByRole("heading", { name: "Arena movement board" })).toBe(
    null,
  );
});

test("arena matchup section renders rivalry and analytics", () => {
  render(<ArenaLeaderboardView data={data} sectionId="matchups" />);

  expect(
    screen.getByRole("heading", { name: /Arena League B vs/ }),
  ).toBeDefined();
  expect(
    screen.getAllByText("Arena League B leads by +25 pts").length,
  ).toBeGreaterThanOrEqual(1);
  expect(
    screen.getByRole("link", { name: /Arena League A/ }).getAttribute("href"),
  ).toBe("/arena?seasonId=season-1&leagueId=league-b&rivalLeagueId=league-a");
  expect(
    screen.getByRole("heading", { name: "Arena movement board" }),
  ).toBeDefined();
  expect(screen.getByRole("heading", { name: "Rank race" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Duel margin" })).toBeDefined();
});

test("arena movers section renders rank movement", () => {
  render(<ArenaLeaderboardView data={data} sectionId="movers" />);

  expect(screen.getByText("Biggest risers")).toBeDefined();
  expect(screen.getByText("Player · #3 to #1")).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Arena movement board" }),
  ).toBeDefined();
  expect(screen.getByRole("heading", { name: "Rank race" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Duel margin" })).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Accuracy spread" }),
  ).toBeDefined();
  expect(screen.getByRole("heading", { name: "Volume ladder" })).toBeDefined();
  expect(
    screen.getAllByLabelText(
      "Arena rank movement from prior materialization to now",
    ).length,
  ).toBeGreaterThanOrEqual(1);
});

test("arena seasons and rules sections render their own surfaces", () => {
  render(<ArenaLeaderboardView data={data} sectionId="seasons" />);

  expect(
    screen.getByRole("link", { name: /2026 Arena/ }).getAttribute("href"),
  ).toBe("/arena?seasonId=season-1&leagueId=league-b&rivalLeagueId=league-a");
  expect(screen.getByRole("link", { name: /2025 Arena/ })).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Season league standings" }),
  ).toBeDefined();

  cleanup();
  render(<ArenaLeaderboardView data={data} sectionId="rules" />);

  expect(
    screen.getByRole("heading", { name: "Aggregate bragging rights" }),
  ).toBeDefined();
  expect(screen.getByText("Bragging rights only")).toBeDefined();
  expect(screen.getByText("League isolation")).toBeDefined();
});

test("arena leaderboard view renders empty states", () => {
  render(
    <ArenaLeaderboardView
      data={{
        computedAt: null,
        headToHead: null,
        individualStandings: [],
        leagueOptions: [],
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
    screen.getAllByText("No league standings have been materialized yet.")
      .length,
  ).toBeGreaterThanOrEqual(1);
  expect(
    screen.getAllByText("No individual standings have been materialized yet.")
      .length,
  ).toBeGreaterThanOrEqual(1);
  expect(
    screen.queryByRole("heading", { name: "Choose the arena angle" }),
  ).toBeNull();
});

test("arena subsection empty states stay coherent for solo or zero-league users", () => {
  const emptyData: ArenaLeaderboardData = {
    computedAt: null,
    headToHead: null,
    individualStandings: [],
    leagueOptions: [],
    leagueStandings: [],
    movers: { fallers: [], risers: [] },
    season: null,
    seasons: [],
  };

  render(<ArenaLeaderboardView data={emptyData} sectionId="movers" />);
  expect(screen.getByText("No rank movement yet")).toBeDefined();

  cleanup();
  render(<ArenaLeaderboardView data={emptyData} sectionId="leagues" />);
  expect(screen.getByText("League rivalry waiting")).toBeDefined();
});
