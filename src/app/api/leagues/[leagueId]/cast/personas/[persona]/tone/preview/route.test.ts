import { afterEach, describe, expect, it, vi } from "vitest";
import { previewPersonaToneProfile } from "@/ai";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  previewPersonaToneProfile: vi.fn(),
  requireLeagueRole: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

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

describe("POST /api/leagues/[leagueId]/cast/personas/[persona]/tone/preview", () => {
  it("requires steward access and renders a mock preview", async () => {
    mockAccess();
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
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
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

  it("rejects non-stewards before preview work", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires stewardship",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(
      request({ toneProfile: toneProfile() }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(previewPersonaToneProfile).not.toHaveBeenCalled();
  });
});
