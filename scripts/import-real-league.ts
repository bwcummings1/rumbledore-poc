import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";
import { getEnv } from "../src/core/env";
import { getDb } from "../src/db";
import type { DbHandle } from "../src/db/client";
import { withLeagueContext } from "../src/db/rls";
import {
  championshipRecords,
  dataIntegrityChecks,
  fantasyMatchups,
  fantasyTeams,
  headToHeadRecords,
  historicalImportCheckpoints,
  identityMappings,
  leagueSeasonSettings,
  leagues,
  persons,
  recordBookAllTimeStandings,
  recordBookMilestones,
  seasonStatistics,
  teamSeasons,
  weeklyStatistics,
} from "../src/db/schema";
import { migrateSerialized } from "../src/db/test-support";
import { importLeagueHistory, syncCurrentLeague } from "../src/ingestion";
import {
  createEspnDiscoveryProvider,
  type EspnCookieCredentials,
  type EspnFetch,
  type EspnSession,
} from "../src/providers/espn/client";
import type { ProviderLeagueRef } from "../src/providers/model";
import { NoopRealtimePublisher } from "../src/realtime/mocks";
import { recomputeLeagueStatistics } from "../src/stats";
import { buildRecordsCatalog } from "../src/stats/records-catalog";

const DEFAULT_ENV_FILE = "/home/ubuntu/rumbledore-poc/.env.local";
const SUMMARY_PATH =
  "/home/ubuntu/rumbledore-poc/.orchestration/import-summary.md";
const TRACK_DONE_PATH = "/home/ubuntu/rmbl-IMP/.track-done";
const TARGET_PROVIDER = "espn";
const HISTORY_MAX_SEASONS = 15;
const UNSAFE_JSON_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

type RuntimeDbGlobal = typeof globalThis & { __rumbledoreDb?: DbHandle };

interface ImportNote {
  label: string;
  detail: string;
}

interface SummaryData {
  catalog: ReturnType<typeof buildRecordsCatalog>;
  checks: {
    checkKey: string;
    detail: Record<string, unknown>;
    season: number | null;
    status: string;
  }[];
  currentSync: {
    changedFinalMatchups: number;
    changedTransactions: number;
    leagueChanged: number;
    matchups: { changed: number; total: number; unchanged: number };
    members: { changed: number; total: number; unchanged: number };
    teams: { changed: number; total: number; unchanged: number };
    transactions: { changed: number; total: number; unchanged: number };
  };
  flaggedMappings: {
    confidence: number;
    method: string;
    ownerNames: string[];
    personName: string;
    providerTeamId: string;
    season: number;
    teamName: string;
  }[];
  history: {
    imported: number[];
    requested: number[];
    skipped: number[];
  };
  league: {
    id: string;
    name: string;
    providerLeagueId: string;
    season: number;
  };
  notes: ImportNote[];
  personNames: string[];
  stats: Awaited<ReturnType<typeof recomputeLeagueStatistics>>;
  totalMatchups: number;
  seasons: {
    matchups: number;
    season: number;
    teams: number;
  }[];
}

function envFilePath(): string {
  return process.env.REAL_LEAGUE_ENV_FILE?.trim() || DEFAULT_ENV_FILE;
}

function decodeEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  const quote = trimmed[0];
  if (
    (quote === `"` || quote === `'`) &&
    trimmed.length >= 2 &&
    trimmed.endsWith(quote)
  ) {
    const inner = trimmed.slice(1, -1);
    if (quote === `"`) {
      return inner
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, `"`)
        .replace(/\\\\/g, "\\");
    }
    return inner;
  }

  const commentStart = trimmed.search(/\s#/);
  return (commentStart >= 0 ? trimmed.slice(0, commentStart) : trimmed).trim();
}

async function loadEnvFile(filePath: string): Promise<void> {
  const content = await readFile(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separator = withoutExport.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    if (!Object.hasOwn(process.env, key)) {
      process.env[key] = decodeEnvValue(withoutExport.slice(separator + 1));
    }
  }
}

function getDbHandle(): DbHandle {
  const handle = (globalThis as RuntimeDbGlobal).__rumbledoreDb;
  if (!handle) {
    throw new Error("getDb did not initialize the global DB handle");
  }
  return handle;
}

function requireEspnConfig(): {
  credentials: EspnCookieCredentials;
  providerLeagueId: string;
  season: number;
} {
  const env = getEnv();
  const swid = env.espn.swid;
  const s2 = env.espn.s2;
  const testLeagueId = env.espn.testLeagueId;
  const testSeason = env.espn.testSeason;
  const missing: string[] = [];
  if (!swid) missing.push("ESPN_SWID");
  if (!s2) missing.push("ESPN_S2");
  if (!testLeagueId) missing.push("ESPN_TEST_LEAGUE_ID");
  if (!testSeason) missing.push("ESPN_TEST_SEASON");
  if (!swid || !s2 || !testLeagueId || !testSeason) {
    throw new Error(`Missing required ESPN import env: ${missing.join(", ")}`);
  }

  return {
    credentials: {
      espn_s2: s2,
      swid,
    },
    providerLeagueId: String(testLeagueId),
    season: testSeason,
  };
}

function providerErrorSummary(error: { code?: string; message?: string }) {
  return [error.code, error.message].filter(Boolean).join(": ");
}

function responseHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json");
  return headers;
}

function jsonResponseFrom(response: Response, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: responseHeaders(response),
    status: response.status,
    statusText: response.statusText,
  });
}

function successfulJsonResponseFrom(
  response: Response,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body), {
    headers: responseHeaders(response),
    status: 200,
    statusText: "OK",
  });
}

function copyProviderRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!UNSAFE_JSON_OBJECT_KEYS.has(key)) {
      copy[key] = value;
    }
  }
  return copy;
}

function sanitizedHistoryBody(body: unknown): {
  removedScheduleRows: number;
  value: unknown;
} {
  if (!Array.isArray(body)) {
    return { removedScheduleRows: 0, value: body };
  }

  let removedScheduleRows = 0;
  const value = body.map((league) => {
    if (!league || typeof league !== "object") {
      return league;
    }
    const record = league as Record<string, unknown>;
    if (!Array.isArray(record.schedule)) {
      return league;
    }
    const schedule = record.schedule.filter((matchup) => {
      if (!matchup || typeof matchup !== "object") {
        removedScheduleRows += 1;
        return false;
      }
      const row = matchup as Record<string, unknown>;
      const home = row.home;
      const away = row.away;
      const hasHomeTeam = home && typeof home === "object" && "teamId" in home;
      const hasAwayTeam = away && typeof away === "object" && "teamId" in away;
      if (!hasHomeTeam || !hasAwayTeam) {
        removedScheduleRows += 1;
        return false;
      }
      return true;
    });
    const copy = copyProviderRecord(record);
    copy.schedule = schedule;
    return copy;
  });

  return { removedScheduleRows, value };
}

function sanitizedCurrentLeagueBody(
  url: URL,
  body: unknown,
): { removedSchedule: boolean; value: unknown } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { removedSchedule: false, value: body };
  }

  const views = url.searchParams.getAll("view");
  const requestedMatchups = views.some(
    (view) => view === "mMatchup" || view === "mMatchupScore",
  );
  const record = body as Record<string, unknown>;
  if (requestedMatchups || !Array.isArray(record.schedule)) {
    return { removedSchedule: false, value: body };
  }

  const withoutSchedule = copyProviderRecord(record);
  delete withoutSchedule.schedule;
  return { removedSchedule: true, value: withoutSchedule };
}

function createHistoryNormalizingFetch(notes: ImportNote[]): EspnFetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    const url = String(input);
    const parsedUrl = new URL(url);
    const isHistory = url.includes("/leagueHistory/");
    const isCurrentLeague = !isHistory && url.includes("/leagues/");

    if (isHistory && response.status === 404) {
      const season = parsedUrl.searchParams.get("seasonId") ?? "unknown";
      notes.push({
        detail: `season ${season}: ESPN returned 404; treated as no historical data so the importer can stop cleanly`,
        label: "Historical season not exposed",
      });
      return successfulJsonResponseFrom(response, []);
    }
    if ((!isHistory && !isCurrentLeague) || !response.ok) {
      return response;
    }

    let body: unknown;
    try {
      body = await response.clone().json();
    } catch (error) {
      if (isHistory) {
        const season = parsedUrl.searchParams.get("seasonId") ?? "unknown";
        notes.push({
          detail: `season ${season}: could not inspect history response JSON (${error instanceof Error ? error.message : String(error)})`,
          label: "Historical response inspection failed",
        });
      }
      return response;
    }

    if (isHistory) {
      const sanitized = sanitizedHistoryBody(body);
      if (sanitized.removedScheduleRows > 0) {
        const season = parsedUrl.searchParams.get("seasonId") ?? "unknown";
        notes.push({
          detail: `season ${season}: removed ${sanitized.removedScheduleRows} one-sided schedule row(s) before provider normalization`,
          label: "Filtered ESPN history schedule placeholders",
        });
        return jsonResponseFrom(response, sanitized.value);
      }
      return response;
    }

    const sanitized = sanitizedCurrentLeagueBody(parsedUrl, body);
    if (sanitized.removedSchedule) {
      notes.push({
        detail: `views ${parsedUrl.searchParams.getAll("view").join(",")}: removed unrequested schedule payload before provider normalization`,
        label: "Filtered ESPN current schedule payload",
      });
      return jsonResponseFrom(response, sanitized.value);
    }

    return response;
  };
}

function redactText(input: string): string {
  const env = getEnv();
  let output = input;
  for (const secret of [env.espn.swid, env.espn.s2]) {
    if (secret) {
      output = output.split(secret).join("[REDACTED]");
    }
  }
  return output;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function tableCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatScore(value: number | null): string {
  return value === null ? "n/a" : formatNumber(value);
}

function olderHistoricalSeasons(currentSeason: number): number[] {
  const olderCount = Math.max(0, HISTORY_MAX_SEASONS - 10);
  return Array.from(
    { length: olderCount },
    (_, index) => currentSeason - 11 - index,
  );
}

function mergeSeasonLists(...lists: readonly number[][]): number[] {
  return [...new Set(lists.flat())].sort((left, right) => right - left);
}

async function resetPreviousVerificationState({
  notes,
  providerLeagueId,
}: {
  notes: ImportNote[];
  providerLeagueId: string;
}): Promise<void> {
  const db = getDb();
  const [existingLeague] = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(
      and(
        eq(leagues.provider, TARGET_PROVIDER),
        eq(leagues.providerLeagueId, providerLeagueId),
      ),
    )
    .limit(1);
  if (!existingLeague) {
    return;
  }

  const deleted = await withLeagueContext(db, existingLeague.id, async (tx) => {
    const deletedChecks = await tx
      .delete(dataIntegrityChecks)
      .where(eq(dataIntegrityChecks.leagueId, existingLeague.id))
      .returning({ id: dataIntegrityChecks.id });
    const deletedCheckpoints = await tx
      .delete(historicalImportCheckpoints)
      .where(eq(historicalImportCheckpoints.leagueId, existingLeague.id))
      .returning({ id: historicalImportCheckpoints.id });
    return {
      checkpoints: deletedCheckpoints.length,
      integrityChecks: deletedChecks.length,
    };
  });

  if (deleted.checkpoints > 0 || deleted.integrityChecks > 0) {
    notes.push({
      detail: `removed ${deleted.checkpoints} historical checkpoint row(s) and ${deleted.integrityChecks} generated data_integrity_check row(s) from previous verification attempts`,
      label: "Reset previous verification state",
    });
  }
}

async function buildLeagueRef({
  notes,
  provider,
  providerLeagueId,
  season,
  session,
}: {
  notes: ImportNote[];
  provider: ReturnType<typeof createEspnDiscoveryProvider>;
  providerLeagueId: string;
  season: number;
  session: EspnSession;
}): Promise<ProviderLeagueRef> {
  const discovered = await provider.discoverLeagues(session);
  if (!discovered.ok) {
    notes.push({
      detail: providerErrorSummary(discovered.error),
      label: "Discovery failed; continuing with explicit league ref",
    });
  }

  const discoveredRef = discovered.ok
    ? discovered.value.find(
        (candidate) =>
          candidate.providerId === providerLeagueId &&
          candidate.season === season,
      )
    : undefined;
  if (!discoveredRef && discovered.ok) {
    notes.push({
      detail:
        "Target league was not present in ESPN discovery results; explicit ref was used.",
      label: "Discovery did not include target league",
    });
  }

  return {
    name: discoveredRef?.name ?? `ESPN League ${providerLeagueId}`,
    provider: TARGET_PROVIDER,
    providerId: providerLeagueId,
    providerTeamId: discoveredRef?.providerTeamId,
    season,
    size: discoveredRef?.size,
    sport: discoveredRef?.sport ?? "ffl",
    teamName: discoveredRef?.teamName,
  };
}

async function collectSummaryData(input: {
  currentSync: SummaryData["currentSync"];
  history: SummaryData["history"];
  leagueId: string;
  notes: ImportNote[];
  stats: SummaryData["stats"];
}): Promise<SummaryData> {
  const { currentSync, history, leagueId, notes, stats } = input;
  const db = getDb();
  const [leagueRowRaw] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (!leagueRowRaw) {
    throw new Error(`Imported league row was not found: ${leagueId}`);
  }
  const leagueRow = {
    id: leagueRowRaw.id,
    name: leagueRowRaw.name,
    providerLeagueId: leagueRowRaw.providerLeagueId,
    season: leagueRowRaw.season,
  };

  const scoped = await withLeagueContext(db, leagueId, async (tx) => {
    const settingsSeasons = await tx
      .select({ season: leagueSeasonSettings.season })
      .from(leagueSeasonSettings)
      .where(eq(leagueSeasonSettings.leagueId, leagueId))
      .orderBy(asc(leagueSeasonSettings.season));
    const teamCounts = await tx
      .select({
        season: fantasyTeams.season,
        teams: sql<number>`count(*)::int`,
      })
      .from(fantasyTeams)
      .where(eq(fantasyTeams.leagueId, leagueId))
      .groupBy(fantasyTeams.season)
      .orderBy(asc(fantasyTeams.season));
    const matchupCounts = await tx
      .select({
        matchups: sql<number>`count(*)::int`,
        season: fantasyMatchups.season,
      })
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.leagueId, leagueId))
      .groupBy(fantasyMatchups.season)
      .orderBy(asc(fantasyMatchups.season));
    const personRows = await tx
      .select({
        canonicalName: persons.canonicalName,
        id: persons.id,
      })
      .from(persons)
      .where(eq(persons.leagueId, leagueId))
      .orderBy(asc(persons.canonicalName));
    const flaggedMappings = await tx
      .select({
        confidence: identityMappings.confidence,
        method: identityMappings.method,
        ownerNames: teamSeasons.ownerNames,
        personName: persons.canonicalName,
        providerTeamId: identityMappings.providerTeamId,
        season: identityMappings.season,
        teamName: teamSeasons.teamName,
      })
      .from(identityMappings)
      .innerJoin(teamSeasons, eq(identityMappings.teamSeasonId, teamSeasons.id))
      .innerJoin(persons, eq(identityMappings.personId, persons.id))
      .where(
        and(
          eq(identityMappings.leagueId, leagueId),
          or(
            lt(identityMappings.confidence, 0.9),
            eq(identityMappings.method, "fuzzy"),
          ),
        ),
      )
      .orderBy(
        asc(identityMappings.season),
        desc(identityMappings.confidence),
        asc(persons.canonicalName),
      );
    const checks = await tx
      .select({
        checkKey: dataIntegrityChecks.checkKey,
        detail: dataIntegrityChecks.detail,
        season: dataIntegrityChecks.season,
        status: dataIntegrityChecks.status,
      })
      .from(dataIntegrityChecks)
      .where(eq(dataIntegrityChecks.leagueId, leagueId))
      .orderBy(
        asc(dataIntegrityChecks.season),
        asc(dataIntegrityChecks.checkKey),
        asc(dataIntegrityChecks.createdAt),
      );

    const personNames = new Map(
      personRows.map((person) => [person.id, person.canonicalName]),
    );
    const catalog = buildRecordsCatalog({
      allTimeStandingRows: await tx
        .select()
        .from(recordBookAllTimeStandings)
        .where(eq(recordBookAllTimeStandings.leagueId, leagueId))
        .orderBy(asc(recordBookAllTimeStandings.rank)),
      championshipRows: await tx
        .select()
        .from(championshipRecords)
        .where(eq(championshipRecords.leagueId, leagueId))
        .orderBy(asc(championshipRecords.season)),
      headToHeadRows: await tx
        .select()
        .from(headToHeadRecords)
        .where(eq(headToHeadRecords.leagueId, leagueId)),
      limit: 10,
      milestoneRows: await tx
        .select()
        .from(recordBookMilestones)
        .where(eq(recordBookMilestones.leagueId, leagueId)),
      personNames,
      seasonRows: await tx
        .select()
        .from(seasonStatistics)
        .where(eq(seasonStatistics.leagueId, leagueId)),
      weeklyRows: await tx
        .select()
        .from(weeklyStatistics)
        .where(eq(weeklyStatistics.leagueId, leagueId)),
    });

    return {
      catalog,
      checks,
      flaggedMappings,
      matchupCounts,
      personNames: personRows.map((person) => person.canonicalName),
      settingsSeasons,
      teamCounts,
    };
  });

  const teamCountBySeason = new Map(
    scoped.teamCounts.map((row) => [row.season, row.teams]),
  );
  const matchupCountBySeason = new Map(
    scoped.matchupCounts.map((row) => [row.season, row.matchups]),
  );
  const seasons = [
    ...new Set([
      ...scoped.settingsSeasons.map((row) => row.season),
      ...scoped.teamCounts.map((row) => row.season),
      ...scoped.matchupCounts.map((row) => row.season),
    ]),
  ]
    .sort((left, right) => left - right)
    .map((season) => ({
      matchups: matchupCountBySeason.get(season) ?? 0,
      season,
      teams: teamCountBySeason.get(season) ?? 0,
    }));

  return {
    catalog: scoped.catalog,
    checks: scoped.checks,
    currentSync,
    flaggedMappings: scoped.flaggedMappings,
    history,
    league: leagueRow,
    notes,
    personNames: scoped.personNames,
    seasons,
    stats,
    totalMatchups: seasons.reduce(
      (total, season) => total + season.matchups,
      0,
    ),
  };
}

function renderSummary(data: SummaryData): string {
  const lines: string[] = [];
  const biggestBlowout = data.catalog.blowouts.biggest[0] ?? null;
  const longestWinStreak = data.catalog.streaks.longestWins[0] ?? null;
  const longestLossStreak = data.catalog.streaks.longestLosses[0] ?? null;
  const highestScore = data.catalog.highLow.highestScores[0] ?? null;

  lines.push("# Real ESPN League Import Summary");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## League");
  lines.push("");
  lines.push(`- League: ${data.league.name}`);
  lines.push(`- Provider league id: ${data.league.providerLeagueId}`);
  lines.push(`- Local league id: ${data.league.id}`);
  lines.push(`- Current season: ${data.league.season}`);
  lines.push("");
  lines.push("## Import Run");
  lines.push("");
  lines.push(
    `- Historical requested seasons: ${data.history.requested.join(", ") || "none"}`,
  );
  lines.push(
    `- Historical imported this run: ${data.history.imported.join(", ") || "none"}`,
  );
  lines.push(
    `- Historical skipped by checkpoint: ${data.history.skipped.join(", ") || "none"}`,
  );
  lines.push(
    `- Current sync: league changed ${data.currentSync.leagueChanged}; teams ${data.currentSync.teams.changed}/${data.currentSync.teams.total}; members ${data.currentSync.members.changed}/${data.currentSync.members.total}; matchups ${data.currentSync.matchups.changed}/${data.currentSync.matchups.total}; transactions ${data.currentSync.transactions.changed}/${data.currentSync.transactions.total}`,
  );
  lines.push(
    `- Recompute: weekly ${data.stats.weeklyStatistics}; season ${data.stats.seasonStatistics}; h2h ${data.stats.headToHeadRecords}; records ${data.stats.records}; record-book aggregates ${data.stats.recordBookAggregates}; integrity checks ${data.stats.integrityChecks}; integrity failures ${data.stats.integrityFailures}`,
  );
  lines.push("");
  lines.push("## Seasons Imported");
  lines.push("");
  lines.push("| Season | Teams | Matchups |");
  lines.push("| --- | ---: | ---: |");
  for (const season of data.seasons) {
    lines.push(`| ${season.season} | ${season.teams} | ${season.matchups} |`);
  }
  lines.push("");
  lines.push(`Total matchups: ${data.totalMatchups}`);
  lines.push("");
  lines.push("## Persons");
  lines.push("");
  lines.push(`Count: ${data.personNames.length}`);
  lines.push("");
  for (const name of data.personNames) {
    lines.push(`- ${name}`);
  }
  lines.push("");
  lines.push("## Identity Mappings Flagged For Review");
  lines.push("");
  if (data.flaggedMappings.length === 0) {
    lines.push("No mappings had confidence < 0.9 or method = fuzzy.");
  } else {
    lines.push(
      "| Season | Person | Team | Owner names | Provider team id | Method | Confidence |",
    );
    lines.push("| --- | --- | --- | --- | --- | --- | ---: |");
    for (const mapping of data.flaggedMappings) {
      lines.push(
        `| ${mapping.season} | ${tableCell(mapping.personName)} | ${tableCell(mapping.teamName)} | ${tableCell(mapping.ownerNames.join(", "))} | ${tableCell(mapping.providerTeamId)} | ${mapping.method} | ${mapping.confidence.toFixed(4)} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Data Integrity Checks");
  lines.push("");
  if (data.checks.length === 0) {
    lines.push("No data_integrity_check rows were present.");
  } else {
    lines.push("| Check | Status | Season | Detail |");
    lines.push("| --- | --- | --- | --- |");
    for (const check of data.checks) {
      lines.push(
        `| ${check.checkKey} | ${check.status} | ${check.season ?? "all"} | \`${tableCell(stableJson(check.detail))}\` |`,
      );
    }
  }
  lines.push("");
  lines.push("## Record Samples");
  lines.push("");
  lines.push("### All-Time Standings Top 5");
  lines.push("");
  lines.push("| Rank | Person | W-L-T | Win% | PF | PA | Championships |");
  lines.push("| ---: | --- | --- | ---: | ---: | ---: | ---: |");
  for (const standing of data.catalog.allTimeStandings.slice(0, 5)) {
    lines.push(
      `| ${standing.rank} | ${tableCell(standing.personName)} | ${standing.wins}-${standing.losses}-${standing.ties} | ${pct(standing.winPercentage)} | ${formatNumber(standing.pointsFor)} | ${formatNumber(standing.pointsAgainst)} | ${standing.championships} |`,
    );
  }
  if (data.catalog.allTimeStandings.length === 0) {
    lines.push("| n/a | No standings computed | n/a | n/a | n/a | n/a | n/a |");
  }
  lines.push("");
  lines.push("### Highlights");
  lines.push("");
  lines.push(
    `- Biggest blowout: ${
      biggestBlowout
        ? `${biggestBlowout.personName} over ${biggestBlowout.opponentName ?? "unknown"} by ${formatNumber(biggestBlowout.margin)} in ${biggestBlowout.season} week ${biggestBlowout.scoringPeriod}`
        : "n/a"
    }`,
  );
  lines.push(
    `- Longest win streak: ${
      longestWinStreak
        ? `${longestWinStreak.personName}, ${longestWinStreak.length} games (${longestWinStreak.startSeason} week ${longestWinStreak.startScoringPeriod} to ${longestWinStreak.endSeason} week ${longestWinStreak.endScoringPeriod})`
        : "n/a"
    }`,
  );
  lines.push(
    `- Longest loss streak: ${
      longestLossStreak
        ? `${longestLossStreak.personName}, ${longestLossStreak.length} games (${longestLossStreak.startSeason} week ${longestLossStreak.startScoringPeriod} to ${longestLossStreak.endSeason} week ${longestLossStreak.endScoringPeriod})`
        : "n/a"
    }`,
  );
  lines.push("");
  lines.push("### Most Championships");
  lines.push("");
  lines.push("| Person | Championships | Runner-ups | Seasons |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const row of data.catalog.championships.managerRecords
    .filter((record) => record.championships > 0)
    .slice(0, 5)) {
    lines.push(
      `| ${tableCell(row.personName)} | ${row.championships} | ${row.runnerUps} | ${row.seasons} |`,
    );
  }
  if (
    data.catalog.championships.managerRecords.filter(
      (record) => record.championships > 0,
    ).length === 0
  ) {
    lines.push("| No championships computed | 0 | 0 | 0 |");
  }
  lines.push("");
  lines.push(
    `- Highest single-week score: ${
      highestScore
        ? `${highestScore.personName}, ${formatScore(highestScore.value)} in ${highestScore.season} week ${highestScore.scoringPeriod}`
        : "n/a"
    }`,
  );
  lines.push("");
  lines.push("## Errors And Anomalies");
  lines.push("");
  if (data.notes.length === 0 && data.stats.integrityFailures === 0) {
    lines.push("No import/runtime errors or integrity failures were observed.");
  } else {
    for (const note of data.notes) {
      lines.push(`- ${note.label}: ${note.detail}`);
    }
    if (data.stats.integrityFailures > 0) {
      lines.push(
        `- Data integrity failures present: ${data.stats.integrityFailures}. See Data Integrity Checks above for exact rows.`,
      );
    }
  }
  lines.push("");

  return redactText(`${lines.join("\n")}\n`);
}

async function main(): Promise<void> {
  const notes: ImportNote[] = [];
  await loadEnvFile(envFilePath());

  const db = getDb();
  const handle = getDbHandle();
  const realtime = new NoopRealtimePublisher();
  const { credentials, providerLeagueId, season } = requireEspnConfig();
  const provider = createEspnDiscoveryProvider({
    fetch: createHistoryNormalizingFetch(notes),
  });

  console.log("Applying database migrations...");
  await migrateSerialized(handle);
  await resetPreviousVerificationState({ notes, providerLeagueId });

  console.log("Authenticating ESPN session...");
  const auth = await provider.authenticate(credentials);
  if (!auth.ok) {
    throw new Error(
      `ESPN authentication failed: ${providerErrorSummary(auth.error)}`,
    );
  }
  const session = auth.value;
  const ref = await buildLeagueRef({
    notes,
    provider,
    providerLeagueId,
    season,
    session,
  });

  console.log("Importing historical ESPN seasons...");
  const historyResult = await importLeagueHistory({
    db,
    maxSeasons: HISTORY_MAX_SEASONS,
    now: () => new Date(),
    provider,
    realtime,
    ref,
    session,
  });
  if (!historyResult.ok) {
    throw new Error(
      `Historical import failed: ${providerErrorSummary(historyResult.error)}`,
    );
  }
  let combinedHistory = historyResult.value.seasons;
  const olderSeasons = olderHistoricalSeasons(season);
  if (olderSeasons.length > 0) {
    notes.push({
      detail:
        "importLeagueHistory currently clamps one call to 10 seasons; harness invoked a second explicit range through the same entry point for the remaining requested seasons.",
      label: "Historical import range workaround",
    });
    console.log("Importing older ESPN historical season range...");
    const olderHistoryResult = await importLeagueHistory({
      db,
      maxSeasons: olderSeasons.length,
      now: () => new Date(),
      provider,
      realtime,
      ref,
      seasons: olderSeasons,
      session,
    });
    if (!olderHistoryResult.ok) {
      throw new Error(
        `Older historical import failed: ${providerErrorSummary(olderHistoryResult.error)}`,
      );
    }
    combinedHistory = {
      imported: mergeSeasonLists(
        historyResult.value.seasons.imported,
        olderHistoryResult.value.seasons.imported,
      ),
      requested: mergeSeasonLists(
        historyResult.value.seasons.requested,
        olderHistoryResult.value.seasons.requested,
      ),
      skipped: mergeSeasonLists(
        historyResult.value.seasons.skipped,
        olderHistoryResult.value.seasons.skipped,
      ),
    };
  }

  console.log("Syncing current ESPN season...");
  const currentResult = await syncCurrentLeague({
    db,
    leagueId: historyResult.value.league.id,
    now: () => new Date(),
    provider,
    realtime,
    ref,
    session,
  });
  if (!currentResult.ok) {
    throw new Error(
      `Current season sync failed: ${providerErrorSummary(currentResult.error)}`,
    );
  }

  console.log("Recomputing identity, statistics, and records...");
  const stats = await recomputeLeagueStatistics(db, {
    leagueId: historyResult.value.league.id,
  });

  const summaryData = await collectSummaryData({
    currentSync: {
      changedFinalMatchups: currentResult.value.changedFinalMatchups.length,
      changedTransactions: currentResult.value.changedTransactions.length,
      leagueChanged: currentResult.value.league.changed,
      matchups: currentResult.value.matchups,
      members: currentResult.value.members,
      teams: currentResult.value.teams,
      transactions: currentResult.value.transactions,
    },
    history: combinedHistory,
    leagueId: historyResult.value.league.id,
    notes,
    stats,
  });
  const summary = renderSummary(summaryData);

  await mkdir(path.dirname(SUMMARY_PATH), { recursive: true });
  await writeFile(SUMMARY_PATH, summary, "utf8");
  await writeFile(
    TRACK_DONE_PATH,
    `real ESPN league ${providerLeagueId} imported and summarized at ${new Date().toISOString()}\n`,
    "utf8",
  );

  console.log(summary);
  console.log(`Summary written to ${SUMMARY_PATH}`);
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.stack || error.message : String(error);
    console.error(redactText(message));
    process.exitCode = 1;
  })
  .finally(async () => {
    await (globalThis as RuntimeDbGlobal).__rumbledoreDb?.pool.end();
  });
