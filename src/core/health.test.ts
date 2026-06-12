// @vitest-environment node

import type { AddressInfo } from "node:net";
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkInngest,
  checkRealtime,
  pingRedis,
  runHealthCheck,
} from "./health";
import { recordApiMetric, resetMetricsForTests } from "./metrics";

let server: net.Server | undefined;

function fixtureValue(...parts: string[]): string {
  return parts.join("-");
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
      checkRedis: async () => undefined,
      now: () => new Date("2026-06-11T12:00:00.000Z"),
    });

    expect(payload).toEqual({
      checkedAt: "2026-06-11T12:00:00.000Z",
      checks: {
        db: { latencyMs: expect.any(Number), mode: "required", status: "ok" },
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
      },
      status: "ok",
    });
  });

  it("reports degraded with per-dependency errors when a check fails", async () => {
    const payload = await runHealthCheck({
      checkDb: async () => undefined,
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
