import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type {
  DataBookCurationState,
  DataBookPageData,
  DataBookSeason,
} from "./data-book-data";
import { DataBookView } from "./data-book-view";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/leagues/00000000-0000-4000-8000-000000000001/data",
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

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

function curationState(
  overrides: Partial<DataBookCurationState> = {},
): DataBookCurationState {
  const base: DataBookCurationState = {
    activeCheckpoint: null,
    checkpoints: [],
    hasSavedUnpushed: false,
    hasUnsavedDraft: false,
    pushedSeasons: 0,
    seasons: [
      {
        activeCheckpointId: null,
        activeCheckpointLabel: null,
        autoSuggestFinalize: false,
        finalizedAt: null,
        finalizedByUserId: null,
        hasSavedUnpushed: false,
        hasUnsavedDraft: false,
        isPushed: false,
        latestPushAt: null,
        latestPushCheckpointId: null,
        latestPushId: null,
        mode: "live",
        providerComplete: false,
        reason: null,
        season: 2026,
      },
      {
        activeCheckpointId: null,
        activeCheckpointLabel: null,
        autoSuggestFinalize: true,
        finalizedAt: null,
        finalizedByUserId: null,
        hasSavedUnpushed: false,
        hasUnsavedDraft: false,
        isPushed: false,
        latestPushAt: null,
        latestPushCheckpointId: null,
        latestPushId: null,
        mode: "live",
        providerComplete: true,
        reason: null,
        season: 2025,
      },
    ],
    totalSeasons: 2,
  };

  return {
    ...base,
    ...overrides,
    seasons: overrides.seasons ?? base.seasons,
  };
}

const data: DataBookPageData = {
  curation: curationState(),
  eraProposals: [
    {
      id: "00000000-0000-4000-8000-000000000010",
      kind: "era",
      name: "12-team era (2026-present)",
      ordinal: 1,
      rationale:
        "Boundary starts at 2026: team count changed 10 -> 12. 2026 shares 12 teams, 1-week playoffs, 6 playoff teams, 14 regular-season weeks, FLEX lineup.",
      seasons: [2026],
      status: "proposed",
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
  selectedSeason: 2026,
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
          roster: [
            {
              actualPoints: 28.4,
              id: "roster-2026-1-a",
              playerName: "Bijan Robinson",
              position: "RB",
              projectedPoints: 17.1,
              proTeam: "ATL",
              slot: "RB",
              statBreakdown: [
                {
                  fantasyPoints: 12,
                  providerStatId: 25,
                  statCategory: "rushing",
                  statKey: "rushingTouchdowns",
                  statSource: "actual",
                  statValue: 2,
                },
                {
                  fantasyPoints: 16.4,
                  providerStatId: 24,
                  statCategory: "rushing",
                  statKey: "rushingYards",
                  statSource: "actual",
                  statValue: 164,
                },
                {
                  fantasyPoints: 17.1,
                  providerStatId: 24,
                  statCategory: "rushing",
                  statKey: "rushingYards",
                  statSource: "projected",
                  statValue: 171,
                },
              ],
              started: true,
              status: "active",
            },
            {
              actualPoints: 8.2,
              id: "roster-2026-1-b",
              playerName: "Bench Receiver",
              position: "WR",
              projectedPoints: 6.4,
              proTeam: "TB",
              slot: "BE",
              statBreakdown: [],
              started: false,
              status: "active",
            },
          ],
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
          roster: [],
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
          roster: [],
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
          roster: [],
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
  router.push.mockClear();
  router.refresh.mockClear();
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

function requestBodies(fetchMock: ReturnType<typeof mockEditResponse>) {
  return fetchMock.mock.calls.map((call) =>
    JSON.parse(String(call[1]?.body)),
  ) as Array<Record<string, unknown>>;
}

function openCurationDetails(): HTMLDetailsElement {
  const details = screen
    .getByText("Curation details")
    .closest("details") as HTMLDetailsElement | null;
  if (!details) {
    throw new Error("Curation details disclosure was not rendered");
  }
  fireEvent.click(details.querySelector("summary") ?? details);
  return details;
}

test("Data Book renders the People grain for the selected season", () => {
  render(<DataBookView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "NHS Alumni Annual League Data",
    }),
  ).toBeDefined();
  expect(screen.getByText("LEAGUE DATA")).toBeDefined();
  const mastheadNav = screen.getByRole("navigation", {
    name: "League Data sections navigation",
  });
  expect(
    within(mastheadNav)
      .getAllByRole("tab")
      .map((tab) => tab.textContent),
  ).toEqual(["Data Book", "Edit Ledger"]);
  expect(
    within(mastheadNav)
      .getByRole("tab", { name: "Data Book" })
      .getAttribute("aria-current"),
  ).toBe("page");
  const table = screen.getByRole("table", {
    name: "2026 Data Book people",
  });

  expect(within(table).getByText("Alex Manager")).toBeDefined();
  expect(within(table).getByText("Alpha Current")).toBeDefined();
  expect(within(table).getByText("Bailey Manager")).toBeDefined();
});

test("Data Book switches grains with the secondary selector", () => {
  render(<DataBookView data={data} />);

  fireEvent.click(screen.getByRole("radio", { name: "Settings" }));

  const settingsTable = screen.getByRole("table", {
    name: "2026 Data Book settings",
  });
  expect(settingsTable).toBeDefined();
  expect(within(settingsTable).getByText("League size")).toBeDefined();
  expect(
    screen.queryByRole("table", { name: "2026 Data Book people" }),
  ).toBeNull();

  fireEvent.click(screen.getByRole("radio", { name: "Weeks" }));

  const weeksTable = screen.getByRole("table", {
    name: "2026 Data Book weeks",
  });
  expect(within(weeksTable).getAllByText("W1").length).toBeGreaterThan(0);
  expect(within(weeksTable).getAllByText("BYE").length).toBeGreaterThan(0);
  expect(
    screen.getByRole("region", { name: "Alex Manager week 1 roster" }),
  ).toBeDefined();
  expect(screen.getByText("Bijan Robinson")).toBeDefined();
  expect(screen.getByText("28.4")).toBeDefined();
  fireEvent.click(screen.getByText("28.4 stat pts"));
  expect(screen.getByText("rushingTouchdowns")).toBeDefined();
  expect(screen.getAllByText(/rushingYards/).length).toBeGreaterThan(0);
});

test("Settings grain confirms adjusted era proposals", async () => {
  const fetchMock = mockEditResponse({
    grouping: {
      ...data.eraProposals[0],
      name: "Owner era",
      seasons: [2026],
      status: "confirmed",
    },
  });
  render(<DataBookView canEditData={true} data={data} />);

  fireEvent.click(screen.getByRole("radio", { name: "Settings" }));

  expect(screen.getByRole("region", { name: "Era proposals" })).toBeDefined();
  expect(screen.getByText("12-team era (2026-present)")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
  fireEvent.change(screen.getByLabelText("Era name"), {
    target: { value: "Owner era" },
  });
  fireEvent.change(screen.getByLabelText("Seasons"), {
    target: { value: "2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/curation/groupings",
    expect.objectContaining({ method: "POST" }),
  );
  expect(requestBody(fetchMock)).toMatchObject({
    action: "confirm",
    groupingId: "00000000-0000-4000-8000-000000000010",
    name: "Owner era",
    reason: "Confirmed era proposal from Data Book",
    seasons: [2026],
  });

  await waitFor(() => expect(screen.getByText("confirmed")).toBeDefined());
  expect(
    screen.getByText(
      "Owner era confirmed. Save and push the affected seasons before Records can use it.",
    ),
  ).toBeDefined();
});

test("Settings grain dismisses proposed eras", async () => {
  const fetchMock = mockEditResponse({
    grouping: {
      ...data.eraProposals[0],
      status: "dismissed",
    },
  });
  render(<DataBookView canEditData={true} data={data} />);

  fireEvent.click(screen.getByRole("radio", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(requestBody(fetchMock)).toMatchObject({
    action: "dismiss",
    groupingId: "00000000-0000-4000-8000-000000000010",
    reason: "Dismissed era proposal from Data Book",
  });
  await waitFor(() => {
    expect(screen.queryByText("12-team era (2026-present)")).toBeNull();
  });
  expect(screen.queryByRole("region", { name: "Era proposals" })).toBeNull();
});

test("Data Book year dropdown changes the displayed season", () => {
  render(<DataBookView data={data} />);

  fireEvent.change(screen.getByLabelText("Data Book season"), {
    target: { value: "2025" },
  });
  expect(router.push).toHaveBeenCalledWith(
    "/leagues/00000000-0000-4000-8000-000000000001/data?season=2025",
  );

  const peopleTable = screen.getByRole("table", {
    name: "2025 Data Book people",
  });
  expect(peopleTable).toBeDefined();
  expect(within(peopleTable).getByText("Alpha Throwback")).toBeDefined();
  expect(screen.queryByText("Alpha Current")).toBeNull();

  fireEvent.click(screen.getByRole("radio", { name: "Settings" }));
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
        eraProposals: [],
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

  fireEvent.click(screen.getByRole("radio", { name: "Weeks" }));

  expect(
    screen.getAllByText(
      "No weekly facts have been materialized for this season.",
    ).length,
  ).toBeGreaterThan(0);
});

test("Data Book exposes labelled navigation and 44px controls", () => {
  render(<DataBookView data={data} />);

  expect(
    screen.getByRole("navigation", {
      name: "League Data sections navigation",
    }),
  ).toBeDefined();
  const mastheadNav = screen.getByRole("navigation", {
    name: "League Data sections navigation",
  });
  expect(
    within(mastheadNav)
      .getAllByRole("tab")
      .map((tab) => tab.textContent),
  ).toEqual(["Data Book", "Edit Ledger"]);
  expect(
    within(mastheadNav)
      .getByRole("tab", { name: "Edit Ledger" })
      .getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/ledger");

  const grainSelector = document.querySelector(
    '[data-slot="data-book-grain-selector"]',
  ) as HTMLElement | null;
  expect(grainSelector).toBeDefined();
  expect(
    screen.getByRole("radiogroup", { name: "Data Book grain" }),
  ).toBeDefined();
  const yearSelect = screen.getByLabelText("Data Book season");
  expect(yearSelect.className).toContain("min-h-11");

  for (const tab of within(mastheadNav).getAllByRole("tab")) {
    expect(tab.className).toContain("min-h-11");
  }
  for (const option of screen.getAllByRole("radio")) {
    expect(option.className).toContain("min-h-11");
  }
});

test("Data Book renders curation controls as a compact section toolbar", () => {
  render(<DataBookView canEditData={true} data={data} />);

  const toolbar = document.querySelector(
    '[data-slot="data-book-toolbar"]',
  ) as HTMLElement | null;
  expect(toolbar).toBeDefined();
  expect(
    within(toolbar as HTMLElement).getByRole("heading", {
      level: 2,
      name: "2026 People",
    }),
  ).toBeDefined();
  expect(
    within(toolbar as HTMLElement).getByLabelText("Data Book season"),
  ).toBe(screen.getByLabelText("Data Book season"));
  expect(within(toolbar as HTMLElement).getByText("2 teams")).toBeDefined();
  expect(
    within(toolbar as HTMLElement).getByText("3 team-weeks"),
  ).toBeDefined();
  expect(
    within(toolbar as HTMLElement).getByRole("button", { name: "Save" }),
  ).toBeDefined();
  expect(
    within(toolbar as HTMLElement).getByRole("button", {
      name: "Publish 2026",
    }),
  ).toBeDefined();

  const details = screen
    .getByText("Curation details")
    .closest("details") as HTMLDetailsElement | null;
  expect(details?.open).toBe(false);
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

test("curation indicators show unsaved, saved-unpushed, and pushed state", () => {
  render(
    <DataBookView
      data={{
        ...data,
        curation: curationState({
          activeCheckpoint: {
            createdAt: "2026-06-23T00:00:00.000Z",
            id: "checkpoint-2026",
            label: "Saved review",
            latestEditId: "edit-1",
            markerEditId: "marker-1",
            note: null,
            seasons: [2026, 2025],
          },
          checkpoints: [
            {
              createdAt: "2026-06-23T00:00:00.000Z",
              id: "checkpoint-2026",
              label: "Saved review",
              latestEditId: "edit-1",
              markerEditId: "marker-1",
              note: null,
              seasons: [2026, 2025],
            },
          ],
          hasSavedUnpushed: true,
          hasUnsavedDraft: true,
          pushedSeasons: 1,
          seasons: [
            {
              activeCheckpointId: "checkpoint-2026",
              activeCheckpointLabel: "Saved review",
              autoSuggestFinalize: false,
              finalizedAt: "2026-06-23T00:00:00.000Z",
              finalizedByUserId: "user-1",
              hasSavedUnpushed: true,
              hasUnsavedDraft: true,
              isPushed: false,
              latestPushAt: null,
              latestPushCheckpointId: null,
              latestPushId: null,
              mode: "finalized",
              providerComplete: true,
              reason: null,
              season: 2026,
            },
            {
              activeCheckpointId: "checkpoint-2026",
              activeCheckpointLabel: "Saved review",
              autoSuggestFinalize: false,
              finalizedAt: "2026-06-23T00:00:00.000Z",
              finalizedByUserId: "user-1",
              hasSavedUnpushed: false,
              hasUnsavedDraft: true,
              isPushed: true,
              latestPushAt: "2026-06-23T00:05:00.000Z",
              latestPushCheckpointId: "checkpoint-2026",
              latestPushId: "push-2025",
              mode: "finalized",
              providerComplete: true,
              reason: null,
              season: 2025,
            },
          ],
        }),
      }}
    />,
  );

  openCurationDetails();
  expect(screen.getByText("Unsaved draft")).toBeDefined();
  expect(screen.getByText("Saved not pushed")).toBeDefined();
  expect(screen.getByText("Overall draft unsaved")).toBeDefined();
  expect(screen.getByText("Overall saved unpushed")).toBeDefined();

  fireEvent.change(screen.getByLabelText("Data Book season"), {
    target: { value: "2025" },
  });
  expect(screen.getByText("Pushed canonical")).toBeDefined();
});

test("save creates a checkpoint through the curation checkpoint API", async () => {
  const fetchMock = mockEditResponse({
    checkpoint: {
      createdAt: "2026-06-23T00:00:00.000Z",
      id: "checkpoint-save",
      label: "Data Book save 2026",
      latestEditId: "edit-1",
      markerEditId: "marker-1",
      note: "Saved 2026 draft from Data Book",
      seasons: [2026, 2025],
    },
  });
  render(<DataBookView canEditData={true} data={data} />);

  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  openCurationDetails();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/curation/checkpoints",
    expect.objectContaining({ method: "POST" }),
  );
  expect(requestBody(fetchMock)).toMatchObject({
    label: "Data Book save 2026",
    note: "Saved 2026 draft from Data Book",
  });
  await waitFor(() => {
    expect(
      screen.getByText(
        "Checkpoint saved. Draft changes remain out of the canonical Record Book until pushed.",
      ),
    ).toBeDefined();
  });
  expect(screen.getByText("Saved not pushed")).toBeDefined();
});

test("restore calls the selected checkpoint restore API and refreshes the route", async () => {
  const checkpoint = {
    createdAt: "2026-06-23T00:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000003",
    label: "Before bad edit",
    latestEditId: "edit-1",
    markerEditId: "marker-1",
    note: null,
    seasons: [2026, 2025],
  };
  const fetchMock = mockEditResponse({ checkpoint });
  render(
    <DataBookView
      canEditData={true}
      data={{
        ...data,
        curation: curationState({
          activeCheckpoint: checkpoint,
          checkpoints: [checkpoint],
        }),
      }}
    />,
  );

  openCurationDetails();
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/curation/checkpoints/00000000-0000-4000-8000-000000000003/restore",
    expect.objectContaining({ method: "POST" }),
  );
  expect(requestBody(fetchMock)).toMatchObject({
    reason: "Restored checkpoint from Data Book",
  });
  await waitFor(() => expect(router.refresh).toHaveBeenCalled());
});

test("push season and push all call the push API with the correct arguments", async () => {
  const checkpoint = {
    createdAt: "2026-06-23T00:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000003",
    label: "Ready",
    latestEditId: "edit-1",
    markerEditId: "marker-1",
    note: null,
    seasons: [2026, 2025],
  };
  const fetchMock = vi.spyOn(globalThis, "fetch");
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          push: {
            checkpointId: checkpoint.id,
            createdAt: "2026-06-23T00:01:00.000Z",
            id: "push-2026",
            season: 2026,
          },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          pushes: [
            {
              checkpointId: checkpoint.id,
              createdAt: "2026-06-23T00:02:00.000Z",
              id: "push-2026-b",
              season: 2026,
            },
            {
              checkpointId: checkpoint.id,
              createdAt: "2026-06-23T00:02:00.000Z",
              id: "push-2025-b",
              season: 2025,
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
  const finalizedCuration = curationState({
    activeCheckpoint: checkpoint,
    checkpoints: [checkpoint],
    hasSavedUnpushed: true,
    seasons: [
      {
        activeCheckpointId: checkpoint.id,
        activeCheckpointLabel: "Ready",
        autoSuggestFinalize: false,
        finalizedAt: "2026-06-23T00:00:00.000Z",
        finalizedByUserId: "user-1",
        hasSavedUnpushed: true,
        hasUnsavedDraft: false,
        isPushed: false,
        latestPushAt: null,
        latestPushCheckpointId: null,
        latestPushId: null,
        mode: "finalized",
        providerComplete: true,
        reason: null,
        season: 2026,
      },
      {
        activeCheckpointId: checkpoint.id,
        activeCheckpointLabel: "Ready",
        autoSuggestFinalize: false,
        finalizedAt: "2026-06-23T00:00:00.000Z",
        finalizedByUserId: "user-1",
        hasSavedUnpushed: true,
        hasUnsavedDraft: false,
        isPushed: false,
        latestPushAt: null,
        latestPushCheckpointId: null,
        latestPushId: null,
        mode: "finalized",
        providerComplete: true,
        reason: null,
        season: 2025,
      },
    ],
  });
  render(
    <DataBookView
      canEditData={true}
      data={{ ...data, curation: finalizedCuration }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Publish 2026" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm push" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

  openCurationDetails();
  fireEvent.click(screen.getByRole("button", { name: "Push all" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm push all" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    "/api/leagues/00000000-0000-4000-8000-000000000001/curation/push",
  );
  expect(requestBodies(fetchMock)[0]).toMatchObject({
    action: "push",
    checkpointId: checkpoint.id,
    season: 2026,
  });
  expect(requestBodies(fetchMock)[1]).toMatchObject({
    action: "pushAll",
    checkpointId: checkpoint.id,
  });
});

test("finalized toggle changes a season from live to curate-and-push with provider-complete suggestion", async () => {
  const fetchMock = mockEditResponse({
    state: {
      finalizedAt: "2026-06-23T00:00:00.000Z",
      finalizedByUserId: "user-1",
      mode: "finalized",
      reason: "Marked finalized from Data Book",
      season: 2026,
    },
  });
  render(
    <DataBookView
      canEditData={true}
      data={{
        ...data,
        curation: curationState({
          seasons: [
            {
              activeCheckpointId: null,
              activeCheckpointLabel: null,
              autoSuggestFinalize: true,
              finalizedAt: null,
              finalizedByUserId: null,
              hasSavedUnpushed: false,
              hasUnsavedDraft: false,
              isPushed: false,
              latestPushAt: null,
              latestPushCheckpointId: null,
              latestPushId: null,
              mode: "live",
              providerComplete: true,
              reason: null,
              season: 2026,
            },
            ...curationState().seasons.filter((entry) => entry.season !== 2026),
          ],
        }),
        league: { ...data.league, status: "complete" },
      }}
    />,
  );

  openCurationDetails();
  expect(screen.getByText("Provider reports season complete")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Mark finalized" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/curation/seasons/2026/mode",
    expect.objectContaining({ method: "POST" }),
  );
  expect(requestBody(fetchMock)).toMatchObject({
    mode: "finalized",
    reason: "Marked finalized from Data Book",
  });
  await waitFor(() => {
    expect(screen.getByText("Curate + push")).toBeDefined();
  });
});

test("non-stewards see the Data Book as read-only", () => {
  render(<DataBookView canEditData={false} data={data} />);

  expect(
    screen.queryByRole("button", { name: /Edit real name for/i }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Edit team name for/i }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Push 2026" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Publish 2026" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Mark finalized" })).toBeNull();
});
