import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { logger } from "@/core/logging";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import { type ContentItem, contentItems } from "@/db/schema";
import { PUSH_EVENTS, type PushNotifier } from "@/push/interfaces";
import { REALTIME_EVENTS, type RealtimePublisher } from "@/realtime/interfaces";

export const CONTENT_ITEM_STATUSES = [
  "published",
  "superseded",
  "retracted",
] as const;

export type ContentItemStatus = (typeof CONTENT_ITEM_STATUSES)[number];

export const PUBLISHED_CONTENT_STATUS = "published" as const;

export function contentItemIsPublished() {
  return eq(contentItems.status, PUBLISHED_CONTENT_STATUS);
}

export type ContentLifecycleStatus =
  | "already_current"
  | "changed"
  | "conflict"
  | "not_found";

export interface ContentLifecycleTransitionResult {
  status: ContentLifecycleStatus;
  contentItemId: string;
  previousStatus?: ContentItemStatus;
  statusChangedAt?: string;
}

export interface ContentLifecycleDeps {
  db: Db;
  now?: () => Date;
  push?: PushNotifier;
  realtime?: RealtimePublisher;
}

export interface RetractContentItemInput {
  contentItemId: string;
  leagueId: string | null;
}

export interface SupersedeContentItemInput {
  contentItemId: string;
  leagueId: string | null;
  replacementContentItemId: string;
}

type ContentLifecycleDb = Db | LeagueScopedTx;
type LifecycleTargetStatus = Exclude<ContentItemStatus, "published">;
type ContentLifecycleNotifyDeps = Omit<ContentLifecycleDeps, "db">;

interface ContentLifecycleRow {
  id: string;
  leagueId: string | null;
  status: ContentItemStatus;
  statusChangedAt: Date;
  title: string;
}

export interface ContentLifecycleTransitionCommit {
  notify: () => Promise<void>;
  transition: ContentLifecycleTransitionResult;
}

export function supersedingContentDedupKey(
  item: Pick<ContentItem, "dedupKey" | "id">,
): string {
  const source = `${item.id}:${item.dedupKey}`;
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 16);
  return `supersedes:${item.id}:${digest}`;
}

export async function retractContentItem(
  deps: ContentLifecycleDeps,
  input: RetractContentItemInput,
): Promise<ContentLifecycleTransitionResult> {
  const commit = await runContentLifecycleQuery(deps.db, input.leagueId, (db) =>
    retractContentItemInDb(deps, db, input),
  );
  await commit.notify();
  return commit.transition;
}

export async function retractContentItemInLeagueTx(
  deps: ContentLifecycleNotifyDeps,
  tx: LeagueScopedTx,
  input: RetractContentItemInput,
): Promise<ContentLifecycleTransitionCommit> {
  return retractContentItemInDb(deps, tx, input);
}

async function retractContentItemInDb(
  deps: ContentLifecycleNotifyDeps,
  db: ContentLifecycleDb,
  input: RetractContentItemInput,
): Promise<ContentLifecycleTransitionCommit> {
  const transition = await transitionContentItemStatusInTx(db, deps, {
    contentItemId: input.contentItemId,
    leagueId: input.leagueId,
    targetStatus: "retracted",
  });

  return {
    notify: async () => {
      if (transition.status === "changed" && transition.row) {
        await emitRetracted(deps, transition.row);
      }
    },
    transition: transitionResult(input.contentItemId, transition),
  };
}

export async function supersedeContentItem(
  deps: ContentLifecycleDeps,
  input: SupersedeContentItemInput,
): Promise<ContentLifecycleTransitionResult> {
  const commit = await runContentLifecycleQuery(deps.db, input.leagueId, (db) =>
    supersedeContentItemInDb(deps, db, input),
  );
  await commit.notify();
  return commit.transition;
}

export async function supersedeContentItemInLeagueTx(
  deps: ContentLifecycleNotifyDeps,
  tx: LeagueScopedTx,
  input: SupersedeContentItemInput,
): Promise<ContentLifecycleTransitionCommit> {
  return supersedeContentItemInDb(deps, tx, input);
}

async function supersedeContentItemInDb(
  deps: ContentLifecycleNotifyDeps,
  db: ContentLifecycleDb,
  input: SupersedeContentItemInput,
): Promise<ContentLifecycleTransitionCommit> {
  const transition = await transitionContentItemStatusInTx(db, deps, {
    contentItemId: input.contentItemId,
    leagueId: input.leagueId,
    targetStatus: "superseded",
  });

  return {
    notify: async () => {
      if (transition.status === "changed" && transition.row) {
        await emitSuperseded(
          deps,
          transition.row,
          input.replacementContentItemId,
        );
      }
    },
    transition: transitionResult(input.contentItemId, transition),
  };
}

async function transitionContentItemStatusInTx(
  db: ContentLifecycleDb,
  deps: ContentLifecycleNotifyDeps,
  input: {
    contentItemId: string;
    leagueId: string | null;
    targetStatus: LifecycleTargetStatus;
  },
): Promise<{
  row?: ContentLifecycleRow;
  status: ContentLifecycleStatus;
  previousStatus?: ContentItemStatus;
}> {
  const row = await loadContentLifecycleRow(db, input);
  if (!row) {
    return { status: "not_found" };
  }

  if (row.status === input.targetStatus) {
    return {
      previousStatus: row.status,
      row,
      status: "already_current",
    };
  }

  const allowedPreviousStatuses: ContentItemStatus[] =
    input.targetStatus === "retracted"
      ? [PUBLISHED_CONTENT_STATUS, "superseded"]
      : [PUBLISHED_CONTENT_STATUS];
  if (!allowedPreviousStatuses.includes(row.status)) {
    return {
      previousStatus: row.status,
      row,
      status: "conflict",
    };
  }

  const timestamp = deps.now?.() ?? new Date();
  const [updated] = await db
    .update(contentItems)
    .set({
      status: input.targetStatus,
      statusChangedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(contentItems.id, input.contentItemId),
        inArray(contentItems.status, allowedPreviousStatuses),
        scopedContentPredicate(input.leagueId),
      ),
    )
    .returning({
      id: contentItems.id,
      leagueId: contentItems.leagueId,
      status: contentItems.status,
      statusChangedAt: contentItems.statusChangedAt,
      title: contentItems.title,
    });

  if (!updated) {
    const current = await loadContentLifecycleRow(db, input);
    return current?.status === input.targetStatus
      ? {
          previousStatus: current.status,
          row: current,
          status: "already_current",
        }
      : {
          previousStatus: current?.status,
          row: current ?? undefined,
          status: current ? "conflict" : "not_found",
        };
  }

  return {
    previousStatus: row.status,
    row: updated,
    status: "changed",
  };
}

async function runContentLifecycleQuery<T>(
  db: Db,
  leagueId: string | null,
  query: (db: ContentLifecycleDb) => Promise<T>,
): Promise<T> {
  return leagueId ? withLeagueContext(db, leagueId, query) : query(db);
}

async function loadContentLifecycleRow(
  db: ContentLifecycleDb,
  input: { contentItemId: string; leagueId: string | null },
): Promise<ContentLifecycleRow | null> {
  const [row] = await db
    .select({
      id: contentItems.id,
      leagueId: contentItems.leagueId,
      status: contentItems.status,
      statusChangedAt: contentItems.statusChangedAt,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.id, input.contentItemId),
        scopedContentPredicate(input.leagueId),
      ),
    )
    .limit(1);

  return row ?? null;
}

function scopedContentPredicate(leagueId: string | null) {
  return leagueId === null
    ? isNull(contentItems.leagueId)
    : eq(contentItems.leagueId, leagueId);
}

function transitionResult(
  contentItemId: string,
  transition: {
    previousStatus?: ContentItemStatus;
    row?: ContentLifecycleRow;
    status: ContentLifecycleStatus;
  },
): ContentLifecycleTransitionResult {
  return {
    contentItemId,
    previousStatus: transition.previousStatus,
    status: transition.status,
    statusChangedAt: transition.row?.statusChangedAt.toISOString(),
  };
}

async function emitRetracted(
  deps: ContentLifecycleNotifyDeps,
  row: ContentLifecycleRow,
): Promise<void> {
  const at = deps.now?.() ?? new Date();
  try {
    await deps.realtime?.publishContentRetracted({
      at: at.toISOString(),
      contentItemId: row.id,
      leagueId: row.leagueId,
      statusChangedAt: row.statusChangedAt.toISOString(),
      title: row.title,
      type: REALTIME_EVENTS.contentRetracted,
      v: 1,
    });
  } catch (error) {
    logger.warn("Realtime content retracted event failed", {
      contentItemId: row.id,
      error,
      leagueId: row.leagueId,
    });
  }

  if (!row.leagueId) {
    return;
  }

  try {
    await deps.push?.notifyLeague({
      at,
      body: row.title,
      leagueId: row.leagueId,
      tag: `league:${row.leagueId}:content:${row.id}:retracted`,
      title: "Post retracted",
      type: PUSH_EVENTS.contentRetracted,
      url: `/leagues/${row.leagueId}/press/${row.id}`,
    });
  } catch (error) {
    logger.warn("Push content retracted notification failed", {
      contentItemId: row.id,
      error,
      leagueId: row.leagueId,
    });
  }
}

async function emitSuperseded(
  deps: ContentLifecycleNotifyDeps,
  row: ContentLifecycleRow,
  replacementContentItemId: string,
): Promise<void> {
  const at = deps.now?.() ?? new Date();
  try {
    await deps.realtime?.publishContentSuperseded({
      at: at.toISOString(),
      contentItemId: row.id,
      leagueId: row.leagueId,
      replacementContentItemId,
      statusChangedAt: row.statusChangedAt.toISOString(),
      title: row.title,
      type: REALTIME_EVENTS.contentSuperseded,
      v: 1,
    });
  } catch (error) {
    logger.warn("Realtime content superseded event failed", {
      contentItemId: row.id,
      error,
      leagueId: row.leagueId,
      replacementContentItemId,
    });
  }

  if (!row.leagueId) {
    return;
  }

  try {
    await deps.push?.notifyLeague({
      at,
      body: row.title,
      leagueId: row.leagueId,
      tag: `league:${row.leagueId}:content:${row.id}:superseded`,
      title: "Post updated",
      type: PUSH_EVENTS.contentSuperseded,
      url: `/leagues/${row.leagueId}/press/${replacementContentItemId}`,
    });
  } catch (error) {
    logger.warn("Push content superseded notification failed", {
      contentItemId: row.id,
      error,
      leagueId: row.leagueId,
      replacementContentItemId,
    });
  }
}
