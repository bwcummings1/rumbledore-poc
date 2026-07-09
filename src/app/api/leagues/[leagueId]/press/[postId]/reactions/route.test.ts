import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { setContentReaction } from "@/content/reactions";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  requireLeagueRole: vi.fn(),
  setContentReaction: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/content/reactions", () => ({
  setContentReaction: mocks.setContentReaction,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId, postId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/press/${postId}/reactions`,
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
      role: "member",
      session: { user: { id: userId } },
      userId,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/press/[postId]/reactions", () => {
  it("requires member access and records the requested reaction", async () => {
    mockAccess();
    mocks.setContentReaction.mockResolvedValue({
      counts: [],
      currentEmoji: "fire",
      total: 1,
    });

    const response = await POST(request({ emoji: "fire" }), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      currentEmoji: "fire",
      total: 1,
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "member" }),
    );
    expect(setContentReaction).toHaveBeenCalledWith(
      { db: mocks.db },
      {
        contentItemId: postId,
        emoji: "fire",
        leagueId,
        userId,
      },
    );
  });

  it("rejects unsupported reaction emoji before mutation", async () => {
    mockAccess();

    const response = await POST(request({ emoji: "heart" }), routeContext());

    expect(response.status).toBe(400);
    expect(setContentReaction).not.toHaveBeenCalled();
  });

  it("returns role guard errors before mutation", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request({ emoji: "fire" }), routeContext());

    expect(response.status).toBe(403);
    expect(setContentReaction).not.toHaveBeenCalled();
  });
});
