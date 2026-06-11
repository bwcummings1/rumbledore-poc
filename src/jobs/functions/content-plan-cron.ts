import { cron } from "inngest";
import type { Db } from "@/db/client";
import { inngest } from "../client";
import {
  type ContentPlanCronCadence,
  type ContentPlanCronResult,
  planCronContent,
} from "../content-planning";

interface ContentPlanCronDependencies {
  db: Db;
}

export type ContentPlanCronResponse = ContentPlanCronResult & {
  ok: true;
  sentCount: number;
};

async function getDefaultContentPlanCronDependencies(): Promise<ContentPlanCronDependencies> {
  const { getDb } = await import("@/db");
  return { db: getDb() };
}

export async function runContentPlanCron({
  cadence,
  deps,
}: {
  cadence: ContentPlanCronCadence;
  deps: ContentPlanCronDependencies;
}): Promise<ContentPlanCronResponse> {
  const result = await planCronContent({
    cadence,
    db: deps.db,
  });

  return {
    ok: true,
    sentCount: 0,
    ...result,
  };
}

export function createContentPlanCronFunction(
  {
    cadence,
    functionId,
    name,
    schedule,
  }: {
    cadence: ContentPlanCronCadence;
    functionId: string;
    name: string;
    schedule: string;
  },
  resolveDeps: () =>
    | ContentPlanCronDependencies
    | Promise<ContentPlanCronDependencies> = getDefaultContentPlanCronDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Plans scheduled AI blogger candidates and fans out content.generate events.",
      id: functionId,
      idempotency: "event.id",
      name,
      triggers: [cron(schedule)],
    },
    async ({ step }): Promise<ContentPlanCronResponse> => {
      const deps = await resolveDeps();
      const plan = await step.run("plan-content-generation", () =>
        runContentPlanCron({ cadence, deps }),
      );

      if (plan.planned.length > 0) {
        await step.sendEvent("send-content-generate-events", plan.planned);
      }

      return {
        ...plan,
        sentCount: plan.planned.length,
      };
    },
  );
}

export const contentPlanWeeklyPreview = createContentPlanCronFunction({
  cadence: "weekly-preview",
  functionId: "content-plan-weekly-preview",
  name: "AI content weekly preview planner",
  schedule: "0 14 * * 3",
});

export const contentPlanWeeklyWrap = createContentPlanCronFunction({
  cadence: "weekly-wrap",
  functionId: "content-plan-weekly-wrap",
  name: "AI content weekly wrap planner",
  schedule: "0 14 * * 2",
});

export const contentPlanPostOddsRefresh = createContentPlanCronFunction({
  cadence: "post-odds-refresh",
  functionId: "content-plan-post-odds-refresh",
  name: "AI content post-odds-refresh planner",
  schedule: "0 16 * * 4",
});
