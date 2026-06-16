// @vitest-environment node
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SPEND_GUARD_CAPS,
  type SpendGuardConfig,
  type SpendGuardProvider,
  type SpendGuardWindow,
} from "./env/schema";
import { createLogger } from "./logging";
import { getMetricsSnapshot, resetMetricsForTests } from "./metrics";
import {
  MemorySpendCounterStore,
  RedisSpendCounterStore,
  runGuardedProviderCall,
  SpendGuard,
} from "./spend-guard";

function testLogger() {
  return createLogger({ sink: () => undefined });
}

function parseLogLine(line: string): Record<string, unknown> {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch (cause) {
    throw new Error("Expected provider usage log to be valid JSON", { cause });
  }
}

function guardConfig(
  overrides: Partial<Record<SpendGuardProvider, number>> = {},
  window: SpendGuardWindow = "total-run",
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
    window,
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
  commands: string[][];
  url: string;
}> {
  const commands: string[][] = [];
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
        commands.push(parsed.args);
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
    commands,
    url: `redis://127.0.0.1:${address.port}`,
  };
}

const redisServers: Array<{ close: () => Promise<void> }> = [];

beforeEach(() => {
  resetMetricsForTests();
});

afterEach(async () => {
  await Promise.all(redisServers.splice(0).map((server) => server.close()));
});

describe("SpendGuard", () => {
  it("expires rolling-24h memory counters after the fixed TTL", async () => {
    let nowMs = Date.parse("2026-06-16T00:00:00.000Z");
    const guard = new SpendGuard({
      config: guardConfig({ tavily: 1 }, "rolling-24h"),
      logger: testLogger(),
      store: new MemorySpendCounterStore(() => new Date(nowMs)),
    });

    await guard.record("tavily", { units: 1 });
    await expect(guard.check("tavily")).resolves.toBe("deny");

    nowMs += 86_399_000;
    await expect(guard.check("tavily")).resolves.toBe("deny");

    nowMs += 1_000;
    await expect(guard.check("tavily")).resolves.toBe("allow");
    await expect(guard.snapshot("tavily")).resolves.toMatchObject({
      cumulative: 0,
      window: "rolling-24h",
    });

    await guard.record("tavily", { units: 1 });
    await expect(guard.snapshot("tavily")).resolves.toMatchObject({
      cumulative: 1,
      window: "rolling-24h",
    });
  });

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

  it("emits a secret-free provider usage log and metrics snapshot", async () => {
    const lines: string[] = [];
    const privateValue = ["fixture", "provider", "private", "value"].join("-");
    const logger = createLogger({
      extraSecrets: [privateValue],
      now: () => new Date("2026-06-16T00:00:00.000Z"),
      sink: (line) => lines.push(line),
    });
    const guard = new SpendGuard({
      config: guardConfig({ anthropic: 10 }),
      logger,
      store: new MemorySpendCounterStore(),
    });

    const result = await runGuardedProviderCall({
      guard,
      logger,
      mockCall: vi.fn(async () => "mock"),
      operation: "llm.generate",
      provider: "anthropic",
      realCall: vi.fn(async () => ({
        usage: {
          details: {
            cacheCreationInputTokens: 1,
            cacheReadInputTokens: 2,
            inputTokens: 3,
            outputTokens: 4,
          },
          units: 8,
        },
        value: "real",
      })),
    });

    expect(result).toBe("real");
    const serializedUsage = lines.find((line) =>
      line.includes('"msg":"provider_usage"'),
    );
    expect(serializedUsage).toBeDefined();
    expect(serializedUsage).not.toContain(privateValue);
    expect(parseLogLine(serializedUsage ?? "{}")).toMatchObject({
      cap: 10,
      cumulative: 8,
      demoted: false,
      details: {
        cacheCreationInputTokens: 1,
        cacheReadInputTokens: 2,
        inputTokens: 3,
        outputTokens: 4,
      },
      level: "info",
      msg: "provider_usage",
      op: "llm.generate",
      provider: "anthropic",
      unit: "tokens",
      units: 8,
      window: "total-run",
    });

    expect(getMetricsSnapshot().providerUsage.providers.anthropic).toEqual({
      callCount: 1,
      cap: 10,
      demotionCount: 0,
      latestCumulative: 8,
      operations: {
        "llm.generate": {
          callCount: 1,
          demotionCount: 0,
          totalUnits: 8,
        },
      },
      percentConsumed: 80,
      realCallCount: 1,
      totalUnits: 8,
      unit: "tokens",
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

  it("sets a 24h Redis expiry when a rolling counter is first created", async () => {
    const server = await startRedisCounterServer();
    redisServers.push(server);
    const guard = new SpendGuard({
      config: guardConfig({ odds: 10 }, "rolling-24h"),
      logger: testLogger(),
      store: new RedisSpendCounterStore(server.url),
    });

    await guard.record("odds", { units: 1 });
    await guard.record("odds", { units: 1 });

    const expireCommands = server.commands.filter(
      ([command]) => command?.toUpperCase() === "EXPIRE",
    );
    expect(expireCommands).toEqual([
      ["EXPIRE", "rumbledore:spend-guard:v1:rolling-24h:odds", "86400"],
    ]);
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
