import { InngestTestEngine } from "@inngest/test";
import { describe, expect, it } from "vitest";
import { centralGenerationKey } from "@/ai/central-generation-key";
import type { NflWeekState } from "@/sports/nfl-calendar";
import { planCentralScheduledContent } from "./central-content-planning";
import { JOB_EVENTS } from "./events";
import {
  centralContentPlanCron,
  createCentralContentPlanCronFunction,
} from "./functions/central-content-plan-cron";
import { centralContentGenerate, functions } from "./index";

const regularWeek: NflWeekState = {
  gamePhase: "quiet",
  phase: "regular",
  seasonWeek: 1,
};

describe("central content cadence", () => {
  it.each([
    ["2026-09-14T14:00:00.000Z", ["weekend-recap-mnf-projection"]],
    [
      "2026-09-15T14:00:00.000Z",
      ["mnf-recap", "pre-waiver", "rankings-projections"],
    ],
    ["2026-09-16T11:00:00.000Z", ["post-waiver"]],
    ["2026-09-16T14:00:00.000Z", ["matchups", "rankings-projections"]],
    ["2026-09-17T14:00:00.000Z", ["matchups", "start-sit"]],
    ["2026-09-18T14:00:00.000Z", ["start-sit"]],
    ["2026-09-19T14:00:00.000Z", ["start-sit"]],
    ["2026-09-20T14:00:00.000Z", ["start-sit"]],
  ])("plans the shared lineup at %s", async (at, expectedColumnIds) => {
    const plan = await planCentralScheduledContent({
      nflWeekState: regularWeek,
      now: () => new Date(at),
    });

    expect(plan.planned.map((event) => event.data.columnId)).toEqual(
      expectedColumnIds,
    );
    expect(plan.planned.every((event) => !("leagueId" in event.data))).toBe(
      true,
    );
    expect(
      plan.planned.every(
        (event) => event.name === JOB_EVENTS.centralContentGenerate,
      ),
    ).toBe(true);
  });

  it("uses stable planner and generation keys for cron retries", async () => {
    const input = {
      nflWeekState: regularWeek,
      now: () => new Date("2026-09-15T14:00:30.000Z"),
    };
    const first = await planCentralScheduledContent(input);
    const second = await planCentralScheduledContent(input);

    expect(second.planned).toEqual(first.planned);
    expect(new Set(first.planned.map((event) => event.id)).size).toBe(
      first.planned.length,
    );
  });

  it("carries same-planning-run siblings into each writer's queued recall", async () => {
    const plan = await planCentralScheduledContent({
      nflWeekState: regularWeek,
      now: () => new Date("2026-09-15T14:00:00.000Z"),
    });

    for (const event of plan.planned) {
      const expectedSiblingKeys = plan.planned
        .filter((sibling) => sibling.data.columnId !== event.data.columnId)
        .map((sibling) => centralGenerationKey(sibling.data));
      expect(event.data.queuedGenerationKeys).toEqual(expectedSiblingKeys);
      expect(event.data.queuedGenerationKeys).not.toContain(
        centralGenerationKey(event.data),
      );
    }
  });

  it("waits for a resolved NFL week instead of publishing fixture week guesses", async () => {
    const result = await planCentralScheduledContent({
      nflWeekState: {
        gamePhase: "quiet",
        phase: "offseason",
        seasonWeek: null,
      },
      now: () => new Date("2026-07-14T14:00:00.000Z"),
    });

    expect(result.columns.map((column) => column.id)).toEqual([
      "mnf-recap",
      "pre-waiver",
      "rankings-projections",
    ]);
    expect(result.planned).toEqual([]);
    expect(result.skippedReason).toBe("nfl_week_unavailable");
  });

  it("plans through the Inngest step API", async () => {
    const fn = createCentralContentPlanCronFunction(() => ({
      nflWeekState: regularWeek,
      now: () => new Date("2026-09-16T11:00:00.000Z"),
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const stepRun = await testEngine.executeStep(
      "plan-central-content-generation",
      { events: [{ data: {}, name: "inngest/scheduled.timer" }] },
    );

    expect(stepRun.result).toMatchObject({
      ok: true,
      planned: [
        expect.objectContaining({
          data: expect.objectContaining({
            columnId: "post-waiver",
            season: 2026,
            week: 1,
          }),
          name: JOB_EVENTS.centralContentGenerate,
        }),
      ],
      sentCount: 0,
    });
  });

  it("registers the shared planner and generator", () => {
    expect(functions).toContain(centralContentPlanCron);
    expect(functions).toContain(centralContentGenerate);
  });
});
