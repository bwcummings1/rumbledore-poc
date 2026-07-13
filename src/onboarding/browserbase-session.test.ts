// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createLogger } from "@/core/logging";
import { MemorySpendCounterStore, SpendGuard } from "@/core/spend-guard";
import { MockBrowserSession } from "./browser-session";
import {
  BrowserbaseBrowserSession,
  BrowserbaseSessionError,
} from "./browserbase-session";
import { createEspnBrowserSession } from "./deps";

vi.mock("server-only", () => ({}));

const VENDOR_SESSION_ID = "10000000-0000-4000-8000-000000000001";
const APP_SESSION_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "30000000-0000-4000-8000-000000000003";
const LIVE_VIEW_URL = `https://www.browserbase.test/live/${VENDOR_SESSION_ID}`;
const CDP_URL = `wss://connect.browserbase.test/session/${VENDOR_SESSION_ID}`;

function fixtureApiKey(): string {
  return ["fixture", "browserbase", "private", "value"].join("-");
}

function fixtureProjectId(): string {
  return ["fixture", "browserbase", "project"].join("-");
}

function fixtureSwid(): string {
  return "{00000000-0000-4000-8000-000000000001}";
}

function fixtureEspnS2(): string {
  return ["fixture", "espn", "cookie", "value"].join("-");
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function parseFixtureJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (cause) {
    throw new Error("Expected valid JSON from the adapter fixture", { cause });
  }
}

function spendGuard(cap = 10): SpendGuard {
  const env = parseEnv({ SPEND_GUARD_BROWSERBASE_SESSIONS: String(cap) });
  return new SpendGuard({
    config: env.spendGuard,
    logger: createLogger({ sink: () => undefined }),
    store: new MemorySpendCounterStore(),
  });
}

function urlFromRequest(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

interface HttpFixtureOptions {
  debugStatus?: number;
}

function browserbaseHttpFixture(options: HttpFixtureOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlFromRequest(input);
    const method = init?.method ?? "GET";

    if (url.pathname === "/v1/sessions" && method === "POST") {
      return jsonResponse({ id: VENDOR_SESSION_ID, status: "RUNNING" });
    }
    if (
      url.pathname === `/v1/sessions/${VENDOR_SESSION_ID}/debug` &&
      method === "GET"
    ) {
      if (options.debugStatus) {
        return jsonResponse({}, { status: options.debugStatus });
      }
      return jsonResponse({
        debuggerFullscreenUrl: LIVE_VIEW_URL,
        wsUrl: CDP_URL,
      });
    }
    if (
      url.pathname === `/v1/sessions/${VENDOR_SESSION_ID}` &&
      method === "POST"
    ) {
      return new Response(null, { status: 204 });
    }
    return jsonResponse({}, { status: 500 });
  });
}

interface CdpCookieFixture {
  domain: string;
  name: string;
  value: string;
}

class FakeBrowserbaseWebSocket {
  readonly commands: Array<{
    id: number;
    method: string;
    params: Record<string, unknown>;
  }> = [];
  onclose: ((event: CloseEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null = null;
  onopen: ((event: Event) => unknown) | null = null;
  readyState: number = WebSocket.CONNECTING;

  constructor(
    readonly url: string,
    private readonly cookieBatches: CdpCookieFixture[][],
    private readonly hangCookieRead = false,
  ) {
    queueMicrotask(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event("open"));
    });
  }

  send(data: string): void {
    const command = parseFixtureJson(data) as {
      id: number;
      method: string;
      params: Record<string, unknown>;
    };
    this.commands.push(command);
    if (this.hangCookieRead && command.method === "Storage.getCookies") {
      return;
    }

    let result: unknown = {};
    switch (command.method) {
      case "Target.createTarget":
        result = { targetId: "fixture-target" };
        break;
      case "Storage.getCookies":
        result = { cookies: this.cookieBatches.shift() ?? [] };
        break;
      default:
        break;
    }

    queueMicrotask(() => {
      this.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            method: "Browserbase.fixtureEvent",
            params: {},
          }),
        }),
      );
      this.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({ id: command.id, result }),
        }),
      );
    });
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
  }
}

function createAdapter({
  capturePollAttempts = 3,
  capturePollIntervalMs = 1,
  captureTimeoutMs = 50,
  cdpCommandTimeoutMs = 25,
  cookieBatches = [],
  fetch = browserbaseHttpFixture(),
  guard = spendGuard(),
  hangCookieRead = false,
  logger = createLogger({ sink: () => undefined }),
}: {
  capturePollAttempts?: number;
  capturePollIntervalMs?: number;
  captureTimeoutMs?: number;
  cdpCommandTimeoutMs?: number;
  cookieBatches?: CdpCookieFixture[][];
  fetch?: ReturnType<typeof browserbaseHttpFixture>;
  guard?: SpendGuard;
  hangCookieRead?: boolean;
  logger?: ReturnType<typeof createLogger>;
} = {}) {
  const sockets: FakeBrowserbaseWebSocket[] = [];
  const adapter = new BrowserbaseBrowserSession({
    apiKey: fixtureApiKey(),
    capturePollAttempts,
    capturePollIntervalMs,
    captureTimeoutMs,
    cdpCommandTimeoutMs,
    fetch,
    logger,
    projectId: fixtureProjectId(),
    sleep: async () => undefined,
    spendGuard: guard,
    webSocketFactory: (url) => {
      const socket = new FakeBrowserbaseWebSocket(
        url,
        cookieBatches,
        hangCookieRead,
      );
      sockets.push(socket);
      return socket;
    },
  });
  return { adapter, fetch, guard, sockets };
}

function expectBrowserbaseError(
  error: unknown,
  code: BrowserbaseSessionError["code"],
): boolean {
  expect(error).toBeInstanceOf(BrowserbaseSessionError);
  expect((error as BrowserbaseSessionError).code).toBe(code);
  return true;
}

describe("BrowserbaseBrowserSession", () => {
  it("creates, prepares, captures ESPN cookies, and releases one guarded session", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      sink: (line) => lines.push(line),
    });
    const { adapter, fetch, guard, sockets } = createAdapter({
      cookieBatches: [
        [{ domain: ".espn.com", name: "unrelated", value: "ignored" }],
        [
          { domain: ".espn.com", name: "SWID", value: fixtureSwid() },
          {
            domain: "secure.espn.com",
            name: "espn_s2",
            value: fixtureEspnS2(),
          },
        ],
      ],
      logger,
    });

    const started = await adapter.start({
      sessionId: APP_SESSION_ID,
      userId: USER_ID,
    });
    expect(started).toEqual({
      liveViewUrl: LIVE_VIEW_URL,
      sessionId: VENDOR_SESSION_ID,
    });
    await expect(
      adapter.captureCredentials(started.sessionId),
    ).resolves.toEqual({
      espn_s2: fixtureEspnS2(),
      swid: fixtureSwid(),
    });
    await adapter.end(started.sessionId);

    expect(fetch).toHaveBeenCalledTimes(4);
    for (const [input, init] of fetch.mock.calls) {
      expect(urlFromRequest(input).hostname).toBe("api.browserbase.com");
      expect(new Headers(init?.headers).get("X-BB-API-Key")).toBe(
        fixtureApiKey(),
      );
    }
    const createBody = parseFixtureJson(String(fetch.mock.calls[0]?.[1]?.body));
    expect(createBody).toEqual({
      keepAlive: true,
      projectId: fixtureProjectId(),
      timeout: 900,
    });
    const releaseBody = parseFixtureJson(
      String(fetch.mock.calls[3]?.[1]?.body),
    );
    expect(releaseBody).toEqual({
      projectId: fixtureProjectId(),
      status: "REQUEST_RELEASE",
    });
    expect(sockets).toHaveLength(2);
    expect(sockets.every((socket) => socket.url === CDP_URL)).toBe(true);
    expect(sockets.flatMap((socket) => socket.commands)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "Target.createTarget",
          params: {
            background: false,
            url: "https://www.espn.com/login",
          },
        }),
        expect.objectContaining({ method: "Target.activateTarget" }),
        expect.objectContaining({ method: "Storage.getCookies" }),
      ]),
    );
    await expect(guard.snapshot("browserbase")).resolves.toMatchObject({
      cumulative: 1,
      unit: "sessions",
    });

    const serializedLogs = lines.join("\n");
    expect(serializedLogs).not.toContain(fixtureApiKey());
    expect(serializedLogs).not.toContain(VENDOR_SESSION_ID);
    expect(serializedLogs).not.toContain(fixtureSwid());
    expect(serializedLogs).not.toContain(fixtureEspnS2());
  });

  it("fails closed at the session cap without touching HTTP or CDP", async () => {
    const guard = spendGuard(1);
    await guard.record("browserbase", { units: 1 });
    const { adapter, fetch, sockets } = createAdapter({ guard });

    await expect(
      adapter.start({ sessionId: APP_SESSION_ID, userId: USER_ID }),
    ).rejects.toSatisfy((error: unknown) =>
      expectBrowserbaseError(error, "BROWSERBASE_SPEND_GUARD_CAP"),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
  });

  it("classifies an expired provider session before opening CDP", async () => {
    const fetch = browserbaseHttpFixture({ debugStatus: 410 });
    const { adapter, sockets } = createAdapter({ fetch });

    await expect(
      adapter.captureCredentials(VENDOR_SESSION_ID),
    ).rejects.toSatisfy((error: unknown) =>
      expectBrowserbaseError(error, "BROWSERBASE_SESSION_EXPIRED"),
    );
    expect(sockets).toHaveLength(0);
  });

  it("classifies a bounded CDP command timeout", async () => {
    const { adapter } = createAdapter({
      captureTimeoutMs: 10,
      cdpCommandTimeoutMs: 5,
      hangCookieRead: true,
    });

    await expect(
      adapter.captureCredentials(VENDOR_SESSION_ID),
    ).rejects.toSatisfy((error: unknown) =>
      expectBrowserbaseError(error, "BROWSERBASE_CAPTURE_TIMEOUT"),
    );
  });

  it("classifies bounded polling that never finds both ESPN cookies", async () => {
    const { adapter, sockets } = createAdapter({
      capturePollAttempts: 2,
      cookieBatches: [
        [{ domain: ".espn.com", name: "SWID", value: fixtureSwid() }],
        [
          {
            domain: "example.com",
            name: "espn_s2",
            value: fixtureEspnS2(),
          },
        ],
      ],
    });

    await expect(
      adapter.captureCredentials(VENDOR_SESSION_ID),
    ).rejects.toSatisfy((error: unknown) =>
      expectBrowserbaseError(error, "BROWSERBASE_COOKIES_NOT_FOUND"),
    );
    expect(
      sockets
        .flatMap((socket) => socket.commands)
        .filter((command) => command.method === "Storage.getCookies"),
    ).toHaveLength(2);
  });
});

describe("createEspnBrowserSession", () => {
  it("does not construct the Browserbase adapter while mock mode is forced", () => {
    const env = parseEnv({
      BROWSERBASE_API_KEY: fixtureApiKey(),
      BROWSERBASE_PROJECT_ID: fixtureProjectId(),
      MOCK_BROWSERBASE: "true",
    });

    expect(createEspnBrowserSession(env)).toBeInstanceOf(MockBrowserSession);
  });

  it("constructs the real adapter only for validated real configuration", () => {
    const env = parseEnv({
      BROWSERBASE_API_KEY: fixtureApiKey(),
      BROWSERBASE_PROJECT_ID: fixtureProjectId(),
      MOCK_BROWSERBASE: "false",
    });

    expect(
      createEspnBrowserSession(env, { spendGuard: spendGuard() }),
    ).toBeInstanceOf(BrowserbaseBrowserSession);
  });
});
