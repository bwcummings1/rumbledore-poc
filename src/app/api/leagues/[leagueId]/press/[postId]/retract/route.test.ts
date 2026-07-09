import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { retractEditorialContentItem } from "@/content/editorial";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  createPushNotifier: vi.fn(),
  createRealtimePublisher: vi.fn(),
  db: {},
  env: {},
  push: {},
  realtime: {},
  requireLeagueRole: vi.fn(),
  retractEditorialContentItem: vi.fn(),
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

vi.mock("@/push", () => ({
  createPushNotifier: mocks.createPushNotifier,
}));

vi.mock("@/realtime", () => ({
  createRealtimePublisher: mocks.createRealtimePublisher,
}));

vi.mock("@/content/editorial", () => ({
  retractEditorialContentItem: mocks.retractEditorialContentItem,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId, postId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/press/${postId}/retract`,
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
  mocks.createPushNotifier.mockReturnValue(mocks.push);
  mocks.createRealtimePublisher.mockReturnValue(mocks.realtime);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/press/[postId]/retract", () => {
  it("requires steward access and records a reasoned retraction", async () => {
    mockAccess();
    mocks.retractEditorialContentItem.mockResolvedValue({
      actionId: "action-1",
      contentItemId: postId,
      reason: "Wrong result.",
      status: "changed",
      transition: { contentItemId: postId, status: "changed" },
    });

    const response = await POST(
      request({ reason: "Wrong result." }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      actionId: "action-1",
      status: "changed",
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
    );
    expect(retractEditorialContentItem).toHaveBeenCalledWith(
      {
        db: mocks.db,
        push: mocks.push,
        realtime: mocks.realtime,
      },
      {
        actorUserId: userId,
        contentItemId: postId,
        leagueId,
        reason: "Wrong result.",
      },
    );
  });

  it("rejects missing reasons before mutating content", async () => {
    mockAccess();

    const response = await POST(request({ reason: "" }), routeContext());

    expect(response.status).toBe(400);
    expect(retractEditorialContentItem).not.toHaveBeenCalled();
  });

  it("rejects non-stewards before body effects", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(
      request({ reason: "Wrong result." }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(retractEditorialContentItem).not.toHaveBeenCalled();
  });
});
