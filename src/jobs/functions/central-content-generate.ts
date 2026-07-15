import { NonRetriableError } from "inngest";
import { z } from "zod";
import {
  type CentralAiGenerationDependencies,
  createMockCentralAiDependencies,
  type GenerateCentralColumnResult,
  generateCentralColumn,
} from "@/ai";
import { centralColumnForId } from "@/ai/central-columns";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import { inngest } from "../client";
import { type CentralContentGenerateData, JOB_EVENTS } from "../events";

type CentralContentGenerateDependencies = CentralAiGenerationDependencies;

export type CentralContentGenerateResponse = GenerateCentralColumnResult & {
  eventName: typeof JOB_EVENTS.centralContentGenerate;
  ok: true;
};

const centralContentGenerateDataSchema = z.object({
  columnId: z.string().trim().min(1).max(120),
  queuedGenerationKeys: z
    .array(z.string().trim().min(1).max(500))
    .max(24)
    .optional(),
  season: z.number().int().min(1900).max(2200),
  triggerKey: z.string().trim().min(1).max(200),
  week: z.number().int().min(1).max(25),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseCentralContentGenerateData(
  data: unknown,
): CentralContentGenerateData {
  const parsed = centralContentGenerateDataSchema.safeParse(data);
  if (!parsed.success || !centralColumnForId(parsed.data.columnId)) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.success ? undefined : parsed.error,
        code: "CENTRAL_CONTENT_GENERATE_INVALID",
        message: "Central content generation payload is invalid",
        status: 400,
      }),
    );
  }
  return parsed.data as CentralContentGenerateData;
}

async function getDefaultCentralContentGenerateDependencies(): Promise<CentralContentGenerateDependencies> {
  const { getDb } = await import("@/db");
  // P3 is mock-only by contract. Phase 4 replaces this dependency factory.
  return createMockCentralAiDependencies(getDb());
}

export async function runCentralContentGenerate({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: CentralContentGenerateDependencies;
}): Promise<CentralContentGenerateResponse> {
  const data = parseCentralContentGenerateData(rawData);
  return {
    ...(await generateCentralColumn({ deps, input: data })),
    eventName: JOB_EVENTS.centralContentGenerate,
    ok: true,
  };
}

export function createCentralContentGenerateFunction(
  resolveDeps: () =>
    | CentralContentGenerateDependencies
    | Promise<CentralContentGenerateDependencies> = getDefaultCentralContentGenerateDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Generates one idempotent shared central column after write-time mock-source freshness checks.",
      id: "central-content-generate",
      idempotency: "event.data.columnId + ':' + event.data.triggerKey",
      name: "Central journalist generate",
      triggers: [{ event: JOB_EVENTS.centralContentGenerate }],
    },
    async ({ event, step }): Promise<CentralContentGenerateResponse> =>
      recordJobRun("central-content-generate", async () => {
        const deps = await resolveDeps();
        return step.run("run-central-content-generation", () =>
          runCentralContentGenerate({ data: event.data, deps }),
        );
      }),
  );
}

export const centralContentGenerate = createCentralContentGenerateFunction();
