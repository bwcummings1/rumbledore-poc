import { retryGenerationFailureRun } from "@/ai";
import { createAiDependencies } from "@/ai/dependencies";
import { requireLeagueRole } from "@/auth/guards";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
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
