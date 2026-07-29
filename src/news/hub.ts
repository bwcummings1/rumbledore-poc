import { and, desc, eq, isNull, sql } from "drizzle-orm";
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

/**
 * Loads hub candidates with a query count that does not grow with the corpus.
 *
 * ## Why two queries rather than one
 *
 * The front is ranked by `publicationRankScore`, which is recency PLUS
 * editorial importance — an older story with importance 100 is meant to lead
 * over a hundred fresh minor ones, and there is a test that says so. A single
 * newest-first window cannot honour that: the important story is old, so it
 * falls outside the window and is never even considered.
 *
 * The previous code solved it by paging through the ENTIRE published corpus on
 * every request — correct ranking, but a query count and a row count that both
 * grew without bound. At a thousand articles that is ten round trips and a
 * thousand rows serialized to render thirty.
 *
 * So: take the newest N, take the N most important, and merge. Both are single
 * bounded queries, so the cost is flat, and a story can now reach the front by
 * either route — which is exactly what the rank function says should happen.
 *
 * `editorialImportance` lives in a jsonb blob, so the prominence query sorts on
 * an expression Postgres cannot serve from an index today. It is still ONE
 * bounded statement rather than N, which is the part that was pathological.
 * Materialising that column is worth doing if the corpus gets large.
 */
async function getCentralNewsRows(
  db: Db,
  input: { candidateLimit: number; sectionId?: string | null },
): Promise<CentralNewsRow[]> {
  const columns = {
    id: contentItems.id,
    metadata: contentItems.metadata,
    publishedAt: contentItems.publishedAt,
    source: contentItems.source,
    sourceUrl: contentItems.sourceUrl,
    summary: contentItems.summary,
    title: contentItems.title,
  };
  const published = and(
    isNull(contentItems.leagueId),
    eq(contentItems.kind, "news"),
    contentItemIsPublished(),
  );

  // A third bounded route for the active section. Sections are usually
  // declared in metadata, so this finds a sparse section's older stories
  // exactly, rather than hoping they fall inside the recency window.
  //
  // It does NOT replace the JS filter below: `resolveCentralPublicationSection`
  // can also INFER a section from a story's title and summary, and no WHERE
  // clause can reproduce that. So this query widens the candidate pool with
  // the rows SQL can identify, and the JS filter still decides membership.
  const sectionQuery = input.sectionId
    ? db
        .select(columns)
        .from(contentItems)
        .where(
          and(
            published,
            sql`${contentItems.metadata} ->> 'section' = ${input.sectionId}`,
          ),
        )
        .orderBy(desc(contentItems.publishedAt))
        .limit(input.candidateLimit)
    : null;

  const [recent, prominent, sectioned] = await Promise.all([
    db
      .select(columns)
      .from(contentItems)
      .where(published)
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
      .limit(input.candidateLimit),
    db
      .select(columns)
      .from(contentItems)
      .where(published)
      .orderBy(
        desc(
          sql`coalesce((${contentItems.metadata} ->> 'editorialImportance')::numeric, 0)`,
        ),
        desc(contentItems.publishedAt),
      )
      .limit(input.candidateLimit),
    sectionQuery ?? Promise.resolve([] as CentralNewsRow[]),
  ]);

  // Merged by id: a story that is both recent and important appears in both
  // result sets and must be ranked once, not twice.
  const byId = new Map<string, CentralNewsRow>();
  for (const row of [...recent, ...prominent, ...sectioned]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
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
  // A filter throws most candidates away, so it needs a wider net to fill the
  // same page. Both cases are still a fixed, bounded number of rows.
  const filtered = Boolean(activeSection || input.tag?.trim());
  const rows = await getCentralNewsRows(db, {
    candidateLimit: filtered ? MAX_LIMIT : Math.min(limit * 3, MAX_LIMIT),
    sectionId: activeSection?.id ?? null,
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
