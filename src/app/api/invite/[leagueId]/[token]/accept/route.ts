import { z } from "zod";
import { recordApiHandler } from "@/core/metrics";
import { enforceApiRateLimit } from "@/core/rate-limit";
import { AppError } from "@/core/result";
import { getDb } from "@/db";
import {
  errorJson,
  okJson,
  readJsonBody,
  requireUserId,
  resultJson,
} from "@/onboarding/http";
import { acceptLeagueInvite } from "@/onboarding/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ACCEPT_BODY_BYTES = 1024;
const RATE_LIMIT_RETRY_AFTER_SECONDS = "60";

const acceptInviteSchema = z
  .object({
    providerMemberId: z.string().trim().min(1).max(256).optional(),
  })
  .strict();

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
  const limit = await enforceApiRateLimit({
    max: 10,
    scope: "invite-accept",
    subject: userId.value,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many invite accept attempts. Try again shortly.",
        },
      },
      {
        headers: { "Retry-After": RATE_LIMIT_RETRY_AFTER_SECONDS },
        status: 429,
      },
    );
  }

  const { leagueId, token } = await context.params;
  const body = await readJsonBody(request, MAX_ACCEPT_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = acceptInviteSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_INVITE_ACCEPT_REQUEST",
        message: "Invite accept payload is invalid",
        status: 400,
      }),
    );
  }

  const result = await acceptLeagueInvite(
    { db: getDb() },
    {
      leagueId,
      providerMemberId: parsed.data.providerMemberId,
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
