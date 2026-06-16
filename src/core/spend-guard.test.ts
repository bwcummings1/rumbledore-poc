// @vitest-environment node
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SPEND_GUARD_CAPS,
  type SpendGuardConfig,
  type SpendGuardProvider,
} from "./env/schema";
import { createLogger } from "./logging";
import {
  MemorySpendCounterStore,
  RedisSpendCounterStore,
  runGuardedProviderCall,
  SpendGuard,
} from "./spend-guard";

function testLogger() {
  return createLogger({ sink: () => undefined });
}

function guardConfig(
  overrides: Partial<Record<SpendGuardProvider, number>> = {},
): SpendGuardConfig {
  return {
    providers: Object.fromEntries(
      Object.entries(DEFAULT_SPEND_GUARD_CAPS).map(([provider, config]) => [
        provider,
        {
          ...config,
          cap: overrides[provider as SpendGuardProvider] ?? config.cap,
        },
      ]),
    ) as SpendGuardConfig["providers"],
    window: "total-run",
  };
}

function bulk(value: string): string {
  return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
}

function parseRedisCommand(
  buffer: Buffer,
  offset: number,
): { args: string[]; nextOffset: number } | null {
  if (buffer[offset] !== 42) {
    throw new Error("Expected RESP array");
  }
  const firstLineEnd = buffer.indexOf("\r\n", offset);
  if (firstLineEnd === -1) {
    return null;
  }
  const count = Number(buffer.toString("utf8", offset + 1, firstLineEnd));
  let cursor = firstLineEnd + 2;
  const args: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer[cursor] !== 36) {
      throw new Error("Expected RESP bulk string");
    }
    const lengthLineEnd = buffer.indexOf("\r\n", cursor);
    if (lengthLineEnd === -1) {
      return null;
    }
    const length = Number(buffer.toString("utf8", cursor + 1, lengthLineEnd));
    const valueStart = lengthLineEnd + 2;
    const valueEnd = valueStart + length;
    const next = valueEnd + 2;
    if (buffer.length < next) {
      return null;
    }
    args.push(buffer.toString("utf8", valueStart, valueEnd));
    cursor = next;
  }
  return { args, nextOffset: cursor };
}

async function startRedisCounterServer(): Promise<{
  close: () => Promise<void>;
  url: string;
}> {
  const counters = new Map<string, number>();
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length > 0) {
        const parsed = parseRedisCommand(buffer, 0);
        if (!parsed) {
          return;
        }
        buffer = buffer.subarray(parsed.nextOffset);
        const [command = "", key = "", amount = "0"] = parsed.args;
        switch (command.toUpperCase()) {
          case "GET": {
            const value = counters.get(key);
            socket.write(value === undefined ? "$-1\r\n" : bulk(String(value)));
            break;
          }
          case "INCRBY": {
            const next = (counters.get(key) ?? 0) + Number(amount);
            counters.set(key, next);
            socket.write(`:${next}\r\n`);
            break;
          }
          case "EXPIRE":
          case "SELECT":
          case "AUTH":
            socket.write("+OK\r\n");
            break;
          default:
            socket.write(`-ERR unsupported command ${command}\r\n`);
            break;
        }
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Redis counter test server did not bind to a TCP port");
  }
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    url: `redis://127.0.0.1:${address.port}`,
  };
}

const redisServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(redisServers.splice(0).map((server) => server.close()));
});

describe("SpendGuard", () => {
  it("records below-cap usage and returns cumulative state", async () => {
    const guard = new SpendGuard({
      config: guardConfig({ tavily: 10 }),
      logger: testLogger(),
      store: new MemorySpendCounterStore(),
    });

    const result = await runGuardedProviderCall({
      guard,
      logger: testLogger(),
      mockCall: vi.fn(async () => "mock"),
      operation: "web.fetch",
      provider: "tavily",
      realCall: vi.fn(async () => ({
        usage: { units: 3 },
        value: "real",
      })),
    });

    expect(result).toBe("real");
    await expect(guard.snapshot("tavily")).resolves.toMatchObject({
      cap: 10,
      cumulative: 3,
    });
  });

  it("demotes to mock after a tiny cap is breached without calling real again", async () => {
    const guard = new SpendGuard({
      config: guardConfig({ anthropic: 1 }),
      logger: testLogger(),
      store: new MemorySpendCounterStore(),
    });
    const realCall = vi.fn(async () => ({
      usage: { units: 2 },
      value: "real",
    }));
    const mockCall = vi.fn(async () => "mock");

    await expect(
      runGuardedProviderCall({
        guard,
        logger: testLogger(),
        mockCall,
        operation: "llm.generate",
        provider: "anthropic",
        realCall,
      }),
    ).resolves.toBe("real");
    await expect(
      runGuardedProviderCall({
        guard,
        logger: testLogger(),
        mockCall,
        operation: "llm.generate",
        provider: "anthropic",
        realCall,
      }),
    ).resolves.toBe("mock");

    expect(realCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it("observes a Redis-backed breach from another guard instance", async () => {
    const server = await startRedisCounterServer();
    redisServers.push(server);
    const config = guardConfig({ odds: 1 });
    const first = new SpendGuard({
      config,
      logger: testLogger(),
      store: new RedisSpendCounterStore(server.url),
    });
    const second = new SpendGuard({
      config,
      logger: testLogger(),
      store: new RedisSpendCounterStore(server.url),
    });

    await first.record("odds", { units: 1 });

    await expect(second.check("odds")).resolves.toBe("deny");
  });

  it("falls back to process memory when the primary counter store fails", async () => {
    const warn = vi.fn();
    const guard = new SpendGuard({
      config: guardConfig({ voyage: 1 }),
      logger: createLogger({ sink: { warn } }),
      store: {
        get: async () => {
          throw new Error("redis unavailable");
        },
        incrementBy: async () => {
          throw new Error("redis unavailable");
        },
      },
    });

    await expect(guard.check("voyage")).resolves.toBe("allow");
    await guard.record("voyage", { units: 1 });

    await expect(guard.check("voyage")).resolves.toBe("deny");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
