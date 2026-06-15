import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { LeagueRecordsView } from "./league-records-view";
import type { RecordsPageData } from "./records-page-data";

const leagueId = "00000000-0000-4000-8000-000000000001";
const managerAId = "00000000-0000-4000-8000-000000000101";
const managerBId = "00000000-0000-4000-8000-000000000202";

const data: RecordsPageData = {
  catalog: {
    allTimeStandings: [
      {
        avgPointsAgainst: 101.8,
        avgPointsFor: 111.2,
        bestSeason: {
          finalPlacement: "champ",
          finalRank: 1,
          losses: 2,
          pointsFor: 1510.4,
          season: 2025,
          ties: 0,
          winPercentage: 0.8462,
          wins: 11,
        },
        careerLuck: 1.25,
        championships: 2,
        games: 36,
        losses: 12,
        madeChampionships: 3,
        personId: managerAId,
        personName: "Fixture Manager 12",
        playoffAppearances: 4,
        pointDifferential: 338.2,
        pointsAgainst: 3664.8,
        pointsFor: 4003,
        rank: 1,
        regularSeasonTitles: 1,
        runnerUps: 1,
        seasons: 3,
        ties: 0,
        winPercentage: 0.6667,
        wins: 24,
        worstSeason: null,
      },
    ],
    blowouts: { biggest: [], narrowestWins: [] },
    championships: {
      managerRecords: [],
      seasons: [
        {
          champion: {
            personId: managerAId,
            personName: "Fixture Manager 12",
          },
          championshipScore: 144.2,
          regularSeasonWinner: null,
          runnerUp: {
            personId: managerBId,
            personName: "Fixture Manager 15",
          },
          runnerUpScore: 121.4,
          season: 2025,
          thirdPlace: null,
        },
      ],
    },
    headToHead: {
      allTimePairs: [
        {
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
        },
      ],
      managerLedgers: [],
      seasonPairs: [],
    },
    highLow: {
      bestScoresInLosses: [],
      highestCombinedMatchups: [],
      highestScores: [],
      lowestScores: [],
      worstScoresInWins: [],
    },
    integrityBlocked: false,
    streaks: { longestLosses: [], longestWins: [] },
  },
  currentRecords: [
    {
      holderName: "Fixture Manager 12",
      holderPersonId: managerAId,
      id: "record-1",
      label: "Highest weekly score",
      opponentName: "Fixture Manager 15",
      opponentPersonId: managerBId,
      previousHolderName: "Fixture Manager 15",
      previousRecordId: "record-0",
      previousValue: 166.7,
      recordType: "highest_single_week_score",
      scoringPeriod: 4,
      season: 2025,
      value: 178.24,
    },
  ],
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
  managers: [
    {
      id: managerAId,
      name: "Fixture Manager 12",
      ownerHistory: [],
      ownerNames: ["Fixture Owner"],
      seasonSpan: "2024-2026",
    },
  ],
};

afterEach(() => {
  cleanup();
});

test("league records view renders structured record book sections", () => {
  render(<LeagueRecordsView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "NHS Alumni Annual record book",
    }),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "All-time standings" }),
  ).toBeDefined();
  expect(
    screen
      .getAllByRole("link", { name: "Fixture Manager 12" })[0]
      ?.getAttribute("href"),
  ).toBe(`/leagues/${leagueId}/records/managers/${managerAId}`);
  expect(
    screen.getByRole("heading", { name: "Highest weekly score" }),
  ).toBeDefined();
  expect(
    screen.getByText("Previous: Fixture Manager 15 at 166.70"),
  ).toBeDefined();
  expect(screen.getByRole("heading", { name: "Rivalries" })).toBeDefined();
  expect(
    screen
      .getAllByRole("link", {
        name: "Fixture Manager 12 vs Fixture Manager 15",
      })[0]
      .getAttribute("href"),
  ).toBe(`/leagues/${leagueId}/records/h2h/${managerAId}/${managerBId}`);
  expect(screen.getByText("Keeper milestones unavailable")).toBeDefined();
});

test("league records view renders an empty state", () => {
  render(
    <LeagueRecordsView
      data={{
        ...data,
        catalog: {
          ...data.catalog,
          allTimeStandings: [],
          championships: { managerRecords: [], seasons: [] },
          headToHead: {
            allTimePairs: [],
            managerLedgers: [],
            seasonPairs: [],
          },
        },
        currentRecords: [],
      }}
    />,
  );

  expect(screen.getByText("No records calculated yet")).toBeDefined();
});
