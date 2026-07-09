import { afterEach, describe, expect, it, vi } from "vitest";
import { rollbackPersonaToneProfile } from "@/ai";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  requireLeagueRole: vi.fn(),
  rollbackPersonaToneProfile: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

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

describe("POST /api/leagues/[leagueId]/cast/personas/[persona]/tone/rollback", () => {
  it("requires steward access and rolls back through the tone editor service", async () => {
    mockAccess();
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
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
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
    mockAccess();

    const response = await POST(request({ toneVersion: 0 }), routeContext());

    expect(response.status).toBe(400);
    expect(rollbackPersonaToneProfile).not.toHaveBeenCalled();
  });

  it("rejects non-stewards before rollback work", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires stewardship",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request({ toneVersion: 1 }), routeContext());

    expect(response.status).toBe(403);
    expect(rollbackPersonaToneProfile).not.toHaveBeenCalled();
  });
});
