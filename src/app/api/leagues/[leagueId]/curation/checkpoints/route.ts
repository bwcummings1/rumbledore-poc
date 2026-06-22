import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, ok, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import { createCurationCheckpoint, listCurationCheckpoints } from "@/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHECKPOINT_BODY_BYTES = 8_192;

const checkpointSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().min(1).max(500).optional(),
});

interface CurationCheckpointsRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function curationCheckpointsGet(
  request: Request,
  context: CurationCheckpointsRouteContext,
) {
  const { leagueId } = await context.params;
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

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  return resultJson(
    ok({
      checkpoints: await listCurationCheckpoints(db, {
        leagueId,
        limit: Number.isFinite(limit) ? limit : 50,
      }),
    }),
  );
}

async function curationCheckpointsPost(
  request: Request,
  context: CurationCheckpointsRouteContext,
) {
  const { leagueId } = await context.params;
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

  const body = await readJsonBody(request, MAX_CHECKPOINT_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = checkpointSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_CURATION_CHECKPOINT",
        message: "Checkpoint payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    return resultJson(
      ok({
        checkpoint: await createCurationCheckpoint(db, {
          actorUserId: access.value.userId,
          label: parsed.data.label,
          leagueId,
          note: parsed.data.note,
        }),
      }),
    );
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "CURATION_CHECKPOINT_FAILED",
        message: "Curated data checkpoint could not be saved",
      }),
    );
  }
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/leagues/[leagueId]/curation/checkpoints" },
  curationCheckpointsGet,
);

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/curation/checkpoints" },
  curationCheckpointsPost,
);
