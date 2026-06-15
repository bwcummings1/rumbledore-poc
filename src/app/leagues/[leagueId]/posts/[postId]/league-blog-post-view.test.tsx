import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { LeaguePressArticleData } from "@/news";
import { LeagueBlogPostView } from "./league-blog-post-view";

const data: LeaguePressArticleData = {
  article: {
    body: "## Turning point\n\nThe rivalry tilted toward Fixture Team 01.\n\n> Fixture Team 02 still has a counterpunch waiting.\n\n- A waiver panic\n- A title-game grudge",
    byline: "Narrator",
    bylineDetail: "Story-driven recaps that connect results to league history.",
    canonCitations: [
      {
        claimId: "00000000-0000-4000-8000-000000000201",
        href: "/leagues/00000000-0000-4000-8000-000000000001/lore/00000000-0000-4000-8000-000000000201",
        provenance: "vote",
        ratifiedAt: "2026-06-10T12:00:00.000Z",
        title: "Snow Bowl Collapse",
      },
    ],
    dek: "A fixture rivalry recap from the league narrator.",
    headline: "Narrator: Fixture rivalry week",
    heroImageUrl: "",
    id: "00000000-0000-4000-8000-000000000101",
    kind: "blog",
    publishedAt: "2026-06-11T14:30:00.000Z",
    section: {
      href: "/leagues/00000000-0000-4000-8000-000000000001/press/recaps",
      label: "Recaps",
    },
    sourceUrl: "",
    tags: ["Fixture Team 01", "Rivalry Week"],
  },
  backHref: "/leagues/00000000-0000-4000-8000-000000000001/press",
  backLabel: "The Press",
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  publicationHref: "/leagues/00000000-0000-4000-8000-000000000001/press",
  publicationLabel: "The NHS Alumni Annual Press",
  relatedStories: [
    {
      byline: "Analyst",
      dek: "A dry look at the same rivalry.",
      headline: "Analyst charts the grudge match",
      href: "/leagues/00000000-0000-4000-8000-000000000001/press/00000000-0000-4000-8000-000000000102",
      hrefLabel: "Read post",
      id: "00000000-0000-4000-8000-000000000102",
      publishedAt: "2026-06-11T13:30:00.000Z",
      sectionTag: "Recaps",
    },
  ],
  scope: "league",
  tagHrefBase: "/leagues/00000000-0000-4000-8000-000000000001/press",
  userRole: "commissioner",
};

afterEach(() => {
  cleanup();
});

test("league blog post view renders a full publication article", () => {
  render(<LeagueBlogPostView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Narrator: Fixture rivalry week",
    }),
  ).toBeDefined();
  expect(screen.getByText("Narrator")).toBeDefined();
  expect(
    screen.getByText("A fixture rivalry recap from the league narrator."),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { level: 2, name: "Turning point" }),
  ).toBeDefined();
  expect(
    screen.getByText("Fixture Team 02 still has a counterpunch waiting."),
  ).toBeDefined();
  expect(screen.getByText("A waiver panic")).toBeDefined();
  expect(
    screen.getByRole("link", { name: /fixture team 01/i }).getAttribute("href"),
  ).toBe(
    "/leagues/00000000-0000-4000-8000-000000000001/press?tag=Fixture+Team+01",
  );
  expect(screen.getByText("Cited canon")).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: /snow bowl collapse/i })
      .getAttribute("href"),
  ).toBe(
    "/leagues/00000000-0000-4000-8000-000000000001/lore/00000000-0000-4000-8000-000000000201",
  );
  expect(screen.getByText(/canon - league decided/i)).toBeDefined();
  expect(
    screen.getByRole("link", { name: /the press/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/press");

  const related = within(screen.getByLabelText("Related stories"));
  expect(
    related.getByRole("heading", { name: "Analyst charts the grudge match" }),
  ).toBeDefined();
  expect(
    related.getByRole("link", { name: /read post/i }).getAttribute("href"),
  ).toBe(
    "/leagues/00000000-0000-4000-8000-000000000001/press/00000000-0000-4000-8000-000000000102",
  );
});
