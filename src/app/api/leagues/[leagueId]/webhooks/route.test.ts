import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { getEnv } from "@/core/env";
import { AppError } from "@/core/result";
import { createLeagueWebhook } from "@/webhooks";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  createLeagueWebhook: vi.fn(),
  db: {},
  env: {
    credentials: { encryptionKey: "route-test-key-12345678901234567890" },
  },
  requireLeagueRole: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/core/env", () => ({
  getEnv: vi.fn(() => mocks.env),
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/webhooks", () => ({
  createLeagueWebhook: mocks.createLeagueWebhook,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId }) };
}

function request(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/webhooks`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    eventSelection: {
      contentSections: ["recaps"],
      events: ["content.published"],
    },
    name: "League Discord",
    targetKind: "discord",
    url: "https://discord.com/api/webhooks/fixture",
    ...overrides,
  };
}

function mockAccess() {
  mocks.requireLeagueRole.mockResolvedValue({
    ok: true,
    value: {
      leagueId,
      role: "commissioner",
      session: { user: { id: userId } },
      userId,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/leagues/[leagueId]/webhooks", () => {
  it("requires commissioner access and creates with the encrypted credential key", async () => {
    mockAccess();
    mocks.createLeagueWebhook.mockResolvedValue({
      status: "created",
      webhook: { id: "webhook-1", name: "League Discord" },
    });

    const response = await POST(request(payload()), routeContext());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      status: "created",
      webhook: { id: "webhook-1" },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "commissioner" }),
    );
    expect(getEnv).toHaveBeenCalled();
    expect(createLeagueWebhook).toHaveBeenCalledWith(
      {
        db: mocks.db,
        encryptionKey: mocks.env.credentials.encryptionKey,
      },
      {
        actorUserId: userId,
        eventSelection: {
          contentSections: ["recaps"],
          events: ["content.published"],
        },
        leagueId,
        name: "League Discord",
        targetKind: "discord",
        url: "https://discord.com/api/webhooks/fixture",
      },
    );
  });

  it("rejects invalid payloads before reading secrets or saving", async () => {
    mockAccess();

    const response = await POST(
      request(payload({ url: "not a webhook URL" })),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(getEnv).not.toHaveBeenCalled();
    expect(createLeagueWebhook).not.toHaveBeenCalled();
  });

  it("rejects non-commissioners before body effects", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires commissioner access",
        status: 403,
      }),
      ok: false,
    });

    const response = await POST(request(payload()), routeContext());

    expect(response.status).toBe(403);
    expect(getEnv).not.toHaveBeenCalled();
    expect(createLeagueWebhook).not.toHaveBeenCalled();
  });
});
