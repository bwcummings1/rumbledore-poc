import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { setLeagueRoastConsent } from "@/members/roast-consent";
import { ROAST_LEVELS } from "@/members/roast-consent-types";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROAST_CONSENT_BODY_BYTES = 1024;

const roastConsentBodySchema = z.object({
  roastLevel: z.enum(ROAST_LEVELS),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("self") }),
    z.object({
      fantasyMemberId: z.uuid(),
      kind: z.literal("fantasy_member"),
    }),
  ]),
});

interface RoastConsentRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function roastConsentPost(
  request: Request,
  context: RoastConsentRouteContext,
) {
  const { leagueId } = await context.params;
  const db = getDb();
  const access = await requireLeagueRole({
    db,
    headers: request.headers,
    leagueId,
    minRole: "member",
  });
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_ROAST_CONSENT_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = roastConsentBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "INVALID_ROAST_CONSENT_REQUEST",
        message: "Roast consent requests require a target and supported level",
        status: 400,
      }),
    );
  }

  try {
    const result = await setLeagueRoastConsent(
      { db },
      {
        actorRole: access.value.role,
        actorUserId: access.value.userId,
        leagueId,
        roastLevel: parsed.data.roastLevel,
        target: parsed.data.target,
      },
    );
    return okJson(result);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "ROAST_CONSENT_UPDATE_FAILED",
        message: "Roast consent could not be updated",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/roast-consent",
  },
  roastConsentPost,
);
