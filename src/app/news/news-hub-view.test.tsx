import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { CentralNewsHubData } from "@/news/hub";
import { NewsHubView } from "./news-hub-view";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const data: CentralNewsHubData = {
  items: [
    {
      id: "news-1",
      publishedAt: "2026-06-11T14:00:00.000Z",
      source: "NFL Wire",
      sourceUrl: "https://news.example.com/injury-update",
      summary: "A central fantasy injury update with source attribution.",
      title: "Quarterback injury changes Sunday fantasy outlook",
    },
    {
      id: "news-2",
      publishedAt: "2026-06-11T13:00:00.000Z",
      source: "Fantasy Desk",
      sourceUrl: "https://news.example.com/rankings",
      summary: "A rankings move with league-wide implications.",
      title: "Running back rankings tighten before kickoff",
    },
    {
      id: "news-3",
      publishedAt: "2026-06-11T12:00:00.000Z",
      source: "Injury Wire",
      sourceUrl: "https://news.example.com/injuries",
      summary: "A late injury report changes flex decisions.",
      title: "Practice report puts two starters in question",
    },
    {
      id: "news-4",
      publishedAt: "2026-06-11T11:00:00.000Z",
      source: "Waiver Desk",
      sourceUrl: "https://news.example.com/waivers",
      summary: "Waiver names worth watching after Sunday.",
      title: "Deep waiver options emerge from the early slate",
    },
    {
      id: "news-5",
      publishedAt: "2026-06-11T10:00:00.000Z",
      source: "NFL Wire",
      sourceUrl: "https://news.example.com/weather",
      summary: "Weather may change passing volume.",
      title: "Wind watch alters two passing-game outlooks",
    },
    {
      id: "news-6",
      publishedAt: "2026-06-11T09:00:00.000Z",
      source: "Depth Chart",
      sourceUrl: "https://news.example.com/depth",
      summary: "Depth chart notes for fantasy managers.",
      title: "Depth chart movement opens a sleeper path",
    },
  ],
};

afterEach(() => {
  cleanup();
});

test("news hub view renders central stories with attribution and source links", () => {
  render(<NewsHubView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "NFL and fantasy headlines",
    }),
  ).toBeDefined();
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

  expect(
    within(screen.getByLabelText("Secondary stories")).getAllByRole("article"),
  ).toHaveLength(3);
  expect(
    within(screen.getByLabelText("Story river")).getAllByRole("article"),
  ).toHaveLength(2);
});

test("news hub view renders an empty state", () => {
  render(<NewsHubView data={{ items: [] }} />);

  expect(screen.getByText("No central stories yet")).toBeDefined();
});
