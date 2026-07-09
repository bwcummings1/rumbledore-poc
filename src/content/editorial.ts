import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  type AiContentType,
  type AiGenerationDependencies,
  type AiPersona,
  type GenerateLeagueBlogPostResult,
  isAiContentType,
} from "@/ai";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  contentItems,
  editorialActions,
  type NewEditorialAction,
} from "@/db/schema";
import type { PushNotifier } from "@/push";
import type { RealtimePublisher } from "@/realtime";
import type {
  CorrectionChangedMatchup,
  CorrectionMatchupWeek,
} from "./corrections";
import {
  type ContentLifecycleTransitionCommit,
  type ContentLifecycleTransitionResult,
  retractContentItemInLeagueTx,
  supersedeContentItemInLeagueTx,
} from "./lifecycle";

const MAX_EDITORIAL_REASON_LENGTH = 500;

export type EditorialActionMutationStatus =
  | "already_current"
  | "changed"
  | "conflict"
  | "not_found";

export interface EditorialLifecycleDeps {
  db: Db;
  now?: () => Date;
  push?: PushNotifier;
  realtime?: RealtimePublisher;
}

export interface RetractEditorialContentInput {
  actorUserId: string;
  contentItemId: string;
  leagueId: string;
  reason: string;
}

export interface RetractEditorialContentResult {
  actionId: string | null;
  contentItemId: string;
  reason: string;
  status: EditorialActionMutationStatus;
  transition: ContentLifecycleTransitionResult;
}

export interface RegenerateEditorialContentInput {
  actorUserId: string;
  contentItemId: string;
  generationTriggerKey?: string;
  leagueId: string;
  reason?: string;
}

export interface RegenerateEditorialContentResult {
  actionId: string | null;
  generation: GenerateLeagueBlogPostResult | null;
  originalContentItemId: string;
  replacementContentItemId: string | null;
  status:
    | "already_current"
    | "blocked"
    | "conflict"
    | "not_found"
    | "published"
    | "skipped";
  transition?: ContentLifecycleTransitionResult;
}

export interface CorrectEditorialContentInput {
  actorUserId?: string | null;
  affectedWeeks: CorrectionMatchupWeek[];
  changedMatchups: CorrectionChangedMatchup[];
  contentItemId: string;
  correctionHash: string;
  generationTriggerKey?: string;
  leagueId: string;
  reason?: string;
}

export interface CorrectEditorialContentResult {
  actionId: string | null;
  generation: GenerateLeagueBlogPostResult | null;
  originalContentItemId: string;
  replacementContentItemId: string | null;
  status:
    | "already_current"
    | "blocked"
    | "conflict"
    | "not_found"
    | "published"
    | "skipped";
  transition?: ContentLifecycleTransitionResult;
}

interface EditorialContentRow {
  authorPersona: AiPersona | null;
  dedupKey: string;
  id: string;
  kind: "blog" | "ingest_event" | "news";
  leagueId: string | null;
  metadata: Record<string, unknown>;
  status: "published" | "retracted" | "superseded";
  title: string;
}

function cleanReason(value: string | undefined, input: { required: boolean }) {
  const reason = (value ?? "").replace(/\s+/g, " ").trim();
  if (input.required && reason.length === 0) {
    throw new AppError({
      code: "EDITORIAL_REASON_REQUIRED",
      message: "A retraction reason is required",
      status: 400,
    });
  }
  if (reason.length > MAX_EDITORIAL_REASON_LENGTH) {
    throw new AppError({
      code: "EDITORIAL_REASON_TOO_LONG",
      message: "Editorial reasons must be 500 characters or fewer",
      status: 400,
    });
  }
  return reason;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function contentTypeFromMetadata(metadata: Record<string, unknown>) {
  const article = metadataRecord(metadata.article);
  const candidates = [
    metadata.contentType,
    metadata.content_type,
    article.contentType,
  ];
  const contentType = candidates.find(
    (candidate): candidate is AiContentType =>
      typeof candidate === "string" && isAiContentType(candidate),
  );
  if (!contentType) {
    throw new AppError({
      code: "EDITORIAL_CONTENT_TYPE_MISSING",
      message: "This post does not carry a regeneratable AI content type",
      status: 409,
    });
  }
  return contentType;
}

function editorialRegenerationTriggerKey(
  contentItemId: string,
  nonce = randomUUID(),
): string {
  return `editorial-regenerate:${contentItemId}:${nonce}`;
}

function correctionTriggerKey(
  contentItemId: string,
  correctionHash: string,
  nonce = randomUUID(),
): string {
  return `correction:${contentItemId}:${correctionHash}:${nonce}`;
}

async function loadEditorialContentRow(
  tx: LeagueScopedTx,
  input: { contentItemId: string; leagueId: string },
): Promise<EditorialContentRow | null> {
  const [row] = await tx
    .select({
      authorPersona: contentItems.authorPersona,
      dedupKey: contentItems.dedupKey,
      id: contentItems.id,
      kind: contentItems.kind,
      leagueId: contentItems.leagueId,
      metadata: contentItems.metadata,
      status: contentItems.status,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.id, input.contentItemId),
        eq(contentItems.leagueId, input.leagueId),
        eq(contentItems.kind, "blog"),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function latestReplacement(
  tx: LeagueScopedTx,
  input: { contentItemId: string; leagueId: string },
): Promise<{ id: string } | null> {
  const rows = await tx
    .select({
      createdAt: contentItems.createdAt,
      id: contentItems.id,
      publishedAt: contentItems.publishedAt,
      status: contentItems.status,
      supersedesContentItemId: contentItems.supersedesContentItemId,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.leagueId, input.leagueId),
        eq(contentItems.kind, "blog"),
      ),
    );

  const childrenByParent = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.supersedesContentItemId) {
      continue;
    }
    const existing = childrenByParent.get(row.supersedesContentItemId) ?? [];
    existing.push(row);
    childrenByParent.set(row.supersedesContentItemId, existing);
  }

  const descendants: typeof rows = [];
  const stack = [...(childrenByParent.get(input.contentItemId) ?? [])];
  while (stack.length > 0) {
    const row = stack.pop();
    if (!row) {
      continue;
    }
    descendants.push(row);
    stack.push(...(childrenByParent.get(row.id) ?? []));
  }

  const [published] = descendants
    .filter((row) => row.status === "published")
    .sort(
      (left, right) =>
        right.publishedAt.getTime() - left.publishedAt.getTime() ||
        right.createdAt.getTime() - left.createdAt.getTime(),
    );
  return published ? { id: published.id } : null;
}

async function latestEditorialAction(
  tx: LeagueScopedTx,
  input: {
    action: NewEditorialAction["action"];
    contentItemId: string;
    leagueId: string;
  },
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: editorialActions.id })
    .from(editorialActions)
    .where(
      and(
        eq(editorialActions.leagueId, input.leagueId),
        eq(editorialActions.action, input.action),
        or(
          eq(editorialActions.targetContentItemId, input.contentItemId),
          eq(editorialActions.beforeContentItemId, input.contentItemId),
        ),
      ),
    )
    .orderBy(desc(editorialActions.createdAt), desc(editorialActions.id))
    .limit(1);
  return row ?? null;
}

async function latestCorrectionAction(
  tx: LeagueScopedTx,
  input: {
    contentItemId: string;
    correctionHash: string;
    leagueId: string;
  },
): Promise<{
  afterContentItemId: string | null;
  id: string;
  metadata: Record<string, unknown>;
} | null> {
  const [row] = await tx
    .select({
      afterContentItemId: editorialActions.afterContentItemId,
      id: editorialActions.id,
      metadata: editorialActions.metadata,
    })
    .from(editorialActions)
    .where(
      and(
        eq(editorialActions.leagueId, input.leagueId),
        eq(editorialActions.action, "correct"),
        eq(editorialActions.targetContentItemId, input.contentItemId),
        eq(editorialActions.beforeContentItemId, input.contentItemId),
        sql`${editorialActions.metadata}->>'correctionHash' = ${input.correctionHash}`,
      ),
    )
    .orderBy(desc(editorialActions.createdAt), desc(editorialActions.id))
    .limit(1);
  return row ?? null;
}

async function insertEditorialAction(
  tx: LeagueScopedTx,
  values: NewEditorialAction,
): Promise<string> {
  const [row] = await tx
    .insert(editorialActions)
    .values(values)
    .returning({ id: editorialActions.id });
  if (!row) {
    throw new AppError({
      code: "EDITORIAL_ACTION_NOT_RECORDED",
      message: "Editorial action could not be recorded",
      status: 500,
    });
  }
  return row.id;
}

async function withdrawPublishedReplacementInTx(
  tx: LeagueScopedTx,
  input: {
    contentItemId: string;
    leagueId: string;
    now: Date;
  },
): Promise<void> {
  await tx
    .update(contentItems)
    .set({
      status: "retracted",
      statusChangedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(contentItems.id, input.contentItemId),
        eq(contentItems.leagueId, input.leagueId),
        eq(contentItems.status, "published"),
      ),
    );
}

function editorialNotFound(): AppError {
  return new AppError({
    code: "EDITORIAL_CONTENT_NOT_FOUND",
    message: "Editorial content item could not be found",
    status: 404,
  });
}

function unsupportedStatus(status: EditorialContentRow["status"]): AppError {
  return new AppError({
    code: "EDITORIAL_CONTENT_NOT_PUBLISHED",
    message: `Only published posts can be regenerated; current status is ${status}`,
    status: 409,
  });
}

export async function retractEditorialContentItem(
  deps: EditorialLifecycleDeps,
  input: RetractEditorialContentInput,
): Promise<RetractEditorialContentResult> {
  const reason = cleanReason(input.reason, { required: true });
  const result = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (
      tx,
    ): Promise<{
      actionId: string | null;
      commit: ContentLifecycleTransitionCommit;
    }> => {
      const row = await loadEditorialContentRow(tx, input);
      if (!row) {
        throw editorialNotFound();
      }
      const existingAction = await latestEditorialAction(tx, {
        action: "retract",
        contentItemId: input.contentItemId,
        leagueId: input.leagueId,
      });
      const commit = await retractContentItemInLeagueTx(deps, tx, {
        contentItemId: input.contentItemId,
        leagueId: input.leagueId,
      });

      let actionId = existingAction?.id ?? null;
      if (commit.transition.status === "changed" && !actionId) {
        actionId = await insertEditorialAction(tx, {
          action: "retract",
          actorUserId: input.actorUserId,
          beforeContentItemId: input.contentItemId,
          leagueId: input.leagueId,
          metadata: {
            status: commit.transition.status,
            statusChangedAt: commit.transition.statusChangedAt,
          },
          reason,
          targetContentItemId: input.contentItemId,
        });
      }
      return { actionId, commit };
    },
  );
  await result.commit.notify();

  return {
    actionId: result.actionId,
    contentItemId: input.contentItemId,
    reason,
    status: result.commit.transition.status,
    transition: result.commit.transition,
  };
}

export async function regenerateEditorialContentItem(
  deps: AiGenerationDependencies,
  input: RegenerateEditorialContentInput,
): Promise<RegenerateEditorialContentResult> {
  const reason = cleanReason(input.reason, { required: false });
  const triggerKey =
    input.generationTriggerKey ??
    editorialRegenerationTriggerKey(input.contentItemId);
  const original = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (tx) => {
      const row = await loadEditorialContentRow(tx, input);
      if (!row) {
        throw editorialNotFound();
      }
      const replacement = await latestReplacement(tx, input);
      const action = await latestEditorialAction(tx, {
        action: "regenerate",
        contentItemId: input.contentItemId,
        leagueId: input.leagueId,
      });
      return { action, replacement, row };
    },
  );

  if (original.row.status === "superseded" && original.replacement) {
    return {
      actionId: original.action?.id ?? null,
      generation: null,
      originalContentItemId: input.contentItemId,
      replacementContentItemId: original.replacement.id,
      status: "already_current",
    };
  }

  const regeneratesDeadEndSuperseded =
    original.row.status === "superseded" && !original.replacement;
  if (original.row.status !== "published" && !regeneratesDeadEndSuperseded) {
    throw unsupportedStatus(original.row.status);
  }
  if (!original.row.authorPersona) {
    throw new AppError({
      code: "EDITORIAL_PERSONA_MISSING",
      message: "This post does not carry an AI persona for regeneration",
      status: 409,
    });
  }

  const persona = original.row.authorPersona;
  const contentType = contentTypeFromMetadata(original.row.metadata);
  const generation = await import("@/ai").then(({ generateLeagueBlogPost }) =>
    generateLeagueBlogPost({
      deps,
      input: {
        contentType,
        leagueId: input.leagueId,
        persona,
        editorialContext: {
          actorUserId: input.actorUserId,
          kind: "regenerate",
          originalContentItemId: original.row.id,
          reason,
        },
        supersedes: {
          contentItemId: original.row.id,
          dedupKey: original.row.dedupKey,
          dedupNonce: regeneratesDeadEndSuperseded ? triggerKey : undefined,
        },
        triggerKey,
      },
    }),
  );

  if (generation.status !== "published") {
    const actionId =
      original.action?.id ??
      (await withLeagueContext(deps.db, input.leagueId, (tx) =>
        insertEditorialAction(tx, {
          action: "regenerate",
          actorUserId: input.actorUserId,
          beforeContentItemId: input.contentItemId,
          leagueId: input.leagueId,
          metadata: {
            generation,
            reason,
            triggerKey,
          },
          reason,
          targetContentItemId: input.contentItemId,
        }),
      ));
    return {
      actionId,
      generation,
      originalContentItemId: input.contentItemId,
      replacementContentItemId: null,
      status: generation.status,
    };
  }

  const committed = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (
      tx,
    ): Promise<
      | {
          actionId: string;
          commit: ContentLifecycleTransitionCommit;
          status: "already_current" | "published";
        }
      | {
          actionId: null;
          commit: ContentLifecycleTransitionCommit;
          status: "conflict" | "not_found";
        }
    > => {
      const commit = await supersedeContentItemInLeagueTx(deps, tx, {
        contentItemId: input.contentItemId,
        leagueId: input.leagueId,
        replacementContentItemId: generation.contentItemId,
      });

      if (
        commit.transition.status === "conflict" ||
        commit.transition.status === "not_found"
      ) {
        await withdrawPublishedReplacementInTx(tx, {
          contentItemId: generation.contentItemId,
          leagueId: input.leagueId,
          now: deps.now?.() ?? new Date(),
        });
        return {
          actionId: null,
          commit,
          status:
            commit.transition.status === "not_found" ? "not_found" : "conflict",
        };
      }

      const actionId = await insertEditorialAction(tx, {
        action: "regenerate",
        actorUserId: input.actorUserId,
        afterContentItemId: generation.contentItemId,
        beforeContentItemId: input.contentItemId,
        leagueId: input.leagueId,
        metadata: {
          generation,
          reason,
          transition: commit.transition,
          triggerKey,
        },
        reason,
        targetContentItemId: input.contentItemId,
      });
      return {
        actionId,
        commit,
        status: generation.reused ? "already_current" : "published",
      };
    },
  );
  await committed.commit.notify();

  return {
    actionId: committed.actionId,
    generation,
    originalContentItemId: input.contentItemId,
    replacementContentItemId:
      committed.status === "published" || committed.status === "already_current"
        ? generation.contentItemId
        : null,
    status: committed.status,
    transition: committed.commit.transition,
  };
}

export async function correctEditorialContentItem(
  deps: AiGenerationDependencies,
  input: CorrectEditorialContentInput,
): Promise<CorrectEditorialContentResult> {
  const reason = cleanReason(
    input.reason ??
      "Score correction changed a published post's referenced week.",
    { required: false },
  );
  const triggerKey =
    input.generationTriggerKey ??
    correctionTriggerKey(input.contentItemId, input.correctionHash);
  const original = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (tx) => {
      const row = await loadEditorialContentRow(tx, input);
      if (!row) {
        return { action: null, replacement: null, row: null };
      }
      const replacement = await latestReplacement(tx, input);
      const action = await latestCorrectionAction(tx, {
        contentItemId: input.contentItemId,
        correctionHash: input.correctionHash,
        leagueId: input.leagueId,
      });
      return { action, replacement, row };
    },
  );

  if (!original.row) {
    return {
      actionId: null,
      generation: null,
      originalContentItemId: input.contentItemId,
      replacementContentItemId: null,
      status: "not_found",
    };
  }

  if (original.action) {
    return {
      actionId: original.action.id,
      generation: null,
      originalContentItemId: input.contentItemId,
      replacementContentItemId:
        original.action.afterContentItemId ?? original.replacement?.id ?? null,
      status: "already_current",
    };
  }

  const correctsDeadEndSuperseded =
    original.row.status === "superseded" && !original.replacement;
  if (original.row.status === "superseded" && original.replacement) {
    return {
      actionId: null,
      generation: null,
      originalContentItemId: input.contentItemId,
      replacementContentItemId: original.replacement.id,
      status: "already_current",
    };
  }

  if (original.row.status !== "published" && !correctsDeadEndSuperseded) {
    return {
      actionId: null,
      generation: null,
      originalContentItemId: input.contentItemId,
      replacementContentItemId: null,
      status: "skipped",
    };
  }

  if (!original.row.authorPersona) {
    throw new AppError({
      code: "EDITORIAL_PERSONA_MISSING",
      message: "This post does not carry an AI persona for correction",
      status: 409,
    });
  }

  const persona = original.row.authorPersona;
  const contentType = contentTypeFromMetadata(original.row.metadata);
  const correction = {
    affectedWeeks: input.affectedWeeks,
    changedMatchups: input.changedMatchups,
    correctionHash: input.correctionHash,
    originalContentItemId: input.contentItemId,
    reason,
  };
  const generation = await import("@/ai").then(({ generateLeagueBlogPost }) =>
    generateLeagueBlogPost({
      deps,
      input: {
        contentType,
        correction,
        leagueId: input.leagueId,
        persona,
        editorialContext: {
          actorUserId: input.actorUserId ?? null,
          affectedWeeks: input.affectedWeeks,
          changedMatchups: input.changedMatchups,
          correctionHash: input.correctionHash,
          kind: "correction",
          originalContentItemId: original.row.id,
          reason,
        },
        supersedes: {
          contentItemId: original.row.id,
          dedupKey: original.row.dedupKey,
          dedupNonce: correctsDeadEndSuperseded ? triggerKey : undefined,
        },
        triggerKey,
      },
    }),
  );

  if (generation.status !== "published") {
    return {
      actionId: null,
      generation,
      originalContentItemId: input.contentItemId,
      replacementContentItemId: null,
      status: generation.status,
    };
  }

  const committed = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (
      tx,
    ): Promise<
      | {
          actionId: string;
          commit: ContentLifecycleTransitionCommit;
          status: "already_current" | "published";
        }
      | {
          actionId: null;
          commit: ContentLifecycleTransitionCommit;
          status: "conflict" | "not_found";
        }
    > => {
      const commit = await supersedeContentItemInLeagueTx(deps, tx, {
        contentItemId: input.contentItemId,
        leagueId: input.leagueId,
        replacementContentItemId: generation.contentItemId,
      });

      if (
        commit.transition.status === "conflict" ||
        commit.transition.status === "not_found"
      ) {
        await withdrawPublishedReplacementInTx(tx, {
          contentItemId: generation.contentItemId,
          leagueId: input.leagueId,
          now: deps.now?.() ?? new Date(),
        });
        return {
          actionId: null,
          commit,
          status:
            commit.transition.status === "not_found" ? "not_found" : "conflict",
        };
      }

      const actionId = await insertEditorialAction(tx, {
        action: "correct",
        actorUserId: input.actorUserId ?? null,
        afterContentItemId: generation.contentItemId,
        beforeContentItemId: input.contentItemId,
        leagueId: input.leagueId,
        metadata: {
          affectedWeeks: input.affectedWeeks,
          changedMatchups: input.changedMatchups,
          correctionHash: input.correctionHash,
          generation,
          reason,
          transition: commit.transition,
          triggerKey,
        },
        reason,
        targetContentItemId: input.contentItemId,
      });
      return {
        actionId,
        commit,
        status: generation.reused ? "already_current" : "published",
      };
    },
  );
  await committed.commit.notify();

  return {
    actionId: committed.actionId,
    generation,
    originalContentItemId: input.contentItemId,
    replacementContentItemId:
      committed.status === "published" || committed.status === "already_current"
        ? generation.contentItemId
        : null,
    status: committed.status,
    transition: committed.commit.transition,
  };
}
