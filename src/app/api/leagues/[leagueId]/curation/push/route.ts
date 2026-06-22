import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, ok, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import { pushAllCurationSeasons, pushCurationSeason } from "@/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PUSH_BODY_BYTES = 8_192;

const pushSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("push"),
    checkpointId: z.uuid().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    season: z.number().int().min(1900).max(2200),
  }),
  z.object({
    action: z.literal("pushAll"),
    checkpointId: z.uuid().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  }),
]);

interface CurationPushRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function curationPushPost(
  request: Request,
  context: CurationPushRouteContext,
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

  const body = await readJsonBody(request, MAX_PUSH_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = pushSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_CURATION_PUSH",
        message: "Push payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    if (parsed.data.action === "pushAll") {
      return resultJson(
        ok({
          pushes: await pushAllCurationSeasons(db, {
            actorUserId: access.value.userId,
            checkpointId: parsed.data.checkpointId,
            leagueId,
            reason: parsed.data.reason,
          }),
        }),
      );
    }
    return resultJson(
      ok({
        push: await pushCurationSeason(db, {
          actorUserId: access.value.userId,
          checkpointId: parsed.data.checkpointId,
          leagueId,
          reason: parsed.data.reason,
          season: parsed.data.season,
        }),
      }),
    );
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "CURATION_PUSH_FAILED",
        message: "Curated data could not be pushed",
      }),
    );
  }
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/curation/push" },
  curationPushPost,
);
