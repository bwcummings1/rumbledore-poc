import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, asc, desc, eq } from "drizzle-orm";
import type {
  CurrentRecordBookEntry,
  RecordsDataResult,
  RecordsPageData,
} from "../src/app/leagues/[leagueId]/records/records-page-data";

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
    env[key] = rawValue
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2")
      .replace(/\\n/g, "\n");
  }
}

function expectedHistorySeasons(currentSeason: number, totalSeasons: number) {
  return Array.from(
    { length: totalSeasons - 1 },
    (_, index) => currentSeason - index - 1,
  );
}

function requireCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function passFail(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

function numberList(values: readonly number[]): string {
  return values.join(", ");
}

function stripT9Section(body: string): string {
  return body.replace(/\n## T9 Vertical Slice[\s\S]*$/u, "").trimEnd();
}

function writeImportSummary(
  fallbackSummaryLines: readonly string[],
  t9Lines: readonly string[],
): void {
  mkdirSync(".orchestration", { recursive: true });
  let base = fallbackSummaryLines.join("\n");
  try {
    base = stripT9Section(
      readFileSync(".orchestration/import-summary.md", "utf8"),
    );
  } catch {
    /* first verifier run in a clean workspace; use the concise fallback */
  }
  writeFileSync(
    ".orchestration/import-summary.md",
    `${base}\n\n${t9Lines.join("\n")}\n`,
  );
}

function requireReadyRecords(
  result: RecordsDataResult<RecordsPageData>,
): RecordsPageData {
  requireCondition(
    result.status === "ready",
    "records page returned not_found",
  );
  if (result.status !== "ready") {
    throw new Error("records page returned not_found");
  }
  return result.data;
}

function highestWeeklyRecord(
  data: RecordsPageData,
): CurrentRecordBookEntry | undefined {
  return data.currentRecords.find(
    (record) => record.recordType === "highest_single_week_score",
  );
}

loadEnvLocal(process.env);

async function main(): Promise<void> {
  const { parseEnv } = await import("../src/core/env/schema");
  const { createDb } = await import("../src/db/client");
  const { withLeagueContext } = await import("../src/db/rls");
  const { migrateSerialized } = await import("../src/db/test-support");
  const {
    identityMappings,
    leagues,
    persons,
    teamSeasons,
    users,
    weeklyStatistics,
  } = await import("../src/db/schema");
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
  const {
    applyCuratedDataEdit,
    composeCanonicalSnapshot,
    createCurationCheckpoint,
    pushAllCurationSeasons,
    pushCurationSeason,
  } = await import("../src/stats");
  const { recomputeLeagueStatistics } = await import("../src/stats/engine");
  const { getLeagueRecordsPageData } = await import(
    "../src/app/leagues/[leagueId]/records/records-page-data"
  );

  const env = parseEnv(process.env);
  const providerLeagueId = String(env.espn.testLeagueId ?? 95050);
  const currentSeason = env.espn.testSeason ?? 2026;
  const totalSeasons = 16;
  const historySeasons = expectedHistorySeasons(currentSeason, totalSeasons);
  const swid = env.espn.swid;
  const espnS2 = env.espn.s2;

  if (!swid || !espnS2) {
    throw new Error(
      "ESPN_SWID and ESPN_S2 must be set in .env.local for real-league verification",
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
    name: `ESPN League ${providerLeagueId}`,
    provider: "espn" as const,
    providerId: providerLeagueId,
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
          eq(leagues.providerLeagueId, providerLeagueId),
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
    const leagueId = current.value.league.id;
    const [leagueRow] = await handle.db
      .select({ name: leagues.name })
      .from(leagues)
      .where(eq(leagues.id, leagueId))
      .limit(1);
    const leagueName = leagueRow?.name ?? `ESPN ${providerLeagueId}`;
    const summary = await loadImportSummaryData(handle.db, leagueId);
    const integrityFailures = summary.integrityChecks.filter(
      (check) => check.status !== "pass",
    );
    requireCondition(
      integrityFailures.length === 0,
      "real-league import has integrity failures before T9 verification",
    );

    const [actor] = await handle.db
      .insert(users)
      .values({
        displayName: "T9 Records Snapshot Verifier",
        email: `t9-records-snapshot-${Date.now()}@example.com`,
      })
      .returning({ id: users.id });
    requireCondition(Boolean(actor), "verification actor was not created");
    if (!actor) {
      throw new Error("verification actor disappeared");
    }

    const noPushPage = requireReadyRecords(
      await getLeagueRecordsPageData(handle.db, { leagueId }),
    );
    requireCondition(
      noPushPage.currentRecords.length === 0 &&
        noPushPage.catalog.allTimeStandings.length === 0 &&
        noPushPage.managers.length === 0,
      "record book showed live/materialized records before any pushed snapshot",
    );

    const baseline = await createCurationCheckpoint(handle.db, {
      actorUserId: actor.id,
      label: "T9 baseline",
      leagueId,
      note: "baseline before T9 pushed-record verification",
    });
    await pushAllCurationSeasons(handle.db, {
      actorUserId: actor.id,
      checkpointId: baseline.id,
      leagueId,
      reason: "T9 baseline push all",
    });

    const baselineSnapshot = await composeCanonicalSnapshot(handle.db, {
      leagueId,
    });
    requireCondition(
      baselineSnapshot.seasons.length === totalSeasons,
      "baseline push did not account for every imported season",
    );
    requireCondition(
      baselineSnapshot.seasons.includes(2012),
      "baseline push did not include 2012",
    );

    const baselinePage = requireReadyRecords(
      await getLeagueRecordsPageData(handle.db, { leagueId }),
    );
    const baselineHigh = highestWeeklyRecord(baselinePage);
    requireCondition(Boolean(baselineHigh), "baseline highest score missing");
    if (!baselineHigh) {
      throw new Error("baseline high record disappeared");
    }

    const target = await withLeagueContext(handle.db, leagueId, async (tx) => {
      const rows = await tx
        .select({
          matchupId: weeklyStatistics.matchupId,
          matchupKind: weeklyStatistics.matchupKind,
          personId: weeklyStatistics.personId,
          pointsFor: weeklyStatistics.pointsFor,
          result: weeklyStatistics.result,
          scoringPeriod: weeklyStatistics.scoringPeriod,
          scoringPeriodSpan: weeklyStatistics.scoringPeriodSpan,
          season: weeklyStatistics.season,
          weeklyStatId: weeklyStatistics.id,
        })
        .from(weeklyStatistics)
        .where(
          and(
            eq(weeklyStatistics.leagueId, leagueId),
            eq(weeklyStatistics.season, 2012),
            eq(weeklyStatistics.scoringPeriodSpan, 1),
          ),
        )
        .orderBy(desc(weeklyStatistics.pointsFor), asc(weeklyStatistics.id));
      return rows.find((row) => row.result !== "bye") ?? rows[0];
    });
    requireCondition(Boolean(target), "no editable 2012 weekly stat found");
    if (!target) {
      throw new Error("editable target disappeared");
    }

    const editedScore = Math.ceil(baselineHigh.value + 50);
    await applyCuratedDataEdit(handle.db, {
      actorUserId: actor.id,
      editClass: "substantive",
      field: "points_for",
      leagueId,
      reason: "T9 saved-not-pushed record-boundary verification",
      targetId: target.weeklyStatId,
      targetKind: "weekly_stat",
      value: editedScore,
    });
    const editedCheckpoint = await createCurationCheckpoint(handle.db, {
      actorUserId: actor.id,
      label: "T9 edited 2012 score",
      leagueId,
      note: "2012 score edit saved but not pushed yet",
    });

    const savedNotPushedPage = requireReadyRecords(
      await getLeagueRecordsPageData(handle.db, {
        leagueId,
      }),
    );
    const savedNotPushedHigh = highestWeeklyRecord(savedNotPushedPage);
    requireCondition(
      Boolean(savedNotPushedHigh) &&
        sameNumber(savedNotPushedHigh?.value ?? Number.NaN, baselineHigh.value),
      "saved 2012 score edit appeared in the record book before push",
    );

    await pushCurationSeason(handle.db, {
      actorUserId: actor.id,
      checkpointId: editedCheckpoint.id,
      leagueId,
      reason: "T9 push 2012 only",
      season: 2012,
    });

    const afterPushSnapshot = await composeCanonicalSnapshot(handle.db, {
      leagueId,
    });
    const afterPushPage = requireReadyRecords(
      await getLeagueRecordsPageData(handle.db, {
        leagueId,
      }),
    );
    const afterPushHigh = highestWeeklyRecord(afterPushPage);
    requireCondition(
      Boolean(afterPushHigh) &&
        sameNumber(afterPushHigh?.value ?? Number.NaN, editedScore),
      "pushed 2012 score edit did not become the record-book high score",
    );
    requireCondition(
      numberList(afterPushSnapshot.seasons) ===
        numberList(baselineSnapshot.seasons),
      "pushing 2012 dropped or added a season in canonical composition",
    );
    requireCondition(
      numberList(afterPushPage.lens.seasonSet) ===
        numberList(baselinePage.lens.seasonSet),
      "record-book lens lost a pushed season after the 2012 push",
    );

    const targetDisplay = await withLeagueContext(
      handle.db,
      leagueId,
      async (tx) => {
        const [person] = await tx
          .select({ canonicalName: persons.canonicalName })
          .from(persons)
          .where(
            and(
              eq(persons.leagueId, leagueId),
              eq(persons.id, target.personId),
            ),
          )
          .limit(1);
        const [latestTeam] = await tx
          .select({
            season: teamSeasons.season,
            teamName: teamSeasons.teamName,
          })
          .from(identityMappings)
          .innerJoin(
            teamSeasons,
            eq(teamSeasons.id, identityMappings.teamSeasonId),
          )
          .where(
            and(
              eq(identityMappings.leagueId, leagueId),
              eq(identityMappings.personId, target.personId),
            ),
          )
          .orderBy(desc(identityMappings.season), asc(teamSeasons.id))
          .limit(1);
        return {
          canonicalName: person?.canonicalName ?? null,
          latestTeamName: latestTeam?.teamName ?? null,
        };
      },
    );
    requireCondition(
      Boolean(targetDisplay.canonicalName && targetDisplay.latestTeamName),
      "target person display source was not found",
    );
    const expectedDisplayName = `${targetDisplay.latestTeamName} (${targetDisplay.canonicalName})`;
    const displayedManagers = afterPushPage.managers.filter(
      (manager) => manager.id === target.personId,
    );
    requireCondition(
      displayedManagers.length === 1 &&
        displayedManagers[0]?.name === expectedDisplayName,
      "record-book display rule did not collapse to latest team name plus real name",
    );

    const checks = [
      {
        label: "nothing pushed shows empty record-book data",
        pass:
          noPushPage.currentRecords.length === 0 &&
          noPushPage.managers.length === 0,
      },
      {
        label: "baseline push composed every imported season",
        pass: baselineSnapshot.seasons.length === totalSeasons,
      },
      {
        label: "saved 2012 score edit stayed invisible before push",
        pass:
          Boolean(savedNotPushedHigh) &&
          sameNumber(
            savedNotPushedHigh?.value ?? Number.NaN,
            baselineHigh.value,
          ),
      },
      {
        label: "pushed 2012 score edit became the record-book high score",
        pass:
          Boolean(afterPushHigh) &&
          sameNumber(afterPushHigh?.value ?? Number.NaN, editedScore),
      },
      {
        label: "pushing 2012 preserved every other pushed season",
        pass:
          numberList(afterPushSnapshot.seasons) ===
          numberList(baselineSnapshot.seasons),
      },
      {
        label: "display rule collapsed to latest team name plus real name",
        pass:
          displayedManagers.length === 1 &&
          displayedManagers[0]?.name === expectedDisplayName,
      },
    ];
    const failed = checks.filter((check) => !check.pass);

    const fallbackSummaryLines = [
      "# Real League Import Summary",
      "",
      `- League: ESPN ${providerLeagueId}`,
      `- Current season synced: ${currentSeason}`,
      `- Historical seasons requested in one import: ${historySeasons.join(", ")}`,
      `- Settings rows: ${summary.seasonSettings.length}`,
      `- Integrity failures: ${integrityFailures.length}`,
      `- Stats weekly rows: ${stats.weeklyStatistics}`,
      `- Stats season rows: ${stats.seasonStatistics}`,
      `- Stats records written/updated: ${stats.records}`,
    ];
    const t9Lines = [
      "## T9 Vertical Slice",
      "",
      `- League row: ${leagueName} (${leagueId})`,
      `- Baseline pushed seasons: ${numberList(baselineSnapshot.seasons)}`,
      `- 2012 edit target: week ${target.scoringPeriod}, ${target.pointsFor} -> ${editedScore}`,
      `- Before push highest weekly score: ${baselineHigh.value} (${baselineHigh.season} week ${baselineHigh.scoringPeriod})`,
      `- Saved-not-pushed highest weekly score: ${savedNotPushedHigh?.value ?? "(missing)"}`,
      `- After 2012 push highest weekly score: ${afterPushHigh?.value ?? "(missing)"} (${afterPushHigh?.season ?? "?"} week ${afterPushHigh?.scoringPeriod ?? "?"})`,
      `- Display sample: ${expectedDisplayName}`,
      `- Data-defined era options on pushed snapshot: ${afterPushPage.lens.groupings.length}`,
      "",
      "## T9 Checks",
      "",
      ...checks.map((check) => `- ${passFail(check.pass)} - ${check.label}`),
    ];

    writeImportSummary(fallbackSummaryLines, t9Lines);

    console.log(
      [
        "T9 records pushed-snapshot verification PASS",
        `league=${leagueName}`,
        `baseline_seasons=${baselineSnapshot.seasons.length}`,
        `edited_2012_score=${editedScore}`,
        `saved_not_pushed_high=${savedNotPushedHigh?.value ?? "(missing)"}`,
        `after_push_high=${afterPushHigh?.value ?? "(missing)"}`,
        `display=${expectedDisplayName}`,
        "summary=.orchestration/import-summary.md",
      ].join("\n"),
    );

    if (failed.length > 0) {
      throw new Error(
        `T9 verification failed: ${failed
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
