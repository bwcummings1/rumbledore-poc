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
import { disablePushSubscriptionsForUser } from "@/push/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PUSH_ACCOUNT_BODY_BYTES = 16 * 1024;

const cleanupBodySchema = z
  .object({
    endpoints: z.array(z.url().max(4096)).min(1).max(32).optional(),
  })
  .strict();

async function pushSubscriptionsAccountDelete(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const body = await readJsonBody(request, MAX_PUSH_ACCOUNT_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = cleanupBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_PUSH_SUBSCRIPTION_CLEANUP",
        message: "Push subscription cleanup payload is invalid",
        status: 400,
      }),
    );
  }

  const result = await disablePushSubscriptionsForUser(
    { db: getDb() },
    {
      endpoints: parsed.data.endpoints,
      userId: userId.value,
    },
  );
  return resultJson(result);
}

export const DELETE = recordApiHandler(
  { method: "DELETE", route: "/api/push/subscriptions/account" },
  pushSubscriptionsAccountDelete,
);
