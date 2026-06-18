import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { requireSession } from "@/auth/guards";
import { getDb } from "@/db";
import { getNewsWireData, type NewsWireMode } from "@/news/wire";

export const dynamic = "force-dynamic";

function wireMode(value: string | null): NewsWireMode {
  return value === "personal" ? "personal" : "general";
}

function limitValue(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = wireMode(url.searchParams.get("mode"));
  const session = await requireSession({ headers: await headers() });
  const data = await getNewsWireData(getDb(), {
    limit: limitValue(url.searchParams.get("limit")),
    mode,
    userId: session.ok ? session.value.userId : null,
  });

  return NextResponse.json(data);
}
