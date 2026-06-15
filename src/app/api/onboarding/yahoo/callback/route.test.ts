import { describe, expect, it, vi } from "vitest";
import { ok } from "@/core/result";
import { YAHOO_OAUTH_RETURN_TO_COOKIE } from "@/onboarding/return-to";
import { YAHOO_OAUTH_STATE_COOKIE } from "@/onboarding/yahoo-service";
import { GET } from "./route";

const cookieValues = vi.hoisted(() => new Map<string, string>());

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get(name: string) {
      const value = cookieValues.get(name);
      return value ? { name, value } : undefined;
    },
  })),
}));

vi.mock("@/auth/guards", () => ({
  requireSession: vi.fn(async () =>
    ok({ session: { user: { id: "user-1" } }, userId: "user-1" }),
  ),
}));

vi.mock("@/onboarding/deps", () => ({
  getYahooOnboardingDependencies: vi.fn(() => ({})),
}));

vi.mock("@/onboarding/yahoo-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/onboarding/yahoo-service")>();
  return {
    ...actual,
    connectYahooOAuth: vi.fn(async () =>
      ok({
        credentialId: "credential-1", // ubs:ignore - fixture row id, not a credential secret
        discoveredLeagues: [],
      }),
    ),
  };
});

describe("GET /api/onboarding/yahoo/callback", () => {
  it("preserves invite return paths after a successful OAuth callback", async () => {
    cookieValues.set(YAHOO_OAUTH_STATE_COOKIE, "state-1");
    cookieValues.set(
      YAHOO_OAUTH_RETURN_TO_COOKIE,
      "%2Finvite%2Fleague%2Ftoken",
    );

    const response = await GET(
      new Request(
        "https://rumbledore.test/api/onboarding/yahoo/callback?code=abc&state=state-1",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://rumbledore.test/onboarding/yahoo?connected=1&returnTo=%2Finvite%2Fleague%2Ftoken",
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${YAHOO_OAUTH_RETURN_TO_COOKIE}=;`);
  });

  it("drops unsafe return paths from callback redirects", async () => {
    cookieValues.set(YAHOO_OAUTH_STATE_COOKIE, "state-1");
    cookieValues.set(YAHOO_OAUTH_RETURN_TO_COOKIE, "https://example.com");

    const response = await GET(
      new Request(
        "https://rumbledore.test/api/onboarding/yahoo/callback?code=abc&state=state-1",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://rumbledore.test/onboarding/yahoo?connected=1",
    );
  });
});
