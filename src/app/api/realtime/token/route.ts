import { NextResponse } from "next/server";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
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

async function realtimeTokenGet(request: Request) {
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

export const GET = recordApiHandler(
  { method: "GET", route: "/api/realtime/token" },
  realtimeTokenGet,
);
