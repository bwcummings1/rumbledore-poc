import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { restoreCurationCheckpoint } from "@/stats";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  requireLeagueRole: vi.fn(),
  restoreCurationCheckpoint: vi.fn(),
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
    restoreCurationCheckpoint: mocks.restoreCurationCheckpoint,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const checkpointId = "00000000-0000-4000-8000-000000000003";

function routeContext(id = checkpointId) {
  return { params: Promise.resolve({ checkpointId: id, leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/curation/checkpoints/${checkpointId}/restore`,
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

describe("POST /api/leagues/[leagueId]/curation/checkpoints/[checkpointId]/restore", () => {
  it("restores a checkpoint for data stewards", async () => {
    mockAccess();
    mocks.restoreCurationCheckpoint.mockResolvedValue({
      id: checkpointId,
      seasons: [2011, 2012],
    });

    const response = await POST(
      request({ reason: "undo bad draft" }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkpoint: { id: checkpointId, seasons: [2011, 2012] },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
    );
    expect(restoreCurationCheckpoint).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      checkpointId,
      leagueId,
      reason: "undo bad draft",
    });
  });

  it("rejects malformed checkpoint ids before role checks", async () => {
    const response = await POST(request({}), routeContext("bad"));

    expect(response.status).toBe(400);
    expect(requireLeagueRole).not.toHaveBeenCalled();
    expect(restoreCurationCheckpoint).not.toHaveBeenCalled();
  });

  it("returns role guard errors before restoring", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires stewardship",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request({}), routeContext());

    expect(response.status).toBe(403);
    expect(restoreCurationCheckpoint).not.toHaveBeenCalled();
  });
});
