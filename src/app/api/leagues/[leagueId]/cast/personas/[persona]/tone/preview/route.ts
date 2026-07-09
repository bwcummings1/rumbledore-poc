import { z } from "zod";
import { parseAiPersona, previewPersonaToneProfile } from "@/ai";
import { requireLeagueRole } from "@/auth/guards";
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

const tonePreviewBodySchema = z.object({
  toneProfile: toneProfileSchema.optional(),
});

interface PersonaTonePreviewRouteContext {
  params: Promise<{ leagueId: string; persona: string }>;
}

async function personaTonePreviewPost(
  request: Request,
  context: PersonaTonePreviewRouteContext,
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
  const parsed = tonePreviewBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "INVALID_PERSONA_TONE_PREVIEW_REQUEST",
        message: "Tone preview requires a valid tone profile",
        status: 400,
      }),
    );
  }

  try {
    const result = await previewPersonaToneProfile(
      { db },
      {
        leagueId,
        persona: parseAiPersona(personaParam),
        toneProfile: parsed.data.toneProfile,
      },
    );
    return okJson(result);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "PERSONA_TONE_PREVIEW_FAILED",
        message: "Persona tone preview could not be rendered",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/cast/personas/[persona]/tone/preview",
  },
  personaTonePreviewPost,
);
