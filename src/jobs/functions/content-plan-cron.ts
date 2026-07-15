import { cron } from "inngest";
import {
  leagueColumnCronSchedule,
  leagueColumnPlannerName,
} from "@/ai/league-columns";
import { recordJobRun } from "@/core/metrics";
import type { Db } from "@/db/client";
import type { EntitlementResolverEnv } from "@/entitlements";
import type { NflCalendar, NflWeekState } from "@/sports/nfl-calendar";
import { inngest } from "../client";
import {
  type ContentPlanCronCadence,
  type ContentPlanCronResult,
  planCronContent,
} from "../content-planning";

interface ContentPlanCronDependencies {
  db: Db;
  env: EntitlementResolverEnv;
  nflCalendar?: NflCalendar;
  nflWeekState?: NflWeekState;
  now?: () => Date;
}

export type ContentPlanCronResponse = ContentPlanCronResult & {
  ok: true;
  sentCount: number;
};

async function getDefaultContentPlanCronDependencies(): Promise<ContentPlanCronDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return { db: getDb(), env: getEnv() };
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
    env: deps.env,
    nflCalendar: deps.nflCalendar,
    nflWeekState: deps.nflWeekState,
    now: deps.now,
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
    async ({ step }): Promise<ContentPlanCronResponse> =>
      recordJobRun(functionId, async () => {
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
      }),
  );
}

export const contentPlanWeeklyPreview = createContentPlanCronFunction({
  cadence: "weekly-preview",
  functionId: "content-plan-weekly-preview",
  name: leagueColumnPlannerName("weekly-preview"),
  schedule: leagueColumnCronSchedule("weekly-preview"),
});

export const contentPlanWeeklyWrap = createContentPlanCronFunction({
  cadence: "weekly-wrap",
  functionId: "content-plan-weekly-wrap",
  name: leagueColumnPlannerName("weekly-wrap"),
  schedule: leagueColumnCronSchedule("weekly-wrap"),
});

export const contentPlanMidWeek = createContentPlanCronFunction({
  cadence: "mid-week",
  functionId: "content-plan-mid-week",
  name: leagueColumnPlannerName("mid-week"),
  schedule: leagueColumnCronSchedule("mid-week"),
});

export const contentPlanPostOddsRefresh = createContentPlanCronFunction({
  cadence: "post-odds-refresh",
  functionId: "content-plan-post-odds-refresh",
  name: leagueColumnPlannerName("post-odds-refresh"),
  schedule: leagueColumnCronSchedule("post-odds-refresh"),
});

export const contentPlanOffseasonBeat = createContentPlanCronFunction({
  cadence: "offseason-beat",
  functionId: "content-plan-offseason-beat",
  name: "AI content offseason beat planner",
  schedule: "0 15 * * 1",
});
