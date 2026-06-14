import { NonRetriableError } from "inngest";
import { z } from "zod";
import { createAiDependencies } from "@/ai/dependencies";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import { type ClosePollResult, closePoll } from "@/instigator";
import { inngest } from "../client";
import { JOB_EVENTS, type PollCloseData } from "../events";

type PollCloseDependencies = Parameters<typeof closePoll>[0]["deps"];

export type PollCloseResponse = ClosePollResult & {
  ok: true;
  eventName: typeof JOB_EVENTS.pollClose;
  sentCount: number;
};

const pollCloseDataSchema = z.object({
  leagueId: z.uuid(),
  pollId: z.uuid(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parsePollCloseData(data: unknown): PollCloseData {
  const parsed = pollCloseDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "POLL_CLOSE_INVALID",
        message: "Poll close payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

async function getDefaultPollCloseDependencies(): Promise<PollCloseDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  return createAiDependencies(getDb(), getEnv());
}

export async function runPollClose({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: PollCloseDependencies;
}): Promise<PollCloseResponse> {
  const data = parsePollCloseData(rawData);
  const result = await closePoll({ deps, input: data });

  return {
    ok: true,
    eventName: JOB_EVENTS.pollClose,
    sentCount: 0,
    ...result,
  };
}

export function createPollCloseFunction(
  resolveDeps: () =>
    | PollCloseDependencies
    | Promise<PollCloseDependencies> = getDefaultPollCloseDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Closes an instigator poll, canonizes the winning claim, and fans out verdict triggers.",
      id: "poll-close",
      idempotency: "event.data.leagueId + ':' + event.data.pollId",
      name: "Poll close",
      triggers: [{ event: JOB_EVENTS.pollClose }],
    },
    async ({ event, step }): Promise<PollCloseResponse> =>
      recordJobRun("poll-close", async () => {
        const deps = await resolveDeps();
        const closed = await step.run("close-poll", () =>
          runPollClose({ data: event.data, deps }),
        );

        if (closed.status !== "canonized") {
          return closed;
        }

        await step.sendEvent("send-poll-and-lore-events", [
          {
            data: {
              leagueId: event.data.leagueId,
              pollId: closed.pollId,
            },
            id: `${JOB_EVENTS.pollClosed}:${event.data.leagueId}:${closed.pollId}`,
            name: JOB_EVENTS.pollClosed,
          },
          {
            data: {
              claimId: closed.loreClaimId,
              leagueId: event.data.leagueId,
              sourcePollId: closed.pollId,
            },
            id: `${JOB_EVENTS.loreCanonized}:${event.data.leagueId}:${closed.loreClaimId}`,
            name: JOB_EVENTS.loreCanonized,
          },
        ]);

        return {
          ...closed,
          sentCount: 2,
        };
      }),
  );
}

export const pollClose = createPollCloseFunction();
