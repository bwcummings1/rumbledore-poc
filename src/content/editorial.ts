import { and, desc, eq, or } from "drizzle-orm";
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
import {
  type ContentLifecycleTransitionResult,
  retractContentItem,
  supersedeContentItem,
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

function editorialRegenerationTriggerKey(contentItemId: string): string {
  return `editorial-regenerate:${contentItemId}`;
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
  const [row] = await tx
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.leagueId, input.leagueId),
        eq(contentItems.kind, "blog"),
        eq(contentItems.supersedesContentItemId, input.contentItemId),
        eq(contentItems.status, "published"),
      ),
    )
    .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
    .limit(1);
  return row ?? null;
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
  const existingAction = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (tx) => {
      const row = await loadEditorialContentRow(tx, input);
      if (!row) {
        throw editorialNotFound();
      }
      return latestEditorialAction(tx, {
        action: "retract",
        contentItemId: input.contentItemId,
        leagueId: input.leagueId,
      });
    },
  );

  const transition = await retractContentItem(deps, {
    contentItemId: input.contentItemId,
    leagueId: input.leagueId,
  });

  let actionId = existingAction?.id ?? null;
  if (transition.status === "changed" && !actionId) {
    actionId = await withLeagueContext(deps.db, input.leagueId, (tx) =>
      insertEditorialAction(tx, {
        action: "retract",
        actorUserId: input.actorUserId,
        beforeContentItemId: input.contentItemId,
        leagueId: input.leagueId,
        metadata: {
          status: transition.status,
          statusChangedAt: transition.statusChangedAt,
        },
        reason,
        targetContentItemId: input.contentItemId,
      }),
    );
  }

  return {
    actionId,
    contentItemId: input.contentItemId,
    reason,
    status: transition.status,
    transition,
  };
}

export async function regenerateEditorialContentItem(
  deps: AiGenerationDependencies,
  input: RegenerateEditorialContentInput,
): Promise<RegenerateEditorialContentResult> {
  const reason = cleanReason(input.reason, { required: false });
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

  if (original.row.status !== "published") {
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
        supersedes: {
          contentItemId: original.row.id,
          dedupKey: original.row.dedupKey,
        },
        triggerKey: editorialRegenerationTriggerKey(input.contentItemId),
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
            triggerKey: editorialRegenerationTriggerKey(input.contentItemId),
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

  const transition = await supersedeContentItem(deps, {
    contentItemId: input.contentItemId,
    leagueId: input.leagueId,
    replacementContentItemId: generation.contentItemId,
  });

  const actionId = await withLeagueContext(deps.db, input.leagueId, (tx) =>
    insertEditorialAction(tx, {
      action: "regenerate",
      actorUserId: input.actorUserId,
      afterContentItemId: generation.contentItemId,
      beforeContentItemId: input.contentItemId,
      leagueId: input.leagueId,
      metadata: {
        generation,
        reason,
        transition,
        triggerKey: editorialRegenerationTriggerKey(input.contentItemId),
      },
      reason,
      targetContentItemId: input.contentItemId,
    }),
  );

  return {
    actionId,
    generation,
    originalContentItemId: input.contentItemId,
    replacementContentItemId: generation.contentItemId,
    status: generation.reused ? "already_current" : "published",
    transition,
  };
}
