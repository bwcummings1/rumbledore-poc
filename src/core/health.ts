import net from "node:net";
import tls from "node:tls";
import { type SQL, sql } from "drizzle-orm";
import { redactSecrets } from "./logging";

export type HealthStatus = "ok" | "degraded";
export type DependencyStatus = "ok" | "down";

export interface HealthCheckResult {
  status: DependencyStatus;
  latencyMs: number;
  error?: string;
}

export interface HealthPayload {
  status: HealthStatus;
  checkedAt: string;
  checks: {
    db: HealthCheckResult;
    redis: HealthCheckResult;
  };
}

export interface DatabaseProbe {
  execute(query: SQL): Promise<unknown>;
}

export interface HealthCheckOptions {
  checkDb?: () => Promise<void>;
  checkRedis?: () => Promise<void>;
  db?: DatabaseProbe;
  now?: () => Date;
  redisTimeoutMs?: number;
  redisUrl?: string;
}

export async function checkDatabase(db: DatabaseProbe): Promise<void> {
  await db.execute(sql`select 1`);
}

function redisCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join("")}`;
}

function redisPingPayload(url: URL): string {
  const password = decodeURIComponent(url.password);
  const username = decodeURIComponent(url.username);
  const commands: string[] = [];

  if (password) {
    commands.push(
      redisCommand(
        username ? ["AUTH", username, password] : ["AUTH", password],
      ),
    );
  }
  commands.push(redisCommand(["PING"]));
  return commands.join("");
}

export async function pingRedis(
  redisUrl: string,
  timeoutMs = 1_000,
): Promise<void> {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error(`Unsupported Redis URL protocol: ${url.protocol}`);
  }

  const port =
    url.port === ""
      ? url.protocol === "rediss:"
        ? 6380
        : 6379
      : Number(url.port);
  const host = url.hostname;

  await new Promise<void>((resolve, reject) => {
    let socket: net.Socket;
    let settled = false;
    let response = "";
    let timer: NodeJS.Timeout;
    const writePing = () => {
      socket.write(redisPingPayload(url));
    };

    socket =
      url.protocol === "rediss:"
        ? tls.connect({ host, port, servername: host }, writePing)
        : net.connect({ host, port }, writePing);

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    timer = setTimeout(() => {
      finish(new Error("Redis ping timed out"));
    }, timeoutMs);
    timer.unref?.();

    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.includes("+PONG")) {
        finish();
        return;
      }
      if (response.startsWith("-")) {
        finish(new Error("Redis ping failed"));
      }
    });
    socket.once("error", (error) => {
      finish(error);
    });
    socket.once("end", () => {
      finish(new Error("Redis connection closed before PONG"));
    });
  });
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return String(redactSecrets(message));
}

async function measureCheck(
  check: () => Promise<void>,
): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  try {
    await check();
    return {
      latencyMs: Date.now() - startedAt,
      status: "ok",
    };
  } catch (error) {
    return {
      error: errorMessage(error),
      latencyMs: Date.now() - startedAt,
      status: "down",
    };
  }
}

export async function runHealthCheck({
  checkDb,
  checkRedis,
  db,
  now = () => new Date(),
  redisTimeoutMs,
  redisUrl,
}: HealthCheckOptions): Promise<HealthPayload> {
  const dbCheck =
    checkDb ??
    (() => {
      if (!db) {
        throw new Error("Database health probe is not configured");
      }
      return checkDatabase(db);
    });
  const redisCheck =
    checkRedis ??
    (() => {
      if (!redisUrl) {
        throw new Error("Redis health probe is not configured");
      }
      return pingRedis(redisUrl, redisTimeoutMs);
    });

  const [dbResult, redisResult] = await Promise.all([
    measureCheck(dbCheck),
    measureCheck(redisCheck),
  ]);

  return {
    checkedAt: now().toISOString(),
    checks: {
      db: dbResult,
      redis: redisResult,
    },
    status:
      dbResult.status === "ok" && redisResult.status === "ok"
        ? "ok"
        : "degraded",
  };
}
