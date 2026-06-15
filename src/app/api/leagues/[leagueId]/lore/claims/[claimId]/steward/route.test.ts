import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { stewardLoreClaim } from "@/lore";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn() },
  getEnv: vi.fn(),
  getLoreClaimCard: vi.fn(),
  push: { notifyLeague: vi.fn() },
  requireLeagueRole: vi.fn(),
  realtime: { publishLeagueLoreCanonized: vi.fn() },
  createPushNotifier: vi.fn(),
  createRealtimePublisher: vi.fn(),
  stewardLoreClaim: vi.fn(),
}));

vi.mock("@/core/env", () => ({
  getEnv: mocks.getEnv,
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/realtime", () => ({
  createRealtimePublisher: mocks.createRealtimePublisher,
}));

vi.mock("@/push", () => ({
  PUSH_EVENTS: {
    leagueLoreCanonized: "league.lore.canonized",
    leagueLoreVoteOpened: "league.lore.vote.opened",
  },
  createPushNotifier: mocks.createPushNotifier,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/lore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lore")>();
  return {
    ...actual,
    stewardLoreClaim: mocks.stewardLoreClaim,
  };
});

vi.mock("@/lore/member-experience", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lore/member-experience")>();
  return {
    ...actual,
    getLoreClaimCard: mocks.getLoreClaimCard,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const claimId = "00000000-0000-4000-8000-000000000004";

function routeContext() {
  return { params: Promise.resolve({ claimId, leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/lore/claims/${claimId}/steward`,
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

function mockMembership() {
  const limit = vi.fn().mockResolvedValue([{ id: memberId }]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.db.select.mockReturnValue({ from });
}

beforeEach(() => {
  mocks.getEnv.mockReturnValue({ realtime: { mock: true } });
  mocks.createPushNotifier.mockReturnValue(mocks.push);
  mocks.createRealtimePublisher.mockReturnValue(mocks.realtime);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/lore/claims/[claimId]/steward", () => {
  it("requires steward access and applies audited lore adjudication", async () => {
    mockAccess();
    mockMembership();
    mocks.stewardLoreClaim.mockResolvedValue({
      claimId,
      ratifiedBy: "steward",
      status: "canonized",
    });
    mocks.getLoreClaimCard.mockResolvedValue({
      id: claimId,
      status: "canon",
      title: "Worst collapse",
    });

    const response = await POST(
      request({
        action: "ratify",
        reason: "Affirm leads and quorum is short by one absent manager.",
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      claim: { id: claimId, status: "canon" },
      result: {
        claimId,
        ratifiedBy: "steward",
        status: "canonized",
      },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.db,
        leagueId,
        minRole: "data_steward",
      }),
    );
    expect(stewardLoreClaim).toHaveBeenCalledWith({
      deps: { db: mocks.db, push: mocks.push, realtime: mocks.realtime },
      input: {
        action: "ratify",
        actorMemberId: memberId,
        claimId,
        leagueId,
        reason: "Affirm leads and quorum is short by one absent manager.",
      },
    });
  });

  it("serializes extension close times", async () => {
    mockAccess();
    mockMembership();
    mocks.stewardLoreClaim.mockResolvedValue({
      claimId,
      status: "extended",
      voteClosesAt: new Date("2026-06-29T12:00:00.000Z"),
    });
    mocks.getLoreClaimCard.mockResolvedValue({
      id: claimId,
      status: "vote",
      title: "Worst collapse",
    });

    const response = await POST(
      request({
        action: "extend",
        reason: "Give absent managers one more week.",
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        claimId,
        status: "extended",
        voteClosesAt: "2026-06-29T12:00:00.000Z",
      },
    });
  });

  it("rejects malformed steward payloads before member lookup", async () => {
    mockAccess();

    const response = await POST(
      request({ action: "ratify", reason: "" }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_LORE_STEWARD_REQUEST" },
    });
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(stewardLoreClaim).not.toHaveBeenCalled();
  });
});
