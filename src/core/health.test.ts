// @vitest-environment node

import type { AddressInfo } from "node:net";
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkDatabaseRolePrivileges,
  checkInngest,
  checkRealtime,
  type DatabaseRolePrivilegeDetails,
  pingRedis,
  runHealthCheck,
} from "./health";
import { recordApiMetric, resetMetricsForTests } from "./metrics";

let server: net.Server | undefined;

function fixtureValue(...parts: string[]): string {
  return parts.join("-");
}

function dbRoleFixture(
  overrides: Partial<DatabaseRolePrivilegeDetails> = {},
): DatabaseRolePrivilegeDetails {
  const superuser = overrides.superuser ?? false;
  const bypassRls = overrides.bypassRls ?? false;
  return {
    bypassRls,
    enforcement: "report-only",
    roleName: "rumbledore_app",
    safe: !superuser && !bypassRls,
    sessionUser: "rumbledore_app",
    superuser,
    ...overrides,
  };
}

beforeEach(() => {
  resetMetricsForTests();
});

afterEach(async () => {
  if (!server) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
  server = undefined;
});

async function startRedisLikeServer(): Promise<string> {
  server = net.createServer((socket) => {
    socket.once("data", () => {
      socket.write("+PONG\r\n");
      socket.end();
    });
  });

  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `redis://127.0.0.1:${address.port}`;
}

describe("health checks", () => {
  it("reports ok when required checks pass and optional integrations are mocked", async () => {
    recordApiMetric({
      durationMs: 42,
      method: "GET",
      route: "/api/health",
      status: 200,
    });

    const payload = await runHealthCheck({
      checkDb: async () => undefined,
      checkDbRole: async () => dbRoleFixture(),
      checkRedis: async () => undefined,
      now: () => new Date("2026-06-11T12:00:00.000Z"),
    });

    expect(payload).toEqual({
      checkedAt: "2026-06-11T12:00:00.000Z",
      checks: {
        db: { latencyMs: expect.any(Number), mode: "required", status: "ok" },
        dbRole: {
          details: {
            bypassRls: false,
            enforcement: "report-only",
            roleName: "rumbledore_app",
            safe: true,
            sessionUser: "rumbledore_app",
            superuser: false,
          },
          latencyMs: expect.any(Number),
          mode: "required",
          status: "ok",
        },
        inngest: { latencyMs: expect.any(Number), mode: "mock", status: "ok" },
        redis: {
          latencyMs: expect.any(Number),
          mode: "required",
          status: "ok",
        },
        realtime: {
          latencyMs: expect.any(Number),
          mode: "mock",
          status: "ok",
        },
      },
      metrics: {
        api: {
          routes: {
            "GET /api/health": {
              averageDurationMs: 42,
              count: 1,
              errorCount: 0,
              p95DurationMs: 42,
              statusCounts: { "200": 1 },
              successCount: 1,
            },
          },
          total: {
            averageDurationMs: 42,
            count: 1,
            errorCount: 0,
            p95DurationMs: 42,
            statusCounts: { "200": 1 },
            successCount: 1,
          },
        },
        generatedAt: "2026-06-11T12:00:00.000Z",
        jobs: {
          functions: {},
          total: {
            averageDurationMs: 0,
            count: 0,
            errorCount: 0,
            p95DurationMs: 0,
            successCount: 0,
          },
        },
        providerUsage: {
          providers: {},
          total: {
            callCount: 0,
            demotionCount: 0,
            realCallCount: 0,
            totalUnits: 0,
          },
        },
      },
      status: "ok",
    });
  });

  it("reports degraded with per-dependency errors when a check fails", async () => {
    const payload = await runHealthCheck({
      checkDb: async () => undefined,
      checkDbRole: async () => dbRoleFixture(),
      checkRedis: async () => {
        throw new Error("redis unavailable");
      },
    });

    expect(payload.status).toBe("degraded");
    expect(payload.checks.db.status).toBe("ok");
    expect(payload.checks.redis).toMatchObject({
      error: "redis unavailable",
      status: "down",
    });
  });

  it("degrades when configured realtime or Inngest probes fail", async () => {
    const eventFixture = fixtureValue("event", "fixture");
    const jwtFixture = fixtureValue("jwt", "fixture");
    const serviceFixture = fixtureValue("service", "fixture");
    const payload = await runHealthCheck({
      checkDb: async () => undefined,
      checkDbRole: async () => dbRoleFixture(),
      checkInngest: async () => undefined,
      checkRedis: async () => undefined,
      checkRealtime: async () => {
        throw new Error(`serviceRoleKey=${serviceFixture}`);
      },
      inngest: {
        apiBaseUrl: "https://api.inngest.invalid",
        eventApiBaseUrl: "https://inn.gs.invalid",
        eventKey: eventFixture,
        mode: "cloud",
        signingKey: undefined,
        signingKeyFallback: undefined,
      },
      realtime: {
        jwtSecret: jwtFixture,
        mock: false,
        publishableKey: "publishable",
        serviceRoleKey: serviceFixture,
        url: "https://project.supabase.co",
      },
    });

    expect(payload.status).toBe("degraded");
    expect(payload.checks.realtime).toMatchObject({
      error: "serviceRoleKey=[REDACTED]",
      mode: "real",
      status: "down",
    });
    expect(payload.checks.inngest).toMatchObject({
      mode: "cloud",
      status: "ok",
    });
    expect(JSON.stringify(payload)).not.toContain(serviceFixture);
    expect(JSON.stringify(payload)).not.toContain(jwtFixture);
    expect(JSON.stringify(payload)).not.toContain(eventFixture);
  });

  it("reports database role privileges from pg_roles", async () => {
    const execute = vi.fn(async () => ({
      rows: [
        {
          bypass_rls: false,
          role_name: "app_role",
          session_user_name: "app_login",
          superuser: false,
        },
      ],
    }));

    await expect(checkDatabaseRolePrivileges({ execute })).resolves.toEqual({
      bypassRls: false,
      enforcement: "report-only",
      roleName: "app_role",
      safe: true,
      sessionUser: "app_login",
      superuser: false,
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("reports unsafe database roles without degrading outside production", async () => {
    const payload = await runHealthCheck({
      checkDb: async () => undefined,
      checkDbRole: async () =>
        dbRoleFixture({
          roleName: "local_owner",
          safe: false,
          superuser: true,
        }),
      checkRedis: async () => undefined,
      nodeEnv: "development",
    });

    expect(payload.status).toBe("ok");
    expect(payload.checks.dbRole).toMatchObject({
      details: {
        roleName: "local_owner",
        safe: false,
        superuser: true,
      },
      status: "ok",
    });
  });

  it("degrades in production when the database role can bypass RLS", async () => {
    const execute = vi.fn(async () => ({
      rows: [
        {
          bypass_rls: true,
          role_name: "unsafe_app",
          session_user_name: "unsafe_app",
          superuser: false,
        },
      ],
    }));

    const payload = await runHealthCheck({
      checkDb: async () => undefined,
      checkDbRole: () =>
        checkDatabaseRolePrivileges({ execute }, { enforce: true }),
      checkRedis: async () => undefined,
      nodeEnv: "production",
    });

    expect(payload.status).toBe("degraded");
    expect(payload.checks.dbRole).toMatchObject({
      details: {
        bypassRls: true,
        enforcement: "required",
        roleName: "unsafe_app",
        safe: false,
        superuser: false,
      },
      error: expect.stringContaining("BYPASSRLS"),
      status: "down",
    });
  });

  it("pings a Redis-compatible TCP endpoint with RESP PING", async () => {
    const redisUrl = await startRedisLikeServer();

    await expect(pingRedis(redisUrl)).resolves.toBeUndefined();
  });

  it("rejects unsupported Redis URL protocols", async () => {
    await expect(pingRedis("https://redis.example.com")).rejects.toThrow(
      /Unsupported Redis URL protocol/,
    );
  });

  it("probes configured realtime and Inngest endpoints without exposing secrets", async () => {
    const jwtFixture = fixtureValue("jwt", "fixture");
    const serviceFixture = fixtureValue("service", "fixture");
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          status: 204,
        }),
    );

    await checkRealtime(
      {
        jwtSecret: jwtFixture,
        mock: false,
        publishableKey: "publishable",
        serviceRoleKey: serviceFixture,
        url: "https://project.supabase.co/",
      },
      { fetchFn },
    );
    await checkInngest(
      {
        baseUrl: "http://localhost:8288/",
        eventKey: undefined,
        mode: "dev",
        signingKey: undefined,
        signingKeyFallback: undefined,
      },
      { fetchFn },
    );

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      new URL("https://project.supabase.co/realtime/v1/health"),
      expect.objectContaining({
        headers: { apikey: serviceFixture },
        method: "GET",
      }),
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      new URL("http://localhost:8288/"),
      expect.objectContaining({
        method: "GET",
      }),
    );
  });
});
