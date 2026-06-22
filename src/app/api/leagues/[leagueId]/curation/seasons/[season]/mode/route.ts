import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, ok, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import { setCurationSeasonMode } from "@/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SEASON_MODE_BODY_BYTES = 8_192;

const seasonModeSchema = z.object({
  mode: z.enum(["live", "finalized"]),
  reason: z.string().trim().min(1).max(500).optional(),
});

interface CurationSeasonModeRouteContext {
  params: Promise<{ leagueId: string; season: string }>;
}

async function curationSeasonModePost(
  request: Request,
  context: CurationSeasonModeRouteContext,
) {
  const { leagueId, season } = await context.params;
  const parsedSeason = z.coerce
    .number()
    .int()
    .min(1900)
    .max(2200)
    .safeParse(season);
  if (!parsedSeason.success) {
    return errorJson(
      new AppError({
        code: "INVALID_CURATION_SEASON",
        message: "Season is invalid",
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

  const body = await readJsonBody(request, MAX_SEASON_MODE_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = seasonModeSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_CURATION_SEASON_MODE",
        message: "Season mode payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    return resultJson(
      ok({
        state: await setCurationSeasonMode(db, {
          actorUserId: access.value.userId,
          leagueId,
          mode: parsed.data.mode,
          reason: parsed.data.reason,
          season: parsedSeason.data,
        }),
      }),
    );
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "CURATION_SEASON_MODE_FAILED",
        message: "Season mode could not be changed",
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/curation/seasons/[season]/mode",
  },
  curationSeasonModePost,
);
