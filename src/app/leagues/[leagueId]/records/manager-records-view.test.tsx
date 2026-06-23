import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ManagerRecordsView } from "./manager-records-view";
import type { ManagerRecordsPageData } from "./records-page-data";

const leagueId = "00000000-0000-4000-8000-000000000001";
const managerAId = "00000000-0000-4000-8000-000000000101";
const managerBId = "00000000-0000-4000-8000-000000000202";

const data: ManagerRecordsPageData = {
  catalog: {
    achievements: {
      highestScoringSeasons: [],
      longestWinStreaks: [],
      mostRegularSeasonTitles: [],
      mostRunnerUps: [],
      mostTitles: [],
      mostTopScoringWeeks: [],
    },
    allTimeStandings: [
      {
        avgPointsAgainst: 101.8,
        avgPointsFor: 111.2,
        bestSeason: null,
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
    championships: { managerRecords: [], seasons: [] },
    headToHead: {
      allTimePairs: [],
      longestStreaks: [],
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
      mostLastPlaceFinishes: [],
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
      standings: [],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    regularSeason: {
      highestScoringAverages: [],
      highestScoringSeasons: [],
      lowestScoringSeasons: [],
      mostPointsAgainstSeasons: [],
      standings: [],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    streaks: { longestLosses: [], longestWins: [] },
  },
  championshipRecord: {
    bestFinish: null,
    championshipAppearances: 2,
    championshipGameLosses: 1,
    championshipGamePointsAgainst: 201.4,
    championshipGamePointsFor: 220.8,
    championshipGameTies: 0,
    championshipGameWins: 1,
    championships: 1,
    personId: managerAId,
    personName: "Fixture Manager 12",
    playoffAppearances: 3,
    playoffLosses: 2,
    playoffPointsAgainst: 402.1,
    playoffPointsFor: 441.6,
    playoffTies: 0,
    playoffWins: 3,
    regularSeasonTitles: 1,
    runnerUps: 1,
    seasons: 3,
    thirdPlaces: 0,
  },
  currentRecords: [
    {
      holderName: "Fixture Manager 12",
      holderPersonId: managerAId,
      id: "record-1",
      label: "Highest weekly score",
      opponentName: "Fixture Manager 15",
      opponentPersonId: managerBId,
      previousHolderName: null,
      previousRecordId: null,
      previousValue: null,
      recordType: "highest_single_week_score",
      scoringPeriod: 4,
      season: 2025,
      value: 178.24,
    },
  ],
  h2hLedgers: [
    {
      avgPointsAgainst: 108.1,
      avgPointsFor: 112.4,
      championshipMeetings: 1,
      currentStreak: null,
      highestScore: 178.24,
      lastScoringPeriod: 14,
      lastSeason: 2025,
      longestStreak: null,
      losses: 4,
      meetings: 9,
      opponentHighestScore: 166.7,
      opponentName: "Fixture Manager 15",
      opponentPersonId: managerBId,
      personId: managerAId,
      personName: "Fixture Manager 12",
      playoffMeetings: 2,
      pointsAgainst: 972.9,
      pointsFor: 1011.6,
      season: 0,
      ties: 0,
      wins: 5,
    },
  ],
  heldRecords: [
    {
      holderName: "Fixture Manager 12",
      holderPersonId: managerAId,
      id: "record-1",
      label: "Highest weekly score",
      opponentName: "Fixture Manager 15",
      opponentPersonId: managerBId,
      previousHolderName: null,
      previousRecordId: null,
      previousValue: null,
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
  manager: {
    id: managerAId,
    name: "Fixture Manager 12",
    ownerHistory: [
      {
        endSeason: null,
        ownerNames: ["Fixture Owner"],
        providerMemberIds: ["owner-1"],
        startSeason: 2024,
      },
    ],
    ownerNames: ["Fixture Owner"],
    seasonSpan: "2024-2026",
  },
  managers: [],
  placements: [{ roles: ["Champion", "Regular-season winner"], season: 2025 }],
  seasonLines: [
    {
      avgPointsAgainst: 101.4,
      avgPointsFor: 116.2,
      finalPlacement: "champ",
      finalRank: 1,
      longestLossStreak: 1,
      longestWinStreak: 5,
      losses: 2,
      luck: 0.75,
      madeChampionship: true,
      madePlayoffs: true,
      playoffSeed: 1,
      pointDifferential: 192.4,
      pointsAgainst: 1318.2,
      pointsFor: 1510.6,
      season: 2025,
      ties: 0,
      winPercentage: 0.8462,
      wins: 11,
    },
  ],
  signatureWeeks: {
    bestLosses: [],
    highestScores: [
      {
        matchupId: "matchup-1",
        opponentName: "Fixture Manager 15",
        opponentPersonId: managerBId,
        pointsAgainst: 144.1,
        pointsFor: 178.24,
        result: "win",
        scoringPeriod: 4,
        season: 2025,
      },
    ],
    lowestScores: [],
    worstWins: [],
  },
};

afterEach(() => {
  cleanup();
});

test("manager records view renders career, season, and rivalry detail", () => {
  render(<ManagerRecordsView data={data} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Fixture Manager 12" }),
  ).toBeDefined();
  expect(screen.getByText("Fixture Owner - 2024-2026")).toBeDefined();
  expect(screen.getByText("24-12-0")).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Current records held" }),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Season by season" }),
  ).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "Fixture Manager 15" })
      .getAttribute("href"),
  ).toBe(`/leagues/${leagueId}/records/h2h/${managerAId}/${managerBId}`);
});
