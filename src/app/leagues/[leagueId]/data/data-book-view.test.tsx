import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { DataBookPageData, DataBookSeason } from "./data-book-data";
import { DataBookView } from "./data-book-view";

const leagueId = "00000000-0000-4000-8000-000000000001";

function season(overrides: Partial<DataBookSeason>): DataBookSeason {
  return {
    people: [],
    season: 2026,
    settings: [],
    summary: {
      byeFacts: 0,
      matchupFacts: 0,
      people: 0,
      seasonTotalPoints: 0,
      teamWeekFacts: 0,
      teams: 0,
    },
    weeks: [],
    ...overrides,
  };
}

const data: DataBookPageData = {
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
  seasons: [
    season({
      people: [
        {
          confidence: 1,
          division: null,
          id: "team-season-2026-1",
          mappingMethod: "auto",
          ownerNames: ["Alex Owner"],
          personId: "person-1",
          personName: "Alex Manager",
          providerTeamId: "1",
          teamName: "Alpha Current",
          teamSeasonId: "team-season-2026-1",
        },
        {
          confidence: 0.95,
          division: "West",
          id: "team-season-2026-2",
          mappingMethod: "manual",
          ownerNames: ["Bailey Owner"],
          personId: "person-2",
          personName: "Bailey Manager",
          providerTeamId: "2",
          teamName: "Beta Current",
          teamSeasonId: "team-season-2026-2",
        },
      ],
      season: 2026,
      settings: [
        {
          detail: "Persisted from provider season settings.",
          group: "Settings",
          id: "league-size",
          label: "League size",
          value: "12",
        },
        {
          detail: "Provider matchup facts, including one-sided byes.",
          group: "Season totals",
          id: "matchup-facts",
          label: "Matchup facts",
          value: "2",
        },
      ],
      summary: {
        byeFacts: 1,
        matchupFacts: 2,
        people: 2,
        seasonTotalPoints: 287.42,
        teamWeekFacts: 3,
        teams: 2,
      },
      weeks: [
        {
          id: "week-2026-1-a",
          isChampionship: false,
          isPlayoff: false,
          managerName: "Alex Manager",
          matchupId: "matchup-2026-1",
          opponent: "Bailey Manager",
          opponentTeamName: "Beta Current",
          pointsAgainst: 131.32,
          pointsFor: 144.2,
          result: "win",
          scoringPeriod: 1,
          span: 1,
          teamName: "Alpha Current",
          weeklyRank: 1,
        },
        {
          id: "week-2026-1-b",
          isChampionship: false,
          isPlayoff: false,
          managerName: "Bailey Manager",
          matchupId: "matchup-2026-1",
          opponent: "Alex Manager",
          opponentTeamName: "Alpha Current",
          pointsAgainst: 144.2,
          pointsFor: 131.32,
          result: "loss",
          scoringPeriod: 1,
          span: 1,
          teamName: "Beta Current",
          weeklyRank: 2,
        },
        {
          id: "week-2026-2-a",
          isChampionship: false,
          isPlayoff: false,
          managerName: "Alex Manager",
          matchupId: "matchup-2026-bye",
          opponent: "BYE",
          opponentTeamName: null,
          pointsAgainst: 0,
          pointsFor: 155.1,
          result: "bye",
          scoringPeriod: 2,
          span: 1,
          teamName: "Alpha Current",
          weeklyRank: 1,
        },
      ],
    }),
    season({
      people: [
        {
          confidence: 1,
          division: null,
          id: "team-season-2025-1",
          mappingMethod: "auto",
          ownerNames: ["Alex Owner"],
          personId: "person-1",
          personName: "Alex Manager",
          providerTeamId: "1",
          teamName: "Alpha Throwback",
          teamSeasonId: "team-season-2025-1",
        },
      ],
      season: 2025,
      settings: [
        {
          detail: "Used by the substrate to derive multi-week matchup spans.",
          group: "Settings",
          id: "playoff-length",
          label: "Playoff matchup length",
          value: "2",
        },
      ],
      summary: {
        byeFacts: 0,
        matchupFacts: 1,
        people: 1,
        seasonTotalPoints: 325,
        teamWeekFacts: 1,
        teams: 1,
      },
      weeks: [
        {
          id: "week-2025-15-a",
          isChampionship: true,
          isPlayoff: true,
          managerName: "Alex Manager",
          matchupId: "matchup-2025-title",
          opponent: "BYE",
          opponentTeamName: null,
          pointsAgainst: 0,
          pointsFor: 325,
          result: "bye",
          scoringPeriod: 15,
          span: 2,
          teamName: "Alpha Throwback",
          weeklyRank: 1,
        },
      ],
    }),
  ],
};

afterEach(() => {
  cleanup();
});

test("Data Book renders the People grain for the selected season", () => {
  render(<DataBookView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "NHS Alumni Annual Data Book",
    }),
  ).toBeDefined();
  expect(screen.getByText("DATA BOOK")).toBeDefined();
  const table = screen.getByRole("table", {
    name: "2026 Data Book people",
  });

  expect(within(table).getByText("Alex Manager")).toBeDefined();
  expect(within(table).getByText("Alpha Current")).toBeDefined();
  expect(within(table).getByText("Bailey Manager")).toBeDefined();
});

test("Data Book switches grains with the masthead tabs", () => {
  render(<DataBookView data={data} />);

  fireEvent.click(screen.getByRole("tab", { name: "Settings" }));

  const settingsTable = screen.getByRole("table", {
    name: "2026 Data Book settings",
  });
  expect(settingsTable).toBeDefined();
  expect(within(settingsTable).getByText("League size")).toBeDefined();
  expect(
    screen.queryByRole("table", { name: "2026 Data Book people" }),
  ).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "Weeks" }));

  const weeksTable = screen.getByRole("table", {
    name: "2026 Data Book weeks",
  });
  expect(within(weeksTable).getAllByText("W1").length).toBeGreaterThan(0);
  expect(within(weeksTable).getAllByText("BYE").length).toBeGreaterThan(0);
});

test("Data Book year dropdown changes the displayed season", () => {
  render(<DataBookView data={data} />);

  fireEvent.change(screen.getByLabelText("Data Book season"), {
    target: { value: "2025" },
  });

  const peopleTable = screen.getByRole("table", {
    name: "2025 Data Book people",
  });
  expect(peopleTable).toBeDefined();
  expect(within(peopleTable).getByText("Alpha Throwback")).toBeDefined();
  expect(screen.queryByText("Alpha Current")).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
  expect(
    within(
      screen.getByRole("table", { name: "2025 Data Book settings" }),
    ).getByText("Playoff matchup length"),
  ).toBeDefined();
});

test("Data Book degrades to plain empty tables for a clean league", () => {
  render(
    <DataBookView
      data={{
        ...data,
        seasons: [
          season({
            season: 2026,
            summary: {
              byeFacts: 0,
              matchupFacts: 0,
              people: 0,
              seasonTotalPoints: 0,
              teamWeekFacts: 0,
              teams: 0,
            },
          }),
        ],
      }}
    />,
  );

  expect(
    screen.getAllByText(
      "No people or team-season rows have been imported for this season.",
    ).length,
  ).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("tab", { name: "Weeks" }));

  expect(
    screen.getAllByText(
      "No weekly facts have been materialized for this season.",
    ).length,
  ).toBeGreaterThan(0);
});

test("Data Book exposes labelled navigation and 44px controls", () => {
  render(<DataBookView data={data} />);

  expect(
    screen.getByRole("navigation", { name: "Data Book grains navigation" }),
  ).toBeDefined();
  const yearSelect = screen.getByLabelText("Data Book season");
  expect(yearSelect.className).toContain("min-h-11");

  for (const tab of screen.getAllByRole("tab")) {
    expect(tab.className).toContain("min-h-11");
  }
});
