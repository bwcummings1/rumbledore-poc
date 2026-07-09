import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/result";
import { PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  getDb: vi.fn(),
  requireSession: vi.fn(),
  setNotificationChannelPreference: vi.fn(),
  setPushNotificationPreference: vi.fn(),
}));

vi.mock("@/auth/guards", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("@/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/push", () => ({
  NOTIFICATION_CHANNEL_VALUES: ["push", "digest", "none"],
  NOTIFICATION_EVENT_FAMILY_VALUES: ["content", "lore", "bets", "arena"],
  PUSH_EVENT_VALUES: [
    "league.bet.settled",
    "league.blog.published",
    "league.lore.vote.opened",
    "league.lore.canonized",
    "arena.rival.passed",
    "content.retracted",
    "content.superseded",
  ],
  setNotificationChannelPreference: mocks.setNotificationChannelPreference,
  setPushNotificationPreference: mocks.setPushNotificationPreference,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function request(body: unknown): Request {
  return new Request("https://rumbledore.test/api/push/preferences", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/push/preferences", () => {
  it("writes a membership-guarded channel preference for the session user", async () => {
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.requireSession.mockResolvedValue({
      ok: true,
      value: { userId },
    });
    mocks.setNotificationChannelPreference.mockResolvedValue({
      ok: true,
      value: {
        channel: "digest",
        enabled: true,
        eventFamily: "content",
        id: "pref-1",
        leagueId,
        type: "league.blog.published",
        userId,
      },
    });

    const response = await PATCH(
      request({
        channel: "digest",
        eventFamily: "content",
        leagueId,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      channel: "digest",
      eventFamily: "content",
      leagueId,
      userId,
    });
    expect(mocks.setNotificationChannelPreference).toHaveBeenCalledWith(
      { db: mocks.db },
      {
        channel: "digest",
        eventFamily: "content",
        leagueId,
        userId,
      },
    );
    expect(mocks.setPushNotificationPreference).not.toHaveBeenCalled();
  });

  it("keeps legacy push event preference payloads compatible", async () => {
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.requireSession.mockResolvedValue({
      ok: true,
      value: { userId },
    });
    mocks.setPushNotificationPreference.mockResolvedValue({
      ok: true,
      value: {
        channel: "none",
        enabled: false,
        eventFamily: "arena",
        id: "pref-1",
        leagueId,
        type: "arena.rival.passed",
        userId,
      },
    });

    const response = await PATCH(
      request({
        enabled: false,
        leagueId,
        type: "arena.rival.passed",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      enabled: false,
      leagueId,
      type: "arena.rival.passed",
      userId,
    });
    expect(mocks.setPushNotificationPreference).toHaveBeenCalledWith(
      { db: mocks.db },
      {
        enabled: false,
        leagueId,
        type: "arena.rival.passed",
        userId,
      },
    );
    expect(mocks.setNotificationChannelPreference).not.toHaveBeenCalled();
  });

  it("rejects unknown channel preferences", async () => {
    mocks.requireSession.mockResolvedValue({
      ok: true,
      value: { userId },
    });

    const response = await PATCH(
      request({
        channel: "sms",
        eventFamily: "content",
        leagueId,
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.setNotificationChannelPreference).not.toHaveBeenCalled();
    expect(mocks.setPushNotificationPreference).not.toHaveBeenCalled();
  });

  it("rejects unknown push event types", async () => {
    mocks.requireSession.mockResolvedValue({
      ok: true,
      value: { userId },
    });

    const response = await PATCH(
      request({
        enabled: false,
        leagueId,
        type: "unknown.event",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.setNotificationChannelPreference).not.toHaveBeenCalled();
    expect(mocks.setPushNotificationPreference).not.toHaveBeenCalled();
  });

  it("returns the auth error for logged-out callers", async () => {
    mocks.requireSession.mockResolvedValue({
      error: new AppError({
        code: "UNAUTHENTICATED",
        message: "Sign in required",
        status: 401,
      }),
      ok: false,
    });

    const response = await PATCH(
      request({
        enabled: true,
        leagueId,
        type: "league.blog.published",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.setNotificationChannelPreference).not.toHaveBeenCalled();
    expect(mocks.setPushNotificationPreference).not.toHaveBeenCalled();
  });
});
