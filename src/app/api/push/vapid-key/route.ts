import { NextResponse } from "next/server";
import { getEnv } from "@/core/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
