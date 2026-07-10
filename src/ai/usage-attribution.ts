import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { aiUsageEvents, leagues } from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import {
  type AiContentType,
  CONTENT_TYPE_TEMPLATES,
  isAiContentType,
} from "./content-types";
import type { LlmUsageBreakdown } from "./interfaces";
import type { AiPersona } from "./personas";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_WEEK_LIMIT = 12;
const DEFAULT_RECENT_CALL_LIMIT = 25;
const MAX_RECENT_CALL_LIMIT = 100;

export interface RecordAiUsageEventInput {
  readonly contentType: AiContentType;
  readonly createdAt?: Date;
  readonly estimated: boolean;
  readonly generationRunId?: string | null;
  readonly leagueId: string;
  readonly metadata?: Record<string, unknown>;
  readonly model: string;
  readonly persona: AiPersona;
  readonly provider: string;
  readonly triggerKey: string;
  readonly usage: LlmUsageBreakdown;
}

export interface AiUsageRollupData {
  readonly generatedAt: string;
  readonly league: {
    readonly id: string;
    readonly name: string;
    readonly provider: FantasyProviderId;
    readonly providerLeagueId: string;
    readonly season: number;
  };
  readonly recentCalls: readonly AiUsageRecentCall[];
  readonly summary: AiUsageRollupSummary;
  readonly weekly: readonly AiUsageWeeklyRollup[];
  readonly weeklyBreakdown: readonly AiUsageWeeklyBreakdown[];
}

export interface AiUsageRollupSummary {
  readonly callCount: number;
  readonly estimatedCallCount: number;
  readonly firstCallAt: string | null;
  readonly lastCallAt: string | null;
  readonly totalCostMicrosUsd: number;
  readonly totalTokens: number;
}

export interface AiUsageWeeklyRollup {
  readonly callCount: number;
  readonly estimatedCallCount: number;
  readonly totalCostMicrosUsd: number;
  readonly totalTokens: number;
  readonly weekStart: string;
}

export interface AiUsageWeeklyBreakdown {
  readonly callCount: number;
  readonly contentType: string;
  readonly contentTypeLabel: string;
  readonly model: string;
  readonly persona: AiPersona;
  readonly provider: string;
  readonly totalCostMicrosUsd: number;
  readonly totalTokens: number;
  readonly weekStart: string;
}

export interface AiUsageRecentCall {
  readonly billableUnits: number;
  readonly contentType: string;
  readonly contentTypeLabel: string;
  readonly costMicrosUsd: number;
  readonly createdAt: string;
  readonly estimated: boolean;
  readonly id: string;
  readonly inputTokens: number;
  readonly model: string;
  readonly outputTokens: number;
  readonly persona: AiPersona;
  readonly provider: string;
  readonly totalTokens: number;
  readonly triggerKey: string;
}

export type AiUsageRollupLoadResult =
  | { readonly data: AiUsageRollupData; readonly status: "ready" }
  | { readonly status: "not_found" };

function nonnegativeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.ceil(value);
}

function totalTokens(usage: LlmUsageBreakdown): number {
  return (
    nonnegativeInt(usage.inputTokens) +
    nonnegativeInt(usage.outputTokens) +
    nonnegativeInt(usage.cacheCreationInputTokens) +
    nonnegativeInt(usage.cacheReadInputTokens)
  );
}

function billableUnits(usage: LlmUsageBreakdown): number {
  return Math.max(
    1,
    nonnegativeInt(usage.inputTokens) +
      nonnegativeInt(usage.outputTokens) +
      nonnegativeInt(usage.cacheCreationInputTokens) +
      Math.ceil(nonnegativeInt(usage.cacheReadInputTokens) / 10),
  );
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function contentTypeLabel(contentType: string): string {
  return isAiContentType(contentType)
    ? CONTENT_TYPE_TEMPLATES[contentType].label
    : contentType.replaceAll("_", " ");
}

function boundedRecentLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_RECENT_CALL_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_RECENT_CALL_LIMIT);
}

export async function recordAiUsageEvent(
  db: Db,
  input: RecordAiUsageEventInput,
): Promise<{ id: string }> {
  const total = totalTokens(input.usage);
  const billable = billableUnits(input.usage);
  const [row] = await withLeagueContext(db, input.leagueId, (tx) =>
    tx
      .insert(aiUsageEvents)
      .values({
        billableUnits: billable,
        cacheCreationInputTokens: nonnegativeInt(
          input.usage.cacheCreationInputTokens,
        ),
        cacheReadInputTokens: nonnegativeInt(input.usage.cacheReadInputTokens),
        contentType: input.contentType,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
        estimated: input.estimated,
        generationRunId: input.generationRunId ?? null,
        inputTokens: nonnegativeInt(input.usage.inputTokens),
        leagueId: input.leagueId,
        metadata: input.metadata ?? {},
        model: input.model,
        outputTokens: nonnegativeInt(input.usage.outputTokens),
        persona: input.persona,
        provider: input.provider,
        totalTokens: total,
        triggerKey: input.triggerKey,
      })
      .returning({ id: aiUsageEvents.id }),
  );

  if (!row) {
    throw new Error("AI usage event could not be recorded");
  }
  return row;
}

export async function getAiUsageRollupData(
  db: Db,
  input: {
    readonly leagueId: string;
    readonly now?: Date;
    readonly recentCallLimit?: number;
    readonly weekLimit?: number;
  },
): Promise<AiUsageRollupLoadResult> {
  if (!UUID_RE.test(input.leagueId)) {
    return { status: "not_found" };
  }

  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const weekStartExpr = sql<Date>`date_trunc('week', ${aiUsageEvents.createdAt})`;
  const [summary, weekly, weeklyBreakdown, recentCalls] =
    await withLeagueContext(db, input.leagueId, async (tx) => {
      const [summaryRow] = await tx
        .select({
          callCount: sql<number>`count(*)::int`,
          estimatedCallCount: sql<number>`count(*) filter (where ${aiUsageEvents.estimated})::int`,
          firstCallAt: sql<Date | null>`min(${aiUsageEvents.createdAt})`,
          lastCallAt: sql<Date | null>`max(${aiUsageEvents.createdAt})`,
          totalCostMicrosUsd: sql<number>`coalesce(sum(${aiUsageEvents.costMicrosUsd}), 0)::int`,
          totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::int`,
        })
        .from(aiUsageEvents)
        .where(eq(aiUsageEvents.leagueId, input.leagueId));

      const weeklyRows = await tx
        .select({
          callCount: sql<number>`count(*)::int`,
          estimatedCallCount: sql<number>`count(*) filter (where ${aiUsageEvents.estimated})::int`,
          totalCostMicrosUsd: sql<number>`coalesce(sum(${aiUsageEvents.costMicrosUsd}), 0)::int`,
          totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::int`,
          weekStart: weekStartExpr,
        })
        .from(aiUsageEvents)
        .where(eq(aiUsageEvents.leagueId, input.leagueId))
        .groupBy(weekStartExpr)
        .orderBy(desc(weekStartExpr))
        .limit(input.weekLimit ?? DEFAULT_WEEK_LIMIT);

      const weekStarts = weeklyRows
        .map((row) => row.weekStart)
        .map((value) => (value instanceof Date ? value : new Date(value)))
        .filter((value) => Number.isFinite(value.getTime()));
      const oldestDisplayedWeek =
        weekStarts.length > 0
          ? new Date(Math.min(...weekStarts.map((value) => value.getTime())))
          : null;
      const breakdownRows =
        oldestDisplayedWeek === null
          ? []
          : await tx
              .select({
                callCount: sql<number>`count(*)::int`,
                contentType: aiUsageEvents.contentType,
                model: aiUsageEvents.model,
                persona: aiUsageEvents.persona,
                provider: aiUsageEvents.provider,
                totalCostMicrosUsd: sql<number>`coalesce(sum(${aiUsageEvents.costMicrosUsd}), 0)::int`,
                totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::int`,
                weekStart: weekStartExpr,
              })
              .from(aiUsageEvents)
              .where(
                and(
                  eq(aiUsageEvents.leagueId, input.leagueId),
                  gte(aiUsageEvents.createdAt, oldestDisplayedWeek),
                ),
              )
              .groupBy(
                weekStartExpr,
                aiUsageEvents.persona,
                aiUsageEvents.contentType,
                aiUsageEvents.provider,
                aiUsageEvents.model,
              )
              .orderBy(desc(weekStartExpr), desc(sql<number>`count(*)::int`));

      const recentRows = await tx
        .select({
          billableUnits: aiUsageEvents.billableUnits,
          contentType: aiUsageEvents.contentType,
          costMicrosUsd: aiUsageEvents.costMicrosUsd,
          createdAt: aiUsageEvents.createdAt,
          estimated: aiUsageEvents.estimated,
          id: aiUsageEvents.id,
          inputTokens: aiUsageEvents.inputTokens,
          model: aiUsageEvents.model,
          outputTokens: aiUsageEvents.outputTokens,
          persona: aiUsageEvents.persona,
          provider: aiUsageEvents.provider,
          totalTokens: aiUsageEvents.totalTokens,
          triggerKey: aiUsageEvents.triggerKey,
        })
        .from(aiUsageEvents)
        .where(eq(aiUsageEvents.leagueId, input.leagueId))
        .orderBy(desc(aiUsageEvents.createdAt), desc(aiUsageEvents.id))
        .limit(boundedRecentLimit(input.recentCallLimit));

      return [summaryRow, weeklyRows, breakdownRows, recentRows] as const;
    });

  return {
    data: {
      generatedAt: (input.now ?? new Date()).toISOString(),
      league,
      recentCalls: recentCalls.map((row) => ({
        billableUnits: row.billableUnits,
        contentType: row.contentType,
        contentTypeLabel: contentTypeLabel(row.contentType),
        costMicrosUsd: row.costMicrosUsd,
        createdAt: row.createdAt.toISOString(),
        estimated: row.estimated,
        id: row.id,
        inputTokens: row.inputTokens,
        model: row.model,
        outputTokens: row.outputTokens,
        persona: row.persona,
        provider: row.provider,
        totalTokens: row.totalTokens,
        triggerKey: row.triggerKey,
      })),
      summary: {
        callCount: asNumber(summary?.callCount),
        estimatedCallCount: asNumber(summary?.estimatedCallCount),
        firstCallAt: iso(summary?.firstCallAt),
        lastCallAt: iso(summary?.lastCallAt),
        totalCostMicrosUsd: asNumber(summary?.totalCostMicrosUsd),
        totalTokens: asNumber(summary?.totalTokens),
      },
      weekly: weekly.map((row) => ({
        callCount: asNumber(row.callCount),
        estimatedCallCount: asNumber(row.estimatedCallCount),
        totalCostMicrosUsd: asNumber(row.totalCostMicrosUsd),
        totalTokens: asNumber(row.totalTokens),
        weekStart: iso(row.weekStart) ?? new Date(0).toISOString(),
      })),
      weeklyBreakdown: weeklyBreakdown.map((row) => ({
        callCount: asNumber(row.callCount),
        contentType: row.contentType,
        contentTypeLabel: contentTypeLabel(row.contentType),
        model: row.model,
        persona: row.persona,
        provider: row.provider,
        totalCostMicrosUsd: asNumber(row.totalCostMicrosUsd),
        totalTokens: asNumber(row.totalTokens),
        weekStart: iso(row.weekStart) ?? new Date(0).toISOString(),
      })),
    },
    status: "ready",
  };
}
