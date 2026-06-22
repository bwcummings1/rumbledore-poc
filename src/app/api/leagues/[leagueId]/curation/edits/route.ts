import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, ok, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import { applyCuratedDataEdit } from "@/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CURATION_EDIT_BODY_BYTES = 16_384;

const curationEditSchema = z.object({
  editClass: z.enum(["cosmetic", "substantive"]),
  field: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(500).optional(),
  scope: z.enum(["smart", "all_years", "this_year_only"]).optional(),
  season: z.number().int().min(1900).max(2200).optional(),
  targetId: z.uuid(),
  targetKind: z.enum([
    "person",
    "team_season",
    "weekly_stat",
    "matchup",
    "season_setting",
    "grouping",
  ]),
  value: z.unknown(),
});

interface CurationEditsRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function curationEditsPost(
  request: Request,
  context: CurationEditsRouteContext,
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

  const body = await readJsonBody(request, MAX_CURATION_EDIT_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = curationEditSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_CURATION_EDIT",
        message: "Data edit payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    return resultJson(
      ok(
        await applyCuratedDataEdit(db, {
          actorUserId: access.value.userId,
          editClass: parsed.data.editClass,
          field: parsed.data.field,
          leagueId,
          reason: parsed.data.reason,
          scope: parsed.data.scope,
          season: parsed.data.season,
          targetId: parsed.data.targetId,
          targetKind: parsed.data.targetKind,
          value: parsed.data.value,
        }),
      ),
    );
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "CURATION_EDIT_FAILED",
        message: "Data edit could not be applied",
      }),
    );
  }
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/curation/edits" },
  curationEditsPost,
);
