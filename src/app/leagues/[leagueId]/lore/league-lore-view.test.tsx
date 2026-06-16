import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { LoreSectionData } from "@/lore/member-ui";
import { LeagueLoreView } from "./league-lore-view";

const data: LoreSectionData = {
  activeSubject: null,
  canon: [],
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
  subjectFilters: [],
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

test("league lore view renders canon story cards and subject filters", () => {
  render(
    <LeagueLoreView
      data={{
        ...data,
        activeSubject: {
          key: "person:00000000-0000-4000-8000-000000000020",
          label: "Fixture Manager",
          type: "person",
        },
        canon: [
          {
            author: { displayName: "Fixture Manager", isAi: false },
            bodyPreview: "The trade that made everyone pick a side.",
            branchOf: null,
            createdAt: "2026-06-13T12:00:00.000Z",
            id: "00000000-0000-4000-8000-000000000011",
            kind: "opinion",
            origin: "member",
            ratifiedAt: "2026-06-14T12:00:00.000Z",
            ratifiedBy: "vote",
            relation: "root",
            status: "canon",
            subjects: [
              {
                key: "person:00000000-0000-4000-8000-000000000020",
                label: "Fixture Manager",
                type: "person",
              },
            ],
            title: "The Watson trade broke the league",
            verification: "n_a",
            vote: null,
          },
          {
            author: { displayName: "Commissioner", isAi: true },
            bodyPreview: "The data confirms the score.",
            branchOf: null,
            createdAt: "2026-06-12T12:00:00.000Z",
            id: "00000000-0000-4000-8000-000000000012",
            kind: "data_verifiable",
            origin: "ai",
            ratifiedAt: "2026-06-12T13:00:00.000Z",
            ratifiedBy: "verified",
            relation: "root",
            status: "canon",
            subjects: [],
            title: "Week 5 score is on the record",
            verification: "verified",
            vote: null,
          },
        ],
        subjectFilters: [
          {
            count: 2,
            key: "person:00000000-0000-4000-8000-000000000020",
            label: "Fixture Manager",
            type: "person",
          },
        ],
      }}
    />,
  );

  expect(screen.getByText("Canon about Fixture Manager")).toBeDefined();
  expect(screen.getByText("The Watson trade broke the league")).toBeDefined();
  expect(screen.getByText("Week 5 score is on the record")).toBeDefined();
  expect(screen.getByText("Canon - league decided")).toBeDefined();
  expect(screen.getByText("Subjects: Fixture Manager")).toBeDefined();
  expect(
    screen.getByRole("link", { name: /clear filter/i }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/lore");
  expect(
    screen.getByRole("link", { name: /fixture manager/i }).getAttribute("href"),
  ).toBe(
    "/leagues/00000000-0000-4000-8000-000000000001/lore?subject=person%3A00000000-0000-4000-8000-000000000020",
  );
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
            subjects: [],
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
  expect(screen.getByText("Trash Talker")).toBeDefined();
  expect(screen.getByText("AI cast")).toBeDefined();
  expect(screen.getByRole("radio", { name: /affirm 3/i })).toBeDefined();
  expect(screen.getByRole("radio", { name: /reject 1/i })).toBeDefined();
  expect(screen.getByRole("radio", { name: /abstain 1/i })).toBeDefined();
  expect(screen.getByText(/quorum tick at 4 of 10/i)).toBeDefined();
});
