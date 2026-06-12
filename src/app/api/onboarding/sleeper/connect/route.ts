import { z } from "zod";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getSleeperOnboardingDependencies } from "@/onboarding/deps";
import {
  errorJson,
  readJsonBody,
  requireUserId,
  resultJson,
} from "@/onboarding/http";
import { connectSleeperPublic } from "@/onboarding/sleeper-service";

export const runtime = "nodejs";

const bodySchema = z.object({
  seasons: z
    .array(z.coerce.number().int().min(2000).max(2100))
    .min(1)
    .max(10)
    .optional(),
  usernameOrUserId: z.string().trim().min(1),
});

async function sleeperConnectPost(request: Request) {
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
        message: "A valid Sleeper username or user ID is required",
        status: 400,
      }),
    );
  }

  const result = await connectSleeperPublic(
    getSleeperOnboardingDependencies(),
    {
      credentials: parsed.data,
      userId: userId.value,
    },
  );
  return resultJson(result);
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/onboarding/sleeper/connect" },
  sleeperConnectPost,
);
