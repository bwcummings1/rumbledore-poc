import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import { pushAllCurationSeasons, pushCurationSeason } from "@/stats";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  pushAllCurationSeasons: vi.fn(),
  pushCurationSeason: vi.fn(),
  requireLeagueRole: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/stats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stats")>();
  return {
    ...actual,
    pushAllCurationSeasons: mocks.pushAllCurationSeasons,
    pushCurationSeason: mocks.pushCurationSeason,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const checkpointId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/curation/push`,
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

describe("POST /api/leagues/[leagueId]/curation/push", () => {
  it("pushes one season from a saved checkpoint", async () => {
    mockAccess();
    mocks.pushCurationSeason.mockResolvedValue({
      checkpointId,
      id: "00000000-0000-4000-8000-000000000004",
      season: 2012,
    });

    const response = await POST(
      request({
        action: "push",
        checkpointId,
        reason: "2012 verified",
        season: 2012,
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      push: { checkpointId, season: 2012 },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "data_steward" }),
    );
    expect(pushCurationSeason).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      checkpointId,
      leagueId,
      reason: "2012 verified",
      season: 2012,
    });
    expect(pushAllCurationSeasons).not.toHaveBeenCalled();
  });

  it("pushes all seasons from the latest saved checkpoint", async () => {
    mockAccess();
    mocks.pushAllCurationSeasons.mockResolvedValue([
      { season: 2011 },
      { season: 2012 },
    ]);

    const response = await POST(
      request({ action: "pushAll", reason: "all verified" }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pushes: [{ season: 2011 }, { season: 2012 }],
    });
    expect(pushAllCurationSeasons).toHaveBeenCalledWith(mocks.db, {
      actorUserId: userId,
      checkpointId: undefined,
      leagueId,
      reason: "all verified",
    });
  });

  it("rejects invalid push payloads", async () => {
    mockAccess();

    const response = await POST(
      request({ action: "push", season: 1800 }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(pushCurationSeason).not.toHaveBeenCalled();
    expect(pushAllCurationSeasons).not.toHaveBeenCalled();
  });

  it("returns role guard errors before pushing", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires stewardship",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(
      request({ action: "push", season: 2012 }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(pushCurationSeason).not.toHaveBeenCalled();
    expect(pushAllCurationSeasons).not.toHaveBeenCalled();
  });
});
