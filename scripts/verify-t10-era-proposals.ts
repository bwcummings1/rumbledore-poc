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

function stripT10Section(body: string): string {
  return body.replace(/\n## T10 Era Proposals[\s\S]*$/u, "").trimEnd();
}

function writeImportSummary(
  fallbackSummaryLines: readonly string[],
  t10Lines: readonly string[],
): void {
  mkdirSync(".orchestration", { recursive: true });
  let base = fallbackSummaryLines.join("\n");
  try {
    base = stripT10Section(
      readFileSync(".orchestration/import-summary.md", "utf8"),
    );
  } catch {
    /* first verifier run in a clean workspace; use the concise fallback */
  }
  writeFileSync(
    ".orchestration/import-summary.md",
    `${base}\n\n${t10Lines.join("\n")}\n`,
  );
}

function derivedReasons(value: Record<string, unknown>): string[] {
  const reasons = value.boundaryReasons;
  return Array.isArray(reasons)
    ? reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
}

loadEnvLocal(process.env);

async function main(): Promise<void> {
  const { parseEnv } = await import("../src/core/env/schema");
  const { createDb } = await import("../src/db/client");
  const { migrateSerialized } = await import("../src/db/test-support");
  const { leagues, users } = await import("../src/db/schema");
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
    composeCanonicalSnapshot,
    confirmLeagueSeasonGrouping,
    createCurationCheckpoint,
    proposeLeagueSeasonGroupings,
    pushAllCurationSeasons,
  } = await import("../src/stats");
  const { recomputeLeagueStatistics } = await import("../src/stats/engine");

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

    const leagueId = current.value.league.id;
    const stats = await recomputeLeagueStatistics(handle.db, { leagueId });
    const summary = await loadImportSummaryData(handle.db, leagueId);
    const integrityFailures = summary.integrityChecks.filter(
      (check) => check.status !== "pass",
    );
    requireCondition(
      integrityFailures.length === 0,
      "real-league import has integrity failures before T10 verification",
    );

    const proposals = await proposeLeagueSeasonGroupings(handle.db, {
      leagueId,
    });
    const proposedEras = proposals.filter(
      (proposal) => proposal.kind === "era" && proposal.status === "proposed",
    );
    const hasTwoWeekPlayoffs = proposedEras.some(
      (proposal) =>
        proposal.seasons.includes(2011) &&
        proposal.seasons.includes(2012) &&
        proposal.name.includes("2-week playoffs"),
    );
    const hasTeamCountBoundary = proposedEras.some(
      (proposal) =>
        proposal.seasons[0] === 2013 &&
        derivedReasons(proposal.derivedFrom).includes("team_count_change"),
    );
    const hasRosterBoundary = proposedEras.some((proposal) =>
      derivedReasons(proposal.derivedFrom).includes(
        "roster_lineup_slot_counts_change",
      ),
    );
    const hasPlayoffTeamBoundary = proposedEras.some((proposal) =>
      derivedReasons(proposal.derivedFrom).includes(
        "playoff_team_count_change",
      ),
    );
    const hasRegularSeasonBoundary = proposedEras.some(
      (proposal) =>
        proposal.seasons[0] === 2021 &&
        derivedReasons(proposal.derivedFrom).includes(
          "regular_season_week_count_change",
        ),
    );
    const hasSegmentProposal = proposals.some(
      (proposal) => proposal.kind !== "era",
    );

    const proposalToConfirm =
      proposedEras.find(
        (proposal) =>
          proposal.seasons[0] === 2013 &&
          derivedReasons(proposal.derivedFrom).includes("team_count_change"),
      ) ?? proposedEras[0];
    requireCondition(
      Boolean(proposalToConfirm),
      "detector did not produce a proposal to confirm",
    );
    if (!proposalToConfirm) {
      throw new Error("proposal disappeared");
    }

    const [actor] = await handle.db
      .insert(users)
      .values({
        displayName: "T10 Era Proposal Verifier",
        email: `t10-era-proposals-${Date.now()}@example.com`,
      })
      .returning({ id: users.id });
    requireCondition(Boolean(actor), "verification actor was not created");
    if (!actor) {
      throw new Error("verification actor disappeared");
    }

    const confirmed = await confirmLeagueSeasonGrouping(handle.db, {
      actorUserId: actor.id,
      groupingId: proposalToConfirm.id,
      leagueId,
      name: proposalToConfirm.name,
      reason: "T10 real-league era verification",
      seasons: proposalToConfirm.seasons,
    });
    const checkpoint = await createCurationCheckpoint(handle.db, {
      actorUserId: actor.id,
      label: "T10 era baseline",
      leagueId,
      note: "Baseline with one confirmed detector era for Record Book lens verification",
    });
    const pushes = await pushAllCurationSeasons(handle.db, {
      actorUserId: actor.id,
      checkpointId: checkpoint.id,
      leagueId,
      reason: "T10 push confirmed era grouping",
    });
    const snapshot = await composeCanonicalSnapshot(handle.db, { leagueId });
    const confirmedInSnapshot = snapshot.groupings.some(
      (grouping) =>
        grouping.id === confirmed.id && grouping.status === "confirmed",
    );

    const checks = [
      {
        label: "detector proposes the 2011-2012 2-week playoff era",
        pass: hasTwoWeekPlayoffs,
      },
      {
        label: "detector proposes a 2013 team-count boundary",
        pass: hasTeamCountBoundary,
      },
      {
        label: "detector proposes the OP-to-FLEX lineup boundary",
        pass: hasRosterBoundary,
      },
      {
        label: "detector proposes the playoff-team-count boundary",
        pass: hasPlayoffTeamBoundary,
      },
      {
        label: "detector proposes the 2021 regular-season-week boundary",
        pass: hasRegularSeasonBoundary,
      },
      {
        label: "detector does not propose regular/playoff segments as eras",
        pass: !hasSegmentProposal,
      },
      {
        label: "confirmed grouping is present in the pushed snapshot",
        pass: confirmedInSnapshot,
      },
    ];
    for (const check of checks) {
      requireCondition(check.pass, check.label);
    }

    const fallbackSummary = [
      "# Real League Import Summary",
      "",
      `- League: ESPN ${providerLeagueId}`,
      `- Current season synced: ${currentSeason}`,
      `- Historical seasons requested in one import: ${historySeasons.join(", ")}`,
      `- Settings rows: ${summary.seasonSettings.length}`,
      `- Integrity failures: ${integrityFailures.length}`,
      `- Record rows: ${summary.recordCounts.allTimeRecords}`,
      `- Record book aggregate rows: ${stats.recordBookAggregates}`,
    ];
    const t10Lines = [
      "## T10 Era Proposals",
      "",
      `- League DB id: ${leagueId}`,
      `- Proposed eras: ${proposedEras.length}`,
      `- Confirmed for screenshot lens: ${confirmed.name} (${confirmed.seasons.join(", ")})`,
      `- Pushed seasons after confirmation: ${pushes.length}`,
      "",
      "### Detector Checks",
      "",
      ...checks.map((check) => `- ${passFail(check.pass)} - ${check.label}`),
      "",
      "### Proposals",
      "",
      ...proposals.map(
        (proposal) =>
          `- ${(proposal.id === confirmed.id ? "confirmed" : proposal.status).toUpperCase()} - ${proposal.name}: ${proposal.seasons.join(", ")} - ${proposal.rationale}`,
      ),
    ];
    writeImportSummary(fallbackSummary, t10Lines);
    console.log(
      `T10 era proposals verified for ESPN ${providerLeagueId}: ${proposals.length} grouping(s), confirmed ${confirmed.name}`,
    );
  } finally {
    await handle.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
