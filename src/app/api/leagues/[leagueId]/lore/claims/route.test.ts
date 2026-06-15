import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { submitLoreClaim } from "@/lore";
import { getLoreClaimVerificationSummary } from "@/lore/member-experience";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn() },
  getLoreClaimVerificationSummary: vi.fn(),
  requireLeagueRole: vi.fn(),
  submitLoreClaim: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/lore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lore")>();
  return {
    ...actual,
    submitLoreClaim: mocks.submitLoreClaim,
  };
});

vi.mock("@/lore/member-experience", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lore/member-experience")>();
  return {
    ...actual,
    getLoreClaimVerificationSummary: mocks.getLoreClaimVerificationSummary,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const personId = "00000000-0000-4000-8000-000000000004";
const claimId = "00000000-0000-4000-8000-000000000005";
const threadRootId = "00000000-0000-4000-8000-000000000006";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/lore/claims`,
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

function mockMembership() {
  const limit = vi.fn().mockResolvedValue([{ id: memberId }]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.db.select.mockReturnValue({ from });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/lore/claims", () => {
  it("submits an opinion claim as the caller's league member", async () => {
    const voteClosesAt = new Date("2026-06-22T12:00:00.000Z");
    mockAccess();
    mockMembership();
    mocks.submitLoreClaim.mockResolvedValue({
      claimId,
      kind: "opinion",
      status: "vote",
      threadRootId,
      verification: "n_a",
      voteClosesAt,
    });
    mocks.getLoreClaimVerificationSummary.mockResolvedValue(null);

    const response = await POST(
      request({
        body: "This trade lives in shame.",
        subjects: [{ personId, subjectType: "person" }],
        title: "Worst trade ever",
      }),
      routeContext(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      claimId,
      kind: "opinion",
      status: "vote",
      verification: "n_a",
      voteClosesAt: "2026-06-22T12:00:00.000Z",
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.db,
        leagueId,
        minRole: "member",
      }),
    );
    expect(submitLoreClaim).toHaveBeenCalledWith({
      deps: { db: mocks.db },
      input: expect.objectContaining({
        authorMemberId: memberId,
        body: "This trade lives in shame.",
        leagueId,
        origin: "member",
        subjects: [{ personId, subjectType: "person" }],
        title: "Worst trade ever",
      }),
    });
  });

  it("passes structured data assertions through to the lore engine", async () => {
    mockAccess();
    mockMembership();
    mocks.submitLoreClaim.mockResolvedValue({
      claimId,
      kind: "data_verifiable",
      ratifiedBy: "verified",
      status: "canonized",
      threadRootId,
      verification: "verified",
    });
    mocks.getLoreClaimVerificationSummary.mockResolvedValue({
      actualValue: "200.4",
      assertedValue: "200.4",
      result: "match",
    });

    const response = await POST(
      request({
        assertions: [
          {
            assertedValue: 200.4,
            metric: "points_for",
            personId,
            scoringPeriod: 5,
            season: 2025,
            source: "weekly_statistics",
          },
        ],
        body: "The 200-point week is real.",
        title: "Week 5 nuclear score",
      }),
      routeContext(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      kind: "data_verifiable",
      status: "canonized",
      verification: "verified",
      verificationResult: {
        actualValue: "200.4",
        assertedValue: "200.4",
        result: "match",
      },
    });
    expect(submitLoreClaim).toHaveBeenCalledWith({
      deps: { db: mocks.db },
      input: expect.objectContaining({
        assertions: [
          {
            assertedValue: 200.4,
            metric: "points_for",
            personId,
            scoringPeriod: 5,
            season: 2025,
            source: "weekly_statistics",
          },
        ],
        authorMemberId: memberId,
        leagueId,
      }),
    });
    expect(getLoreClaimVerificationSummary).toHaveBeenCalledWith(mocks.db, {
      claimId,
      leagueId,
    });
  });

  it("rejects malformed payloads before resolving membership", async () => {
    mockAccess();

    const response = await POST(
      request({ body: "", title: "" }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_LORE_CLAIM_REQUEST" },
    });
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(submitLoreClaim).not.toHaveBeenCalled();
  });

  it("returns auth guard errors before submission", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(
      request({ body: "Nope", title: "No access" }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(submitLoreClaim).not.toHaveBeenCalled();
  });
});
