import { afterEach, describe, expect, it, vi } from "vitest";
import { retryGenerationFailureRun } from "@/ai";
import { createAiDependencies } from "@/ai/dependencies";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  aiDeps: {},
  createAiDependencies: vi.fn(),
  db: {},
  env: {},
  requireLeagueRole: vi.fn(),
  retryGenerationFailureRun: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/core/env", () => ({
  getEnv: () => mocks.env,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/ai/dependencies", () => ({
  createAiDependencies: mocks.createAiDependencies,
}));

vi.mock("@/ai", () => ({
  retryGenerationFailureRun: mocks.retryGenerationFailureRun,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId, runId }) };
}

function request(): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/press/failures/${runId}/retry`,
    { method: "POST" },
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
  mocks.createAiDependencies.mockReturnValue(mocks.aiDeps);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/press/failures/[runId]/retry", () => {
  it("requires steward access and retries the generation run through AI dependencies", async () => {
    mockAccess();
    mocks.retryGenerationFailureRun.mockResolvedValue({
      generation: {
        contentItemId: "replacement-1",
        status: "published",
        title: "Retry landed",
      },
      runId,
      status: "published",
    });

    const response = await POST(request(), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId,
      status: "published",
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
    );
    expect(createAiDependencies).toHaveBeenCalledWith(mocks.db, mocks.env);
    expect(retryGenerationFailureRun).toHaveBeenCalledWith(mocks.aiDeps, {
      leagueId,
      runId,
    });
  });

  it("rejects non-stewards before creating AI dependencies", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires stewardship",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request(), routeContext());

    expect(response.status).toBe(403);
    expect(createAiDependencies).not.toHaveBeenCalled();
    expect(retryGenerationFailureRun).not.toHaveBeenCalled();
  });
});
