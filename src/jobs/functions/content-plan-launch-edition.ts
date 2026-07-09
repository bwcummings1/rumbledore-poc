import { NonRetriableError } from "inngest";
import { z } from "zod";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import type { EntitlementResolverEnv } from "@/entitlements";
import { inngest } from "../client";
import {
  type ContentPlanLaunchEditionResult,
  planLaunchEditionContent,
} from "../content-planning";
import { JOB_EVENTS, type LeagueConnectedData } from "../events";

interface ContentPlanLaunchEditionDependencies {
  db: Db;
  env: EntitlementResolverEnv;
  now?: () => Date;
}

export type ContentPlanLaunchEditionResponse =
  ContentPlanLaunchEditionResult & {
    ok: true;
    sentCount: number;
  };

const leagueConnectedDataSchema = z.object({
  leagueId: z.uuid(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseLeagueConnectedData(data: unknown): LeagueConnectedData {
  const parsed = leagueConnectedDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "LEAGUE_CONNECTED_INVALID",
        message: "League connected payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultContentPlanLaunchEditionDependencies(): Promise<ContentPlanLaunchEditionDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return { db: getDb(), env: getEnv() };
}

export async function runContentPlanLaunchEdition({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: ContentPlanLaunchEditionDependencies;
}): Promise<ContentPlanLaunchEditionResponse> {
  const data = parseLeagueConnectedData(rawData);
  const result = await planLaunchEditionContent({
    data,
    db: deps.db,
    env: deps.env,
    now: deps.now,
  });

  return {
    ok: true,
    sentCount: 0,
    ...result,
  };
}

export function createContentPlanLaunchEditionFunction(
  resolveDeps: () =>
    | ContentPlanLaunchEditionDependencies
    | Promise<ContentPlanLaunchEditionDependencies> = getDefaultContentPlanLaunchEditionDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Plans the cold-start launch edition and fans out content.generate events.",
      id: "content-plan-launch-edition",
      idempotency: "event.data.leagueId + ':launch-edition:v1'",
      name: "AI content launch edition planner",
      triggers: [{ event: JOB_EVENTS.leagueConnected }],
    },
    async ({ event, step }): Promise<ContentPlanLaunchEditionResponse> =>
      recordJobRun("content-plan-launch-edition", async () => {
        const deps = await resolveDeps();
        const plan = await step.run("plan-launch-edition", () =>
          runContentPlanLaunchEdition({ data: event.data, deps }),
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

export const contentPlanLaunchEdition =
  createContentPlanLaunchEditionFunction();
