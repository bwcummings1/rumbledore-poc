import { z } from "zod";
import { recordApiHandler } from "@/core/metrics";
import { enforceApiRateLimitOrReject } from "@/core/rate-limit";
import { AppError } from "@/core/result";
import { getEspnOnboardingDependencies } from "@/onboarding/deps";
import { completeEspnBrowserConnect } from "@/onboarding/espn-service";
import {
  errorJson,
  readJsonBody,
  requireUserId,
  resultJson,
} from "@/onboarding/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.uuid(),
});

async function browserCapturePost(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }
  const limited = await enforceApiRateLimitOrReject({
    max: 10,
    message: "Too many browser capture attempts. Try again shortly.",
    scope: "espn-browser-capture",
    subject: userId.value,
    windowSeconds: 60,
  });
  if (limited) {
    return limited;
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_REQUEST",
        message: "sessionId is required",
        status: 400,
      }),
    );
  }

  const result = await completeEspnBrowserConnect(
    getEspnOnboardingDependencies(),
    {
      sessionId: parsed.data.sessionId,
      userId: userId.value,
    },
  );
  return resultJson(result);
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/onboarding/espn/browser/capture" },
  browserCapturePost,
);
