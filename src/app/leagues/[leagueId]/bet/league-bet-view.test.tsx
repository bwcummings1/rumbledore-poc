import { cleanup, render, screen } from "@testing-library/react";
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
      selections: [
        { label: "Chicago", price: -125 },
        { label: "New York", price: 110 },
      ],
      snapshotId: "snapshot-1",
      startTime: "2026-09-08T00:20:00.000Z",
      subject: "game",
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
    screen.getByRole("heading", { name: "New York at Chicago" }),
  ).toBeDefined();
  expect(screen.getByText("-125")).toBeDefined();
  expect(screen.getByText("+110")).toBeDefined();
  expect(screen.getByText(/single · pending/i)).toBeDefined();
  expect(
    screen.getByRole("link", { name: /arena/i }).getAttribute("href"),
  ).toBe("/arena");
});

test("league bet view renders empty bankroll and market states", () => {
  render(<LeagueBetView data={{ ...data, balance: null, markets: [] }} />);

  expect(screen.getByText("No open week")).toBeDefined();
  expect(screen.getByText("No open markets")).toBeDefined();
});
