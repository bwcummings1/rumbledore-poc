import { InngestTestEngine } from "@inngest/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeeklyDigestDependencies } from "@/email";
import { JOB_EVENTS } from "./events";
import { createWeeklyDigestFunction, functions, weeklyDigest } from "./index";

const mocks = vi.hoisted(() => ({
  sendWeeklyDigests: vi.fn(),
}));

vi.mock("@/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/email")>();
  return {
    ...actual,
    sendWeeklyDigests: mocks.sendWeeklyDigests,
  };
});

const deps = {
  appUrl: "https://app.example.test",
  db: {},
  emailSender: { config: { mock: true }, sendEmail: vi.fn() },
} as unknown as WeeklyDigestDependencies;

afterEach(() => {
  vi.clearAllMocks();
});

describe("weekly digest Inngest function", () => {
  it("runs the weekly digest sender through the step API", async () => {
    mocks.sendWeeklyDigests.mockResolvedValue({
      delivered: 1,
      failed: 0,
      leagueCount: 1,
      results: [
        {
          contentCount: 2,
          delivered: 1,
          empty: false,
          failed: 0,
          leagueId: "00000000-0000-4000-8000-000000000001",
          recipientCount: 1,
          skipped: 0,
          windowEnd: "2026-06-14T00:00:00.000Z",
          windowStart: "2026-06-07T00:00:00.000Z",
        },
      ],
      skipped: 0,
      windowEnd: "2026-06-14T00:00:00.000Z",
      windowStart: "2026-06-07T00:00:00.000Z",
    });
    const fn = createWeeklyDigestFunction(() => deps);
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        leagueId: "00000000-0000-4000-8000-000000000001",
        windowEnd: "2026-06-14T00:00:00.000Z",
        windowStart: "2026-06-07T00:00:00.000Z",
      },
      name: JOB_EVENTS.weeklyDigest,
    };

    const stepRun = await testEngine.executeStep("send-weekly-digests", {
      events: [event],
    });
    expect(stepRun.result).toMatchObject({
      delivered: 1,
      eventName: JOB_EVENTS.weeklyDigest,
      ok: true,
    });
    expect(mocks.sendWeeklyDigests).toHaveBeenCalledWith(deps, {
      leagueId: "00000000-0000-4000-8000-000000000001",
      leagueIds: undefined,
      limit: undefined,
      windowEnd: "2026-06-14T00:00:00.000Z",
      windowStart: "2026-06-07T00:00:00.000Z",
    });
  });

  it("accepts the scheduled timer payload", async () => {
    mocks.sendWeeklyDigests.mockResolvedValue({
      delivered: 0,
      failed: 0,
      leagueCount: 0,
      results: [],
      skipped: 0,
      windowEnd: "2026-06-14T00:00:00.000Z",
      windowStart: "2026-06-07T00:00:00.000Z",
    });
    const fn = createWeeklyDigestFunction(() => deps);
    const testEngine = new InngestTestEngine({ function: fn });

    const { result } = await testEngine.execute({
      events: [{ data: {}, name: "inngest/scheduled.timer" }],
    });

    expect(result).toMatchObject({
      eventName: JOB_EVENTS.weeklyDigest,
      ok: true,
      results: [],
    });
  });

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(weeklyDigest);
  });
});
