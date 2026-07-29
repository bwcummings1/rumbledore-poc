// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  type ApiRateLimitGuardRule,
  enforceApiRateLimit,
  enforceApiRateLimitOrReject,
} from "./rate-limit";
import { MemorySpendCounterStore } from "./spend-guard";

vi.mock("server-only", () => ({}));

function guardRule(max: number): ApiRateLimitGuardRule {
  return {
    max,
    message: "Too many requests. Try again shortly.",
    scope: `test-${crypto.randomUUID()}`,
    subject: "user-1",
    windowSeconds: 45,
  };
}

describe("API rate limiting", () => {
  it("allows requests through the configured cap, then denies within the window", async () => {
    const rule = {
      max: 2,
      scope: `test-${crypto.randomUUID()}`,
      subject: "user-1",
      windowSeconds: 60,
    };
    const store = new MemorySpendCounterStore();

    await expect(enforceApiRateLimit(rule, store)).resolves.toMatchObject({
      allowed: true,
      count: 1,
    });
    await expect(enforceApiRateLimit(rule, store)).resolves.toMatchObject({
      allowed: true,
      count: 2,
    });
    await expect(enforceApiRateLimit(rule, store)).resolves.toMatchObject({
      allowed: false,
      count: 3,
      retryAfterSeconds: 60,
    });
  });

  it("returns no response while a caller is inside the cap", async () => {
    const rule = guardRule(2);
    const store = new MemorySpendCounterStore();

    await expect(enforceApiRateLimitOrReject(rule, store)).resolves.toBeNull();
    await expect(enforceApiRateLimitOrReject(rule, store)).resolves.toBeNull();
  });

  it("rejects with a 429 and a Retry-After matching the window", async () => {
    const rule = guardRule(1);
    const store = new MemorySpendCounterStore();

    await enforceApiRateLimitOrReject(rule, store);
    const rejection = await enforceApiRateLimitOrReject(rule, store);

    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(429);
    expect(rejection?.headers.get("Retry-After")).toBe("45");
    expect(rejection?.headers.get("Cache-Control")).toBe("no-store");
    await expect(rejection?.json()).resolves.toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again shortly.",
      },
    });
  });

  it("keeps the bucket subject out of the rejection body", async () => {
    const rule = guardRule(1);
    const store = new MemorySpendCounterStore();

    await enforceApiRateLimitOrReject(rule, store);
    const rejection = await enforceApiRateLimitOrReject(rule, store);

    expect(await rejection?.text()).not.toContain(rule.subject);
  });

  it("counts each subject separately", async () => {
    const store = new MemorySpendCounterStore();
    const scope = `test-${crypto.randomUUID()}`;
    const base = { max: 1, message: "nope", scope, windowSeconds: 30 };

    await enforceApiRateLimitOrReject({ ...base, subject: "user-a" }, store);

    await expect(
      enforceApiRateLimitOrReject({ ...base, subject: "user-b" }, store),
    ).resolves.toBeNull();
    await expect(
      enforceApiRateLimitOrReject({ ...base, subject: "user-a" }, store),
    ).resolves.not.toBeNull();
  });
});
