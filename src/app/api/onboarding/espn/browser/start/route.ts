import { recordApiHandler } from "@/core/metrics";
import { getEspnOnboardingDependencies } from "@/onboarding/deps";
import { startEspnBrowserConnect } from "@/onboarding/espn-service";
import { errorJson, requireUserId, resultJson } from "@/onboarding/http";

export const runtime = "nodejs";

async function browserStartPost(request: Request) {
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

export const POST = recordApiHandler(
  { method: "POST", route: "/api/onboarding/espn/browser/start" },
  browserStartPost,
);
