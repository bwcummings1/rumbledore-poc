import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fanApiFixture from "../../../test/fixtures/espn/fan-api-95050.json";
import {
  AuthExpiredError,
  ProviderBlockedError,
  ProviderParseError,
} from "../model";
import {
  createEspnDiscoveryClient,
  createEspnDiscoveryProvider,
  type EspnCookieCredentials,
  type EspnFetch,
  type EspnSession,
} from "./client";

const fixtureSwid = "{00000000-0000-4000-8000-000000000001}";
const fixtureEspnS2 = "fixture-session-value"; // ubs:ignore — fake ESPN cookie value for adapter tests

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function createCapturingFetch(response: Response): {
  calls: { init: RequestInit | undefined; url: string }[];
  fetch: EspnFetch;
} {
  const calls: { init: RequestInit | undefined; url: string }[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      calls.push({ init, url: input.toString() });
      return response;
    },
  };
}

function fixtureCredentials(
  overrides: Partial<EspnCookieCredentials> = {},
): EspnCookieCredentials {
  return {
    swid: fixtureSwid,
    espn_s2: fixtureEspnS2,
    ...overrides,
  };
}

function fixtureSession(overrides: Partial<EspnSession> = {}): EspnSession {
  return {
    provider: "espn",
    authKind: "cookie",
    subjectProviderId: fixtureSwid,
    swid: fixtureSwid,
    espn_s2: fixtureEspnS2,
    ...overrides,
  };
}

describe("ESPN Fan API discovery client", () => {
  it("authenticates cookie credentials against the Fan API", async () => {
    const { calls, fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate(fixtureCredentials());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({
      provider: "espn",
      authKind: "cookie",
      subjectProviderId: fanApiFixture.id,
      swid: fixtureSwid,
      espn_s2: fixtureEspnS2,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://fan.api.espn.com/apis/v2/fans/%7B00000000-0000-4000-8000-000000000001%7D",
    );
  });

  it("exposes an ESPN auth/discovery provider with declared capabilities", async () => {
    const { fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const provider = createEspnDiscoveryProvider({ fetch, retryDelayMs: 0 });

    expect(provider).toMatchObject({
      id: "espn",
      name: "ESPN Fantasy Football",
      capabilities: {
        authKind: "cookie",
        requiresOAuth: false,
        supportsHistory: true,
        supportsRosters: true,
        supportsTransactions: true,
      },
    });
    await expect(
      provider.authenticate(fixtureCredentials()),
    ).resolves.toMatchObject({ ok: true });
  });

  it("uses ESPN's required spoofed headers on Fan API requests", async () => {
    const { calls, fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    await client.authenticate(
      fixtureCredentials({ swid: fixtureSwid.slice(1, -1) }),
    );

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers).toMatchObject({
      Accept: "application/json",
      "x-fantasy-source": "kona",
      "x-fantasy-platform": "kona",
      "X-Personalization-Source": "ESPN.com - FAM",
    });
    expect(headers.Cookie).toBe(
      `SWID=${fixtureSwid}; espn_s2=${fixtureEspnS2}`,
    );
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
  });

  it("discovers normalized FFL leagues from the scrubbed Fan API fixture", async () => {
    const { fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.discoverLeagues(fixtureSession());

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual([
      {
        provider: "espn",
        providerId: "95050",
        season: 2026,
        sport: "ffl",
        name: "NHS Alumni Annual",
        size: 12,
        teamName: "Fixture Team",
      },
    ]);
  });

  it("rejects malformed or missing cookie credentials before making a request", async () => {
    const { calls, fetch } = createCapturingFetch(jsonResponse(fanApiFixture));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate(
      fixtureCredentials({ swid: "not-a-guid", espn_s2: "" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(AuthExpiredError);
    expect(calls).toHaveLength(0);
  });

  it("maps an ESPN auth failure to AuthExpiredError", async () => {
    const { fetch } = createCapturingFetch(jsonResponse({}, { status: 401 }));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate(fixtureCredentials());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(AuthExpiredError);
  });

  it("retries retryable ESPN blocks before returning ProviderBlockedError", async () => {
    const calls: string[] = [];
    const fetch: EspnFetch = async (input) => {
      calls.push(input.toString());
      return jsonResponse({}, { status: 403 });
    };
    const client = createEspnDiscoveryClient({
      fetch,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    const result = await client.authenticate(fixtureCredentials());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(ProviderBlockedError);
    expect(calls).toHaveLength(2);
  });

  it("returns ProviderParseError for non-object Fan API payloads", async () => {
    const { fetch } = createCapturingFetch(jsonResponse([]));
    const client = createEspnDiscoveryClient({ fetch, retryDelayMs: 0 });

    const result = await client.authenticate(fixtureCredentials());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth to fail");
    expect(result.error).toBeInstanceOf(ProviderParseError);
  });

  it("keeps the public ESPN provider entry server-only", () => {
    const source = readFileSync(
      join(process.cwd(), "src/providers/espn/index.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
  });
});
