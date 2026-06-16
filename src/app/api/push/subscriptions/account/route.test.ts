import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/result";
import { DELETE } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  disablePushSubscriptionsForUser: vi.fn(),
  getDb: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/auth/guards", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("@/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/push/subscriptions", () => ({
  disablePushSubscriptionsForUser: mocks.disablePushSubscriptionsForUser,
}));

const userId = "00000000-0000-4000-8000-000000000001";
const endpoint = "https://push.example.test/account-cleanup";

function request(body?: unknown): Request {
  return new Request("https://rumbledore.test/api/push/subscriptions/account", {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/push/subscriptions/account", () => {
  it("disables the session user's server push rows for supplied endpoints", async () => {
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.requireSession.mockResolvedValue({
      ok: true,
      value: { userId },
    });
    mocks.disablePushSubscriptionsForUser.mockResolvedValue({
      ok: true,
      value: { disabledCount: 2, leagueCount: 2 },
    });

    const response = await DELETE(request({ endpoints: [endpoint] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      disabledCount: 2,
      leagueCount: 2,
    });
    expect(mocks.disablePushSubscriptionsForUser).toHaveBeenCalledWith(
      { db: mocks.db },
      { endpoints: [endpoint], userId },
    );
  });

  it("allows an empty body for account-wide cleanup", async () => {
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.requireSession.mockResolvedValue({
      ok: true,
      value: { userId },
    });
    mocks.disablePushSubscriptionsForUser.mockResolvedValue({
      ok: true,
      value: { disabledCount: 3, leagueCount: 2 },
    });

    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(mocks.disablePushSubscriptionsForUser).toHaveBeenCalledWith(
      { db: mocks.db },
      { endpoints: undefined, userId },
    );
  });

  it("rejects invalid endpoint payloads", async () => {
    mocks.requireSession.mockResolvedValue({
      ok: true,
      value: { userId },
    });

    const response = await DELETE(request({ endpoints: ["not-a-url"] }));

    expect(response.status).toBe(400);
    expect(mocks.disablePushSubscriptionsForUser).not.toHaveBeenCalled();
  });

  it("returns the auth error for logged-out callers", async () => {
    mocks.requireSession.mockResolvedValue({
      error: new AppError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
        status: 401,
      }),
      ok: false,
    });

    const response = await DELETE(request({ endpoints: [endpoint] }));

    expect(response.status).toBe(401);
    expect(mocks.disablePushSubscriptionsForUser).not.toHaveBeenCalled();
  });
});
