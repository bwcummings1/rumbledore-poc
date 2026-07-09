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
import {
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_EVENT_FAMILY_VALUES,
  PUSH_EVENT_VALUES,
  setNotificationChannelPreference,
  setPushNotificationPreference,
} from "@/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PUSH_PREFERENCES_BODY_BYTES = 8 * 1024;

const legacyPushPreferenceSchema = z.object({
  enabled: z.boolean(),
  leagueId: z.uuid(),
  type: z.enum(PUSH_EVENT_VALUES),
});

const channelPreferenceSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNEL_VALUES),
  eventFamily: z.enum(NOTIFICATION_EVENT_FAMILY_VALUES),
  leagueId: z.uuid(),
});

const preferencesBodySchema = z.union([
  channelPreferenceSchema,
  legacyPushPreferenceSchema,
]);

async function pushPreferencesPatch(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const body = await readJsonBody(request, MAX_PUSH_PREFERENCES_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = preferencesBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_PUSH_PREFERENCE",
        message: "Push preference payload is invalid",
        status: 400,
      }),
    );
  }

  const result =
    "eventFamily" in parsed.data
      ? await setNotificationChannelPreference(
          { db: getDb() },
          {
            channel: parsed.data.channel,
            eventFamily: parsed.data.eventFamily,
            leagueId: parsed.data.leagueId,
            userId: userId.value,
          },
        )
      : await setPushNotificationPreference(
          { db: getDb() },
          {
            enabled: parsed.data.enabled,
            leagueId: parsed.data.leagueId,
            type: parsed.data.type,
            userId: userId.value,
          },
        );
  return resultJson(result);
}

export const PATCH = recordApiHandler(
  { method: "PATCH", route: "/api/push/preferences" },
  pushPreferencesPatch,
);
