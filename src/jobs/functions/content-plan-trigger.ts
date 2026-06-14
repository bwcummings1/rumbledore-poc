import { NonRetriableError } from "inngest";
import { z } from "zod";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
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

const idValue = z.string().trim().min(1).max(200);
const leagueScopedDataSchema = z.object({
  leagueId: z.uuid(),
});

const triggerDataSchemas = {
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

export async function runContentPlanTrigger({
  data: rawData,
  eventName,
}: {
  data: unknown;
  eventName: ContentPlanTriggerEventName;
}): Promise<ContentPlanTriggerResponse> {
  const data = parseTriggerData(eventName, rawData);
  const result = planTriggeredContent({ data, eventName });

  return {
    ok: true,
    sentCount: 0,
    ...result,
  };
}

export function createContentPlanTriggerFunction({
  eventName,
  functionId,
  name,
}: {
  eventName: ContentPlanTriggerEventName;
  functionId: string;
  name: string;
}) {
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
        const plan = await step.run("plan-content-generation", () =>
          runContentPlanTrigger({ data: event.data, eventName }),
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
