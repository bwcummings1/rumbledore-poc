import { randomUUID } from "node:crypto";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { getYahooOnboardingDependencies } from "@/onboarding/deps";
import { errorJson, okJson, requireUserId } from "@/onboarding/http";
import {
  startYahooOAuth,
  YAHOO_OAUTH_STATE_COOKIE,
} from "@/onboarding/yahoo-service";

export const runtime = "nodejs";

const YAHOO_OAUTH_STATE_TTL_SECONDS = 10 * 60;

async function yahooStartPost(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const state = randomUUID();
  const result = startYahooOAuth(getYahooOnboardingDependencies(), { state });
  if (!result.ok) {
    return errorJson(result.error);
  }

  const response = okJson(result.value);
  response.cookies.set(YAHOO_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: YAHOO_OAUTH_STATE_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: getEnv().nodeEnv === "production",
  });
  return response;
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/onboarding/yahoo/start" },
  yahooStartPost,
);
