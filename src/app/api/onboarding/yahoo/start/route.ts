import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getYahooOnboardingDependencies } from "@/onboarding/deps";
import {
  errorJson,
  okJson,
  readJsonBody,
  requireUserId,
} from "@/onboarding/http";
import {
  normalizeLocalReturnTo,
  YAHOO_OAUTH_RETURN_TO_COOKIE,
} from "@/onboarding/return-to";
import {
  startYahooOAuth,
  YAHOO_OAUTH_STATE_COOKIE,
} from "@/onboarding/yahoo-service";

export const runtime = "nodejs";

const YAHOO_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const yahooStartSchema = z
  .object({
    returnTo: z.string().max(2048).optional().nullable(),
  })
  .strict();

async function yahooStartPost(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const body = await readJsonBody(request, 4096);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = yahooStartSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_YAHOO_CONNECT_REQUEST",
        message: "Yahoo connect payload is invalid",
        status: 400,
      }),
    );
  }

  const state = randomUUID();
  const result = startYahooOAuth(getYahooOnboardingDependencies(), { state });
  if (!result.ok) {
    return errorJson(result.error);
  }

  const returnTo = normalizeLocalReturnTo(parsed.data.returnTo);
  const response = okJson(result.value);
  response.cookies.set(YAHOO_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: YAHOO_OAUTH_STATE_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: getEnv().nodeEnv === "production",
  });
  if (returnTo) {
    response.cookies.set(YAHOO_OAUTH_RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      maxAge: YAHOO_OAUTH_STATE_TTL_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: getEnv().nodeEnv === "production",
    });
  } else {
    response.cookies.set(YAHOO_OAUTH_RETURN_TO_COOKIE, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: getEnv().nodeEnv === "production",
    });
  }
  return response;
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/onboarding/yahoo/start" },
  yahooStartPost,
);
