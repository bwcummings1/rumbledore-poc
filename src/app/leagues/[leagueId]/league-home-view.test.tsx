import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { LeagueHomeData } from "@/home/league-home";
import { LeagueHomeView } from "./league-home-view";

const data: LeagueHomeData = {
  currentMatchups: [
    {
      away: {
        abbrev: "T02",
        isWinner: false,
        name: "Fixture Team 02",
        score: 0,
        teamId: "2",
      },
      home: {
        abbrev: "T01",
        isWinner: false,
        name: "Fixture Team 01",
        score: 0,
        teamId: "1",
      },
      id: "matchup-1",
      scoringPeriod: 1,
      status: "scheduled",
    },
  ],
  currentScoringPeriod: 1,
  league: {
    currentScoringPeriod: 0,
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLeagueId: "95050",
    scoringType: "H2H_POINTS",
    season: 2026,
    size: 12,
    sport: "ffl",
    status: "preseason",
  },
  records: [
    {
      holderName: "Fixture Manager 12",
      id: "record-1",
      label: "Highest weekly score",
      opponentName: "Fixture Manager 15",
      previousRecordId: null,
      recordType: "highest_single_week_score",
      scoringPeriod: 1,
      season: 2025,
      value: 142.5,
    },
  ],
  standings: [
    {
      abbrev: "T01",
      gamesBack: 0,
      id: "team-row-1",
      logo: null,
      losses: 0,
      managerNames: ["Fixture Manager 12"],
      name: "Fixture Team 01",
      playoffLineAfter: false,
      pointsAgainst: 0,
      pointsFor: 0,
      providerTeamId: "1",
      rank: 1,
      ties: 0,
      wins: 0,
    },
    {
      abbrev: "T02",
      gamesBack: 0,
      id: "team-row-2",
      logo: null,
      losses: 0,
      managerNames: ["Fixture Manager 15"],
      name: "Fixture Team 02",
      playoffLineAfter: false,
      pointsAgainst: 0,
      pointsFor: 0,
      providerTeamId: "2",
      rank: 2,
      ties: 0,
      wins: 0,
    },
  ],
  teams: [
    {
      abbrev: "T01",
      id: "team-row-1",
      logo: null,
      managerNames: ["Fixture Manager 12"],
      name: "Fixture Team 01",
      providerTeamId: "1",
    },
    {
      abbrev: "T02",
      id: "team-row-2",
      logo: null,
      managerNames: ["Fixture Manager 15"],
      name: "Fixture Team 02",
      providerTeamId: "2",
    },
  ],
  totals: {
    matchups: 84,
    members: 16,
    teams: 12,
  },
  userRole: "commissioner",
};

test("league home view renders standings, teams, and current matchups", () => {
  render(<LeagueHomeView data={data} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "NHS Alumni Annual" }),
  ).toBeDefined();
  expect(screen.getByRole("heading", { name: "Standings" })).toBeDefined();
  expect(screen.getAllByText("Fixture Team 01").length).toBeGreaterThan(1);
  expect(screen.getAllByText("Fixture Manager 12").length).toBeGreaterThan(1);
  expect(screen.getAllByText("0-0-0").length).toBeGreaterThan(1);
  expect(
    screen.getByRole("heading", { name: "Week 1 matchups" }),
  ).toBeDefined();
  expect(screen.getByRole("heading", { name: "Teams" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Record book" })).toBeDefined();
  expect(screen.getByText("Highest weekly score")).toBeDefined();
  expect(screen.getByText("142.50")).toBeDefined();
});
