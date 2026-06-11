// @vitest-environment node

import type { AddressInfo } from "node:net";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { pingRedis, runHealthCheck } from "./health";

let server: net.Server | undefined;

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
  it("reports ok when db and redis checks pass", async () => {
    const payload = await runHealthCheck({
      checkDb: async () => undefined,
      checkRedis: async () => undefined,
      now: () => new Date("2026-06-11T12:00:00.000Z"),
    });

    expect(payload).toEqual({
      checkedAt: "2026-06-11T12:00:00.000Z",
      checks: {
        db: { latencyMs: expect.any(Number), status: "ok" },
        redis: { latencyMs: expect.any(Number), status: "ok" },
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

  it("pings a Redis-compatible TCP endpoint with RESP PING", async () => {
    const redisUrl = await startRedisLikeServer();

    await expect(pingRedis(redisUrl)).resolves.toBeUndefined();
  });

  it("rejects unsupported Redis URL protocols", async () => {
    await expect(pingRedis("https://redis.example.com")).rejects.toThrow(
      /Unsupported Redis URL protocol/,
    );
  });
});
