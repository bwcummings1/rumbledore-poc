import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type {
  LeagueCastInsight,
  LeagueCastPersonaCard,
  LeagueCastTurn,
} from "@/cast/league-cast";
import {
  CastChatThread,
  CastInsightCard,
  CastPersonaByline,
  CastRoster,
} from "./cast-presence";

afterEach(() => {
  cleanup();
});

const analystCard = {
  beat: "Matchups, projections-vs-results, trends, start/sit, and record math.",
  enabled: true,
  id: "persona-analyst",
  name: "Analyst",
  performsWhen: ["weekly-preview", "game.final", "record math"],
  persona: "analyst",
  pointOfView: "Dry, credible, and numbers-first.",
  recentOutputCount: 3,
  tone: "Dry, credible.",
} satisfies LeagueCastPersonaCard;

const mutedCard = {
  ...analystCard,
  enabled: false,
  id: "persona-trash",
  name: "Trash-Talker",
  persona: "trash_talker",
  recentOutputCount: 0,
} satisfies LeagueCastPersonaCard;

const insight = {
  beat: analystCard.beat,
  chip: {
    label: "Read",
    tone: "default",
    value: "Power Rankings",
  },
  claim: "Analyst warns the standings are lying",
  href: "/leagues/league-1/press/post-1",
  id: "post-1",
  name: "Analyst",
  persona: "analyst",
  publishedAt: "2026-06-16T12:00:00.000Z",
  section: {
    id: "power-rankings",
    label: "Power Rankings",
    slug: "power-rankings",
  },
  summary: "A numbers-first read from persisted content.",
  title: "Analyst warns the standings are lying",
} satisfies LeagueCastInsight;

const turn = {
  beat: "League-official framing.",
  href: "/leagues/league-1/press/post-2",
  id: "post-2",
  message: "The room has a new ruling to read.",
  name: "Commissioner",
  persona: "commissioner",
  publishedAt: "2026-06-16T13:00:00.000Z",
} satisfies LeagueCastTurn;

test("CastPersonaByline pairs persona orb state with text and an AI badge", () => {
  render(
    <CastPersonaByline
      beat={analystCard.beat}
      name="Analyst"
      persona="analyst"
      state="speaking"
    />,
  );

  expect(screen.getByText("Analyst")).toBeDefined();
  expect(screen.getByText("AI cast")).toBeDefined();
  const orb = document.querySelector(".orb");
  expect(orb?.getAttribute("data-persona")).toBe("analyst");
  expect(orb?.getAttribute("data-state")).toBe("speaking");
});

test("CastRoster renders enabled and muted persona dossiers from card data", () => {
  render(<CastRoster cards={[analystCard, mutedCard]} />);

  const roster = screen.getByRole("region", { name: "AI cast roster" });
  expect(within(roster).getByText("Analyst")).toBeDefined();
  expect(within(roster).getByText("Trash-Talker")).toBeDefined();
  expect(
    within(roster).getByText("Not performing in this league."),
  ).toBeDefined();
  expect(
    within(roster).getByRole("img", {
      name: "Analyst recent output cadence",
    }),
  ).toBeDefined();
});

test("CastInsightCard links persisted cast reads with persona byline and data chip", () => {
  render(<CastInsightCard insight={insight} />);

  expect(
    screen.getByRole("heading", {
      name: "Analyst warns the standings are lying",
    }),
  ).toBeDefined();
  expect(screen.getByText("Read: Power Rankings")).toBeDefined();
  expect(screen.getByRole("link", { name: "Read" }).getAttribute("href")).toBe(
    "/leagues/league-1/press/post-1",
  );
});

test("CastChatThread keeps the cast stream collapsible with bylines and links", () => {
  render(<CastChatThread initiallyOpen={false} turns={[turn]} />);

  expect(screen.getByText("Cast thread")).toBeDefined();
  expect(screen.getByText("The room has a new ruling to read.")).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "Open the dispatch" })
      .getAttribute("href"),
  ).toBe("/leagues/league-1/press/post-2");
});
