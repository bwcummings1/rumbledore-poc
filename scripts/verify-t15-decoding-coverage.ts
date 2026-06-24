import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, asc, eq } from "drizzle-orm";

type EnvMap = Record<string, string | undefined>;

const TOTAL_SEASONS = 16;
const IDP_SAMPLE_SEASONS = [2011, 2012] as const;
const IDP_LABELS = new Set(["CB", "DB", "DE", "DL", "DP", "DT", "LB", "S"]);

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
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (!key || env[key] !== undefined) {
      continue;
    }
    env[key] = rawValue
      .trim()
      .replace(/^(['"])(.*)\1$/u, "$2")
      .replace(/\\n/gu, "\n");
  }
}

function expectedHistorySeasons(currentSeason: number): number[] {
  return Array.from(
    { length: TOTAL_SEASONS - 1 },
    (_, index) => currentSeason - index - 1,
  );
}

function passFail(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

function stripT15Section(body: string): string {
  return body
    .replace(/\n?## T15 decoding coverage[\s\S]*?(?=\n## |\n?$)/u, "\n")
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
    `${stripT15Section(existing)}\n\n${lines.join("\n")}\n`,
    "utf8",
  );
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberArrayFromUnknown(value: unknown): number[] {
  return Array.isArray(value)
    ? value
        .map(numberFromUnknown)
        .filter((entry): entry is number => entry !== undefined)
    : [];
}

function numericRecordKeys(value: Record<string, unknown> | null): number[] {
  return Object.keys(value ?? {})
    .map(numberFromUnknown)
    .filter((entry): entry is number => entry !== undefined);
}

function scoringStatIdsFromSettings(value: Record<string, unknown>): number[] {
  return Array.isArray(value.scoringItems)
    ? value.scoringItems
        .map((item) => numberFromUnknown(recordFromUnknown(item).statId))
        .filter((entry): entry is number => entry !== undefined)
    : [];
}

function activityIdsFromDetails(value: Record<string, unknown>): number[] {
  const itemIds = Array.isArray(value.items)
    ? value.items
        .map((item) => numberFromUnknown(recordFromUnknown(item).type))
        .filter((entry): entry is number => entry !== undefined)
    : [];
  return [value.rawActivityTypeId, value.rawType, ...itemIds]
    .map(numberFromUnknown)
    .filter((entry): entry is number => entry !== undefined);
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function formatDecodedIds(
  ids: readonly number[],
  decode: (id: number) => string | undefined,
): string {
  return ids.length === 0
    ? "(none observed)"
    : ids.map((id) => `${id}:${decode(id) ?? "UNDECODED"}`).join(", ");
}

loadEnvLocal(process.env);

async function main(): Promise<void> {
  const { parseEnv } = await import("../src/core/env/schema");
  const { createDb } = await import("../src/db/client");
  const { withLeagueContext } = await import("../src/db/rls");
  const { migrateSerialized } = await import("../src/db/test-support");
  const {
    dataIntegrityChecks,
    fantasyPlayers,
    fantasyRosterEntries,
    fantasyTransactions,
    leagueSeasonSettings,
    leagues,
  } = await import("../src/db/schema");
  const { syncCurrentLeague } = await import("../src/ingestion/current-league");
  const { importLeagueHistory } = await import(
    "../src/ingestion/historical-import"
  );
  const { createEspnDiscoveryProvider } = await import(
    "../src/providers/espn/client"
  );
  const {
    decodeEspnActivityId,
    decodeEspnLineupSlotId,
    decodeEspnPositionId,
    decodeEspnProTeamId,
    decodeEspnScoringStatId,
  } = await import("../src/providers/espn/reference-data");
  const { recomputeLeagueStatistics, runDataIntegrityChecks } = await import(
    "../src/stats/engine"
  );

  const env = parseEnv(process.env);
  const providerLeagueId = String(env.espn.testLeagueId ?? 95050);
  const currentSeason = env.espn.testSeason ?? 2026;
  const historySeasons = expectedHistorySeasons(currentSeason);

  if (!env.espn.swid || !env.espn.s2) {
    throw new Error(
      "ESPN_SWID and ESPN_S2 must be set in .env.local for T15 verification",
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

    const real = await withLeagueContext(
      handle.db,
      current.value.league.id,
      async (tx) => {
        const players = await tx
          .select({
            fullName: fantasyPlayers.fullName,
            metadata: fantasyPlayers.metadata,
            position: fantasyPlayers.position,
            proTeam: fantasyPlayers.proTeam,
            providerPlayerId: fantasyPlayers.providerPlayerId,
          })
          .from(fantasyPlayers)
          .where(eq(fantasyPlayers.leagueId, current.value.league.id));
        const rosters = await tx
          .select({
            metadata: fantasyRosterEntries.metadata,
            providerPlayerId: fantasyRosterEntries.providerPlayerId,
            scoringPeriod: fantasyRosterEntries.scoringPeriod,
            season: fantasyRosterEntries.season,
            slot: fantasyRosterEntries.slot,
            started: fantasyRosterEntries.started,
          })
          .from(fantasyRosterEntries)
          .where(eq(fantasyRosterEntries.leagueId, current.value.league.id));
        const settings = await tx
          .select({
            lineupSlotCounts: leagueSeasonSettings.lineupSlotCounts,
            scoringSettings: leagueSeasonSettings.scoringSettings,
            season: leagueSeasonSettings.season,
          })
          .from(leagueSeasonSettings)
          .where(eq(leagueSeasonSettings.leagueId, current.value.league.id));
        const transactions = await tx
          .select({
            details: fantasyTransactions.details,
            type: fantasyTransactions.type,
          })
          .from(fantasyTransactions)
          .where(eq(fantasyTransactions.leagueId, current.value.league.id));
        const integrityRows = await tx
          .select()
          .from(dataIntegrityChecks)
          .where(eq(dataIntegrityChecks.leagueId, current.value.league.id))
          .orderBy(
            asc(dataIntegrityChecks.checkKey),
            asc(dataIntegrityChecks.season),
          );

        const defaultPositionIds = sortedNumbers(
          players
            .map((player) =>
              numberFromUnknown(
                recordFromUnknown(player.metadata).defaultPositionId,
              ),
            )
            .filter((entry): entry is number => entry !== undefined),
        );
        const proTeamIds = sortedNumbers(
          players
            .map((player) =>
              numberFromUnknown(recordFromUnknown(player.metadata).proTeamId),
            )
            .filter((entry): entry is number => entry !== undefined),
        );
        const lineupSlotIds = sortedNumbers([
          ...rosters
            .map((roster) =>
              numberFromUnknown(
                recordFromUnknown(roster.metadata).lineupSlotId,
              ),
            )
            .filter((entry): entry is number => entry !== undefined),
          ...players.flatMap((player) =>
            numberArrayFromUnknown(
              recordFromUnknown(player.metadata).eligibleSlots,
            ),
          ),
          ...settings.flatMap((setting) =>
            numericRecordKeys(setting.lineupSlotCounts),
          ),
        ]);
        const scoringStatIds = sortedNumbers(
          settings.flatMap((setting) =>
            scoringStatIdsFromSettings(setting.scoringSettings),
          ),
        );
        const activityIds = sortedNumbers(
          transactions.flatMap((transaction) =>
            activityIdsFromDetails(transaction.details),
          ),
        );
        const playerByProviderId = new Map(
          players.map((player) => [player.providerPlayerId, player]),
        );
        const idpSamples = rosters
          .filter(
            (roster) =>
              IDP_SAMPLE_SEASONS.includes(
                roster.season as (typeof IDP_SAMPLE_SEASONS)[number],
              ) && roster.started,
          )
          .map((roster) => {
            const player = playerByProviderId.get(roster.providerPlayerId);
            return {
              name: player?.fullName ?? roster.providerPlayerId,
              position: player?.position ?? "unknown",
              proTeam: player?.proTeam ?? "",
              season: roster.season,
              slot: roster.slot,
              week: roster.scoringPeriod,
            };
          })
          .filter(
            (row) => IDP_LABELS.has(row.position) && IDP_LABELS.has(row.slot),
          )
          .slice(0, 8);

        return {
          activityIds,
          defaultPositionIds,
          idpSamples,
          integrityRows,
          lineupSlotIds,
          proTeamIds,
          rosterUnknownSlots: rosters.filter((row) => row.slot === "unknown")
            .length,
          scoringStatIds,
          unknownPlayerPositions: players.filter(
            (row) => row.position === "unknown",
          ).length,
          unknownPlayerProTeams: players.filter(
            (row) => row.proTeam === "unknown",
          ).length,
        };
      },
    );

    const providerDecodeCheck = real.integrityRows.find(
      (row) => row.checkKey === "provider_code_decoding",
    );
    const providerDecodePass = providerDecodeCheck?.status === "pass";
    const noUnknownDecodedValues =
      real.unknownPlayerPositions === 0 &&
      real.unknownPlayerProTeams === 0 &&
      real.rosterUnknownSlots === 0;

    const [synthetic] = await handle.db
      .insert(leagues)
      .values({
        currentScoringPeriod: 1,
        name: "T15 synthetic unknown code league",
        provider: "espn",
        providerLeagueId: "fixture-espn-t15-code-unknown",
        scoringType: "H2H_POINTS",
        season: currentSeason,
        size: 1,
        sport: "ffl",
        status: "complete",
      })
      .returning();
    if (!synthetic) {
      throw new Error("synthetic provider-code league was not created");
    }

    let syntheticIssues: unknown[] = [];
    try {
      await withLeagueContext(handle.db, synthetic.id, async (tx) => {
        await tx.insert(leagueSeasonSettings).values({
          contentHash: "t15-synthetic-settings",
          leagueId: synthetic.id,
          leagueProviderId: synthetic.providerLeagueId,
          leagueSize: 1,
          lineupSlotCounts: { "999": 1 },
          matchupPeriodCount: 1,
          provider: "espn",
          scoringSettings: {
            scoringItems: [{ points: 1, statId: 999 }],
            scoringType: "H2H_POINTS",
          },
          scoringType: "H2H_POINTS",
          season: currentSeason,
        });
        await tx.insert(fantasyPlayers).values({
          contentHash: "t15-synthetic-player",
          fullName: "Synthetic Unknown",
          leagueId: synthetic.id,
          leagueProviderId: synthetic.providerLeagueId,
          metadata: {
            defaultPositionId: 999,
            eligibleSlots: [999],
            proTeamId: 999,
          },
          position: "unknown",
          proTeam: "unknown",
          provider: "espn",
          providerPlayerId: "synthetic-unknown",
        });
        await tx.insert(fantasyTransactions).values({
          contentHash: "t15-synthetic-transaction",
          details: {
            items: [{ type: 999 }],
            rawActivityTypeId: 999,
          },
          leagueId: synthetic.id,
          leagueProviderId: synthetic.providerLeagueId,
          occurredAt: new Date(Date.UTC(currentSeason, 8, 1)),
          playerProviderIds: ["synthetic-unknown"],
          provider: "espn",
          providerTransactionId: "synthetic-unknown",
          season: currentSeason,
          teamProviderIds: ["1"],
          type: "unknown",
        });
      });
      await runDataIntegrityChecks(handle.db, { leagueId: synthetic.id });
      const syntheticRows = await withLeagueContext(
        handle.db,
        synthetic.id,
        (tx) =>
          tx
            .select()
            .from(dataIntegrityChecks)
            .where(eq(dataIntegrityChecks.leagueId, synthetic.id)),
      );
      syntheticIssues =
        (syntheticRows.find((row) => row.checkKey === "provider_code_decoding")
          ?.detail.issues as unknown[] | undefined) ?? [];
    } finally {
      await handle.db.delete(leagues).where(eq(leagues.id, synthetic.id));
    }

    const syntheticFlagged = syntheticIssues.length >= 5;
    const checks = [
      {
        label: "provider_code_decoding passes on real ESPN import",
        pass: providerDecodePass,
      },
      {
        label:
          "decoded player position/pro team and roster slot values contain zero unknowns",
        pass: noUnknownDecodedValues,
      },
      {
        label:
          "synthetic unknown position/slot/proTeam/stat/activity code flags",
        pass: syntheticFlagged,
      },
    ];
    const allPassed = checks.every((check) => check.pass);

    const section = [
      "## T15 decoding coverage",
      "",
      `- Real provider identity: ESPN ${providerLeagueId}, current season ${currentSeason}, imported seasons ${[
        ...historySeasons,
        currentSeason,
      ]
        .sort((left, right) => left - right)
        .join(", ")}.`,
      `- League id: ${current.value.league.id}`,
      `- Current import rosters changed/total: ${current.value.rosters.changed}/${current.value.rosters.total}`,
      `- Historical import rosters changed/total: ${history.value.rosters.changed}/${history.value.rosters.total}`,
      `- Stats recompute integrity failures: ${stats.integrityFailures}`,
      "",
      "### Distinct ESPN Codes Observed",
      "",
      `- defaultPositionId: ${formatDecodedIds(
        real.defaultPositionIds,
        decodeEspnPositionId,
      )}`,
      `- lineupSlotId/eligible/settings slots: ${formatDecodedIds(
        real.lineupSlotIds,
        decodeEspnLineupSlotId,
      )}`,
      `- proTeamId: ${formatDecodedIds(real.proTeamIds, decodeEspnProTeamId)}`,
      `- scoring statId: ${formatDecodedIds(real.scoringStatIds, (id) => {
        const decoded = decodeEspnScoringStatId(id);
        return decoded ? `${decoded.category}/${decoded.key}` : undefined;
      })}`,
      `- activity id: ${formatDecodedIds(real.activityIds, (id) => {
        const decoded = decodeEspnActivityId(id);
        return decoded ? `${decoded.category}/${decoded.label}` : undefined;
      })}`,
      "",
      "### Previously Broken Cases",
      "",
      real.idpSamples.length > 0
        ? "| Season | Week | Player | Pos | Pro | Slot |\n|---:|---:|---|---|---|---|\n" +
          real.idpSamples
            .map(
              (row) =>
                `| ${row.season} | ${row.week} | ${row.name} | ${row.position} | ${row.proTeam} | ${row.slot} |`,
            )
            .join("\n")
        : "- No 2011-2012 IDP roster sample was exposed by ESPN in this run.",
      "",
      "### Verification Checks",
      "",
      ...checks.map((check) => `- ${passFail(check.pass)} - ${check.label}`),
      `- provider_code_decoding detail: ${JSON.stringify(
        providerDecodeCheck?.detail ?? {},
      )}`,
      `- synthetic unknown issues: ${JSON.stringify(syntheticIssues)}`,
    ];

    writeImportSummary(section);

    if (!allPassed) {
      throw new Error("T15 decoding coverage verification failed");
    }
  } finally {
    await handle.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
