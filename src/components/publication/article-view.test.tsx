import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { PublicationArticleViewData } from "@/news/article";
import { PublicationArticleView } from "./article-view";

const baseData: PublicationArticleViewData = {
  article: {
    body: [
      "## Week turns",
      "Fixture Team 01 found the one crack in the matchup board.",
      "> The waiver wire became a warning siren.",
      "- Bench leverage arrived early",
      "- The favorite lost margin",
    ].join("\n\n"),
    bodyBlocks: [],
    byline: "The Narrator",
    bylineDetail: "Narrator - weaves the week into legend",
    canonCitations: [
      {
        claimId: "claim-1",
        href: "/leagues/league-1/lore/claim-1",
        provenance: "vote",
        ratifiedAt: "2026-06-10T12:00:00.000Z",
        title: "Fixture Team 01 owns the panic ledger",
      },
    ],
    dek: "A calm standfirst for the league paper.",
    headline: "Fixture Team 01 turns panic into policy",
    heroImageUrl: "https://images.example.com/fixture-team-01.jpg",
    id: "post-1",
    inlineDataBlocks: [
      {
        caption: "Ordered ranks from the article draft.",
        id: "power-rankings",
        kind: "ranked",
        rows: [
          {
            detail: "The record supports the jump.",
            id: "rank-1-fixture-team-01",
            label: "Fixture Team 01",
            metric: "#1",
            tone: "positive",
            value: "3-0 / +2",
          },
        ],
        title: "Power ranking table",
      },
    ],
    kind: "blog",
    lifecycle: {
      status: "published",
      statusChangedAt: "2026-06-11T12:00:00.000Z",
    },
    publishedAt: "2026-06-11T12:00:00.000Z",
    section: {
      href: "/leagues/league-1/press/recaps",
      label: "Recaps",
    },
    sourceUrl: "",
    tags: ["rivalry", "waivers"],
  },
  backHref: "/leagues/league-1/press",
  backLabel: "The Press",
  publicationHref: "/leagues/league-1/press",
  publicationLabel: "The Fixture League Press",
  relatedStories: [
    {
      byline: "The Analyst",
      dek: "A related read from the same desk.",
      headline: "The model finds a standings mirage",
      href: "/leagues/league-1/press/post-2",
      hrefLabel: "Read post",
      id: "post-2",
      origin: "cast",
      publishedAt: "2026-06-11T10:00:00.000Z",
      sectionTag: "Power Rankings",
    },
  ],
  scope: "league",
  tagHrefBase: "/leagues/league-1/press",
};

afterEach(() => {
  cleanup();
});

test("publication article view renders the AUSPEX editorial prose skin", () => {
  const { container } = render(<PublicationArticleView data={baseData} />);

  const article = container.querySelector('[data-slot="publication-article"]');
  expect(article).toBeTruthy();
  expect(
    within(article as HTMLElement).getByRole("heading", {
      level: 1,
      name: "Fixture Team 01 turns panic into policy",
    }),
  ).toBeDefined();
  expect(
    container
      .querySelector('[data-slot="editorial-prose"]')
      ?.className.includes("prose-auspex"),
  ).toBe(true);
  expect(container.querySelector('[data-article-origin="cast"]')).toBeTruthy();
  expect(
    container.querySelector('[data-slot="article-byline-orb"]'),
  ).toBeTruthy();
  expect(
    screen.getByRole("progressbar", { name: "Reading progress" }),
  ).toBeDefined();
  expect(screen.getByText("Week turns")).toBeDefined();
  expect(
    screen.getByText("The waiver wire became a warning siren."),
  ).toBeDefined();
  expect(
    container.querySelector('[data-slot="article-pull-quote"]'),
  ).toBeTruthy();
  expect(screen.getByText("Bench leverage arrived early")).toBeDefined();
  expect(screen.getByLabelText("Article data blocks")).toBeDefined();
  expect(
    screen.getByRole("table", { name: "Power ranking table" }),
  ).toBeDefined();
  expect(screen.getByText("Fixture Team 01")).toBeDefined();
  expect(
    screen.getByRole("complementary", { name: "Cited canon" }),
  ).toBeDefined();
  expect(
    screen.getByRole("navigation", { name: "Article tags" }),
  ).toBeDefined();
  expect(screen.getByRole("region", { name: "Related stories" })).toBeDefined();
  expect(
    screen.getByRole("link", { name: /next in recaps/i }).getAttribute("href"),
  ).toBe("/leagues/league-1/press/post-2");
});

test("publication article view treats central news as source-authored", () => {
  const { container } = render(
    <PublicationArticleView
      data={{
        ...baseData,
        article: {
          ...baseData.article,
          byline: "NFL Wire",
          bylineDetail: "Central NFL and fantasy desk",
          canonCitations: [],
          heroImageUrl: "",
          inlineDataBlocks: [],
          kind: "news",
          lifecycle: {
            status: "published",
            statusChangedAt: "2026-06-11T12:00:00.000Z",
          },
          sourceUrl: "https://news.example.com/story",
          tags: [],
        },
        backHref: "/news",
        backLabel: "News front",
        publicationHref: "/news",
        publicationLabel: "Rumbledore News",
        relatedStories: [],
        scope: "central",
        tagHrefBase: "/news",
      }}
    />,
  );

  expect(
    container.querySelector('[data-article-origin="source"]'),
  ).toBeTruthy();
  expect(
    container.querySelector('[data-slot="article-byline-orb"]'),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: /open source/i }).getAttribute("href"),
  ).toBe("https://news.example.com/story");
});

test("publication article view renders lifecycle controls and ledger for managed league posts", () => {
  render(
    <PublicationArticleView
      data={{
        ...baseData,
        article: {
          ...baseData.article,
          lifecycle: {
            retractionReason: "Wrong matchup winner.",
            status: "retracted",
            statusChangedAt: "2026-06-12T12:00:00.000Z",
          },
        },
        editorial: {
          canManage: true,
          ledgerEntries: [
            {
              actorDisplayName: "Commissioner",
              actorUserId: "00000000-0000-4000-8000-000000000010",
              afterValue: {
                reason: "Wrong matchup winner.",
                status: "retracted",
              },
              beforeValue: { status: "published" },
              createdAt: "2026-06-12T12:00:00.000Z",
              editClass: "substantive",
              field: "retract",
              id: "editorial-action-1",
              reason: "Wrong matchup winner.",
              scope: null,
              source: "editorial_action",
              targetId: "post-1",
              targetKind: "content_item",
            },
          ],
          regenerateApiUrl: "/api/leagues/league-1/press/post-1/regenerate",
          retractApiUrl: "/api/leagues/league-1/press/post-1/retract",
        },
      }}
    />,
  );

  expect(
    screen.getByRole("region", { name: "Retracted article" }),
  ).toBeDefined();
  expect(screen.getByText("Wrong matchup winner.")).toBeDefined();
  expect(screen.queryByRole("region", { name: "Article body" })).toBeNull();
  expect(
    screen.getByRole("complementary", { name: "Editorial ledger" }),
  ).toBeDefined();
  const editorialControls = screen.getByLabelText("Editorial controls");
  expect(editorialControls).toBeDefined();
  expect(
    within(editorialControls)
      .getByRole("button", { name: /retract/i })
      .hasAttribute("disabled"),
  ).toBe(true);
});

test("publication article view links superseded posts to their replacement", () => {
  render(
    <PublicationArticleView
      data={{
        ...baseData,
        article: {
          ...baseData.article,
          lifecycle: {
            replacementHref: "/leagues/league-1/press/post-3",
            replacementTitle: "Updated fixture story",
            status: "superseded",
            statusChangedAt: "2026-06-12T13:00:00.000Z",
          },
        },
      }}
    />,
  );

  expect(
    screen.getByRole("link", { name: /updated version/i }).getAttribute("href"),
  ).toBe("/leagues/league-1/press/post-3");
});

test("publication article view renders reaction controls for league posts", () => {
  render(
    <PublicationArticleView
      data={{
        ...baseData,
        article: {
          ...baseData.article,
          reactions: {
            apiUrl: "/api/leagues/league-1/press/post-1/reactions",
            counts: [
              { count: 2, emoji: "fire", glyph: "🔥", label: "Fire" },
              { count: 1, emoji: "skull", glyph: "💀", label: "Skull" },
              { count: 0, emoji: "laugh", glyph: "😂", label: "Laugh" },
              { count: 0, emoji: "trash", glyph: "🗑️", label: "Trash" },
            ],
            currentEmoji: "skull",
            total: 3,
          },
        },
      }}
    />,
  );

  expect(screen.getByRole("region", { name: "Article body" })).toBeDefined();
  expect(screen.getByText("Reader signal")).toBeDefined();
  expect(
    screen
      .getByRole("button", { name: /skull reaction, 1 vote/i })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

test("publication article view renders live embeds and drops unknown embeds", () => {
  render(
    <PublicationArticleView
      data={{
        ...baseData,
        article: {
          ...baseData.article,
          body: "Fallback only body should not replace structured blocks.",
          bodyBlocks: [
            { text: "Week turns", type: "heading" },
            {
              text: "Fixture Team 01 has live data in the article body.",
              type: "paragraph",
            },
            {
              embed: {
                id: "scoreboard:2026:1:2",
                kind: "scoreboard_strip",
                matchups: [
                  {
                    awayLabel: "FT2",
                    awayScore: 117.9,
                    homeLabel: "FT1",
                    homeScore: 131.2,
                    id: "matchup-1",
                    kickoffLabel: "Week 1",
                    status: "final",
                    winProbability: 100,
                  },
                ],
                scoringPeriod: 1,
                season: 2026,
                title: "Week 1 scoreboard",
              },
              type: "embed",
            },
            {
              embed: {
                id: "standings:2026:3:3",
                kind: "standings_movement",
                rows: [
                  {
                    delta: 1,
                    id: "1",
                    managerNames: ["Manager One"],
                    pointsFor: 344.2,
                    previousRank: 2,
                    rank: 1,
                    record: "3-1-0",
                    team: "Fixture Team 01",
                  },
                ],
                season: 2026,
                title: "Standings movement",
              },
              type: "embed",
            },
            {
              embed: {
                id: "h2h:2026:one-two:4",
                kind: "h2h_sparkline",
                personAName: "Manager One",
                personBName: "Manager Two",
                points: [
                  {
                    label: "2026 W1",
                    personAScore: 131.2,
                    personBScore: 117.9,
                    resultForA: "win",
                  },
                ],
                season: 2026,
                title: "Manager One vs Manager Two",
              },
              type: "embed",
            },
            {
              embed: { id: "future:embed", kind: "unknown" },
              type: "embed",
            },
          ],
        },
      }}
    />,
  );

  expect(screen.getByLabelText("Week 1 scoreboard")).toBeDefined();
  expect(screen.getByText("FT1")).toBeDefined();
  expect(screen.getByLabelText("Standings movement")).toBeDefined();
  expect(screen.getAllByText("Fixture Team 01").length).toBeGreaterThan(0);
  expect(screen.getByLabelText("Manager One vs Manager Two")).toBeDefined();
  expect(screen.queryByText("future:embed")).toBeNull();
  expect(
    screen.queryByText(
      "Fallback only body should not replace structured blocks.",
    ),
  ).toBeNull();
});
