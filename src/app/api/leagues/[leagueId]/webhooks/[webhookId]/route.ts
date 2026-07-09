import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";
import {
  deleteLeagueWebhook,
  type LeagueWebhookMutationResult,
  updateLeagueWebhook,
} from "@/webhooks";

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

const updateWebhookSchema = z.object({
  eventSelection: eventSelectionSchema.optional(),
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  targetKind: z.enum(["discord", "generic"]).optional(),
  url: z.url().optional(),
});

const WEBHOOK_MUTATION_HTTP_STATUS: Record<
  LeagueWebhookMutationResult["status"],
  number
> = {
  created: 200,
  deleted: 200,
  not_found: 404,
  updated: 200,
};

function webhookMutationHttpStatus(result: LeagueWebhookMutationResult) {
  return WEBHOOK_MUTATION_HTTP_STATUS[result.status] ?? 200;
}

interface LeagueWebhookRouteContext {
  params: Promise<{ leagueId: string; webhookId: string }>;
}

async function leagueWebhookPatch(
  request: Request,
  context: LeagueWebhookRouteContext,
) {
  const { leagueId, webhookId } = await context.params;
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
  const parsed = updateWebhookSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "WEBHOOK_UPDATE_REQUEST_INVALID",
        message: "Webhook update payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    const env = getEnv();
    const result = await updateLeagueWebhook(
      { db, encryptionKey: env.credentials.encryptionKey },
      {
        actorUserId: access.value.userId,
        eventSelection: parsed.data.eventSelection,
        leagueId,
        name: parsed.data.name,
        status: parsed.data.status,
        targetKind: parsed.data.targetKind,
        url: parsed.data.url,
        webhookId,
      },
    );
    return okJson(result, webhookMutationHttpStatus(result));
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "WEBHOOK_UPDATE_FAILED",
        message: "Webhook could not be updated",
        status: 500,
      }),
    );
  }
}

async function leagueWebhookDelete(
  request: Request,
  context: LeagueWebhookRouteContext,
) {
  const { leagueId, webhookId } = await context.params;
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

  try {
    const result = await deleteLeagueWebhook({ db }, { leagueId, webhookId });
    return okJson(result, webhookMutationHttpStatus(result));
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "WEBHOOK_DELETE_FAILED",
        message: "Webhook could not be deleted",
        status: 500,
      }),
    );
  }
}

export const PATCH = recordApiHandler(
  { method: "PATCH", route: "/api/leagues/[leagueId]/webhooks/[webhookId]" },
  leagueWebhookPatch,
);

export const DELETE = recordApiHandler(
  { method: "DELETE", route: "/api/leagues/[leagueId]/webhooks/[webhookId]" },
  leagueWebhookDelete,
);
