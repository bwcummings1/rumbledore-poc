import { NonRetriableError } from "inngest";
import { z } from "zod";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import { type CloseLoreVoteResult, closeLoreVote } from "@/lore";
import { inngest } from "../client";
import { JOB_EVENTS, type LoreVoteCloseData } from "../events";

type LoreVoteCloseDependencies = Parameters<typeof closeLoreVote>[0]["deps"];

export type LoreVoteCloseResponse = CloseLoreVoteResult & {
  ok: true;
  eventName: typeof JOB_EVENTS.loreVoteClose;
  sentCount: number;
};

const loreVoteCloseDataSchema = z.object({
  claimId: z.uuid(),
  leagueId: z.uuid(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseLoreVoteCloseData(data: unknown): LoreVoteCloseData {
  const parsed = loreVoteCloseDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "LORE_VOTE_CLOSE_INVALID",
        message: "Lore vote close payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultLoreVoteCloseDependencies(): Promise<LoreVoteCloseDependencies> {
  const { getEnv } = await import("@/core/env");
  const { getDb } = await import("@/db");
  const { createRealtimePublisher } = await import("@/realtime");
  const env = getEnv();
  return { db: getDb(), realtime: createRealtimePublisher(env) };
}

export async function runLoreVoteClose({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: LoreVoteCloseDependencies;
}): Promise<LoreVoteCloseResponse> {
  const data = parseLoreVoteCloseData(rawData);
  const result = await closeLoreVote({ deps, input: data });

  return {
    ok: true,
    eventName: JOB_EVENTS.loreVoteClose,
    sentCount: 0,
    ...result,
  };
}

export function createLoreVoteCloseFunction(
  resolveDeps: () =>
    | LoreVoteCloseDependencies
    | Promise<LoreVoteCloseDependencies> = getDefaultLoreVoteCloseDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Closes an open lore claim vote, ratifies canon when quorum clears, and emits lore fan-out.",
      id: "lore-vote-close",
      idempotency: "event.data.leagueId + ':' + event.data.claimId",
      name: "Lore vote close",
      triggers: [{ event: JOB_EVENTS.loreVoteClose }],
    },
    async ({ event, step }): Promise<LoreVoteCloseResponse> =>
      recordJobRun("lore-vote-close", async () => {
        const deps = await resolveDeps();
        const closed = await step.run("close-lore-vote", () =>
          runLoreVoteClose({ data: event.data, deps }),
        );

        if (closed.status !== "canonized") {
          return closed;
        }

        await step.sendEvent("send-lore-canonized-event", {
          data: {
            claimId: closed.claimId,
            leagueId: event.data.leagueId,
          },
          id: `${JOB_EVENTS.loreCanonized}:${event.data.leagueId}:${closed.claimId}`,
          name: JOB_EVENTS.loreCanonized,
        });

        return {
          ...closed,
          sentCount: 1,
        };
      }),
  );
}

export const loreVoteClose = createLoreVoteCloseFunction();
