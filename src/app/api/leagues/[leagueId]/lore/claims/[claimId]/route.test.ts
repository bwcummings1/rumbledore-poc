import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/result";
import { getLoreClaimDetailData } from "@/lore/member-experience";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn() },
  getLoreClaimDetailData: vi.fn(),
  requireLeagueRole: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/lore/member-experience", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lore/member-experience")>();
  return {
    ...actual,
    getLoreClaimDetailData: mocks.getLoreClaimDetailData,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const claimId = "00000000-0000-4000-8000-000000000004";

function request(): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/lore/claims/${claimId}`,
  );
}

function routeContext(overrideClaimId = claimId) {
  return { params: Promise.resolve({ claimId: overrideClaimId, leagueId }) };
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

describe("GET /api/leagues/[leagueId]/lore/claims/[claimId]", () => {
  it("returns the claim detail for a league member", async () => {
    mockAccess();
    mockMembership();
    mocks.getLoreClaimDetailData.mockResolvedValue({
      data: { claimId, title: "The trade" },
      status: "ready",
    });

    const response = await GET(request(), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ claimId });
  });

  it("answers a malformed claim id with a 400 instead of a Postgres 500", async () => {
    mockAccess();
    mockMembership();

    const response = await GET(request(), routeContext("not-a-uuid"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_CLAIM_ID" },
    });
    expect(getLoreClaimDetailData).not.toHaveBeenCalled();
  });

  it("returns auth guard errors before reading the claim", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await GET(request(), routeContext());

    expect(response.status).toBe(403);
    expect(getLoreClaimDetailData).not.toHaveBeenCalled();
  });
});
