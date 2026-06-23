import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import type { DbHandle } from "../src/db/client";

type EnvMap = Record<string, string | undefined>;

const TOTAL_SEASONS = 16;
const PLACEHOLDER_NAME = /^(Fixture Manager\b.*|Screenshot .* Steward)$/i;
const ESPN_MEMBER_GUID =
  /^\{[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}$/;

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

function passFail(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

function quoteIdent(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe database name: ${value}`);
  }
  return `"${value}"`;
}

function databaseUrlWithName(
  databaseUrl: string,
  databaseName: string,
): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createFreshDatabase(
  baseDatabaseUrl: string,
): Promise<{ databaseName: string; databaseUrl: string }> {
  const databaseName = `rumbledore_t13_${Date.now()}_${process.pid}`;
  const adminUrl = databaseUrlWithName(baseDatabaseUrl, "postgres");
  const pool = new Pool({ connectionString: adminUrl });
  try {
    await pool.query(`create database ${quoteIdent(databaseName)}`);
  } finally {
    await pool.end();
  }
  return {
    databaseName,
    databaseUrl: databaseUrlWithName(baseDatabaseUrl, databaseName),
  };
}

async function main(): Promise<void> {
  loadEnvLocal(process.env);

  const { parseEnv } = await import("../src/core/env/schema");
  const { createDb } = await import("../src/db/client");
  const { withLeagueContext } = await import("../src/db/rls");
  const { migrateSerialized } = await import("../src/db/test-support");
  const {
    fantasyMatchups,
    fantasyMembers,
    fantasyTeams,
    identityMappings,
    leagues,
    persons,
    seasonStatistics,
    teamSeasons,
    weeklyStatistics,
  } = await import("../src/db/schema");
  const { syncCurrentLeague } = await import("../src/ingestion/current-league");
  const { importLeagueHistory } = await import(
    "../src/ingestion/historical-import"
  );
  const { loadImportSummaryData } = await import(
    "../src/ingestion/import-summary"
  );
  const { stableContentHash } = await import("../src/ingestion/hash");
  const { createEspnDiscoveryProvider } = await import(
    "../src/providers/espn/client"
  );
  const { recomputeLeagueStatistics } = await import("../src/stats/engine");

  const env = parseEnv(process.env);
  const providerLeagueId = String(env.espn.testLeagueId ?? 95050);
  const currentSeason = env.espn.testSeason ?? 2026;
  const historySeasons = expectedHistorySeasons(currentSeason, TOTAL_SEASONS);

  if (!env.espn.swid || !env.espn.s2) {
    throw new Error(
      "ESPN_SWID and ESPN_S2 must be set in .env.local for T13 import verification",
    );
  }

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
    fantasyMatchups: number;
    fantasyMembers: number;
    fantasyTeams: number;
    identityMappings: number;
    persons: number;
    seasonStatistics: number;
    teamSeasons: number;
    weeklyStatistics: number;
  };

  async function loadCounts(
    handle: DbHandle,
    leagueId: string,
  ): Promise<Counts> {
    return withLeagueContext(handle.db, leagueId, async (tx) => {
      const memberRows = await tx
        .select({ id: fantasyMembers.id })
        .from(fantasyMembers)
        .where(eq(fantasyMembers.leagueId, leagueId));
      const teamRows = await tx
        .select({ id: fantasyTeams.id })
        .from(fantasyTeams)
        .where(eq(fantasyTeams.leagueId, leagueId));
      const teamSeasonRows = await tx
        .select({ id: teamSeasons.id })
        .from(teamSeasons)
        .where(eq(teamSeasons.leagueId, leagueId));
      const personRows = await tx
        .select({ id: persons.id })
        .from(persons)
        .where(eq(persons.leagueId, leagueId));
      const mappingRows = await tx
        .select({ id: identityMappings.id })
        .from(identityMappings)
        .where(eq(identityMappings.leagueId, leagueId));
      const matchupRows = await tx
        .select({ id: fantasyMatchups.id })
        .from(fantasyMatchups)
        .where(eq(fantasyMatchups.leagueId, leagueId));
      const weeklyRows = await tx
        .select({ id: weeklyStatistics.id })
        .from(weeklyStatistics)
        .where(eq(weeklyStatistics.leagueId, leagueId));
      const seasonRows = await tx
        .select({ id: seasonStatistics.id })
        .from(seasonStatistics)
        .where(eq(seasonStatistics.leagueId, leagueId));
      return {
        fantasyMatchups: matchupRows.length,
        fantasyMembers: memberRows.length,
        fantasyTeams: teamRows.length,
        identityMappings: mappingRows.length,
        persons: personRows.length,
        seasonStatistics: seasonRows.length,
        teamSeasons: teamSeasonRows.length,
        weeklyStatistics: weeklyRows.length,
      };
    });
  }

  async function loadContamination(handle: DbHandle, leagueId: string) {
    return withLeagueContext(handle.db, leagueId, async (tx) => {
      const memberRows = await tx
        .select({
          displayName: fantasyMembers.displayName,
          providerMemberId: fantasyMembers.providerMemberId,
          season: fantasyMembers.season,
        })
        .from(fantasyMembers)
        .where(eq(fantasyMembers.leagueId, leagueId));
      const personRows = await tx
        .select({ canonicalName: persons.canonicalName })
        .from(persons)
        .where(eq(persons.leagueId, leagueId));
      const invalidMembers = memberRows.filter(
        (row) => !ESPN_MEMBER_GUID.test(row.providerMemberId),
      );
      const placeholderMembers = memberRows.filter((row) =>
        PLACEHOLDER_NAME.test(row.displayName),
      );
      const placeholderPersons = personRows.filter((row) =>
        PLACEHOLDER_NAME.test(row.canonicalName),
      );
      return {
        invalidMembers,
        placeholderMembers,
        placeholderPersons,
      };
    });
  }

  async function importAndRecompute({
    handle,
    resetLeague,
  }: {
    handle: DbHandle;
    resetLeague: boolean;
  }) {
    await migrateSerialized(handle);
    if (resetLeague) {
      await handle.db
        .delete(leagues)
        .where(
          and(
            eq(leagues.provider, "espn"),
            eq(leagues.providerLeagueId, providerLeagueId),
          ),
        );
    }

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
    return { current, history, stats };
  }

  async function verifyFreshImport(freshDatabaseUrl: string) {
    const handle = createDb(freshDatabaseUrl);
    try {
      const first = await importAndRecompute({ handle, resetLeague: true });
      const firstCounts = await loadCounts(
        handle,
        first.current.value.league.id,
      );
      const firstContamination = await loadContamination(
        handle,
        first.current.value.league.id,
      );

      const second = await importAndRecompute({ handle, resetLeague: false });
      const secondCounts = await loadCounts(
        handle,
        second.current.value.league.id,
      );
      const secondSummary = await loadImportSummaryData(
        handle.db,
        second.current.value.league.id,
      );
      const idempotentCountsStable =
        stableJson(firstCounts) === stableJson(secondCounts);
      const integrityFailures = secondSummary.integrityChecks.filter(
        (check) => check.status !== "pass",
      );
      const providerInvariantFailures = secondSummary.integrityChecks.filter(
        (check) =>
          check.checkKey === "provider_identity_contamination" &&
          check.status !== "pass",
      );

      return {
        contamination: firstContamination,
        counts: secondCounts,
        idempotentCountsStable,
        integrityFailures,
        leagueId: second.current.value.league.id,
        persons: secondSummary.persons,
        providerInvariantFailures,
        settingsRows: secondSummary.seasonSettings.length,
      };
    } finally {
      await handle.pool.end();
    }
  }

  async function injectContamination(handle: DbHandle, leagueId: string) {
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      await tx
        .insert(fantasyMembers)
        .values({
          contentHash: stableContentHash({
            displayName: "Fixture Manager 99",
            providerMemberId: "member-99",
            season: currentSeason,
          }),
          displayName: "Fixture Manager 99",
          leagueId,
          leagueProviderId: providerLeagueId,
          provider: "espn",
          providerMemberId: "member-99",
          role: "member",
          season: currentSeason,
        })
        .onConflictDoUpdate({
          target: [
            fantasyMembers.provider,
            fantasyMembers.leagueProviderId,
            fantasyMembers.providerMemberId,
            fantasyMembers.season,
          ],
          set: {
            contentHash: stableContentHash({
              displayName: "Fixture Manager 99",
              providerMemberId: "member-99",
              season: currentSeason,
            }),
            displayName: "Fixture Manager 99",
            role: "member",
          },
        });
      await tx
        .insert(fantasyTeams)
        .values({
          abbrev: "FX",
          contentHash: stableContentHash({
            name: "Fixture Contamination",
            providerTeamId: "fixture-99",
            season: currentSeason,
          }),
          leagueId,
          leagueProviderId: providerLeagueId,
          losses: 0,
          name: "Fixture Contamination",
          ownerMemberIds: ["member-99"],
          pointsAgainst: 0,
          pointsFor: 0,
          provider: "espn",
          providerTeamId: "fixture-99",
          season: currentSeason,
          ties: 0,
          wins: 0,
        })
        .onConflictDoUpdate({
          target: [
            fantasyTeams.provider,
            fantasyTeams.leagueProviderId,
            fantasyTeams.providerTeamId,
            fantasyTeams.season,
          ],
          set: {
            contentHash: stableContentHash({
              name: "Fixture Contamination",
              providerTeamId: "fixture-99",
              season: currentSeason,
            }),
            name: "Fixture Contamination",
            ownerMemberIds: ["member-99"],
          },
        });
    });
  }

  async function verifyContaminatedDevImport() {
    const handle = createDb(env.databaseUrl);
    try {
      await migrateSerialized(handle);
      let [league] = await handle.db
        .select({ id: leagues.id })
        .from(leagues)
        .where(
          and(
            eq(leagues.provider, "espn"),
            eq(leagues.providerLeagueId, providerLeagueId),
          ),
        )
        .limit(1);
      if (!league) {
        const created = await importAndRecompute({
          handle,
          resetLeague: false,
        });
        league = { id: created.current.value.league.id };
      }

      const preExisting = await loadContamination(handle, league.id);
      await injectContamination(handle, league.id);
      const contaminated = await loadContamination(handle, league.id);
      const cleaned = await importAndRecompute({ handle, resetLeague: false });
      const post = await loadContamination(
        handle,
        cleaned.current.value.league.id,
      );
      const summary = await loadImportSummaryData(
        handle.db,
        cleaned.current.value.league.id,
      );
      const providerInvariantFailures = summary.integrityChecks.filter(
        (check) =>
          check.checkKey === "provider_identity_contamination" &&
          check.status !== "pass",
      );
      return {
        contaminated,
        leagueId: cleaned.current.value.league.id,
        post,
        preExisting,
        providerInvariantFailures,
        realPersonSamples: summary.persons
          .map((person) => person.canonicalName)
          .filter((name) => !PLACEHOLDER_NAME.test(name))
          .slice(0, 8),
      };
    } finally {
      await handle.pool.end();
    }
  }

  const fresh = await createFreshDatabase(env.databaseUrl);
  const freshResult = await verifyFreshImport(fresh.databaseUrl);
  const contaminatedResult = await verifyContaminatedDevImport();

  const freshPasses = {
    idempotentCountsStable: freshResult.idempotentCountsStable,
    noInvalidMembers: freshResult.contamination.invalidMembers.length === 0,
    noPlaceholderMembers:
      freshResult.contamination.placeholderMembers.length === 0,
    noPlaceholderPersons:
      freshResult.contamination.placeholderPersons.length === 0,
    providerInvariantPasses: freshResult.providerInvariantFailures.length === 0,
    settingsComplete: freshResult.settingsRows === TOTAL_SEASONS,
    totalIntegrityPasses: freshResult.integrityFailures.length === 0,
  };
  const contaminatedPasses = {
    contaminatedBefore:
      contaminatedResult.contaminated.invalidMembers.length > 0 ||
      contaminatedResult.contaminated.placeholderMembers.length > 0,
    noInvalidMembersAfter: contaminatedResult.post.invalidMembers.length === 0,
    noPlaceholderMembersAfter:
      contaminatedResult.post.placeholderMembers.length === 0,
    noPlaceholderPersonsAfter:
      contaminatedResult.post.placeholderPersons.length === 0,
    providerInvariantPasses:
      contaminatedResult.providerInvariantFailures.length === 0,
  };

  const section = [
    "## T13 import-integrity",
    "",
    `- Verified at: ${new Date().toISOString()}`,
    `- Real provider identity: ESPN ${providerLeagueId}, season ${currentSeason}`,
    "",
    "### Fresh/empty DB",
    "",
    `- Fresh database: ${fresh.databaseName}`,
    `- Imported league id: ${freshResult.leagueId}`,
    `- Settings rows: ${freshResult.settingsRows}`,
    `- Persons: ${freshResult.counts.persons}`,
    `- Fantasy members: ${freshResult.counts.fantasyMembers}`,
    `- Team seasons: ${freshResult.counts.teamSeasons}`,
    `- ${passFail(freshPasses.settingsComplete)} - all ${TOTAL_SEASONS} settings seasons imported`,
    `- ${passFail(freshPasses.noInvalidMembers)} - no invalid ESPN member ids`,
    `- ${passFail(freshPasses.noPlaceholderMembers)} - no Fixture/Screenshot member names`,
    `- ${passFail(freshPasses.noPlaceholderPersons)} - no Fixture/Screenshot canonical person names`,
    `- ${passFail(freshPasses.providerInvariantPasses)} - provider_identity_contamination invariant passes`,
    `- ${passFail(freshPasses.totalIntegrityPasses)} - all integrity checks pass`,
    `- ${passFail(freshPasses.idempotentCountsStable)} - re-import counts are stable`,
    "",
    "### Contaminated -> clean dev DB",
    "",
    `- Dev league id: ${contaminatedResult.leagueId}`,
    `- Pre-existing invalid members: ${contaminatedResult.preExisting.invalidMembers.length}`,
    `- Contaminated invalid members before clean: ${contaminatedResult.contaminated.invalidMembers.length}`,
    `- Contaminated placeholder members before clean: ${contaminatedResult.contaminated.placeholderMembers.length}`,
    `- Invalid members after clean: ${contaminatedResult.post.invalidMembers.length}`,
    `- Placeholder members after clean: ${contaminatedResult.post.placeholderMembers.length}`,
    `- Placeholder persons after clean: ${contaminatedResult.post.placeholderPersons.length}`,
    `- ${passFail(contaminatedPasses.contaminatedBefore)} - contamination was present before clean path`,
    `- ${passFail(contaminatedPasses.noInvalidMembersAfter)} - invalid member ids removed`,
    `- ${passFail(contaminatedPasses.noPlaceholderMembersAfter)} - placeholder member rows removed`,
    `- ${passFail(contaminatedPasses.noPlaceholderPersonsAfter)} - placeholder canonical persons removed`,
    `- ${passFail(contaminatedPasses.providerInvariantPasses)} - provider_identity_contamination invariant passes after clean`,
    `- Real person samples after clean: ${contaminatedResult.realPersonSamples.join(", ")}`,
    "",
  ].join("\n");

  const summaryPath = resolve(
    process.cwd(),
    ".orchestration/import-summary.md",
  );
  mkdirSync(resolve(process.cwd(), ".orchestration"), { recursive: true });
  let existing = "";
  try {
    existing = readFileSync(summaryPath, "utf8");
  } catch {
    existing = "# Import Summary\n\n";
  }
  const withoutOldT13 = existing.replace(
    /\n?## T13 import-integrity[\s\S]*?(?=\n## |\n?$)/,
    "\n",
  );
  writeFileSync(
    summaryPath,
    `${withoutOldT13.trimEnd()}\n\n${section}`,
    "utf8",
  );

  const allPasses = [
    ...Object.values(freshPasses),
    ...Object.values(contaminatedPasses),
  ].every(Boolean);
  if (!allPasses) {
    throw new Error("T13 import-integrity verification failed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
