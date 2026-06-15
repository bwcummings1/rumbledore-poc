import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getLoreClaimDetailData } from "@/lore/member-experience";
import { errorJson, okJson } from "@/onboarding/http";
import {
  authorizeLoreMember,
  getMemberIdForUser,
  isLoreSteward,
} from "../../lore-route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoreClaimRouteContext {
  params: Promise<{ claimId: string; leagueId: string }>;
}

async function loreClaimGet(request: Request, context: LoreClaimRouteContext) {
  const { claimId, leagueId } = await context.params;
  const { access, db } = await authorizeLoreMember(request, leagueId);
  if (!access.ok) {
    return errorJson(access.error);
  }

  try {
    const memberId = await getMemberIdForUser(db, {
      leagueId,
      userId: access.value.userId,
    });
    const result = await getLoreClaimDetailData(db, {
      claimId,
      isSteward: isLoreSteward(access.value),
      leagueId,
      memberId,
    });

    switch (result.status) {
      case "ready":
        return okJson(result.data);
      case "not_found":
        return errorJson(
          new AppError({
            code: "LORE_CLAIM_NOT_FOUND",
            message: "Lore claim could not be found",
            status: 404,
          }),
        );
    }
  } catch (error) {
    return errorJson(
      error instanceof AppError
        ? error
        : new AppError({
            cause: error,
            code: "LORE_CLAIM_READ_FAILED",
            message: "Lore claim could not be loaded",
            status: 500,
          }),
    );
  }
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/leagues/[leagueId]/lore/claims/[claimId]" },
  loreClaimGet,
);
