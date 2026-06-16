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
    kind: "blog",
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
  expect(screen.getByText("Week turns")).toBeDefined();
  expect(
    screen.getByText("The waiver wire became a warning siren."),
  ).toBeDefined();
  expect(screen.getByText("Bench leverage arrived early")).toBeDefined();
  expect(
    screen.getByRole("complementary", { name: "Cited canon" }),
  ).toBeDefined();
  expect(
    screen.getByRole("navigation", { name: "Article tags" }),
  ).toBeDefined();
  expect(screen.getByRole("region", { name: "Related stories" })).toBeDefined();
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
          kind: "news",
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
