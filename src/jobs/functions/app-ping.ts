import { inngest } from "../client";
import { type AppPingData, JOB_EVENTS } from "../events";

interface AppPingResponse {
  ok: true;
  eventName: typeof JOB_EVENTS.appPing;
  message: string;
  requestedAt: string | null;
}

function normalizePingData(
  data: AppPingData | undefined,
): Pick<AppPingResponse, "message" | "requestedAt"> {
  const message =
    typeof data?.message === "string" && data.message.trim() !== ""
      ? data.message
      : "pong";
  const requestedAt =
    typeof data?.requestedAt === "string" && data.requestedAt.trim() !== ""
      ? data.requestedAt
      : null;

  return { message, requestedAt };
}

export const appPing = inngest.createFunction(
  {
    id: "app-ping",
    name: "App ping",
    description: "Verifies the local Inngest scaffold and test harness.",
    triggers: [{ event: JOB_EVENTS.appPing }],
    idempotency: "event.id",
  },
  async ({ event, step }): Promise<AppPingResponse> => {
    const response = await step.run("build-ping-response", () =>
      normalizePingData(event.data),
    );

    return {
      ok: true,
      eventName: JOB_EVENTS.appPing,
      ...response,
    };
  },
);
