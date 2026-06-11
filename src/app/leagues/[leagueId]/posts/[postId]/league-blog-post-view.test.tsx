import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { LeagueBlogPostData } from "@/news";
import { LeagueBlogPostView } from "./league-blog-post-view";

const data: LeagueBlogPostData = {
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  post: {
    authorPersona: "narrator",
    body: "The rivalry tilted toward Fixture Team 01.\n\nFixture Team 02 still has a counterpunch waiting.",
    id: "00000000-0000-4000-8000-000000000101",
    publishedAt: "2026-06-11T14:30:00.000Z",
    summary: "A fixture rivalry recap from the league narrator.",
    title: "Narrator: Fixture rivalry week",
  },
  userRole: "commissioner",
};

afterEach(() => {
  cleanup();
});

test("league blog post view renders persona metadata and full body", () => {
  render(<LeagueBlogPostView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Narrator: Fixture rivalry week",
    }),
  ).toBeDefined();
  expect(screen.getByText("Narrator")).toBeDefined();
  expect(
    screen.getByText("NHS Alumni Annual · 2026 · commissioner"),
  ).toBeDefined();
  expect(
    screen.getByText("A fixture rivalry recap from the league narrator."),
  ).toBeDefined();
  expect(
    screen.getByText("The rivalry tilted toward Fixture Team 01."),
  ).toBeDefined();
  expect(
    screen.getByText("Fixture Team 02 still has a counterpunch waiting."),
  ).toBeDefined();
  expect(
    screen.getByRole("link", { name: /league feed/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/feed");
  expect(
    screen.getByRole("link", { name: /league home/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001");
});
