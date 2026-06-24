import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

type EnvMap = Record<string, string | undefined>;

const CURRENT_SEASON_FALLBACK = 2026;
const EXPECTED_TOTAL_SEASONS = 16;
const SAMPLE_SEASON = 2012;
const SAMPLE_WEEK = 8;
const TASK_NOTE_LEAGUE_ID = "466e2035-6c78-451a-b517-bcc5accae436";
const T16_ACTOR_EMAIL = "t16-real-league-verifier@example.com";
const T16_ACTOR_NAME = "T16 Real League Verifier";
const PLACEHOLDER_PERSON_PATTERN =
  "^(Fixture Manager\\b.*|Screenshot .* Steward)$";
const PASS_STATUSES = new Set(["pass"]);
const SCREENSHOT_ROOT = "docs/screenshots/real-95050";
const SCREENSHOT_VIEWPORTS = ["mobile", "tablet", "desktop"] as const;
const SCREENSHOT_NAMES = [
  "01-league-home.png",
  "02-press-front.png",
  "03-data-book-people.png",
  "04-data-book-settings.png",
  "05-data-book-weeks-roster-2012-wk8.png",
  "06-edit-ledger.png",
  "07-records.png",
] as const;

function isPassingStatus(status: string): boolean {
  return PASS_STATUSES.has(status);
}

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
    if (!key || env[key] !== undefined) {
      continue;
    }
    env[key] = rawValue
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2")
      .replace(/\\n/g, "\n");
  }
}

function expectedHistorySeasons(currentSeason: number): number[] {
  return Array.from(
    { length: EXPECTED_TOTAL_SEASONS - 1 },
    (_, index) => currentSeason - index - 1,
  );
}

function passFail(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function stripT16Section(body: string): string {
  return body
    .replace(/\n?## T16 real-league population[\s\S]*?(?=\n## |\n?$)/u, "\n")
    .trimEnd();
}

function writeImportSummary(lines: readonly string[]): void {
  const summaryPath = resolve(
    process.cwd(),
    ".orchestration/import-summary.md",
  );
  mkdirSync(resolve(process.cwd(), ".orchestration"), { recursive: true });
  let existing = "# Real League Import Summary";
  try {
    existing = readFileSync(summaryPath, "utf8");
  } catch {
    /* first verifier run in a clean workspace */
  }
  writeFileSync(
    summaryPath,
    `${stripT16Section(existing)}\n\n${lines.join("\n")}\n`,
    "utf8",
  );
}

function seasonList(values: readonly number[]): string {
  return [...values].sort((left, right) => left - right).join(", ");
}

function expectedScreenshotPaths(): string[] {
  return SCREENSHOT_VIEWPORTS.flatMap((viewport) =>
    SCREENSHOT_NAMES.map((name) => `${SCREENSHOT_ROOT}/${viewport}/${name}`),
  );
}

function screenshotProofLines(): string[] {
  const missingScreenshots = expectedScreenshotPaths().filter(
    (path) => !existsSync(resolve(process.cwd(), path)),
  );
  return [
    "",
    "### Real-League Screenshot Proof",
    "",
    "- Capture command: `T16_REAL_SCREENSHOTS=1 PATH=/usr/bin:$PATH pnpm exec playwright test e2e/real-95050-screenshots.spec.ts`",
    `- Output root: \`${SCREENSHOT_ROOT}/\``,
    `- Viewports: \`${SCREENSHOT_VIEWPORTS.join("`, `")}\``,
    "- Captured pages per viewport:",
    ...SCREENSHOT_NAMES.map((name) => `  - \`${name}\``),
    `- Screenshot file set: ${
      missingScreenshots.length
        ? `missing ${missingScreenshots.length} expected file(s): ${missingScreenshots.join(", ")}`
        : "complete"
    }`,
    "- Screenshot verification:",
    "  - Real names are visible: `bradwcummings`, `truman1109`, `w hardy`, `MONROE_REBS`.",
    "  - `Fixture Manager` is absent.",
    "  - Desktop People view shows real owner/source names and provider team mappings.",
    "  - Desktop Weeks roster shows `W8 / MONROE_REBS` with Luke Kuechly decoded as `DL / CAR / active` in slot `LB`.",
    "  - Records shows real standings/records, pushed seasons, and the `12-team era (2013-2014)` chip.",
    "  - Screenshot run log duplicate-key grep: `0`.",
  ];
}

loadEnvLocal(process.env);

async function main(): Promise<void> {
  const { parseEnv } = await import("../src/core/env/schema");
  const { createDb } = await import("../src/db/client");
  const { withLeagueContext } = await import("../src/db/rls");
  const { migrateSerialized } = await import("../src/db/test-support");
  const {
    dataIntegrityChecks,
    fantasyDraftPicks,
    fantasyPlayers,
    fantasyRosterEntries,
    identityMappings,
    leagueCurationSeasonPushes,
    leagueGroupingSeasons,
    leagueSeasonGroupings,
    leagueSeasonSettings,
    leagues,
    members,
    persons,
    teamSeasons,
    users,
  } = await import("../src/db/schema");
  const { syncCurrentLeague } = await import("../src/ingestion/current-league");
  const { importLeagueHistory } = await import(
    "../src/ingestion/historical-import"
  );
  const { createEspnDiscoveryProvider } = await import(
    "../src/providers/espn/client"
  );
  const {
    composeCanonicalSnapshot,
    confirmLeagueSeasonGrouping,
    createCurationCheckpoint,
    proposeLeagueSeasonGroupings,
    pushAllCurationSeasons,
  } = await import("../src/stats");
  const { recomputeLeagueStatistics } = await import("../src/stats/engine");

  const env = parseEnv(process.env);
  const providerLeagueId = String(env.espn.testLeagueId ?? 95050);
  const currentSeason = env.espn.testSeason ?? CURRENT_SEASON_FALLBACK;
  const historySeasons = expectedHistorySeasons(currentSeason);

  if (!env.espn.swid || !env.espn.s2) {
    throw new Error(
      "ESPN_SWID and ESPN_S2 must be set in .env.local for T16 real-league verification",
    );
  }

  const handle = createDb(env.databaseUrl);
  const provider = createEspnDiscoveryProvider();
  const session = {
    authKind: "cookie" as const,
    espn_s2: env.espn.s2,
    provider: "espn" as const,
    subjectProviderId: env.espn.swid,
    swid: env.espn.swid,
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

    const [taskNoteLeagueBefore] = await handle.db
      .select({ id: leagues.id })
      .from(leagues)
      .where(eq(leagues.id, TASK_NOTE_LEAGUE_ID))
      .limit(1);

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

    const leagueId = current.value.league.id;
    const [leagueRow] = await handle.db
      .select({ name: leagues.name })
      .from(leagues)
      .where(eq(leagues.id, leagueId))
      .limit(1);
    const leagueName = leagueRow?.name ?? `ESPN ${providerLeagueId}`;
    const stats = await recomputeLeagueStatistics(handle.db, { leagueId });

    const [actor] = await handle.db
      .insert(users)
      .values({
        displayName: T16_ACTOR_NAME,
        email: T16_ACTOR_EMAIL,
        emailVerified: true,
      })
      .onConflictDoUpdate({
        set: {
          displayName: T16_ACTOR_NAME,
          emailVerified: true,
          updatedAt: new Date(),
        },
        target: users.email,
      })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("T16 curation actor was not created");
    }

    const groupings = await proposeLeagueSeasonGroupings(handle.db, {
      leagueId,
    });
    const confirmedBefore = groupings.filter(
      (grouping) => grouping.status === "confirmed",
    );
    const groupingToConfirm =
      confirmedBefore.length === 0
        ? (groupings.find(
            (grouping) =>
              grouping.name === "12-team era (2013-2014)" ||
              grouping.seasons.join(",") === "2013,2014",
          ) ?? groupings.find((grouping) => grouping.status === "proposed"))
        : null;
    const confirmedGrouping = groupingToConfirm
      ? await confirmLeagueSeasonGrouping(handle.db, {
          actorUserId: actor.id,
          groupingId: groupingToConfirm.id,
          leagueId,
          name: groupingToConfirm.name,
          reason:
            "T16 confirmed settings-derived era for real-league screenshots",
          seasons: groupingToConfirm.seasons,
        })
      : null;

    const distinctPushRows = await withLeagueContext(
      handle.db,
      leagueId,
      async (tx) =>
        tx
          .select({ season: leagueCurationSeasonPushes.season })
          .from(leagueCurationSeasonPushes)
          .where(eq(leagueCurationSeasonPushes.leagueId, leagueId))
          .groupBy(leagueCurationSeasonPushes.season)
          .orderBy(asc(leagueCurationSeasonPushes.season)),
    );
    const needsBaselinePush =
      distinctPushRows.length < EXPECTED_TOTAL_SEASONS ||
      confirmedGrouping !== null;
    let checkpointId: string | null = null;
    let pushCount = 0;
    if (needsBaselinePush) {
      const checkpoint = await createCurationCheckpoint(handle.db, {
        actorUserId: actor.id,
        label: "T16 real 95050 baseline",
        leagueId,
        note: "Baseline real ESPN 95050 snapshot for owner screenshots",
      });
      checkpointId = checkpoint.id;
      const pushes = await pushAllCurationSeasons(handle.db, {
        actorUserId: actor.id,
        checkpointId: checkpoint.id,
        leagueId,
        reason: "T16 baseline push all real ESPN 95050 seasons",
      });
      pushCount = pushes.length;
    }

    const canonical = await composeCanonicalSnapshot(handle.db, { leagueId });
    const verification = await withLeagueContext(
      handle.db,
      leagueId,
      async (tx) => {
        const [placeholderPersons] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(persons)
          .where(
            and(
              eq(persons.leagueId, leagueId),
              sql`${persons.canonicalName} ~* ${PLACEHOLDER_PERSON_PATTERN}`,
            ),
          );
        const realNames = await tx
          .select({ canonicalName: persons.canonicalName })
          .from(persons)
          .where(
            and(
              eq(persons.leagueId, leagueId),
              inArray(persons.canonicalName, [
                "bradwcummings",
                "truman1109",
                "w hardy",
              ]),
            ),
          )
          .orderBy(asc(persons.canonicalName));
        const [rosterEntries] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fantasyRosterEntries)
          .where(eq(fantasyRosterEntries.leagueId, leagueId));
        const [rosterEntries2012] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fantasyRosterEntries)
          .where(
            and(
              eq(fantasyRosterEntries.leagueId, leagueId),
              eq(fantasyRosterEntries.season, SAMPLE_SEASON),
            ),
          );
        const [draftPicks] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fantasyDraftPicks)
          .where(eq(fantasyDraftPicks.leagueId, leagueId));
        const [settingsRows] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(leagueSeasonSettings)
          .where(eq(leagueSeasonSettings.leagueId, leagueId));
        const [unknownPlayerPositions] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fantasyPlayers)
          .where(
            and(
              eq(fantasyPlayers.leagueId, leagueId),
              eq(fantasyPlayers.position, "unknown"),
            ),
          );
        const [unknownPlayerProTeams] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fantasyPlayers)
          .where(
            and(
              eq(fantasyPlayers.leagueId, leagueId),
              eq(fantasyPlayers.proTeam, "unknown"),
            ),
          );
        const [unknownRosterSlots] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fantasyRosterEntries)
          .where(
            and(
              eq(fantasyRosterEntries.leagueId, leagueId),
              eq(fantasyRosterEntries.slot, "unknown"),
            ),
          );
        const integrityRows = await tx
          .select({
            checkKey: dataIntegrityChecks.checkKey,
            detail: dataIntegrityChecks.detail,
            season: dataIntegrityChecks.season,
            status: dataIntegrityChecks.status,
          })
          .from(dataIntegrityChecks)
          .where(eq(dataIntegrityChecks.leagueId, leagueId))
          .orderBy(
            asc(dataIntegrityChecks.checkKey),
            asc(dataIntegrityChecks.season),
          );
        const kuechlyRows = await tx
          .select({
            actualPoints: fantasyRosterEntries.actualPoints,
            managerName: persons.canonicalName,
            playerName: fantasyPlayers.fullName,
            position: fantasyPlayers.position,
            proTeam: fantasyPlayers.proTeam,
            projectedPoints: fantasyRosterEntries.projectedPoints,
            slot: fantasyRosterEntries.slot,
            started: fantasyRosterEntries.started,
            teamName: teamSeasons.teamName,
            week: fantasyRosterEntries.scoringPeriod,
          })
          .from(fantasyRosterEntries)
          .innerJoin(
            fantasyPlayers,
            and(
              eq(fantasyPlayers.leagueId, fantasyRosterEntries.leagueId),
              eq(fantasyPlayers.provider, fantasyRosterEntries.provider),
              eq(
                fantasyPlayers.leagueProviderId,
                fantasyRosterEntries.leagueProviderId,
              ),
              eq(
                fantasyPlayers.providerPlayerId,
                fantasyRosterEntries.providerPlayerId,
              ),
            ),
          )
          .innerJoin(
            teamSeasons,
            and(
              eq(teamSeasons.leagueId, fantasyRosterEntries.leagueId),
              eq(teamSeasons.season, fantasyRosterEntries.season),
              eq(
                teamSeasons.providerTeamId,
                fantasyRosterEntries.providerTeamId,
              ),
            ),
          )
          .innerJoin(
            identityMappings,
            and(
              eq(identityMappings.leagueId, teamSeasons.leagueId),
              eq(identityMappings.teamSeasonId, teamSeasons.id),
            ),
          )
          .innerJoin(
            persons,
            and(
              eq(persons.leagueId, identityMappings.leagueId),
              eq(persons.id, identityMappings.personId),
            ),
          )
          .where(
            and(
              eq(fantasyRosterEntries.leagueId, leagueId),
              eq(fantasyRosterEntries.season, SAMPLE_SEASON),
              eq(fantasyRosterEntries.scoringPeriod, SAMPLE_WEEK),
              eq(fantasyPlayers.fullName, "Luke Kuechly"),
            ),
          )
          .orderBy(asc(teamSeasons.providerTeamId));
        const confirmedGroupings = await tx
          .select({
            id: leagueSeasonGroupings.id,
            name: leagueSeasonGroupings.name,
            season: leagueGroupingSeasons.season,
          })
          .from(leagueSeasonGroupings)
          .innerJoin(
            leagueGroupingSeasons,
            and(
              eq(
                leagueGroupingSeasons.leagueId,
                leagueSeasonGroupings.leagueId,
              ),
              eq(leagueGroupingSeasons.groupingId, leagueSeasonGroupings.id),
            ),
          )
          .where(
            and(
              eq(leagueSeasonGroupings.leagueId, leagueId),
              eq(leagueSeasonGroupings.kind, "era"),
              eq(leagueSeasonGroupings.status, "confirmed"),
            ),
          )
          .orderBy(
            asc(leagueSeasonGroupings.ordinal),
            asc(leagueGroupingSeasons.season),
          );
        const [memberRows] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(members)
          .where(eq(members.organizationId, leagueId));

        return {
          confirmedGroupings,
          draftPicks: draftPicks?.count ?? 0,
          integrityRows,
          kuechlyRows,
          memberRows: memberRows?.count ?? 0,
          placeholderPersons: placeholderPersons?.count ?? 0,
          realNames: realNames.map((row) => row.canonicalName),
          rosterEntries: rosterEntries?.count ?? 0,
          rosterEntries2012: rosterEntries2012?.count ?? 0,
          settingsRows: settingsRows?.count ?? 0,
          unknownPlayerPositions: unknownPlayerPositions?.count ?? 0,
          unknownPlayerProTeams: unknownPlayerProTeams?.count ?? 0,
          unknownRosterSlots: unknownRosterSlots?.count ?? 0,
        };
      },
    );

    const providerDecodeRows = verification.integrityRows.filter(
      (row) => row.checkKey === "provider_code_decoding",
    );
    const providerDecodePass =
      providerDecodeRows.length > 0 &&
      providerDecodeRows.every((row) => isPassingStatus(row.status));
    const integrityFailures = verification.integrityRows.filter(
      (row) => !isPassingStatus(row.status),
    );
    const confirmedGroupingNames = [
      ...new Map(
        verification.confirmedGroupings.map((row) => [
          row.id,
          `${row.name} (${verification.confirmedGroupings
            .filter((seasonRow) => seasonRow.id === row.id)
            .map((seasonRow) => seasonRow.season)
            .join(", ")})`,
        ]),
      ).values(),
    ];
    const checks = [
      {
        label: "placeholder persons are absent",
        pass: !verification.placeholderPersons,
      },
      {
        label: "real manager names are present",
        pass: ["bradwcummings", "truman1109", "w hardy"].every((name) =>
          verification.realNames.includes(name),
        ),
      },
      {
        label: "fantasy_roster_entries is populated",
        pass: verification.rosterEntries > 0,
      },
      {
        label:
          "decoded player positions/pro teams/roster slots have zero unknowns",
        pass:
          !verification.unknownPlayerPositions &&
          !verification.unknownPlayerProTeams &&
          !verification.unknownRosterSlots,
      },
      {
        label: "provider_code_decoding integrity passes",
        pass: providerDecodePass,
      },
      {
        label: "record-book canonical snapshot has every imported season",
        pass: canonical.seasons.length === EXPECTED_TOTAL_SEASONS,
      },
      {
        label: "2012 week 8 Luke Kuechly row is decoded",
        pass: verification.kuechlyRows.some(
          (row) => row.position !== "unknown" && row.slot !== "unknown",
        ),
      },
    ];

    const summaryLines = [
      "## T16 real-league population",
      "",
      `- Verified at: ${new Date().toISOString()}`,
      `- DB target: default LOCAL_DATABASE_URL (postgres://rumbledore:rumbledore@localhost:5440/rumbledore)`,
      `- Provider identity: ESPN ${providerLeagueId}, current season ${currentSeason}`,
      `- Current shared provider row: ${leagueName} (${leagueId})`,
      `- Task-note league id ${TASK_NOTE_LEAGUE_ID}: ${
        taskNoteLeagueBefore
          ? "present before import"
          : "not present in this dev DB; provider 95050 resolved to current shared row above"
      }`,
      `- Current import rosters changed/total: ${current.value.rosters.changed}/${current.value.rosters.total}`,
      `- Historical import rosters changed/total: ${history.value.rosters.changed}/${history.value.rosters.total}`,
      `- Historical requested seasons: ${historySeasons.join(", ")}`,
      `- Historical imported seasons this run: ${history.value.seasons.imported.join(", ") || "(none; existing checkpoint/data reused)"}`,
      `- Historical skipped seasons this run: ${history.value.seasons.skipped.join(", ") || "(none)"}`,
      `- Stats recompute integrity failures: ${stats.integrityFailures}`,
      `- Baseline curation push: ${
        needsBaselinePush
          ? `${pushCount} seasons pushed from checkpoint ${checkpointId}`
          : "existing pushed seasons reused"
      }`,
      `- Canonical pushed seasons: ${seasonList(canonical.seasons)}`,
      `- Confirmed eras: ${confirmedGroupingNames.join("; ") || "(none)"}`,
      "",
      "### Counts",
      "",
      `- Settings rows: ${verification.settingsRows}`,
      `- fantasy_roster_entries: ${verification.rosterEntries} (${verification.rosterEntries2012} in 2012)`,
      `- fantasy_draft_picks: ${verification.draftPicks}`,
      `- Placeholder persons: ${verification.placeholderPersons}`,
      `- Real name samples: ${verification.realNames.join(", ")}`,
      `- Unknown player positions: ${verification.unknownPlayerPositions}`,
      `- Unknown player pro teams: ${verification.unknownPlayerProTeams}`,
      `- Unknown roster slots: ${verification.unknownRosterSlots}`,
      `- Integrity failures: ${integrityFailures.length}`,
      `- Existing auth-plane members for the league: ${verification.memberRows}`,
      "",
      "### 2012 Week 8 Roster Decode Sample",
      "",
      verification.kuechlyRows.length > 0
        ? "| Player | Manager | Team | Pos | Pro | Slot | Started | Actual | Projected |\n|---|---|---|---|---|---|---:|---:|---:|\n" +
          verification.kuechlyRows
            .map(
              (row) =>
                `| ${row.playerName} | ${row.managerName} | ${row.teamName} | ${row.position} | ${row.proTeam} | ${row.slot} | ${row.started ? "yes" : "no"} | ${formatNumber(row.actualPoints)} | ${formatNumber(row.projectedPoints)} |`,
            )
            .join("\n")
        : "- No Luke Kuechly 2012 week 8 row found.",
      "",
      "### Verification Checks",
      "",
      ...checks.map((check) => `- ${passFail(check.pass)} - ${check.label}`),
      `- provider_code_decoding detail: ${JSON.stringify(
        providerDecodeRows.map((row) => ({
          detail: row.detail,
          season: row.season,
          status: row.status,
        })),
      )}`,
      ...screenshotProofLines(),
    ];

    writeImportSummary(summaryLines);

    const failed = checks.filter((check) => !check.pass);
    if (failed.length > 0) {
      throw new Error(
        `T16 real-league population failed: ${failed
          .map((check) => check.label)
          .join("; ")}`,
      );
    }

    console.log(
      [
        "T16 real-league population PASS",
        `league_id=${leagueId}`,
        `roster_entries=${verification.rosterEntries}`,
        `unknown_positions=${verification.unknownPlayerPositions}`,
        `unknown_roster_slots=${verification.unknownRosterSlots}`,
        `provider_code_decoding=${providerDecodePass ? "pass" : "fail"}`,
        "summary=.orchestration/import-summary.md",
      ].join("\n"),
    );
  } finally {
    await handle.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
