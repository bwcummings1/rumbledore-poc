import { recordApiHandler } from "@/core/metrics";
import { getDb } from "@/db";
import { errorJson, requireUserId, resultJson } from "@/onboarding/http";
import { listDiscoveredLeagueInventory } from "@/onboarding/provider-service";

export const runtime = "nodejs";

async function discoveredLeagueInventoryGet(request: Request) {
  const userId = await requireUserId(request);
  if (!userId.ok) {
    return errorJson(userId.error);
  }

  const result = await listDiscoveredLeagueInventory(
    { db: getDb() },
    {
      userId: userId.value,
    },
  );
  return resultJson(result);
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/onboarding/discovered" },
  discoveredLeagueInventoryGet,
);
