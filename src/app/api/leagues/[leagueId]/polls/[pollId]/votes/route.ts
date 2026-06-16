import { z } from "zod";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { castPollVote } from "@/instigator";
import { getLorePollVoteStatus } from "@/lore/member-experience";
import type { LorePollVoteCastResponse } from "@/lore/member-ui";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";
import {
  authorizeLoreMember,
  getMemberIdForUser,
} from "../../../lore/lore-route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_POLL_VOTE_BODY_BYTES = 1024;

const castPollVoteSchema = z.object({
  optionIdx: z.number().int().min(0),
});

interface PollVotesRouteContext {
  params: Promise<{ leagueId: string; pollId: string }>;
}

async function pollVotesPost(request: Request, context: PollVotesRouteContext) {
  const { leagueId, pollId } = await context.params;
  const { access, db } = await authorizeLoreMember(request, leagueId);
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_POLL_VOTE_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = castPollVoteSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_POLL_VOTE_REQUEST",
        message: "Poll vote request payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    const memberId = await getMemberIdForUser(db, {
      leagueId,
      userId: access.value.userId,
    });
    await castPollVote({
      deps: { db },
      input: {
        leagueId,
        memberId,
        optionIdx: parsed.data.optionIdx,
        pollId,
      },
    });

    const poll = await getLorePollVoteStatus(db, {
      leagueId,
      memberId,
      pollId,
    });
    if (!poll) {
      throw new AppError({
        code: "POLL_NOT_FOUND",
        message: "Poll could not be found",
        status: 404,
      });
    }

    return okJson({ ...poll, pollId } satisfies LorePollVoteCastResponse);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "POLL_VOTE_FAILED",
        message: "Poll vote could not be recorded",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/polls/[pollId]/votes",
  },
  pollVotesPost,
);
