import { afterEach, describe, expect, it, vi } from "vitest";
import { rollbackPersonaToneProfile } from "@/ai";
import { requirePlatformAdmin } from "@/auth/guards";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  requirePlatformAdmin: vi.fn(),
  rollbackPersonaToneProfile: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/guards")>();
  return {
    ...actual,
    requirePlatformAdmin: mocks.requirePlatformAdmin,
  };
});

vi.mock("@/ai", () => ({
  parseAiPersona: (value: string) => value,
  rollbackPersonaToneProfile: mocks.rollbackPersonaToneProfile,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000003";

function routeContext(persona = "narrator") {
  return { params: Promise.resolve({ leagueId, persona }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/cast/personas/narrator/tone/rollback`,
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
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/cast/personas/[persona]/tone/rollback", () => {
  it("allows a platform admin to roll back through the tone editor service", async () => {
    mockAdminAccess();
    mocks.rollbackPersonaToneProfile.mockResolvedValue({
      actionId: "action-1",
      card: { toneVersion: 3 },
      previousToneVersion: 2,
      status: "changed",
    });

    const response = await POST(
      request({ reason: "Return.", toneVersion: 1 }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      previousToneVersion: 2,
      status: "changed",
    });
    expect(requirePlatformAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ db: mocks.db }),
    );
    expect(rollbackPersonaToneProfile).toHaveBeenCalledWith(
      { db: mocks.db },
      {
        actorUserId: userId,
        leagueId,
        persona: "narrator",
        reason: "Return.",
        toneVersion: 1,
      },
    );
  });

  it("rejects invalid rollback targets before service work", async () => {
    mockAdminAccess();

    const response = await POST(request({ toneVersion: 0 }), routeContext());

    expect(response.status).toBe(400);
    expect(rollbackPersonaToneProfile).not.toHaveBeenCalled();
  });

  it("rejects a league commissioner without rolling tone config back", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      error: new AppError({
        code: "PLATFORM_ADMIN_FORBIDDEN",
        message: "Platform administrator access is required",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request({ toneVersion: 1 }), routeContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PLATFORM_ADMIN_FORBIDDEN" },
    });
    expect(rollbackPersonaToneProfile).not.toHaveBeenCalled();
  });
});
