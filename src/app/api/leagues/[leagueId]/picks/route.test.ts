import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { submitPick } from "@/betting/pickem";
import { AppError } from "@/core/result";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  requireLeagueRole: vi.fn(),
  submitPick: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/betting/pickem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/betting/pickem")>();
  return {
    ...actual,
    submitPick: mocks.submitPick,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const snapshotId = "00000000-0000-4000-8000-000000000003";
const pickWeekId = "00000000-0000-4000-8000-000000000004";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function pickRequest(body: unknown): Request {
  return new Request(`https://rumbledore.test/api/leagues/${leagueId}/picks`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: "pick-once",
    oddsSnapshotId: snapshotId,
    pickWeekId,
    selection: "home",
    ...overrides,
  };
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

function mockSubmit(deduplicated = false) {
  mocks.submitPick.mockResolvedValue({
    deduplicated,
    pickId: "00000000-0000-4000-8000-000000000005",
    remainingPicks: 9,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/picks", () => {
  it("authorizes league membership and submits the parsed pick", async () => {
    mockAccess();
    mockSubmit();

    const response = await POST(pickRequest(validBody()), routeContext());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      deduplicated: false,
      pickId: "00000000-0000-4000-8000-000000000005",
      remainingPicks: 9,
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ db: mocks.db, leagueId, minRole: "member" }),
    );
  });

  it("takes the user id from the session, never from the request body", async () => {
    // A member who could name the userId could submit picks as a rival and
    // poison their accuracy. The body value must be ignored entirely.
    mockAccess();
    mockSubmit();

    await POST(
      pickRequest(
        validBody({ userId: "00000000-0000-4000-8000-0000000000ff" }),
      ),
      routeContext(),
    );

    expect(submitPick).toHaveBeenCalledWith(mocks.db, {
      idempotencyKey: "pick-once",
      leagueId,
      oddsSnapshotId: snapshotId,
      pickWeekId,
      selection: "home",
      userId,
    });
  });

  it("answers 200 rather than 201 when a retry is deduplicated", async () => {
    // The client uses the status to tell a fresh submission from a replayed
    // one; collapsing both to 201 would let a retry double-count in the UI.
    mockAccess();
    mockSubmit(true);

    const response = await POST(pickRequest(validBody()), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deduplicated: true,
    });
  });

  it("rejects malformed bodies before touching the domain", async () => {
    mockAccess();

    const response = await POST(
      pickRequest(validBody({ idempotencyKey: "", selection: "sideways" })),
      routeContext(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_PICK_REQUEST" },
    });
    expect(submitPick).not.toHaveBeenCalled();
  });

  it("preserves domain refusals instead of flattening them to 500s", async () => {
    // The kickoff lock is a 409. Reporting it as a 500 would read as an outage
    // and invite the client to retry a pick the server will never accept.
    mockAccess();
    mocks.submitPick.mockRejectedValue(
      new AppError({
        code: "PICK_EVENT_STARTED",
        message: "This game has already started",
        status: 409,
      }),
    );

    const response = await POST(pickRequest(validBody()), routeContext());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PICK_EVENT_STARTED" },
    });
  });

  it("returns guard errors without submitting anything", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires membership",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(pickRequest(validBody()), routeContext());

    expect(response.status).toBe(403);
    expect(submitPick).not.toHaveBeenCalled();
  });
});
