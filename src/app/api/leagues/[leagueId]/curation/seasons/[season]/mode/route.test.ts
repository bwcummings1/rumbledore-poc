import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { setCurationSeasonMode } from "@/stats";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  requireLeagueRole: vi.fn(),
  setCurationSeasonMode: vi.fn(),
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
    setCurationSeasonMode: mocks.setCurationSeasonMode,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function routeContext(season = "2026") {
  return { params: Promise.resolve({ leagueId, season }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/curation/seasons/2026/mode`,
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

describe("POST /api/leagues/[leagueId]/curation/seasons/[season]/mode", () => {
  it("marks a season finalized for data stewards", async () => {
    mockAccess();
    mocks.setCurationSeasonMode.mockResolvedValue({
      finalizedAt: "2026-06-23T00:00:00.000Z",
      mode: "finalized",
      season: 2026,
    });

    const response = await POST(
      request({ mode: "finalized", reason: "ESPN complete" }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: { mode: "finalized", season: 2026 },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
    );
    expect(setCurationSeasonMode).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      leagueId,
      mode: "finalized",
      reason: "ESPN complete",
      season: 2026,
    });
  });

  it("rejects malformed seasons before role checks", async () => {
    const response = await POST(
      request({ mode: "finalized" }),
      routeContext("bad"),
    );

    expect(response.status).toBe(400);
    expect(requireLeagueRole).not.toHaveBeenCalled();
    expect(setCurationSeasonMode).not.toHaveBeenCalled();
  });

  it("rejects invalid mode payloads", async () => {
    mockAccess();

    const response = await POST(request({ mode: "archived" }), routeContext());

    expect(response.status).toBe(400);
    expect(setCurationSeasonMode).not.toHaveBeenCalled();
  });

  it("returns role guard errors before changing season mode", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires stewardship",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request({ mode: "live" }), routeContext());

    expect(response.status).toBe(403);
    expect(setCurationSeasonMode).not.toHaveBeenCalled();
  });
});
