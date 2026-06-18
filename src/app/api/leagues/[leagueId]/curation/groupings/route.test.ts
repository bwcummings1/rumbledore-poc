import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { confirmLeagueSeasonGrouping } from "@/stats";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  confirmLeagueSeasonGrouping: vi.fn(),
  db: {},
  requireLeagueRole: vi.fn(),
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
    confirmLeagueSeasonGrouping: mocks.confirmLeagueSeasonGrouping,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const groupingId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/curation/groupings`,
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

describe("POST /api/leagues/[leagueId]/curation/groupings", () => {
  it("requires commissioner access and confirms adjusted seasons", async () => {
    mockAccess();
    mocks.confirmLeagueSeasonGrouping.mockResolvedValue({
      config: { format_type: "traditional" },
      confirmedByUserId: userId,
      derivedFrom: {},
      id: groupingId,
      kind: "era",
      name: "Owner era",
      ordinal: 2,
      seasons: [2013, 2015],
      status: "confirmed",
    });

    const response = await POST(
      request({
        action: "confirm",
        groupingId,
        name: "Owner era",
        reason: "owner adjustment",
        seasons: [2013, 2015],
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      grouping: { id: groupingId, seasons: [2013, 2015], status: "confirmed" },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "commissioner" }),
    );
    expect(confirmLeagueSeasonGrouping).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      config: undefined,
      groupingId,
      leagueId,
      name: "Owner era",
      reason: "owner adjustment",
      seasons: [2013, 2015],
    });
  });

  it("rejects non-commissioners before confirm", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(
      request({ action: "confirm", groupingId, seasons: [2020] }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(confirmLeagueSeasonGrouping).not.toHaveBeenCalled();
  });
});
