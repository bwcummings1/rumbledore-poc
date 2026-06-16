import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  buildPersonaBylineMap,
  resolvePersonaByline,
} from "@/ai/persona-display";
import type { PublicationStory } from "@/components/publication/story";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  contentItems,
  leagueFeedReferences,
  leagues,
  loreClaims,
  type Member,
  members,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import {
  articleDek,
  articleHeroImageUrl,
  articleLoreCitationIds,
  articleTags,
  sharedArticleTagCount,
} from "./article-metadata";
import { editorialImportance, publicationRankScore } from "./front";
import {
  resolveCentralPublicationSection,
  resolveLeaguePublicationSection,
} from "./sections";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RELATED_CANDIDATE_LIMIT = 50;
const RELATED_LIMIT = 4;

export type PublicationArticleStory = PublicationStory;

export interface PublicationArticleCanonCitation {
  claimId: string;
  href: string;
  provenance: "steward" | "verified" | "vote";
  ratifiedAt: string | null;
  title: string;
}

export interface PublicationArticleViewData {
  scope: "central" | "league";
  publicationLabel: string;
  publicationHref: string;
  backHref: string;
  backLabel: string;
  tagHrefBase: string;
  article: {
    id: string;
    kind: "news" | "blog";
    headline: string;
    dek: string;
    body: string;
    byline: string;
    bylineDetail: string;
    publishedAt: string;
    section: {
      label: string;
      href: string;
    };
    tags: string[];
    heroImageUrl: string;
    sourceUrl: string;
    canonCitations: PublicationArticleCanonCitation[];
  };
  relatedStories: PublicationArticleStory[];
}

export interface CentralNewsArticleData extends PublicationArticleViewData {
  scope: "central";
}

export interface LeaguePressArticleData extends PublicationArticleViewData {
  scope: "league";
  league: {
    id: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    name: string;
    season: number;
  };
  userRole: Member["role"];
}

export type CentralNewsArticleLoadResult =
  | { status: "ready"; data: CentralNewsArticleData }
  | { status: "not_found" };

export type LeaguePressArticleLoadResult =
  | { status: "ready"; data: LeaguePressArticleData }
  | { status: "not_found" }
  | { status: "forbidden" };

interface RelatedCandidate extends PublicationArticleStory {
  editorialImportance?: number;
  relevanceScore?: number;
  sectionId: string;
  tags: string[];
}

function sourceLabel(value: string | null): string {
  return value?.trim() || "Central news";
}

function cleanUrl(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "";
}

function sourceUrlFor(metadata: unknown, sourceUrl: string | null): string {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return (
    (typeof record.canonicalUrl === "string"
      ? cleanUrl(record.canonicalUrl)
      : "") || cleanUrl(sourceUrl)
  );
}

function matchedEntityTags(
  entities: readonly { label?: string | null }[] | null | undefined,
): string[] {
  return (entities ?? []).flatMap((entity) => {
    const label = entity.label?.trim();
    return label ? [label] : [];
  });
}

function relatedScore(
  candidate: RelatedCandidate,
  input: { sectionId: string; tags: readonly string[] },
): number {
  const sharedTags = sharedArticleTagCount(candidate.tags, input.tags);
  const sectionBoost = candidate.sectionId === input.sectionId ? 10_000 : 0;
  const tagBoost = sharedTags * 1_000;
  return (
    sectionBoost +
    tagBoost +
    publicationRankScore({
      editorialImportance: candidate.editorialImportance,
      publishedAt: candidate.publishedAt,
      relevanceScore: candidate.relevanceScore,
    })
  );
}

function selectRelatedStories(
  candidates: readonly RelatedCandidate[],
  input: { sectionId: string; tags: readonly string[] },
): PublicationArticleStory[] {
  const related = candidates.filter(
    (candidate) =>
      candidate.sectionId === input.sectionId ||
      sharedArticleTagCount(candidate.tags, input.tags) > 0,
  );
  const pool = related.length > 0 ? related : candidates;

  return pool
    .map((candidate) => ({
      candidate,
      score: relatedScore(candidate, input),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        Date.parse(right.candidate.publishedAt) -
          Date.parse(left.candidate.publishedAt) ||
        left.candidate.headline.localeCompare(right.candidate.headline),
    )
    .slice(0, RELATED_LIMIT)
    .map(({ candidate }) => ({
      byline: candidate.byline,
      dek: candidate.dek,
      headline: candidate.headline,
      href: candidate.href,
      hrefLabel: candidate.hrefLabel,
      id: candidate.id,
      origin: candidate.origin,
      publishedAt: candidate.publishedAt,
      relevanceReason: candidate.relevanceReason,
      sectionTag: candidate.sectionTag,
      sourceUrl: candidate.sourceUrl,
      thumbnailAlt: candidate.thumbnailAlt,
      thumbnailUrl: candidate.thumbnailUrl,
    }));
}

async function loadCanonCitationsInContext(
  tx: LeagueScopedTx,
  input: { claimIds: readonly string[]; leagueId: string },
): Promise<PublicationArticleCanonCitation[]> {
  const claimIds = [...new Set(input.claimIds)];
  if (claimIds.length === 0) {
    return [];
  }

  const rows = await tx
    .select({
      id: loreClaims.id,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      title: loreClaims.title,
    })
    .from(loreClaims)
    .where(
      and(
        eq(loreClaims.leagueId, input.leagueId),
        inArray(loreClaims.id, claimIds),
        eq(loreClaims.status, "canon"),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));

  return claimIds.flatMap((claimId) => {
    const row = byId.get(claimId);
    if (!row) {
      return [];
    }
    return [
      {
        claimId,
        href: `/leagues/${input.leagueId}/lore/${claimId}`,
        provenance: row.ratifiedBy ?? "vote",
        ratifiedAt: row.ratifiedAt?.toISOString() ?? null,
        title: row.title,
      },
    ];
  });
}

export async function getCentralNewsArticleData(
  db: Db,
  input: { articleId: string },
): Promise<CentralNewsArticleLoadResult> {
  if (!UUID_RE.test(input.articleId)) {
    return { status: "not_found" };
  }

  const [row] = await db
    .select({
      body: contentItems.body,
      id: contentItems.id,
      metadata: contentItems.metadata,
      publishedAt: contentItems.publishedAt,
      source: contentItems.source,
      sourceUrl: contentItems.sourceUrl,
      summary: contentItems.summary,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.id, input.articleId),
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
      ),
    )
    .limit(1);

  if (!row) {
    return { status: "not_found" };
  }

  const section = resolveCentralPublicationSection({
    metadata: row.metadata,
    summary: row.summary,
    title: row.title,
  });
  const tags = articleTags(row.metadata);
  const relatedRows = await db
    .select({
      body: contentItems.body,
      id: contentItems.id,
      metadata: contentItems.metadata,
      publishedAt: contentItems.publishedAt,
      source: contentItems.source,
      sourceUrl: contentItems.sourceUrl,
      summary: contentItems.summary,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(and(isNull(contentItems.leagueId), eq(contentItems.kind, "news")))
    .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
    .limit(RELATED_CANDIDATE_LIMIT);

  const candidates: RelatedCandidate[] = relatedRows
    .filter((candidate) => candidate.id !== row.id)
    .map((candidate) => {
      const candidateSection = resolveCentralPublicationSection({
        metadata: candidate.metadata,
        summary: candidate.summary,
        title: candidate.title,
      });

      return {
        byline: sourceLabel(candidate.source),
        dek: articleDek(candidate.metadata, candidate.summary),
        editorialImportance: editorialImportance(candidate.metadata),
        headline: candidate.title,
        href: `/news/articles/${candidate.id}`,
        hrefLabel: "Read story",
        id: candidate.id,
        origin: "source",
        publishedAt: candidate.publishedAt.toISOString(),
        sectionId: candidateSection.id,
        sectionTag: candidateSection.label,
        sourceUrl: sourceUrlFor(candidate.metadata, candidate.sourceUrl),
        tags: articleTags(candidate.metadata),
        thumbnailAlt: candidate.title,
        thumbnailUrl: articleHeroImageUrl(candidate.metadata),
      };
    });

  return {
    data: {
      article: {
        body: row.body,
        byline: sourceLabel(row.source),
        bylineDetail: "Central NFL and fantasy desk",
        dek: articleDek(row.metadata, row.summary),
        headline: row.title,
        heroImageUrl: articleHeroImageUrl(row.metadata),
        id: row.id,
        kind: "news",
        publishedAt: row.publishedAt.toISOString(),
        section: {
          href: `/news/${section.slug}`,
          label: section.label,
        },
        sourceUrl: sourceUrlFor(row.metadata, row.sourceUrl),
        tags,
        canonCitations: [],
      },
      backHref: "/news",
      backLabel: "News front",
      publicationHref: "/news",
      publicationLabel: "Rumbledore News",
      relatedStories: selectRelatedStories(candidates, {
        sectionId: section.id,
        tags,
      }),
      scope: "central",
      tagHrefBase: "/news",
    },
    status: "ready",
  };
}

export async function getLeaguePressArticleData(
  db: Db,
  input: {
    leagueId: string;
    postId: string;
    userId: string;
    userRole?: Member["role"];
  },
): Promise<LeaguePressArticleLoadResult> {
  if (!UUID_RE.test(input.leagueId) || !UUID_RE.test(input.postId)) {
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

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [articleRow] = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        body: contentItems.body,
        id: contentItems.id,
        metadata: contentItems.metadata,
        publishedAt: contentItems.publishedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, input.postId),
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.kind, "blog"),
        ),
      )
      .limit(1);

    if (!articleRow) {
      return null;
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

    const articleSection = resolveLeaguePublicationSection({
      authorPersona: articleRow.authorPersona,
      kind: "blog",
      metadata: articleRow.metadata,
      summary: articleRow.summary,
      title: articleRow.title,
    });
    const tags = articleTags(articleRow.metadata);
    const canonCitations = await loadCanonCitationsInContext(tx, {
      claimIds: articleLoreCitationIds(articleRow.metadata),
      leagueId: input.leagueId,
    });

    const leagueRows = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        id: contentItems.id,
        metadata: contentItems.metadata,
        publishedAt: contentItems.publishedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.kind, "blog"),
        ),
      )
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
      .limit(RELATED_CANDIDATE_LIMIT);

    const centralRows = await tx
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
        ),
      )
      .orderBy(
        desc(leagueFeedReferences.relevanceScore),
        desc(contentItems.publishedAt),
      )
      .limit(RELATED_CANDIDATE_LIMIT);

    const leagueCandidates: RelatedCandidate[] = leagueRows
      .filter((candidate) => candidate.id !== articleRow.id)
      .map((candidate) => {
        const byline = resolvePersonaByline(
          candidate.authorPersona,
          personaBylines,
        );
        const candidateSection = resolveLeaguePublicationSection({
          authorPersona: candidate.authorPersona,
          kind: "blog",
          metadata: candidate.metadata,
          summary: candidate.summary,
          title: candidate.title,
        });

        return {
          byline: byline.label,
          dek: articleDek(candidate.metadata, candidate.summary),
          editorialImportance: editorialImportance(candidate.metadata),
          headline: candidate.title,
          href: `/leagues/${input.leagueId}/press/${candidate.id}`,
          hrefLabel: "Read post",
          id: candidate.id,
          origin: "cast",
          publishedAt: candidate.publishedAt.toISOString(),
          sectionId: candidateSection.id,
          sectionTag: candidateSection.label,
          tags: articleTags(candidate.metadata),
          thumbnailAlt: candidate.title,
          thumbnailUrl: articleHeroImageUrl(candidate.metadata),
        };
      });

    const centralCandidates: RelatedCandidate[] = centralRows.map(
      (candidate) => {
        const title = candidate.framingTitle ?? candidate.title;
        const summary =
          candidate.framingSummary ??
          articleDek(candidate.metadata, candidate.summary);
        const candidateSection = resolveLeaguePublicationSection({
          authorPersona: null,
          kind: "news",
          metadata: candidate.metadata,
          summary,
          title,
        });

        return {
          byline: sourceLabel(candidate.source),
          dek: summary,
          editorialImportance: editorialImportance(candidate.metadata),
          headline: title,
          href: `/news/articles/${candidate.contentItemId}`,
          hrefLabel: "Read story",
          id: candidate.id,
          origin: "source",
          publishedAt: candidate.publishedAt.toISOString(),
          relevanceReason: candidate.reason,
          relevanceScore: candidate.relevanceScore,
          sectionId: candidateSection.id,
          sectionTag: candidateSection.label,
          sourceUrl: sourceUrlFor(candidate.metadata, candidate.sourceUrl),
          tags: [
            ...articleTags(candidate.metadata),
            ...matchedEntityTags(candidate.matchedEntities),
          ],
          thumbnailAlt: title,
          thumbnailUrl: articleHeroImageUrl(candidate.metadata),
        };
      },
    );

    const byline = resolvePersonaByline(
      articleRow.authorPersona,
      personaBylines,
    );
    return {
      article: {
        body: articleRow.body,
        byline: byline.label,
        bylineDetail: byline.detail,
        dek: articleDek(articleRow.metadata, articleRow.summary),
        headline: articleRow.title,
        heroImageUrl: articleHeroImageUrl(articleRow.metadata),
        id: articleRow.id,
        kind: "blog" as const,
        publishedAt: articleRow.publishedAt.toISOString(),
        section: {
          href: `/leagues/${input.leagueId}/press/${articleSection.slug}`,
          label: articleSection.label,
        },
        sourceUrl: "",
        tags,
        canonCitations,
      },
      relatedStories: selectRelatedStories(
        [...leagueCandidates, ...centralCandidates],
        {
          sectionId: articleSection.id,
          tags,
        },
      ),
    };
  });

  if (!scoped) {
    return { status: "not_found" };
  }

  return {
    data: {
      ...scoped,
      backHref: `/leagues/${league.id}/press`,
      backLabel: "The Press",
      league,
      publicationHref: `/leagues/${league.id}/press`,
      publicationLabel: `The ${league.name} Press`,
      scope: "league",
      tagHrefBase: `/leagues/${league.id}/press`,
      userRole,
    },
    status: "ready",
  };
}
