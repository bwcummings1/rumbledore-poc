import { NextResponse } from "next/server";
import { getEnv } from "@/core/env";
import type { AppError } from "@/core/result";
import { getDb } from "@/db";
import {
  createRealtimeGrantDeps,
  createRealtimeSubscriptionGrant,
} from "@/realtime/subscription-grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorJson(error: AppError): NextResponse {
  return NextResponse.json({ error: error.toJSON() }, { status: error.status });
}

export async function GET(request: Request) {
  const env = getEnv();
  const result = await createRealtimeSubscriptionGrant(
    createRealtimeGrantDeps(env, getDb()),
    {
      headers: request.headers,
      searchParams: new URL(request.url).searchParams,
    },
  );

  if (!result.ok) {
    return errorJson(result.error);
  }

  return NextResponse.json(result.value);
}
