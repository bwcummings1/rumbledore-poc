import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { castPollVote } from "@/instigator";
import { getLorePollVoteStatus } from "@/lore/member-experience";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  castPollVote: vi.fn(),
  db: { select: vi.fn() },
  getLorePollVoteStatus: vi.fn(),
  requireLeagueRole: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/instigator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/instigator")>();
  return {
    ...actual,
    castPollVote: mocks.castPollVote,
  };
});

vi.mock("@/lore/member-experience", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lore/member-experience")>();
  return {
    ...actual,
    getLorePollVoteStatus: mocks.getLorePollVoteStatus,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const pollId = "00000000-0000-4000-8000-000000000004";

function routeContext() {
  return { params: Promise.resolve({ leagueId, pollId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/polls/${pollId}/votes`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function mockAccess() {
  mocks.requireLeagueRole.mockResolvedValue({
    ok: true,
    value: {
      leagueId,
      role: "member",
      session: { user: { id: userId } },
      userId,
    },
  });
}

function mockMembership() {
  const limit = vi.fn().mockResolvedValue([{ id: memberId }]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.db.select.mockReturnValue({ from });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/polls/[pollId]/votes", () => {
  it("casts the caller's poll option vote and returns fresh poll status", async () => {
    mockAccess();
    mockMembership();
    mocks.getLorePollVoteStatus.mockResolvedValue({
      activeMembers: 10,
      closesAt: "2026-06-22T12:00:00.000Z",
      currentOptionIdx: 1,
      id: pollId,
      isOpen: true,
      leadingOptionIdx: 1,
      options: [
        { current: false, index: 0, label: "Home Plotters", votes: 2 },
        { current: true, index: 1, label: "Away Antagonists", votes: 3 },
      ],
      question: "Settle it",
      result: null,
      status: "open",
      totalVotes: 5,
      voteApiUrl: `/api/leagues/${leagueId}/polls/${pollId}/votes`,
      winningOptionIdx: null,
    });

    const response = await POST(request({ optionIdx: 1 }), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      currentOptionIdx: 1,
      options: [{ votes: 2 }, { current: true, votes: 3 }],
      pollId,
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.db,
        leagueId,
        minRole: "member",
      }),
    );
    expect(castPollVote).toHaveBeenCalledWith({
      deps: { db: mocks.db },
      input: {
        leagueId,
        memberId,
        optionIdx: 1,
        pollId,
      },
    });
    expect(getLorePollVoteStatus).toHaveBeenCalledWith(mocks.db, {
      leagueId,
      memberId,
      pollId,
    });
  });

  it("rejects malformed poll vote payloads before touching membership", async () => {
    mockAccess();

    const response = await POST(request({ optionIdx: -1 }), routeContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_POLL_VOTE_REQUEST" },
    });
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(castPollVote).not.toHaveBeenCalled();
  });

  it("returns auth guard errors before casting a poll vote", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request({ optionIdx: 1 }), routeContext());

    expect(response.status).toBe(403);
    expect(castPollVote).not.toHaveBeenCalled();
  });
});
