import { z } from "zod";
import { createAiDependencies } from "@/ai/dependencies";
import { requireLeagueRole } from "@/auth/guards";
import { regenerateEditorialContentItem } from "@/content/editorial";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EDITORIAL_BODY_BYTES = 2048;

const regenerateBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

interface EditorialRegenerateRouteContext {
  params: Promise<{ leagueId: string; postId: string }>;
}

async function editorialRegeneratePost(
  request: Request,
  context: EditorialRegenerateRouteContext,
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
  const parsed = regenerateBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "INVALID_EDITORIAL_REGENERATE_REQUEST",
        message: "Regeneration payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    const env = getEnv();
    const result = await regenerateEditorialContentItem(
      createAiDependencies(db, env),
      {
        actorUserId: access.value.userId,
        contentItemId: postId,
        leagueId,
        reason: parsed.data.reason,
      },
    );
    if (result.status === "conflict") {
      return errorJson(
        new AppError({
          code: "EDITORIAL_REGENERATE_CONFLICT",
          message: "Post could not be regenerated because its state changed",
          status: 409,
        }),
      );
    }
    if (result.status === "not_found") {
      return errorJson(
        new AppError({
          code: "EDITORIAL_CONTENT_NOT_FOUND",
          message: "Editorial content item could not be found",
          status: 404,
        }),
      );
    }
    return okJson(result);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "EDITORIAL_REGENERATE_FAILED",
        message: "Post could not be regenerated",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/press/[postId]/regenerate",
  },
  editorialRegeneratePost,
);
