import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { EditLedgerPageData } from "./edit-ledger-data";
import { EditLedgerView } from "./edit-ledger-view";

const data: EditLedgerPageData = {
  entries: [
    {
      actorDisplayName: "Casey Steward",
      actorUserId: "00000000-0000-4000-8000-000000000010",
      afterValue: "Correct Name",
      beforeValue: "Corect Name",
      createdAt: "2026-06-22T11:00:00.000Z",
      editClass: "cosmetic",
      field: "canonical_name",
      id: "00000000-0000-4000-8000-000000000101",
      reason: "spelling",
      scope: "all_years",
      source: "league_data_edit",
      targetId: "00000000-0000-4000-8000-000000000201",
      targetKind: "person",
    },
  ],
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  pagination: {
    hasMore: false,
    limit: 25,
    offset: 0,
    page: 1,
    pageCount: 1,
    total: 1,
  },
};

afterEach(() => {
  cleanup();
});

test("Edit Ledger view uses the masthead destination tabs and renders activity", () => {
  render(<EditLedgerView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "NHS Alumni Annual League Data",
    }),
  ).toBeDefined();
  expect(screen.getByText("LEAGUE DATA")).toBeDefined();

  const nav = screen.getByRole("navigation", {
    name: "League Data sections navigation",
  });
  expect(
    within(nav)
      .getAllByRole("tab")
      .map((tab) => tab.textContent),
  ).toEqual(["Data Book", "Edit Ledger"]);
  expect(
    within(nav)
      .getByRole("tab", { name: "Edit Ledger" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(
    within(nav).getByRole("tab", { name: "Data Book" }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/data");
  expect(screen.getByText("Edited person canonical_name")).toBeDefined();
  expect(screen.getByText("Page 1 of 1 / 1 entries")).toBeDefined();
});
