import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "@/app/onboarding/client-http";
import type { LoreStewardReviewData } from "@/lore/member-ui";
import { LoreStewardReviewView } from "./lore-steward-review-view";

const mocks = vi.hoisted(() => ({
  postJson: vi.fn(),
}));

vi.mock("@/app/onboarding/client-http", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/onboarding/client-http")>();
  return {
    ...actual,
    postJson: mocks.postJson,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const claimId = "00000000-0000-4000-8000-000000000002";

const data: LoreStewardReviewData = {
  league: {
    id: leagueId,
    name: "NHS Alumni Annual",
  },
  openVotes: [
    {
      author: { displayName: "Fixture Manager", isAi: false },
      bodyPreview: "The league is close to canonizing this.",
      branchOf: null,
      createdAt: "2026-06-15T12:00:00.000Z",
      id: claimId,
      kind: "opinion",
      origin: "member",
      ratifiedAt: null,
      ratifiedBy: null,
      relation: "root",
      status: "vote",
      subjects: [],
      title: "Worst collapse",
      verification: "n_a",
      vote: {
        affirmNeeded: 1,
        currentChoice: null,
        isOpen: true,
        passesAtClose: false,
        quorumMet: false,
        tally: {
          abstain: 0,
          activeMembers: 10,
          affirm: 3,
          quorum: 4,
          quorumRatio: 0.34,
          reject: 1,
          totalVotes: 4,
        },
        voteClosesAt: "2026-06-22T12:00:00.000Z",
        voteOpensAt: "2026-06-15T12:00:00.000Z",
      },
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LoreStewardReviewView", () => {
  it("surfaces quorum-short tiebreaks and posts steward actions", async () => {
    mocks.postJson.mockResolvedValue({
      claim: { ...data.openVotes[0], ratifiedBy: "steward", status: "canon" },
      result: {
        claimId,
        ratifiedBy: "steward",
        status: "canonized",
      },
    });

    render(<LoreStewardReviewView data={data} />);

    expect(screen.getByText("Quorum-short majority")).toBeDefined();
    expect(screen.getByText(/quorum 4 of 10/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Clear majority, short by one absent manager." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ratify" }));

    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson).toHaveBeenCalledWith(
      `/api/leagues/${leagueId}/lore/claims/${claimId}/steward`,
      {
        action: "ratify",
        reason: "Clear majority, short by one absent manager.",
      },
    );
    expect(
      await screen.findByText("Steward action recorded: ratify."),
    ).toBeDefined();
    expect(
      screen.getByText("No open lore votes need steward review."),
    ).toBeDefined();
  });
});
