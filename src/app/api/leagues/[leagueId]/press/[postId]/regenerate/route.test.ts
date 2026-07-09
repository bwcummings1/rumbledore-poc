import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiDependencies } from "@/ai/dependencies";
import { requireLeagueRole } from "@/auth/guards";
import { regenerateEditorialContentItem } from "@/content/editorial";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  aiDeps: {},
  createAiDependencies: vi.fn(),
  db: {},
  env: {},
  regenerateEditorialContentItem: vi.fn(),
  requireLeagueRole: vi.fn(),
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

vi.mock("@/content/editorial", () => ({
  regenerateEditorialContentItem: mocks.regenerateEditorialContentItem,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId, postId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/press/${postId}/regenerate`,
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
  mocks.createAiDependencies.mockReturnValue(mocks.aiDeps);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/press/[postId]/regenerate", () => {
  it("requires steward access and runs regeneration through AI dependencies", async () => {
    mockAccess();
    mocks.regenerateEditorialContentItem.mockResolvedValue({
      actionId: "action-1",
      generation: { status: "published", contentItemId: "replacement-1" },
      originalContentItemId: postId,
      replacementContentItemId: "replacement-1",
      status: "published",
    });

    const response = await POST(
      request({ reason: "Sharper correction." }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      replacementContentItemId: "replacement-1",
      status: "published",
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
    );
    expect(createAiDependencies).toHaveBeenCalledWith(mocks.db, mocks.env);
    expect(regenerateEditorialContentItem).toHaveBeenCalledWith(mocks.aiDeps, {
      actorUserId: userId,
      contentItemId: postId,
      leagueId,
      reason: "Sharper correction.",
    });
  });

  it("rejects oversized reasons before regeneration", async () => {
    mockAccess();

    const response = await POST(
      request({ reason: "x".repeat(501) }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(regenerateEditorialContentItem).not.toHaveBeenCalled();
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

    const response = await POST(request({}), routeContext());

    expect(response.status).toBe(403);
    expect(createAiDependencies).not.toHaveBeenCalled();
    expect(regenerateEditorialContentItem).not.toHaveBeenCalled();
  });
});
