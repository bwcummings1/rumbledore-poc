import "server-only";
import { z } from "zod";
import type { Logger } from "@/core/logging";
import { AppError } from "@/core/result";
import { runGuardedProviderCall, type SpendGuard } from "@/core/spend-guard";
import type { EspnCookieCredentials } from "@/providers/espn";
import type {
  BrowserSession,
  BrowserSessionStart,
  BrowserSessionStartInput,
} from "./browser-session";

const BROWSERBASE_API_BASE_URL = "https://api.browserbase.com/v1/";
const ESPN_LOGIN_URL = "https://www.espn.com/login";
const BROWSER_SESSION_TIMEOUT_SECONDS = 15 * 60;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_CDP_COMMAND_TIMEOUT_MS = 5_000;
const DEFAULT_CAPTURE_TIMEOUT_MS = 20_000;
const DEFAULT_CAPTURE_POLL_INTERVAL_MS = 750;
const DEFAULT_CAPTURE_POLL_ATTEMPTS = 24;

const httpsUrlSchema = z.url().refine((value) => {
  return new URL(value).protocol === "https:";
});

const secureWebSocketUrlSchema = z.url().refine((value) => {
  return new URL(value).protocol === "wss:";
});

const createSessionResponseSchema = z.object({
  id: z.uuid(),
});

const debugSessionResponseSchema = z.object({
  debuggerFullscreenUrl: httpsUrlSchema,
  wsUrl: secureWebSocketUrlSchema,
});

const targetCreatedSchema = z.object({
  targetId: z.string().min(1),
});

const cdpCookieSchema = z.object({
  domain: z.string(),
  name: z.string(),
  value: z.string(),
});

const cdpCookiesSchema = z.object({
  cookies: z.array(cdpCookieSchema),
});

const cdpEnvelopeSchema = z.object({
  error: z
    .object({
      code: z.number(),
      message: z.string(),
    })
    .optional(),
  id: z.number().int(),
  result: z.unknown().optional(),
});

export const BROWSERBASE_SESSION_ERROR_CODES = [
  "BROWSERBASE_SESSION_EXPIRED",
  "BROWSERBASE_CAPTURE_TIMEOUT",
  "BROWSERBASE_COOKIES_NOT_FOUND",
  "BROWSERBASE_SPEND_GUARD_CAP",
  "BROWSERBASE_REQUEST_FAILED",
  "BROWSERBASE_INVALID_RESPONSE",
] as const;

export type BrowserbaseSessionErrorCode =
  (typeof BROWSERBASE_SESSION_ERROR_CODES)[number];

const ERROR_METADATA: Record<
  BrowserbaseSessionErrorCode,
  { message: string; status: number }
> = {
  BROWSERBASE_CAPTURE_TIMEOUT: {
    message: "Hosted browser credential capture timed out",
    status: 504,
  },
  BROWSERBASE_COOKIES_NOT_FOUND: {
    message: "The hosted browser does not contain ESPN login cookies yet",
    status: 422,
  },
  BROWSERBASE_INVALID_RESPONSE: {
    message: "The hosted browser returned an invalid response",
    status: 502,
  },
  BROWSERBASE_REQUEST_FAILED: {
    message: "The hosted browser request failed",
    status: 502,
  },
  BROWSERBASE_SESSION_EXPIRED: {
    message: "The hosted browser session expired",
    status: 410,
  },
  BROWSERBASE_SPEND_GUARD_CAP: {
    message: "Hosted browser session capacity has been reached",
    status: 429,
  },
};

export class BrowserbaseSessionError extends AppError {
  declare readonly code: BrowserbaseSessionErrorCode;

  constructor(code: BrowserbaseSessionErrorCode) {
    const metadata = ERROR_METADATA[code];
    super({ code, ...metadata });
    this.name = "BrowserbaseSessionError";
  }
}

type BrowserbaseFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface BrowserbaseWebSocket {
  close(code?: number, reason?: string): void;
  onclose: ((event: CloseEvent) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null;
  onopen: ((event: Event) => unknown) | null;
  readonly readyState: number;
  send(data: string): void;
}

type BrowserbaseWebSocketFactory = (url: string) => BrowserbaseWebSocket;

interface BrowserbaseSessionOptions {
  apiBaseUrl?: string;
  apiKey: string;
  capturePollAttempts?: number;
  capturePollIntervalMs?: number;
  captureTimeoutMs?: number;
  cdpCommandTimeoutMs?: number;
  fetch?: BrowserbaseFetch;
  logger?: Logger;
  now?: () => number;
  projectId: string;
  requestTimeoutMs?: number;
  sleep?: (durationMs: number) => Promise<void>;
  spendGuard: SpendGuard;
  webSocketFactory?: BrowserbaseWebSocketFactory;
}

interface DebugSessionResponse {
  debuggerFullscreenUrl: string;
  wsUrl: string;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isEspnCookieDomain(domain: string): boolean {
  const normalized = domain.toLowerCase().replace(/^\./, "");
  return normalized === "espn.com" || normalized.endsWith(".espn.com");
}

function credentialsFromCookies(
  cookies: z.infer<typeof cdpCookieSchema>[],
): EspnCookieCredentials | null {
  let swid: string | undefined;
  let espnS2: string | undefined;

  for (const cookie of cookies) {
    if (!isEspnCookieDomain(cookie.domain) || cookie.value.length === 0) {
      continue;
    }
    switch (cookie.name) {
      case "SWID":
        swid = cookie.value;
        break;
      case "espn_s2":
        espnS2 = cookie.value;
        break;
      default:
        break;
    }
  }

  return swid && espnS2 ? { espn_s2: espnS2, swid } : null;
}

function messageText(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
      "utf8",
    );
  }
  return null;
}

function hasCdpResponseId(value: unknown): value is { id: unknown } {
  switch (typeof value) {
    case "object":
      break;
    default:
      return false;
  }
  if (!value) {
    return false;
  }
  return "id" in value;
}

class CdpConnection {
  private commandId = 0;

  constructor(private readonly socket: BrowserbaseWebSocket) {}

  command(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    switch (this.socket.readyState) {
      case WebSocket.OPEN:
        break;
      default:
        return Promise.reject(
          new BrowserbaseSessionError("BROWSERBASE_SESSION_EXPIRED"),
        );
    }

    this.commandId += 1;
    const id = this.commandId;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (
        error: BrowserbaseSessionError | null,
        value?: unknown,
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.socket.onclose = null;
        this.socket.onerror = null;
        this.socket.onmessage = null;
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      };
      const timeout = setTimeout(
        () =>
          finish(new BrowserbaseSessionError("BROWSERBASE_CAPTURE_TIMEOUT")),
        timeoutMs,
      );

      this.socket.onclose = () =>
        finish(new BrowserbaseSessionError("BROWSERBASE_SESSION_EXPIRED"));
      this.socket.onerror = () =>
        finish(new BrowserbaseSessionError("BROWSERBASE_REQUEST_FAILED"));
      this.socket.onmessage = (event) => {
        const text = messageText(event.data);
        if (text === null) {
          finish(new BrowserbaseSessionError("BROWSERBASE_INVALID_RESPONSE"));
          return;
        }

        let decoded: unknown;
        try {
          decoded = JSON.parse(text);
        } catch {
          finish(new BrowserbaseSessionError("BROWSERBASE_INVALID_RESPONSE"));
          return;
        }
        if (!hasCdpResponseId(decoded)) {
          // CDP events are allowed to arrive between command responses.
          return;
        }
        const parsed = cdpEnvelopeSchema.safeParse(decoded);
        if (!parsed.success) {
          finish(new BrowserbaseSessionError("BROWSERBASE_INVALID_RESPONSE"));
          return;
        }
        if (parsed.data.id !== id) {
          return;
        }
        if (parsed.data.error) {
          finish(new BrowserbaseSessionError("BROWSERBASE_REQUEST_FAILED"));
          return;
        }
        finish(null, parsed.data.result ?? {});
      };

      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch {
        finish(new BrowserbaseSessionError("BROWSERBASE_REQUEST_FAILED"));
      }
    });
  }

  close(): void {
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
      case WebSocket.OPEN:
        this.socket.close(1000);
        break;
      default:
        break;
    }
  }
}

export class BrowserbaseBrowserSession implements BrowserSession {
  private readonly apiBaseUrl: URL;
  private readonly capturePollAttempts: number;
  private readonly capturePollIntervalMs: number;
  private readonly captureTimeoutMs: number;
  private readonly cdpCommandTimeoutMs: number;
  private readonly fetch: BrowserbaseFetch;
  private readonly now: () => number;
  private readonly requestTimeoutMs: number;
  private readonly sleep: (durationMs: number) => Promise<void>;
  private readonly webSocketFactory: BrowserbaseWebSocketFactory;

  constructor(private readonly options: BrowserbaseSessionOptions) {
    this.apiBaseUrl = new URL(options.apiBaseUrl ?? BROWSERBASE_API_BASE_URL);
    this.capturePollAttempts =
      options.capturePollAttempts ?? DEFAULT_CAPTURE_POLL_ATTEMPTS;
    this.capturePollIntervalMs =
      options.capturePollIntervalMs ?? DEFAULT_CAPTURE_POLL_INTERVAL_MS;
    this.captureTimeoutMs =
      options.captureTimeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;
    this.cdpCommandTimeoutMs =
      options.cdpCommandTimeoutMs ?? DEFAULT_CDP_COMMAND_TIMEOUT_MS;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.sleep = options.sleep ?? sleep;
    this.webSocketFactory =
      options.webSocketFactory ?? ((url) => new WebSocket(url));
  }

  async start(_input: BrowserSessionStartInput): Promise<BrowserSessionStart> {
    const created = await this.guardedCall({
      call: () =>
        this.requestJson(
          "sessions",
          {
            body: JSON.stringify({
              keepAlive: true,
              projectId: this.options.projectId,
              timeout: BROWSER_SESSION_TIMEOUT_SECONDS,
            }),
            method: "POST",
          },
          createSessionResponseSchema,
        ),
      operation: "browserSession.create",
      units: 1,
    });

    try {
      const debug = await this.debugSession(created.id);
      await this.guardedCall({
        call: () => this.prepareEspnLogin(debug.wsUrl),
        continuation: true,
        operation: "browserSession.prepare",
        units: 0,
      });
      return {
        liveViewUrl: debug.debuggerFullscreenUrl,
        sessionId: created.id,
      };
    } catch (error) {
      try {
        await this.releaseSession(created.id);
      } catch {
        // Preserve the original start failure; cleanup is best-effort here.
      }
      throw error;
    }
  }

  async captureCredentials(sessionId: string): Promise<EspnCookieCredentials> {
    const debug = await this.debugSession(sessionId);
    return this.guardedCall({
      call: () => this.pollForEspnCredentials(debug.wsUrl),
      continuation: true,
      operation: "browserSession.capture",
      units: 0,
    });
  }

  async end(sessionId: string): Promise<void> {
    await this.releaseSession(sessionId);
  }

  private async debugSession(sessionId: string): Promise<DebugSessionResponse> {
    return this.guardedCall({
      call: () =>
        this.requestJson(
          `sessions/${encodeURIComponent(sessionId)}/debug`,
          { method: "GET" },
          debugSessionResponseSchema,
        ),
      continuation: true,
      operation: "browserSession.debug",
      units: 0,
    });
  }

  private async releaseSession(sessionId: string): Promise<void> {
    await this.guardedCall({
      call: async () => {
        await this.request(
          `sessions/${encodeURIComponent(sessionId)}`,
          {
            body: JSON.stringify({
              projectId: this.options.projectId,
              status: "REQUEST_RELEASE",
            }),
            method: "POST",
          },
          true,
        );
      },
      continuation: true,
      operation: "browserSession.release",
      units: 0,
    });
  }

  private async prepareEspnLogin(wsUrl: string): Promise<void> {
    const connection = await this.openCdpConnection(wsUrl);
    try {
      const created = targetCreatedSchema.safeParse(
        await connection.command(
          "Target.createTarget",
          { background: false, url: ESPN_LOGIN_URL },
          this.cdpCommandTimeoutMs,
        ),
      );
      if (!created.success) {
        throw new BrowserbaseSessionError("BROWSERBASE_INVALID_RESPONSE");
      }
      await connection.command(
        "Target.activateTarget",
        { targetId: created.data.targetId },
        this.cdpCommandTimeoutMs,
      );
    } finally {
      connection.close();
    }
  }

  private async pollForEspnCredentials(
    wsUrl: string,
  ): Promise<EspnCookieCredentials> {
    const deadline = this.now() + this.captureTimeoutMs;
    const connection = await this.openCdpConnection(
      wsUrl,
      Math.min(this.cdpCommandTimeoutMs, this.captureTimeoutMs),
    );
    let successfulReads = 0;

    try {
      for (let attempt = 0; attempt < this.capturePollAttempts; attempt += 1) {
        const remainingMs = deadline - this.now();
        if (remainingMs <= 0) {
          break;
        }
        const response = cdpCookiesSchema.safeParse(
          await connection.command(
            "Storage.getCookies",
            {},
            Math.min(this.cdpCommandTimeoutMs, remainingMs),
          ),
        );
        if (!response.success) {
          throw new BrowserbaseSessionError("BROWSERBASE_INVALID_RESPONSE");
        }
        successfulReads += 1;

        const credentials = credentialsFromCookies(response.data.cookies);
        if (credentials) {
          return credentials;
        }

        if (attempt + 1 < this.capturePollAttempts) {
          const delayMs = Math.min(
            this.capturePollIntervalMs,
            Math.max(0, deadline - this.now()),
          );
          if (delayMs === 0) {
            break;
          }
          await this.sleep(delayMs);
        }
      }
    } finally {
      connection.close();
    }

    throw new BrowserbaseSessionError(
      successfulReads > 0
        ? "BROWSERBASE_COOKIES_NOT_FOUND"
        : "BROWSERBASE_CAPTURE_TIMEOUT",
    );
  }

  private openCdpConnection(
    wsUrl: string,
    timeoutMs = this.cdpCommandTimeoutMs,
  ): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      let socket: BrowserbaseWebSocket;
      try {
        socket = this.webSocketFactory(wsUrl);
      } catch {
        reject(new BrowserbaseSessionError("BROWSERBASE_REQUEST_FAILED"));
        return;
      }

      let settled = false;
      const finish = (
        error: BrowserbaseSessionError | null,
        connection?: CdpConnection,
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        socket.onclose = null;
        socket.onerror = null;
        socket.onopen = null;
        if (error) {
          try {
            socket.close(1000);
          } catch {
            // The connection may still be opening; rejection remains primary.
          }
          reject(error);
        } else if (connection) {
          resolve(connection);
        }
      };
      const timeout = setTimeout(
        () =>
          finish(new BrowserbaseSessionError("BROWSERBASE_CAPTURE_TIMEOUT")),
        timeoutMs,
      );

      socket.onclose = () =>
        finish(new BrowserbaseSessionError("BROWSERBASE_SESSION_EXPIRED"));
      socket.onerror = () =>
        finish(new BrowserbaseSessionError("BROWSERBASE_REQUEST_FAILED"));
      socket.onopen = () => finish(null, new CdpConnection(socket));
    });
  }

  private async requestJson<T extends z.ZodType>(
    path: string,
    init: RequestInit,
    schema: T,
  ): Promise<z.infer<T>> {
    const response = await this.request(path, init);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BrowserbaseSessionError("BROWSERBASE_INVALID_RESPONSE");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BrowserbaseSessionError("BROWSERBASE_INVALID_RESPONSE");
    }
    return parsed.data;
  }

  private async request(
    path: string,
    init: RequestInit,
    allowMissingSession = false,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    let response: Response;
    try {
      response = await this.fetch(new URL(path, this.apiBaseUrl), {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-BB-API-Key": this.options.apiKey,
        },
        signal: controller.signal,
      });
    } catch {
      throw new BrowserbaseSessionError("BROWSERBASE_REQUEST_FAILED");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404 || response.status === 410) {
      if (allowMissingSession) {
        return response;
      }
      throw new BrowserbaseSessionError("BROWSERBASE_SESSION_EXPIRED");
    }
    if (!response.ok) {
      throw new BrowserbaseSessionError("BROWSERBASE_REQUEST_FAILED");
    }
    return response;
  }

  private guardedCall<T>({
    call,
    continuation = false,
    operation,
    units,
  }: {
    call: () => Promise<T>;
    continuation?: boolean;
    operation: string;
    units: number;
  }): Promise<T> {
    return runGuardedProviderCall({
      continuation,
      guard: this.options.spendGuard,
      logger: this.options.logger,
      mockCall: async () => {
        throw new BrowserbaseSessionError("BROWSERBASE_SPEND_GUARD_CAP");
      },
      operation,
      provider: "browserbase",
      realCall: async () => ({
        usage: { units },
        value: await call(),
      }),
    });
  }
}

export function createBrowserbaseSession(
  options: BrowserbaseSessionOptions,
): BrowserSession {
  return new BrowserbaseBrowserSession(options);
}
