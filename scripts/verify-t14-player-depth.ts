import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

type EnvMap = Record<string, string | undefined>;

const SAMPLE_SEASON = 2012;
const SAMPLE_WEEK = 8;

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

function passFail(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function stripT14Section(body: string): string {
  return body
    .replace(/\n?## T14 player-depth[\s\S]*?(?=\n## |\n?$)/u, "\n")
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
    `${stripT14Section(existing)}\n\n${lines.join("\n")}\n`,
    "utf8",
  );
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
    fantasyTeams,
    fantasyTransactions,
    leagues,
  } = await import("../src/db/schema");
  const { persistNormalizedLeagueRows, syncCurrentLeague } = await import(
    "../src/ingestion/current-league"
  );
  const { importLeagueHistory } = await import(
    "../src/ingestion/historical-import"
  );
  const { createEspnDiscoveryProvider } = await import(
    "../src/providers/espn/client"
  );
  const { recomputeLeagueStatistics } = await import("../src/stats/engine");

  const env = parseEnv(process.env);
  const providerLeagueId = String(env.espn.testLeagueId ?? 95050);
  const currentSeason = env.espn.testSeason ?? 2026;

  if (!env.espn.swid || !env.espn.s2) {
    throw new Error(
      "ESPN_SWID and ESPN_S2 must be set in .env.local for T14 player-depth verification",
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

  type Counts = {
    draftPicks: number;
    draftPicks2012: number;
    fantasyPlayers: number;
    rosterEntries: number;
    rosterEntries2012: number;
    transactions: number;
    transactions2012: number;
  };

  async function loadCounts(leagueId: string): Promise<Counts> {
    return withLeagueContext(handle.db, leagueId, async (tx) => {
      const [players] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(fantasyPlayers)
        .where(eq(fantasyPlayers.leagueId, leagueId));
      const [rosters] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(fantasyRosterEntries)
        .where(eq(fantasyRosterEntries.leagueId, leagueId));
      const [rosters2012] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(fantasyRosterEntries)
        .where(
          and(
            eq(fantasyRosterEntries.leagueId, leagueId),
            eq(fantasyRosterEntries.season, SAMPLE_SEASON),
          ),
        );
      const [drafts] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(fantasyDraftPicks)
        .where(eq(fantasyDraftPicks.leagueId, leagueId));
      const [drafts2012] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(fantasyDraftPicks)
        .where(
          and(
            eq(fantasyDraftPicks.leagueId, leagueId),
            eq(fantasyDraftPicks.season, SAMPLE_SEASON),
          ),
        );
      const [transactionsCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(fantasyTransactions)
        .where(eq(fantasyTransactions.leagueId, leagueId));
      const [transactions2012Count] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(fantasyTransactions)
        .where(
          and(
            eq(fantasyTransactions.leagueId, leagueId),
            eq(fantasyTransactions.season, SAMPLE_SEASON),
          ),
        );
      return {
        draftPicks: drafts?.count ?? 0,
        draftPicks2012: drafts2012?.count ?? 0,
        fantasyPlayers: players?.count ?? 0,
        rosterEntries: rosters?.count ?? 0,
        rosterEntries2012: rosters2012?.count ?? 0,
        transactions: transactionsCount?.count ?? 0,
        transactions2012: transactions2012Count?.count ?? 0,
      };
    });
  }

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
      seasons: [SAMPLE_SEASON],
      session,
    });
    if (!history.ok) {
      throw history.error;
    }

    const countsAfterImport = await loadCounts(current.value.league.id);
    const replay = await provider.getHistory(session, ref, {
      seasons: [SAMPLE_SEASON],
    });
    if (!replay.ok) {
      throw replay.error;
    }
    for (const bundle of replay.value) {
      await persistNormalizedLeagueRows({
        db: handle.db,
        draftPicks: bundle.draftPicks ?? [],
        finalStandings: bundle.finalStandings,
        league: bundle.league,
        leagueId: current.value.league.id,
        leagueProviderId: bundle.league.providerId,
        matchups: bundle.matchups,
        members: bundle.members,
        players: bundle.players ?? [],
        reconcileSeasons: {
          draftPicks: [bundle.league.season],
          members: [bundle.league.season],
          rosters: [bundle.league.season],
          teams: [bundle.league.season],
          transactions: [bundle.league.season],
        },
        rosters: bundle.rosters ?? [],
        teams: bundle.teams,
        transactions: bundle.transactions,
      });
    }
    const countsAfterReplay = await loadCounts(current.value.league.id);
    const countsStable =
      JSON.stringify(countsAfterImport) === JSON.stringify(countsAfterReplay);

    const stats = await recomputeLeagueStatistics(handle.db, {
      leagueId: current.value.league.id,
    });

    const sample = await withLeagueContext(
      handle.db,
      current.value.league.id,
      async (tx) => {
        const weekRosters = await tx
          .select()
          .from(fantasyRosterEntries)
          .where(
            and(
              eq(fantasyRosterEntries.leagueId, current.value.league.id),
              eq(fantasyRosterEntries.season, SAMPLE_SEASON),
              eq(fantasyRosterEntries.scoringPeriod, SAMPLE_WEEK),
            ),
          )
          .orderBy(
            asc(fantasyRosterEntries.providerTeamId),
            desc(fantasyRosterEntries.started),
            asc(fantasyRosterEntries.slot),
            asc(fantasyRosterEntries.providerPlayerId),
          );
        const sampleTeamId = weekRosters[0]?.providerTeamId ?? null;
        const rosterRows = sampleTeamId
          ? weekRosters.filter((row) => row.providerTeamId === sampleTeamId)
          : [];
        const playerIds = [
          ...new Set(rosterRows.map((row) => row.providerPlayerId)),
        ];
        const playerRows =
          playerIds.length > 0
            ? await tx
                .select()
                .from(fantasyPlayers)
                .where(
                  and(
                    eq(fantasyPlayers.leagueId, current.value.league.id),
                    inArray(fantasyPlayers.providerPlayerId, playerIds),
                  ),
                )
            : [];
        const playerById = new Map(
          playerRows.map((player) => [player.providerPlayerId, player]),
        );
        const [team] = sampleTeamId
          ? await tx
              .select()
              .from(fantasyTeams)
              .where(
                and(
                  eq(fantasyTeams.leagueId, current.value.league.id),
                  eq(fantasyTeams.season, SAMPLE_SEASON),
                  eq(fantasyTeams.providerTeamId, sampleTeamId),
                ),
              )
              .limit(1)
          : [undefined];
        const draftRows = await tx
          .select()
          .from(fantasyDraftPicks)
          .where(
            and(
              eq(fantasyDraftPicks.leagueId, current.value.league.id),
              eq(fantasyDraftPicks.season, SAMPLE_SEASON),
            ),
          )
          .orderBy(asc(fantasyDraftPicks.pickOverall))
          .limit(5);
        const draftPlayerIds = [
          ...new Set(
            draftRows
              .map((row) => row.providerPlayerId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const draftPlayers =
          draftPlayerIds.length > 0
            ? await tx
                .select()
                .from(fantasyPlayers)
                .where(
                  and(
                    eq(fantasyPlayers.leagueId, current.value.league.id),
                    inArray(fantasyPlayers.providerPlayerId, draftPlayerIds),
                  ),
                )
            : [];
        const draftPlayerById = new Map(
          draftPlayers.map((player) => [player.providerPlayerId, player]),
        );
        const transactionRows = await tx
          .select()
          .from(fantasyTransactions)
          .where(eq(fantasyTransactions.leagueId, current.value.league.id))
          .orderBy(asc(fantasyTransactions.occurredAt))
          .limit(5);
        const integrityRows = await tx
          .select()
          .from(dataIntegrityChecks)
          .where(eq(dataIntegrityChecks.leagueId, current.value.league.id))
          .orderBy(
            asc(dataIntegrityChecks.checkKey),
            asc(dataIntegrityChecks.season),
          );

        return {
          draftRows: draftRows.map((row) => ({
            overall: row.pickOverall,
            player:
              draftPlayerById.get(row.providerPlayerId ?? "")?.fullName ??
              row.providerPlayerId ??
              "(unknown player)",
            position:
              draftPlayerById.get(row.providerPlayerId ?? "")?.position ??
              "unknown",
            providerTeamId: row.providerTeamId,
            round: row.round,
          })),
          integrityRows,
          rosterRows: rosterRows.map((row) => {
            const player = playerById.get(row.providerPlayerId);
            return {
              actualPoints: row.actualPoints ?? row.points,
              player: player?.fullName ?? row.providerPlayerId,
              position: player?.position ?? "unknown",
              proTeam: player?.proTeam ?? "",
              projectedPoints: row.projectedPoints,
              slot: row.slot,
              started: row.started,
            };
          }),
          teamName: team?.name ?? sampleTeamId ?? "(no sample team)",
          transactionRows: transactionRows.map((row) => ({
            occurredAt: row.occurredAt.toISOString(),
            players: row.playerProviderIds.join(", "),
            scoringPeriod: row.scoringPeriod,
            teams: row.teamProviderIds.join(", "),
            type: row.type,
          })),
        };
      },
    );

    const rosterIntegrityFailures = sample.integrityRows.filter(
      (row) =>
        (row.checkKey === "roster_coverage" ||
          row.checkKey === "player_points_rollup") &&
        row.status !== "pass",
    );
    const allIntegrityFailures = sample.integrityRows.filter(
      (row) => row.status !== "pass",
    );
    const checks = [
      {
        label: `${SAMPLE_SEASON} roster entries imported`,
        pass: countsAfterReplay.rosterEntries2012 > 0,
      },
      {
        label: `${SAMPLE_SEASON} draft picks imported`,
        pass: countsAfterReplay.draftPicks2012 > 0,
      },
      {
        label: `${SAMPLE_SEASON} week ${SAMPLE_WEEK} roster sample loaded`,
        pass: sample.rosterRows.length > 0,
      },
      {
        label: "idempotent real-season replay kept counts stable",
        pass: countsStable,
      },
      {
        label: "T14 roster integrity checks pass",
        pass: rosterIntegrityFailures.length === 0,
      },
    ];

    const transactionNote =
      countsAfterReplay.transactions > 0
        ? `${countsAfterReplay.transactions} imported`
        : "0 imported; ESPN returned no transactions for this league through mTransactions2 with the transaction filter";
    const transactionExposureLine =
      countsAfterReplay.transactions > 0
        ? "- PASS - real ESPN transaction rows exposed for this league"
        : "- WARN - ESPN returned no real transaction rows for this league; parser and persistence tests cover mTransactions2 rows";
    const section = [
      "## T14 player-depth",
      "",
      `- Real provider identity: ESPN ${providerLeagueId}, current season ${currentSeason}; sample season ${SAMPLE_SEASON}, week ${SAMPLE_WEEK}.`,
      `- League id: ${current.value.league.id}`,
      `- Current import rosters changed/total: ${current.value.rosters.changed}/${current.value.rosters.total}`,
      `- Historical import rosters changed/total: ${history.value.rosters.changed}/${history.value.rosters.total}`,
      `- Historical import draft picks changed/total: ${history.value.draftPicks.changed}/${history.value.draftPicks.total}`,
      `- Historical import transactions changed/total: ${history.value.transactions.changed}/${history.value.transactions.total}`,
      "",
      "### Counts",
      "",
      `- fantasy_players: ${countsAfterReplay.fantasyPlayers}`,
      `- fantasy_roster_entries: ${countsAfterReplay.rosterEntries} (${countsAfterReplay.rosterEntries2012} in ${SAMPLE_SEASON})`,
      `- fantasy_draft_picks: ${countsAfterReplay.draftPicks} (${countsAfterReplay.draftPicks2012} in ${SAMPLE_SEASON})`,
      `- fantasy_transactions: ${transactionNote}`,
      `- Counts after first import: ${JSON.stringify(countsAfterImport)}`,
      `- Counts after replay: ${JSON.stringify(countsAfterReplay)}`,
      "",
      "### Verification Checks",
      "",
      ...checks.map((check) => `- ${passFail(check.pass)} - ${check.label}`),
      transactionExposureLine,
      "",
      "### Week 8 Roster Sample",
      "",
      `- Team: ${sample.teamName}`,
      "",
      "| Player | Pos | Pro | Slot | Started | Actual | Projected |",
      "|---|---|---|---|---:|---:|---:|",
      ...sample.rosterRows.map(
        (row) =>
          `| ${[
            row.player,
            row.position,
            row.proTeam,
            row.slot,
            row.started ? "yes" : "no",
            formatNumber(row.actualPoints),
            formatNumber(row.projectedPoints),
          ].join(" | ")} |`,
      ),
      "",
      "### Draft Sample",
      "",
      "| Overall | Round | Team | Player | Pos |",
      "|---:|---:|---|---|---|",
      ...sample.draftRows.map(
        (row) =>
          `| ${[
            row.overall ?? "",
            row.round,
            row.providerTeamId,
            row.player,
            row.position,
          ].join(" | ")} |`,
      ),
      "",
      "### Transaction Sample",
      "",
      ...(sample.transactionRows.length > 0
        ? [
            "| Time | Type | Week | Teams | Players |",
            "|---|---|---:|---|---|",
            ...sample.transactionRows.map(
              (row) =>
                `| ${[
                  row.occurredAt,
                  row.type,
                  row.scoringPeriod ?? "",
                  row.teams,
                  row.players,
                ].join(" | ")} |`,
            ),
          ]
        : [
            "- ESPN returned no transaction rows for the verified league. Parser and persistence coverage use representative mTransactions2 payloads; follow-on UI can consume rows when ESPN exposes them.",
          ]),
      "",
      "### Integrity",
      "",
      `- Stats weekly rows: ${stats.weeklyStatistics}`,
      `- Stats season rows: ${stats.seasonStatistics}`,
      `- Integrity checks written: ${stats.integrityChecks}`,
      `- Total integrity failures: ${allIntegrityFailures.length}`,
      `- T14 roster/player integrity failures: ${rosterIntegrityFailures.length}`,
      ...(allIntegrityFailures.length === 0
        ? ["- All integrity checks PASS."]
        : allIntegrityFailures.map(
            (row) =>
              `- ${row.status.toUpperCase()} - ${row.checkKey} season ${
                row.season ?? "all"
              }: ${JSON.stringify(row.detail)}`,
          )),
      "",
    ];

    writeImportSummary(section);

    const failed = checks.filter((check) => !check.pass);
    console.log(
      `Verified T14 player depth for ESPN ${providerLeagueId}; summary=.orchestration/import-summary.md`,
    );
    if (failed.length > 0) {
      throw new Error(
        `T14 player-depth verification failed: ${failed
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
