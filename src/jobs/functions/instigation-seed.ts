import { NonRetriableError } from "inngest";
import { z } from "zod";
import { createAiDependencies } from "@/ai/dependencies";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import {
  INSTIGATION_KINDS,
  type SeedInstigationResult,
  seedInstigation,
} from "@/instigator";
import { inngest } from "../client";
import { type InstigationSeedData, JOB_EVENTS } from "../events";

type InstigationSeedDependencies = Parameters<
  typeof seedInstigation
>[0]["deps"];

export type InstigationSeedResponse = SeedInstigationResult & {
  ok: true;
  eventName: typeof JOB_EVENTS.instigationSeed;
  sentCount: number;
};

const groundingRefSchema = z.object({
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200).optional(),
  type: z.enum(["record", "head_to_head", "transaction", "team", "member"]),
});

const instigationSeedDataSchema = z.object({
  closesAt: z.iso.datetime().optional(),
  dedupKey: z.string().trim().min(1).max(200),
  groundingRefs: z.array(groundingRefSchema).min(1),
  kind: z.enum(INSTIGATION_KINDS),
  leagueId: z.uuid(),
  options: z.array(z.string().trim().min(1).max(120)).min(2),
  persona: z.enum([
    "commissioner",
    "analyst",
    "narrator",
    "trash_talker",
    "beat_reporter",
    "betting_advisor",
  ]),
  promptText: z.string().trim().min(1).max(500),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseInstigationSeedData(data: unknown): InstigationSeedData {
  const parsed = instigationSeedDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "INSTIGATION_SEED_INVALID",
        message: "Instigation seed payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultInstigationSeedDependencies(): Promise<InstigationSeedDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return createAiDependencies(getDb(), getEnv());
}

export async function runInstigationSeed({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: InstigationSeedDependencies;
}): Promise<InstigationSeedResponse> {
  const data = parseInstigationSeedData(rawData);
  const result = await seedInstigation({
    deps,
    input: {
      ...data,
      closesAt: data.closesAt ? new Date(data.closesAt) : undefined,
    },
  });

  return {
    ok: true,
    eventName: JOB_EVENTS.instigationSeed,
    sentCount: 0,
    ...result,
  };
}

export function createInstigationSeedFunction(
  resolveDeps: () =>
    | InstigationSeedDependencies
    | Promise<InstigationSeedDependencies> = getDefaultInstigationSeedDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Seeds a grounded AI instigation, creates its poll, and writes the instigation column.",
      id: "instigation-seed",
      idempotency: "event.data.leagueId + ':' + event.data.dedupKey",
      name: "AI instigation seed",
      triggers: [{ event: JOB_EVENTS.instigationSeed }],
    },
    async ({ event, step }): Promise<InstigationSeedResponse> =>
      recordJobRun("instigation-seed", async () => {
        const deps = await resolveDeps();
        const seeded = await step.run("seed-instigation", () =>
          runInstigationSeed({ data: event.data, deps }),
        );

        if (!seeded.reused) {
          await step.sendEvent("send-instigation-seeded-event", {
            data: {
              contentItemId: seeded.contentItemId ?? undefined,
              instigationId: seeded.instigationId,
              leagueId: event.data.leagueId,
              pollId: seeded.pollId ?? undefined,
            },
            id: `${JOB_EVENTS.instigationSeeded}:${event.data.leagueId}:${seeded.instigationId}`,
            name: JOB_EVENTS.instigationSeeded,
          });
        }

        return {
          ...seeded,
          sentCount: seeded.reused ? 0 : 1,
        };
      }),
  );
}

export const instigationSeed = createInstigationSeedFunction();
