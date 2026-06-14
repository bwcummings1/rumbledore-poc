import { and, eq, sql } from "drizzle-orm";
import { err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  type HistoricalImportCheckpoint,
  type HistoricalImportCheckpointCursor,
  historicalImportCheckpoints,
  leagues,
} from "@/db/schema";
import type {
  FantasyProvider,
  FantasyProviderSession,
  NormalizedSeasonBundle,
  ProviderError,
  ProviderLeagueRef,
} from "@/providers";
import {
  type DataCoverageObservationMap,
  type EntitySyncStats,
  persistNormalizedLeagueRows,
  recordDataCoverage,
} from "./current-league";

export type HistoricalImportProvider<Session extends FantasyProviderSession> =
  Pick<FantasyProvider<unknown, Session>, "capabilities" | "getHistory">;

export interface HistoricalImportInput<Session extends FantasyProviderSession> {
  db: Db;
  provider: HistoricalImportProvider<Session>;
  ref: ProviderLeagueRef;
  session: Session;
  seasons?: number[];
  maxSeasons?: number;
}

export interface HistoricalImportResult {
  league: {
    id: string;
    provider: ProviderLeagueRef["provider"];
    providerLeagueId: string;
    currentSeason: number;
  };
  seasons: {
    requested: number[];
    imported: number[];
    skipped: number[];
  };
  teams: EntitySyncStats;
  members: EntitySyncStats;
  matchups: EntitySyncStats;
  finalStandings: EntitySyncStats;
  transactions: EntitySyncStats;
  checkpoint: {
    status: "running" | "completed" | "failed";
    lastCompletedSeason: number | null;
    nextSeason: number | null;
    seasonsCompleted: number;
    seasonsTotal: number;
  };
}

export type HistoricalImportError = ProviderError;

type LeagueRoot = { id: string; created: boolean };

function emptyStats(): EntitySyncStats {
  return { total: 0, changed: 0, unchanged: 0 };
}

function addStats(
  left: EntitySyncStats,
  right: EntitySyncStats,
): EntitySyncStats {
  return {
    total: left.total + right.total,
    changed: left.changed + right.changed,
    unchanged: left.unchanged + right.unchanged,
  };
}

function normalizeRequestedSeasons({
  currentSeason,
  maxSeasons,
  seasons,
}: {
  currentSeason: number;
  maxSeasons?: number;
  seasons?: number[];
}): number[] {
  const limit = Math.max(1, Math.min(10, maxSeasons ?? 10));
  const requested =
    seasons && seasons.length > 0
      ? seasons
      : Array.from({ length: limit }, (_, index) => currentSeason - index - 1);

  return [...new Set(requested)]
    .filter((season) => Number.isInteger(season) && season > 0)
    .sort((left, right) => right - left)
    .slice(0, limit);
}

function normalizeSeasonList(seasons: readonly number[]): number[] {
  return [...new Set(seasons)]
    .filter((season) => Number.isInteger(season) && season > 0)
    .sort((left, right) => right - left);
}

function checkpointCursor(
  checkpoint: HistoricalImportCheckpoint | undefined,
): HistoricalImportCheckpointCursor {
  return checkpoint?.cursor ?? {};
}

function buildCheckpointCursor({
  completedSeasons,
  exhaustedBeforeSeason,
  requestedSeasons,
}: {
  completedSeasons: readonly number[];
  exhaustedBeforeSeason?: number;
  requestedSeasons: readonly number[];
}): HistoricalImportCheckpointCursor {
  return {
    completedSeasons: normalizeSeasonList(completedSeasons),
    requestedSeasons: normalizeSeasonList(requestedSeasons),
    ...(exhaustedBeforeSeason === undefined
      ? {}
      : {
          exhaustedBeforeSeason,
          exhaustionReason: "provider_empty" as const,
        }),
  };
}

function completedSeasonsFor(
  checkpoint: HistoricalImportCheckpoint | undefined,
  seasons: readonly number[],
): Set<number> {
  if (!checkpoint) {
    return new Set();
  }

  const requested = new Set(seasons);
  const cursorCompleted = normalizeSeasonList(
    checkpointCursor(checkpoint).completedSeasons ?? [],
  ).filter((season) => requested.has(season));
  if (cursorCompleted.length > 0) {
    return new Set(cursorCompleted);
  }

  if (
    !checkpoint.lastCompletedSeason ||
    checkpoint.startSeason !== seasons[0]
  ) {
    return new Set();
  }

  const completedThroughIndex = seasons.indexOf(checkpoint.lastCompletedSeason);
  if (completedThroughIndex !== -1) {
    return new Set(seasons.slice(0, completedThroughIndex + 1));
  }

  const oldestRequested = seasons.at(-1);
  if (
    checkpoint.status === "completed" &&
    oldestRequested !== undefined &&
    checkpoint.lastCompletedSeason <= oldestRequested
  ) {
    return new Set(seasons);
  }

  return new Set();
}

function firstIncompleteSeason(
  seasons: readonly number[],
  completedSeasons: ReadonlySet<number>,
): number | null {
  return seasons.find((season) => !completedSeasons.has(season)) ?? null;
}

function isCompleteForRequest(
  checkpoint: HistoricalImportCheckpoint | undefined,
  seasons: readonly number[],
  completedSeasons: ReadonlySet<number>,
): checkpoint is HistoricalImportCheckpoint {
  if (!checkpoint || checkpoint.status !== "completed") {
    return false;
  }

  const cursor = checkpointCursor(checkpoint);
  return seasons.every(
    (season) =>
      completedSeasons.has(season) ||
      (cursor.exhaustedBeforeSeason !== undefined &&
        season <= cursor.exhaustedBeforeSeason),
  );
}

async function ensureLeagueRoot(
  db: Db,
  ref: ProviderLeagueRef,
): Promise<LeagueRoot> {
  const [inserted] = await db
    .insert(leagues)
    .values({
      currentScoringPeriod: 0,
      name: ref.name,
      provider: ref.provider,
      providerLeagueId: ref.providerId,
      scoringType: "unknown",
      season: ref.season,
      size: ref.size ?? 0,
      sport: ref.sport,
      status: "unknown",
    })
    .onConflictDoNothing({
      target: [leagues.provider, leagues.providerLeagueId],
    })
    .returning({ id: leagues.id });

  if (inserted) {
    return { id: inserted.id, created: true };
  }

  const [existing] = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(
      and(
        eq(leagues.provider, ref.provider),
        eq(leagues.providerLeagueId, ref.providerId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("historical import could not resolve the target league");
  }

  return { id: existing.id, created: false };
}

async function selectCheckpoint({
  db,
  leagueId,
  ref,
}: {
  db: Db;
  leagueId: string;
  ref: ProviderLeagueRef;
}): Promise<HistoricalImportCheckpoint | undefined> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const [checkpoint] = await tx
      .select()
      .from(historicalImportCheckpoints)
      .where(
        and(
          eq(historicalImportCheckpoints.leagueId, leagueId),
          eq(historicalImportCheckpoints.provider, ref.provider),
          eq(historicalImportCheckpoints.providerLeagueId, ref.providerId),
        ),
      )
      .limit(1);

    return checkpoint;
  });
}

async function upsertCheckpoint({
  db,
  leagueId,
  ref,
  seasons,
  status,
}: {
  db: Db;
  leagueId: string;
  ref: ProviderLeagueRef;
  seasons: readonly number[];
  status: "running" | "completed";
}): Promise<HistoricalImportCheckpoint> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const [checkpoint] = await tx
      .insert(historicalImportCheckpoints)
      .values({
        cursor: buildCheckpointCursor({
          completedSeasons: [],
          requestedSeasons: seasons,
        }),
        endSeason: seasons.at(-1) ?? ref.season,
        errorCode: null,
        errorMessage: null,
        lastCompletedSeason: null,
        leagueId,
        nextSeason: seasons[0] ?? null,
        provider: ref.provider,
        providerLeagueId: ref.providerId,
        seasonsCompleted: 0,
        seasonsTotal: seasons.length,
        startSeason: seasons[0] ?? ref.season,
        status,
      })
      .onConflictDoUpdate({
        target: [
          historicalImportCheckpoints.leagueId,
          historicalImportCheckpoints.provider,
          historicalImportCheckpoints.providerLeagueId,
        ],
        set: {
          endSeason: sql`excluded.end_season`,
          errorCode: null,
          errorMessage: null,
          cursor: sql`excluded.cursor`,
          lastCompletedSeason: null,
          nextSeason: sql`excluded.next_season`,
          seasonsCompleted: 0,
          seasonsTotal: sql`excluded.seasons_total`,
          startSeason: sql`excluded.start_season`,
          status,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    if (!checkpoint) {
      throw new Error("historical import checkpoint was not persisted");
    }

    return checkpoint;
  });
}

async function markCheckpointRangeRunning({
  completedSeasons,
  db,
  leagueId,
  nextSeason,
  ref,
  seasons,
}: {
  completedSeasons: readonly number[];
  db: Db;
  leagueId: string;
  nextSeason: number | null;
  ref: ProviderLeagueRef;
  seasons: readonly number[];
}): Promise<HistoricalImportCheckpoint> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const [checkpoint] = await tx
      .update(historicalImportCheckpoints)
      .set({
        cursor: buildCheckpointCursor({
          completedSeasons,
          requestedSeasons: seasons,
        }),
        endSeason: seasons.at(-1) ?? ref.season,
        errorCode: null,
        errorMessage: null,
        nextSeason,
        seasonsCompleted: completedSeasons.length,
        seasonsTotal: seasons.length,
        startSeason: seasons[0] ?? ref.season,
        status: "running",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(historicalImportCheckpoints.leagueId, leagueId),
          eq(historicalImportCheckpoints.provider, ref.provider),
          eq(historicalImportCheckpoints.providerLeagueId, ref.providerId),
        ),
      )
      .returning();

    if (!checkpoint) {
      throw new Error("historical import checkpoint was not updated");
    }

    return checkpoint;
  });
}

async function markCheckpointProgress({
  completedSeasons,
  db,
  lastCompletedSeason,
  leagueId,
  nextSeason,
  ref,
  seasons,
}: {
  completedSeasons: readonly number[];
  db: Db;
  lastCompletedSeason: number;
  leagueId: string;
  nextSeason: number | null;
  ref: ProviderLeagueRef;
  seasons: readonly number[];
}): Promise<HistoricalImportCheckpoint> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const [checkpoint] = await tx
      .update(historicalImportCheckpoints)
      .set({
        cursor: buildCheckpointCursor({
          completedSeasons,
          requestedSeasons: seasons,
        }),
        endSeason: seasons.at(-1) ?? ref.season,
        errorCode: null,
        errorMessage: null,
        lastCompletedSeason,
        nextSeason,
        seasonsCompleted: completedSeasons.length,
        seasonsTotal: seasons.length,
        startSeason: seasons[0] ?? ref.season,
        status: nextSeason === null ? "completed" : "running",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(historicalImportCheckpoints.leagueId, leagueId),
          eq(historicalImportCheckpoints.provider, ref.provider),
          eq(historicalImportCheckpoints.providerLeagueId, ref.providerId),
        ),
      )
      .returning();

    if (!checkpoint) {
      throw new Error("historical import checkpoint was not updated");
    }

    return checkpoint;
  });
}

async function markCheckpointFailed({
  db,
  error,
  leagueId,
  nextSeason,
  ref,
}: {
  db: Db;
  error: ProviderError;
  leagueId: string;
  nextSeason: number;
  ref: ProviderLeagueRef;
}): Promise<void> {
  await withLeagueContext(db, leagueId, (tx) =>
    tx
      .update(historicalImportCheckpoints)
      .set({
        errorCode: error.code,
        errorMessage: error.message,
        nextSeason,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(historicalImportCheckpoints.leagueId, leagueId),
          eq(historicalImportCheckpoints.provider, ref.provider),
          eq(historicalImportCheckpoints.providerLeagueId, ref.providerId),
        ),
      ),
  );
}

async function markCheckpointExhausted({
  completedSeasons,
  db,
  exhaustedBeforeSeason,
  leagueId,
  lastCompletedSeason,
  ref,
  seasons,
}: {
  completedSeasons: readonly number[];
  db: Db;
  exhaustedBeforeSeason: number;
  leagueId: string;
  lastCompletedSeason: number | null;
  ref: ProviderLeagueRef;
  seasons: readonly number[];
}): Promise<HistoricalImportCheckpoint> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const [checkpoint] = await tx
      .update(historicalImportCheckpoints)
      .set({
        cursor: buildCheckpointCursor({
          completedSeasons,
          exhaustedBeforeSeason,
          requestedSeasons: seasons,
        }),
        endSeason:
          completedSeasons.at(-1) ?? seasons[0] ?? exhaustedBeforeSeason,
        errorCode: null,
        errorMessage: null,
        lastCompletedSeason,
        nextSeason: null,
        seasonsCompleted: completedSeasons.length,
        seasonsTotal: completedSeasons.length,
        status: "completed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(historicalImportCheckpoints.leagueId, leagueId),
          eq(historicalImportCheckpoints.provider, ref.provider),
          eq(historicalImportCheckpoints.providerLeagueId, ref.providerId),
        ),
      )
      .returning();

    if (!checkpoint) {
      throw new Error("historical import checkpoint was not updated");
    }

    return checkpoint;
  });
}

async function persistBundle({
  bundle,
  db,
  leagueId,
}: {
  bundle: NormalizedSeasonBundle;
  db: Db;
  leagueId: string;
}) {
  return persistNormalizedLeagueRows({
    db,
    finalStandings: bundle.finalStandings,
    leagueId,
    leagueProviderId: bundle.league.providerId,
    matchups: bundle.matchups,
    members: bundle.members,
    teams: bundle.teams,
    transactions: bundle.transactions,
  });
}

function coverageForBundle(
  bundle: NormalizedSeasonBundle,
): DataCoverageObservationMap {
  return {
    league: { itemCount: 1 },
    teams: { itemCount: bundle.teams.length },
    members: { itemCount: bundle.members.length },
    matchups: { itemCount: bundle.matchups.length },
    final_standings: { itemCount: bundle.finalStandings.length },
    transactions: { itemCount: bundle.transactions.length },
    history: { itemCount: 1 },
    scoring_detail: {
      details: { source: "history.league.scoringType" },
      itemCount: 1,
    },
  };
}

export async function importLeagueHistory<
  Session extends FantasyProviderSession,
>({
  db,
  maxSeasons,
  provider,
  ref,
  seasons: inputSeasons,
  session,
}: HistoricalImportInput<Session>): Promise<
  Result<HistoricalImportResult, HistoricalImportError>
> {
  const seasons = normalizeRequestedSeasons({
    currentSeason: ref.season,
    maxSeasons,
    seasons: inputSeasons,
  });
  const league = await ensureLeagueRoot(db, ref);
  const checkpoint = await selectCheckpoint({ db, leagueId: league.id, ref });
  const canReuseCheckpoint = checkpoint?.startSeason === seasons[0];
  const completedSeasons = completedSeasonsFor(
    canReuseCheckpoint ? checkpoint : undefined,
    seasons,
  );

  if (
    canReuseCheckpoint &&
    isCompleteForRequest(checkpoint, seasons, completedSeasons)
  ) {
    const completedCheckpoint = checkpoint;
    return ok({
      league: {
        id: league.id,
        provider: ref.provider,
        providerLeagueId: ref.providerId,
        currentSeason: ref.season,
      },
      seasons: {
        requested: seasons,
        imported: [],
        skipped: seasons,
      },
      teams: emptyStats(),
      members: emptyStats(),
      matchups: emptyStats(),
      finalStandings: emptyStats(),
      transactions: emptyStats(),
      checkpoint: {
        status: completedCheckpoint.status,
        lastCompletedSeason: completedCheckpoint.lastCompletedSeason,
        nextSeason: completedCheckpoint.nextSeason,
        seasonsCompleted: completedCheckpoint.seasonsCompleted,
        seasonsTotal: completedCheckpoint.seasonsTotal,
      },
    });
  }

  let activeCheckpoint: HistoricalImportCheckpoint;
  if (canReuseCheckpoint) {
    if (!checkpoint) {
      throw new Error("historical import checkpoint was not loaded");
    }
    activeCheckpoint = await markCheckpointRangeRunning({
      completedSeasons: [...completedSeasons],
      db,
      leagueId: league.id,
      nextSeason: firstIncompleteSeason(seasons, completedSeasons),
      ref,
      seasons,
    });
  } else {
    activeCheckpoint = await upsertCheckpoint({
      db,
      leagueId: league.id,
      ref,
      seasons,
      status: "running",
    });
  }

  const completed = completedSeasonsFor(activeCheckpoint, seasons);
  const skipped = seasons.filter((season) => completed.has(season));
  const imported: number[] = [];
  let teams = emptyStats();
  let members = emptyStats();
  let matchups = emptyStats();
  let finalStandings = emptyStats();
  let transactions = emptyStats();
  let latestCheckpoint = activeCheckpoint;

  for (let index = 0; index < seasons.length; index += 1) {
    const season = seasons[index];
    if (completed.has(season)) {
      continue;
    }

    const history = await provider.getHistory(session, ref, {
      seasons: [season],
    });

    if (!history.ok) {
      await markCheckpointFailed({
        db,
        error: history.error,
        leagueId: league.id,
        nextSeason: season,
        ref,
      });
      return err(history.error);
    }

    if (history.value.length === 0) {
      latestCheckpoint = await markCheckpointExhausted({
        completedSeasons: [...completed],
        db,
        exhaustedBeforeSeason: season,
        lastCompletedSeason: completed.size > 0 ? Math.min(...completed) : null,
        leagueId: league.id,
        ref,
        seasons,
      });
      break;
    }

    for (const bundle of history.value) {
      const persisted = await persistBundle({
        bundle,
        db,
        leagueId: league.id,
      });
      teams = addStats(teams, persisted.teamStats);
      members = addStats(members, persisted.memberStats);
      matchups = addStats(matchups, persisted.matchupStats);
      finalStandings = addStats(finalStandings, persisted.finalStandingStats);
      transactions = addStats(transactions, persisted.transactionStats);
      await recordDataCoverage({
        capabilities: provider.capabilities,
        db,
        defaultDetails: { sync: "history" },
        leagueId: league.id,
        observations: coverageForBundle(bundle),
        provider: bundle.league.provider,
        providerLeagueId: bundle.league.providerId,
        season: bundle.league.season,
      });
    }

    imported.push(season);
    completed.add(season);
    latestCheckpoint = await markCheckpointProgress({
      completedSeasons: [...completed],
      db,
      lastCompletedSeason: season,
      leagueId: league.id,
      nextSeason: firstIncompleteSeason(seasons, completed),
      ref,
      seasons,
    });
  }

  return ok({
    league: {
      id: league.id,
      provider: ref.provider,
      providerLeagueId: ref.providerId,
      currentSeason: ref.season,
    },
    seasons: {
      requested: seasons,
      imported,
      skipped,
    },
    teams,
    members,
    matchups,
    finalStandings,
    transactions,
    checkpoint: {
      status: latestCheckpoint.status,
      lastCompletedSeason: latestCheckpoint.lastCompletedSeason,
      nextSeason: latestCheckpoint.nextSeason,
      seasonsCompleted: latestCheckpoint.seasonsCompleted,
      seasonsTotal: latestCheckpoint.seasonsTotal,
    },
  });
}
