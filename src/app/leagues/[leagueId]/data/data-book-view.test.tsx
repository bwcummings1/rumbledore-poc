import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
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
          opponentPersonId: "person-2",
          opponentTeamName: "Beta Current",
          opponentTeamSeasonId: "team-season-2026-2",
          personId: "person-1",
          pointsAgainst: 131.32,
          pointsFor: 144.2,
          result: "win",
          scoringPeriod: 1,
          span: 1,
          teamName: "Alpha Current",
          teamSeasonId: "team-season-2026-1",
          weeklyRank: 1,
        },
        {
          id: "week-2026-1-b",
          isChampionship: false,
          isPlayoff: false,
          managerName: "Bailey Manager",
          matchupId: "matchup-2026-1",
          opponent: "Alex Manager",
          opponentPersonId: "person-1",
          opponentTeamName: "Alpha Current",
          opponentTeamSeasonId: "team-season-2026-1",
          personId: "person-2",
          pointsAgainst: 144.2,
          pointsFor: 131.32,
          result: "loss",
          scoringPeriod: 1,
          span: 1,
          teamName: "Beta Current",
          teamSeasonId: "team-season-2026-2",
          weeklyRank: 2,
        },
        {
          id: "week-2026-2-a",
          isChampionship: false,
          isPlayoff: false,
          managerName: "Alex Manager",
          matchupId: "matchup-2026-bye",
          opponent: "BYE",
          opponentPersonId: null,
          opponentTeamName: null,
          opponentTeamSeasonId: null,
          personId: "person-1",
          pointsAgainst: 0,
          pointsFor: 155.1,
          result: "bye",
          scoringPeriod: 2,
          span: 1,
          teamName: "Alpha Current",
          teamSeasonId: "team-season-2026-1",
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
          opponentPersonId: null,
          opponentTeamName: null,
          opponentTeamSeasonId: null,
          personId: "person-1",
          pointsAgainst: 0,
          pointsFor: 325,
          result: "bye",
          scoringPeriod: 15,
          span: 2,
          teamName: "Alpha Throwback",
          teamSeasonId: "team-season-2025-1",
          weeklyRank: 1,
        },
      ],
    }),
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockEditResponse(response: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(response), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );
}

function requestBody(fetchMock: ReturnType<typeof mockEditResponse>) {
  const body = fetchMock.mock.calls.at(-1)?.[1]?.body;
  return JSON.parse(String(body)) as Record<string, unknown>;
}

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

test("real-name edits default to all years and render as draft changes", async () => {
  const fetchMock = mockEditResponse({
    affectedTargetIds: ["person-1"],
    editId: "edit-person-1",
    editIds: ["edit-person-1"],
    scope: "all_years",
  });
  render(<DataBookView canEditData={true} data={data} />);

  fireEvent.click(
    screen.getAllByRole("button", {
      name: "Edit real name for Alex Manager",
    })[0],
  );
  fireEvent.change(screen.getByLabelText("real name for Alex Manager"), {
    target: { value: "Alex Canon" },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Confirm real name for Alex Manager",
    }),
  );

  expect((screen.getByLabelText("Scope") as HTMLSelectElement).value).toBe(
    "all_years",
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply draft edit" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/curation/edits",
    expect.objectContaining({ method: "POST" }),
  );
  expect(requestBody(fetchMock)).toMatchObject({
    editClass: "cosmetic",
    field: "canonical_name",
    reason: "Corrected real name from Data Book",
    scope: "all_years",
    targetId: "person-1",
    targetKind: "person",
    value: "Alex Canon",
  });
  expect(requestBody(fetchMock)).not.toHaveProperty("season");

  await waitFor(() => {
    expect(screen.getAllByText("Alex Canon").length).toBeGreaterThan(0);
  });
  expect(screen.getByText("Draft change")).toBeDefined();
  expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
});

test("team-name edits default to this-year-only and submit the selected season", async () => {
  const fetchMock = mockEditResponse({
    affectedTargetIds: ["team-season-2026-1"],
    editId: "edit-team-1",
    editIds: ["edit-team-1"],
    scope: "this_year_only",
  });
  render(<DataBookView canEditData={true} data={data} />);

  fireEvent.click(
    screen.getAllByRole("button", {
      name: "Edit team name for Alex Manager",
    })[0],
  );
  fireEvent.change(screen.getByLabelText("team name for Alex Manager"), {
    target: { value: "Alpha 2026 Brand" },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Confirm team name for Alex Manager",
    }),
  );

  expect((screen.getByLabelText("Scope") as HTMLSelectElement).value).toBe(
    "this_year_only",
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply draft edit" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(requestBody(fetchMock)).toMatchObject({
    field: "team_name",
    scope: "this_year_only",
    season: 2026,
    targetId: "team-season-2026-1",
    targetKind: "team_season",
    value: "Alpha 2026 Brand",
  });
  await waitFor(() => {
    expect(screen.getAllByText("Alpha 2026 Brand").length).toBeGreaterThan(0);
  });
});

test("team-name scope can be overridden to all years", async () => {
  const fetchMock = mockEditResponse({
    affectedTargetIds: ["team-season-2026-1", "team-season-2025-1"],
    editId: "edit-team-all-years",
    editIds: ["edit-team-all-years-1", "edit-team-all-years-2"],
    scope: "all_years",
  });
  render(<DataBookView canEditData={true} data={data} />);

  fireEvent.click(
    screen.getAllByRole("button", {
      name: "Edit team name for Alex Manager",
    })[0],
  );
  fireEvent.change(screen.getByLabelText("team name for Alex Manager"), {
    target: { value: "Alpha Dynasty" },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Confirm team name for Alex Manager",
    }),
  );

  const scope = screen.getByLabelText("Scope") as HTMLSelectElement;
  expect(scope.value).toBe("this_year_only");
  fireEvent.change(scope, { target: { value: "all_years" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply draft edit" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(requestBody(fetchMock)).toMatchObject({
    field: "team_name",
    scope: "all_years",
    targetId: "team-season-2026-1",
    targetKind: "team_season",
    value: "Alpha Dynasty",
  });
  expect(requestBody(fetchMock)).not.toHaveProperty("season");

  fireEvent.change(screen.getByLabelText("Data Book season"), {
    target: { value: "2025" },
  });
  expect(screen.getAllByText("Alpha Dynasty").length).toBeGreaterThan(0);
});

test("non-stewards see the Data Book as read-only", () => {
  render(<DataBookView canEditData={false} data={data} />);

  expect(
    screen.queryByRole("button", { name: /Edit real name for/i }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Edit team name for/i }),
  ).toBeNull();
});
