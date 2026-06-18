import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, ok, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import { confirmLeagueSeasonGrouping } from "@/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GROUPING_BODY_BYTES = 16_384;

const groupingActionSchema = z.object({
  action: z.literal("confirm"),
  config: z.record(z.string(), z.unknown()).optional(),
  groupingId: z.uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  seasons: z.array(z.number().int().min(1900).max(2200)).min(1).max(100),
});

interface CurationGroupingsRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function curationGroupingsPost(
  request: Request,
  context: CurationGroupingsRouteContext,
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

  const body = await readJsonBody(request, MAX_GROUPING_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = groupingActionSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_GROUPING_ACTION",
        message: "Season grouping action payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    const grouping = await confirmLeagueSeasonGrouping(db, {
      actorUserId: access.value.userId,
      config: parsed.data.config,
      groupingId: parsed.data.groupingId,
      leagueId,
      name: parsed.data.name,
      reason: parsed.data.reason,
      seasons: parsed.data.seasons,
    });
    return resultJson(ok({ grouping }));
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "GROUPING_CONFIRM_FAILED",
        message: "Season grouping could not be confirmed",
      }),
    );
  }
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/curation/groupings" },
  curationGroupingsPost,
);
