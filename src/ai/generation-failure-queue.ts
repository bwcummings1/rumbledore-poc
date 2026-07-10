import { and, desc, eq, inArray, lte, or } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { aiGenerationRuns, contentItems, leagues } from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import {
  type AiContentType,
  CONTENT_TYPE_TEMPLATES,
  isAiContentType,
} from "./content-types";
import type { AiPersona } from "./personas";
import {
  type AiGenerationDependencies,
  type GenerateLeagueBlogPostResult,
  generateLeagueBlogPost,
} from "./pipeline";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_GENERATION_STALE_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_QUEUE_LIMIT = 50;
const MAX_ERROR_MESSAGE_LENGTH = 500;

export type GenerationFailureQueueItemStatus =
  | "failed"
  | "skipped"
  | "stale_pending";

export interface GenerationFailureQueueItem {
  readonly id: string;
  readonly contentItem: {
    readonly href: string;
    readonly id: string;
    readonly status: "published" | "retracted" | "superseded";
    readonly title: string;
  } | null;
  readonly contentType: AiContentType | null;
  readonly contentTypeLabel: string;
  readonly createdAt: string;
  readonly errorMessage: string | null;
  readonly isJudgeSkip: boolean;
  readonly persona: AiPersona;
  readonly promptPrefixHash: string | null;
  readonly reason: string;
  readonly retryApiUrl: string;
  readonly runTriggerKey: string;
  readonly status: GenerationFailureQueueItemStatus;
  readonly triggerKey: string | null;
  readonly updatedAt: string;
}

export interface GenerationFailureQueueData {
  readonly league: {
    readonly id: string;
    readonly name: string;
    readonly provider: FantasyProviderId;
    readonly providerLeagueId: string;
    readonly season: number;
  };
  readonly generatedAt: string;
  readonly items: readonly GenerationFailureQueueItem[];
  readonly staleAfterMinutes: number;
  readonly summary: {
    readonly failed: number;
    readonly judgeSkipped: number;
    readonly skipped: number;
    readonly stalePending: number;
    readonly total: number;
  };
}

export type GenerationFailureQueueLoadResult =
  | { readonly data: GenerationFailureQueueData; readonly status: "ready" }
  | { readonly status: "not_found" };

export type GenerationFailureRetryResult =
  | {
      readonly generation: GenerateLeagueBlogPostResult | null;
      readonly runId: string;
      readonly status: "already_current";
    }
  | {
      readonly generation: Extract<
        GenerateLeagueBlogPostResult,
        { status: "published" }
      >;
      readonly runId: string;
      readonly status: "published";
    }
  | {
      readonly generation: Extract<
        GenerateLeagueBlogPostResult,
        { status: "skipped" }
      >;
      readonly reason: string;
      readonly runId: string;
      readonly status: "skipped";
    }
  | {
      readonly generation: Extract<
        GenerateLeagueBlogPostResult,
        { status: "blocked" }
      >;
      readonly reason: string;
      readonly runId: string;
      readonly status: "blocked";
    }
  | {
      readonly errorMessage: string;
      readonly generation: null;
      readonly runId: string;
      readonly status: "failed";
    };

interface ParsedRunTriggerKey {
  readonly contentType: AiContentType;
  readonly triggerKey: string;
}

type EditorialRetryContext =
  | {
      readonly actorUserId: string | null;
      readonly kind: "regenerate";
      readonly originalContentItemId: string;
      readonly reason: string;
    }
  | {
      readonly actorUserId: string | null;
      readonly affectedWeeks: readonly {
        readonly scoringPeriod: number;
        readonly season: number;
      }[];
      readonly changedMatchups: readonly {
        readonly contentHash: string;
        readonly id: string;
        readonly scoringPeriod: number;
        readonly season: number;
      }[];
      readonly correctionHash: string;
      readonly kind: "correction";
      readonly originalContentItemId: string;
      readonly reason: string;
    };

type EditorialRetryChangedMatchup = Extract<
  EditorialRetryContext,
  { kind: "correction" }
>["changedMatchups"][number];

type GenerationFailureRunRow = {
  readonly contentItemId: string | null;
  readonly contentItemStatus: "published" | "retracted" | "superseded" | null;
  readonly contentItemTitle: string | null;
  readonly createdAt: Date;
  readonly errorMessage: string | null;
  readonly id: string;
  readonly persona: AiPersona;
  readonly promptPrefixHash: string | null;
  readonly skipReason: string | null;
  readonly metadata: Record<string, unknown>;
  readonly status:
    | "blocked_entitlement"
    | "failed"
    | "published"
    | "running"
    | "skipped";
  readonly triggerKey: string;
  readonly updatedAt: Date;
};

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function queueLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_QUEUE_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function staleCutoff(now: Date, staleAfterMs: number): Date {
  return new Date(now.getTime() - staleAfterMs);
}

function parseRunTriggerKey(value: string): ParsedRunTriggerKey | null {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    return null;
  }

  const contentType = value.slice(0, separator);
  if (!isAiContentType(contentType)) {
    return null;
  }

  return {
    contentType,
    triggerKey: value.slice(separator + 1),
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function parseCorrectionWeeks(
  value: unknown,
): { scoringPeriod: number; season: number }[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const weeks = value.map((entry) => {
    const record = recordValue(entry);
    const scoringPeriod = integerValue(record.scoringPeriod);
    const season = integerValue(record.season);
    return scoringPeriod !== null && season !== null
      ? { scoringPeriod, season }
      : null;
  });
  return weeks.every(
    (week): week is { scoringPeriod: number; season: number } => Boolean(week),
  )
    ? weeks
    : null;
}

function parseChangedMatchups(
  value: unknown,
): EditorialRetryChangedMatchup[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const matchups = value.map((entry) => {
    const record = recordValue(entry);
    const contentHash = stringValue(record.contentHash);
    const id = stringValue(record.id);
    const scoringPeriod = integerValue(record.scoringPeriod);
    const season = integerValue(record.season);
    return contentHash && id && scoringPeriod !== null && season !== null
      ? { contentHash, id, scoringPeriod, season }
      : null;
  });
  return matchups.every(
    (
      matchup,
    ): matchup is {
      contentHash: string;
      id: string;
      scoringPeriod: number;
      season: number;
    } => Boolean(matchup),
  )
    ? matchups
    : null;
}

function editorialRetryContext(
  metadata: Record<string, unknown>,
): EditorialRetryContext | null {
  const editorial = recordValue(metadata.editorial);
  const kind = editorial.kind;
  const originalContentItemId = stringValue(editorial.originalContentItemId);
  const reason = typeof editorial.reason === "string" ? editorial.reason : "";
  const actorUserId = nullableStringValue(editorial.actorUserId);
  if (!originalContentItemId) {
    return null;
  }

  if (kind === "regenerate") {
    return {
      actorUserId,
      kind,
      originalContentItemId,
      reason,
    };
  }

  if (kind === "correction") {
    const affectedWeeks = parseCorrectionWeeks(editorial.affectedWeeks);
    const changedMatchups = parseChangedMatchups(editorial.changedMatchups);
    const correctionHash = stringValue(editorial.correctionHash);
    if (!affectedWeeks || !changedMatchups || !correctionHash) {
      return null;
    }
    return {
      actorUserId,
      affectedWeeks,
      changedMatchups,
      correctionHash,
      kind,
      originalContentItemId,
      reason,
    };
  }

  return null;
}

function isJudgeSkip(reason: string | null): boolean {
  return reason?.startsWith("llm_judge:") ?? false;
}

function contentTypeLabel(contentType: AiContentType | null): string {
  return contentType ? CONTENT_TYPE_TEMPLATES[contentType].label : "Unknown";
}

function runReason(
  row: Pick<
    GenerationFailureRunRow,
    "errorMessage" | "skipReason" | "status" | "updatedAt"
  >,
  input: { now: Date; staleAfterMs: number },
): string {
  if (row.status === "running") {
    const minutes = Math.max(
      1,
      Math.floor((input.now.getTime() - row.updatedAt.getTime()) / 60_000),
    );
    const threshold = Math.max(1, Math.floor(input.staleAfterMs / 60_000));
    return `Pending for ${minutes} minutes; stale threshold is ${threshold} minutes.`;
  }
  if (row.status === "failed") {
    return row.errorMessage?.trim() || "Generation failed without details.";
  }
  return row.skipReason?.trim() || "Generation skipped without details.";
}

function queueStatus(
  status: GenerationFailureRunRow["status"],
): GenerationFailureQueueItemStatus {
  switch (status) {
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "running":
    case "blocked_entitlement":
    case "published":
      return "stale_pending";
  }
}

function toQueueItem(
  row: GenerationFailureRunRow,
  input: { leagueId: string; now: Date; staleAfterMs: number },
): GenerationFailureQueueItem {
  const parsed = parseRunTriggerKey(row.triggerKey);
  return {
    contentItem:
      row.contentItemId && row.contentItemTitle && row.contentItemStatus
        ? {
            href: `/leagues/${input.leagueId}/press/${row.contentItemId}`,
            id: row.contentItemId,
            status: row.contentItemStatus,
            title: row.contentItemTitle,
          }
        : null,
    contentType: parsed?.contentType ?? null,
    contentTypeLabel: contentTypeLabel(parsed?.contentType ?? null),
    createdAt: row.createdAt.toISOString(),
    errorMessage: row.errorMessage,
    id: row.id,
    isJudgeSkip: isJudgeSkip(row.skipReason),
    persona: row.persona,
    promptPrefixHash: row.promptPrefixHash,
    reason: runReason(row, input),
    retryApiUrl: `/api/leagues/${input.leagueId}/press/failures/${row.id}/retry`,
    runTriggerKey: row.triggerKey,
    status: queueStatus(row.status),
    triggerKey: parsed?.triggerKey ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function summarize(
  items: readonly GenerationFailureQueueItem[],
): GenerationFailureQueueData["summary"] {
  return {
    failed: items.filter((item) => item.status === "failed").length,
    judgeSkipped: items.filter((item) => item.isJudgeSkip).length,
    skipped: items.filter((item) => item.status === "skipped").length,
    stalePending: items.filter((item) => item.status === "stale_pending")
      .length,
    total: items.length,
  };
}

function safeErrorMessage(cause: unknown): string {
  const message =
    cause instanceof Error && cause.message.trim()
      ? cause.message
      : "Generation failed during retry.";
  return message.replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function failureRunNotFound(): AppError {
  return new AppError({
    code: "AI_GENERATION_RUN_NOT_FOUND",
    message: "AI generation run could not be found",
    status: 404,
  });
}

function failureRunNotRetryable(): AppError {
  return new AppError({
    code: "AI_GENERATION_RUN_NOT_RETRYABLE",
    message:
      "Only skipped, failed, or stale pending generation runs can be retried",
    status: 409,
  });
}

function malformedRunTriggerKey(): AppError {
  return new AppError({
    code: "AI_GENERATION_RUN_TRIGGER_INVALID",
    message: "AI generation run trigger key is not retryable",
    status: 409,
  });
}

async function markRunFailed(
  deps: AiGenerationDependencies,
  input: {
    errorMessage: string;
    leagueId: string;
    now: Date;
    runId: string;
  },
): Promise<void> {
  await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    await tx
      .update(aiGenerationRuns)
      .set({
        errorMessage: input.errorMessage,
        status: "failed",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(aiGenerationRuns.id, input.runId),
          eq(aiGenerationRuns.leagueId, input.leagueId),
        ),
      );
  });
}

async function retryEditorialFailureRun({
  context,
  deps,
  input,
  parsed,
  runId,
}: {
  context: EditorialRetryContext;
  deps: AiGenerationDependencies;
  input: { actorUserId?: string | null; leagueId: string };
  parsed: ParsedRunTriggerKey;
  runId: string;
}): Promise<GenerationFailureRetryResult> {
  if (context.kind === "regenerate") {
    const { regenerateEditorialContentItem } = await import(
      "@/content/editorial"
    );
    const actorUserId = input.actorUserId ?? context.actorUserId;
    if (!actorUserId) {
      throw new AppError({
        code: "EDITORIAL_RETRY_ACTOR_MISSING",
        message: "Editorial regenerate retry requires an audit actor",
        status: 409,
      });
    }
    const result = await regenerateEditorialContentItem(deps, {
      actorUserId,
      contentItemId: context.originalContentItemId,
      generationTriggerKey: parsed.triggerKey,
      leagueId: input.leagueId,
      reason: context.reason,
    });
    switch (result.status) {
      case "published":
        if (result.generation?.status === "published") {
          return { generation: result.generation, runId, status: "published" };
        }
        return {
          generation: result.generation,
          runId,
          status: "already_current",
        };
      case "already_current":
        return {
          generation: result.generation,
          runId,
          status: "already_current",
        };
      case "blocked":
        if (result.generation?.status === "blocked") {
          return {
            generation: result.generation,
            reason: result.generation.reason,
            runId,
            status: "blocked",
          };
        }
        return {
          generation: result.generation,
          runId,
          status: "already_current",
        };
      case "skipped":
        if (result.generation?.status === "skipped") {
          return {
            generation: result.generation,
            reason: result.generation.skipReason,
            runId,
            status: "skipped",
          };
        }
        return {
          generation: result.generation,
          runId,
          status: "already_current",
        };
      case "conflict":
        throw new AppError({
          code: "EDITORIAL_RETRY_CONFLICT",
          message: "Editorial retry conflicted with the current post state",
          status: 409,
        });
      case "not_found":
        throw failureRunNotFound();
    }
  }

  const { correctEditorialContentItem } = await import("@/content/editorial");
  const result = await correctEditorialContentItem(deps, {
    actorUserId: input.actorUserId ?? context.actorUserId,
    affectedWeeks: [...context.affectedWeeks],
    changedMatchups: [...context.changedMatchups],
    contentItemId: context.originalContentItemId,
    correctionHash: context.correctionHash,
    generationTriggerKey: parsed.triggerKey,
    leagueId: input.leagueId,
    reason: context.reason,
  });
  switch (result.status) {
    case "published":
      if (result.generation?.status === "published") {
        return { generation: result.generation, runId, status: "published" };
      }
      return {
        generation: result.generation,
        runId,
        status: "already_current",
      };
    case "already_current":
      return {
        generation: result.generation,
        runId,
        status: "already_current",
      };
    case "blocked":
      if (result.generation?.status === "blocked") {
        return {
          generation: result.generation,
          reason: result.generation.reason,
          runId,
          status: "blocked",
        };
      }
      return {
        generation: result.generation,
        runId,
        status: "already_current",
      };
    case "skipped":
      if (result.generation?.status === "skipped") {
        return {
          generation: result.generation,
          reason: result.generation.skipReason,
          runId,
          status: "skipped",
        };
      }
      return {
        generation: result.generation,
        runId,
        status: "already_current",
      };
    case "conflict":
      throw new AppError({
        code: "EDITORIAL_RETRY_CONFLICT",
        message: "Editorial retry conflicted with the current post state",
        status: 409,
      });
    case "not_found":
      throw failureRunNotFound();
  }
}

export async function getGenerationFailureQueueData(
  db: Db,
  input: {
    leagueId: string;
    limit?: number;
    now?: Date;
    staleAfterMs?: number;
  },
): Promise<GenerationFailureQueueLoadResult> {
  if (!isValidUuid(input.leagueId)) {
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

  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_GENERATION_STALE_AFTER_MS;
  const cutoff = staleCutoff(now, staleAfterMs);
  const rows = await withLeagueContext(db, input.leagueId, async (tx) =>
    tx
      .select({
        contentItemId: aiGenerationRuns.contentItemId,
        contentItemStatus: contentItems.status,
        contentItemTitle: contentItems.title,
        createdAt: aiGenerationRuns.createdAt,
        errorMessage: aiGenerationRuns.errorMessage,
        id: aiGenerationRuns.id,
        metadata: aiGenerationRuns.metadata,
        persona: aiGenerationRuns.persona,
        promptPrefixHash: aiGenerationRuns.promptPrefixHash,
        skipReason: aiGenerationRuns.skipReason,
        status: aiGenerationRuns.status,
        triggerKey: aiGenerationRuns.triggerKey,
        updatedAt: aiGenerationRuns.updatedAt,
      })
      .from(aiGenerationRuns)
      .leftJoin(
        contentItems,
        and(
          eq(aiGenerationRuns.contentItemId, contentItems.id),
          eq(contentItems.leagueId, input.leagueId),
        ),
      )
      .where(
        and(
          eq(aiGenerationRuns.leagueId, input.leagueId),
          or(
            inArray(aiGenerationRuns.status, ["skipped", "failed"]),
            and(
              eq(aiGenerationRuns.status, "running"),
              lte(aiGenerationRuns.updatedAt, cutoff),
            ),
          ),
        ),
      )
      .orderBy(desc(aiGenerationRuns.updatedAt), desc(aiGenerationRuns.id))
      .limit(queueLimit(input.limit)),
  );

  const items = rows.map((row) =>
    toQueueItem(row, {
      leagueId: input.leagueId,
      now,
      staleAfterMs,
    }),
  );

  return {
    data: {
      generatedAt: now.toISOString(),
      items,
      league,
      staleAfterMinutes: Math.max(1, Math.floor(staleAfterMs / 60_000)),
      summary: summarize(items),
    },
    status: "ready",
  };
}

export async function retryGenerationFailureRun(
  deps: AiGenerationDependencies,
  input: {
    actorUserId?: string | null;
    leagueId: string;
    now?: Date;
    runId: string;
    staleAfterMs?: number;
  },
): Promise<GenerationFailureRetryResult> {
  const now = input.now ?? deps.now?.() ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_GENERATION_STALE_AFTER_MS;
  const run = await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [row] = await tx
      .select({
        id: aiGenerationRuns.id,
        metadata: aiGenerationRuns.metadata,
        persona: aiGenerationRuns.persona,
        status: aiGenerationRuns.status,
        triggerKey: aiGenerationRuns.triggerKey,
        updatedAt: aiGenerationRuns.updatedAt,
      })
      .from(aiGenerationRuns)
      .where(
        and(
          eq(aiGenerationRuns.id, input.runId),
          eq(aiGenerationRuns.leagueId, input.leagueId),
        ),
      )
      .limit(1);
    return row ?? null;
  });

  if (!run) {
    throw failureRunNotFound();
  }

  const staleRunning =
    run.status === "running" &&
    run.updatedAt.getTime() <= staleCutoff(now, staleAfterMs).getTime();
  if (run.status !== "skipped" && run.status !== "failed" && !staleRunning) {
    throw failureRunNotRetryable();
  }

  const parsed = parseRunTriggerKey(run.triggerKey);
  if (!parsed) {
    throw malformedRunTriggerKey();
  }

  await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    await tx
      .update(aiGenerationRuns)
      .set({
        contentItemId: null,
        errorMessage: null,
        skipReason: null,
        status: "running",
        updatedAt: now,
      })
      .where(
        and(
          eq(aiGenerationRuns.id, input.runId),
          eq(aiGenerationRuns.leagueId, input.leagueId),
        ),
      );
  });

  try {
    const editorialContext = editorialRetryContext(run.metadata);
    if (editorialContext) {
      return await retryEditorialFailureRun({
        context: editorialContext,
        deps,
        input,
        parsed,
        runId: input.runId,
      });
    }

    const generation = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: parsed.contentType,
        leagueId: input.leagueId,
        persona: run.persona,
        triggerKey: parsed.triggerKey,
      },
    });

    switch (generation.status) {
      case "published":
        return { generation, runId: input.runId, status: "published" };
      case "blocked":
        return {
          generation,
          reason: generation.reason,
          runId: input.runId,
          status: "blocked",
        };
      case "skipped":
        return {
          generation,
          reason: generation.skipReason,
          runId: input.runId,
          status: "skipped",
        };
    }
  } catch (cause) {
    const errorMessage = safeErrorMessage(cause);
    await markRunFailed(deps, {
      errorMessage,
      leagueId: input.leagueId,
      now,
      runId: input.runId,
    });
    return {
      errorMessage,
      generation: null,
      runId: input.runId,
      status: "failed",
    };
  }
}
