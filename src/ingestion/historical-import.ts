import { and, eq, sql } from "drizzle-orm";
import { err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  type HistoricalImportCheckpoint,
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
  type EntitySyncStats,
  persistNormalizedLeagueRows,
} from "./current-league";

export type HistoricalImportProvider<Session extends FantasyProviderSession> =
  Pick<FantasyProvider<unknown, Session>, "getHistory">;

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

async function markCheckpointRunning({
  db,
  leagueId,
  ref,
}: {
  db: Db;
  leagueId: string;
  ref: ProviderLeagueRef;
}): Promise<void> {
  await withLeagueContext(db, leagueId, (tx) =>
    tx
      .update(historicalImportCheckpoints)
      .set({
        errorCode: null,
        errorMessage: null,
        status: "running",
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

async function markCheckpointProgress({
  completedCount,
  db,
  lastCompletedSeason,
  leagueId,
  nextSeason,
  ref,
  seasonsTotal,
}: {
  completedCount: number;
  db: Db;
  lastCompletedSeason: number;
  leagueId: string;
  nextSeason: number | null;
  ref: ProviderLeagueRef;
  seasonsTotal: number;
}): Promise<HistoricalImportCheckpoint> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const [checkpoint] = await tx
      .update(historicalImportCheckpoints)
      .set({
        errorCode: null,
        errorMessage: null,
        lastCompletedSeason,
        nextSeason,
        seasonsCompleted: completedCount,
        seasonsTotal,
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

function checkpointMatches(
  checkpoint: HistoricalImportCheckpoint | undefined,
  seasons: readonly number[],
): checkpoint is HistoricalImportCheckpoint {
  return (
    checkpoint !== undefined &&
    checkpoint.startSeason === seasons[0] &&
    checkpoint.endSeason === seasons.at(-1) &&
    checkpoint.seasonsTotal === seasons.length
  );
}

function resumeIndex(
  checkpoint: HistoricalImportCheckpoint | undefined,
  seasons: readonly number[],
): number {
  if (!checkpoint?.lastCompletedSeason) {
    return 0;
  }

  const index = seasons.indexOf(checkpoint.lastCompletedSeason);
  return index === -1 ? 0 : Math.min(index + 1, seasons.length);
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
    leagueId,
    matchups: bundle.matchups,
    members: bundle.members,
    teams: bundle.teams,
  });
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
  const matchesExistingCheckpoint = checkpointMatches(checkpoint, seasons);

  if (
    matchesExistingCheckpoint &&
    checkpoint?.status === "completed" &&
    checkpoint.seasonsCompleted >= seasons.length
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
  if (matchesExistingCheckpoint) {
    if (!checkpoint) {
      throw new Error("historical import checkpoint was not loaded");
    }
    await markCheckpointRunning({ db, leagueId: league.id, ref });
    activeCheckpoint = checkpoint;
  } else {
    activeCheckpoint = await upsertCheckpoint({
      db,
      leagueId: league.id,
      ref,
      seasons,
      status: "running",
    });
  }

  const startIndex = matchesExistingCheckpoint
    ? resumeIndex(activeCheckpoint, seasons)
    : 0;
  const skipped = seasons.slice(0, startIndex);
  const imported: number[] = [];
  let teams = emptyStats();
  let members = emptyStats();
  let matchups = emptyStats();
  let latestCheckpoint = activeCheckpoint;

  for (let index = startIndex; index < seasons.length; index += 1) {
    const season = seasons[index];
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

    for (const bundle of history.value) {
      const persisted = await persistBundle({
        bundle,
        db,
        leagueId: league.id,
      });
      teams = addStats(teams, persisted.teamStats);
      members = addStats(members, persisted.memberStats);
      matchups = addStats(matchups, persisted.matchupStats);
    }

    imported.push(season);
    latestCheckpoint = await markCheckpointProgress({
      completedCount: index + 1,
      db,
      lastCompletedSeason: season,
      leagueId: league.id,
      nextSeason: seasons[index + 1] ?? null,
      ref,
      seasonsTotal: seasons.length,
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
    checkpoint: {
      status: latestCheckpoint.status,
      lastCompletedSeason: latestCheckpoint.lastCompletedSeason,
      nextSeason: latestCheckpoint.nextSeason,
      seasonsCompleted: latestCheckpoint.seasonsCompleted,
      seasonsTotal: latestCheckpoint.seasonsTotal,
    },
  });
}
