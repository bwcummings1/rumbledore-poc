import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError, ok } from "@/core/result";
import { transferCommissionerRole } from "@/stats";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  requireLeagueRole: vi.fn(),
  transferCommissionerRole: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/stats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stats")>();
  return {
    ...actual,
    transferCommissionerRole: mocks.transferCommissionerRole,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const targetMemberId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/commissioner/handoff`,
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
      role: "commissioner",
      session: { user: { id: userId } },
      userId,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/commissioner/handoff", () => {
  it("requires commissioner access and transfers to the requested member", async () => {
    mockAccess();
    mocks.transferCommissionerRole.mockResolvedValue(
      ok({
        ledgerEntryId: "00000000-0000-4000-8000-000000000004",
        newCommissioner: {
          displayName: "Fixture Target",
          email: "target@example.com",
          memberId: targetMemberId,
          role: "commissioner",
          userId: "00000000-0000-4000-8000-000000000005",
        },
        previousCommissioner: {
          displayName: "Fixture Commissioner",
          email: "commissioner@example.com",
          memberId: "00000000-0000-4000-8000-000000000006",
          role: "member",
          userId,
        },
      }),
    );

    const response = await POST(
      request({ reason: "planned handoff", targetMemberId }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      newCommissioner: { memberId: targetMemberId, role: "commissioner" },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.db,
        leagueId,
        minRole: "commissioner",
      }),
    );
    expect(transferCommissionerRole).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      leagueId,
      reason: "planned handoff",
      targetMemberId,
    });
  });

  it("rejects non-commissioners before transfer", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request({ targetMemberId }), routeContext());

    expect(response.status).toBe(403);
    expect(transferCommissionerRole).not.toHaveBeenCalled();
  });
});
