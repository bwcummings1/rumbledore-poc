import { NonRetriableError } from "inngest";
import { z } from "zod";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import type { EntitlementResolverEnv } from "@/entitlements";
import type { NflCalendar, NflWeekState } from "@/sports/nfl-calendar";
import { inngest } from "../client";
import {
  type ContentPlanTriggerEventName,
  type ContentPlanTriggerResult,
  planTriggeredContent,
} from "../content-planning";
import { JOB_EVENTS } from "../events";

export type ContentPlanTriggerResponse = ContentPlanTriggerResult & {
  ok: true;
  sentCount: number;
};

interface ContentPlanTriggerDependencies {
  db: Db;
  env: EntitlementResolverEnv;
  nflCalendar?: NflCalendar;
  nflWeekState?: NflWeekState;
  now?: () => Date;
}

const idValue = z.string().trim().min(1).max(200);
const keyValue = z.string().trim().min(1).max(1000);
const leagueScopedDataSchema = z.object({
  leagueId: z.uuid(),
});

const triggerDataSchemas = {
  [JOB_EVENTS.arenaStandingsSwing]: leagueScopedDataSchema.extend({
    seasonId: idValue,
    swingKey: keyValue,
  }),
  [JOB_EVENTS.betSettled]: leagueScopedDataSchema.extend({
    bettingEventId: idValue.optional(),
    settlementId: idValue,
    slipId: idValue.optional(),
  }),
  [JOB_EVENTS.loreCanonized]: leagueScopedDataSchema.extend({
    claimId: idValue,
    sourcePollId: idValue.optional(),
  }),
  [JOB_EVENTS.pollClosed]: leagueScopedDataSchema.extend({
    pollId: idValue,
  }),
  [JOB_EVENTS.recordBroken]: leagueScopedDataSchema.extend({
    recordKey: idValue,
  }),
  [JOB_EVENTS.transaction]: leagueScopedDataSchema.extend({
    transactionId: idValue,
  }),
  [JOB_EVENTS.waiver]: leagueScopedDataSchema.extend({
    waiverId: idValue,
  }),
} as const;

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseTriggerData(
  eventName: ContentPlanTriggerEventName,
  data: unknown,
) {
  const parsed = triggerDataSchemas[eventName].safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "CONTENT_TRIGGER_INVALID",
        message: `${eventName} payload is invalid`,
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultContentPlanTriggerDependencies(): Promise<ContentPlanTriggerDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return { db: getDb(), env: getEnv() };
}

export async function runContentPlanTrigger({
  data: rawData,
  deps,
  eventName,
}: {
  data: unknown;
  deps: ContentPlanTriggerDependencies;
  eventName: ContentPlanTriggerEventName;
}): Promise<ContentPlanTriggerResponse> {
  const data = parseTriggerData(eventName, rawData);
  const result = await planTriggeredContent({
    data,
    db: deps.db,
    env: deps.env,
    eventName,
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

export function createContentPlanTriggerFunction(
  {
    eventName,
    functionId,
    name,
  }: {
    eventName: ContentPlanTriggerEventName;
    functionId: string;
    name: string;
  },
  resolveDeps: () =>
    | ContentPlanTriggerDependencies
    | Promise<ContentPlanTriggerDependencies> = getDefaultContentPlanTriggerDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Plans event-driven AI cast candidates and fans out content.generate events.",
      id: functionId,
      idempotency: "event.id",
      name,
      triggers: [{ event: eventName }],
    },
    async ({ event, step }): Promise<ContentPlanTriggerResponse> =>
      recordJobRun(functionId, async () => {
        const deps = await resolveDeps();
        const plan = await step.run("plan-content-generation", () =>
          runContentPlanTrigger({ data: event.data, deps, eventName }),
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

export const contentPlanTransaction = createContentPlanTriggerFunction({
  eventName: JOB_EVENTS.transaction,
  functionId: "content-plan-transaction",
  name: "AI content transaction planner",
});

export const contentPlanWaiver = createContentPlanTriggerFunction({
  eventName: JOB_EVENTS.waiver,
  functionId: "content-plan-waiver",
  name: "AI content waiver planner",
});

export const contentPlanRecordBroken = createContentPlanTriggerFunction({
  eventName: JOB_EVENTS.recordBroken,
  functionId: "content-plan-record-broken",
  name: "AI content record-broken planner",
});

export const contentPlanLoreCanonized = createContentPlanTriggerFunction({
  eventName: JOB_EVENTS.loreCanonized,
  functionId: "content-plan-lore-canonized",
  name: "AI content lore-canonized planner",
});

export const contentPlanPollClosed = createContentPlanTriggerFunction({
  eventName: JOB_EVENTS.pollClosed,
  functionId: "content-plan-poll-closed",
  name: "AI content poll-closed planner",
});

export const contentPlanBetSettled = createContentPlanTriggerFunction({
  eventName: JOB_EVENTS.betSettled,
  functionId: "content-plan-bet-settled",
  name: "AI content bet-settled planner",
});

export const contentPlanArenaStandingsSwing = createContentPlanTriggerFunction({
  eventName: JOB_EVENTS.arenaStandingsSwing,
  functionId: "content-plan-arena-standings-swing",
  name: "AI content arena standings swing planner",
});
