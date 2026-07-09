import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { retractEditorialContentItem } from "@/content/editorial";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";
import { createPushNotifier } from "@/push";
import { createRealtimePublisher } from "@/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EDITORIAL_BODY_BYTES = 2048;

const retractBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

interface EditorialRetractRouteContext {
  params: Promise<{ leagueId: string; postId: string }>;
}

async function editorialRetractPost(
  request: Request,
  context: EditorialRetractRouteContext,
) {
  const { leagueId, postId } = await context.params;
  const db = getDb();
  const access = await requireLeagueRole({
    db,
    headers: request.headers,
    leagueId,
    minRole: "data_steward",
  });
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_EDITORIAL_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = retractBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "INVALID_EDITORIAL_RETRACT_REQUEST",
        message: "Retraction requires a reason",
        status: 400,
      }),
    );
  }

  try {
    const env = getEnv();
    const result = await retractEditorialContentItem(
      {
        db,
        push: createPushNotifier(db, env),
        realtime: createRealtimePublisher(env),
      },
      {
        actorUserId: access.value.userId,
        contentItemId: postId,
        leagueId,
        reason: parsed.data.reason,
      },
    );
    return okJson(result);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "EDITORIAL_RETRACT_FAILED",
        message: "Post could not be retracted",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/press/[postId]/retract",
  },
  editorialRetractPost,
);
