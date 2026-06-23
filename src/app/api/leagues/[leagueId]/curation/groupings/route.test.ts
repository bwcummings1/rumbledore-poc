import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import {
  confirmLeagueSeasonGrouping,
  dismissLeagueSeasonGrouping,
} from "@/stats";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  confirmLeagueSeasonGrouping: vi.fn(),
  dismissLeagueSeasonGrouping: vi.fn(),
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
    dismissLeagueSeasonGrouping: mocks.dismissLeagueSeasonGrouping,
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
  it("requires data steward access and confirms adjusted seasons", async () => {
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
      expect.objectContaining({ minRole: "data_steward" }),
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

  it("dismisses proposed groupings", async () => {
    mockAccess();
    mocks.dismissLeagueSeasonGrouping.mockResolvedValue({
      config: { format_type: "traditional" },
      confirmedByUserId: null,
      derivedFrom: {},
      id: groupingId,
      kind: "era",
      name: "2-week playoffs",
      ordinal: 1,
      rationale: "Dismissed by steward.",
      seasons: [2011, 2012],
      status: "dismissed",
    });

    const response = await POST(
      request({
        action: "dismiss",
        groupingId,
        reason: "not useful",
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      grouping: { id: groupingId, status: "dismissed" },
    });
    expect(dismissLeagueSeasonGrouping).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      groupingId,
      leagueId,
      reason: "not useful",
    });
    expect(confirmLeagueSeasonGrouping).not.toHaveBeenCalled();
  });

  it("rejects non-stewards before confirm", async () => {
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
    expect(dismissLeagueSeasonGrouping).not.toHaveBeenCalled();
  });
});
