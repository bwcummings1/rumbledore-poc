import { afterEach, describe, expect, it, vi } from "vitest";
import { previewPersonaToneProfile } from "@/ai";
import { requirePlatformAdmin } from "@/auth/guards";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  previewPersonaToneProfile: vi.fn(),
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
  parseAiPersona: (value: string) => value,
  previewPersonaToneProfile: mocks.previewPersonaToneProfile,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000003";

function routeContext(persona = "narrator") {
  return { params: Promise.resolve({ leagueId, persona }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/cast/personas/narrator/tone/preview`,
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

describe("POST /api/leagues/[leagueId]/cast/personas/[persona]/tone/preview", () => {
  it("allows a platform admin to render a mock preview", async () => {
    mockAdminAccess();
    mocks.previewPersonaToneProfile.mockResolvedValue({
      body: "Body",
      promptSectionNames: ["tone"],
      sampleParagraph: "Preview paragraph",
      title: "Preview",
      toneVersion: 2,
    });

    const response = await POST(
      request({ toneProfile: toneProfile() }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sampleParagraph: "Preview paragraph",
      toneVersion: 2,
    });
    expect(requirePlatformAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ db: mocks.db }),
    );
    expect(previewPersonaToneProfile).toHaveBeenCalledWith(
      { db: mocks.db },
      {
        leagueId,
        persona: "narrator",
        toneProfile: toneProfile(),
      },
    );
  });

  it("rejects a league commissioner before generation preview work", async () => {
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
    expect(previewPersonaToneProfile).not.toHaveBeenCalled();
  });
});
