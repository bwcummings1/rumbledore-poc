import { cron, NonRetriableError } from "inngest";
import { z } from "zod";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import {
  sendWeeklyDigests,
  type WeeklyDigestBatchSummary,
  type WeeklyDigestDependencies,
} from "@/email";
import { createWeeklyDigestDependencies } from "@/email/dependencies";
import { inngest } from "../client";
import { JOB_EVENTS, type WeeklyDigestData } from "../events";

export type WeeklyDigestResponse = WeeklyDigestBatchSummary & {
  eventName: typeof JOB_EVENTS.weeklyDigest;
  ok: true;
};

const weeklyDigestDataSchema = z.object({
  leagueId: z.uuid().optional(),
  leagueIds: z.array(z.uuid()).max(200).optional(),
  limit: z.number().int().positive().max(200).optional(),
  windowEnd: z.iso.datetime().optional(),
  windowStart: z.iso.datetime().optional(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseWeeklyDigestData(data: unknown): WeeklyDigestData {
  const parsed = weeklyDigestDataSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "WEEKLY_DIGEST_INVALID",
        message: "Weekly digest payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultWeeklyDigestDependencies(): Promise<WeeklyDigestDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return createWeeklyDigestDependencies(getDb(), getEnv());
}

export async function runWeeklyDigest({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: WeeklyDigestDependencies;
}): Promise<WeeklyDigestResponse> {
  const data = parseWeeklyDigestData(rawData);
  const result = await sendWeeklyDigests(deps, {
    leagueId: data.leagueId,
    leagueIds: data.leagueIds,
    limit: data.limit,
    windowEnd: data.windowEnd,
    windowStart: data.windowStart,
  });

  return {
    ok: true,
    eventName: JOB_EVENTS.weeklyDigest,
    ...result,
  };
}

export function createWeeklyDigestFunction(
  resolveDeps: () =>
    | WeeklyDigestDependencies
    | Promise<WeeklyDigestDependencies> = getDefaultWeeklyDigestDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Composes and records the mock weekly digest email for league members.",
      id: "weekly-digest",
      idempotency: "event.id",
      name: "Weekly digest email",
      triggers: [{ event: JOB_EVENTS.weeklyDigest }, cron("0 15 * * 1")],
    },
    async ({ event, step }): Promise<WeeklyDigestResponse> =>
      recordJobRun("weekly-digest", async () => {
        const deps = await resolveDeps();
        return step.run("send-weekly-digests", () =>
          runWeeklyDigest({ data: event.data, deps }),
        );
      }),
  );
}

export const weeklyDigest = createWeeklyDigestFunction();
