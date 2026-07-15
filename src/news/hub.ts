import { and, desc, eq, isNull } from "drizzle-orm";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  type LeagueFeedMatchedEntity,
  leagueFeedReferences,
  leagues,
  members,
} from "@/db/schema";
import {
  articleDek,
  articleHasTag,
  articleHeroImageUrl,
  articleTags,
} from "./article-metadata";
import { editorialImportance, publicationRankScore } from "./front";
import {
  CENTRAL_PUBLICATION_BRANCHES,
  CENTRAL_PUBLICATION_SECTIONS,
  type CentralPublicationBranch,
  type CentralPublicationSection,
  type CentralPublicationSectionId,
  resolveCentralPublicationSection,
} from "./sections";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const DEFAULT_RAIL_LIMIT = 4;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CentralNewsHubItem {
  id: string;
  title: string;
  summary: string;
  dek?: string;
  origin: "cast" | "source";
  source: string;
  sourceUrl: string;
  publishedAt: string;
  section: CentralPublicationSection;
  tags?: string[];
  thumbnailUrl?: string;
  editorialImportance?: number;
}

export interface CentralNewsForYourLeagueItem {
  id: string;
  contentItemId: string;
  title: string;
  summary: string;
  dek?: string;
  origin: "cast" | "source";
  source: string;
  sourceUrl: string;
  publishedAt: string;
  section: CentralPublicationSection;
  tags?: string[];
  thumbnailUrl?: string;
  editorialImportance?: number;
  relevanceReason: string;
  relevanceScore: number;
  matchedEntities: LeagueFeedMatchedEntity[];
}

export interface CentralNewsForYourLeagueRail {
  league: {
    id: string;
    name: string;
  };
  items: CentralNewsForYourLeagueItem[];
}

export interface CentralNewsHubData {
  activeSection: CentralPublicationSection | null;
  activeTag?: string | null;
  branches: readonly CentralPublicationBranch[];
  forYourLeague: CentralNewsForYourLeagueRail | null;
  items: CentralNewsHubItem[];
  sections: readonly CentralPublicationSection[];
}

type CentralNewsRow = {
  id: string;
  metadata: Record<string, unknown>;
  publishedAt: Date;
  source: string | null;
  sourceUrl: string | null;
  summary: string;
  title: string;
};

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function centralStoryOrigin(
  metadata: Record<string, unknown>,
): "cast" | "source" {
  return metadata.generatedBy === "central-journalist-engine"
    ? "cast"
    : "source";
}

function hubItemFromRow(row: CentralNewsRow): CentralNewsHubItem {
  const section = resolveCentralPublicationSection({
    metadata: row.metadata,
    summary: row.summary,
    title: row.title,
  });

  return {
    dek: articleDek(row.metadata, row.summary),
    section,
    editorialImportance: editorialImportance(row.metadata),
    id: row.id,
    origin: centralStoryOrigin(row.metadata),
    publishedAt: row.publishedAt.toISOString(),
    source: row.source ?? "Unknown source",
    sourceUrl: row.sourceUrl ?? "",
    summary: row.summary,
    tags: articleTags(row.metadata),
    thumbnailUrl: articleHeroImageUrl(row.metadata),
    title: row.title,
  };
}

async function getCentralNewsRows(
  db: Db,
  input: { candidateLimit: number; scanAllCandidates: boolean },
): Promise<CentralNewsRow[]> {
  const rows: CentralNewsRow[] = [];
  const pageLimit = input.scanAllCandidates ? MAX_LIMIT : input.candidateLimit;
  let offset = 0;

  while (true) {
    const page = await db
      .select({
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
          isNull(contentItems.leagueId),
          eq(contentItems.kind, "news"),
          contentItemIsPublished(),
        ),
      )
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
      .limit(pageLimit)
      .offset(offset);

    rows.push(...page);

    if (!input.scanAllCandidates || page.length < pageLimit) {
      return rows;
    }

    offset += page.length;
  }
}

export async function getCentralNewsHubData(
  db: Db,
  input: {
    forLeagueId?: string | null;
    limit?: number;
    sectionId?: CentralPublicationSectionId;
    tag?: string | null;
    userId?: string | null;
  } = {},
): Promise<CentralNewsHubData> {
  const limit = boundedLimit(input.limit);
  const activeSection =
    CENTRAL_PUBLICATION_SECTIONS.find(
      (section) => section.id === input.sectionId,
    ) ?? null;
  const rows = await getCentralNewsRows(db, {
    candidateLimit: MAX_LIMIT,
    scanAllCandidates: true,
  });

  return {
    activeSection,
    branches: CENTRAL_PUBLICATION_BRANCHES,
    forYourLeague: await getForYourLeagueRail(db, {
      leagueId: input.forLeagueId,
      limit: DEFAULT_RAIL_LIMIT,
      userId: input.userId,
    }),
    items: rows
      .map(hubItemFromRow)
      .filter((item) => !activeSection || item.section.id === activeSection.id)
      .filter((item) => articleHasTag(item.tags, input.tag))
      .sort(
        (left, right) =>
          publicationRankScore(right) - publicationRankScore(left) ||
          Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
          left.title.localeCompare(right.title),
      )
      .slice(0, limit),
    activeTag: input.tag?.trim() || null,
    sections: CENTRAL_PUBLICATION_SECTIONS,
  };
}

async function getForYourLeagueRail(
  db: Db,
  input: {
    leagueId?: string | null;
    limit: number;
    userId?: string | null;
  },
): Promise<CentralNewsForYourLeagueRail | null> {
  const leagueId = input.leagueId?.trim() ?? "";
  const userId = input.userId?.trim() ?? "";
  if (!UUID_RE.test(leagueId) || !UUID_RE.test(userId)) {
    return null;
  }

  const [membership] = await db
    .select({
      leagueId: leagues.id,
      leagueName: leagues.name,
    })
    .from(members)
    .innerJoin(leagues, eq(leagues.id, members.organizationId))
    .where(
      and(eq(members.organizationId, leagueId), eq(members.userId, userId)),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  const rows = await withLeagueContext(db, leagueId, async (tx) =>
    tx
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
          eq(leagueFeedReferences.leagueId, leagueId),
          isNull(contentItems.leagueId),
          eq(contentItems.kind, "news"),
          contentItemIsPublished(),
        ),
      )
      .orderBy(
        desc(leagueFeedReferences.relevanceScore),
        desc(contentItems.publishedAt),
      )
      .limit(Math.min(Math.max(input.limit * 3, input.limit), MAX_LIMIT)),
  );

  const items = rows
    .filter((row) => row.matchedEntities.length > 0)
    .map((row) => {
      const title = row.framingTitle ?? row.title;
      const summary = row.framingSummary ?? row.summary;
      const section = resolveCentralPublicationSection({
        metadata: row.metadata,
        summary: row.summary,
        title: row.title,
      });

      return {
        contentItemId: row.contentItemId,
        dek: row.framingSummary ?? articleDek(row.metadata, row.summary),
        editorialImportance: editorialImportance(row.metadata),
        id: row.id,
        matchedEntities: row.matchedEntities,
        origin: centralStoryOrigin(row.metadata),
        publishedAt: row.publishedAt.toISOString(),
        relevanceReason: row.reason,
        relevanceScore: row.relevanceScore,
        section,
        source: row.source ?? "Unknown source",
        sourceUrl: row.sourceUrl ?? "",
        summary,
        tags: articleTags(row.metadata),
        thumbnailUrl: articleHeroImageUrl(row.metadata),
        title,
      };
    })
    .sort(
      (left, right) =>
        publicationRankScore({
          editorialImportance: right.editorialImportance,
          publishedAt: right.publishedAt,
          relevanceScore: right.relevanceScore,
        }) -
          publicationRankScore({
            editorialImportance: left.editorialImportance,
            publishedAt: left.publishedAt,
            relevanceScore: left.relevanceScore,
          }) ||
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
        left.title.localeCompare(right.title),
    )
    .slice(0, input.limit);

  if (items.length === 0) {
    return null;
  }

  return {
    items,
    league: {
      id: membership.leagueId,
      name: membership.leagueName,
    },
  };
}
