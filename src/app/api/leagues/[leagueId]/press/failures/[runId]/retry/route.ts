import { retryGenerationFailureRun } from "@/ai";
import { createAiDependencies } from "@/ai/dependencies";
import { requireLeagueRole } from "@/auth/guards";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { enforceApiRateLimitOrReject } from "@/core/rate-limit";
import { toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GenerationFailureRetryRouteContext {
  params: Promise<{ leagueId: string; runId: string }>;
}

async function generationFailureRetryPost(
  request: Request,
  context: GenerationFailureRetryRouteContext,
) {
  const { leagueId, runId } = await context.params;
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
  // A retry re-runs the failed generation, so an unbounded retry button is an
  // unbounded model spend.
  const limited = await enforceApiRateLimitOrReject({
    max: 10,
    message: "Too many retry requests. Try again shortly.",
    scope: "generation-failure-retry",
    subject: access.value.userId,
    windowSeconds: 60,
  });
  if (limited) {
    return limited;
  }

  try {
    const result = await retryGenerationFailureRun(
      createAiDependencies(db, getEnv()),
      { actorUserId: access.value.userId, leagueId, runId },
    );
    return okJson(result);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "AI_GENERATION_FAILURE_RETRY_FAILED",
        message: "Generation run could not be retried",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  {
    method: "POST",
    route: "/api/leagues/[leagueId]/press/failures/[runId]/retry",
  },
  generationFailureRetryPost,
);
