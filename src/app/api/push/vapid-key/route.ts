import { NextResponse } from "next/server";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function vapidKeyGet() {
  const env = getEnv();
  return NextResponse.json(
    {
      mock: env.push.mock,
      publicKey: env.push.publicKey,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/push/vapid-key" },
  vapidKeyGet,
);
