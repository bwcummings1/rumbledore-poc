import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { CentralNewsHubData } from "@/news/hub";
import {
  CENTRAL_PUBLICATION_SECTIONS,
  type CentralPublicationSectionId,
} from "@/news/sections";
import { NewsHubView } from "./news-hub-view";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function section(id: CentralPublicationSectionId) {
  const found = CENTRAL_PUBLICATION_SECTIONS.find(
    (candidate) => candidate.id === id,
  );
  if (!found) {
    throw new Error(`Missing test section ${id}`);
  }
  return found;
}

const data: CentralNewsHubData = {
  activeSection: null,
  forYourLeague: null,
  items: [
    {
      id: "news-1",
      publishedAt: "2026-06-11T14:00:00.000Z",
      section: section("injuries"),
      source: "NFL Wire",
      sourceUrl: "https://news.example.com/injury-update",
      summary: "A central fantasy injury update with source attribution.",
      title: "Quarterback injury changes Sunday fantasy outlook",
    },
    {
      id: "news-2",
      publishedAt: "2026-06-11T13:00:00.000Z",
      section: section("rankings"),
      source: "Fantasy Desk",
      sourceUrl: "https://news.example.com/rankings",
      summary: "A rankings move with league-wide implications.",
      title: "Running back rankings tighten before kickoff",
    },
    {
      id: "news-3",
      publishedAt: "2026-06-11T12:00:00.000Z",
      section: section("injuries"),
      source: "Injury Wire",
      sourceUrl: "https://news.example.com/injuries",
      summary: "A late injury report changes flex decisions.",
      title: "Practice report puts two starters in question",
    },
    {
      id: "news-4",
      publishedAt: "2026-06-11T11:00:00.000Z",
      section: section("waivers"),
      source: "Waiver Desk",
      sourceUrl: "https://news.example.com/waivers",
      summary: "Waiver names worth watching after Sunday.",
      title: "Deep waiver options emerge from the early slate",
    },
    {
      id: "news-5",
      publishedAt: "2026-06-11T10:00:00.000Z",
      section: section("headlines"),
      source: "NFL Wire",
      sourceUrl: "https://news.example.com/weather",
      summary: "Weather may change passing volume.",
      title: "Wind watch alters two passing-game outlooks",
    },
    {
      id: "news-6",
      publishedAt: "2026-06-11T09:00:00.000Z",
      section: section("players"),
      source: "Depth Chart",
      sourceUrl: "https://news.example.com/depth",
      summary: "Depth chart notes for fantasy managers.",
      title: "Depth chart movement opens a sleeper path",
    },
  ],
  sections: CENTRAL_PUBLICATION_SECTIONS,
};

afterEach(() => {
  cleanup();
});

test("news hub view renders the central publication front", () => {
  const { container } = render(<NewsHubView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Rumbledore News",
    }),
  ).toBeDefined();
  expect(screen.getByText("CENTRAL WIRE")).toBeDefined();
  const sections = within(screen.getByLabelText("News sections"));
  expect(sections.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Front",
    "Headlines",
    "Players",
    "Rankings",
    "Start/Sit",
    "Injuries",
    "Waivers",
    "Analysis",
  ]);
  const lead = within(screen.getByLabelText("Lead story"));
  expect(
    lead.getByRole("heading", {
      name: "Quarterback injury changes Sunday fantasy outlook",
    }),
  ).toBeDefined();
  expect(lead.getByText("NFL Wire")).toBeDefined();
  expect(lead.getByText(/central fantasy injury update/i)).toBeDefined();
  expect(
    lead.getByRole("link", { name: /read source/i }).getAttribute("href"),
  ).toBe("https://news.example.com/injury-update");
  expect(lead.getByText("Injuries")).toBeDefined();

  expect(
    within(screen.getByLabelText("Secondary stories")).getAllByRole("article"),
  ).toHaveLength(3);
  expect(
    within(screen.getByLabelText("Story river")).getAllByRole("article"),
  ).toHaveLength(2);
  expect(container.querySelectorAll('[data-front-tier="lead"]')).toHaveLength(
    1,
  );
  expect(
    container.querySelectorAll('[data-front-tier="secondary"]'),
  ).toHaveLength(1);
  expect(container.querySelectorAll('[data-front-tier="river"]')).toHaveLength(
    1,
  );
  expect(screen.queryByLabelText("For your league")).toBeNull();
});

test("news hub view renders a for your league rail when tailored stories exist", () => {
  render(
    <NewsHubView
      data={{
        ...data,
        forYourLeague: {
          items: [
            {
              contentItemId: "news-2",
              id: "reference-1",
              matchedEntities: [
                {
                  label: "Fixture Team 01",
                  provider: "espn",
                  providerId: "1",
                  type: "team",
                },
              ],
              publishedAt: "2026-06-11T13:00:00.000Z",
              relevanceReason: "Fixture Team 01 rosters the affected starter.",
              relevanceScore: 8,
              section: section("rankings"),
              source: "Fantasy Desk",
              sourceUrl: "https://news.example.com/rankings",
              summary: "Fixture Team 01 has a lineup decision now.",
              title: "A-specific running back fallout",
            },
          ],
          league: {
            id: "league-a",
            name: "NHS Alumni Annual",
          },
        },
      }}
    />,
  );

  const rail = screen.getByLabelText("For your league");
  expect(
    within(rail).getByRole("heading", {
      name: "Central stories touching NHS Alumni Annual",
    }),
  ).toBeDefined();
  expect(
    within(rail).getByRole("heading", {
      name: "A-specific running back fallout",
    }),
  ).toBeDefined();
  expect(
    within(rail).getByText("Fixture Team 01 rosters the affected starter."),
  ).toBeDefined();
  expect(
    within(rail)
      .getByRole("link", { name: /read story/i })
      .getAttribute("href"),
  ).toBe("/news/articles/news-2");
  expect(
    rail.querySelectorAll('[data-story-card-variant="rail"]'),
  ).toHaveLength(1);
});

test("news hub view renders an empty state", () => {
  render(<NewsHubView data={{ ...data, activeSection: null, items: [] }} />);

  expect(screen.getByText("No central stories yet")).toBeDefined();
});

test("news hub view renders a section front empty state", () => {
  render(
    <NewsHubView
      data={{
        ...data,
        activeSection: section("headlines"),
        items: [],
      }}
    />,
  );

  expect(
    screen.getByRole("heading", { level: 1, name: "Rumbledore News" }),
  ).toBeDefined();
  expect(screen.getByText("Headlines section")).toBeDefined();
  expect(screen.getByText("No Headlines stories yet")).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: /open rumbledore news/i })
      .getAttribute("href"),
  ).toBe("/news");
});
