import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { LeagueBetData } from "@/betting";
import { LeagueBetView } from "./league-bet-view";

const data: LeagueBetData = {
  balance: {
    balanceCents: 1_125_000,
    floorCents: 1_000_000,
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
});

test("league bet view renders bankroll, open markets, and recent slips", () => {
  render(<LeagueBetView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "NHS Alumni Annual betting desk",
    }),
  ).toBeDefined();
  expect(screen.getByText("$11,250")).toBeDefined();
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

  fireEvent.click(newYorkMoneyline);
  expect(chicagoMoneyline.getAttribute("aria-pressed")).toBe("false");
  expect(newYorkMoneyline.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Single · 1")).toBeDefined();

  fireEvent.click(chicagoSpread);
  expect(screen.getByText("Parlay · 2")).toBeDefined();

  fireEvent.click(
    screen.getByRole("button", { name: "Clear selected prices" }),
  );
  expect(screen.getByText("Empty · 0")).toBeDefined();
  expect(screen.getByText("No prices selected.")).toBeDefined();
});

test("league bet view renders empty bankroll and market states", () => {
  render(<LeagueBetView data={{ ...data, balance: null, markets: [] }} />);

  expect(screen.getByText("No open week")).toBeDefined();
  expect(screen.getByText("No open markets")).toBeDefined();
});
