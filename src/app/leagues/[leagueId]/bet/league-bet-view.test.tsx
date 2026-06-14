import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { LeagueBetData } from "@/betting";
import { LeagueBetView } from "./league-bet-view";

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: navigation.refresh,
  }),
}));

const data: LeagueBetData = {
  balance: {
    balanceCents: 1_125_000,
    closingBalanceCents: null,
    floorCents: 1_000_000,
    openExposureCents: 50_000,
    openPotentialReturnCents: 125_000,
    openingBalanceCents: 1_250_000,
    openingKind: "carryover",
    pendingSlipCount: 1,
    previousWeekClosingBalanceCents: 1_250_000,
    resetCreditCents: 0,
    weekOpenEntryCents: 1_250_000,
    weekEnd: "2026-09-14T00:00:00.000Z",
    weekStart: "2026-09-07T00:00:00.000Z",
  },
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLabel: "ESPN",
    season: 2026,
  },
  markets: [
    {
      awayTeam: "New York",
      capturedAt: "2026-09-07T15:00:00.000Z",
      eventId: "event-1",
      eventStatus: "scheduled",
      homeTeam: "Chicago",
      line: null,
      marketId: "market-1",
      marketStatus: "open",
      marketType: "moneyline",
      period: "full_game",
      propType: null,
      selections: [
        { label: "Chicago", line: null, price: -125, selection: "home" },
        { label: "New York", line: null, price: 110, selection: "away" },
      ],
      snapshotId: "snapshot-1",
      startTime: "2026-09-08T00:20:00.000Z",
      subject: "game",
      subjectLabel: "Game",
    },
    {
      awayTeam: "New York",
      capturedAt: "2026-09-07T15:00:00.000Z",
      eventId: "event-1",
      eventStatus: "scheduled",
      homeTeam: "Chicago",
      line: -3.5,
      marketId: "market-2",
      marketStatus: "open",
      marketType: "spread",
      period: "full_game",
      propType: null,
      selections: [
        { label: "Chicago", line: -3.5, price: -110, selection: "home" },
        { label: "New York", line: 3.5, price: -110, selection: "away" },
      ],
      snapshotId: "snapshot-2",
      startTime: "2026-09-08T00:20:00.000Z",
      subject: "game",
      subjectLabel: "Game",
    },
    {
      awayTeam: "New York",
      capturedAt: "2026-09-07T15:00:00.000Z",
      eventId: "event-1",
      eventStatus: "scheduled",
      homeTeam: "Chicago",
      line: 242.5,
      marketId: "market-3",
      marketStatus: "open",
      marketType: "player_prop",
      period: "full_game",
      propType: "passing_yards",
      selections: [
        { label: "Over", line: 242.5, price: -115, selection: "player_over" },
        {
          label: "Under",
          line: 242.5,
          price: -105,
          selection: "player_under",
        },
      ],
      snapshotId: "snapshot-3",
      startTime: "2026-09-08T00:20:00.000Z",
      subject: "fixture-qb",
      subjectLabel: "Fixture QB",
    },
  ],
  recentSlips: [
    {
      id: "slip-1",
      kind: "single",
      placedAt: "2026-09-07T16:00:00.000Z",
      potentialPayoutCents: 12_500,
      stakeCents: 5_000,
      status: "pending",
    },
  ],
};

afterEach(() => {
  cleanup();
  navigation.refresh.mockReset();
  vi.unstubAllGlobals();
});

test("league bet view renders bankroll, open markets, and recent slips", () => {
  render(<LeagueBetView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "NHS Alumni Annual betting desk",
    }),
  ).toBeDefined();
  expect(screen.getAllByText("$11,250").length).toBeGreaterThan(0);
  expect(screen.getByText("Already at risk")).toBeDefined();
  expect(screen.getByText("$500")).toBeDefined();
  expect(screen.getByText("Open upside")).toBeDefined();
  expect(screen.getByText("$1,250")).toBeDefined();
  expect(screen.getByText("Best-case balance")).toBeDefined();
  expect(screen.getByText("$12,500")).toBeDefined();
  expect(
    screen.getByText(
      "This week carried $12,500 forward from last week's close.",
    ),
  ).toBeDefined();
  expect(
    screen.getByText(
      /Finish above the floor and that balance carries forward/i,
    ),
  ).toBeDefined();
  expect(
    screen.getAllByRole("heading", { name: "New York at Chicago" }),
  ).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Moneyline" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Spread" })).toBeDefined();
  expect(screen.getByText(/More markets · 1 player prop/i)).toBeDefined();
  expect(
    screen.getByRole("button", { name: /Chicago -125 locked price/i }),
  ).toBeDefined();
  expect(
    screen.getByRole("button", { name: /New York \+110 locked price/i }),
  ).toBeDefined();
  expect(screen.getByText(/single · pending/i)).toBeDefined();
  expect(
    screen.getByRole("link", { name: /arena/i }).getAttribute("href"),
  ).toBe("/arena");
});

test("league bet view stages selected prices and replaces selections on the same market", () => {
  render(<LeagueBetView data={data} />);

  const chicagoMoneyline = screen.getByRole("button", {
    name: /Chicago -125 locked price/i,
  });
  const newYorkMoneyline = screen.getByRole("button", {
    name: /New York \+110 locked price/i,
  });
  const chicagoSpread = screen.getByRole("button", {
    name: /Chicago -3.5 -110 locked price/i,
  });

  expect(chicagoMoneyline.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(chicagoMoneyline);
  expect(chicagoMoneyline.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Single · 1")).toBeDefined();
  expect(screen.getByRole("button", { name: "Remove Chicago" })).toBeDefined();

  fireEvent.click(newYorkMoneyline);
  expect(chicagoMoneyline.getAttribute("aria-pressed")).toBe("false");
  expect(newYorkMoneyline.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Single · 1")).toBeDefined();

  fireEvent.click(chicagoSpread);
  expect(screen.getByText("Parlay · 2")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Remove Chicago" }));
  expect(screen.getByText("Single · 1")).toBeDefined();

  fireEvent.click(
    screen.getByRole("button", { name: "Clear selected prices" }),
  );
  expect(screen.getByText("Empty · 0")).toBeDefined();
  expect(screen.getByText("No prices selected.")).toBeDefined();
});

test("league bet view renders empty bankroll and market states", () => {
  render(<LeagueBetView data={{ ...data, balance: null, markets: [] }} />);

  expect(screen.getAllByText("No open week").length).toBeGreaterThan(0);
  expect(screen.getByText("No open markets")).toBeDefined();
});

test("league bet view surfaces reset-to-floor audit copy", () => {
  const balance = data.balance;
  if (!balance) {
    throw new Error("test fixture must include a bankroll balance");
  }

  render(
    <LeagueBetView
      data={{
        ...data,
        balance: {
          ...balance,
          balanceCents: 1_000_000,
          openExposureCents: 0,
          openPotentialReturnCents: 0,
          openingBalanceCents: 1_000_000,
          openingKind: "reset_to_floor",
          pendingSlipCount: 0,
          previousWeekClosingBalanceCents: 0,
          resetCreditCents: 1_000_000,
          weekOpenEntryCents: 0,
        },
      }}
    />,
  );

  expect(
    screen.getByText(
      "Last week closed at $0. The ledger carried $0 and credited $10,000 back to the floor.",
    ),
  ).toBeDefined();
  expect(screen.getByText("Reset credit: $10,000")).toBeDefined();
});

test("league bet view previews and submits a single with locked snapshot data", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        balanceCents: 1_120_000,
        reused: false,
        slip: {
          id: "slip-placed",
          kind: "single",
          placedAt: "2026-09-07T16:15:00.000Z",
          potentialPayoutCents: 9_000,
          stakeCents: 5_000,
          status: "pending",
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 201,
      },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<LeagueBetView data={data} />);

  fireEvent.click(
    screen.getByRole("button", { name: /Chicago -125 locked price/i }),
  );
  fireEvent.change(screen.getByLabelText("Stake amount"), {
    target: { value: "50.00" },
  });

  expect(screen.getByText("1.80x")).toBeDefined();
  expect(screen.getByText("$90")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: /Place single/i }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(url).toBe(
    "/api/leagues/00000000-0000-4000-8000-000000000001/bet/slips",
  );
  expect(init).toMatchObject({
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = JSON.parse(String((init as RequestInit).body));
  expect(body).toMatchObject({
    kind: "single",
    legs: [{ oddsSnapshotId: "snapshot-1", selection: "home" }],
    stakeCents: 5_000,
  });
  expect(typeof body.idempotencyKey).toBe("string");

  expect(
    await screen.findByText("Slip placed. Odds are locked."),
  ).toBeDefined();
  expect(screen.getByText("Empty · 0")).toBeDefined();
  expect(screen.getAllByText("$11,200").length).toBeGreaterThan(0);
  expect(navigation.refresh).toHaveBeenCalledTimes(1);
});

test("league bet view blocks stakes above the live balance before submit", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<LeagueBetView data={data} />);

  fireEvent.click(
    screen.getByRole("button", { name: /Chicago -125 locked price/i }),
  );
  fireEvent.change(screen.getByLabelText("Stake amount"), {
    target: { value: "12000" },
  });

  expect(screen.getByText("Stake exceeds your $11,250 balance.")).toBeDefined();
  expect(
    (screen.getByRole("button", { name: /Place single/i }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Place single/i }));
  expect(fetchMock).not.toHaveBeenCalled();
});

test("league bet view surfaces stale line placement failures", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        error: {
          code: "BET_ODDS_STALE",
          message: "Selected odds are no longer the latest available price",
          status: 409,
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 409,
      },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<LeagueBetView data={data} />);

  fireEvent.click(
    screen.getByRole("button", { name: /Chicago -125 locked price/i }),
  );
  fireEvent.change(screen.getByLabelText("Stake amount"), {
    target: { value: "25" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Place single/i }));

  expect(
    await screen.findByText(
      "Line moved. Re-confirm the current price before placing.",
    ),
  ).toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Single · 1")).toBeDefined();
});
