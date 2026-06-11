import { getEspnOnboardingDependencies } from "@/onboarding/deps";
import { listEspnDiscoveredLeagues } from "@/onboarding/espn-service";
import { errorJson, requireUserId, resultJson } from "@/onboarding/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const result = await listEspnDiscoveredLeagues(
    getEspnOnboardingDependencies(),
    {
      userId: userId.value,
    },
  );
  return resultJson(result);
}
