import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { LeagueCastPresenceData } from "@/cast/league-cast";
import { LeagueCastView } from "./league-cast-view";

vi.mock("@/realtime/client", () => ({
  LeagueRealtimeRefresh: () => null,
}));

afterEach(() => {
  cleanup();
});

const data = {
  insights: [
    {
      beat: "Matchups, projections-vs-results, trends, start/sit, and record math.",
      chip: {
        label: "Read",
        tone: "default",
        value: "Power Rankings",
      },
      claim: "Analyst warns the standings are lying",
      href: "/leagues/00000000-0000-4000-8000-000000000001/press/post-1",
      id: "post-1",
      name: "Analyst",
      persona: "analyst",
      publishedAt: "2026-06-16T12:00:00.000Z",
      section: {
        id: "power-rankings",
        label: "Power Rankings",
        slug: "power-rankings",
      },
      summary: "The latest persisted cast read.",
      title: "Analyst warns the standings are lying",
    },
  ],
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  personas: [
    {
      beat: "League-official framing.",
      enabled: true,
      id: "persona-commissioner",
      name: "Commissioner",
      performsWhen: ["pre-week cron", "settle-it poll verdicts"],
      persona: "commissioner",
      pointOfView: "Warm, authoritative, and league-first.",
      recentOutputCount: 1,
      tone: "Warm, authoritative.",
    },
    {
      beat: "Roasts and rivalry needling.",
      enabled: false,
      id: "persona-trash",
      name: "Trash-Talker",
      performsWhen: ["game.final blowouts"],
      persona: "trash_talker",
      pointOfView: "Irreverent and punchy.",
      recentOutputCount: 0,
      tone: "Irreverent.",
    },
  ],
  turns: [
    {
      beat: "League-official framing.",
      href: "/leagues/00000000-0000-4000-8000-000000000001/press/post-2",
      id: "post-2",
      message: "The Commissioner filed a new ruling.",
      name: "Commissioner",
      persona: "commissioner",
      publishedAt: "2026-06-16T13:00:00.000Z",
    },
  ],
  userRole: "commissioner",
} satisfies LeagueCastPresenceData;

test("LeagueCastView composes roster, insights, thread, and safe navigation", () => {
  render(<LeagueCastView data={data} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "NHS Alumni Annual Cast" }),
  ).toBeDefined();
  expect(screen.getByText("1 performing")).toBeDefined();

  const roster = screen.getByRole("region", { name: "AI cast roster" });
  expect(within(roster).getByText("Commissioner")).toBeDefined();
  expect(within(roster).getByText("Trash-Talker")).toBeDefined();
  expect(
    within(roster).getByText("Not performing in this league."),
  ).toBeDefined();

  expect(
    screen.getByRole("heading", {
      name: "Analyst warns the standings are lying",
    }),
  ).toBeDefined();
  expect(
    screen.getByText("The Commissioner filed a new ruling."),
  ).toBeDefined();
  expect(
    screen.getByRole("link", { name: "League home" }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001");
  expect(
    screen.getByRole("link", { name: "The Press" }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/press");
  expect(
    screen.getByRole("link", { name: "Tone editor" }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/cast/tone");
});

test("LeagueCastView hides the tone editor from members", () => {
  render(<LeagueCastView data={{ ...data, userRole: "member" }} />);

  expect(screen.queryByRole("link", { name: "Tone editor" })).toBeNull();
  expect(screen.getByText("read-only")).toBeDefined();
});
