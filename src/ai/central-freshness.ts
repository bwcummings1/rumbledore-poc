import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { createMockOddsDependencies, refreshOddsCatalog } from "@/betting";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import {
  bettingEvents,
  bettingMarkets,
  contentItems,
  oddsSnapshots,
} from "@/db/schema";
import {
  GENERAL_STATS_MOCK_SOURCE,
  getGeneralStatsWeekSnapshot,
  ingestMockGeneralStats,
} from "@/general-stats";
import { createMockNewsDependencies, refreshCentralNews } from "@/news";
import type { CentralColumnDataSource } from "./central-columns";

const MINUTE_MS = 60_000;

export const CENTRAL_DATA_SOURCE_MAX_AGE_MS = {
  "betting-odds": 15 * MINUTE_MS,
  "central-news": 15 * MINUTE_MS,
  "general-stats": 60 * MINUTE_MS,
} as const satisfies Record<CentralColumnDataSource, number>;

export interface CentralSourceObservation {
  evidenceAt: Date | null;
  observedAt: Date | null;
}

export interface CentralSourceFreshness {
  dataSource: CentralColumnDataSource;
  evidenceAt: string | null;
  maxAgeMs: number;
  observedAt: string;
  refreshedAt: string | null;
  status: "fresh" | "refreshed";
}

export interface EnsureCentralDataFreshnessInput {
  dataSources: readonly CentralColumnDataSource[];
  now: Date;
  season: number;
  week: number;
}

export interface CentralFreshnessSourceAdapter {
  inspect(
    input: Omit<EnsureCentralDataFreshnessInput, "dataSources">,
  ): Promise<CentralSourceObservation>;
  refresh(
    input: Omit<EnsureCentralDataFreshnessInput, "dataSources">,
  ): Promise<void>;
}

export interface CentralDataFreshnessService {
  ensureFresh(
    input: EnsureCentralDataFreshnessInput,
  ): Promise<CentralSourceFreshness[]>;
}

export type CentralFreshnessSourceAdapters = Record<
  CentralColumnDataSource,
  CentralFreshnessSourceAdapter
>;

function validDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function validateInput(input: EnsureCentralDataFreshnessInput): void {
  if (!validDate(input.now)) {
    throw new AppError({
      code: "CENTRAL_AI_FRESHNESS_TIME_INVALID",
      message: "Central data freshness requires a valid observation time",
      status: 400,
    });
  }
  if (
    !Number.isInteger(input.season) ||
    input.season < 1900 ||
    input.season > 2200 ||
    !Number.isInteger(input.week) ||
    input.week < 1 ||
    input.week > 25
  ) {
    throw new AppError({
      code: "CENTRAL_AI_FRESHNESS_WINDOW_INVALID",
      message: "Central data freshness requires a valid NFL season and week",
      status: 400,
    });
  }
}

function isStale({
  maxAgeMs,
  now,
  observedAt,
}: {
  maxAgeMs: number;
  now: Date;
  observedAt: Date | null;
}): boolean {
  return observedAt === null || now.getTime() - observedAt.getTime() > maxAgeMs;
}

export function createCentralDataFreshnessService({
  adapters,
  maxAgeMs = CENTRAL_DATA_SOURCE_MAX_AGE_MS,
}: {
  adapters: CentralFreshnessSourceAdapters;
  maxAgeMs?: Readonly<Record<CentralColumnDataSource, number>>;
}): CentralDataFreshnessService {
  return {
    async ensureFresh(input) {
      validateInput(input);
      const uniqueSources = [...new Set(input.dataSources)];
      const results: CentralSourceFreshness[] = [];

      for (const dataSource of uniqueSources) {
        const sourceMaxAgeMs = maxAgeMs[dataSource];
        if (!Number.isSafeInteger(sourceMaxAgeMs) || sourceMaxAgeMs <= 0) {
          throw new AppError({
            code: "CENTRAL_AI_FRESHNESS_MAX_AGE_INVALID",
            message: `Central data freshness max age is invalid for ${dataSource}`,
            status: 500,
          });
        }
        const adapter = adapters[dataSource];
        const before = await adapter.inspect(input);
        if (
          !isStale({
            maxAgeMs: sourceMaxAgeMs,
            now: input.now,
            observedAt: before.observedAt,
          })
        ) {
          results.push({
            dataSource,
            evidenceAt: before.evidenceAt?.toISOString() ?? null,
            maxAgeMs: sourceMaxAgeMs,
            observedAt:
              before.observedAt?.toISOString() ?? input.now.toISOString(),
            refreshedAt: null,
            status: "fresh",
          });
          continue;
        }

        await adapter.refresh(input);
        const after = await adapter.inspect(input);
        results.push({
          dataSource,
          evidenceAt: after.evidenceAt?.toISOString() ?? null,
          maxAgeMs: sourceMaxAgeMs,
          // A completed refresh is a current observation even when a mock
          // fixture has no facts or returns the same provider payload.
          observedAt: input.now.toISOString(),
          refreshedAt: input.now.toISOString(),
          status: "refreshed",
        });
      }

      return results;
    },
  };
}

function asDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return validDate(date) ? date : null;
}

function createMockCentralFreshnessAdapters(
  db: Db,
): CentralFreshnessSourceAdapters {
  return {
    "general-stats": {
      async inspect(input) {
        const snapshot = await getGeneralStatsWeekSnapshot(db, {
          season: input.season,
          source: GENERAL_STATS_MOCK_SOURCE,
          week: input.week,
        });
        return {
          evidenceAt: snapshot.fetchedAt,
          observedAt: snapshot.fetchedAt,
        };
      },
      async refresh(input) {
        await ingestMockGeneralStats(db, {
          fetchedAt: input.now,
          touchFetchedAt: true,
        });
      },
    },
    "central-news": {
      async inspect() {
        const [row] = await db
          .select({
            evidenceAt: sql<
              Date | string | null
            >`max(${contentItems.publishedAt})`,
            observedAt: sql<
              Date | string | null
            >`max(${contentItems.updatedAt})`,
          })
          .from(contentItems)
          .where(
            and(
              isNull(contentItems.leagueId),
              eq(contentItems.kind, "news"),
              sql`(${contentItems.metadata}->>'generatedBy') is distinct from 'central-journalist-engine'`,
            ),
          );
        return {
          evidenceAt: asDate(row?.evidenceAt ?? null),
          observedAt: asDate(row?.observedAt ?? null),
        };
      },
      async refresh(input) {
        const deps = createMockNewsDependencies(db);
        await refreshCentralNews({
          deps: { ...deps, now: () => input.now },
        });
      },
    },
    "betting-odds": {
      async inspect(input) {
        const stats = await getGeneralStatsWeekSnapshot(db, {
          season: input.season,
          source: GENERAL_STATS_MOCK_SOURCE,
          week: input.week,
        });
        const gameTimes = stats.schedule.map((game) => game.gameTime.getTime());
        if (gameTimes.length === 0) {
          return { evidenceAt: null, observedAt: null };
        }
        const windowStart = new Date(
          Math.min(...gameTimes) - 24 * 60 * MINUTE_MS,
        );
        const windowEnd = new Date(
          Math.max(...gameTimes) + 24 * 60 * MINUTE_MS,
        );
        const [row] = await db
          .select({
            evidenceAt: sql<
              Date | string | null
            >`max(${oddsSnapshots.capturedAt})`,
            observedAt: sql<
              Date | string | null
            >`max(${oddsSnapshots.createdAt})`,
          })
          .from(oddsSnapshots)
          .innerJoin(
            bettingMarkets,
            eq(bettingMarkets.id, oddsSnapshots.marketId),
          )
          .innerJoin(
            bettingEvents,
            eq(bettingEvents.id, bettingMarkets.eventId),
          )
          .where(
            and(
              eq(bettingEvents.sport, "nfl"),
              gte(bettingEvents.startTime, windowStart),
              lte(bettingEvents.startTime, windowEnd),
            ),
          );
        return {
          evidenceAt: asDate(row?.evidenceAt ?? null),
          observedAt: asDate(row?.observedAt ?? null),
        };
      },
      async refresh(input) {
        const deps = createMockOddsDependencies(db);
        await refreshOddsCatalog({
          deps: { ...deps, now: () => input.now },
          input: { sport: "nfl" },
        });
      },
    },
  };
}

/**
 * Phase 3 is deliberately pinned to local fixtures. Phase 4 can replace these
 * adapters without changing the freshness policy or generation pipeline.
 */
export function createMockCentralDataFreshness(
  db: Db,
): CentralDataFreshnessService {
  return createCentralDataFreshnessService({
    adapters: createMockCentralFreshnessAdapters(db),
  });
}
