import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
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

afterEach(() => {
  vi.restoreAllMocks();
});

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
