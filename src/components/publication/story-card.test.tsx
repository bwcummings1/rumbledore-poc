import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type PublicationStory,
  PublicationStoryCard,
  type PublicationStoryCardVariant,
} from "./story-card";

const story: PublicationStory = {
  byline: "The Analyst",
  dek: "A sharp standfirst that keeps the article shape intact.",
  headline: "Fixture Team 01 turns a waiver wire note into a warning",
  href: "/leagues/league-1/press/post-1",
  hrefLabel: "Read post",
  id: "post-1",
  publishedAt: "2026-06-11T12:00:00.000Z",
  relevanceReason: "Fixture Team 01 rosters the affected starter.",
  sectionTag: "Power Rankings",
  sourceUrl: "https://news.example.com/post-1",
  thumbnailAlt: "Fixture Team 01 sideline",
  thumbnailUrl: "https://images.example.com/fixture-team-01.jpg",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test.each<PublicationStoryCardVariant>(["hero", "secondary", "river", "rail"])(
  "publication story card %s variant keeps the shared story fields",
  (variant) => {
    render(<PublicationStoryCard story={story} variant={variant} />);

    const article = screen.getByRole("article");
    expect(article.getAttribute("data-story-card-variant")).toBe(variant);
    expect(
      within(article).getByRole("heading", {
        name: "Fixture Team 01 turns a waiver wire note into a warning",
      }),
    ).toBeDefined();
    expect(within(article).getByText("Power Rankings")).toBeDefined();
    expect(within(article).getByText("The Analyst")).toBeDefined();
    expect(
      within(article).getByText(
        "A sharp standfirst that keeps the article shape intact.",
      ),
    ).toBeDefined();
    expect(
      within(article).getByText(
        "Fixture Team 01 rosters the affected starter.",
      ),
    ).toBeDefined();
    expect(within(article).getByText("3 days ago")).toBeDefined();
    expect(
      within(article)
        .getByAltText("Fixture Team 01 sideline")
        .getAttribute("src"),
    ).toContain("fixture-team-01.jpg");
    expect(
      within(article)
        .getByRole("link", { name: /read post/i })
        .getAttribute("href"),
    ).toBe("/leagues/league-1/press/post-1");
    expect(
      within(article)
        .getByRole("link", { name: /read source/i })
        .getAttribute("href"),
    ).toBe("https://news.example.com/post-1");
  },
);
