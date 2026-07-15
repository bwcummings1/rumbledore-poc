import { cron } from "inngest";
import { centralColumnCronSchedules } from "@/ai/central-columns";
import { recordJobRun } from "@/core/metrics";
import type { NflCalendar, NflWeekState } from "@/sports/nfl-calendar";
import {
  type CentralContentPlanResult,
  planCentralScheduledContent,
} from "../central-content-planning";
import { inngest } from "../client";

interface CentralContentPlanCronDependencies {
  nflCalendar?: NflCalendar;
  nflWeekState?: NflWeekState;
  now?: () => Date;
}

export type CentralContentPlanCronResponse = CentralContentPlanResult & {
  ok: true;
  sentCount: number;
};

export async function runCentralContentPlanCron({
  deps = {},
}: {
  deps?: CentralContentPlanCronDependencies;
} = {}): Promise<CentralContentPlanCronResponse> {
  const result = await planCentralScheduledContent(deps);
  return { ...result, ok: true, sentCount: 0 };
}

export function createCentralContentPlanCronFunction(
  resolveDeps: () =>
    | CentralContentPlanCronDependencies
    | Promise<CentralContentPlanCronDependencies> = () => ({}),
) {
  return inngest.createFunction(
    {
      description:
        "Plans the config-driven shared central fantasy columns without per-league fan-out.",
      id: "central-content-plan-cron",
      idempotency: "event.id",
      name: "Central journalist cadence planner",
      triggers: centralColumnCronSchedules().map((schedule) => cron(schedule)),
    },
    async ({ step }): Promise<CentralContentPlanCronResponse> =>
      recordJobRun("central-content-plan-cron", async () => {
        const deps = await resolveDeps();
        const plan = await step.run("plan-central-content-generation", () =>
          runCentralContentPlanCron({ deps }),
        );
        if (plan.planned.length > 0) {
          await step.sendEvent(
            "send-central-content-generate-events",
            plan.planned,
          );
        }
        return { ...plan, sentCount: plan.planned.length };
      }),
  );
}

export const centralContentPlanCron = createCentralContentPlanCronFunction();
