import { cron, NonRetriableError } from "inngest";
import { z } from "zod";
import type {
  OddsIngestionDependencies,
  RefreshOddsCatalogResult,
} from "@/betting";
import { createOddsDependencies } from "@/betting/dependencies";
import { refreshOddsCatalog } from "@/betting/ingestion";
import { AppError } from "@/core/result";
import { inngest } from "../client";
import { JOB_EVENTS, type OddsPollData } from "../events";

type OddsPollDependencies = OddsIngestionDependencies;

export type OddsPollResponse = RefreshOddsCatalogResult & {
  eventName: typeof JOB_EVENTS.oddsPoll;
  ok: true;
};

const oddsPollDataSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  sport: z.literal("nfl").optional(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseOddsPollData(data: unknown): OddsPollData {
  const parsed = oddsPollDataSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "ODDS_POLL_INVALID",
        message: "Odds poll payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultOddsPollDependencies(): Promise<OddsPollDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return createOddsDependencies(getDb(), getEnv());
}

export async function runOddsPoll({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: OddsPollDependencies;
}): Promise<OddsPollResponse> {
  const data = parseOddsPollData(rawData);
  const result = await refreshOddsCatalog({ deps, input: data });

  return {
    eventName: JOB_EVENTS.oddsPoll,
    ok: true,
    ...result,
  };
}

export function createOddsPollFunction(
  resolveDeps: () =>
    | OddsPollDependencies
    | Promise<OddsPollDependencies> = getDefaultOddsPollDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Polls the odds provider and appends changed odds snapshots into the central catalog.",
      id: "odds-poll",
      idempotency: "event.id",
      name: "Odds poll",
      triggers: [{ event: JOB_EVENTS.oddsPoll }, cron("TZ=UTC */15 * * * *")],
    },
    async ({ event, step }): Promise<OddsPollResponse> => {
      const deps = await resolveDeps();
      return step.run("refresh-odds-catalog", () =>
        runOddsPoll({ data: event.data, deps }),
      );
    },
  );
}

export const oddsPoll = createOddsPollFunction();
