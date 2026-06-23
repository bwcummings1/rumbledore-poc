import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { LeagueRecordsView } from "./league-records-view";
import type { RecordsPageData } from "./records-page-data";

const leagueId = "00000000-0000-4000-8000-000000000001";
const managerAId = "00000000-0000-4000-8000-000000000101";
const managerBId = "00000000-0000-4000-8000-000000000202";

const data: RecordsPageData = {
  catalog: {
    achievements: {
      highestScoringSeasons: [],
      longestWinStreaks: [],
      mostRegularSeasonTitles: [],
      mostRunnerUps: [],
      mostTitles: [],
      mostTopScoringWeeks: [
        {
          personId: managerAId,
          personName: "Fixture Manager 12",
          recordType: "most_top_scoring_weeks",
          value: 4,
        },
      ],
    },
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
    blowouts: {
      biggest: [],
      biggestLosses: [],
      narrowestLosses: [],
      narrowestWins: [],
    },
    championships: {
      managerRecords: [
        {
          bestFinish: null,
          championshipAppearances: 2,
          championshipGameLosses: 1,
          championshipGamePointsAgainst: 240,
          championshipGamePointsFor: 260,
          championshipGameTies: 0,
          championshipGameWins: 1,
          championships: 1,
          personId: managerAId,
          personName: "Fixture Manager 12",
          playoffAppearances: 3,
          playoffLosses: 2,
          playoffPointsAgainst: 470,
          playoffPointsFor: 510,
          playoffTies: 0,
          playoffWins: 4,
          regularSeasonTitles: 1,
          runnerUps: 1,
          seasons: 3,
          thirdPlaces: 0,
        },
      ],
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
      longestStreaks: [
        {
          holder: { personId: managerBId, personName: "Fixture Manager 15" },
          length: 3,
          meetings: 9,
          opponent: { personId: managerAId, personName: "Fixture Manager 12" },
          season: 0,
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
    lowlights: {
      biggestLosses: [],
      lowestScoringSeasons: [],
      mostBottomScoringWeeks: [],
      mostLastPlaceFinishes: [
        {
          personId: managerBId,
          personName: "Fixture Manager 15",
          recordType: "most_last_place_finishes",
          value: 2,
        },
      ],
      narrowestLosses: [],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    milestones: {
      keeper: {
        entries: [],
        status: "unavailable",
        summary: null,
      },
    },
    playoff: {
      highestScoringAverages: [],
      highestScoringSeasons: [],
      lowestScoringSeasons: [],
      mostPointsAgainstSeasons: [],
      standings: [
        {
          avgPointsAgainst: 117.5,
          avgPointsFor: 127.5,
          bottomScoringWeeks: 0,
          games: 6,
          losses: 2,
          personId: managerAId,
          personName: "Fixture Manager 12",
          pointDifferential: 40,
          pointsAgainst: 470,
          pointsFor: 510,
          rank: 1,
          seasons: 3,
          ties: 0,
          topScoringWeeks: 1,
          winPercentage: 0.6667,
          wins: 4,
        },
      ],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    regularSeason: {
      highestScoringAverages: [],
      highestScoringSeasons: [
        {
          losses: 2,
          personId: managerAId,
          personName: "Fixture Manager 12",
          pointsAgainst: 1200,
          pointsFor: 1510.4,
          recordType: "most_points_for_season",
          season: 2025,
          ties: 0,
          value: 1510.4,
          winPercentage: 0.8462,
          wins: 11,
        },
      ],
      lowestScoringSeasons: [],
      mostPointsAgainstSeasons: [],
      standings: [
        {
          avgPointsAgainst: 101.8,
          avgPointsFor: 111.2,
          bottomScoringWeeks: 0,
          games: 30,
          losses: 10,
          personId: managerAId,
          personName: "Fixture Manager 12",
          pointDifferential: 338.2,
          pointsAgainst: 3000,
          pointsFor: 3338.2,
          rank: 1,
          seasons: 3,
          ties: 0,
          topScoringWeeks: 4,
          winPercentage: 0.6667,
          wins: 20,
        },
      ],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
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
  lens: {
    groupingId: null,
    groupings: [],
    scope: "all",
    seasonSet: [],
    segment: "both",
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
  expect(screen.getByRole("heading", { name: "All-time" })).toBeDefined();
  expect(
    screen
      .getAllByRole("link", { name: "Fixture Manager 12" })[0]
      ?.getAttribute("href"),
  ).toBe(`/leagues/${leagueId}/records/managers/${managerAId}`);
  expect(
    screen.getByRole("heading", { name: "Highest weekly score" }),
  ).toBeDefined();
  expect(screen.getByText("Previous")).toBeDefined();
  expect(screen.getByText("Fixture Manager 15 at 166.70")).toBeDefined();
  expect(screen.getByRole("heading", { name: "Regular season" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Playoff" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Head-to-head" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Achievements" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Lowlights" })).toBeDefined();
  expect(
    screen
      .getAllByRole("link", {
        name: "Fixture Manager 12 vs Fixture Manager 15",
      })[0]
      .getAttribute("href"),
  ).toBe(`/leagues/${leagueId}/records/h2h/${managerAId}/${managerBId}`);
  expect(screen.getByText("Most last-place finishes")).toBeDefined();
  expect(screen.getByRole("tab", { name: "Regular" })).toBeDefined();
  expect(screen.queryByText("Era")).toBeNull();
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
            longestStreaks: [],
            managerLedgers: [],
            seasonPairs: [],
          },
        },
        currentRecords: [],
      }}
    />,
  );

  expect(
    screen.getByText("No pushed data yet \u2014 push from the Data Book"),
  ).toBeDefined();
});

test("league records view renders era lens controls when confirmed groupings exist", () => {
  render(
    <LeagueRecordsView
      data={{
        ...data,
        lens: {
          groupingId: "00000000-0000-4000-8000-000000000777",
          groupings: [
            {
              formatType: "traditional",
              id: "00000000-0000-4000-8000-000000000777",
              kind: "era",
              name: "Era 2",
              ordinal: 2,
              seasons: [2020, 2021, 2022],
            },
          ],
          scope: "all",
          seasonSet: [2020, 2021, 2022],
          segment: "regular",
        },
      }}
    />,
  );

  expect(screen.getByText("Era")).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Cumulative" }).getAttribute("href"),
  ).toBe(`/leagues/${leagueId}/records?segment=regular`);
  expect(
    screen.getByRole("link", { name: "Playoff" }).getAttribute("href"),
  ).toBe(
    `/leagues/${leagueId}/records?segment=playoff&grouping=00000000-0000-4000-8000-000000000777`,
  );
});
