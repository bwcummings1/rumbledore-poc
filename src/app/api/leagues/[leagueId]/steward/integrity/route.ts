import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, ok, type Result, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import {
  listDataStewardReview,
  markIntegrityCheckReviewed,
  mergePersons,
  reassignTeamSeason,
  renamePerson,
  rerunDataIntegrityReview,
  splitPerson,
} from "@/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STEWARD_BODY_BYTES = 8192;

const reasonSchema = z.string().trim().min(1).max(500).optional();
const stewardActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark_reviewed"),
    checkId: z.uuid(),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal("rerun_integrity"),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal("rename_person"),
    canonicalName: z.string().trim().min(1).max(120),
    personId: z.uuid(),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal("reassign_team_season"),
    newCanonicalName: z.string().trim().min(1).max(120).optional(),
    reason: reasonSchema,
    targetPersonId: z.uuid().optional(),
    teamSeasonId: z.uuid(),
  }),
  z.object({
    action: z.literal("merge_persons"),
    primaryPersonId: z.uuid(),
    reason: reasonSchema,
    secondaryPersonId: z.uuid(),
  }),
  z.object({
    action: z.literal("split_person"),
    newCanonicalName: z.string().trim().min(1).max(120),
    personId: z.uuid(),
    reason: reasonSchema,
    teamSeasonIds: z.array(z.uuid()).min(1).max(50),
  }),
]);

interface StewardIntegrityRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function authorize(request: Request, leagueId: string) {
  return requireLeagueRole({
    db: getDb(),
    headers: request.headers,
    leagueId,
    minRole: "data_steward",
  });
}

async function stewardIntegrityGet(
  request: Request,
  context: StewardIntegrityRouteContext,
) {
  const { leagueId } = await context.params;
  const access = await authorize(request, leagueId);
  if (!access.ok) {
    return errorJson(access.error);
  }

  return resultJson(await listDataStewardReview(getDb(), { leagueId }));
}

async function executeAction(
  action: z.infer<typeof stewardActionSchema>,
  input: { actorUserId: string; leagueId: string },
): Promise<Result<unknown, AppError>> {
  const db = getDb();
  try {
    switch (action.action) {
      case "mark_reviewed":
        return markIntegrityCheckReviewed(db, {
          actorUserId: input.actorUserId,
          checkId: action.checkId,
          leagueId: input.leagueId,
          reason: action.reason,
        });
      case "rerun_integrity":
        return rerunDataIntegrityReview(db, {
          actorUserId: input.actorUserId,
          leagueId: input.leagueId,
          reason: action.reason,
        });
      case "rename_person":
        return renamePerson(db, {
          actorUserId: input.actorUserId,
          canonicalName: action.canonicalName,
          leagueId: input.leagueId,
          personId: action.personId,
          reason: action.reason,
        });
      case "reassign_team_season":
        return reassignTeamSeason(db, {
          actorUserId: input.actorUserId,
          leagueId: input.leagueId,
          newCanonicalName: action.newCanonicalName,
          reason: action.reason,
          targetPersonId: action.targetPersonId,
          teamSeasonId: action.teamSeasonId,
        });
      case "merge_persons":
        await mergePersons(db, {
          actorUserId: input.actorUserId,
          leagueId: input.leagueId,
          primaryPersonId: action.primaryPersonId,
          reason: action.reason,
          secondaryPersonId: action.secondaryPersonId,
        });
        return ok({ merged: true });
      case "split_person": {
        const split = await splitPerson(db, {
          actorUserId: input.actorUserId,
          leagueId: input.leagueId,
          newCanonicalName: action.newCanonicalName,
          personId: action.personId,
          reason: action.reason,
          teamSeasonIds: action.teamSeasonIds,
        });
        return ok(split);
      }
    }
  } catch (error) {
    return {
      error: toAppError(error, {
        code: "STEWARD_ACTION_FAILED",
        message: "Data steward action failed",
      }),
      ok: false,
    };
  }
}

async function stewardIntegrityPost(
  request: Request,
  context: StewardIntegrityRouteContext,
) {
  const { leagueId } = await context.params;
  const access = await authorize(request, leagueId);
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_STEWARD_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = stewardActionSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_STEWARD_ACTION",
        message: "Data steward action payload is invalid",
        status: 400,
      }),
    );
  }

  return resultJson(
    await executeAction(parsed.data, {
      actorUserId: access.value.userId,
      leagueId,
    }),
  );
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/leagues/[leagueId]/steward/integrity" },
  stewardIntegrityGet,
);

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/steward/integrity" },
  stewardIntegrityPost,
);
