import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  buildPersonaBylineMap,
  resolvePersonaByline,
} from "@/ai/persona-display";
import type { AiPersona } from "@/ai/personas";
import { contentItemIsPublished } from "@/content/lifecycle";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  contentItems,
  type LeagueFeedMatchedEntity,
  leagueFeedReferences,
  leagues,
  type Member,
  members,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import {
  articleDek,
  articleHasTag,
  articleHeroImageUrl,
  articleTags,
} from "./article-metadata";
import { editorialImportance, publicationRankScore } from "./front";
import {
  LEAGUE_PUBLICATION_SECTIONS,
  type LeaguePublicationSectionId,
  type PublicationSection,
  resolveLeaguePublicationSection,
} from "./sections";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LeagueFeedKind = "blog" | "ingest_event" | "news";

type LeagueContentRow = {
  authorPersona: AiPersona | null;
  id: string;
  kind: LeagueFeedKind;
  metadata: Record<string, unknown>;
  publishedAt: Date;
  summary: string;
  title: string;
};

type LeagueCentralReferenceRow = {
  contentItemId: string;
  framingSummary: string | null;
  framingTitle: string | null;
  id: string;
  matchedEntities: LeagueFeedMatchedEntity[];
  metadata: Record<string, unknown>;
  publishedAt: Date;
  reason: string;
  relevanceScore: number;
  source: string | null;
  sourceUrl: string | null;
  summary: string;
  title: string;
};

export interface LeagueFeedItem {
  id: string;
  contentItemId: string;
  scope: "league" | "central";
  kind: LeagueFeedKind;
  title: string;
  summary: string;
  dek?: string;
  sourceLabel: string;
  sourceUrl: string;
  authorPersona: AiPersona | null;
  publishedAt: string;
  relevanceReason: string;
  relevanceScore: number;
  section: PublicationSection<LeaguePublicationSectionId>;
  tags?: string[];
  thumbnailUrl?: string;
  editorialImportance?: number;
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
  activeSection: PublicationSection<LeaguePublicationSectionId> | null;
  activeTag?: string | null;
  sections: readonly PublicationSection<LeaguePublicationSectionId>[];
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

function hasActiveArticleFilter(input: {
  activeSection: PublicationSection<LeaguePublicationSectionId> | null;
  tag?: string | null;
}): boolean {
  return Boolean(input.activeSection || input.tag?.trim());
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
  editorialImportance: importance,
  kind,
  publishedAt,
  relevanceScore,
}: Pick<
  LeagueFeedItem,
  "editorialImportance" | "kind" | "publishedAt" | "relevanceScore"
>): number {
  return publicationRankScore({
    editorialImportance: importance,
    kindBoostHours: kindBoostHours(kind),
    publishedAt,
    relevanceScore,
  });
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
          contentItemIsPublished(),
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
  input: {
    leagueId: string;
    limit?: number;
    sectionId?: LeaguePublicationSectionId;
    tag?: string | null;
    userId: string;
    userRole?: Member["role"];
  },
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

  const userRole =
    input.userRole ??
    (
      await db
        .select({ role: members.role })
        .from(members)
        .where(
          and(
            eq(members.organizationId, input.leagueId),
            eq(members.userId, input.userId),
          ),
        )
        .limit(1)
    )[0]?.role;

  if (!userRole) {
    return { status: "forbidden" };
  }

  const limit = boundedLimit(input.limit);
  const candidateLimit = input.sectionId
    ? MAX_LIMIT
    : Math.min(limit * 3, MAX_LIMIT);
  const activeSection =
    LEAGUE_PUBLICATION_SECTIONS.find(
      (section) => section.id === input.sectionId,
    ) ?? null;
  const scanAllCandidates = hasActiveArticleFilter({
    activeSection,
    tag: input.tag,
  });
  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const pageLimit = scanAllCandidates ? MAX_LIMIT : candidateLimit;
    const leagueRows: LeagueContentRow[] = [];
    const centralRows: LeagueCentralReferenceRow[] = [];
    let leagueOffset = 0;
    let centralOffset = 0;

    while (true) {
      const page = await tx
        .select({
          authorPersona: contentItems.authorPersona,
          id: contentItems.id,
          kind: contentItems.kind,
          metadata: contentItems.metadata,
          publishedAt: contentItems.publishedAt,
          summary: contentItems.summary,
          title: contentItems.title,
        })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, input.leagueId),
            inArray(contentItems.kind, ["blog", "ingest_event"]),
            contentItemIsPublished(),
          ),
        )
        .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
        .limit(pageLimit)
        .offset(leagueOffset);

      leagueRows.push(...page);

      if (!scanAllCandidates || page.length < pageLimit) {
        break;
      }

      leagueOffset += page.length;
    }

    while (true) {
      const page = await tx
        .select({
          contentItemId: contentItems.id,
          framingSummary: leagueFeedReferences.framingSummary,
          framingTitle: leagueFeedReferences.framingTitle,
          id: leagueFeedReferences.id,
          matchedEntities: leagueFeedReferences.matchedEntities,
          metadata: contentItems.metadata,
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
            contentItemIsPublished(),
          ),
        )
        .orderBy(
          desc(leagueFeedReferences.relevanceScore),
          desc(contentItems.publishedAt),
        )
        .limit(pageLimit)
        .offset(centralOffset);

      centralRows.push(...page);

      if (!scanAllCandidates || page.length < pageLimit) {
        break;
      }

      centralOffset += page.length;
    }

    const personaBylines = buildPersonaBylineMap(
      await tx
        .select({
          name: aiPersonaCards.name,
          persona: aiPersonaCards.persona,
          purpose: aiPersonaCards.purpose,
        })
        .from(aiPersonaCards)
        .where(eq(aiPersonaCards.leagueId, input.leagueId)),
    );

    const leagueItems: LeagueFeedItem[] = leagueRows.map((row) => {
      const title = row.title;
      const summary = row.summary;
      const byline = resolvePersonaByline(row.authorPersona, personaBylines);

      return {
        authorPersona: row.authorPersona,
        contentItemId: row.id,
        dek: articleDek(row.metadata, summary),
        id: row.id,
        kind: row.kind,
        editorialImportance: editorialImportance(row.metadata),
        matchedEntities: [],
        publishedAt: row.publishedAt.toISOString(),
        relevanceReason: "",
        relevanceScore: 0,
        scope: "league",
        section: resolveLeaguePublicationSection({
          authorPersona: row.authorPersona,
          kind: row.kind,
          metadata: row.metadata,
          summary,
          title,
        }),
        sourceLabel: row.kind === "blog" ? byline.label : "League activity",
        sourceUrl: "",
        summary,
        tags: articleTags(row.metadata),
        thumbnailUrl: articleHeroImageUrl(row.metadata),
        title,
      };
    });

    const centralItems: LeagueFeedItem[] = centralRows.map((row) => {
      const title = row.framingTitle ?? row.title;
      const summary = row.framingSummary ?? row.summary;

      return {
        authorPersona: null,
        contentItemId: row.contentItemId,
        dek: row.framingSummary ?? articleDek(row.metadata, row.summary),
        id: row.id,
        kind: "news",
        editorialImportance: editorialImportance(row.metadata),
        matchedEntities: row.matchedEntities,
        publishedAt: row.publishedAt.toISOString(),
        relevanceReason: row.reason,
        relevanceScore: row.relevanceScore,
        scope: "central",
        section: resolveLeaguePublicationSection({
          authorPersona: null,
          kind: "news",
          metadata: row.metadata,
          summary,
          title,
        }),
        sourceLabel: row.source ?? "Central news",
        sourceUrl: row.sourceUrl ?? "",
        summary,
        tags: articleTags(row.metadata),
        thumbnailUrl: articleHeroImageUrl(row.metadata),
        title,
      };
    });

    return sortFeedItems([...leagueItems, ...centralItems])
      .filter((item) => !activeSection || item.section.id === activeSection.id)
      .filter((item) => articleHasTag(item.tags, input.tag))
      .slice(0, limit);
  });

  return {
    data: {
      activeSection,
      activeTag: input.tag?.trim() || null,
      items: scoped,
      league,
      sections: LEAGUE_PUBLICATION_SECTIONS,
      userRole,
    },
    status: "ready",
  };
}
