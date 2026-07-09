import { and, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import type { LeagueScopedTx } from "@/db/rls";
import { withLeagueContext } from "@/db/rls";
import { contentItems, contentReactions, members } from "@/db/schema";
import { contentItemIsPublished } from "./lifecycle";
import {
  CONTENT_REACTION_DISPLAY,
  CONTENT_REACTION_EMOJIS,
  type ContentReactionEmoji,
  type ContentReactionSummary,
} from "./reaction-types";

interface ContentReactionCountRow {
  contentItemId: string;
  count: number;
  emoji: ContentReactionEmoji;
}

interface CurrentReactionRow {
  contentItemId: string;
  emoji: ContentReactionEmoji;
}

export interface LoadContentReactionSummariesInput {
  apiUrlFor?: (contentItemId: string) => string | undefined;
  contentItemIds: readonly string[];
  leagueId: string;
  memberId?: string | null;
}

export interface SetContentReactionInput {
  contentItemId: string;
  emoji: ContentReactionEmoji;
  leagueId: string;
  userId: string;
}

function blankSummary(apiUrl?: string): ContentReactionSummary {
  return {
    apiUrl,
    counts: CONTENT_REACTION_EMOJIS.map((emoji) => ({
      count: 0,
      emoji,
      ...CONTENT_REACTION_DISPLAY[emoji],
    })),
    currentEmoji: null,
    total: 0,
  };
}

function withReactionCount(
  summary: ContentReactionSummary,
  row: Pick<ContentReactionCountRow, "count" | "emoji">,
): ContentReactionSummary {
  const counts = summary.counts.map((count) =>
    count.emoji === row.emoji ? { ...count, count: row.count } : count,
  );
  return {
    ...summary,
    counts,
    total: counts.reduce((sum, count) => sum + count.count, 0),
  };
}

export async function getLeagueMemberIdForUser(
  db: Db,
  input: { leagueId: string; userId: string },
): Promise<string> {
  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, input.leagueId),
        eq(members.userId, input.userId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new AppError({
      code: "REACTION_MEMBER_NOT_FOUND",
      message: "Content reactions require league membership",
      status: 403,
    });
  }

  return membership.id;
}

export async function loadContentReactionSummaries(
  tx: LeagueScopedTx,
  input: LoadContentReactionSummariesInput,
): Promise<Map<string, ContentReactionSummary>> {
  const contentItemIds = [...new Set(input.contentItemIds)].filter(Boolean);
  const summaries = new Map<string, ContentReactionSummary>(
    contentItemIds.map((contentItemId) => [
      contentItemId,
      blankSummary(input.apiUrlFor?.(contentItemId)),
    ]),
  );
  if (contentItemIds.length === 0) {
    return summaries;
  }

  const countRows = await tx
    .select({
      contentItemId: contentReactions.contentItemId,
      count: sql<number>`count(*)::int`,
      emoji: contentReactions.emoji,
    })
    .from(contentReactions)
    .where(
      and(
        eq(contentReactions.leagueId, input.leagueId),
        inArray(contentReactions.contentItemId, contentItemIds),
      ),
    )
    .groupBy(contentReactions.contentItemId, contentReactions.emoji);

  const typedCountRows = countRows satisfies ContentReactionCountRow[];
  for (const row of typedCountRows) {
    const summary = summaries.get(row.contentItemId);
    if (!summary) {
      continue;
    }
    summaries.set(row.contentItemId, withReactionCount(summary, row));
  }

  if (input.memberId) {
    const currentRows = await tx
      .select({
        contentItemId: contentReactions.contentItemId,
        emoji: contentReactions.emoji,
      })
      .from(contentReactions)
      .where(
        and(
          eq(contentReactions.leagueId, input.leagueId),
          eq(contentReactions.memberId, input.memberId),
          inArray(contentReactions.contentItemId, contentItemIds),
        ),
      );

    const typedCurrentRows = currentRows satisfies CurrentReactionRow[];
    for (const row of typedCurrentRows) {
      const summary = summaries.get(row.contentItemId);
      if (summary) {
        summaries.set(row.contentItemId, {
          ...summary,
          currentEmoji: row.emoji,
        });
      }
    }
  }

  return summaries;
}

export async function setContentReaction(
  deps: { db: Db; now?: () => Date },
  input: SetContentReactionInput,
): Promise<ContentReactionSummary> {
  const memberId = await getLeagueMemberIdForUser(deps.db, {
    leagueId: input.leagueId,
    userId: input.userId,
  });
  const now = deps.now?.() ?? new Date();

  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [content] = await tx
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, input.contentItemId),
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.kind, "blog"),
          contentItemIsPublished(),
        ),
      )
      .limit(1);

    if (!content) {
      throw new AppError({
        code: "CONTENT_REACTION_TARGET_NOT_FOUND",
        message: "Reactions can only be cast on published league posts",
        status: 404,
      });
    }

    await tx
      .insert(contentReactions)
      .values({
        contentItemId: input.contentItemId,
        emoji: input.emoji,
        leagueId: input.leagueId,
        memberId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          contentReactions.leagueId,
          contentReactions.contentItemId,
          contentReactions.memberId,
        ],
        set: {
          emoji: input.emoji,
          updatedAt: now,
        },
      });

    const summaries = await loadContentReactionSummaries(tx, {
      apiUrlFor: (contentItemId) =>
        `/api/leagues/${input.leagueId}/press/${contentItemId}/reactions`,
      contentItemIds: [input.contentItemId],
      leagueId: input.leagueId,
      memberId,
    });
    return (
      summaries.get(input.contentItemId) ??
      blankSummary(
        `/api/leagues/${input.leagueId}/press/${input.contentItemId}/reactions`,
      )
    );
  });
}
