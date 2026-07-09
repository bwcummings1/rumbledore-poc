import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";
import { createLeagueWebhook } from "@/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BODY_BYTES = 8192;

const leagueWebhookSectionSchema = z.enum([
  "recaps",
  "power-rankings",
  "trash-talk",
  "records",
  "previews",
]);

const leagueWebhookEventSchema = z.enum([
  "content.published",
  "content.corrected",
]);

const eventSelectionSchema = z.object({
  contentSections: z.array(leagueWebhookSectionSchema).min(1).max(5),
  events: z.array(leagueWebhookEventSchema).min(1).max(2),
});

const createWebhookSchema = z.object({
  eventSelection: eventSelectionSchema.optional(),
  name: z.string().trim().min(1).max(80),
  targetKind: z.enum(["discord", "generic"]),
  url: z.url(),
});

interface LeagueWebhooksRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function leagueWebhooksPost(
  request: Request,
  context: LeagueWebhooksRouteContext,
) {
  const { leagueId } = await context.params;
  const db = getDb();
  const access = await requireLeagueRole({
    db,
    headers: request.headers,
    leagueId,
    minRole: "commissioner",
  });
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_WEBHOOK_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = createWebhookSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "WEBHOOK_CREATE_REQUEST_INVALID",
        message: "Webhook creation payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    const env = getEnv();
    return okJson(
      await createLeagueWebhook(
        { db, encryptionKey: env.credentials.encryptionKey },
        {
          actorUserId: access.value.userId,
          eventSelection: parsed.data.eventSelection,
          leagueId,
          name: parsed.data.name,
          targetKind: parsed.data.targetKind,
          url: parsed.data.url,
        },
      ),
      201,
    );
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "WEBHOOK_CREATE_FAILED",
        message: "Webhook could not be created",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/webhooks" },
  leagueWebhooksPost,
);
