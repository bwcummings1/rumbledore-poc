import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError, ok } from "@/core/result";
import { assignDataSteward } from "@/onboarding/stewards";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  assignDataSteward: vi.fn(),
  db: {},
  requireLeagueRole: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/onboarding/stewards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/onboarding/stewards")>();
  return {
    ...actual,
    assignDataSteward: mocks.assignDataSteward,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function assignRequest(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/stewards`,
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

describe("POST /api/leagues/[leagueId]/stewards", () => {
  it("authorizes commissioners and assigns the requested member", async () => {
    mockAccess();
    mocks.assignDataSteward.mockResolvedValue(
      ok({
        steward: {
          displayName: "Fixture Manager",
          email: "fixture@example.com",
          isDataSteward: true,
          memberId,
          role: "data_steward",
          userId: "00000000-0000-4000-8000-000000000004",
        },
      }),
    );

    const response = await POST(assignRequest({ memberId }), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      steward: {
        isDataSteward: true,
        memberId,
        role: "data_steward",
      },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.db,
        leagueId,
        minRole: "commissioner",
      }),
    );
    expect(assignDataSteward).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      leagueId,
      targetMemberId: memberId,
    });
  });

  it("rejects malformed bodies before assignment", async () => {
    mockAccess();

    const response = await POST(
      assignRequest({ memberId: "not-a-uuid" }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_STEWARD_ASSIGNMENT" },
    });
    expect(assignDataSteward).not.toHaveBeenCalled();
  });

  it("returns auth guard errors before assignment", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(assignRequest({ memberId }), routeContext());

    expect(response.status).toBe(403);
    expect(assignDataSteward).not.toHaveBeenCalled();
  });
});
