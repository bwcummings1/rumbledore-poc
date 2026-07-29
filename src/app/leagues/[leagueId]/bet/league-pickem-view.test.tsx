import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { LeaguePickemData } from "@/betting/league-pickem";
import { LeaguePickemView } from "./league-pickem-view";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigation.refresh }),
}));

const leagueId = "00000000-0000-4000-8000-000000000001";

const data: LeaguePickemData = {
  league: {
    accuracy: 0.625,
    correctPicks: 25,
    isEligibleForWeeklyPrize: true,
    participationRate: 0.95,
    scorablePicks: 40,
  },
  slate: [
    {
      awayPrice: -110,
      awayTeam: "New York",
      eventId: "event-1",
      homePrice: -110,
      homeTeam: "Chicago",
      line: -3.5,
      locked: false,
      marketId: "market-1",
      marketType: "spread",
      oddsSnapshotId: "snapshot-1",
      overPrice: null,
      startTime: "2026-09-13T17:00:00.000Z",
      underPrice: null,
    },
    {
      awayPrice: -105,
      awayTeam: "Dallas",
      eventId: "event-2",
      homePrice: -115,
      homeTeam: "Green Bay",
      line: null,
      locked: true,
      marketId: "market-2",
      marketType: "moneyline",
      oddsSnapshotId: "snapshot-2",
      overPrice: null,
      startTime: "2026-09-13T13:00:00.000Z",
      underPrice: null,
    },
  ],
  status: "ready",
  week: {
    closesAt: "2026-09-20T12:00:00.000Z",
    maxPicksPerUser: 10,
    opensAt: "2026-09-08T12:00:00.000Z",
    pickWeekId: "00000000-0000-4000-8000-0000000000aa",
    rosterSize: 4,
    season: 2026,
    week: 1,
  },
  you: {
    picks: [],
    remainingPicks: 10,
    submittedPicks: 0,
  },
};

function withYou(overrides: Partial<LeaguePickemData["you"]>) {
  return { ...data, you: { ...data.you, ...overrides } };
}

function bodyOf(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("renders the week, the allowance, and the league's absolute-denominator score", () => {
  render(<LeaguePickemView data={data} leagueId={leagueId} />);

  expect(screen.getByText(/Week 1/)).toBeDefined();
  expect(screen.getByText("0 / 10")).toBeDefined();
  expect(screen.getByText("62.5%")).toBeDefined();
  // The denominator is what makes this scoring absolute: 25 correct out of 40
  // possible, not 25 out of however many were submitted.
  expect(screen.getByText("25 of 40 scorable")).toBeDefined();
});

test("reuses the staged idempotency key when a failed pick is retried (UIX-001)", async () => {
  // This is the regression guard for the whole file. The bankroll view minted
  // a key inline in the fetch body, so a retry after a failure looked like a
  // brand-new pick to the server and landed twice. A second landed pick would
  // corrupt the league accuracy the inter-league arena ranks on.
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: { message: "Server exploded" } }), {
      status: 500,
    }),
  );

  render(<LeaguePickemView data={data} leagueId={leagueId} />);
  fireEvent.click(screen.getByRole("button", { name: /Chicago -3\.5/ }));
  fireEvent.click(screen.getByRole("button", { name: /Submit 1 pick/ }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const firstKey = bodyOf(fetchMock.mock.calls[0]).idempotencyKey;
  expect(firstKey).toEqual(expect.any(String));

  // The failure left the pick staged. Retry it.
  await screen.findByText("Server exploded");
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ deduplicated: true }), { status: 200 }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Submit 1 pick/ }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(bodyOf(fetchMock.mock.calls[1]).idempotencyKey).toBe(firstKey);
});

test("posts the snapshot, week, and selection the user actually chose", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ pickId: "p1" }), { status: 201 }),
  );

  render(<LeaguePickemView data={data} leagueId={leagueId} />);
  fireEvent.click(screen.getByRole("button", { name: /Chicago -3\.5/ }));
  fireEvent.click(screen.getByRole("button", { name: /Submit 1 pick/ }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock.mock.calls[0][0]).toBe(`/api/leagues/${leagueId}/picks`);
  expect(bodyOf(fetchMock.mock.calls[0])).toMatchObject({
    oddsSnapshotId: "snapshot-1",
    pickWeekId: "00000000-0000-4000-8000-0000000000aa",
    selection: "home",
  });
});

test("keeps one key per market when the user switches sides before submitting", async () => {
  // Switching sides is still one pick on one market. Minting a second key
  // would let both sides land if the first attempt were already in flight.
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ pickId: "p1" }), { status: 201 }),
  );

  render(<LeaguePickemView data={data} leagueId={leagueId} />);
  fireEvent.click(screen.getByRole("button", { name: /Chicago -3\.5/ }));
  fireEvent.click(screen.getByRole("button", { name: /New York \+3\.5/ }));

  expect(screen.getByText(/Staged picks \(1\)/)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /Submit 1 pick/ }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(bodyOf(fetchMock.mock.calls[0])).toMatchObject({ selection: "away" });
});

test("refuses to stage a market whose game has already started", () => {
  // The server rejects these too; blocking the button keeps the client from
  // teaching the user that a doomed pick was accepted.
  render(<LeaguePickemView data={data} leagueId={leagueId} />);

  expect(screen.getByRole("button", { name: /Green Bay/ })).toHaveProperty(
    "disabled",
    true,
  );
  expect(screen.getByRole("button", { name: /Dallas/ })).toHaveProperty(
    "disabled",
    true,
  );
  expect(screen.getByRole("button", { name: /Chicago -3\.5/ })).toHaveProperty(
    "disabled",
    false,
  );
});

test("stops offering picks once the weekly allowance is spent", () => {
  render(
    <LeaguePickemView
      data={withYou({ remainingPicks: 0, submittedPicks: 10 })}
      leagueId={leagueId}
    />,
  );

  expect(screen.getByText("10 / 10")).toBeDefined();
  expect(screen.getByRole("button", { name: /Chicago -3\.5/ })).toHaveProperty(
    "disabled",
    true,
  );
});

test("shows an empty state instead of a slate when no week is open", () => {
  render(
    <LeaguePickemView
      data={{ ...data, status: "no_open_week", week: null }}
      leagueId={leagueId}
    />,
  );

  expect(screen.getByText("No pick week is open")).toBeDefined();
  expect(screen.queryByRole("button", { name: /Chicago/ })).toBeNull();
});
