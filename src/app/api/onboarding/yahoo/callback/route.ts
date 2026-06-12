import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getYahooOnboardingDependencies } from "@/onboarding/deps";
import { requireUserId } from "@/onboarding/http";
import {
  connectYahooOAuth,
  YAHOO_OAUTH_STATE_COOKIE,
} from "@/onboarding/yahoo-service";

export const runtime = "nodejs";

function redirectToYahooPage(request: Request, params: Record<string, string>) {
  const url = new URL("/onboarding/yahoo", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(YAHOO_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: getEnv().nodeEnv === "production",
  });
  return response;
}

async function yahooCallbackGet(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return redirectToYahooPage(request, { error: userId.error.code });
  }

  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  if (providerError) {
    return redirectToYahooPage(request, { error: providerError });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await cookies()).get(YAHOO_OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectToYahooPage(request, {
      error: "YAHOO_OAUTH_STATE_INVALID",
    });
  }

  const result = await connectYahooOAuth(getYahooOnboardingDependencies(), {
    code,
    userId: userId.value,
  });
  if (!result.ok) {
    const error =
      result.error instanceof AppError
        ? result.error
        : new AppError({
            cause: result.error,
            code: "YAHOO_OAUTH_FAILED",
            message: "Yahoo authorization could not be completed",
            status: 502,
          });
    return redirectToYahooPage(request, { error: error.code });
  }

  return redirectToYahooPage(request, { connected: "1" });
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/onboarding/yahoo/callback" },
  yahooCallbackGet,
);
