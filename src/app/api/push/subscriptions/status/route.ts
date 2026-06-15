import { z } from "zod";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getDb } from "@/db";
import {
  errorJson,
  readJsonBody,
  requireUserId,
  resultJson,
} from "@/onboarding/http";
import { getPushSubscriptionStatus } from "@/push/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PUSH_STATUS_BODY_BYTES = 8 * 1024;

const statusBodySchema = z.object({
  endpoint: z.url().max(4096),
  leagueId: z.uuid(),
});

async function pushSubscriptionStatusPost(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const body = await readJsonBody(request, MAX_PUSH_STATUS_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = statusBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_PUSH_SUBSCRIPTION_STATUS",
        message: "Push subscription status payload is invalid",
        status: 400,
      }),
    );
  }

  const result = await getPushSubscriptionStatus(
    { db: getDb() },
    {
      endpoint: parsed.data.endpoint,
      leagueId: parsed.data.leagueId,
      userId: userId.value,
    },
  );
  return resultJson(result);
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/push/subscriptions/status" },
  pushSubscriptionStatusPost,
);
