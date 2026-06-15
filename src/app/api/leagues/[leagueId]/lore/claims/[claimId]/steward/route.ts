import { z } from "zod";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { stewardLoreClaim } from "@/lore";
import { getLoreClaimCard } from "@/lore/member-experience";
import {
  LORE_STEWARD_ACTIONS,
  type LoreStewardActionResponse,
} from "@/lore/member-ui";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";
import { createRealtimePublisher } from "@/realtime";
import {
  authorizeLoreMember,
  getMemberIdForUser,
} from "../../../lore-route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LORE_STEWARD_BODY_BYTES = 2048;

const stewardLoreActionSchema = z.object({
  action: z.enum(LORE_STEWARD_ACTIONS),
  extendUntil: z.string().datetime().optional(),
  reason: z.string().trim().min(1).max(500),
});

interface LoreStewardRouteContext {
  params: Promise<{ claimId: string; leagueId: string }>;
}

async function loreStewardPost(
  request: Request,
  context: LoreStewardRouteContext,
) {
  const { claimId, leagueId } = await context.params;
  const { access, db } = await authorizeLoreMember(
    request,
    leagueId,
    "data_steward",
  );
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_LORE_STEWARD_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = stewardLoreActionSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_LORE_STEWARD_REQUEST",
        message: "Lore steward action payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    const memberId = await getMemberIdForUser(db, {
      leagueId,
      userId: access.value.userId,
    });
    const result = await stewardLoreClaim({
      deps: { db, realtime: createRealtimePublisher(getEnv()) },
      input: {
        action: parsed.data.action,
        actorMemberId: memberId,
        claimId,
        ...(parsed.data.extendUntil
          ? { extendUntil: new Date(parsed.data.extendUntil) }
          : {}),
        leagueId,
        reason: parsed.data.reason,
      },
    });
    const claim = await getLoreClaimCard(db, {
      claimId,
      leagueId,
      memberId,
    });
    if (!claim) {
      throw new AppError({
        code: "LORE_CLAIM_NOT_FOUND",
        message: "Lore claim could not be found",
        status: 404,
      });
    }

    let response: LoreStewardActionResponse;
    switch (result.status) {
      case "canonized":
        response = { claim, result };
        break;
      case "rejected":
        response = { claim, result };
        break;
      case "extended":
        response = {
          claim,
          result: {
            ...result,
            voteClosesAt: result.voteClosesAt.toISOString(),
          },
        };
        break;
    }

    return okJson(response);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "LORE_STEWARD_ACTION_FAILED",
        message: "Lore steward action could not be applied",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/lore/claims/[claimId]/steward",
  },
  loreStewardPost,
);
