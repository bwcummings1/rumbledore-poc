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
  openVotes: [],
  submitOptions: {
    people: [],
    recordTypes: [],
    seasons: [],
  },
  stewardReviewHref:
    "/leagues/00000000-0000-4000-8000-000000000001/lore/steward",
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
  expect(
    screen.getByRole("link", { name: /steward review/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/lore/steward");
});

test("league lore view renders open vote cards with tally threshold", () => {
  render(
    <LeagueLoreView
      data={{
        ...data,
        openVotes: [
          {
            author: { displayName: "Trash Talker", isAi: true },
            bodyPreview: "Settle the collapse argument.",
            branchOf: null,
            createdAt: "2026-06-15T12:00:00.000Z",
            id: "00000000-0000-4000-8000-000000000010",
            kind: "opinion",
            origin: "ai",
            ratifiedAt: null,
            ratifiedBy: null,
            relation: "root",
            status: "vote",
            title: "Biggest choker of the decade",
            verification: "n_a",
            vote: {
              affirmNeeded: 1,
              currentChoice: null,
              isOpen: true,
              passesAtClose: false,
              quorumMet: false,
              tally: {
                abstain: 1,
                activeMembers: 10,
                affirm: 3,
                quorum: 4,
                quorumRatio: 0.34,
                reject: 1,
                totalVotes: 5,
              },
              voteClosesAt: "2026-06-22T12:00:00.000Z",
              voteOpensAt: "2026-06-15T12:00:00.000Z",
            },
          },
        ],
      }}
    />,
  );

  expect(screen.getByText("Biggest choker of the decade")).toBeDefined();
  expect(screen.getByText("3 affirm")).toBeDefined();
  expect(screen.getByText("1 reject")).toBeDefined();
  expect(screen.getByText("1 abstain")).toBeDefined();
  expect(screen.getByText(/quorum 4 of 10/i)).toBeDefined();
});
