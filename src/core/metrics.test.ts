// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import {
  getMetricsSnapshot,
  recordApiHandler,
  recordApiMetric,
  recordJobMetric,
  recordJobRun,
  recordProviderUsage,
  resetMetricsForTests,
} from "./metrics";

beforeEach(() => {
  resetMetricsForTests();
});

describe("metrics recorder", () => {
  it("records API status counts, durations, and p95 without request details", () => {
    recordApiMetric({
      durationMs: 10,
      method: "GET",
      route: "/api/health",
      status: 200,
    });
    recordApiMetric({
      durationMs: 20,
      method: "GET",
      route: "/api/health",
      status: 503,
    });
    recordApiMetric({
      durationMs: 100,
      method: "POST",
      route: "/api/onboarding/espn/manual",
      status: 401,
    });

    const snapshot = getMetricsSnapshot(
      () => new Date("2026-06-12T00:00:00.000Z"),
    );

    expect(snapshot.generatedAt).toBe("2026-06-12T00:00:00.000Z");
    expect(snapshot.api.routes["GET /api/health"]).toEqual({
      averageDurationMs: 15,
      count: 2,
      errorCount: 1,
      p95DurationMs: 20,
      statusCounts: { "200": 1, "503": 1 },
      successCount: 1,
    });
    expect(snapshot.api.total).toEqual({
      averageDurationMs: 43,
      count: 3,
      errorCount: 1,
      p95DurationMs: 100,
      statusCounts: { "200": 1, "401": 1, "503": 1 },
      successCount: 2,
    });
    expect(JSON.stringify(snapshot)).not.toContain("authorization");
    expect(JSON.stringify(snapshot)).not.toContain("cookie");
  });

  it("wraps API handlers and records thrown errors as 500s", async () => {
    const ok = recordApiHandler(
      { method: "GET", route: "/api/example" },
      async () => new Response(null, { status: 204 }),
    );
    const fail = recordApiHandler(
      { method: "POST", route: "/api/example" },
      async () => {
        throw new Error("boom");
      },
    );

    await expect(ok()).resolves.toMatchObject({ status: 204 });
    await expect(fail()).rejects.toThrow("boom");

    const snapshot = getMetricsSnapshot();
    expect(snapshot.api.routes["GET /api/example"]).toMatchObject({
      count: 1,
      errorCount: 0,
      statusCounts: { "204": 1 },
    });
    expect(snapshot.api.routes["POST /api/example"]).toMatchObject({
      count: 1,
      errorCount: 1,
      statusCounts: { "500": 1 },
    });
  });

  it("records job success and failure while rethrowing failures", async () => {
    recordJobMetric({
      durationMs: 25,
      functionId: "app-ping",
      ok: true,
    });

    await expect(
      recordJobRun("content-generate", async () => {
        throw new Error("content failed");
      }),
    ).rejects.toThrow("content failed");

    const snapshot = getMetricsSnapshot();
    expect(snapshot.jobs.functions["app-ping"]).toMatchObject({
      count: 1,
      errorCount: 0,
      p95DurationMs: 25,
      successCount: 1,
    });
    expect(snapshot.jobs.functions["content-generate"]).toMatchObject({
      count: 1,
      errorCount: 1,
      successCount: 0,
    });
    expect(snapshot.jobs.total).toMatchObject({
      count: 2,
      errorCount: 1,
      successCount: 1,
    });
  });

  it("records provider usage totals without request details", () => {
    const first = recordProviderUsage({
      cap: 10,
      cumulative: 3,
      demoted: false,
      operation: "web.fetch",
      provider: "tavily",
      unit: "requests",
      units: 3,
    });
    const second = recordProviderUsage({
      cap: 10,
      cumulative: 10,
      demoted: true,
      operation: "web.fetch",
      provider: "tavily",
      unit: "requests",
      units: 0,
    });

    expect(first).toMatchObject({
      callCount: 1,
      demotionCount: 0,
      percentConsumed: 30,
      realCallCount: 1,
      totalUnits: 3,
    });
    expect(second).toMatchObject({
      callCount: 2,
      demotionCount: 1,
      latestCumulative: 10,
      percentConsumed: 100,
      realCallCount: 1,
      totalUnits: 3,
    });

    const snapshot = getMetricsSnapshot();
    expect(snapshot.providerUsage.providers.tavily).toEqual({
      callCount: 2,
      cap: 10,
      demotionCount: 1,
      latestCumulative: 10,
      operations: {
        "web.fetch": {
          callCount: 2,
          demotionCount: 1,
          totalUnits: 3,
        },
      },
      percentConsumed: 100,
      realCallCount: 1,
      totalUnits: 3,
      unit: "requests",
    });
    expect(snapshot.providerUsage.total).toEqual({
      callCount: 2,
      demotionCount: 1,
      realCallCount: 1,
      totalUnits: 3,
    });
    expect(JSON.stringify(snapshot)).not.toContain("authorization");
    expect(JSON.stringify(snapshot)).not.toContain("headers");
    expect(JSON.stringify(snapshot)).not.toContain("cookie");
  });
});
