import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";

type EnvMap = Record<string, string | undefined>;

function loadEnvLocal(env: EnvMap): void {
  const path = resolve(process.cwd(), ".env.local");
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error("Missing .env.local with ESPN credentials", {
      cause: error,
    });
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
    if (env[key] !== undefined) {
      continue;
    }
    const value = rawValue
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2")
      .replace(/\\n/g, "\n");
    env[key] = value;
  }
}

function expectedHistorySeasons(currentSeason: number, totalSeasons: number) {
  return Array.from(
    { length: totalSeasons - 1 },
    (_, index) => currentSeason - index - 1,
  );
}

function slotCount(
  counts: Record<string, number> | null | undefined,
  slotId: string,
): number {
  return counts?.[slotId] ?? 0;
}

function passFail(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

loadEnvLocal(process.env);

async function main(): Promise<void> {
  const { parseEnv } = await import("../src/core/env/schema");
  const { createDb } = await import("../src/db/client");
  const { migrateSerialized } = await import("../src/db/test-support");
  const { leagues } = await import("../src/db/schema");
  const { syncCurrentLeague } = await import("../src/ingestion/current-league");
  const { importLeagueHistory } = await import(
    "../src/ingestion/historical-import"
  );
  const { loadImportSummaryData } = await import(
    "../src/ingestion/import-summary"
  );
  const { createEspnDiscoveryProvider } = await import(
    "../src/providers/espn/client"
  );
  const { recomputeLeagueStatistics } = await import("../src/stats/engine");

  const env = parseEnv(process.env);
  const leagueId = env.espn.testLeagueId ?? 95050;
  const currentSeason = env.espn.testSeason ?? 2026;
  const totalSeasons = 16;
  const historySeasons = expectedHistorySeasons(currentSeason, totalSeasons);
  const swid = env.espn.swid;
  const espnS2 = env.espn.s2;

  if (!swid || !espnS2) {
    throw new Error(
      "ESPN_SWID and ESPN_S2 must be set in .env.local for real-league import verification",
    );
  }

  const handle = createDb(env.databaseUrl);
  const provider = createEspnDiscoveryProvider();
  const session = {
    authKind: "cookie" as const,
    espn_s2: espnS2,
    provider: "espn" as const,
    subjectProviderId: swid,
    swid,
  };
  const ref = {
    name: `ESPN League ${leagueId}`,
    provider: "espn" as const,
    providerId: String(leagueId),
    season: currentSeason,
    sport: "ffl" as const,
  };

  try {
    await migrateSerialized(handle);
    await handle.db
      .delete(leagues)
      .where(
        and(
          eq(leagues.provider, "espn"),
          eq(leagues.providerLeagueId, String(leagueId)),
        ),
      );

    const current = await syncCurrentLeague({
      db: handle.db,
      provider,
      ref,
      session,
    });
    if (!current.ok) {
      throw current.error;
    }

    const history = await importLeagueHistory({
      db: handle.db,
      provider,
      ref,
      seasons: historySeasons,
      session,
    });
    if (!history.ok) {
      throw history.error;
    }

    const stats = await recomputeLeagueStatistics(handle.db, {
      leagueId: current.value.league.id,
    });
    const summary = await loadImportSummaryData(
      handle.db,
      current.value.league.id,
    );
    const rows = summary.seasonSettings;

    const bySeason = new Map(rows.map((row) => [row.season, row]));
    const season2011 = bySeason.get(2011);
    const season2012 = bySeason.get(2012);
    const season2013 = bySeason.get(2013);
    const season2020 = bySeason.get(2020);
    const season2021 = bySeason.get(2021);
    const season2026 = bySeason.get(currentSeason);
    const maxPersonSeasons = Math.max(
      0,
      ...summary.persons.map((person) => person.mappedSeasons.length),
    );
    const fixtureNamedPersons = summary.persons.filter((person) =>
      /^Fixture Manager \d+$/i.test(person.canonicalName),
    );
    const checks = [
      {
        label: `settings rows present for ${totalSeasons} seasons`,
        pass: rows.length === totalSeasons,
      },
      {
        label: "league size changes 10 to 12 in 2013",
        pass: season2012?.leagueSize === 10 && season2013?.leagueSize === 12,
      },
      {
        label: "playoffMatchupPeriodLength is 2 for 2011-2012",
        pass:
          season2011?.playoffMatchupPeriodLength === 2 &&
          season2012?.playoffMatchupPeriodLength === 2,
      },
      {
        label: "regular-season weeks change 13 to 14 in 2021",
        pass:
          season2020?.matchupPeriodCount === 13 &&
          season2021?.matchupPeriodCount === 14,
      },
      {
        label: "lineup slot signature moves OP to FLEX",
        pass:
          slotCount(season2011?.lineupSlotCounts, "7") > 0 &&
          slotCount(season2026?.lineupSlotCounts, "23") > 0,
      },
      {
        label:
          "persons list is scoped to imported league and has no fixture managers",
        pass: fixtureNamedPersons.length === 0,
      },
      {
        label: "person identities collapse across historical seasons",
        pass: summary.persons.length >= 10 && summary.persons.length <= 24,
      },
      {
        label: "at least one identity spans ten or more seasons",
        pass: maxPersonSeasons >= 10,
      },
    ];
    const summaryLines = [
      "# Real League Import Summary",
      "",
      `- League: ESPN ${leagueId}`,
      `- Current season synced: ${currentSeason}`,
      `- Historical seasons requested in one import: ${historySeasons.join(", ")}`,
      `- Settings rows: ${rows.length}`,
      "",
      "## Verification Checks",
      "",
      ...checks.map((check) => `- ${passFail(check.pass)} - ${check.label}`),
      "",
      "## Season Settings",
      "",
      "| Season | Size | Reg Weeks | Playoff Teams | Playoff Length | Scoring | Acquisition | Budget | OP(7) | FLEX(23) |",
      "|---:|---:|---:|---:|---:|---|---|---:|---:|---:|",
      ...rows.map(
        (row) =>
          `| ${[
            row.season,
            row.leagueSize,
            row.matchupPeriodCount,
            row.playoffTeamCount ?? "",
            row.playoffMatchupPeriodLength ?? "",
            row.scoringType,
            row.acquisitionType ?? "",
            row.acquisitionBudget ?? "",
            slotCount(row.lineupSlotCounts, "7"),
            slotCount(row.lineupSlotCounts, "23"),
          ].join(" | ")} |`,
      ),
      "",
      "## Persons",
      "",
      `- Persons: ${summary.persons.length}`,
      `- Team seasons: ${summary.teamSeasons}`,
      `- Identity mappings: ${summary.identityMappings}`,
      `- Max seasons on one identity: ${maxPersonSeasons}`,
      "",
      "| Person | Seasons | Owner Names | Team Names |",
      "|---|---:|---|---|",
      ...summary.persons.map(
        (person) =>
          `| ${[
            person.canonicalName,
            person.mappedSeasons.join(", "),
            person.ownerNames.join(", "),
            person.teamNames.join(", "),
          ].join(" | ")} |`,
      ),
      "",
      "## Import Stats",
      "",
      `- Current teams changed/total: ${current.value.teams.changed}/${current.value.teams.total}`,
      `- Current matchups changed/total: ${current.value.matchups.changed}/${current.value.matchups.total}`,
      `- Historical imported seasons: ${history.value.seasons.imported.join(", ")}`,
      `- Historical skipped seasons: ${history.value.seasons.skipped.join(", ") || "(none)"}`,
      `- Historical teams changed/total: ${history.value.teams.changed}/${history.value.teams.total}`,
      `- Historical matchups changed/total: ${history.value.matchups.changed}/${history.value.matchups.total}`,
      `- Stats weekly rows: ${stats.weeklyStatistics}`,
      `- Stats season rows: ${stats.seasonStatistics}`,
      `- Stats integrity failures: ${stats.integrityFailures}`,
    ];

    mkdirSync(".orchestration", { recursive: true });
    writeFileSync(
      ".orchestration/import-summary.md",
      `${summaryLines.join("\n")}\n`,
    );

    const failed = checks.filter((check) => !check.pass);
    console.log(
      `Imported ESPN ${leagueId}; wrote .orchestration/import-summary.md`,
    );
    if (failed.length > 0) {
      throw new Error(
        `Real-league settings verification failed: ${failed
          .map((check) => check.label)
          .join("; ")}`,
      );
    }
  } finally {
    await handle.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
