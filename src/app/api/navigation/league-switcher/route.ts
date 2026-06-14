import { NextResponse } from "next/server";
import { requireSession } from "@/auth/guards";
import { getDb } from "@/db";
import { listLeagueSwitcherItemsForUser } from "@/navigation/league-switcher-data";
import { serializeLeagueSwitcherItem } from "@/navigation/league-switcher-model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession({ headers: request.headers });
  if (!session.ok) {
    return NextResponse.json({ items: [] }, { status: session.error.status });
  }

  const result = await listLeagueSwitcherItemsForUser(getDb(), {
    userId: session.value.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ items: [] }, { status: result.error.status });
  }

  return NextResponse.json({
    items: result.value.map(serializeLeagueSwitcherItem),
  });
}
