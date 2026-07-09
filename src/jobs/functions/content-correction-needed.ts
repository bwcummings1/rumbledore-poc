import { NonRetriableError } from "inngest";
import { z } from "zod";
import type {
  AiGenerationDependencies,
  GenerateLeagueBlogPostResult,
} from "@/ai";
import { createAiDependencies } from "@/ai/dependencies";
import { correctEditorialContentItem } from "@/content/editorial";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import { inngest } from "../client";
import { type ContentCorrectionNeededData, JOB_EVENTS } from "../events";

type ContentCorrectionNeededDependencies = AiGenerationDependencies;

export type ContentCorrectionNeededResponse = {
  actionId: string | null;
  eventName: typeof JOB_EVENTS.contentCorrectionNeeded;
  generation: GenerateLeagueBlogPostResult | null;
  ok: true;
  originalContentItemId: string;
  replacementContentItemId: string | null;
  status:
    | "already_current"
    | "blocked"
    | "conflict"
    | "not_found"
    | "published"
    | "skipped";
};

const matchupWeekSchema = z.object({
  scoringPeriod: z.number().int().positive(),
  season: z.number().int().min(2000).max(2100),
});

const changedMatchupSchema = matchupWeekSchema.extend({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  id: z.uuid(),
});

const contentCorrectionNeededDataSchema = z.object({
  affectedWeeks: z.array(matchupWeekSchema).min(1).max(25),
  changedMatchups: z.array(changedMatchupSchema).min(1).max(100),
  contentItemId: z.uuid(),
  correctionHash: z.string().regex(/^[a-f0-9]{64}$/),
  leagueId: z.uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseContentCorrectionNeededData(
  data: unknown,
): ContentCorrectionNeededData {
  const parsed = contentCorrectionNeededDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "CONTENT_CORRECTION_NEEDED_INVALID",
        message: "Content correction payload is invalid",
        status: 400,
      }),
    );
  }
  return parsed.data;
}

async function getDefaultContentCorrectionNeededDependencies(): Promise<ContentCorrectionNeededDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return createAiDependencies(getDb(), getEnv());
}

export async function runContentCorrectionNeeded({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: ContentCorrectionNeededDependencies;
}): Promise<ContentCorrectionNeededResponse> {
  const data = parseContentCorrectionNeededData(rawData);
  const result = await correctEditorialContentItem(deps, data);
  return {
    ok: true,
    eventName: JOB_EVENTS.contentCorrectionNeeded,
    ...result,
  };
}

export function createContentCorrectionNeededFunction(
  resolveDeps: () =>
    | ContentCorrectionNeededDependencies
    | Promise<ContentCorrectionNeededDependencies> = getDefaultContentCorrectionNeededDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Regenerates a published league post after a referenced score correction.",
      id: "content-correction-needed",
      idempotency:
        "event.data.leagueId + ':' + event.data.contentItemId + ':' + event.data.correctionHash",
      name: "AI content correction",
      triggers: [{ event: JOB_EVENTS.contentCorrectionNeeded }],
    },
    async ({ event, step }): Promise<ContentCorrectionNeededResponse> =>
      recordJobRun("content-correction-needed", async () => {
        const deps = await resolveDeps();
        return step.run("run-content-correction", () =>
          runContentCorrectionNeeded({ data: event.data, deps }),
        );
      }),
  );
}

export const contentCorrectionNeeded = createContentCorrectionNeededFunction();
