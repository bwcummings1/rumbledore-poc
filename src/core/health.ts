import net from "node:net";
import tls from "node:tls";
import { type SQL, sql } from "drizzle-orm";
import type { InngestConfig, RealtimeConfig } from "./env/schema";
import { redactSecrets } from "./logging";
import { getMetricsSnapshot, type MetricsSnapshot } from "./metrics";

export type HealthStatus = "ok" | "degraded";
export type DependencyStatus = "ok" | "down";
export type HealthCheckMode = "cloud" | "dev" | "mock" | "real" | "required";
export type RuntimeEnvironment = "development" | "production" | "test";
export type DatabaseRolePrivilegeEnforcement = "report-only" | "required";

export interface HealthCheckResult<
  TDetails extends Record<string, unknown> = Record<string, unknown>,
> {
  status: DependencyStatus;
  latencyMs: number;
  mode: HealthCheckMode;
  details?: TDetails;
  error?: string;
}

export interface DatabaseRolePrivilegeDetails extends Record<string, unknown> {
  bypassRls: boolean;
  enforcement: DatabaseRolePrivilegeEnforcement;
  roleName: string;
  safe: boolean;
  sessionUser: string;
  superuser: boolean;
}

export interface HealthPayload {
  status: HealthStatus;
  checkedAt: string;
  checks: {
    db: HealthCheckResult;
    dbRole: HealthCheckResult<DatabaseRolePrivilegeDetails>;
    inngest: HealthCheckResult;
    redis: HealthCheckResult;
    realtime: HealthCheckResult;
  };
  metrics: MetricsSnapshot;
}

export interface DatabaseProbe {
  execute(query: SQL): Promise<unknown>;
}

export interface HealthCheckOptions {
  checkDb?: () => Promise<void>;
  checkDbRole?: () => Promise<DatabaseRolePrivilegeDetails>;
  checkInngest?: () => Promise<void>;
  checkRedis?: () => Promise<void>;
  checkRealtime?: () => Promise<void>;
  db?: DatabaseProbe;
  fetchFn?: typeof fetch;
  httpTimeoutMs?: number;
  inngest?: InngestConfig;
  nodeEnv?: RuntimeEnvironment;
  now?: () => Date;
  realtime?: RealtimeConfig;
  redisTimeoutMs?: number;
  redisUrl?: string;
}

export async function checkDatabase(db: DatabaseProbe): Promise<void> {
  await db.execute(sql`select 1`);
}

export class UnsafeDatabaseRoleError extends Error {
  readonly details: DatabaseRolePrivilegeDetails;

  constructor(details: DatabaseRolePrivilegeDetails) {
    super(
      `Database role "${details.roleName}" must not be superuser or BYPASSRLS (superuser=${details.superuser}, bypassRls=${details.bypassRls})`,
    );
    this.name = "UnsafeDatabaseRoleError";
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function rowsFromExecuteResult(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    return result;
  }
  if (isRecord(result) && Array.isArray(result.rows)) {
    return result.rows;
  }
  return [];
}

function requiredStringField(
  row: Record<string, unknown>,
  fieldName: string,
): string {
  const value = row[fieldName];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Database role privilege probe returned invalid ${fieldName}`,
    );
  }
  return value;
}

function normalizeDatabaseRolePrivilegeDetails(
  row: unknown,
  enforcement: DatabaseRolePrivilegeEnforcement,
): DatabaseRolePrivilegeDetails {
  if (!isRecord(row)) {
    throw new Error("Database role privilege probe returned an invalid row");
  }

  const superuser = row.superuser === true;
  const bypassRls = row.bypass_rls === true;

  return {
    bypassRls,
    enforcement,
    roleName: requiredStringField(row, "role_name"),
    safe: !superuser && !bypassRls,
    sessionUser: requiredStringField(row, "session_user_name"),
    superuser,
  };
}

export async function checkDatabaseRolePrivileges(
  db: DatabaseProbe,
  {
    enforce = false,
  }: {
    enforce?: boolean;
  } = {},
): Promise<DatabaseRolePrivilegeDetails> {
  const result = await db.execute(sql`
    select
      current_user::text as role_name,
      session_user::text as session_user_name,
      rolsuper as superuser,
      rolbypassrls as bypass_rls
    from pg_catalog.pg_roles
    where rolname = current_user
  `);
  const [row] = rowsFromExecuteResult(result);
  if (!row) {
    throw new Error("Database role privilege probe returned no rows");
  }

  const details = normalizeDatabaseRolePrivilegeDetails(
    row,
    enforce ? "required" : "report-only",
  );
  if (!details.safe && enforce) {
    throw new UnsafeDatabaseRoleError(details);
  }
  return details;
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

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function pingHttpEndpoint({
  fetchFn = fetch,
  headers,
  timeoutMs = 1_000,
  url,
}: {
  fetchFn?: typeof fetch;
  headers?: HeadersInit;
  timeoutMs?: number;
  url: string | URL;
}): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  timer.unref?.();

  try {
    const response = await fetchFn(url, {
      headers,
      method: "GET",
      signal: controller.signal,
    });
    if (response.status >= 500) {
      throw new Error(`HTTP probe failed with status ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function checkRealtime(
  realtime: RealtimeConfig | undefined,
  {
    fetchFn,
    timeoutMs,
  }: {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<void> {
  if (!realtime || realtime.mock) {
    return;
  }

  const endpoint = new URL(
    "/realtime/v1/health",
    `${trimTrailingSlashes(realtime.url)}/`,
  );
  await pingHttpEndpoint({
    fetchFn,
    headers: {
      apikey: realtime.serviceRoleKey,
    },
    timeoutMs,
    url: endpoint,
  });
}

export async function checkInngest(
  inngest: InngestConfig | undefined,
  {
    fetchFn,
    timeoutMs,
  }: {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<void> {
  if (!inngest || inngest.mode === "mock") {
    return;
  }

  const baseUrl = inngest.mode === "dev" ? inngest.baseUrl : inngest.apiBaseUrl;
  await pingHttpEndpoint({
    fetchFn,
    timeoutMs,
    url: new URL("/", `${trimTrailingSlashes(baseUrl)}/`),
  });
}

function errorMessage(error: unknown, extraSecrets: string[]): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return String(redactSecrets(message, { extraSecrets }));
}

function errorDetails(error: unknown): Record<string, unknown> | undefined {
  if (error instanceof UnsafeDatabaseRoleError) {
    return error.details;
  }
  if (isRecord(error) && isRecord(error.details)) {
    return error.details;
  }
  return undefined;
}

async function measureCheck<TDetails extends Record<string, unknown>>(
  check: () => Promise<TDetails | undefined>,
  mode: HealthCheckMode,
  extraSecrets: string[] = [],
): Promise<HealthCheckResult<TDetails>> {
  const startedAt = Date.now();
  try {
    const details = await check();
    return {
      ...(details ? { details } : {}),
      latencyMs: Date.now() - startedAt,
      mode,
      status: "ok",
    };
  } catch (error) {
    const details = errorDetails(error) as TDetails | undefined;
    return {
      error: errorMessage(error, extraSecrets),
      ...(details ? { details } : {}),
      latencyMs: Date.now() - startedAt,
      mode,
      status: "down",
    };
  }
}

function withoutDetails(check: () => Promise<void>): () => Promise<undefined> {
  return async () => {
    await check();
    return undefined;
  };
}

function dependencyCheckPassed(result: HealthCheckResult): boolean {
  switch (result.status) {
    case "ok":
      return true;
    case "down":
      return false;
  }
}

function realtimeMode(realtime: RealtimeConfig | undefined): HealthCheckMode {
  return !realtime || realtime.mock ? "mock" : "real";
}

function inngestMode(inngest: InngestConfig | undefined): HealthCheckMode {
  return inngest?.mode ?? "mock";
}

function configuredSecrets({
  inngest,
  realtime,
}: {
  inngest: InngestConfig | undefined;
  realtime: RealtimeConfig | undefined;
}): string[] {
  const values: Array<string | undefined> = [];
  if (realtime && !realtime.mock) {
    values.push(
      realtime.jwtSecret,
      realtime.publishableKey,
      realtime.serviceRoleKey,
    );
  }
  switch (inngest?.mode) {
    case "cloud":
      values.push(
        inngest.eventKey,
        inngest.signingKey,
        inngest.signingKeyFallback,
      );
      break;
    case "dev":
      values.push(
        inngest.eventKey,
        inngest.signingKey,
        inngest.signingKeyFallback,
      );
      break;
    default:
      break;
  }

  return values.filter((value): value is string => Boolean(value));
}

export async function runHealthCheck({
  checkDb,
  checkDbRole,
  checkInngest: checkInngestOverride,
  checkRedis,
  checkRealtime: checkRealtimeOverride,
  db,
  fetchFn,
  httpTimeoutMs,
  inngest,
  nodeEnv = "development",
  now = () => new Date(),
  realtime,
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
  const dbRoleCheck =
    checkDbRole ??
    (() => {
      if (!db) {
        throw new Error("Database role privilege probe is not configured");
      }
      return checkDatabaseRolePrivileges(db, {
        enforce: nodeEnv === "production",
      });
    });
  const redisCheck =
    checkRedis ??
    (() => {
      if (!redisUrl) {
        throw new Error("Redis health probe is not configured");
      }
      return pingRedis(redisUrl, redisTimeoutMs);
    });
  const realtimeCheck =
    checkRealtimeOverride ??
    (() => checkRealtime(realtime, { fetchFn, timeoutMs: httpTimeoutMs }));
  const inngestCheck =
    checkInngestOverride ??
    (() => checkInngest(inngest, { fetchFn, timeoutMs: httpTimeoutMs }));
  const extraSecrets = configuredSecrets({ inngest, realtime });

  const [dbResult, dbRoleResult, redisResult, realtimeResult, inngestResult] =
    await Promise.all([
      measureCheck(withoutDetails(dbCheck), "required", extraSecrets),
      measureCheck(dbRoleCheck, "required", extraSecrets),
      measureCheck(withoutDetails(redisCheck), "required", extraSecrets),
      measureCheck(
        withoutDetails(realtimeCheck),
        realtimeMode(realtime),
        extraSecrets,
      ),
      measureCheck(
        withoutDetails(inngestCheck),
        inngestMode(inngest),
        extraSecrets,
      ),
    ]);

  const checks = {
    db: dbResult,
    dbRole: dbRoleResult,
    inngest: inngestResult,
    redis: redisResult,
    realtime: realtimeResult,
  };
  const healthy = Object.values(checks).every(dependencyCheckPassed);

  return {
    checkedAt: now().toISOString(),
    checks,
    metrics: getMetricsSnapshot(now),
    status: healthy ? "ok" : "degraded",
  };
}
