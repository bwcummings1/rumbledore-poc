import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AiPersona } from "@/ai/personas";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  type LeagueFeedMatchedEntity,
  leagueFeedReferences,
  leagues,
  type Member,
  members,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const HOUR_MS = 60 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LeagueFeedKind = "blog" | "ingest_event" | "news";

export interface LeagueFeedItem {
  id: string;
  contentItemId: string;
  scope: "league" | "central";
  kind: LeagueFeedKind;
  title: string;
  summary: string;
  sourceLabel: string;
  sourceUrl: string;
  authorPersona: AiPersona | null;
  publishedAt: string;
  relevanceReason: string;
  relevanceScore: number;
  matchedEntities: LeagueFeedMatchedEntity[];
}

export interface LeagueFeedData {
  league: {
    id: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    name: string;
    season: number;
  };
  userRole: Member["role"];
  items: LeagueFeedItem[];
}

export type LeagueFeedLoadResult =
  | { status: "ready"; data: LeagueFeedData }
  | { status: "not_found" }
  | { status: "forbidden" };

export interface UpsertLeagueFeedReferenceInput {
  leagueId: string;
  contentItemId: string;
  relevanceScore?: number;
  reason?: string;
  framingTitle?: string | null;
  framingSummary?: string | null;
  matchedEntities?: LeagueFeedMatchedEntity[];
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function cleanOptional(value: string | null | undefined): string | null {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function cleanRequired(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeRelevanceScore(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(Math.max(value, 0), 100);
}

function kindBoostHours(kind: LeagueFeedKind): number {
  switch (kind) {
    case "ingest_event":
      return 36;
    case "blog":
      return 24;
    case "news":
      return 0;
  }
}

function rankScore({
  kind,
  publishedAt,
  relevanceScore,
}: Pick<LeagueFeedItem, "kind" | "publishedAt" | "relevanceScore">): number {
  return (
    new Date(publishedAt).getTime() / HOUR_MS +
    kindBoostHours(kind) +
    relevanceScore
  );
}

function sortFeedItems(items: readonly LeagueFeedItem[]): LeagueFeedItem[] {
  return items
    .map((item) => ({ ...item, rankScore: rankScore(item) }))
    .sort(
      (left, right) =>
        right.rankScore - left.rankScore ||
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
        left.title.localeCompare(right.title),
    )
    .map(({ rankScore: _rankScore, ...item }) => item);
}

export async function upsertLeagueFeedReference(
  db: Db,
  input: UpsertLeagueFeedReferenceInput,
): Promise<{ id: string; contentItemId: string; relevanceScore: number }> {
  if (!UUID_RE.test(input.leagueId) || !UUID_RE.test(input.contentItemId)) {
    throw new AppError({
      code: "LEAGUE_FEED_REFERENCE_INVALID_ID",
      message: "League feed reference ids must be valid UUIDs",
      status: 400,
    });
  }

  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [centralItem] = await tx
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, input.contentItemId),
          isNull(contentItems.leagueId),
          eq(contentItems.kind, "news"),
        ),
      )
      .limit(1);

    if (!centralItem) {
      throw new AppError({
        code: "LEAGUE_FEED_REFERENCE_NOT_CENTRAL_NEWS",
        message: "League feed references can only point to central news items",
        status: 404,
      });
    }

    const relevanceScore = normalizeRelevanceScore(input.relevanceScore);
    const values = {
      contentItemId: input.contentItemId,
      framingSummary: cleanOptional(input.framingSummary),
      framingTitle: cleanOptional(input.framingTitle),
      leagueId: input.leagueId,
      matchedEntities: input.matchedEntities ?? [],
      reason: cleanRequired(input.reason),
      relevanceScore,
      updatedAt: new Date(),
    };

    const [reference] = await tx
      .insert(leagueFeedReferences)
      .values(values)
      .onConflictDoUpdate({
        target: [
          leagueFeedReferences.leagueId,
          leagueFeedReferences.contentItemId,
        ],
        set: {
          framingSummary: values.framingSummary,
          framingTitle: values.framingTitle,
          matchedEntities: values.matchedEntities,
          reason: values.reason,
          relevanceScore: values.relevanceScore,
          updatedAt: values.updatedAt,
        },
      })
      .returning({
        contentItemId: leagueFeedReferences.contentItemId,
        id: leagueFeedReferences.id,
        relevanceScore: leagueFeedReferences.relevanceScore,
      });

    if (!reference) {
      throw new AppError({
        code: "LEAGUE_FEED_REFERENCE_UPSERT_FAILED",
        message: "League feed reference could not be persisted",
        status: 500,
      });
    }

    return reference;
  });
}

export async function getLeagueFeedData(
  db: Db,
  input: { leagueId: string; userId: string; limit?: number },
): Promise<LeagueFeedLoadResult> {
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

  const [membership] = await db
    .select({ role: members.role })
    .from(members)
    .where(
      and(
        eq(members.organizationId, input.leagueId),
        eq(members.userId, input.userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return { status: "forbidden" };
  }

  const limit = boundedLimit(input.limit);
  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const leagueRows = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        id: contentItems.id,
        kind: contentItems.kind,
        publishedAt: contentItems.publishedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.leagueId, input.leagueId),
          inArray(contentItems.kind, ["blog", "ingest_event"]),
        ),
      )
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
      .limit(limit);

    const centralRows = await tx
      .select({
        contentItemId: contentItems.id,
        framingSummary: leagueFeedReferences.framingSummary,
        framingTitle: leagueFeedReferences.framingTitle,
        id: leagueFeedReferences.id,
        matchedEntities: leagueFeedReferences.matchedEntities,
        publishedAt: contentItems.publishedAt,
        reason: leagueFeedReferences.reason,
        relevanceScore: leagueFeedReferences.relevanceScore,
        source: contentItems.source,
        sourceUrl: contentItems.sourceUrl,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(leagueFeedReferences)
      .innerJoin(
        contentItems,
        eq(leagueFeedReferences.contentItemId, contentItems.id),
      )
      .where(
        and(
          eq(leagueFeedReferences.leagueId, input.leagueId),
          isNull(contentItems.leagueId),
          eq(contentItems.kind, "news"),
        ),
      )
      .orderBy(
        desc(leagueFeedReferences.relevanceScore),
        desc(contentItems.publishedAt),
      )
      .limit(limit);

    const leagueItems: LeagueFeedItem[] = leagueRows.map((row) => ({
      authorPersona: row.authorPersona,
      contentItemId: row.id,
      id: row.id,
      kind: row.kind,
      matchedEntities: [],
      publishedAt: row.publishedAt.toISOString(),
      relevanceReason: "",
      relevanceScore: 0,
      scope: "league",
      sourceLabel: row.kind === "blog" ? "League blog" : "League activity",
      sourceUrl: "",
      summary: row.summary,
      title: row.title,
    }));

    const centralItems: LeagueFeedItem[] = centralRows.map((row) => ({
      authorPersona: null,
      contentItemId: row.contentItemId,
      id: row.id,
      kind: "news",
      matchedEntities: row.matchedEntities,
      publishedAt: row.publishedAt.toISOString(),
      relevanceReason: row.reason,
      relevanceScore: row.relevanceScore,
      scope: "central",
      sourceLabel: row.source ?? "Central news",
      sourceUrl: row.sourceUrl ?? "",
      summary: row.framingSummary ?? row.summary,
      title: row.framingTitle ?? row.title,
    }));

    return sortFeedItems([...leagueItems, ...centralItems]).slice(0, limit);
  });

  return {
    data: {
      items: scoped,
      league,
      userRole: membership.role,
    },
    status: "ready",
  };
}
