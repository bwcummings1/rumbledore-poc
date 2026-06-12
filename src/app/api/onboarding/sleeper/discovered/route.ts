import { recordApiHandler } from "@/core/metrics";
import { getSleeperOnboardingDependencies } from "@/onboarding/deps";
import { errorJson, requireUserId, resultJson } from "@/onboarding/http";
import { listSleeperDiscoveredLeagues } from "@/onboarding/sleeper-service";

export const runtime = "nodejs";

async function sleeperDiscoveredLeaguesGet(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const result = await listSleeperDiscoveredLeagues(
    getSleeperOnboardingDependencies(),
    {
      userId: userId.value,
    },
  );
  return resultJson(result);
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/onboarding/sleeper/discovered" },
  sleeperDiscoveredLeaguesGet,
);
