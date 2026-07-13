import { z } from "zod";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getProviderOnboardingDependencies } from "@/onboarding/deps";
import {
  errorJson,
  readJsonBody,
  requireUserId,
  resultJson,
} from "@/onboarding/http";
import { reviewQuarantinedIntegrityCheck } from "@/onboarding/provider-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  checkId: z.uuid(),
  leagueId: z.uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
});

async function reviewQuarantinePost(request: Request) {
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
        code: "INVALID_QUARANTINE_REVIEW",
        message: "leagueId and checkId are required",
        status: 400,
      }),
    );
  }

  return resultJson(
    await reviewQuarantinedIntegrityCheck(getProviderOnboardingDependencies(), {
      checkId: parsed.data.checkId,
      leagueId: parsed.data.leagueId,
      reason: parsed.data.reason,
      userId: userId.value,
    }),
  );
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/onboarding/quarantine/review" },
  reviewQuarantinePost,
);
