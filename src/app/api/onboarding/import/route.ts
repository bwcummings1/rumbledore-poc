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
import { importDiscoveredLeague } from "@/onboarding/provider-service";
import { FANTASY_PROVIDER_IDS } from "@/providers";

export const runtime = "nodejs";

const bodySchema = z.object({
  provider: z.enum(FANTASY_PROVIDER_IDS),
  providerLeagueId: z.string().trim().min(1),
  season: z.coerce.number().int().min(2000).max(2100),
});

async function importDiscoveredPost(request: Request) {
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
        message: "provider, providerLeagueId, and season are required",
        status: 400,
      }),
    );
  }

  const result = await importDiscoveredLeague(
    getProviderOnboardingDependencies(),
    {
      provider: parsed.data.provider,
      providerLeagueId: parsed.data.providerLeagueId,
      season: parsed.data.season,
      userId: userId.value,
    },
  );
  return resultJson(result);
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/onboarding/import" },
  importDiscoveredPost,
);
