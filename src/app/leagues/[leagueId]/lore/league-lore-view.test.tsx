import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { LoreSectionData } from "@/lore/member-ui";
import { LeagueLoreView } from "./league-lore-view";

const data: LoreSectionData = {
  counts: {
    canon: 3,
    openVotes: 2,
    refuted: 1,
    total: 6,
  },
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
  },
  submitOptions: {
    people: [],
    recordTypes: [],
    seasons: [],
  },
};

afterEach(() => {
  cleanup();
});

test("league lore view renders the section front and submit entry", () => {
  render(<LeagueLoreView data={data} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "NHS Alumni Annual official lore",
    }),
  ).toBeDefined();
  expect(screen.getByText("Canon entries")).toBeDefined();
  expect(screen.getByText("Open votes")).toBeDefined();
  expect(screen.getByText("Refuted facts")).toBeDefined();
  expect(screen.getByText("3")).toBeDefined();
  expect(screen.getByText("2")).toBeDefined();
  expect(screen.getByText("1")).toBeDefined();
  expect(
    screen.getByRole("link", { name: /submit claim/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/lore/new");
});
