import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "@/app/onboarding/client-http";
import type {
  LorePollStatusSummary,
  LoreVoteStatusSummary,
} from "@/lore/member-ui";
import { LoreVoteWidget } from "./lore-vote-widget";

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

const loreVote: LoreVoteStatusSummary = {
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
};

const poll: LorePollStatusSummary = {
  activeMembers: 10,
  closesAt: "2026-06-22T12:00:00.000Z",
  currentOptionIdx: null,
  id: "00000000-0000-4000-8000-000000000010",
  isOpen: true,
  leadingOptionIdx: 0,
  options: [
    { current: false, index: 0, label: "Home Plotters", votes: 2 },
    { current: false, index: 1, label: "Away Antagonists", votes: 1 },
  ],
  question: "Settle it: who owns the main-character edit?",
  result: null,
  status: "open",
  totalVotes: 3,
  voteApiUrl:
    "/api/leagues/00000000-0000-4000-8000-000000000001/polls/00000000-0000-4000-8000-000000000010/votes",
  winningOptionIdx: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LoreVoteWidget", () => {
  it("casts lore affirm/reject/abstain votes and shows the fresh tally", async () => {
    mocks.postJson.mockResolvedValue({
      ...loreVote,
      affirmNeeded: 0,
      currentChoice: "affirm",
      passesAtClose: true,
      quorumMet: true,
      tally: {
        ...loreVote.tally,
        affirm: 4,
        totalVotes: 6,
      },
    });

    render(
      <LoreVoteWidget
        mode="lore"
        vote={loreVote}
        voteApiUrl="/api/lore-vote"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /affirm/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson).toHaveBeenCalledWith("/api/lore-vote", {
      choice: "affirm",
    });
    expect(await screen.findByText("Vote recorded: affirm.")).toBeDefined();
    expect(screen.getByText("Your vote")).toBeDefined();
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
  });

  it("casts an instigator poll vote against the poll route", async () => {
    mocks.postJson.mockResolvedValue({
      ...poll,
      currentOptionIdx: 1,
      options: [
        { current: false, index: 0, label: "Home Plotters", votes: 2 },
        { current: true, index: 1, label: "Away Antagonists", votes: 2 },
      ],
      pollId: poll.id,
      totalVotes: 4,
    });

    render(<LoreVoteWidget mode="poll" poll={poll} />);

    fireEvent.click(screen.getByRole("radio", { name: /away antagonists/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson).toHaveBeenCalledWith(poll.voteApiUrl, { optionIdx: 1 });
    expect(
      await screen.findByText("Poll vote recorded: Away Antagonists."),
    ).toBeDefined();
    const selected = screen.getByRole("radio", { name: /away antagonists/i });
    expect(
      selected instanceof HTMLInputElement ? selected.checked : false,
    ).toBe(true);
  });

  it("does not announce a poll leader before any option has votes", () => {
    render(
      <LoreVoteWidget
        mode="poll"
        poll={{
          ...poll,
          leadingOptionIdx: null,
          options: poll.options.map((option) => ({ ...option, votes: 0 })),
          totalVotes: 0,
        }}
      />,
    );

    expect(
      screen.getByText("No votes yet; top option wins at close."),
    ).toBeDefined();
  });
});
