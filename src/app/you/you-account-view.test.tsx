import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { YouAccountData } from "./you-account-view";
import { YouAccountView } from "./you-account-view";

const data: YouAccountData = {
  connections: [
    {
      connectionFlow: "oauth",
      invalidAt: null,
      lastValidatedAt: "2026-06-14T00:00:00.000Z",
      provider: "yahoo",
      providerLabel: "Yahoo",
      status: "connected",
      subjectProviderId: "subject-1",
    },
  ],
  leagues: [
    {
      lastOpenedAt: "2026-06-14T00:00:00.000Z",
      leagueId: "00000000-0000-4000-8000-000000000001",
      logo: null,
      name: "NHS Alumni Annual",
      provider: "espn",
      providerLabel: "ESPN",
      role: "commissioner",
    },
  ],
  user: {
    displayName: "Fixture User",
    email: "fixture@example.test",
    emailVerified: true,
  },
};

afterEach(() => {
  cleanup();
});

test("you account view renders identity, providers, and installed leagues", () => {
  render(<YouAccountView data={data} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Fixture User" }),
  ).toBeDefined();
  expect(screen.getByText("fixture@example.test · verified")).toBeDefined();
  expect(screen.getAllByText("Yahoo").length).toBeGreaterThan(1);
  expect(screen.getByText("OAuth · validated Jun 14, 2026")).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "Open NHS Alumni Annual" })
      .getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001");
});
