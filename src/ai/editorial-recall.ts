import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { Db } from "@/db/client";
import { contentItems } from "@/db/schema";
import {
  type CentralJournalistId,
  centralColumnForId,
} from "./central-columns";
import { centralColumnIdFromGenerationKey } from "./central-generation-key";
import { cosineSimilarity } from "./embedding-similarity";
import type {
  CentralPreGenerationContext,
  EmbeddingProvider,
} from "./interfaces";

export const CENTRAL_RECALL_LOOKBACK_MS = 14 * 24 * 60 * 60_000;
export const CENTRAL_RECALL_CANDIDATE_LIMIT = 32;
export const CENTRAL_RECALL_DIGEST_LIMIT = 10;

interface CentralRecallCandidate {
  dedupKey: string;
  id: string;
  metadata: Record<string, unknown>;
  publishedAt: Date;
  source: string | null;
  summary: string;
  title: string;
}

interface RankedCentralRecallCandidate extends CentralRecallCandidate {
  recency: number;
  relevance: number;
  score: number;
}

export interface BuildCentralEditorialRecallInput {
  candidateLimit?: number;
  currentJournalistId: CentralJournalistId;
  db: Db;
  digestLimit?: number;
  embeddings: EmbeddingProvider;
  lookbackMs?: number;
  now: Date;
  query: string;
  queuedGenerationKeys?: readonly string[];
}

function normalizedLimit(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || !value || value < 1) {
    return fallback;
  }
  return Math.min(value, 100);
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonBlankString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const normalized = nonBlankString(entry);
        return normalized ? [normalized] : [];
      })
    : [];
}

function candidateJournalist(candidate: CentralRecallCandidate): {
  id: string | null;
  name: string;
} {
  const journalist = recordValue(candidate.metadata.journalist);
  return {
    id: nonBlankString(journalist?.id),
    name:
      nonBlankString(journalist?.name) ??
      nonBlankString(candidate.metadata.byline) ??
      candidate.source ??
      "Central newsroom",
  };
}

function candidateTopics(candidate: CentralRecallCandidate): string[] {
  const tags = stringArray(candidate.metadata.tags);
  const section =
    nonBlankString(candidate.metadata.centralSection) ??
    nonBlankString(candidate.metadata.publicationSection) ??
    nonBlankString(candidate.metadata.section);
  return [...new Set([...(section ? [section] : []), ...tags])].slice(0, 4);
}

function candidateEmbeddingText(candidate: CentralRecallCandidate): string {
  return [
    candidate.title,
    candidate.summary,
    ...candidateTopics(candidate),
    candidateJournalist(candidate).name,
  ]
    .filter(Boolean)
    .join("\n");
}

async function embedOrNull(
  embeddings: EmbeddingProvider,
  text: string,
): Promise<number[] | null> {
  try {
    const vector = await embeddings.embed(text);
    return vector.length > 0 ? vector : null;
  } catch {
    return null;
  }
}

async function rankCandidates({
  candidates,
  embeddings,
  lookbackMs,
  now,
  query,
}: {
  candidates: readonly CentralRecallCandidate[];
  embeddings: EmbeddingProvider;
  lookbackMs: number;
  now: Date;
  query: string;
}): Promise<RankedCentralRecallCandidate[]> {
  const queryEmbedding = await embedOrNull(
    embeddings,
    query.trim() || "central newsroom assignment",
  );
  const ranked: RankedCentralRecallCandidate[] = [];

  for (const candidate of candidates) {
    const ageMs = Math.max(0, now.getTime() - candidate.publishedAt.getTime());
    const recency = Math.max(0, 1 - ageMs / lookbackMs);
    const candidateEmbedding = queryEmbedding
      ? await embedOrNull(embeddings, candidateEmbeddingText(candidate))
      : null;
    const relevance =
      queryEmbedding && candidateEmbedding
        ? Math.max(
            0,
            Math.min(
              1,
              (cosineSimilarity(queryEmbedding, candidateEmbedding) + 1) / 2,
            ),
          )
        : 0.5;
    ranked.push({
      ...candidate,
      recency,
      relevance,
      score: relevance * 0.72 + recency * 0.28,
    });
  }

  return ranked.sort(
    (left, right) =>
      right.score - left.score ||
      right.publishedAt.getTime() - left.publishedAt.getTime() ||
      left.id.localeCompare(right.id),
  );
}

function uniqueGenerationKeys(values: readonly string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 24),
    ),
  ];
}

function publishedDigestLine(
  candidate: RankedCentralRecallCandidate,
  currentJournalistId: CentralJournalistId,
): string {
  const journalist = candidateJournalist(candidate);
  const relationship =
    journalist.id === currentJournalistId
      ? "same journalist"
      : "contemporary coverage";
  const topics = candidateTopics(candidate);
  const topicSuffix = topics.length > 0 ? `; topics: ${topics.join(", ")}` : "";
  return `- ${candidate.publishedAt.toISOString().slice(0, 10)} — “${truncate(candidate.title, 150)}” — ${truncate(candidate.summary, 240)} (${truncate(journalist.name, 80)}; ${relationship}${topicSuffix})`;
}

function queuedDigestLine(generationKey: string): string {
  const columnId = centralColumnIdFromGenerationKey(generationKey);
  const column = columnId ? centralColumnForId(columnId) : null;
  if (!column) {
    return `- Queued central assignment — ${truncate(generationKey, 140)}`;
  }
  return `- ${column.name} — ${truncate(column.formatContract, 240)}`;
}

function buildDigest({
  currentJournalistId,
  published,
  queuedGenerationKeys,
}: {
  currentJournalistId: CentralJournalistId;
  published: readonly RankedCentralRecallCandidate[];
  queuedGenerationKeys: readonly string[];
}): string {
  const publishedLines =
    published.length > 0
      ? published.map((candidate) =>
          publishedDigestLine(candidate, currentJournalistId),
        )
      : ["- No published central coverage was found in the recent window."];
  const queuedLines =
    queuedGenerationKeys.length > 0
      ? queuedGenerationKeys.map(queuedDigestLine)
      : ["- No same-planning-run queued siblings were supplied."];

  return [
    "EDITORIAL RECALL — CENTRAL PUBLICATION POOL",
    "Coverage map only; this is not factual evidence. Use it to complement recent work, preserve a throughline, and avoid repeating prior headlines, theses, or angles.",
    "",
    "Recent published coverage (ranked by topic relevance and recency):",
    ...publishedLines,
    "",
    "Queued/about-to-publish assignments visible in this planning run:",
    ...queuedLines,
  ].join("\n");
}

export async function buildCentralEditorialRecall(
  input: BuildCentralEditorialRecallInput,
): Promise<CentralPreGenerationContext> {
  const lookbackMs = Math.max(
    60_000,
    input.lookbackMs ?? CENTRAL_RECALL_LOOKBACK_MS,
  );
  const candidateLimit = normalizedLimit(
    input.candidateLimit,
    CENTRAL_RECALL_CANDIDATE_LIMIT,
  );
  const digestLimit = normalizedLimit(
    input.digestLimit,
    CENTRAL_RECALL_DIGEST_LIMIT,
  );
  const windowStart = new Date(input.now.getTime() - lookbackMs);
  const candidates = await input.db
    .select({
      dedupKey: contentItems.dedupKey,
      id: contentItems.id,
      metadata: contentItems.metadata,
      publishedAt: contentItems.publishedAt,
      source: contentItems.source,
      summary: contentItems.summary,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(
      and(
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
        contentItemIsPublished(),
        gte(contentItems.publishedAt, windowStart),
        lte(contentItems.publishedAt, input.now),
      ),
    )
    .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
    .limit(candidateLimit);
  const published = (
    await rankCandidates({
      candidates,
      embeddings: input.embeddings,
      lookbackMs,
      now: input.now,
      query: input.query,
    })
  ).slice(0, digestLimit);
  const publishedGenerationKeys = new Set(
    candidates.map((candidate) => candidate.dedupKey),
  );
  const queuedGenerationKeys = uniqueGenerationKeys(
    input.queuedGenerationKeys ?? [],
  ).filter((generationKey) => !publishedGenerationKeys.has(generationKey));

  return {
    digest: buildDigest({
      currentJournalistId: input.currentJournalistId,
      published,
      queuedGenerationKeys,
    }),
    publicationPool: "central",
    publishedContentItemIds: published.map((candidate) => candidate.id),
    queuedGenerationKeys,
  };
}
