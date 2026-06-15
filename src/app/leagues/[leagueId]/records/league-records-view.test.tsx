import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { LeagueHomeData } from "@/home/league-home";
import { LeagueRecordsView } from "./league-records-view";

const data: LeagueHomeData = {
  activation: null,
  currentMatchups: [],
  currentScoringPeriod: 1,
  league: {
    currentScoringPeriod: 1,
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLeagueId: "95050",
    scoringType: "H2H_POINTS",
    season: 2026,
    size: 12,
    sport: "ffl",
    status: "in_season",
  },
  records: [
    {
      holderName: "Fixture Manager 12",
      id: "record-1",
      label: "Highest weekly score",
      opponentName: "Fixture Manager 15",
      previousRecordId: null,
      recordType: "highest_single_week_score",
      scoringPeriod: 4,
      season: 2025,
      value: 178.24,
    },
  ],
  standings: [],
  storylines: [],
  teams: [],
  totals: {
    matchups: 0,
    members: 0,
    teams: 0,
  },
  userRole: "member",
};

afterEach(() => {
  cleanup();
});

test("league records view renders current record book entries", () => {
  render(<LeagueRecordsView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "NHS Alumni Annual record book",
    }),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Highest weekly score" }),
  ).toBeDefined();
  expect(screen.getByText("178.24")).toBeDefined();
  expect(
    screen.getByText(
      "Fixture Manager 12 · vs Fixture Manager 15 · 2025 · Week 4",
    ),
  ).toBeDefined();
  expect(
    screen.getByRole("link", { name: /league home/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001");
});

test("league records view renders an empty state", () => {
  render(<LeagueRecordsView data={{ ...data, records: [] }} />);

  expect(screen.getByText("No records calculated yet")).toBeDefined();
});
