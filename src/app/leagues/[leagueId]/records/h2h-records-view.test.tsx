import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { HeadToHeadRecordsView } from "./h2h-records-view";
import type { HeadToHeadRecordsPageData } from "./records-page-data";

const leagueId = "00000000-0000-4000-8000-000000000001";
const managerAId = "00000000-0000-4000-8000-000000000101";
const managerBId = "00000000-0000-4000-8000-000000000202";

const pair = {
  championshipMeetings: 1,
  currentStreak: {
    length: 2,
    personId: managerAId,
    personName: "Fixture Manager 12",
  },
  lastScoringPeriod: 14,
  lastSeason: 2025,
  longestStreak: {
    length: 3,
    personId: managerBId,
    personName: "Fixture Manager 15",
  },
  meetings: 9,
  personA: {
    avgPoints: 112.4,
    highestScore: 178.24,
    losses: 4,
    personId: managerAId,
    personName: "Fixture Manager 12",
    points: 1011.6,
    wins: 5,
  },
  personB: {
    avgPoints: 108.1,
    highestScore: 166.7,
    losses: 5,
    personId: managerBId,
    personName: "Fixture Manager 15",
    points: 972.9,
    wins: 4,
  },
  playoffMeetings: 2,
  season: 0,
  ties: 0,
};

const data: HeadToHeadRecordsPageData = {
  biggestMeetings: [
    {
      championship: true,
      combinedPoints: 299.64,
      matchupId: "matchup-1",
      personAPoints: 178.24,
      personBPoints: 121.4,
      playoff: true,
      scoringPeriod: 14,
      season: 2025,
      winnerPersonId: managerAId,
    },
  ],
  canonicalPersonAId: managerAId,
  canonicalPersonBId: managerBId,
  catalog: {
    allTimeStandings: [],
    blowouts: { biggest: [], narrowestWins: [] },
    championships: { managerRecords: [], seasons: [] },
    headToHead: {
      allTimePairs: [pair],
      managerLedgers: [],
      seasonPairs: [pair],
    },
    highLow: {
      bestScoresInLosses: [],
      highestCombinedMatchups: [],
      highestScores: [],
      lowestScores: [],
      worstScoresInWins: [],
    },
    integrityBlocked: false,
    milestones: {
      keeper: {
        entries: [],
        status: "unavailable",
        summary: null,
      },
    },
    streaks: { longestLosses: [], longestWins: [] },
  },
  currentRecords: [],
  league: {
    id: leagueId,
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLeagueId: "95050",
    scoringType: "H2H_POINTS",
    season: 2026,
    size: 12,
    status: "in_season",
  },
  managers: [],
  meetings: [
    {
      championship: true,
      combinedPoints: 299.64,
      matchupId: "matchup-1",
      personAPoints: 178.24,
      personBPoints: 121.4,
      playoff: true,
      scoringPeriod: 14,
      season: 2025,
      winnerPersonId: managerAId,
    },
  ],
  pair,
  personA: {
    id: managerAId,
    name: "Fixture Manager 12",
    ownerHistory: [],
    ownerNames: ["Fixture Owner"],
    seasonSpan: "2024-2026",
  },
  personB: {
    id: managerBId,
    name: "Fixture Manager 15",
    ownerHistory: [],
    ownerNames: ["Fixture Rival"],
    seasonSpan: "2024-2026",
  },
  seasonPairs: [{ ...pair, season: 2025 }],
};

afterEach(() => {
  cleanup();
});

test("head-to-head records view renders symmetric rivalry detail", () => {
  render(<HeadToHeadRecordsView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Fixture Manager 12 vs Fixture Manager 15",
    }),
  ).toBeDefined();
  expect(
    screen.getByText("9 meetings across the imported league history."),
  ).toBeDefined();
  expect(screen.getByText("5-4-0")).toBeDefined();
  expect(screen.getByRole("heading", { name: "Season ledgers" })).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Biggest meetings" }),
  ).toBeDefined();
  expect(
    screen
      .getAllByRole("link", { name: "Manager page" })[0]
      ?.getAttribute("href"),
  ).toBe(`/leagues/${leagueId}/records/managers/${managerAId}`);
});
