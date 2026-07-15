import { afterEach, describe, expect, it, vi } from "vitest";
import { editPersonaToneProfile } from "@/ai";
import { requirePlatformAdmin } from "@/auth/guards";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  editPersonaToneProfile: vi.fn(),
  requirePlatformAdmin: vi.fn(),
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
  editPersonaToneProfile: mocks.editPersonaToneProfile,
  parseAiPersona: (value: string) => value,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000003";

function routeContext(persona = "narrator") {
  return { params: Promise.resolve({ leagueId, persona }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/cast/personas/narrator/tone`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function toneProfile() {
  return {
    beats: ["mythology desk"],
    diction: ["chapter"],
    dosAndDonts: ["Do stay grounded."],
    pointOfView: "Editorial and grounded.",
    styleDirectives: ["Open on consequence."],
  };
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

describe("POST /api/leagues/[leagueId]/cast/personas/[persona]/tone", () => {
  it("allows a platform admin to save through the tone editor service", async () => {
    mockAdminAccess();
    mocks.editPersonaToneProfile.mockResolvedValue({
      actionId: "action-1",
      card: { toneVersion: 2 },
      previousToneVersion: 1,
      status: "changed",
    });

    const response = await POST(
      request({
        expectedToneVersion: 1,
        reason: "Sharper.",
        toneProfile: toneProfile(),
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      previousToneVersion: 1,
      status: "changed",
    });
    expect(requirePlatformAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ db: mocks.db }),
    );
    expect(editPersonaToneProfile).toHaveBeenCalledWith(
      { db: mocks.db },
      {
        actorUserId: userId,
        expectedToneVersion: 1,
        leagueId,
        persona: "narrator",
        reason: "Sharper.",
        toneProfile: toneProfile(),
      },
    );
  });

  it("rejects invalid tone profile payloads before saving", async () => {
    mockAdminAccess();

    const response = await POST(
      request({ toneProfile: { beats: [] } }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(editPersonaToneProfile).not.toHaveBeenCalled();
  });

  it("rejects a league commissioner without changing tone config", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      error: new AppError({
        code: "PLATFORM_ADMIN_FORBIDDEN",
        message: "Platform administrator access is required",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(
      request({ toneProfile: toneProfile() }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PLATFORM_ADMIN_FORBIDDEN" },
    });
    expect(editPersonaToneProfile).not.toHaveBeenCalled();
  });
});
