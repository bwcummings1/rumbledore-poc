import { NonRetriableError } from "inngest";
import { z } from "zod";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { inngest } from "../client";
import {
  type ContentPlanGameFinalResult,
  planGameFinalContent,
} from "../content-planning";
import { type GameFinalData, JOB_EVENTS } from "../events";

interface ContentPlanGameFinalDependencies {
  db: Db;
}

export type ContentPlanGameFinalResponse = ContentPlanGameFinalResult & {
  ok: true;
  eventName: typeof JOB_EVENTS.gameFinal;
  sentCount: number;
};

const gameFinalDataSchema = z.object({
  gameId: z.uuid(),
  leagueId: z.uuid(),
  milestoneKeys: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseGameFinalData(data: unknown): GameFinalData {
  const parsed = gameFinalDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "GAME_FINAL_INVALID",
        message: "Game final payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultContentPlanGameFinalDependencies(): Promise<ContentPlanGameFinalDependencies> {
  const { getDb } = await import("@/db");
  return { db: getDb() };
}

export async function runContentPlanGameFinal({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: ContentPlanGameFinalDependencies;
}): Promise<ContentPlanGameFinalResponse> {
  const data = parseGameFinalData(rawData);
  const result = await planGameFinalContent({
    data,
    db: deps.db,
  });

  return {
    ok: true,
    eventName: JOB_EVENTS.gameFinal,
    sentCount: 0,
    ...result,
  };
}

export function createContentPlanGameFinalFunction(
  resolveDeps: () =>
    | ContentPlanGameFinalDependencies
    | Promise<ContentPlanGameFinalDependencies> = getDefaultContentPlanGameFinalDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Plans AI blogger recaps from finalized fantasy matchups and fans out content.generate events.",
      id: "content-plan-game-final",
      idempotency: "event.data.leagueId + ':' + event.data.gameId",
      name: "AI content game-final planner",
      triggers: [{ event: JOB_EVENTS.gameFinal }],
    },
    async ({ event, step }): Promise<ContentPlanGameFinalResponse> =>
      recordJobRun("content-plan-game-final", async () => {
        const deps = await resolveDeps();
        const plan = await step.run("plan-content-generation", () =>
          runContentPlanGameFinal({ data: event.data, deps }),
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

export const contentPlanGameFinal = createContentPlanGameFinalFunction();
