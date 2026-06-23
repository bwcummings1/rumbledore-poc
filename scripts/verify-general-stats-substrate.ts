import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";

type EnvMap = Record<string, string | undefined>;

function loadEnvLocal(env: EnvMap): void {
  const path = resolve(process.cwd(), ".env.local");
  let body = "";
  try {
    body = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (!key || env[key] !== undefined) {
      continue;
    }
    env[key] = rawValue
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2")
      .replace(/\\n/g, "\n");
  }
}

function requireCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function passFail(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

function stripT12Section(body: string): string {
  return body.replace(/\n## T12 Substrate B[\s\S]*$/u, "").trimEnd();
}

function writeImportSummary(t12Lines: readonly string[]): void {
  mkdirSync(".orchestration", { recursive: true });
  let base = "# Real League Import Summary";
  try {
    base = stripT12Section(
      readFileSync(".orchestration/import-summary.md", "utf8"),
    );
  } catch {
    /* first verifier run in a clean workspace; write a concise T12-only summary */
  }
  writeFileSync(
    ".orchestration/import-summary.md",
    `${base}\n\n${t12Lines.join("\n")}\n`,
  );
}

loadEnvLocal(process.env);

async function main(): Promise<void> {
  const { parseEnv } = await import("../src/core/env/schema");
  const { createDb } = await import("../src/db/client");
  const { nflPlayers, nflPlayerWeekStats, nflSchedule, nflTeamStats } =
    await import("../src/db/schema");
  const { migrateSerialized } = await import("../src/db/test-support");
  const {
    enrichLeagueRosterFactWithGeneralStats,
    findGeneralStatsPlayerByFantasyProviderId,
    findGeneralStatsPlayerBySourceId,
    findGeneralStatsPlayersByName,
    getGeneralStatsPlayerStats,
    getGeneralStatsSchedule,
    getGeneralStatsTeamBoxScore,
    ingestMockGeneralStats,
    loadMockGeneralStatsFixture,
    runGeneralStatsIntegrityChecks,
  } = await import("../src/general-stats");

  const env = parseEnv(process.env);
  requireCondition(
    env.generalStats.mock,
    "general stats verification only supports the mock source",
  );

  const handle = createDb(env.databaseUrl);
  try {
    await migrateSerialized(handle);
    const fixture = loadMockGeneralStatsFixture();
    const integrity = runGeneralStatsIntegrityChecks(fixture);
    requireCondition(integrity.ok, "mock fixture integrity did not pass");

    const first = await ingestMockGeneralStats(handle.db, {
      fetchedAt: new Date(),
      fixture,
    });
    const second = await ingestMockGeneralStats(handle.db, {
      fetchedAt: new Date(),
      fixture,
    });

    const source = fixture.source;
    const [players] = await handle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(nflPlayers)
      .where(eq(nflPlayers.source, source));
    const [schedule] = await handle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(nflSchedule)
      .where(eq(nflSchedule.source, source));
    const [teamStats] = await handle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(nflTeamStats)
      .where(eq(nflTeamStats.source, source));
    const [playerWeekStats] = await handle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(nflPlayerWeekStats)
      .where(eq(nflPlayerWeekStats.source, source));
    const [provenance] = await handle.db
      .select({
        fetchedAt: nflPlayers.fetchedAt,
        source: nflPlayers.source,
      })
      .from(nflPlayers)
      .where(
        and(
          eq(nflPlayers.source, source),
          eq(nflPlayers.sourcePlayerId, "mock-patrick-mahomes"),
        ),
      )
      .limit(1);

    const mahomes = await findGeneralStatsPlayerBySourceId(handle.db, {
      source,
      sourcePlayerId: "mock-patrick-mahomes",
    });
    const lamb = await findGeneralStatsPlayerByFantasyProviderId(handle.db, {
      provider: "espn",
      providerPlayerId: "4241389",
      source,
    });
    const jeffersonByName = await findGeneralStatsPlayersByName(handle.db, {
      name: "jefferson",
      source,
    });
    const mahomesStats = await getGeneralStatsPlayerStats(handle.db, {
      season: 2026,
      source,
      sourcePlayerId: "mock-patrick-mahomes",
    });
    const dalWeek2 = await getGeneralStatsTeamBoxScore(handle.db, {
      season: 2026,
      source,
      team: "DAL",
      week: 2,
    });
    const kcSchedule = await getGeneralStatsSchedule(handle.db, {
      season: 2026,
      source,
      team: "KC",
    });
    const enriched = await enrichLeagueRosterFactWithGeneralStats(
      handle.db,
      {
        provider: "espn",
        providerPlayerId: "3139477",
        team: "KC",
      },
      { source },
    );

    const checks = [
      {
        label: "fixture integrity passes",
        pass: integrity.ok,
      },
      {
        label: "mock ingest populated all four B tables",
        pass:
          players?.count === fixture.players.length &&
          schedule?.count === fixture.schedule.length &&
          teamStats?.count === fixture.teamStats.length &&
          playerWeekStats?.count === fixture.playerWeekStats.length,
      },
      {
        label: "second ingest is idempotent for unchanged facts",
        pass:
          second.players.changed === 0 &&
          second.schedule.changed === 0 &&
          second.teamStats.changed === 0 &&
          second.playerWeekStats.changed === 0,
      },
      {
        label: "provenance source and fetched_at are present",
        pass:
          provenance?.source === source && provenance.fetchedAt instanceof Date,
      },
      {
        label: "player/provider/name reads resolve expected players",
        pass:
          mahomes?.position === "QB" &&
          lamb?.fullName === "CeeDee Lamb" &&
          jeffersonByName[0]?.fullName === "Justin Jefferson",
      },
      {
        label: "week/team/schedule reads return typed facts",
        pass:
          mahomesStats.length === 2 &&
          mahomesStats[1]?.fantasyPoints === 27.78 &&
          dalWeek2?.pointsFor === 30 &&
          kcSchedule.length === 2,
      },
      {
        label: "roster enrichment maps provider player id to identity",
        pass:
          enriched?.confidence === "provider_id" &&
          enriched.player.fullName === "Patrick Mahomes" &&
          enriched.player.position === "QB",
      },
    ];
    const failed = checks.filter((check) => !check.pass);

    const t12Lines = [
      "## T12 Substrate B",
      "",
      `- Source: ${source} (mock/$0)`,
      `- First ingest changed rows: players ${first.players.changed}/${first.players.total}, schedule ${first.schedule.changed}/${first.schedule.total}, team stats ${first.teamStats.changed}/${first.teamStats.total}, player week stats ${first.playerWeekStats.changed}/${first.playerWeekStats.total}`,
      `- Persisted rows: players ${players?.count ?? 0}, schedule ${schedule?.count ?? 0}, team stats ${teamStats?.count ?? 0}, player week stats ${playerWeekStats?.count ?? 0}`,
      `- Idempotent second ingest changed rows: players ${second.players.changed}, schedule ${second.schedule.changed}, team stats ${second.teamStats.changed}, player week stats ${second.playerWeekStats.changed}`,
      `- Provenance sample: ${provenance?.source ?? "(missing)"} fetched_at=${provenance?.fetchedAt.toISOString() ?? "(missing)"}`,
      "",
      "### Consumer Samples",
      "",
      `- Player by source id: ${mahomes ? `${mahomes.fullName} ${mahomes.position} ${mahomes.team}` : "(missing)"}`,
      `- Player by provider id: ${lamb ? `${lamb.fullName} ${lamb.position} ${lamb.team}` : "(missing)"}`,
      `- Name lookup: ${jeffersonByName[0]?.fullName ?? "(missing)"}`,
      `- Patrick Mahomes week 2 fantasy points: ${mahomesStats[1]?.fantasyPoints ?? "(missing)"}`,
      `- DAL week 2 points: ${dalWeek2?.pointsFor ?? "(missing)"}`,
      `- KC schedule rows: ${kcSchedule.length}`,
      `- Enrichment: ${enriched ? `${enriched.player.fullName} ${enriched.player.position} via ${enriched.confidence}` : "(missing)"}`,
      "",
      "### T12 Checks",
      "",
      ...checks.map((check) => `- ${passFail(check.pass)} - ${check.label}`),
    ];

    writeImportSummary(t12Lines);
    console.log(
      [
        "T12 general stats substrate verification PASS",
        `source=${source}`,
        `players=${players?.count ?? 0}`,
        `schedule=${schedule?.count ?? 0}`,
        `team_stats=${teamStats?.count ?? 0}`,
        `player_week_stats=${playerWeekStats?.count ?? 0}`,
        "summary=.orchestration/import-summary.md",
      ].join("\n"),
    );

    if (failed.length > 0) {
      throw new Error(
        `T12 verification failed: ${failed
          .map((check) => check.label)
          .join("; ")}`,
      );
    }
  } finally {
    await handle.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
