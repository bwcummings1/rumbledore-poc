import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { placeBetSlip } from "@/betting/placement";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  placeBetSlip: vi.fn(),
  requireLeagueRole: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/betting/placement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/betting/placement")>();
  return {
    ...actual,
    placeBetSlip: mocks.placeBetSlip,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const snapshotId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function placeRequest(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/bet/slips`,
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

function mockPlacement(reused = false) {
  mocks.placeBetSlip.mockResolvedValue({
    legs: [],
    reused,
    slip: {
      id: "00000000-0000-4000-8000-000000000004",
      kind: "single",
      placedAt: new Date("2026-09-07T16:15:00.000Z"),
      potentialPayoutCents: 9_000,
      stakeCents: 5_000,
      status: "pending",
    },
    stakeLedgerEntry: {
      runningBalanceCents: 995_000,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/bet/slips", () => {
  it("authorizes league membership and places the parsed slip", async () => {
    mockAccess();
    mockPlacement();

    const response = await POST(
      placeRequest({
        idempotencyKey: "place-once",
        kind: "single",
        legs: [{ oddsSnapshotId: snapshotId, selection: "home" }],
        stakeCents: 5_000,
      }),
      routeContext(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      balanceCents: 995_000,
      reused: false,
      slip: {
        id: "00000000-0000-4000-8000-000000000004",
        kind: "single",
        potentialPayoutCents: 9_000,
        stakeCents: 5_000,
        status: "pending",
      },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.db,
        leagueId,
        minRole: "member",
      }),
    );
    expect(placeBetSlip).toHaveBeenCalledWith(mocks.db, {
      idempotencyKey: "place-once",
      kind: "single",
      leagueId,
      legs: [{ oddsSnapshotId: snapshotId, selection: "home" }],
      stakeCents: 5_000,
      userId,
    });
  });

  it("returns 200 when placement reuses an idempotency key", async () => {
    mockAccess();
    mockPlacement(true);

    const response = await POST(
      placeRequest({
        idempotencyKey: "place-once",
        kind: "single",
        legs: [{ oddsSnapshotId: snapshotId, selection: "home" }],
        stakeCents: 5_000,
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ reused: true });
  });

  it("rejects malformed request bodies before placement", async () => {
    mockAccess();

    const response = await POST(
      placeRequest({
        idempotencyKey: "",
        kind: "single",
        legs: [],
        stakeCents: -1,
      }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_BET_SLIP_REQUEST" },
    });
    expect(placeBetSlip).not.toHaveBeenCalled();
  });

  it("maps placement AppErrors without converting them to 500s", async () => {
    mockAccess();
    mocks.placeBetSlip.mockRejectedValue(
      new AppError({
        code: "BET_ODDS_STALE",
        message: "Selected odds are no longer the latest available price",
        status: 409,
      }),
    );

    const response = await POST(
      placeRequest({
        idempotencyKey: "stale",
        kind: "single",
        legs: [{ oddsSnapshotId: snapshotId, selection: "home" }],
        stakeCents: 5_000,
      }),
      routeContext(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BET_ODDS_STALE" },
    });
  });

  it("returns auth guard errors before reading placement", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(
      placeRequest({
        idempotencyKey: "place-once",
        kind: "single",
        legs: [{ oddsSnapshotId: snapshotId, selection: "home" }],
        stakeCents: 5_000,
      }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(placeBetSlip).not.toHaveBeenCalled();
  });
});
