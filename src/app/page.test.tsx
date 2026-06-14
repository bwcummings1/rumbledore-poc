import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { YourLeaguesLandingData } from "@/home/your-leagues";
import {
  LoggedOutLanding,
  YourLeaguesLandingView,
} from "./your-leagues-landing-view";

const landingData = {
  leagues: [
    {
      href: "/leagues/league-a",
      latestPress: {
        authorPersona: "trash_talker",
        id: "post-a",
        publishedAt: "2026-06-14T00:00:00.000Z",
        summary: "The group chat was advised to keep its receipts.",
        title: "Beta Gets Dragged Into Prime Time",
      },
      leagueId: "league-a",
      logo: null,
      matchup: {
        away: {
          isUserTeam: true,
          name: "Beta Brigade",
          providerTeamId: "2",
          score: 91.25,
        },
        home: {
          isUserTeam: false,
          name: "Alpha Aces",
          providerTeamId: "1",
          score: 104.5,
        },
        id: "matchup-a",
        isUserMatchup: true,
        opponentTeamName: "Alpha Aces",
        scoringPeriod: 2,
        status: "in_progress",
        userTeamName: "Beta Brigade",
      },
      name: "Alpha After Dark",
      provider: "espn",
      providerLabel: "ESPN",
    },
  ],
} satisfies YourLeaguesLandingData;

afterEach(() => {
  cleanup();
});

describe("LoggedOutLanding", () => {
  it("renders the connect entry while preserving open global links", () => {
    render(<LoggedOutLanding />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your fantasy league becomes the show.",
      }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Connect Sleeper" })
        .getAttribute("href"),
    ).toBe("/onboarding/sleeper");
    expect(
      screen.getByRole("link", { name: "Connect Yahoo" }).getAttribute("href"),
    ).toBe("/onboarding/yahoo");
    expect(
      screen.getByRole("link", { name: "News" }).getAttribute("href"),
    ).toBe("/news");
    expect(
      screen.getByRole("link", { name: "Arena" }).getAttribute("href"),
    ).toBe("/arena");
  });
});

describe("YourLeaguesLandingView", () => {
  it("renders an empty authenticated state with provider connect options", () => {
    render(<YourLeaguesLandingView data={{ leagues: [] }} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Connect a league to open the lobby.",
      }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Connect ESPN" }).getAttribute("href"),
    ).toBe("/onboarding/espn");
  });

  it("renders MRU league cards with matchup scores and the latest Press headline", () => {
    render(<YourLeaguesLandingView data={landingData} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your Leagues" }),
    ).toBeDefined();

    const card = screen.getByRole("link", { name: "Open Alpha After Dark" });
    expect(card.getAttribute("href")).toBe("/leagues/league-a");
    expect(within(card).getByText("ESPN")).toBeDefined();
    expect(within(card).getByText("Your matchup · Week 2")).toBeDefined();
    expect(within(card).getByText("Live")).toBeDefined();
    expect(within(card).getByText("Beta Brigade vs Alpha Aces")).toBeDefined();
    expect(within(card).getByText("91.25")).toBeDefined();
    expect(
      within(card).getByText("Beta Gets Dragged Into Prime Time"),
    ).toBeDefined();
  });
});
