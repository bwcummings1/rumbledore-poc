// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { dataIntegrityChecks, leagues } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { persistNormalizedLeagueRows } from "@/ingestion/current-league";
import {
  createEspnDiscoveryProvider,
  type EspnFetch,
  type EspnSession,
} from "@/providers/espn/client";
import type {
  NormalizedSeasonBundle,
  ProviderLeagueRef,
  ProviderResult,
} from "@/providers/model";
import { recomputeLeagueStatistics } from "@/stats/engine";
import {
  corpusContentHash,
  ESPN_CORPUS_VIEWS,
  HARVESTER_VERSION,
} from "../../../scripts/harvest-public-leagues";

const corpusRoot = resolve("test/fixtures/espn-corpus");
const corpusEntrySchema = z
  .object({
    payload: z.array(z.unknown()).length(1),
    provenance: z
      .object({
        contentHash: z.string().regex(/^[0-9a-f]{64}$/),
        fetchedAt: z.iso.datetime(),
        harvesterVersion: z.string().min(1),
        leagueIdHash: z.string().regex(/^[0-9a-f]{24}$/),
        season: z.number().int().min(1900).max(2100),
        view: z.enum(ESPN_CORPUS_VIEWS),
      })
      .strict(),
  })
  .strict();
const fakeSwid = "{00000000-0000-4000-8000-000000000047}";
const fakeEspnSessionValue = "fixture-corpus-session"; // ubs:ignore — fixture-only ESPN cookie value

type CorpusEntry = z.infer<typeof corpusEntrySchema>;

interface LoadedCorpusEntry {
  entry: CorpusEntry;
  path: string;
}

interface CorpusShape {
  entries: LoadedCorpusEntry[];
  label: string;
  leagueIdHash: string;
  season: number;
}

class CorpusReplayError extends Error {
  constructor(
    readonly leagueShape: string,
    readonly view: string,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(`[${leagueShape} / ${view}] ${message}`, options);
    this.name = "CorpusReplayError";
  }
}

let adminUrl: string;
let databaseName: string;
let handle: DbHandle | undefined;

function databaseUrlWithName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function quotedDatabaseName(name: string): string {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error("Generated corpus-oracle database name was unsafe");
  }
  return `"${name}"`;
}

function requireHandle(): DbHandle {
  if (!handle) {
    throw new Error("Corpus-oracle database was not initialized");
  }
  return handle;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function corpusJsonPaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      const relativePath = relative(directory, path);
      if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
        throw new Error(`Corpus entry escaped its directory: ${entry.name}`);
      }
      if (entry.isDirectory()) {
        return corpusJsonPaths(path);
      }
      return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
    })
    .sort();
}

function corpusPathParts(path: string): {
  leagueIdHash: string;
  season: number;
  view: string;
} {
  const pathParts = relative(corpusRoot, path).split(sep);
  if (pathParts.length !== 3) {
    throw new Error(
      `Corpus entry ${relative(corpusRoot, path)} must use <leagueHash>/<season>/<view>.json`,
    );
  }
  const [leagueIdHash, rawSeason, filename] = pathParts;
  if (!leagueIdHash || !rawSeason || !filename) {
    throw new Error(`Corpus entry ${path} had an incomplete path`);
  }
  const season = Number(rawSeason);
  return {
    leagueIdHash,
    season,
    view: basename(filename, ".json"),
  };
}

function parseCorpusEntry(path: string): LoadedCorpusEntry {
  const parts = corpusPathParts(path);
  const label = `${parts.leagueIdHash}/${parts.season}`;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (cause) {
    throw new CorpusReplayError(
      label,
      parts.view,
      "corpus file was not valid JSON",
      { cause },
    );
  }

  const parsed = corpusEntrySchema.safeParse(json);
  if (!parsed.success) {
    throw new CorpusReplayError(
      label,
      parts.view,
      "corpus provenance envelope did not match its zod schema",
      { cause: parsed.error },
    );
  }
  const { provenance } = parsed.data;
  if (
    provenance.leagueIdHash !== parts.leagueIdHash ||
    provenance.season !== parts.season ||
    provenance.view !== parts.view
  ) {
    throw new CorpusReplayError(
      label,
      parts.view,
      "path did not match the provenance header",
    );
  }
  if (provenance.harvesterVersion !== HARVESTER_VERSION) {
    throw new CorpusReplayError(
      label,
      parts.view,
      `harvester version ${provenance.harvesterVersion} is not replayable by ${HARVESTER_VERSION}`,
    );
  }
  if (provenance.contentHash !== corpusContentHash(parsed.data.payload)) {
    throw new CorpusReplayError(
      label,
      parts.view,
      "payload content hash did not match its provenance header",
    );
  }
  return { entry: parsed.data, path };
}

function loadCorpusShapes(): CorpusShape[] {
  const paths = corpusJsonPaths(corpusRoot);
  if (paths.length === 0) {
    throw new Error("ESPN corpus oracle found no vendored entries");
  }
  const entries = paths.map(parseCorpusEntry);
  const groups = new Map<string, LoadedCorpusEntry[]>();
  for (const loaded of entries) {
    const { leagueIdHash, season } = loaded.entry.provenance;
    const key = `${leagueIdHash}/${season}`;
    groups.set(key, [...(groups.get(key) ?? []), loaded]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, shapeEntries]) => {
      const actualViews = shapeEntries
        .map(({ entry }) => entry.provenance.view)
        .sort();
      const expectedViews = [...ESPN_CORPUS_VIEWS].sort();
      if (JSON.stringify(actualViews) !== JSON.stringify(expectedViews)) {
        throw new Error(
          `Corpus shape ${label} must contain exactly ${ESPN_CORPUS_VIEWS.join(", ")}; found ${actualViews.join(", ")}`,
        );
      }
      const [leagueIdHash, rawSeason] = label.split("/");
      if (!leagueIdHash || !rawSeason) {
        throw new Error(`Corpus shape label ${label} was invalid`);
      }
      return {
        entries: shapeEntries,
        label,
        leagueIdHash,
        season: Number(rawSeason),
      };
    });
}

function singleLeaguePayload(
  shape: CorpusShape,
  loaded: LoadedCorpusEntry,
): Record<string, unknown> {
  const [league] = loaded.entry.payload;
  if (!isRecord(league)) {
    throw new CorpusReplayError(
      shape.label,
      loaded.entry.provenance.view,
      "historical view payload did not contain one league object",
    );
  }
  return league;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function fixtureSession(): EspnSession {
  return {
    authKind: "cookie",
    espn_s2: fakeEspnSessionValue,
    provider: "espn",
    subjectProviderId: fakeSwid,
    swid: fakeSwid,
  };
}

function providerRef(
  payload: Record<string, unknown>,
  shape: CorpusShape,
): ProviderLeagueRef {
  return {
    name: `Corpus ${shape.label}`,
    provider: "espn",
    providerId: String(payload.id),
    season: shape.season,
    sport: "ffl",
  };
}

function providerForPayload(
  historyPayload: unknown,
  currentPayload: unknown,
): ReturnType<typeof createEspnDiscoveryProvider> {
  const fetch: EspnFetch = async (input) => {
    const url = new URL(input.toString());
    return jsonResponse(
      url.pathname.includes("/leagueHistory/")
        ? historyPayload
        : currentPayload,
    );
  };
  return createEspnDiscoveryProvider({
    fetch,
    maxAttempts: 1,
    retryDelayMs: 0,
  });
}

function unwrapProviderResult<T>(
  result: ProviderResult<T>,
  shape: CorpusShape,
  view: string,
): T {
  if (!result.ok) {
    throw new CorpusReplayError(
      shape.label,
      view,
      "ESPN zod parse or view normalization failed",
      { cause: result.error },
    );
  }
  return result.value;
}

async function parseAndNormalizeView(
  shape: CorpusShape,
  loaded: LoadedCorpusEntry,
): Promise<void> {
  const { payload, provenance } = loaded.entry;
  const league = singleLeaguePayload(shape, loaded);
  const provider = providerForPayload(payload, league);
  const ref = providerRef(league, shape);
  const session = fixtureSession();

  try {
    if (provenance.view === "mSettings") {
      unwrapProviderResult(
        await provider.getLeague(session, ref),
        shape,
        provenance.view,
      );
      return;
    }
    if (provenance.view === "mTeam") {
      unwrapProviderResult(
        await provider.getTeams(session, ref),
        shape,
        provenance.view,
      );
      return;
    }
    if (provenance.view === "mMatchupScore") {
      unwrapProviderResult(
        await provider.getMatchups(session, ref, 1),
        shape,
        provenance.view,
      );
      return;
    }
    if (
      provenance.view === "mBoxscore" ||
      provenance.view === "mRoster" ||
      provenance.view === "kona_player_info"
    ) {
      unwrapProviderResult(
        await provider.getRosters(session, ref, 1),
        shape,
        provenance.view,
      );
      return;
    }
    if (provenance.view === "mDraftDetail") {
      if (!provider.getDraftPicks) {
        throw new CorpusReplayError(
          shape.label,
          provenance.view,
          "ESPN provider did not expose draft normalization",
        );
      }
      unwrapProviderResult(
        await provider.getDraftPicks(session, ref),
        shape,
        provenance.view,
      );
      return;
    }
    unwrapProviderResult(
      await provider.getTransactions(session, ref, 1),
      shape,
      provenance.view,
    );
  } catch (cause) {
    if (cause instanceof CorpusReplayError) {
      throw cause;
    }
    throw new CorpusReplayError(
      shape.label,
      provenance.view,
      "view replay threw outside the provider result contract",
      { cause },
    );
  }
}

function mergeCorpusValues(left: unknown, right: unknown): unknown {
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    return Array.from({ length }, (_, index) => {
      if (index >= left.length) return structuredClone(right[index]);
      if (index >= right.length) return structuredClone(left[index]);
      return mergeCorpusValues(left[index], right[index]);
    });
  }
  if (isRecord(left) && isRecord(right)) {
    const merged: Record<string, unknown> = structuredClone(left);
    for (const [key, value] of Object.entries(right)) {
      merged[key] =
        key in merged
          ? mergeCorpusValues(merged[key], value)
          : structuredClone(value);
    }
    return merged;
  }
  return structuredClone(right);
}

function compositeLeaguePayload(shape: CorpusShape): Record<string, unknown> {
  let composite: unknown = {};
  for (const view of ESPN_CORPUS_VIEWS) {
    const loaded = shape.entries.find(
      ({ entry }) => entry.provenance.view === view,
    );
    if (!loaded) {
      throw new CorpusReplayError(shape.label, view, "view file was missing");
    }
    composite = mergeCorpusValues(
      composite,
      singleLeaguePayload(shape, loaded),
    );
  }
  if (!isRecord(composite)) {
    throw new Error(`Corpus shape ${shape.label} could not be composed`);
  }
  return composite;
}

async function normalizeCorpusShape(
  shape: CorpusShape,
): Promise<NormalizedSeasonBundle> {
  for (const loaded of shape.entries) {
    if (
      loaded.entry.provenance.contentHash !==
      corpusContentHash(loaded.entry.payload)
    ) {
      throw new CorpusReplayError(
        shape.label,
        loaded.entry.provenance.view,
        "payload content hash changed before replay",
      );
    }
    await parseAndNormalizeView(shape, loaded);
  }

  const composite = compositeLeaguePayload(shape);
  const provider = providerForPayload([composite], composite);
  const result = await provider.getHistory(
    fixtureSession(),
    providerRef(composite, shape),
    { seasons: [shape.season] },
  );
  const bundles = unwrapProviderResult(
    result,
    shape,
    "composite-importer-views",
  );
  const bundle = bundles.find(
    (candidate) => candidate.league.season === shape.season,
  );
  if (!bundle) {
    throw new CorpusReplayError(
      shape.label,
      "composite-importer-views",
      "normalization returned no bundle for the corpus season",
    );
  }
  return bundle;
}

async function persistAndCheckShape(
  shape: CorpusShape,
  bundle: NormalizedSeasonBundle,
): Promise<void> {
  const db = requireHandle().db;
  const [league] = await db
    .insert(leagues)
    .values({
      currentScoringPeriod: bundle.league.currentScoringPeriod,
      name: bundle.league.name,
      provider: "espn",
      providerLeagueId: `fixture-corpus-${shape.leagueIdHash}-${shape.season}`,
      scoringType: bundle.league.scoringType,
      season: bundle.league.season,
      size: bundle.league.size,
      sport: "ffl",
      status: bundle.league.status,
    })
    .returning({ id: leagues.id });
  if (!league) {
    throw new Error(`Corpus shape ${shape.label} league was not created`);
  }

  try {
    await persistNormalizedLeagueRows({
      db,
      draftPicks: bundle.draftPicks ?? [],
      finalStandings: bundle.finalStandings,
      league: bundle.league,
      leagueId: league.id,
      leagueProviderId: bundle.league.providerId,
      matchups: bundle.matchups,
      members: bundle.members,
      players: bundle.players ?? [],
      reconcileSeasons: {
        draftPicks: [shape.season],
        members: [shape.season],
        rosters: [shape.season],
        teams: [shape.season],
        transactions: [shape.season],
      },
      rosters: bundle.rosters ?? [],
      teams: bundle.teams,
      transactions: bundle.transactions,
    });

    const recomputed = await recomputeLeagueStatistics(db, {
      leagueId: league.id,
    });
    expect(recomputed.integrityChecks, shape.label).toBeGreaterThan(0);

    const decoding = await withLeagueContext(db, league.id, (tx) =>
      tx.query.dataIntegrityChecks.findFirst({
        where: and(
          eq(dataIntegrityChecks.leagueId, league.id),
          eq(dataIntegrityChecks.checkKey, "provider_code_decoding"),
        ),
      }),
    );
    expect(decoding, shape.label).toMatchObject({
      detail: {
        checkedProviders: ["espn"],
        issues: [],
        observedCodeCounts: {
          espn: {
            activities: 1,
            lineupSlots: expect.any(Number),
            positions: 1,
            proTeams: 1,
            scoringStats: 1,
          },
        },
      },
      status: "pass",
    });
    const detail = decoding?.detail as
      | { observedCodeCounts?: { espn?: { lineupSlots?: number } } }
      | undefined;
    expect(
      detail?.observedCodeCounts?.espn?.lineupSlots,
      `${shape.label} lineup-slot decode coverage`,
    ).toBeGreaterThan(0);
  } catch (cause) {
    if (cause instanceof CorpusReplayError) {
      throw cause;
    }
    throw new CorpusReplayError(
      shape.label,
      "normalized-bundle",
      "persistence, reconciliation, or integrity drafting failed",
      { cause },
    );
  }
}

async function replayCorpusShape(shape: CorpusShape): Promise<void> {
  const bundle = await normalizeCorpusShape(shape);
  await persistAndCheckShape(shape, bundle);
}

beforeAll(async () => {
  const baseDatabaseUrl = parseEnv(process.env).databaseUrl;
  databaseName = `rumbledore_corpus_oracle_${randomUUID().replaceAll("-", "")}`;
  adminUrl = databaseUrlWithName(baseDatabaseUrl, "postgres");
  const adminPool = new Pool({ connectionString: adminUrl });
  try {
    await adminPool.query(
      `create database ${quotedDatabaseName(databaseName)}`,
    );
  } catch (cause) {
    throw new Error(
      "Postgres could not create an isolated ESPN corpus-oracle database.",
      { cause },
    );
  } finally {
    await adminPool.end();
  }
  handle = createDb(databaseUrlWithName(baseDatabaseUrl, databaseName));
  await migrateSerialized(handle);
});

afterAll(async () => {
  if (!handle) return;
  await handle.pool.end();
  const adminPool = new Pool({ connectionString: adminUrl });
  try {
    await adminPool.query(
      `drop database if exists ${quotedDatabaseName(databaseName)}`,
    );
  } finally {
    await adminPool.end();
  }
});

describe("vendored ESPN corpus replay oracle", () => {
  it("zod-parses, normalizes, persists, reconciles, and integrity-checks every shape", async () => {
    const shapes = loadCorpusShapes();
    for (const shape of shapes) {
      await replayCorpusShape(shape);
    }
  });

  it("attributes a deliberately malformed corpus payload to its league shape and view", async () => {
    const [source] = loadCorpusShapes();
    if (!source) {
      throw new Error("Malformed corpus regression requires one source shape");
    }
    const mutated = structuredClone(source) as CorpusShape;
    const settingsEntry = mutated.entries.find(
      ({ entry }) => entry.provenance.view === "mSettings",
    );
    if (!settingsEntry) {
      throw new Error("Malformed corpus regression requires mSettings");
    }
    const settingsLeague = singleLeaguePayload(mutated, settingsEntry);
    const settings = settingsLeague.settings;
    if (!isRecord(settings) || !isRecord(settings.scheduleSettings)) {
      throw new Error("Malformed corpus regression requires schedule settings");
    }
    settings.scheduleSettings.matchupPeriodCount = { malformed: true };
    settingsEntry.entry.provenance.contentHash = corpusContentHash(
      settingsEntry.entry.payload,
    );

    await expect(normalizeCorpusShape(mutated)).rejects.toMatchObject({
      leagueShape: source.label,
      name: "CorpusReplayError",
      view: "mSettings",
    });
    await expect(normalizeCorpusShape(mutated)).rejects.toThrow(
      `[${source.label} / mSettings]`,
    );
  });
});
