import { and, eq, isNull, sql } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { contentItems } from "@/db/schema";
import { stableContentHash } from "@/ingestion/hash";
import type {
  CentralNewsPlayerRef,
  CentralNewsSource,
  CentralNewsSourceItem,
} from "./interfaces";
import { MockCentralNewsSource } from "./mocks";
import {
  type CentralPublicationSectionId,
  resolveCentralPublicationSection,
} from "./sections";
import { tailorCentralNewsToLeagues } from "./tailoring";

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
  contentItemIds: string[];
  deduped: number;
  fetched: number;
  skipped: number;
  inserted: number;
  tailoredReferences: number;
  unchanged: number;
  updated: number;
}

interface SourceAttribution {
  source: string;
  url: string;
}

interface NormalizedCentralNewsBase {
  body: string;
  canonicalUrl: string | null;
  dedupKey: string;
  heroImageUrl: string | null;
  publishedAt: Date;
  playerRefs: CentralNewsPlayerRef[];
  source: string;
  sourceIds: string[];
  sources: SourceAttribution[];
  sourceTypes: string[];
  sourceUrl: string;
  summary: string;
  title: string;
  topics: string[];
}

interface NormalizedCentralNewsItem {
  body: string;
  canonicalUrl: string | null;
  centralSection: CentralPublicationSectionId;
  contentHash: string;
  dek: string;
  dedupKey: string;
  editorialImportance: number;
  heroImageUrl: string | null;
  publishedAt: Date;
  playerRefs: CentralNewsPlayerRef[];
  source: string;
  sourceIds: string[];
  sources: SourceAttribution[];
  sourceTypes: string[];
  sourceUrl: string;
  summary: string;
  tags: string[];
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const text = textValue(item);
    return text ? [text] : [];
  });
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function playerRefKey(
  ref: Pick<CentralNewsPlayerRef, "provider" | "providerId">,
): string {
  return `${ref.provider}\n${ref.providerId}`;
}

function normalizePlayerRefs(
  refs: readonly CentralNewsPlayerRef[] | undefined,
): CentralNewsPlayerRef[] {
  const byKey = new Map<string, CentralNewsPlayerRef>();

  for (const ref of refs ?? []) {
    const provider = cleanText(ref.provider).toLowerCase();
    const providerId = cleanText(ref.providerId);
    const label = cleanText(ref.label);
    if (!provider || !providerId) {
      continue;
    }

    const key = playerRefKey({ provider, providerId });
    const existing = byKey.get(key);
    byKey.set(key, {
      provider,
      providerId,
      ...(label || existing?.label ? { label: label || existing?.label } : {}),
    });
  }

  return [...byKey.values()].sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) ||
      left.providerId.localeCompare(right.providerId),
  );
}

function mergePlayerRefs(
  left: readonly CentralNewsPlayerRef[],
  right: readonly CentralNewsPlayerRef[],
): CentralNewsPlayerRef[] {
  return normalizePlayerRefs([...left, ...right]);
}

function playerRefsValue(value: unknown): CentralNewsPlayerRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return normalizePlayerRefs(
    value.flatMap((item) => {
      const record = asRecord(item);
      const provider = textValue(record.provider);
      const providerId = textValue(record.providerId);
      if (!provider || !providerId) {
        return [];
      }

      return [
        {
          provider,
          providerId,
          ...(textValue(record.label)
            ? { label: textValue(record.label) ?? undefined }
            : {}),
        },
      ];
    }),
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

function firstSentence(value: string): string {
  const trimmed = cleanText(value);
  const match = /^(.+?[.!?])(?:\s|$)/.exec(trimmed);
  return cleanText(match?.[1] ?? trimmed);
}

function truncateDek(value: string): string {
  const trimmed = cleanText(value);
  if (trimmed.length <= 180) {
    return trimmed;
  }

  return `${trimmed.slice(0, 177).trimEnd()}...`;
}

function dekFor({
  body,
  summary,
  title,
}: Pick<NormalizedCentralNewsBase, "body" | "summary" | "title">): string {
  return (
    truncateDek(summary) ||
    truncateDek(firstSentence(body)) ||
    truncateDek(title)
  );
}

function heroImageUrlFor(value: string | undefined): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  try {
    const url = new URL(cleaned);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return cleaned.startsWith("/") ? cleaned : null;
  }
}

function keywordTags({
  summary,
  title,
}: Pick<NormalizedCentralNewsBase, "summary" | "title">): string[] {
  const haystack = `${title} ${summary}`.toLowerCase();
  const tags: string[] = [];

  for (const [needle, tag] of [
    ["injur", "injuries"],
    ["practice", "practice report"],
    ["rank", "rankings"],
    ["start", "start-sit"],
    ["sit", "start-sit"],
    ["lineup", "start-sit"],
    ["waiver", "waivers"],
    ["depth", "players"],
    ["rookie", "rookies"],
    ["trade", "trades"],
    ["usage", "usage"],
  ] as const) {
    if (haystack.includes(needle)) {
      tags.push(tag);
    }
  }

  return tags;
}

function tagsFor(
  item: NormalizedCentralNewsBase,
  centralSection: CentralPublicationSectionId,
): string[] {
  return sortedUnique([
    centralSection,
    ...item.topics,
    ...keywordTags(item),
  ]).slice(0, 12);
}

function editorialImportanceFor({
  canonicalUrl,
  centralSection,
  sourceTypes,
  summary,
  title,
  topics,
}: Pick<
  NormalizedCentralNewsBase,
  "canonicalUrl" | "sourceTypes" | "summary" | "title" | "topics"
> & { centralSection: CentralPublicationSectionId }): number {
  let score = 35;

  switch (centralSection) {
    case "injuries":
      score += 24;
      break;
    case "post-waiver":
    case "pre-waiver":
      score += 22;
      break;
    case "start-sit":
      score += 18;
      break;
    case "rankings-projections":
      score += 16;
      break;
    case "matchups":
      score += 12;
      break;
    case "mnf-recap":
    case "weekend-recap-mnf-projection":
      score += 10;
      break;
    case "rundown":
      score += 8;
      break;
    case "wire":
      score += 6;
      break;
  }

  if (sourceTypes.includes("web")) {
    score += 8;
  }
  if (sourceTypes.includes("rss")) {
    score += 6;
  }
  if (canonicalUrl) {
    score += 5;
  }
  if (summary.length >= 80) {
    score += 4;
  }
  if (topics.length >= 2) {
    score += 3;
  }
  if (/breaking|out|questionable|doubtful|inactive/i.test(title)) {
    score += 8;
  }

  return Math.min(Math.max(score, 0), 100);
}

function completeNormalizedItem(
  base: NormalizedCentralNewsBase,
): NormalizedCentralNewsItem {
  const centralSection = resolveCentralPublicationSection({
    metadata: {
      centralSection: "wire",
      topics: base.topics,
    },
    summary: base.summary,
    title: base.title,
  }).id;
  const completed = {
    ...base,
    centralSection,
    dek: dekFor(base),
    editorialImportance: editorialImportanceFor({
      canonicalUrl: base.canonicalUrl,
      centralSection,
      sourceTypes: base.sourceTypes,
      summary: base.summary,
      title: base.title,
      topics: base.topics,
    }),
    tags: tagsFor(base, centralSection),
  };

  return {
    ...completed,
    contentHash: contentHashFor(completed),
  };
}

function stableMetadata(item: Omit<NormalizedCentralNewsItem, "contentHash">) {
  return {
    canonicalUrl: item.canonicalUrl,
    centralSection: item.centralSection,
    dek: item.dek,
    editorialImportance: item.editorialImportance,
    heroImageUrl: item.heroImageUrl,
    playerRefs: item.playerRefs,
    publicationSection: item.centralSection,
    section: item.centralSection,
    sourceIds: item.sourceIds,
    sources: item.sources,
    sourceTypes: item.sourceTypes,
    tags: item.tags,
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
    heroImageUrl: heroImageUrlFor(item.heroImageUrl),
    publishedAt,
    playerRefs: normalizePlayerRefs(item.playerRefs),
    source,
    sourceIds: item.id ? [item.id] : [],
    sources: [{ source, url: sourceUrl }],
    sourceTypes: [item.sourceType ?? "manual"],
    sourceUrl,
    summary,
    title,
    topics: sortedUnique(item.topics ?? []),
  };

  return completeNormalizedItem(normalized);
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
    heroImageUrl: primary.heroImageUrl ?? candidate.heroImageUrl ?? null,
    playerRefs: mergePlayerRefs(existing.playerRefs, candidate.playerRefs),
    publishedAt:
      candidate.publishedAt > existing.publishedAt
        ? candidate.publishedAt
        : existing.publishedAt,
    sourceIds: sortedUnique([...existing.sourceIds, ...candidate.sourceIds]),
    sources: mergeAttributions(existing.sources, candidate.sources),
    sourceTypes: sortedUnique([
      ...existing.sourceTypes,
      ...candidate.sourceTypes,
    ]),
    topics: sortedUnique([...existing.topics, ...candidate.topics]),
  };

  return completeNormalizedItem(merged);
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
    const normalizedItem = normalizeSourceItem(sourceItem);
    if (normalizedItem === null) {
      skipped += 1;
      continue;
    }

    const existing = byDedupKey.get(normalizedItem.dedupKey);
    if (existing) {
      byDedupKey.set(
        normalizedItem.dedupKey,
        mergeDuplicate(existing, normalizedItem),
      );
      deduped += 1;
      continue;
    }

    byDedupKey.set(normalizedItem.dedupKey, normalizedItem);
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

type ExistingCentralNewsRow = {
  body: string;
  contentHash: string;
  dedupKey: string;
  id: string;
  metadata: Record<string, unknown>;
  publishedAt: Date;
  source: string | null;
  sourceUrl: string | null;
  summary: string;
  title: string;
};

function sourceAttributionsValue(
  value: unknown,
  fallback: SourceAttribution,
): SourceAttribution[] {
  if (!Array.isArray(value)) {
    return [fallback];
  }

  const sources = value.flatMap((item) => {
    const record = asRecord(item);
    const source = textValue(record.source);
    const url = textValue(record.url);
    return source && url ? [{ source, url }] : [];
  });

  return sources.length > 0 ? mergeAttributions(sources, []) : [fallback];
}

function existingRowToNormalized(
  row: ExistingCentralNewsRow,
): NormalizedCentralNewsItem {
  const metadata = asRecord(row.metadata);
  const source = row.source ?? "Unknown source";
  const sourceUrl = row.sourceUrl ?? "";
  const canonicalUrl =
    textValue(metadata.canonicalUrl) ?? canonicalizeNewsUrl(sourceUrl);
  const base = {
    body: row.body,
    canonicalUrl,
    dedupKey: row.dedupKey,
    heroImageUrl: heroImageUrlFor(textValue(metadata.heroImageUrl) ?? ""),
    playerRefs: playerRefsValue(metadata.playerRefs),
    publishedAt: row.publishedAt,
    source,
    sourceIds: sortedUnique(stringArrayValue(metadata.sourceIds)),
    sources: sourceAttributionsValue(metadata.sources, {
      source,
      url: canonicalUrl ?? sourceUrl,
    }),
    sourceTypes: sortedUnique(
      stringArrayValue(metadata.sourceTypes).length > 0
        ? stringArrayValue(metadata.sourceTypes)
        : ["manual"],
    ),
    sourceUrl,
    summary: row.summary,
    title: row.title,
    topics: sortedUnique(stringArrayValue(metadata.topics)),
  };

  return completeNormalizedItem(base);
}

async function findExistingCentralNews(db: Db, dedupKey: string) {
  const [existing] = await db
    .select({
      body: contentItems.body,
      contentHash: contentItems.contentHash,
      dedupKey: contentItems.dedupKey,
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
  const persistedItem = existing
    ? mergeDuplicate(existingRowToNormalized(existing), item)
    : item;
  const values = contentValues(persistedItem, at);

  if (existing?.contentHash === persistedItem.contentHash) {
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

  const conflictedItem = mergeDuplicate(
    existingRowToNormalized(conflicted),
    item,
  );
  if (conflicted.contentHash === conflictedItem.contentHash) {
    return { id: conflicted.id, status: "unchanged" };
  }

  const [updated] = await db
    .update(contentItems)
    .set(contentValues(conflictedItem, at))
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

  const tailoring = await tailorCentralNewsToLeagues(deps.db, {
    contentItemIds,
  });

  return {
    contentItemIds,
    deduped,
    fetched: fetched.length,
    skipped,
    tailoredReferences: tailoring.referencesUpserted,
    ...stats,
  };
}
