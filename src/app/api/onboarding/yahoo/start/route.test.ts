import { describe, expect, it, vi } from "vitest";
import { AppError, ok } from "@/core/result";
import { YAHOO_OAUTH_RETURN_TO_COOKIE } from "@/onboarding/return-to";
import { YAHOO_OAUTH_STATE_COOKIE } from "@/onboarding/yahoo-service";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

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
    startYahooOAuth: vi.fn(() =>
      ok({ authorizationUrl: "https://login.yahoo.test/oauth" }),
    ),
  };
});

describe("POST /api/onboarding/yahoo/start", () => {
  it("stores sanitized invite return paths for the OAuth callback", async () => {
    const response = await POST(
      new Request("https://rumbledore.test/api/onboarding/yahoo/start", {
        body: JSON.stringify({ returnTo: "/invite/league/token" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(YAHOO_OAUTH_STATE_COOKIE);
    expect(setCookie).toContain(
      `${YAHOO_OAUTH_RETURN_TO_COOKIE}=%2Finvite%2Fleague%2Ftoken`,
    );
  });

  it("does not store external return paths", async () => {
    const response = await POST(
      new Request("https://rumbledore.test/api/onboarding/yahoo/start", {
        body: JSON.stringify({ returnTo: "https://example.com/invite" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${YAHOO_OAUTH_RETURN_TO_COOKIE}=;`);
  });

  it("returns auth errors before starting OAuth", async () => {
    const { requireSession } = await import("@/auth/guards");
    vi.mocked(requireSession).mockResolvedValueOnce({
      error: new AppError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
        status: 401,
      }),
      ok: false,
    });

    const response = await POST(
      new Request("https://rumbledore.test/api/onboarding/yahoo/start", {
        body: "{}",
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });
});
