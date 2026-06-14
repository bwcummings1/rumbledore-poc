import { NonRetriableError } from "inngest";
import { z } from "zod";
import {
  AI_CONTENT_TYPES,
  AI_PERSONAS,
  type AiGenerationDependencies,
  type GenerateLeagueBlogPostResult,
  generateLeagueBlogPost,
} from "@/ai";
import { createAiDependencies } from "@/ai/dependencies";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import { inngest } from "../client";
import { type ContentGenerateData, JOB_EVENTS } from "../events";

type ContentGenerateDependencies = AiGenerationDependencies;

export type ContentGenerateResponse = GenerateLeagueBlogPostResult & {
  ok: true;
  eventName: typeof JOB_EVENTS.contentGenerate;
};

const contentGenerateDataSchema = z.object({
  leagueId: z.uuid(),
  persona: z.enum(AI_PERSONAS),
  contentType: z.enum(AI_CONTENT_TYPES),
  triggerKey: z.string().trim().min(1).max(200),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseContentGenerateData(data: unknown): ContentGenerateData {
  const parsed = contentGenerateDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "CONTENT_GENERATE_INVALID",
        message: "Content generation payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultContentGenerateDependencies(): Promise<ContentGenerateDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return createAiDependencies(getDb(), getEnv());
}

export async function runContentGenerate({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: ContentGenerateDependencies;
}): Promise<ContentGenerateResponse> {
  const data = parseContentGenerateData(rawData);
  const result = await generateLeagueBlogPost({ deps, input: data });

  return {
    ok: true,
    eventName: JOB_EVENTS.contentGenerate,
    ...result,
  };
}

export function createContentGenerateFunction(
  resolveDeps: () =>
    | ContentGenerateDependencies
    | Promise<ContentGenerateDependencies> = getDefaultContentGenerateDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Runs one idempotent per-league AI blogger generation candidate.",
      id: "content-generate",
      idempotency:
        "event.data.leagueId + ':' + event.data.persona + ':' + event.data.contentType + ':' + event.data.triggerKey",
      name: "AI content generate",
      triggers: [{ event: JOB_EVENTS.contentGenerate }],
    },
    async ({ event, step }): Promise<ContentGenerateResponse> =>
      recordJobRun("content-generate", async () => {
        const deps = await resolveDeps();
        return step.run("run-content-generation", () =>
          runContentGenerate({ data: event.data, deps }),
        );
      }),
  );
}

export const contentGenerate = createContentGenerateFunction();
