import { getEspnOnboardingDependencies } from "@/onboarding/deps";
import { startEspnBrowserConnect } from "@/onboarding/espn-service";
import { errorJson, requireUserId, resultJson } from "@/onboarding/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const result = await startEspnBrowserConnect(
    getEspnOnboardingDependencies(),
    userId.value,
  );
  return resultJson(result, 201);
}
