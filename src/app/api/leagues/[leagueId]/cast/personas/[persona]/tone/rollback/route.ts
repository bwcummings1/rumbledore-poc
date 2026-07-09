import { z } from "zod";
import { parseAiPersona, rollbackPersonaToneProfile } from "@/ai";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TONE_BODY_BYTES = 2048;

const toneRollbackBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
  toneVersion: z.number().int().positive(),
});

interface PersonaToneRollbackRouteContext {
  params: Promise<{ leagueId: string; persona: string }>;
}

async function personaToneRollbackPost(
  request: Request,
  context: PersonaToneRollbackRouteContext,
) {
  const { leagueId, persona: personaParam } = await context.params;
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

  const body = await readJsonBody(request, MAX_TONE_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = toneRollbackBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "INVALID_PERSONA_TONE_ROLLBACK_REQUEST",
        message: "Tone rollback requires a prior tone version",
        status: 400,
      }),
    );
  }

  try {
    const result = await rollbackPersonaToneProfile(
      { db },
      {
        actorUserId: access.value.userId,
        leagueId,
        persona: parseAiPersona(personaParam),
        reason: parsed.data.reason,
        toneVersion: parsed.data.toneVersion,
      },
    );
    return okJson(result);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "PERSONA_TONE_ROLLBACK_FAILED",
        message: "Persona tone profile could not be rolled back",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/cast/personas/[persona]/tone/rollback",
  },
  personaToneRollbackPost,
);
