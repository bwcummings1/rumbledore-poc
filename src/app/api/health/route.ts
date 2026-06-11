import { NextResponse } from "next/server";
import { getEnv } from "@/core/env";
import { runHealthCheck } from "@/core/health";
import { logger } from "@/core/logging";
import { getDb } from "@/db";

export const runtime = "nodejs";

export async function GET() {
  const payload = await runHealthCheck({
    db: getDb(),
    redisUrl: getEnv().redisUrl,
  });

  if (payload.status !== "ok") {
    logger.warn("health_check_degraded", { checks: payload.checks });
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
    status: payload.status === "ok" ? 200 : 503,
  });
}
