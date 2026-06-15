import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import { assignDataSteward } from "@/onboarding/stewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STEWARD_ASSIGN_BODY_BYTES = 1024;

const assignStewardSchema = z.object({
  memberId: z.uuid(),
});

interface StewardsRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function stewardsPost(request: Request, context: StewardsRouteContext) {
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

  const body = await readJsonBody(request, MAX_STEWARD_ASSIGN_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = assignStewardSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_STEWARD_ASSIGNMENT",
        message: "Data steward assignment payload is invalid",
        status: 400,
      }),
    );
  }

  return resultJson(
    await assignDataSteward(db, {
      actorUserId: access.value.userId,
      leagueId,
      targetMemberId: parsed.data.memberId,
    }),
  );
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/stewards" },
  stewardsPost,
);
