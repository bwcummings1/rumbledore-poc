import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { LeagueFeedData } from "@/news";
import { LeagueFeedView } from "./league-feed-view";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const data: LeagueFeedData = {
  items: [
    {
      authorPersona: "commissioner",
      contentItemId: "blog-content-1",
      id: "blog-content-1",
      kind: "blog",
      matchedEntities: [],
      publishedAt: "2026-06-11T11:00:00.000Z",
      relevanceReason: "",
      relevanceScore: 0,
      scope: "league",
      sourceLabel: "League blog",
      sourceUrl: "",
      summary: "League-specific weekly framing for Fixture Team 01.",
      title: "Commissioner note for league A",
    },
    {
      authorPersona: null,
      contentItemId: "central-content-1",
      id: "reference-1",
      kind: "news",
      matchedEntities: [
        {
          label: "Fixture Team 01",
          provider: "espn",
          providerId: "1",
          type: "team",
        },
      ],
      publishedAt: "2026-06-11T12:00:00.000Z",
      relevanceReason: "Fixture Team 01 rosters the affected starter.",
      relevanceScore: 5,
      scope: "central",
      sourceLabel: "Central Wire",
      sourceUrl: "https://news.example.com/relevant",
      summary: "Fixture Team 01 has a lineup decision now.",
      title: "A-specific quarterback fallout",
    },
  ],
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Feed League A",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  userRole: "commissioner",
};

afterEach(() => {
  cleanup();
});

test("league feed view renders league posts and relevant central stories", () => {
  render(<LeagueFeedView data={data} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Feed League A" }),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Commissioner note for league A" }),
  ).toBeDefined();
  expect(screen.getByText("Commissioner")).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "A-specific quarterback fallout" }),
  ).toBeDefined();
  expect(screen.getByText("Central Wire")).toBeDefined();
  expect(
    screen.getByText("Fixture Team 01 rosters the affected starter."),
  ).toBeDefined();
  expect(
    screen.getByRole("link", { name: /read source/i }).getAttribute("href"),
  ).toBe("https://news.example.com/relevant");
  expect(
    screen.getByRole("link", { name: /read post/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/posts/blog-content-1");
  expect(
    screen.getByRole("link", { name: /league home/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001");
});

test("league feed view renders an empty state", () => {
  render(<LeagueFeedView data={{ ...data, items: [] }} />);

  expect(screen.getByText("No league feed items yet")).toBeDefined();
});
