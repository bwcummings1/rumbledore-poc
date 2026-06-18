import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import { transferCommissionerRole } from "@/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HANDOFF_BODY_BYTES = 4096;

const handoffSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
  targetMemberId: z.uuid(),
});

interface CommissionerHandoffRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function commissionerHandoffPost(
  request: Request,
  context: CommissionerHandoffRouteContext,
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

  const body = await readJsonBody(request, MAX_HANDOFF_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = handoffSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_COMMISSIONER_HANDOFF",
        message: "Commissioner handoff payload is invalid",
        status: 400,
      }),
    );
  }

  return resultJson(
    await transferCommissionerRole(db, {
      actorUserId: access.value.userId,
      leagueId,
      reason: parsed.data.reason,
      targetMemberId: parsed.data.targetMemberId,
    }),
  );
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/commissioner/handoff" },
  commissionerHandoffPost,
);
