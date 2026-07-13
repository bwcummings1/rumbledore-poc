import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { YouAccountData } from "./you-account-view";
import { YouAccountView } from "./you-account-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/components/pwa/session-cleanup", () => ({
  clearPwaSessionState: vi.fn(),
}));

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
  personalAgent: {
    briefing: {
      capped: false,
      coveredLeagueCount: 1,
      generatedAt: "2026-06-15T12:00:00.000Z",
      leagueLimit: 10,
      leagues: [
        {
          href: "/leagues/00000000-0000-4000-8000-000000000001",
          latestPressTitle: "Moon Crew Opens the Trap Door",
          leagueId: "00000000-0000-4000-8000-000000000001",
          matchup: {
            label: "Fixture Team vs Rival Team",
            opponentScore: 91.25,
            opponentTeamName: "Rival Team",
            scoringPeriod: 2,
            status: "in_progress",
            userScore: 104.5,
            userTeamName: "Fixture Team",
          },
          name: "NHS Alumni Annual",
          providerLabel: "ESPN",
        },
      ],
      totalLeagueCount: 1,
    },
    entitlement: {
      allowed: true,
      capability: "ai.individual.agent",
      caps: {
        aiPostsPerWeek: 25,
        individualLeaguesCovered: 10,
        maxPremiumLeaguesPerUser: null,
      },
      reason: "ENTITLED",
      requiredTier: "individual",
      scope: "user",
      tier: "individual",
    },
    status: "ready",
  },
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
  expect(screen.getByText("fixture@example.test")).toBeDefined();
  expect(screen.getByText("Verified")).toBeDefined();
  expect(screen.getAllByText("Yahoo").length).toBeGreaterThan(1);
  expect(screen.getByText("OAuth")).toBeDefined();
  expect(screen.getByText("Jun 14, 2026")).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "Open NHS Alumni Annual" })
      .getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001");
  expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
  expect(screen.getByText("Watching 1 of 1 leagues")).toBeDefined();
  expect(
    screen.getByText("Week 2: Fixture Team vs Rival Team (104.50-91.25)"),
  ).toBeDefined();
  expect(
    screen.getByText("Press: Moon Crew Opens the Trap Door"),
  ).toBeDefined();
  expect(screen.getByText("Notification preferences")).toBeDefined();
  expect(screen.getByText("Per-league delivery")).toBeDefined();
  expect(screen.getByText("Content")).toBeDefined();
  expect(screen.getByText("Weekly digest")).toBeDefined();
  expect(screen.getByText("Lore, bets, and Arena")).toBeDefined();
  expect(screen.getByText("Web Push")).toBeDefined();
  expect(screen.getByText("Any family")).toBeDefined();
  expect(screen.getByText("None")).toBeDefined();
});

test("you account view renders provider reconnect CTAs", () => {
  render(
    <YouAccountView
      data={{
        ...data,
        connections: [
          {
            ...data.connections[0],
            invalidAt: "2026-06-15T00:00:00.000Z",
            status: "invalid",
          },
        ],
      }}
    />,
  );

  expect(
    screen.getByText(
      "Your Yahoo authorization expired before imports could run.",
    ),
  ).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Reconnect Yahoo" }).getAttribute("href"),
  ).toBe("/onboarding/yahoo");
});

test("you account view renders the personal agent locked state", () => {
  render(
    <YouAccountView
      data={{
        ...data,
        personalAgent: {
          entitlement: {
            allowed: false,
            capability: "ai.individual.agent",
            caps: {
              aiPostsPerWeek: 25,
              individualLeaguesCovered: 10,
              maxPremiumLeaguesPerUser: null,
            },
            reason: "TIER_REQUIRED",
            requiredTier: "individual",
            scope: "user",
            tier: "none",
          },
          status: "blocked",
        },
      }}
    />,
  );

  expect(
    screen.getByRole("heading", { name: "Get your personal agent" }),
  ).toBeDefined();
  expect(screen.getByText("Individual tier required")).toBeDefined();
  expect(
    screen.getByText(/cross-league briefings about your teams/i),
  ).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "Get personal agent" })
      .getAttribute("href"),
  ).toBe("#upgrade-options");
  expect(screen.getByText("Premium league")).toBeDefined();
});
