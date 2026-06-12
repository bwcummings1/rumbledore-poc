import { cleanup, render, screen } from "@testing-library/react";
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
  expect(
    screen.getByRole("heading", {
      name: "Quarterback injury changes Sunday fantasy outlook",
    }),
  ).toBeDefined();
  expect(screen.getByText("NFL Wire")).toBeDefined();
  expect(screen.getByText(/central fantasy injury update/i)).toBeDefined();
  expect(
    screen.getByRole("link", { name: /read source/i }).getAttribute("href"),
  ).toBe("https://news.example.com/injury-update");
});

test("news hub view renders an empty state", () => {
  render(<NewsHubView data={{ items: [] }} />);

  expect(screen.getByText("No central stories yet")).toBeDefined();
});
