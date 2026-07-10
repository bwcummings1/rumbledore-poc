import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Operational steward tool: capture a fresh curation checkpoint of the CURRENT
// draft/live state and push every season, promoting it to the canonical
// snapshot set. Used after snapshot-model extensions (e.g. T19 player facts)
// so the Record Book's pushed-only projection can see the new arrays.
// Usage: PATH=/usr/bin:$PATH pnpm exec tsx scripts/repush-all-seasons.ts <providerLeagueId> <actorUserId> [reason]

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of body.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]?.replace(/^"|"$/g, "") ?? "";
    }
  }
}

async function main(): Promise<void> {
  const [providerLeagueId, actorUserId, reason] = process.argv.slice(2);
  if (!providerLeagueId || !actorUserId) {
    console.error(
      "usage: tsx scripts/repush-all-seasons.ts <providerLeagueId> <actorUserId> [reason]",
    );
    process.exit(1);
  }

  loadEnvLocal();
  const { LOCAL_DATABASE_URL } = await import("../src/core/env/schema");
  const databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
  const { createDb } = await import("../src/db/client");
  const { eq } = await import("drizzle-orm");
  const { leagues } = await import("../src/db/schema");
  const { createCurationCheckpoint, pushAllCurationSeasons } = await import(
    "../src/stats/curated-state"
  );
  const { getLeagueCanonRecordsContext } = await import(
    "../src/stats/canon-catalog"
  );

  const handle = createDb(databaseUrl);
  try {
    const [league] = await handle.db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(eq(leagues.providerLeagueId, providerLeagueId))
      .limit(1);
    if (!league) {
      throw new Error(`no league with providerLeagueId=${providerLeagueId}`);
    }
    console.log(`league: ${league.name} (${league.id})`);

    const checkpoint = await createCurationCheckpoint(handle.db, {
      actorUserId,
      label: reason ?? "repush all seasons",
      leagueId: league.id,
      note: reason,
    });
    console.log(
      `checkpoint ${checkpoint.id} captured (${checkpoint.seasons.length} seasons)`,
    );

    const pushes = await pushAllCurationSeasons(handle.db, {
      actorUserId,
      checkpointId: checkpoint.id,
      leagueId: league.id,
      reason: reason ?? "repush all seasons",
    });
    console.log(`pushed ${pushes.length} seasons`);

    const context = await getLeagueCanonRecordsContext(handle.db, {
      leagueId: league.id,
      limit: 5,
    });
    const players = context.catalog.players;
    if (!players) {
      console.log("players catalog: MISSING");
    } else {
      for (const [category, entries] of Object.entries(players)) {
        const list = Array.isArray(entries) ? entries : [];
        const top = list[0] as
          | { label?: string; playerName?: string; value?: number }
          | undefined;
        console.log(
          `players.${category}: ${list.length} entries` +
            (top
              ? ` | top: ${top.playerName ?? top.label ?? "?"} ${top.value ?? ""}`
              : ""),
        );
      }
    }
  } finally {
    await handle.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
