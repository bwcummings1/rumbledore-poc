import net from "node:net";
import tls from "node:tls";
import type {
  SpendGuardConfig,
  SpendGuardProvider,
  SpendGuardUnit,
  SpendGuardWindow,
} from "./env/schema";
import { logger as defaultLogger, type Logger } from "./logging";
import { recordProviderUsage } from "./metrics";

export type SpendGuardDecision = "allow" | "deny";

export interface SpendGuardUsage {
  details?: Record<string, number>;
  units: number;
}

export interface SpendGuardRecordResult {
  breached: boolean;
  cap: number;
  cumulative: number;
  provider: SpendGuardProvider;
  unit: SpendGuardUnit;
  units: number;
  window: SpendGuardWindow;
}

export interface SpendCounterStore {
  get(key: string): Promise<number>;
  incrementBy(
    key: string,
    amount: number,
    options?: { ttlSeconds?: number },
  ): Promise<number>;
}

interface SpendGuardOptions {
  config: SpendGuardConfig;
  logger?: Logger;
  store?: SpendCounterStore;
}

interface EnvLike {
  redisUrl: string;
  spendGuard: SpendGuardConfig;
}

const SPEND_GUARD_KEY_PREFIX = "rumbledore:spend-guard:v1";
const ROLLING_24H_TTL_SECONDS = 86_400;
const REDIS_TIMEOUT_MS = 1_500;

type RedisValue = number | string | null;

function clampUnits(units: number): number {
  if (!Number.isFinite(units) || units < 0) {
    throw new Error("Spend guard usage units must be a non-negative number");
  }
  return Math.ceil(units);
}

function redisCommand(parts: readonly string[]): string {
  return `*${parts.length}\r\n${parts
    .map((part) => {
      const value = String(part);
      return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
    })
    .join("")}`;
}

function parseRedisResponse(
  buffer: Buffer,
  offset: number,
): { nextOffset: number; value: RedisValue } | null {
  if (offset >= buffer.length) {
    return null;
  }

  const type = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf("\r\n", offset + 1);
  if (lineEnd === -1) {
    return null;
  }
  const line = buffer.toString("utf8", offset + 1, lineEnd);
  const nextLineOffset = lineEnd + 2;

  switch (type) {
    case "+":
      return { nextOffset: nextLineOffset, value: line };
    case "-":
      throw new Error(`Redis command failed: ${line}`);
    case ":":
      return { nextOffset: nextLineOffset, value: Number(line) };
    case "$": {
      const length = Number(line);
      if (length === -1) {
        return { nextOffset: nextLineOffset, value: null };
      }
      const valueEnd = nextLineOffset + length;
      const responseEnd = valueEnd + 2;
      if (buffer.length < responseEnd) {
        return null;
      }
      return {
        nextOffset: responseEnd,
        value: buffer.toString("utf8", nextLineOffset, valueEnd),
      };
    }
    default:
      throw new Error(`Unsupported Redis response type: ${type}`);
  }
}

function parseRedisResponses(buffer: Buffer): RedisValue[] | null {
  const values: RedisValue[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const parsed = parseRedisResponse(buffer, offset);
    if (!parsed) {
      return null;
    }
    values.push(parsed.value);
    offset = parsed.nextOffset;
  }
  return values;
}

function decodedUrlPart(value: string): string {
  return decodeURIComponent(value);
}

function redisPreludeCommands(url: URL): string[][] {
  const commands: string[][] = [];
  if (url.password || url.username) {
    commands.push(
      url.username
        ? ["AUTH", decodedUrlPart(url.username), decodedUrlPart(url.password)]
        : ["AUTH", decodedUrlPart(url.password)],
    );
  }

  const database = url.pathname.replace(/^\//, "");
  if (database) {
    commands.push(["SELECT", database]);
  }
  return commands;
}

async function sendRedisCommand(
  rawUrl: string,
  command: readonly string[],
): Promise<RedisValue> {
  const url = new URL(rawUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error(`Unsupported Redis URL protocol: ${url.protocol}`);
  }

  const commands = [...redisPreludeCommands(url), [...command]];
  const payload = commands.map(redisCommand).join("");
  const expectedResponses = commands.length;

  return new Promise<RedisValue>((resolve, reject) => {
    let settled = false;
    let received = Buffer.alloc(0);
    const finish = (error: Error | null, value?: RedisValue) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(value ?? null);
      }
    };
    const socket =
      url.protocol === "rediss:"
        ? tls.connect({
            host: url.hostname,
            port: Number(url.port || 6379),
          })
        : net.createConnection({
            host: url.hostname,
            port: Number(url.port || 6379),
          });

    socket.setTimeout(REDIS_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.write(payload);
    });
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      try {
        const responses = parseRedisResponses(received);
        if (responses && responses.length >= expectedResponses) {
          finish(null, responses[responses.length - 1] ?? null);
        }
      } catch (error) {
        finish(error as Error);
      }
    });
    socket.once("timeout", () => {
      finish(new Error("Redis spend guard command timed out"));
    });
    socket.once("error", finish);
    socket.once("close", () => {
      finish(new Error("Redis spend guard connection closed before response"));
    });
  });
}

export class RedisSpendCounterStore implements SpendCounterStore {
  constructor(private readonly redisUrl: string) {}

  async get(key: string): Promise<number> {
    const value = await sendRedisCommand(this.redisUrl, ["GET", key]);
    if (value === null) {
      return 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async incrementBy(
    key: string,
    amount: number,
    options: { ttlSeconds?: number } = {},
  ): Promise<number> {
    const cumulative = await sendRedisCommand(this.redisUrl, [
      "INCRBY",
      key,
      String(amount),
    ]);
    const parsed = Number(cumulative);
    if (!Number.isFinite(parsed)) {
      throw new Error("Redis spend guard counter returned a non-numeric value");
    }

    if (options.ttlSeconds && parsed === amount) {
      await sendRedisCommand(this.redisUrl, [
        "EXPIRE",
        key,
        String(options.ttlSeconds),
      ]);
    }
    return parsed;
  }
}

export class MemorySpendCounterStore implements SpendCounterStore {
  private readonly counters = new Map<
    string,
    { expiresAt: number | null; value: number }
  >();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async get(key: string): Promise<number> {
    return this.current(key);
  }

  async incrementBy(
    key: string,
    amount: number,
    options: { ttlSeconds?: number } = {},
  ): Promise<number> {
    const current = this.current(key);
    const next = current + amount;
    const existing = this.counters.get(key);
    this.counters.set(key, {
      expiresAt:
        existing?.expiresAt ??
        (options.ttlSeconds
          ? this.now().getTime() + options.ttlSeconds * 1000
          : null),
      value: next,
    });
    return next;
  }

  private current(key: string): number {
    const entry = this.counters.get(key);
    if (!entry) {
      return 0;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= this.now().getTime()) {
      this.counters.delete(key);
      return 0;
    }
    return entry.value;
  }
}

function ttlSecondsFor(window: SpendGuardWindow): number | undefined {
  return window === "rolling-24h" ? ROLLING_24H_TTL_SECONDS : undefined;
}

function keyFor(
  provider: SpendGuardProvider,
  window: SpendGuardWindow,
): string {
  return `${SPEND_GUARD_KEY_PREFIX}:${window}:${provider}`;
}

export class SpendGuard {
  private readonly fallbackStore = new MemorySpendCounterStore();
  private readonly logger: Logger;
  private readonly primaryStore: SpendCounterStore;
  private usingFallback = false;
  private warnedFallback = false;

  constructor(private readonly options: SpendGuardOptions) {
    this.logger = options.logger ?? defaultLogger;
    this.primaryStore = options.store ?? new MemorySpendCounterStore();
  }

  async check(provider: SpendGuardProvider): Promise<SpendGuardDecision> {
    const current = await this.read(provider);
    return current >= this.cap(provider) ? "deny" : "allow";
  }

  async record(
    provider: SpendGuardProvider,
    usage: SpendGuardUsage,
  ): Promise<SpendGuardRecordResult> {
    const units = clampUnits(usage.units);
    const cumulative =
      units === 0
        ? await this.read(provider)
        : await this.increment(provider, units);
    const cap = this.cap(provider);
    return {
      breached: cumulative >= cap,
      cap,
      cumulative,
      provider,
      unit: this.unit(provider),
      units,
      window: this.options.config.window,
    };
  }

  async snapshot(provider: SpendGuardProvider): Promise<{
    cap: number;
    cumulative: number;
    provider: SpendGuardProvider;
    unit: SpendGuardUnit;
    window: SpendGuardWindow;
  }> {
    return {
      cap: this.cap(provider),
      cumulative: await this.read(provider),
      provider,
      unit: this.unit(provider),
      window: this.options.config.window,
    };
  }

  private cap(provider: SpendGuardProvider): number {
    return this.options.config.providers[provider].cap;
  }

  private unit(provider: SpendGuardProvider): SpendGuardUnit {
    return this.options.config.providers[provider].unit;
  }

  private async read(provider: SpendGuardProvider): Promise<number> {
    return this.withFallback((store) => store.get(this.key(provider)));
  }

  private async increment(
    provider: SpendGuardProvider,
    units: number,
  ): Promise<number> {
    return this.withFallback((store) =>
      store.incrementBy(this.key(provider), units, {
        ttlSeconds: ttlSecondsFor(this.options.config.window),
      }),
    );
  }

  private key(provider: SpendGuardProvider): string {
    return keyFor(provider, this.options.config.window);
  }

  private async withFallback<T>(
    operation: (store: SpendCounterStore) => Promise<T>,
  ): Promise<T> {
    if (this.usingFallback) {
      return operation(this.fallbackStore);
    }

    try {
      return await operation(this.primaryStore);
    } catch (error) {
      this.usingFallback = true;
      if (!this.warnedFallback) {
        this.warnedFallback = true;
        this.logger.warn("spend_guard_counter_store_fallback", {
          error,
          mode: "memory",
        });
      }
      return operation(this.fallbackStore);
    }
  }
}

export function createSpendGuard(env: EnvLike): SpendGuard {
  return new SpendGuard({
    config: env.spendGuard,
    store: new RedisSpendCounterStore(env.redisUrl),
  });
}

export function logProviderUsage({
  cap,
  capReached = false,
  cumulative,
  demoted,
  details,
  logger = defaultLogger,
  operation,
  provider,
  unit,
  units,
  window,
}: {
  cap: number;
  capReached?: boolean;
  cumulative: number;
  demoted: boolean;
  details?: Record<string, number>;
  logger?: Logger;
  operation: string;
  provider: SpendGuardProvider;
  unit: SpendGuardUnit;
  units: number;
  window: SpendGuardWindow;
}) {
  const summary = recordProviderUsage({
    cap,
    cumulative,
    demoted,
    operation,
    provider,
    unit,
    units,
  });

  logger.info("provider_usage", {
    cap,
    capReached,
    callCount: summary.callCount,
    cumulative,
    demoted,
    demotionCount: summary.demotionCount,
    details,
    op: operation,
    percentConsumed: summary.percentConsumed,
    provider,
    realCallCount: summary.realCallCount,
    unit,
    units,
    window,
  });
}

export async function runGuardedProviderCall<T>({
  fallbackOnError,
  guard,
  logger = defaultLogger,
  mockCall,
  operation,
  provider,
  realCall,
}: {
  fallbackOnError?: (error: unknown) => boolean;
  guard: SpendGuard;
  logger?: Logger;
  mockCall: () => Promise<T>;
  operation: string;
  provider: SpendGuardProvider;
  realCall: () => Promise<{ usage: SpendGuardUsage; value: T }>;
}): Promise<T> {
  if ((await guard.check(provider)) === "deny") {
    const snapshot = await guard.snapshot(provider);
    logProviderUsage({
      cap: snapshot.cap,
      cumulative: snapshot.cumulative,
      demoted: true,
      logger,
      operation,
      provider,
      unit: snapshot.unit,
      units: 0,
      window: snapshot.window,
    });
    logger.warn("provider_spend_guard_demoted", {
      cap: snapshot.cap,
      cumulative: snapshot.cumulative,
      operation,
      provider,
      window: snapshot.window,
    });
    return mockCall();
  }

  let realResult: { usage: SpendGuardUsage; value: T };
  try {
    realResult = await realCall();
  } catch (error) {
    if (!fallbackOnError?.(error)) {
      throw error;
    }
    const snapshot = await guard.snapshot(provider);
    logProviderUsage({
      cap: snapshot.cap,
      cumulative: snapshot.cumulative,
      demoted: true,
      logger,
      operation,
      provider,
      unit: snapshot.unit,
      units: 0,
      window: snapshot.window,
    });
    logger.warn("provider_unavailable_mock_fallback", {
      cap: snapshot.cap,
      cumulative: snapshot.cumulative,
      error,
      operation,
      provider,
      window: snapshot.window,
    });
    return mockCall();
  }

  const { usage, value } = realResult;
  const record = await guard.record(provider, usage);
  logProviderUsage({
    cap: record.cap,
    capReached: record.breached,
    cumulative: record.cumulative,
    demoted: false,
    details: usage.details,
    logger,
    operation,
    provider,
    unit: record.unit,
    units: record.units,
    window: record.window,
  });
  if (record.breached) {
    logger.warn("provider_spend_guard_cap_reached", {
      cap: record.cap,
      cumulative: record.cumulative,
      operation,
      provider,
      units: record.units,
      window: record.window,
    });
  }
  return value;
}
