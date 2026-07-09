import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { CONTENT_REACTION_EMOJIS } from "@/content/reaction-types";
import { setContentReaction } from "@/content/reactions";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REACTION_BODY_BYTES = 512;

const reactionBodySchema = z.object({
  emoji: z.enum(CONTENT_REACTION_EMOJIS),
});

interface ContentReactionRouteContext {
  params: Promise<{ leagueId: string; postId: string }>;
}

async function contentReactionPost(
  request: Request,
  context: ContentReactionRouteContext,
) {
  const { leagueId, postId } = await context.params;
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

  const body = await readJsonBody(request, MAX_REACTION_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }
  const parsed = reactionBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "INVALID_CONTENT_REACTION_REQUEST",
        message: "Reaction requests require a supported emoji",
        status: 400,
      }),
    );
  }

  try {
    const summary = await setContentReaction(
      { db },
      {
        contentItemId: postId,
        emoji: parsed.data.emoji,
        leagueId,
        userId: access.value.userId,
      },
    );
    return okJson(summary);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "CONTENT_REACTION_FAILED",
        message: "Reaction could not be saved",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/press/[postId]/reactions",
  },
  contentReactionPost,
);
