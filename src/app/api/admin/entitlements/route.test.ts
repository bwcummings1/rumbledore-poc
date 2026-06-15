import { afterEach, describe, expect, it, vi } from "vitest";
import { requirePlatformAdmin } from "@/auth/guards";
import { AppError, ok } from "@/core/result";
import { grantEntitlementAsAdmin } from "@/entitlements";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  grantEntitlementAsAdmin: vi.fn(),
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

vi.mock("@/entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entitlements")>();
  return {
    ...actual,
    grantEntitlementAsAdmin: mocks.grantEntitlementAsAdmin,
  };
});

const actorUserId = "00000000-0000-4000-8000-000000000001";
const leagueId = "00000000-0000-4000-8000-000000000002";
const targetUserId = "00000000-0000-4000-8000-000000000003";

function grantRequest(body: unknown): Request {
  return new Request("https://rumbledore.test/api/admin/entitlements", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function mockAdminAccess() {
  mocks.requirePlatformAdmin.mockResolvedValue({
    ok: true,
    value: {
      session: { user: { id: actorUserId } },
      userId: actorUserId,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/entitlements", () => {
  it("requires platform-admin access before granting", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      error: new AppError({
        code: "PLATFORM_ADMIN_FORBIDDEN",
        message: "Platform administrator access is required",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(
      grantRequest({ leagueId, scope: "league", tier: "premium" }),
    );

    expect(response.status).toBe(403);
    expect(grantEntitlementAsAdmin).not.toHaveBeenCalled();
  });

  it("validates the request body after admin access succeeds", async () => {
    mockAdminAccess();

    const response = await POST(
      grantRequest({ leagueId: "not-a-uuid", scope: "league" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_ENTITLEMENT_GRANT" },
    });
    expect(grantEntitlementAsAdmin).not.toHaveBeenCalled();
  });

  it("grants a league entitlement through the admin service", async () => {
    mockAdminAccess();
    mocks.grantEntitlementAsAdmin.mockResolvedValue(
      ok({
        entitlement: {
          id: "00000000-0000-4000-8000-000000000010",
          leagueId,
          tier: "premium",
        },
        event: {
          id: "00000000-0000-4000-8000-000000000011",
          leagueId,
          source: "comp",
        },
        scope: "league",
      }),
    );

    const response = await POST(
      grantRequest({
        capsOverride: { aiPostsPerWeek: 4 },
        expiresAt: "2026-12-31T00:00:00.000Z",
        leagueId,
        reason: "manual comp",
        scope: "league",
        source: "comp",
        tier: "premium",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      entitlement: { leagueId, tier: "premium" },
      scope: "league",
    });
    expect(requirePlatformAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ db: mocks.db }),
    );
    expect(grantEntitlementAsAdmin).toHaveBeenCalledWith(mocks.db, {
      actorUserId,
      capsOverride: { aiPostsPerWeek: 4 },
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      leagueId,
      reason: "manual comp",
      scope: "league",
      source: "comp",
      status: "active",
      tier: "premium",
    });
  });

  it("grants an individual user entitlement through the admin service", async () => {
    mockAdminAccess();
    mocks.grantEntitlementAsAdmin.mockResolvedValue(
      ok({
        entitlement: {
          id: "00000000-0000-4000-8000-000000000012",
          tier: "individual",
          userId: targetUserId,
        },
        event: {
          id: "00000000-0000-4000-8000-000000000013",
          source: "dev",
          userId: targetUserId,
        },
        scope: "user",
      }),
    );

    const response = await POST(
      grantRequest({
        reason: "support grant",
        scope: "user",
        source: "dev",
        userId: targetUserId,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      entitlement: { tier: "individual", userId: targetUserId },
      scope: "user",
    });
    expect(grantEntitlementAsAdmin).toHaveBeenCalledWith(mocks.db, {
      actorUserId,
      expiresAt: null,
      reason: "support grant",
      scope: "user",
      source: "dev",
      status: "active",
      tier: "individual",
      userId: targetUserId,
    });
  });
});
