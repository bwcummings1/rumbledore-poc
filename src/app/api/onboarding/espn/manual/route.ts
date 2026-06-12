import { z } from "zod";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getEspnOnboardingDependencies } from "@/onboarding/deps";
import { connectEspnManual } from "@/onboarding/espn-service";
import {
  errorJson,
  readJsonBody,
  requireUserId,
  resultJson,
} from "@/onboarding/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  espn_s2: z.string().trim().min(1), // secret-scan:ignore - request schema key, not a cookie value
  swid: z.string().trim().min(1),
});

async function manualConnectPost(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
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
        message: "Valid SWID and espn_s2 values are required",
        status: 400,
      }),
    );
  }

  const result = await connectEspnManual(getEspnOnboardingDependencies(), {
    credentials: parsed.data,
    userId: userId.value,
  });
  return resultJson(result);
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/onboarding/espn/manual" },
  manualConnectPost,
);
