import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { LeagueHomeData } from "@/home/league-home";
import { LEAGUE_PUBLICATION_SECTIONS } from "@/news/sections";
import { LeagueHomeView } from "./league-home-view";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

afterEach(() => {
  cleanup();
});

const data: LeagueHomeData = {
  activation: null,
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
  storylines: [
    {
      authorPersona: "commissioner",
      byline: "Commissioner",
      dek: "A commissioner standfirst for the dashboard teaser.",
      id: "storyline-1",
      publishedAt: "2026-06-11T00:00:00.000Z",
      section: LEAGUE_PUBLICATION_SECTIONS[4],
      summary: "Fixture Team 01 is the first team to watch this week.",
      thumbnailUrl: "",
      title: "Commissioner: NHS Alumni Annual snapshot",
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
  expect(screen.getByRole("heading", { name: "From the Press" })).toBeDefined();
  const pressTeaser = screen.getByLabelText("From the Press");
  expect(
    pressTeaser
      .querySelector('[data-story-card-variant="rail"]')
      ?.textContent?.includes("Commissioner: NHS Alumni Annual snapshot"),
  ).toBe(true);
  expect(pressTeaser.querySelector("[data-front-tier]")).toBeNull();
  expect(
    screen.getByText("Commissioner: NHS Alumni Annual snapshot"),
  ).toBeDefined();
  expect(screen.getByText("Previews")).toBeDefined();
  expect(screen.getByText("Commissioner")).toBeDefined();
  expect(
    screen.getByRole("link", { name: /read post/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/press/storyline-1");
  expect(
    screen.getByRole("link", { name: "Read The Press" }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/press");
  expect(
    screen.getByRole("link", { name: /invite/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/members");
});

test("league home view renders the claimed-team activation hook", () => {
  const claimedStanding = data.standings[0];
  if (!claimedStanding) {
    throw new Error("claimed standing fixture is missing");
  }

  render(
    <LeagueHomeView
      data={{
        ...data,
        activation: {
          allTime: {
            losses: 5,
            pointsAgainst: 1800.5,
            pointsFor: 2010.25,
            seasons: 2,
            ties: 1,
            winPercentage: 0.65625,
            wins: 10,
          },
          castTeaser: {
            message: "The cast has been covering Fixture Team 01.",
            mode: "team_reference",
            storyline: data.storylines[0] ?? null,
          },
          currentMatchup: data.currentMatchups[0] ?? null,
          providerMemberId: "provider-member-1",
          records: data.records,
          team: { ...claimedStanding, isClaimedByUser: true },
        },
        standings: [
          { ...claimedStanding, isClaimedByUser: true },
          ...data.standings.slice(1),
        ],
      }}
    />,
  );

  expect(screen.getByText("Your team is waiting")).toBeDefined();
  expect(screen.getByText("10-5-1 · 65.6%")).toBeDefined();
  expect(
    screen.getByText("The cast has been covering Fixture Team 01."),
  ).toBeDefined();
  expect(screen.getByText("You")).toBeDefined();
});
