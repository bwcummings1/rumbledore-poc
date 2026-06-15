import { z } from "zod";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { castLoreVote } from "@/lore";
import { getLoreClaimVoteStatus } from "@/lore/member-experience";
import { LORE_VOTE_CHOICES, type LoreVoteCastResponse } from "@/lore/member-ui";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";
import {
  authorizeLoreMember,
  getMemberIdForUser,
} from "../../../lore-route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LORE_VOTE_BODY_BYTES = 1024;

const castLoreVoteSchema = z.object({
  choice: z.enum(LORE_VOTE_CHOICES),
});

interface LoreVotesRouteContext {
  params: Promise<{ claimId: string; leagueId: string }>;
}

async function loreVotesPost(request: Request, context: LoreVotesRouteContext) {
  const { claimId, leagueId } = await context.params;
  const { access, db } = await authorizeLoreMember(request, leagueId);
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_LORE_VOTE_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = castLoreVoteSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_LORE_VOTE_REQUEST",
        message: "Lore vote request payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    const memberId = await getMemberIdForUser(db, {
      leagueId,
      userId: access.value.userId,
    });
    await castLoreVote({
      deps: { db },
      input: {
        choice: parsed.data.choice,
        claimId,
        leagueId,
        voterMemberId: memberId,
      },
    });

    const vote = await getLoreClaimVoteStatus(db, {
      claimId,
      leagueId,
      memberId,
    });
    if (!vote) {
      throw new AppError({
        code: "LORE_CLAIM_NOT_FOUND",
        message: "Lore claim could not be found",
        status: 404,
      });
    }

    return okJson({ ...vote, claimId } satisfies LoreVoteCastResponse);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "LORE_VOTE_FAILED",
        message: "Lore vote could not be recorded",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/lore/claims/[claimId]/votes",
  },
  loreVotesPost,
);
