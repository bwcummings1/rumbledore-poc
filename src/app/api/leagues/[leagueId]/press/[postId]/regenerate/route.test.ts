import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiDependencies } from "@/ai/dependencies";
import { requirePlatformAdmin } from "@/auth/guards";
import { regenerateEditorialContentItem } from "@/content/editorial";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  aiDeps: {},
  createAiDependencies: vi.fn(),
  db: {},
  env: {},
  regenerateEditorialContentItem: vi.fn(),
  requirePlatformAdmin: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/core/env", () => ({
  getEnv: () => mocks.env,
}));

vi.mock("@/auth/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/guards")>();
  return {
    ...actual,
    requirePlatformAdmin: mocks.requirePlatformAdmin,
  };
});

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

function mockAdminAccess() {
  mocks.requirePlatformAdmin.mockResolvedValue({
    ok: true,
    value: {
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
  it("allows a platform admin to run regeneration through AI dependencies", async () => {
    mockAdminAccess();
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
    expect(requirePlatformAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ db: mocks.db }),
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
    mockAdminAccess();

    const response = await POST(
      request({ reason: "x".repeat(501) }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(regenerateEditorialContentItem).not.toHaveBeenCalled();
  });

  it("rejects a league commissioner before any generation work", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      error: new AppError({
        code: "PLATFORM_ADMIN_FORBIDDEN",
        message: "Platform administrator access is required",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request({}), routeContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PLATFORM_ADMIN_FORBIDDEN" },
    });
    expect(createAiDependencies).not.toHaveBeenCalled();
    expect(regenerateEditorialContentItem).not.toHaveBeenCalled();
  });
});
