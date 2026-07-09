import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { LeagueFeedData } from "@/news";
import { LEAGUE_PUBLICATION_SECTIONS } from "@/news/sections";
import { LeagueFeedView } from "./league-feed-view";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const data: LeagueFeedData = {
  activeSection: null,
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
      section: LEAGUE_PUBLICATION_SECTIONS[4],
      sourceLabel: "Commissioner",
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
      section: LEAGUE_PUBLICATION_SECTIONS[4],
      sourceLabel: "Central Wire",
      sourceUrl: "https://news.example.com/relevant",
      summary: "Fixture Team 01 has a lineup decision now.",
      title: "A-specific quarterback fallout",
    },
    {
      authorPersona: "narrator",
      contentItemId: "blog-content-2",
      id: "blog-content-2",
      kind: "blog",
      matchedEntities: [],
      publishedAt: "2026-06-11T10:00:00.000Z",
      relevanceReason: "",
      relevanceScore: 0,
      scope: "league",
      section: LEAGUE_PUBLICATION_SECTIONS[0],
      sourceLabel: "Narrator",
      sourceUrl: "",
      summary: "The Narrator frames a rivalry week collapse.",
      title: "Narrator files the rivalry week autopsy",
    },
    {
      authorPersona: null,
      contentItemId: "activity-content-1",
      id: "activity-content-1",
      kind: "ingest_event",
      matchedEntities: [],
      publishedAt: "2026-06-11T09:00:00.000Z",
      relevanceReason: "",
      relevanceScore: 0,
      scope: "league",
      section: LEAGUE_PUBLICATION_SECTIONS[3],
      sourceLabel: "League activity",
      sourceUrl: "",
      summary: "A notable lineup move hit the transaction wire.",
      title: "Fixture Team 01 shakes up the bench",
    },
    {
      authorPersona: "analyst",
      contentItemId: "blog-content-3",
      id: "blog-content-3",
      kind: "blog",
      matchedEntities: [],
      publishedAt: "2026-06-11T08:00:00.000Z",
      relevanceReason: "",
      relevanceScore: 0,
      scope: "league",
      section: LEAGUE_PUBLICATION_SECTIONS[1],
      sourceLabel: "Analyst",
      sourceUrl: "",
      summary: "The Analyst notes a points-for mirage.",
      title: "Analyst warns the standings are lying",
    },
    {
      authorPersona: "trash_talker",
      contentItemId: "blog-content-4",
      id: "blog-content-4",
      kind: "blog",
      matchedEntities: [],
      publishedAt: "2026-06-11T07:00:00.000Z",
      relevanceReason: "",
      relevanceScore: 0,
      scope: "league",
      section: LEAGUE_PUBLICATION_SECTIONS[2],
      sourceLabel: "Trash-Talker",
      sourceUrl: "",
      summary: "The Trash-Talker circles the waiver-wire panic.",
      title: "Trash-Talker opens the panic ledger",
    },
  ],
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Feed League A",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  sections: LEAGUE_PUBLICATION_SECTIONS,
  userRole: "commissioner",
};

afterEach(() => {
  cleanup();
});

test("league press view renders the league publication front", () => {
  const { container } = render(<LeagueFeedView data={data} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "The Feed League A Press" }),
  ).toBeDefined();
  expect(screen.getByText("LEAGUE DISPATCH")).toBeDefined();
  const sections = within(screen.getByLabelText("Press sections"));
  expect(sections.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Front",
    "Recaps",
    "Power Rankings",
    "Trash Talk",
    "Records",
    "Previews",
  ]);
  const lead = within(screen.getByLabelText("Lead story"));
  expect(
    lead.getByRole("heading", { name: "Commissioner note for league A" }),
  ).toBeDefined();
  expect(lead.getByText("Commissioner")).toBeDefined();
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
    lead.getByRole("link", { name: /read post/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/press/blog-content-1");
  expect(lead.getByText("Previews")).toBeDefined();
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
  expect(lead.getByRole("article").getAttribute("data-story-card-origin")).toBe(
    "cast",
  );
  expect(
    screen.getByRole("link", { name: /league home/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001");
  expect(screen.getByRole("link", { name: "Lore" }).getAttribute("href")).toBe(
    "/leagues/00000000-0000-4000-8000-000000000001/lore",
  );
  expect(
    screen.getByRole("link", { name: "Failure queue" }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/press/failures");
  expect(
    screen.getByRole("link", { name: "Webhooks" }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/press/webhooks");
});

test("league press view hides editorial actions from members", () => {
  render(<LeagueFeedView data={{ ...data, userRole: "member" }} />);

  expect(screen.queryByRole("link", { name: "Failure queue" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Webhooks" })).toBeNull();
});

test("league press view renders an empty state", () => {
  render(<LeagueFeedView data={{ ...data, items: [] }} />);

  expect(screen.getByText("No Press items yet")).toBeDefined();
});

test("league press view renders a section front empty state", () => {
  render(
    <LeagueFeedView
      data={{
        ...data,
        activeSection: LEAGUE_PUBLICATION_SECTIONS[2],
        items: [],
      }}
    />,
  );

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "The Feed League A Press",
    }),
  ).toBeDefined();
  expect(screen.getByText("Trash Talk section")).toBeDefined();
  expect(screen.getByText("No Trash Talk stories yet")).toBeDefined();
  expect(
    screen.getByRole("link", { name: /open the press/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/press");
});
