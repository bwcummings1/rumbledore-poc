import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { applyCuratedDataEdit } from "@/stats";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  applyCuratedDataEdit: vi.fn(),
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
    applyCuratedDataEdit: mocks.applyCuratedDataEdit,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const personId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/curation/edits`,
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
      role: "data_steward",
      session: { user: { id: userId } },
      userId,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/curation/edits", () => {
  it("requires data-steward access and applies a general edit", async () => {
    mockAccess();
    mocks.applyCuratedDataEdit.mockResolvedValue({
      afterValue: "Fixture Manager",
      affectedTargetIds: [personId],
      beforeValue: "Fixture Manger",
      editId: "00000000-0000-4000-8000-000000000004",
      editIds: ["00000000-0000-4000-8000-000000000004"],
      recompute: { matchups: 0, records: 8 },
      scope: "all_years",
    });

    const response = await POST(
      request({
        editClass: "cosmetic",
        field: "canonical_name",
        reason: "spelling",
        scope: "all_years",
        targetId: personId,
        targetKind: "person",
        value: "Fixture Manager",
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      afterValue: "Fixture Manager",
      editId: "00000000-0000-4000-8000-000000000004",
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
    );
    expect(applyCuratedDataEdit).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      editClass: "cosmetic",
      field: "canonical_name",
      leagueId,
      reason: "spelling",
      scope: "all_years",
      season: undefined,
      targetId: personId,
      targetKind: "person",
      value: "Fixture Manager",
    });
  });

  it("rejects malformed edit payloads before applying", async () => {
    mockAccess();

    const response = await POST(
      request({
        editClass: "cosmetic",
        field: "canonical_name",
        targetId: "bad",
        targetKind: "person",
        value: "Fixture Manager",
      }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(applyCuratedDataEdit).not.toHaveBeenCalled();
  });

  it("returns role guard errors before applying", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(
      request({
        editClass: "cosmetic",
        field: "canonical_name",
        targetId: personId,
        targetKind: "person",
        value: "Fixture Manager",
      }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(applyCuratedDataEdit).not.toHaveBeenCalled();
  });
});
