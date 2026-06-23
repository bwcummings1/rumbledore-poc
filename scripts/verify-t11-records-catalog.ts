import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { formatNumber } from "../src/app/leagues/[leagueId]/records/records-format";
import {
  getLeagueRecordsPageData,
  type RecordsPageData,
} from "../src/app/leagues/[leagueId]/records/records-page-data";

type EnvMap = Record<string, string | undefined>;

function loadEnvLocal(env: EnvMap): void {
  const path = resolve(process.cwd(), ".env.local");
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error("Missing .env.local with ESPN verification config", {
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

function stripT11Section(body: string): string {
  return body.replace(/\n## T11 Records Catalog[\s\S]*$/u, "").trimEnd();
}

function writeImportSummary(t11Lines: readonly string[]): void {
  mkdirSync(".orchestration", { recursive: true });
  let base = "# Real League Import Summary";
  try {
    base = stripT11Section(
      readFileSync(".orchestration/import-summary.md", "utf8"),
    );
  } catch {
    /* clean workspace; write a concise T11-only summary */
  }
  writeFileSync(
    ".orchestration/import-summary.md",
    `${base}\n\n${t11Lines.join("\n")}\n`,
  );
}

function currentRecord(
  data: RecordsPageData,
  recordType: RecordsPageData["currentRecords"][number]["recordType"],
) {
  return data.currentRecords.find((record) => record.recordType === recordType);
}

function recordSample(
  data: RecordsPageData,
  recordType: RecordsPageData["currentRecords"][number]["recordType"],
): string {
  const record = currentRecord(data, recordType);
  if (!record) {
    return "(missing)";
  }
  const context = [
    record.holderName ?? "Unknown",
    record.season ? String(record.season) : null,
    record.scoringPeriod ? `week ${record.scoringPeriod}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `${record.label}: ${formatNumber(record.value)} (${context})`;
}

loadEnvLocal(process.env);

async function main(): Promise<void> {
  const { parseEnv } = await import("../src/core/env/schema");
  const { createDb } = await import("../src/db/client");
  const { migrateSerialized } = await import("../src/db/test-support");
  const { leagues } = await import("../src/db/schema");

  const env = parseEnv(process.env);
  const providerLeagueId = String(env.espn.testLeagueId ?? 95050);
  const handle = createDb(env.databaseUrl);

  try {
    await migrateSerialized(handle);
    const [league] = await handle.db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(
        and(
          eq(leagues.provider, "espn"),
          eq(leagues.providerLeagueId, providerLeagueId),
        ),
      )
      .orderBy(desc(leagues.updatedAt))
      .limit(1);
    requireCondition(
      Boolean(league),
      "ESPN 95050 league is missing. Run scripts/verify-t10-era-proposals.ts first.",
    );

    const result = await getLeagueRecordsPageData(handle.db, {
      leagueId: league?.id ?? "",
    });
    requireCondition(result.status === "ready", "records page was not ready");
    if (result.status !== "ready") {
      return;
    }

    const data = result.data;
    const checks = [
      {
        label: "regular-season category has standings",
        pass: data.catalog.regularSeason.standings.length > 0,
      },
      {
        label: "playoff category has postseason rows",
        pass:
          data.catalog.playoff.standings.length > 0 ||
          data.catalog.championships.managerRecords.length > 0,
      },
      {
        label: "head-to-head category has rivalries",
        pass: data.catalog.headToHead.allTimePairs.length > 0,
      },
      {
        label: "achievements category has high marks",
        pass:
          data.catalog.achievements.highestScoringSeasons.length > 0 ||
          data.catalog.highLow.highestScores.length > 0,
      },
      {
        label: "lowlights category has worst records",
        pass:
          data.catalog.lowlights.lowestScoringSeasons.length > 0 ||
          data.catalog.lowlights.biggestLosses.length > 0,
      },
      {
        label: "new lowlight current records are present",
        pass:
          Boolean(currentRecord(data, "biggest_loss")) &&
          Boolean(currentRecord(data, "lowest_single_week_score")),
      },
    ];
    const failed = checks.filter((check) => !check.pass);

    const regularLeader = data.catalog.regularSeason.standings[0];
    const playoffLeader = data.catalog.playoff.standings[0];
    const h2hPair = data.catalog.headToHead.allTimePairs[0];
    const lowlightLoss = data.catalog.lowlights.biggestLosses[0];

    const t11Lines = [
      "## T11 Records Catalog",
      "",
      `- League row: ${data.league.name} (${data.league.id})`,
      `- Lens: ${data.lens.segment}, ${data.lens.groupingId ? "confirmed era" : "cumulative"}`,
      `- All-time rows: ${data.catalog.allTimeStandings.length}`,
      `- Regular standings rows: ${data.catalog.regularSeason.standings.length}`,
      `- Playoff standings rows: ${data.catalog.playoff.standings.length}`,
      `- H2H rivalry rows: ${data.catalog.headToHead.allTimePairs.length}`,
      `- Achievement high-season rows: ${data.catalog.achievements.highestScoringSeasons.length}`,
      `- Lowlight biggest-loss rows: ${data.catalog.lowlights.biggestLosses.length}`,
      "",
      "### Sample Records",
      "",
      `- Regular leader: ${regularLeader ? `${regularLeader.personName} ${regularLeader.wins}-${regularLeader.losses}-${regularLeader.ties}, PF ${formatNumber(regularLeader.pointsFor)}` : "(missing)"}`,
      `- Playoff leader: ${playoffLeader ? `${playoffLeader.personName} ${playoffLeader.wins}-${playoffLeader.losses}-${playoffLeader.ties}, PF ${formatNumber(playoffLeader.pointsFor)}` : "(missing)"}`,
      `- H2H sample: ${h2hPair ? `${h2hPair.personA.personName} vs ${h2hPair.personB.personName}, ${h2hPair.meetings} meetings` : "(missing)"}`,
      `- ${recordSample(data, "highest_single_week_score")}`,
      `- ${recordSample(data, "lowest_single_week_score")}`,
      `- ${recordSample(data, "biggest_loss")}`,
      `- Biggest loss list: ${lowlightLoss ? `${lowlightLoss.personName} lost by ${formatNumber(lowlightLoss.margin)} in ${lowlightLoss.season} week ${lowlightLoss.scoringPeriod}` : "(missing)"}`,
      "",
      "### T11 Checks",
      "",
      ...checks.map((check) => `- ${passFail(check.pass)} - ${check.label}`),
    ];

    writeImportSummary(t11Lines);
    console.log(
      [
        "T11 records catalog verification PASS",
        `league=${data.league.name}`,
        `all_time=${data.catalog.allTimeStandings.length}`,
        `regular=${data.catalog.regularSeason.standings.length}`,
        `playoff=${data.catalog.playoff.standings.length}`,
        `h2h=${data.catalog.headToHead.allTimePairs.length}`,
        `lowlights=${data.catalog.lowlights.biggestLosses.length}`,
        "summary=.orchestration/import-summary.md",
      ].join("\n"),
    );

    if (failed.length > 0) {
      throw new Error(
        `T11 verification failed: ${failed
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
