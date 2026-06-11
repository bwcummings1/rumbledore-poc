import { and, eq, isNull, sql } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { contentItems } from "@/db/schema";
import { stableContentHash } from "@/ingestion/hash";
import type { CentralNewsSource, CentralNewsSourceItem } from "./interfaces";
import { MockCentralNewsSource } from "./mocks";

const DEFAULT_TOPIC = "nfl fantasy football";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const TRACKING_QUERY_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
]);

export interface RefreshCentralNewsInput {
  topic?: string;
  limit?: number;
}

export interface CentralNewsIngestionDependencies {
  db: Db;
  source: CentralNewsSource;
  now?: () => Date;
}

export interface RefreshCentralNewsResult {
  fetched: number;
  skipped: number;
  deduped: number;
  inserted: number;
  updated: number;
  unchanged: number;
  contentItemIds: string[];
}

interface SourceAttribution {
  source: string;
  url: string;
}

interface NormalizedCentralNewsItem {
  body: string;
  canonicalUrl: string | null;
  contentHash: string;
  dedupKey: string;
  publishedAt: Date;
  source: string;
  sourceIds: string[];
  sources: SourceAttribution[];
  sourceUrl: string;
  summary: string;
  title: string;
  topics: string[];
}

type PersistStatus = "inserted" | "updated" | "unchanged";

function timestamp(deps: Pick<CentralNewsIngestionDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function attributionKey(source: SourceAttribution): string {
  return `${source.source}\n${source.url}`;
}

function mergeAttributions(
  left: readonly SourceAttribution[],
  right: readonly SourceAttribution[],
): SourceAttribution[] {
  return [
    ...new Map(
      [...left, ...right].map((item) => [attributionKey(item), item]),
    ).values(),
  ].sort(
    (a, b) => a.source.localeCompare(b.source) || a.url.localeCompare(b.url),
  );
}

export function canonicalizeNewsUrl(rawUrl: string | undefined): string | null {
  const trimmed = cleanText(rawUrl);
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.startsWith("utm_") ||
        TRACKING_QUERY_PARAMS.has(normalizedKey)
      ) {
        url.searchParams.delete(key);
      }
    }

    const sortedParams = new URLSearchParams();
    [...url.searchParams.entries()]
      .sort(
        ([leftKey, leftValue], [rightKey, rightValue]) =>
          leftKey.localeCompare(rightKey) ||
          leftValue.localeCompare(rightValue),
      )
      .forEach(([key, value]) => {
        sortedParams.append(key, value);
      });
    url.search = sortedParams.toString();
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizedTitleKey(title: string): string {
  return `title:${stableContentHash(title.toLowerCase())}`;
}

function dedupKeyFor({
  canonicalUrl,
  title,
}: {
  canonicalUrl: string | null;
  title: string;
}): string {
  return canonicalUrl ? `url:${canonicalUrl}` : normalizedTitleKey(title);
}

function stableMetadata(item: Omit<NormalizedCentralNewsItem, "contentHash">) {
  return {
    canonicalUrl: item.canonicalUrl,
    sourceIds: item.sourceIds,
    sources: item.sources,
    topics: item.topics,
  };
}

function contentHashFor(
  item: Omit<NormalizedCentralNewsItem, "contentHash">,
): string {
  return stableContentHash({
    body: item.body,
    dedupKey: item.dedupKey,
    metadata: stableMetadata(item),
    publishedAt: item.publishedAt,
    source: item.source,
    sourceUrl: item.sourceUrl,
    summary: item.summary,
    title: item.title,
  });
}

function normalizeSourceItem(
  item: CentralNewsSourceItem,
): NormalizedCentralNewsItem | null {
  const title = cleanText(item.title);
  const source = cleanText(item.source);
  const rawSourceUrl = cleanText(item.sourceUrl);
  if (!title || !source || !rawSourceUrl) {
    return null;
  }

  const publishedAt = new Date(item.publishedAt);
  if (Number.isNaN(publishedAt.getTime())) {
    return null;
  }

  const canonicalUrl =
    canonicalizeNewsUrl(item.canonicalUrl) ?? canonicalizeNewsUrl(rawSourceUrl);
  const sourceUrl = canonicalUrl ?? rawSourceUrl;
  const summary = cleanText(item.summary);
  const body = cleanText(item.body);
  const normalized = {
    body,
    canonicalUrl,
    dedupKey: dedupKeyFor({ canonicalUrl, title }),
    publishedAt,
    source,
    sourceIds: item.id ? [item.id] : [],
    sources: [{ source, url: sourceUrl }],
    sourceUrl,
    summary,
    title,
    topics: sortedUnique(item.topics ?? []),
  };

  return {
    ...normalized,
    contentHash: contentHashFor(normalized),
  };
}

function qualityScore(item: NormalizedCentralNewsItem): number {
  return (
    item.body.length * 2 +
    item.summary.length +
    item.title.length +
    (item.canonicalUrl ? 100 : 0)
  );
}

function mergeDuplicate(
  existing: NormalizedCentralNewsItem,
  candidate: NormalizedCentralNewsItem,
): NormalizedCentralNewsItem {
  const primary =
    qualityScore(candidate) > qualityScore(existing) ? candidate : existing;
  const merged = {
    ...primary,
    publishedAt:
      candidate.publishedAt > existing.publishedAt
        ? candidate.publishedAt
        : existing.publishedAt,
    sourceIds: sortedUnique([...existing.sourceIds, ...candidate.sourceIds]),
    sources: mergeAttributions(existing.sources, candidate.sources),
    topics: sortedUnique([...existing.topics, ...candidate.topics]),
  };

  return {
    ...merged,
    contentHash: contentHashFor(merged),
  };
}

function normalizeAndDeduplicate(items: readonly CentralNewsSourceItem[]): {
  deduped: number;
  items: NormalizedCentralNewsItem[];
  skipped: number;
} {
  let skipped = 0;
  let deduped = 0;
  const byDedupKey = new Map<string, NormalizedCentralNewsItem>();

  for (const sourceItem of items) {
    const normalized = normalizeSourceItem(sourceItem);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    const existing = byDedupKey.get(normalized.dedupKey);
    if (existing) {
      byDedupKey.set(normalized.dedupKey, mergeDuplicate(existing, normalized));
      deduped += 1;
      continue;
    }

    byDedupKey.set(normalized.dedupKey, normalized);
  }

  return {
    deduped,
    items: [...byDedupKey.values()].sort(
      (left, right) =>
        right.publishedAt.getTime() - left.publishedAt.getTime() ||
        left.title.localeCompare(right.title),
    ),
    skipped,
  };
}

function contentValues(item: NormalizedCentralNewsItem, at: Date) {
  return {
    body: item.body,
    contentHash: item.contentHash,
    dedupKey: item.dedupKey,
    kind: "news" as const,
    leagueId: null,
    metadata: stableMetadata(item),
    publishedAt: item.publishedAt,
    source: item.source,
    sourceUrl: item.sourceUrl,
    summary: item.summary,
    title: item.title,
    updatedAt: at,
  };
}

async function findExistingCentralNews(db: Db, dedupKey: string) {
  const [existing] = await db
    .select({
      contentHash: contentItems.contentHash,
      id: contentItems.id,
    })
    .from(contentItems)
    .where(
      and(
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
        eq(contentItems.dedupKey, dedupKey),
      ),
    )
    .limit(1);

  return existing ?? null;
}

async function persistCentralNewsItem({
  at,
  db,
  item,
}: {
  at: Date;
  db: Db;
  item: NormalizedCentralNewsItem;
}): Promise<{ id: string; status: PersistStatus }> {
  const existing = await findExistingCentralNews(db, item.dedupKey);
  const values = contentValues(item, at);

  if (existing?.contentHash === item.contentHash) {
    return { id: existing.id, status: "unchanged" };
  }

  if (existing) {
    const [updated] = await db
      .update(contentItems)
      .set(values)
      .where(
        and(
          isNull(contentItems.leagueId),
          eq(contentItems.kind, "news"),
          eq(contentItems.dedupKey, item.dedupKey),
        ),
      )
      .returning({ id: contentItems.id });
    if (!updated) {
      throw new AppError({
        code: "CENTRAL_NEWS_UPDATE_FAILED",
        message: "Central news item could not be updated",
        status: 500,
      });
    }
    return { id: updated.id, status: "updated" };
  }

  const [inserted] = await db
    .insert(contentItems)
    .values(values)
    .onConflictDoNothing({
      target: [contentItems.kind, contentItems.dedupKey],
      where: sql`${contentItems.leagueId} is null`,
    })
    .returning({ id: contentItems.id });

  if (inserted) {
    return { id: inserted.id, status: "inserted" };
  }

  const conflicted = await findExistingCentralNews(db, item.dedupKey);
  if (!conflicted) {
    throw new AppError({
      code: "CENTRAL_NEWS_INSERT_FAILED",
      message: "Central news item could not be inserted or reloaded",
      status: 500,
    });
  }

  if (conflicted.contentHash === item.contentHash) {
    return { id: conflicted.id, status: "unchanged" };
  }

  const [updated] = await db
    .update(contentItems)
    .set(values)
    .where(eq(contentItems.id, conflicted.id))
    .returning({ id: contentItems.id });
  if (!updated) {
    throw new AppError({
      code: "CENTRAL_NEWS_CONFLICT_UPDATE_FAILED",
      message: "Central news item could not be updated after a dedup conflict",
      status: 500,
    });
  }

  return { id: updated.id, status: "updated" };
}

export function createMockNewsDependencies(
  db: Db,
): CentralNewsIngestionDependencies {
  return {
    db,
    source: new MockCentralNewsSource(),
  };
}

export async function refreshCentralNews({
  deps,
  input = {},
}: {
  deps: CentralNewsIngestionDependencies;
  input?: RefreshCentralNewsInput;
}): Promise<RefreshCentralNewsResult> {
  const at = timestamp(deps);
  const topic = cleanText(input.topic) || DEFAULT_TOPIC;
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const fetched = await deps.source.fetch({ limit, now: at, topic });
  const { deduped, items, skipped } = normalizeAndDeduplicate(fetched);
  const stats = {
    inserted: 0,
    unchanged: 0,
    updated: 0,
  };
  const contentItemIds: string[] = [];

  for (const item of items.slice(0, limit)) {
    const persisted = await persistCentralNewsItem({
      at,
      db: deps.db,
      item,
    });
    stats[persisted.status] += 1;
    contentItemIds.push(persisted.id);
  }

  return {
    contentItemIds,
    deduped,
    fetched: fetched.length,
    skipped,
    ...stats,
  };
}
