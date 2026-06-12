import { z } from "zod";
import { AppError } from "@/core/result";
import { getDb } from "@/db";
import {
  errorJson,
  readJsonBody,
  requireUserId,
  resultJson,
} from "@/onboarding/http";
import {
  disablePushSubscription,
  upsertPushSubscription,
} from "@/push/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PUSH_BODY_BYTES = 16 * 1024;

const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(4096),
  expirationTime: z.number().int().nonnegative().nullable().optional(),
  keys: z.object({
    auth: z.string().trim().min(1).max(512),
    p256dh: z.string().trim().min(1).max(512),
  }),
});

const upsertBodySchema = z.object({
  leagueId: z.uuid(),
  subscription: pushSubscriptionSchema,
});

const deleteBodySchema = z.object({
  endpoint: z.url().max(4096),
  leagueId: z.uuid(),
});

async function readParsedBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | Response> {
  const body = await readJsonBody(request, MAX_PUSH_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_PUSH_SUBSCRIPTION",
        message: "Push subscription payload is invalid",
        status: 400,
      }),
    );
  }
  return parsed.data;
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const parsed = await readParsedBody(request, upsertBodySchema);
  if (parsed instanceof Response) {
    return parsed;
  }

  const result = await upsertPushSubscription(
    { db: getDb() },
    {
      leagueId: parsed.leagueId,
      subscription: parsed.subscription,
      userAgent: request.headers.get("user-agent"),
      userId: userId.value,
    },
  );
  return resultJson(result, result.ok ? 201 : 200);
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const parsed = await readParsedBody(request, deleteBodySchema);
  if (parsed instanceof Response) {
    return parsed;
  }

  const result = await disablePushSubscription(
    { db: getDb() },
    {
      endpoint: parsed.endpoint,
      leagueId: parsed.leagueId,
      userId: userId.value,
    },
  );
  return resultJson(result);
}
