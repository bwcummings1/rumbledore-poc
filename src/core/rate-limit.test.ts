// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { enforceApiRateLimit } from "./rate-limit";
import { MemorySpendCounterStore } from "./spend-guard";

vi.mock("server-only", () => ({}));

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
});
