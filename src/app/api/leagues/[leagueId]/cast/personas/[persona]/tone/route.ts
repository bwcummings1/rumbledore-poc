import { z } from "zod";
import { editPersonaToneProfile, parseAiPersona } from "@/ai";
import { isValidLeagueId, requirePlatformAdmin } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TONE_BODY_BYTES = 12_288;

const toneProfileSchema = z
  .object({
    beats: z.array(z.string().trim().min(1).max(140)).min(1).max(8),
    diction: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
    dosAndDonts: z.array(z.string().trim().min(1).max(180)).min(1).max(10),
    pointOfView: z.string().trim().min(1).max(500),
    styleDirectives: z.array(z.string().trim().min(1).max(180)).min(1).max(10),
  })
  .passthrough();

const toneEditBodySchema = z.object({
  expectedToneVersion: z.number().int().positive().optional(),
  reason: z.string().trim().max(500).optional(),
  toneProfile: toneProfileSchema,
});

interface PersonaToneRouteContext {
  params: Promise<{ leagueId: string; persona: string }>;
}

async function personaTonePost(
  request: Request,
  context: PersonaToneRouteContext,
) {
  const { leagueId, persona: personaParam } = await context.params;
  const db = getDb();
  const access = await requirePlatformAdmin({
    db,
    headers: request.headers,
  });
  if (!access.ok) {
    return errorJson(access.error);
  }
  if (!isValidLeagueId(leagueId)) {
    return errorJson(
      new AppError({
        code: "INVALID_LEAGUE_ID",
        message: "League id must be a UUID",
        status: 400,
      }),
    );
  }

  const body = await readJsonBody(request, MAX_TONE_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = toneEditBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "INVALID_PERSONA_TONE_REQUEST",
        message: "Tone profile edits require a valid tone profile",
        status: 400,
      }),
    );
  }

  try {
    const result = await editPersonaToneProfile(
      { db },
      {
        actorUserId: access.value.userId,
        expectedToneVersion: parsed.data.expectedToneVersion,
        leagueId,
        persona: parseAiPersona(personaParam),
        reason: parsed.data.reason,
        toneProfile: parsed.data.toneProfile,
      },
    );
    return okJson(result);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "PERSONA_TONE_EDIT_FAILED",
        message: "Persona tone profile could not be updated",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/cast/personas/[persona]/tone",
  },
  personaTonePost,
);
