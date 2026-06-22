import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, ok, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import { restoreCurationCheckpoint } from "@/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESTORE_BODY_BYTES = 8_192;

const restoreSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

interface CurationCheckpointRestoreRouteContext {
  params: Promise<{ checkpointId: string; leagueId: string }>;
}

async function curationCheckpointRestorePost(
  request: Request,
  context: CurationCheckpointRestoreRouteContext,
) {
  const { checkpointId, leagueId } = await context.params;
  const parsedCheckpointId = z.uuid().safeParse(checkpointId);
  if (!parsedCheckpointId.success) {
    return errorJson(
      new AppError({
        code: "INVALID_CURATION_CHECKPOINT",
        message: "Checkpoint id is invalid",
        status: 400,
      }),
    );
  }

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

  const body = await readJsonBody(request, MAX_RESTORE_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = restoreSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_CURATION_RESTORE",
        message: "Restore payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    return resultJson(
      ok({
        checkpoint: await restoreCurationCheckpoint(db, {
          actorUserId: access.value.userId,
          checkpointId: parsedCheckpointId.data,
          leagueId,
          reason: parsed.data.reason,
        }),
      }),
    );
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "CURATION_RESTORE_FAILED",
        message: "Curated data checkpoint could not be restored",
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route:
      "/api/leagues/[leagueId]/curation/checkpoints/[checkpointId]/restore",
  },
  curationCheckpointRestorePost,
);
