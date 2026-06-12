import { recordApiHandler } from "@/core/metrics";
import { getDb } from "@/db";
import {
  errorJson,
  okJson,
  requireUserId,
  resultJson,
} from "@/onboarding/http";
import { acceptLeagueInvite } from "@/onboarding/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InviteAcceptRouteContext {
  params: Promise<{ leagueId: string; token: string }>;
}

async function inviteAcceptPost(
  request: Request,
  context: InviteAcceptRouteContext,
) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const { leagueId, token } = await context.params;
  const result = await acceptLeagueInvite(
    { db: getDb() },
    {
      leagueId,
      token,
      userId: userId.value,
    },
  );

  if (!result.ok) {
    return resultJson(result);
  }

  return okJson({
    ...result.value,
    leagueUrl: `/leagues/${result.value.league.id}`,
  });
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/invite/[leagueId]/[token]/accept" },
  inviteAcceptPost,
);
