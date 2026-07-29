import { recordApiHandler } from "@/core/metrics";
import { enforceApiRateLimitOrReject } from "@/core/rate-limit";
import { getEspnOnboardingDependencies } from "@/onboarding/deps";
import { startEspnBrowserConnect } from "@/onboarding/espn-service";
import { errorJson, requireUserId, resultJson } from "@/onboarding/http";

export const runtime = "nodejs";

async function browserStartPost(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }
  // Each call opens a metered Browserbase session, so the cap is deliberately
  // tighter than the other onboarding routes.
  const limited = await enforceApiRateLimitOrReject({
    max: 5,
    message: "Too many browser connect attempts. Try again shortly.",
    scope: "espn-browser-start",
    subject: userId.value,
    windowSeconds: 60,
  });
  if (limited) {
    return limited;
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
