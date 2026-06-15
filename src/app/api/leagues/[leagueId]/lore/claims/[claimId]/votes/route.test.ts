import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { castLoreVote } from "@/lore";
import { getLoreClaimVoteStatus } from "@/lore/member-experience";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  castLoreVote: vi.fn(),
  db: { select: vi.fn() },
  getLoreClaimVoteStatus: vi.fn(),
  requireLeagueRole: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/lore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lore")>();
  return {
    ...actual,
    castLoreVote: mocks.castLoreVote,
  };
});

vi.mock("@/lore/member-experience", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lore/member-experience")>();
  return {
    ...actual,
    getLoreClaimVoteStatus: mocks.getLoreClaimVoteStatus,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const claimId = "00000000-0000-4000-8000-000000000004";

function routeContext() {
  return { params: Promise.resolve({ claimId, leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/lore/claims/${claimId}/votes`,
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

describe("POST /api/leagues/[leagueId]/lore/claims/[claimId]/votes", () => {
  it("casts the caller's mutable lore vote and returns the fresh tally", async () => {
    mockAccess();
    mockMembership();
    mocks.getLoreClaimVoteStatus.mockResolvedValue({
      affirmNeeded: 0,
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

    const response = await POST(request({ choice: "affirm" }), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      claimId,
      currentChoice: "affirm",
      passesAtClose: true,
      tally: { affirm: 4, quorum: 4 },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.db,
        leagueId,
        minRole: "member",
      }),
    );
    expect(castLoreVote).toHaveBeenCalledWith({
      deps: { db: mocks.db },
      input: {
        choice: "affirm",
        claimId,
        leagueId,
        voterMemberId: memberId,
      },
    });
    expect(getLoreClaimVoteStatus).toHaveBeenCalledWith(mocks.db, {
      claimId,
      leagueId,
      memberId,
    });
  });

  it("rejects malformed vote payloads before touching membership", async () => {
    mockAccess();

    const response = await POST(request({ choice: "yes" }), routeContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_LORE_VOTE_REQUEST" },
    });
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(castLoreVote).not.toHaveBeenCalled();
  });

  it("returns auth guard errors before casting a vote", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request({ choice: "affirm" }), routeContext());

    expect(response.status).toBe(403);
    expect(castLoreVote).not.toHaveBeenCalled();
  });
});
