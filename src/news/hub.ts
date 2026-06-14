import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { contentItems } from "@/db/schema";
import { articleDek, articleHasTag, articleTags } from "./article-metadata";
import { editorialImportance, publicationRankScore } from "./front";
import {
  CENTRAL_PUBLICATION_SECTIONS,
  type CentralPublicationSectionId,
  type PublicationSection,
  resolveCentralPublicationSection,
} from "./sections";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export interface CentralNewsHubItem {
  id: string;
  title: string;
  summary: string;
  dek?: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  section: PublicationSection<CentralPublicationSectionId>;
  tags?: string[];
  editorialImportance?: number;
}

export interface CentralNewsHubData {
  activeSection: PublicationSection<CentralPublicationSectionId> | null;
  activeTag?: string | null;
  items: CentralNewsHubItem[];
  sections: readonly PublicationSection<CentralPublicationSectionId>[];
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

export async function getCentralNewsHubData(
  db: Db,
  input: {
    limit?: number;
    sectionId?: CentralPublicationSectionId;
    tag?: string | null;
  } = {},
): Promise<CentralNewsHubData> {
  const limit = boundedLimit(input.limit);
  const candidateLimit = input.sectionId
    ? MAX_LIMIT
    : Math.min(limit * 3, MAX_LIMIT);
  const rows = await db
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
    .where(and(isNull(contentItems.leagueId), eq(contentItems.kind, "news")))
    .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
    .limit(candidateLimit);

  const activeSection =
    CENTRAL_PUBLICATION_SECTIONS.find(
      (section) => section.id === input.sectionId,
    ) ?? null;

  return {
    activeSection,
    items: rows
      .map((row) => {
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
          publishedAt: row.publishedAt.toISOString(),
          source: row.source ?? "Unknown source",
          sourceUrl: row.sourceUrl ?? "",
          summary: row.summary,
          tags: articleTags(row.metadata),
          title: row.title,
        };
      })
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
