import { recordApiHandler } from "@/core/metrics";
import { getYahooOnboardingDependencies } from "@/onboarding/deps";
import { errorJson, requireUserId, resultJson } from "@/onboarding/http";
import { listYahooDiscoveredLeagues } from "@/onboarding/yahoo-service";

export const runtime = "nodejs";

async function yahooDiscoveredLeaguesGet(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const result = await listYahooDiscoveredLeagues(
    getYahooOnboardingDependencies(),
    {
      userId: userId.value,
    },
  );
  return resultJson(result);
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/onboarding/yahoo/discovered" },
  yahooDiscoveredLeaguesGet,
);
