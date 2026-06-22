import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { createCurationCheckpoint, listCurationCheckpoints } from "@/stats";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  createCurationCheckpoint: vi.fn(),
  db: {},
  listCurationCheckpoints: vi.fn(),
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
    createCurationCheckpoint: mocks.createCurationCheckpoint,
    listCurationCheckpoints: mocks.listCurationCheckpoints,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const checkpointId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
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

function postRequest(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/curation/checkpoints`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/leagues/[leagueId]/curation/checkpoints", () => {
  it("lists checkpoint summaries for data stewards", async () => {
    mockAccess();
    mocks.listCurationCheckpoints.mockResolvedValue([
      {
        actorUserId: userId,
        createdAt: "2026-06-22T12:00:00.000Z",
        editIds: [],
        id: checkpointId,
        label: "Before 2012 fix",
        latestEditId: null,
        leagueId,
        markerEditId: null,
        note: null,
        seasons: [2011, 2012],
        snapshotHash: "hash",
      },
    ]);

    const response = await GET(
      new Request(
        `https://rumbledore.test/api/leagues/${leagueId}/curation/checkpoints?limit=10`,
      ),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkpoints: [{ id: checkpointId, seasons: [2011, 2012] }],
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
    );
    expect(listCurationCheckpoints).toHaveBeenCalledWith(mocks.db, {
      leagueId,
      limit: 10,
    });
  });

  it("creates a checkpoint for data stewards", async () => {
    mockAccess();
    mocks.createCurationCheckpoint.mockResolvedValue({
      id: checkpointId,
      label: "Saved draft",
      seasons: [2012],
      snapshot: { seasons: [2012] },
    });

    const response = await POST(
      postRequest({ label: "Saved draft", note: "stepping away" }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkpoint: { id: checkpointId, label: "Saved draft" },
    });
    expect(createCurationCheckpoint).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      label: "Saved draft",
      leagueId,
      note: "stepping away",
    });
  });

  it("returns role guard errors before checkpoint access", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires stewardship",
        status: 403,
      }),
      ok: false,
    });

    const response = await GET(
      new Request(
        `https://rumbledore.test/api/leagues/${leagueId}/curation/checkpoints`,
      ),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(listCurationCheckpoints).not.toHaveBeenCalled();
    expect(createCurationCheckpoint).not.toHaveBeenCalled();
  });
});
