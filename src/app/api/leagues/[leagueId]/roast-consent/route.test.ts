import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { setLeagueRoastConsent } from "@/members/roast-consent";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  requireLeagueRole: vi.fn(),
  setLeagueRoastConsent: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/members/roast-consent", () => ({
  setLeagueRoastConsent: mocks.setLeagueRoastConsent,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const fantasyMemberId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/roast-consent`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function mockAccess(role: "commissioner" | "member" = "commissioner") {
  mocks.requireLeagueRole.mockResolvedValue({
    ok: true,
    value: {
      leagueId,
      role,
      session: { user: { id: userId } },
      userId,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/roast-consent", () => {
  it("requires member access and updates self consent", async () => {
    mockAccess("member");
    mocks.setLeagueRoastConsent.mockResolvedValue({
      roastLevel: "off_limits",
      status: "changed",
      target: { kind: "self" },
    });

    const response = await POST(
      request({ roastLevel: "off_limits", target: { kind: "self" } }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      roastLevel: "off_limits",
      status: "changed",
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "member" }),
    );
    expect(setLeagueRoastConsent).toHaveBeenCalledWith(
      { db: mocks.db },
      {
        actorRole: "member",
        actorUserId: userId,
        leagueId,
        roastLevel: "off_limits",
        target: { kind: "self" },
      },
    );
  });

  it("passes commissioner unclaimed-member updates to the service boundary", async () => {
    mockAccess("commissioner");
    mocks.setLeagueRoastConsent.mockResolvedValue({
      roastLevel: "full_send",
      status: "changed",
      target: { fantasyMemberId, kind: "fantasy_member" },
    });

    const response = await POST(
      request({
        roastLevel: "full_send",
        target: { fantasyMemberId, kind: "fantasy_member" },
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(setLeagueRoastConsent).toHaveBeenCalledWith(
      { db: mocks.db },
      expect.objectContaining({
        actorRole: "commissioner",
        roastLevel: "full_send",
        target: { fantasyMemberId, kind: "fantasy_member" },
      }),
    );
  });

  it("rejects malformed targets before mutation", async () => {
    mockAccess();

    const response = await POST(
      request({
        roastLevel: "off_limits",
        target: { fantasyMemberId: "bad", kind: "fantasy_member" },
      }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(setLeagueRoastConsent).not.toHaveBeenCalled();
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

    const response = await POST(
      request({ roastLevel: "off_limits", target: { kind: "self" } }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(setLeagueRoastConsent).not.toHaveBeenCalled();
  });
});
