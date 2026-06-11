import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { contentItems } from "@/db/schema";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export interface CentralNewsHubItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
}

export interface CentralNewsHubData {
  items: CentralNewsHubItem[];
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

export async function getCentralNewsHubData(
  db: Db,
  input: { limit?: number } = {},
): Promise<CentralNewsHubData> {
  const rows = await db
    .select({
      id: contentItems.id,
      publishedAt: contentItems.publishedAt,
      source: contentItems.source,
      sourceUrl: contentItems.sourceUrl,
      summary: contentItems.summary,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(and(isNull(contentItems.leagueId), eq(contentItems.kind, "news")))
    .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
    .limit(boundedLimit(input.limit));

  return {
    items: rows.map((row) => ({
      id: row.id,
      publishedAt: row.publishedAt.toISOString(),
      source: row.source ?? "Unknown source",
      sourceUrl: row.sourceUrl ?? "",
      summary: row.summary,
      title: row.title,
    })),
  };
}
