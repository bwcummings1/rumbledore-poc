import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { listUnifiedDataLedger } from "@/stats";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  listUnifiedDataLedger: vi.fn(),
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
    listUnifiedDataLedger: mocks.listUnifiedDataLedger,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const personId = "00000000-0000-4000-8000-000000000002";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/leagues/[leagueId]/curation/ledger", () => {
  it("is member-visible and applies entity filters", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      ok: true,
      value: {
        leagueId,
        role: "member",
        session: { user: { id: personId } },
        userId: personId,
      },
    });
    mocks.listUnifiedDataLedger.mockResolvedValue([
      {
        actorUserId: personId,
        afterValue: "Fixture Manager",
        beforeValue: "Fixture Manger",
        createdAt: "2026-06-18T12:00:00.000Z",
        editClass: "cosmetic",
        field: "canonical_name",
        id: "00000000-0000-4000-8000-000000000003",
        reason: "spelling",
        source: "league_data_edit",
        targetId: personId,
        targetKind: "person",
      },
    ]);

    const response = await GET(
      new Request(
        `https://rumbledore.test/api/leagues/${leagueId}/curation/ledger?targetKind=person&targetId=${personId}&limit=25`,
      ),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      entries: [{ field: "canonical_name", targetKind: "person" }],
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "member" }),
    );
    expect(listUnifiedDataLedger).toHaveBeenCalledWith(mocks.db, {
      leagueId,
      limit: 25,
      targetId: personId,
      targetKind: "person",
    });
  });

  it("returns role guard errors before ledger reads", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await GET(
      new Request(
        `https://rumbledore.test/api/leagues/${leagueId}/curation/ledger`,
      ),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(listUnifiedDataLedger).not.toHaveBeenCalled();
  });
});
