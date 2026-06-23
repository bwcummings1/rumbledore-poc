import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { DataCurationSummary } from "./curation-data";
import { DataStewardReviewView } from "./data-steward-review-view";

const league = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "NHS Alumni Annual",
};

const initialSummary = {
  integrityChecks: [
    {
      checkKey: "identity_sanity" as const,
      createdAt: "2026-06-15T12:00:00.000Z",
      detail: { problem: "same-season team slots merged" },
      id: "00000000-0000-4000-8000-000000000101",
      reviewedAt: null,
      reviewedByUserId: null,
      season: 2026,
      status: "fail" as const,
    },
  ],
  suggestedIdentityLinks: [
    {
      confidence: 0.72,
      mappingId: "00000000-0000-4000-8000-000000000201",
      personId: "00000000-0000-4000-8000-000000000202",
      providerTeamId: "2",
      season: 2026,
      teamSeasonId: "00000000-0000-4000-8000-000000000203",
    },
  ],
};

const curationSummary: DataCurationSummary = {
  access: {
    canConfirmGroupings: true,
    canEditData: true,
    canHandoffCommissioner: true,
    role: "commissioner",
  },
  commissionerCandidates: [
    {
      displayName: "Fixture Steward",
      email: "steward@example.com",
      memberId: "00000000-0000-4000-8000-000000000301",
      role: "data_steward",
      userId: "00000000-0000-4000-8000-000000000302",
    },
  ],
  groupings: [
    {
      config: { format_type: "traditional" },
      confirmedByUserId: null,
      derivedFrom: { boundaryReasons: ["member_count_change"] },
      id: "00000000-0000-4000-8000-000000000401",
      kind: "era",
      name: "Era 2",
      ordinal: 2,
      rationale: "Settings changed at the 2013 boundary.",
      seasons: [2013, 2014],
      status: "proposed",
    },
  ],
  ledger: [
    {
      actorUserId: "00000000-0000-4000-8000-000000000002",
      afterValue: "Fixture Manager",
      beforeValue: "Fixture Manger",
      createdAt: "2026-06-18T12:00:00.000Z",
      editClass: "cosmetic",
      field: "canonical_name",
      id: "00000000-0000-4000-8000-000000000501",
      reason: "spelling",
      scope: null,
      source: "league_data_edit",
      targetId: "00000000-0000-4000-8000-000000000601",
      targetKind: "person",
    },
  ],
  matchupSpans: [
    {
      awayScore: 120.4,
      awayTeamName: "Road Team",
      homeScore: 144.2,
      homeTeamName: "Home Team",
      id: "00000000-0000-4000-8000-000000000701",
      matchupPeriodCount: 2,
      periodStart: 15,
      scoringPeriod: 16,
      scoringPeriodSpan: 1,
      season: 2026,
      status: "final",
    },
  ],
  persons: [
    {
      canonicalName: "Fixture Manger",
      id: "00000000-0000-4000-8000-000000000601",
      ownerHistoryCount: 1,
      seasons: [2024, 2025, 2026],
    },
  ],
  teamSeasons: [
    {
      id: "00000000-0000-4000-8000-000000000801",
      ownerNames: ["Fixture Manger"],
      personId: "00000000-0000-4000-8000-000000000601",
      personName: "Fixture Manger",
      providerTeamId: "2",
      season: 2026,
      teamName: "Fixture Team",
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(String(body));
  } catch {
    return null;
  }
}

test("data steward review view posts review actions and updates local state", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );

  render(
    <DataStewardReviewView initialSummary={initialSummary} league={league} />,
  );

  expect(
    screen.getByRole("heading", { name: "NHS Alumni Annual" }),
  ).toBeDefined();
  expect(screen.getByText("Team 2 · 2026")).toBeDefined();
  expect(screen.getByText("Identity sanity")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Confirm link" }));
  expect(screen.getByRole("dialog")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));

  await waitFor(() => {
    expect(
      screen.getByText(
        "No fuzzy identity links are waiting for steward confirmation.",
      ),
    ).toBeDefined();
  });
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/steward/integrity",
    expect.objectContaining({
      body: JSON.stringify({
        action: "reassign_team_season",
        reason: "Confirmed suggested identity link from steward review",
        targetPersonId: "00000000-0000-4000-8000-000000000202",
        teamSeasonId: "00000000-0000-4000-8000-000000000203",
      }),
      method: "POST",
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
  expect(screen.getByRole("dialog")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));

  await waitFor(() => {
    expect(screen.getByText("reviewed")).toBeDefined();
  });
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/steward/integrity",
    expect.objectContaining({
      body: JSON.stringify({
        action: "mark_reviewed",
        checkId: "00000000-0000-4000-8000-000000000101",
        reason: "Accepted from steward review",
      }),
      method: "POST",
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "Rerun checks" }));
  expect(screen.getByRole("dialog")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));

  await waitFor(() => {
    expect(screen.getByText("Integrity checks were rerun.")).toBeDefined();
  });
});

test("ordinary members can inspect the public ledger without edit controls", () => {
  render(
    <DataStewardReviewView
      curation={{
        ...curationSummary,
        access: {
          canConfirmGroupings: false,
          canEditData: false,
          canHandoffCommissioner: false,
          role: "member",
        },
        commissionerCandidates: [],
      }}
      initialSummary={{ integrityChecks: [], suggestedIdentityLinks: [] }}
      league={league}
    />,
  );

  expect(
    screen.getByRole("button", { name: "Open public ledger" }),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: "Save name" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Rerun checks" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Open public ledger" }));

  expect(screen.getByRole("dialog")).toBeDefined();
  expect(screen.getAllByText(/canonical_name/)[0]).toBeDefined();
});

test("commissioners can submit curation edits, era confirms, and handoff actions", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/curation/ledger")) {
        return new Response(
          JSON.stringify({ entries: curationSummary.ledger }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }
      if (url.includes("/curation/groupings")) {
        return new Response(
          JSON.stringify({
            grouping: {
              ...curationSummary.groupings[0],
              name: "Owner era",
              seasons: [2013, 2015],
              status: "confirmed",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          requestBody: parseRequestBody(init?.body),
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    });

  render(
    <DataStewardReviewView
      curation={curationSummary}
      initialSummary={initialSummary}
      league={league}
    />,
  );

  fireEvent.change(screen.getAllByDisplayValue("Fixture Manger")[0], {
    target: { value: "Fixture Manager" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leagues/00000000-0000-4000-8000-000000000001/curation/edits",
      expect.objectContaining({
        body: JSON.stringify({
          editClass: "cosmetic",
          field: "canonical_name",
          reason: "Corrected person display name",
          targetId: "00000000-0000-4000-8000-000000000601",
          targetKind: "person",
          value: "Fixture Manager",
        }),
        method: "POST",
      }),
    );
  });

  fireEvent.change(screen.getByDisplayValue("Era 2"), {
    target: { value: "Owner era" },
  });
  fireEvent.change(screen.getByDisplayValue("2013, 2014"), {
    target: { value: "2013, 2015" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm grouping" }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leagues/00000000-0000-4000-8000-000000000001/curation/groupings",
      expect.objectContaining({
        body: JSON.stringify({
          action: "confirm",
          groupingId: "00000000-0000-4000-8000-000000000401",
          name: "Owner era",
          reason: "Confirmed season grouping",
          seasons: [2013, 2015],
        }),
        method: "POST",
      }),
    );
  });

  fireEvent.click(screen.getByRole("button", { name: "Hand off" }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leagues/00000000-0000-4000-8000-000000000001/commissioner/handoff",
      expect.objectContaining({
        body: JSON.stringify({
          reason: "Commissioner handoff",
          targetMemberId: "00000000-0000-4000-8000-000000000301",
        }),
        method: "POST",
      }),
    );
  });
});
