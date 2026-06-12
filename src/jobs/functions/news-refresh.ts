import { NonRetriableError } from "inngest";
import { z } from "zod";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import {
  type CentralNewsIngestionDependencies,
  type RefreshCentralNewsResult,
  refreshCentralNews,
} from "@/news";
import { createNewsDependencies } from "@/news/dependencies";
import { inngest } from "../client";
import { JOB_EVENTS, type NewsRefreshData } from "../events";

type NewsRefreshDependencies = CentralNewsIngestionDependencies;

export type NewsRefreshResponse = RefreshCentralNewsResult & {
  ok: true;
  eventName: typeof JOB_EVENTS.newsRefresh;
};

const newsRefreshDataSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  topic: z.string().trim().min(1).max(120).optional(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseNewsRefreshData(data: unknown): NewsRefreshData {
  const parsed = newsRefreshDataSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "NEWS_REFRESH_INVALID",
        message: "News refresh payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultNewsRefreshDependencies(): Promise<NewsRefreshDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return createNewsDependencies(getDb(), getEnv());
}

export async function runNewsRefresh({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: NewsRefreshDependencies;
}): Promise<NewsRefreshResponse> {
  const data = parseNewsRefreshData(rawData);
  const result = await refreshCentralNews({ deps, input: data });

  return {
    ok: true,
    eventName: JOB_EVENTS.newsRefresh,
    ...result,
  };
}

export function createNewsRefreshFunction(
  resolveDeps: () =>
    | NewsRefreshDependencies
    | Promise<NewsRefreshDependencies> = getDefaultNewsRefreshDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Refreshes the central NFL/fantasy news firehose with source deduplication.",
      id: "news-refresh",
      idempotency: "event.id",
      name: "Central news refresh",
      triggers: [{ event: JOB_EVENTS.newsRefresh }],
    },
    async ({ event, step }): Promise<NewsRefreshResponse> =>
      recordJobRun("news-refresh", async () => {
        const deps = await resolveDeps();
        return step.run("refresh-central-news", () =>
          runNewsRefresh({ data: event.data, deps }),
        );
      }),
  );
}

export const newsRefresh = createNewsRefreshFunction();
