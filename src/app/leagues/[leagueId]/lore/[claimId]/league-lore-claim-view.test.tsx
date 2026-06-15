import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "@/app/onboarding/client-http";
import type { LoreClaimDetailData } from "@/lore/member-ui";
import { LeagueLoreClaimView } from "./league-lore-claim-view";

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

const data: LoreClaimDetailData = {
  claim: {
    author: { displayName: "Fixture Manager", isAi: false },
    body: "This collapse belongs in the permanent record.",
    bodyPreview: "This collapse belongs in the permanent record.",
    branchOf: null,
    createdAt: "2026-06-15T12:00:00.000Z",
    id: claimId,
    kind: "opinion",
    origin: "member",
    ratifiedAt: null,
    ratifiedBy: null,
    relation: "root",
    statement: "This collapse belongs in the permanent record.",
    status: "vote",
    subjects: [],
    threadRootId: claimId,
    title: "Worst collapse",
    updatedAt: "2026-06-15T12:00:00.000Z",
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
        affirm: 2,
        quorum: 4,
        quorumRatio: 0.34,
        reject: 1,
        totalVotes: 3,
      },
      voteClosesAt: "2026-06-22T12:00:00.000Z",
      voteOpensAt: "2026-06-15T12:00:00.000Z",
    },
  },
  isSteward: true,
  league: {
    id: leagueId,
    name: "NHS Alumni Annual",
  },
  stewardApiUrl: `/api/leagues/${leagueId}/lore/claims/${claimId}/steward`,
  stewardReviewHref: `/leagues/${leagueId}/lore/steward`,
  thread: [],
  verificationResult: null,
  voteApiUrl: `/api/leagues/${leagueId}/lore/claims/${claimId}/votes`,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LeagueLoreClaimView", () => {
  it("casts a vote and updates the tally", async () => {
    mocks.postJson.mockResolvedValue({
      affirmNeeded: 0,
      claimId,
      currentChoice: "affirm",
      isOpen: true,
      passesAtClose: true,
      quorumMet: true,
      tally: {
        abstain: 0,
        activeMembers: 10,
        affirm: 4,
        quorum: 4,
        quorumRatio: 0.34,
        reject: 1,
        totalVotes: 5,
      },
      voteClosesAt: "2026-06-22T12:00:00.000Z",
      voteOpensAt: "2026-06-15T12:00:00.000Z",
    });

    render(<LeagueLoreClaimView data={data} />);

    fireEvent.click(screen.getByRole("button", { name: /affirm/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson).toHaveBeenCalledWith(data.voteApiUrl, {
      choice: "affirm",
    });
    expect(await screen.findByText("Vote recorded: affirm.")).toBeDefined();
    expect(screen.getByText("Your vote")).toBeDefined();
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
  });

  it("sends steward tiebreak actions with an audited reason", async () => {
    mocks.postJson.mockResolvedValue({
      claim: {
        ...data.claim,
        ratifiedAt: "2026-06-16T12:00:00.000Z",
        ratifiedBy: "steward",
        status: "canon",
        vote: null,
      },
      result: {
        claimId,
        ratifiedBy: "steward",
        status: "canonized",
      },
    });

    render(<LeagueLoreClaimView data={data} />);

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Affirm leads and the group has clearly weighed in." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ratify" }));

    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson).toHaveBeenCalledWith(data.stewardApiUrl, {
      action: "ratify",
      reason: "Affirm leads and the group has clearly weighed in.",
    });
    expect(
      await screen.findByText("Steward action recorded: ratify."),
    ).toBeDefined();
    expect(screen.getByText("Canon · steward ratified")).toBeDefined();
  });

  it("renders branch lineage with superseded and replacement claims", () => {
    const originalId = "00000000-0000-4000-8000-000000000010";
    const disputeId = "00000000-0000-4000-8000-000000000011";

    render(
      <LeagueLoreClaimView
        data={{
          ...data,
          claim: {
            ...data.claim,
            branchOf: originalId,
            id: disputeId,
            relation: "dispute",
            status: "canon",
            title: "Actually, the Watson trade was justified",
            vote: null,
          },
          thread: [
            {
              ...data.claim,
              branchOf: null,
              bodyPreview: "The original version of the trade story.",
              id: originalId,
              ratifiedAt: "2026-06-14T12:00:00.000Z",
              ratifiedBy: "vote",
              status: "superseded",
              title: "The Watson trade broke the league",
              vote: null,
            },
            {
              ...data.claim,
              branchOf: originalId,
              bodyPreview: "The league flipped after the dispute.",
              id: disputeId,
              ratifiedAt: "2026-06-15T12:00:00.000Z",
              ratifiedBy: "vote",
              relation: "dispute",
              status: "canon",
              title: "Actually, the Watson trade was justified",
              vote: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Thread lineage")).toBeDefined();
    expect(screen.getByText("Dispute")).toBeDefined();
    expect(
      screen.getByText(
        "Superseded by Actually, the Watson trade was justified",
      ),
    ).toBeDefined();
    expect(
      screen.getAllByText("Actually, the Watson trade was justified").length,
    ).toBeGreaterThanOrEqual(2);
  });
});
