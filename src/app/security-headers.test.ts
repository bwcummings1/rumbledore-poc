import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  MOCK_BROWSER_SECURITY_HEADER_RULE,
  SECURITY_HEADER_RULE,
} from "./security-headers";

describe("security headers", () => {
  it("sets a starter CSP and browser hardening headers globally", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain(
      "connect-src 'self' https: wss: ws:",
    );
    expect(SECURITY_HEADER_RULE).toEqual({
      source: "/((?!onboarding/espn/mock-browser).*)",
      headers: expect.arrayContaining([
        {
          key: "Content-Security-Policy",
          value: CONTENT_SECURITY_POLICY,
        },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ]),
    });
  });

  it("keeps the mock hosted-login page frameable by the onboarding route", () => {
    expect(MOCK_BROWSER_SECURITY_HEADER_RULE.source).toBe(
      "/onboarding/espn/mock-browser",
    );
    expect(
      MOCK_BROWSER_SECURITY_HEADER_RULE.headers.some(
        (header) =>
          header.key === "Content-Security-Policy" ||
          header.key === "X-Frame-Options",
      ),
    ).toBe(false);
  });
});
