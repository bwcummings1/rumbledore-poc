import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { EditLedgerFeed } from "./edit-ledger-feed";
import type { EditLedgerEntry } from "./edit-ledger-types";

const actorId = "00000000-0000-4000-8000-000000000010";

const entries: readonly EditLedgerEntry[] = [
  {
    actorDisplayName: "Casey Steward",
    actorUserId: actorId,
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
  {
    actorDisplayName: "Casey Steward",
    actorUserId: actorId,
    afterValue: {
      checkpointId: "00000000-0000-4000-8000-000000000301",
      label: "2012 ready",
      seasons: [2011, 2012],
      snapshotHash: "savehash000000",
    },
    beforeValue: { previousCheckpointId: null },
    createdAt: "2026-06-22T12:00:00.000Z",
    editClass: "substantive",
    field: "checkpoint_save",
    id: "00000000-0000-4000-8000-000000000102",
    reason: "saved curated data checkpoint",
    scope: null,
    source: "league_data_edit",
    targetId: "00000000-0000-4000-8000-000000000301",
    targetKind: "curation_checkpoint",
  },
  {
    actorDisplayName: "Casey Steward",
    actorUserId: actorId,
    afterValue: {
      checkpointId: "00000000-0000-4000-8000-000000000301",
      pushId: "00000000-0000-4000-8000-000000000401",
      season: 2012,
      snapshotHash: "pushhash000000",
    },
    beforeValue: null,
    createdAt: "2026-06-22T13:00:00.000Z",
    editClass: "substantive",
    field: "season_push",
    id: "00000000-0000-4000-8000-000000000103",
    reason: "2012 verified",
    scope: null,
    source: "league_data_edit",
    targetId: "00000000-0000-4000-8000-000000000401",
    targetKind: "curation_push",
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("renders edit, save, and push entries newest first", () => {
  render(<EditLedgerFeed entries={entries} />);

  const buttons = screen.getAllByRole("button", { name: /^Expand / });
  expect(buttons).toHaveLength(3);
  expect(buttons[0]?.textContent).toContain("Pushed 2012 season snapshot");
  expect(buttons[1]?.textContent).toContain(
    'Saved checkpoint "2012 ready" for 2011, 2012',
  );
  expect(buttons[2]?.textContent).toContain("Edited person canonical_name");
});

test("expanding an edit shows red and green before-after cues plus metadata", () => {
  render(<EditLedgerFeed entries={entries} />);

  fireEvent.click(
    screen.getByRole("button", {
      name: /Expand Edited person canonical_name/,
    }),
  );

  const region = screen.getByRole("region", {
    name: /Edited person canonical_name/,
  });
  expect(within(region).getByText("[-] Before")).toBeDefined();
  expect(within(region).getByText("[+] After")).toBeDefined();
  expect(within(region).getByText("Corect Name").className).toContain(
    "text-coral",
  );
  expect(within(region).getByText("Correct Name").className).toContain(
    "text-jade",
  );
  expect(within(region).getByText("canonical_name")).toBeDefined();
  expect(within(region).getByText("all years")).toBeDefined();
  expect(within(region).getByText(/Casey Steward/)).toBeDefined();
  expect(
    region.querySelector('time[datetime="2026-06-22T11:00:00.000Z"]'),
  ).toBeDefined();
});

test("empty ledger activity degrades gracefully", () => {
  render(<EditLedgerFeed entries={[]} />);

  expect(screen.getByText("No curation activity yet")).toBeDefined();
  expect(
    screen.getByText("This league has no recorded curation activity yet."),
  ).toBeDefined();
  expect(
    screen.getByText("No curation activity yet").closest(".cell"),
  ).toBeDefined();
});

test("expandable rows expose button state and labelled regions", () => {
  render(<EditLedgerFeed entries={entries.slice(0, 1)} />);

  const button = screen.getByRole("button", {
    name: /Expand Edited person canonical_name/,
  });
  expect(button.getAttribute("aria-expanded")).toBe("false");
  const controls = button.getAttribute("aria-controls");
  expect(controls).toBeTruthy();

  fireEvent.click(button);

  expect(button.getAttribute("aria-expanded")).toBe("true");
  const region = screen.getByRole("region", {
    name: /Edited person canonical_name/,
  });
  expect(region.getAttribute("id")).toBe(controls);
});

test("paginated ledger fetches pages from the server and marks the current page", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        entries: [entries[0]],
        pagination: {
          hasMore: false,
          limit: 2,
          offset: 2,
          page: 2,
          pageCount: 2,
          total: 3,
        },
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    ),
  );
  render(
    <EditLedgerFeed
      entries={entries.slice(1)}
      initialPagination={{
        hasMore: true,
        limit: 2,
        offset: 0,
        page: 1,
        pageCount: 2,
        total: 3,
      }}
      leagueId="00000000-0000-4000-8000-000000000001"
    />,
  );

  expect(screen.getByText("Page 1 of 2 / 3 entries")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Page 2" }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leagues/00000000-0000-4000-8000-000000000001/curation/ledger?limit=2&offset=2",
      expect.objectContaining({ method: "GET" }),
    ),
  );
  await waitFor(() => {
    expect(screen.getByText("Page 2 of 2 / 3 entries")).toBeDefined();
  });
  expect(
    screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current"),
  ).toBe("page");
});
