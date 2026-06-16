import { NextResponse } from "next/server";
import { getEnv } from "@/core/env";
import { runHealthCheck } from "@/core/health";
import { logger } from "@/core/logging";
import { recordApiHandler } from "@/core/metrics";
import { getDb } from "@/db";

export const runtime = "nodejs";

async function healthGet() {
  const env = getEnv();
  const payload = await runHealthCheck({
    db: getDb(),
    inngest: env.jobs.inngest,
    nodeEnv: env.nodeEnv,
    realtime: env.realtime,
    redisUrl: env.redisUrl,
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

export const GET = recordApiHandler(
  { method: "GET", route: "/api/health" },
  healthGet,
);
