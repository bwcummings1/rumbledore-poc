import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLeagueRole } from "@/auth/guards";
import { getEnv } from "@/core/env";
import { AppError } from "@/core/result";
import { deleteLeagueWebhook, updateLeagueWebhook } from "@/webhooks";
import { DELETE, PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  db: {},
  deleteLeagueWebhook: vi.fn(),
  env: {
    credentials: { encryptionKey: "route-test-key-12345678901234567890" },
  },
  requireLeagueRole: vi.fn(),
  updateLeagueWebhook: vi.fn(),
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
  deleteLeagueWebhook: mocks.deleteLeagueWebhook,
  updateLeagueWebhook: mocks.updateLeagueWebhook,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const webhookId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function routeContext() {
  return { params: Promise.resolve({ leagueId, webhookId }) };
}

function patchRequest(body: unknown): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/webhooks/${webhookId}`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );
}

function deleteRequest(): Request {
  return new Request(
    `https://rumbledore.test/api/leagues/${leagueId}/webhooks/${webhookId}`,
    { method: "DELETE" },
  );
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

describe("PATCH /api/leagues/[leagueId]/webhooks/[webhookId]", () => {
  it("requires commissioner access and updates through the webhook service", async () => {
    mockAccess();
    mocks.updateLeagueWebhook.mockResolvedValue({
      status: "updated",
      webhook: { id: webhookId, name: "League alerts" },
    });

    const response = await PATCH(
      patchRequest({
        eventSelection: {
          contentSections: ["records"],
          events: ["content.corrected"],
        },
        name: "League alerts",
        status: "disabled",
        targetKind: "generic",
        url: "https://chat.example.test/hooks/rotated",
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "updated",
      webhook: { id: webhookId },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "commissioner" }),
    );
    expect(getEnv).toHaveBeenCalled();
    expect(updateLeagueWebhook).toHaveBeenCalledWith(
      {
        db: mocks.db,
        encryptionKey: mocks.env.credentials.encryptionKey,
      },
      {
        actorUserId: userId,
        eventSelection: {
          contentSections: ["records"],
          events: ["content.corrected"],
        },
        leagueId,
        name: "League alerts",
        status: "disabled",
        targetKind: "generic",
        url: "https://chat.example.test/hooks/rotated",
        webhookId,
      },
    );
  });

  it("maps not-found updates to HTTP 404", async () => {
    mockAccess();
    mocks.updateLeagueWebhook.mockResolvedValue({
      status: "not_found",
      webhook: null,
    });

    const response = await PATCH(
      patchRequest({ name: "Missing target" }),
      routeContext(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_found",
    });
  });

  it("rejects invalid update payloads before service work", async () => {
    mockAccess();

    const response = await PATCH(
      patchRequest({ status: "paused" }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(getEnv).not.toHaveBeenCalled();
    expect(updateLeagueWebhook).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/leagues/[leagueId]/webhooks/[webhookId]", () => {
  it("requires commissioner access and deletes through the webhook service", async () => {
    mockAccess();
    mocks.deleteLeagueWebhook.mockResolvedValue({
      status: "deleted",
      webhook: { id: webhookId, name: "League alerts" },
    });

    const response = await DELETE(deleteRequest(), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "deleted",
      webhook: { id: webhookId },
    });
    expect(requireLeagueRole).toHaveBeenCalledWith(
      expect.objectContaining({ minRole: "commissioner" }),
    );
    expect(getEnv).not.toHaveBeenCalled();
    expect(deleteLeagueWebhook).toHaveBeenCalledWith(
      { db: mocks.db },
      { leagueId, webhookId },
    );
  });

  it("maps not-found deletes to HTTP 404", async () => {
    mockAccess();
    mocks.deleteLeagueWebhook.mockResolvedValue({
      status: "not_found",
      webhook: null,
    });

    const response = await DELETE(deleteRequest(), routeContext());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_found",
    });
  });

  it("rejects non-commissioners before service work", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: new AppError({
        code: "LEAGUE_FORBIDDEN",
        message: "League access requires commissioner access",
        status: 403,
      }),
      ok: false,
    });

    const response = await DELETE(deleteRequest(), routeContext());

    expect(response.status).toBe(403);
    expect(deleteLeagueWebhook).not.toHaveBeenCalled();
  });
});
