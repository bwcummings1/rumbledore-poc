import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { contentItemIsPublished } from "@/content/lifecycle";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import {
  aiMemory,
  bettingEvents,
  bettingMarkets,
  contentItems,
  oddsSnapshots,
} from "@/db/schema";
import {
  GENERAL_STATS_MOCK_SOURCE,
  getGeneralStatsWeekSnapshot,
} from "@/general-stats";
import { stableContentHash } from "@/ingestion/hash";
import {
  centralArticleMetadata,
  centralArticleText,
  validateCentralArticleDraft,
} from "./central-article-draft";
import {
  type CentralColumnContentType,
  type CentralColumnDataSource,
  type CentralColumnId,
  centralColumnForId,
  centralJournalistForId,
} from "./central-columns";
import {
  type CentralDataFreshnessService,
  type CentralSourceFreshness,
  createMockCentralDataFreshness,
} from "./central-freshness";
import { centralGenerationKey } from "./central-generation-key";
import { buildCentralEditorialRecall } from "./editorial-recall";
import { cosineSimilarity } from "./embedding-similarity";
import type {
  CentralGenerationContext,
  CentralGenerationNewsEvidence,
  CentralGenerationOddsEvidence,
  CentralLlmClient,
  CentralLlmGenerateRequest,
  CentralPreGenerationContext,
  EmbeddingProvider,
  PromptParts,
} from "./interfaces";
import { DeterministicEmbeddingProvider, MockLlmClient } from "./mocks";

const CENTRAL_NEWS_LIMIT = 12;
const CENTRAL_ODDS_LIMIT = 240;
const CENTRAL_DUPLICATE_LOOKBACK_MS = 30 * 24 * 60 * 60_000;
const CENTRAL_DUPLICATE_MEMORY_LIMIT = 20;
export const DEFAULT_CENTRAL_DUPLICATE_THRESHOLD = 0.92;

export interface GenerateCentralColumnInput {
  columnId: CentralColumnId;
  newsContentItemIds?: readonly string[];
  preGenerationContext?: CentralPreGenerationContext | null;
  queuedGenerationKeys?: readonly string[];
  reportRequest?: {
    brief: string;
    category: string;
  } | null;
  season: number;
  triggerKey: string;
  week: number;
}

export interface CentralAiGenerationDependencies {
  db: Db;
  duplicateThreshold?: number;
  embeddings: EmbeddingProvider;
  freshness: CentralDataFreshnessService;
  llm: CentralLlmClient;
  now?: () => Date;
}

export type GenerateCentralColumnResult =
  | {
      contentItemId: string;
      publishedAt: string;
      reused: boolean;
      status: "published";
      title: string;
    }
  | {
      reused: false;
      skipReason: string;
      status: "skipped";
    };

type PublishedCentralColumnResult = Extract<
  GenerateCentralColumnResult,
  { status: "published" }
>;

function timestamp(deps: CentralAiGenerationDependencies): Date {
  return deps.now?.() ?? new Date();
}

function centralDedupKey(input: GenerateCentralColumnInput): string {
  return centralGenerationKey(input);
}

function validateInput(input: GenerateCentralColumnInput): void {
  if (!centralColumnForId(input.columnId)) {
    throw new AppError({
      code: "CENTRAL_AI_COLUMN_INVALID",
      message: "Central generation column is invalid",
      status: 400,
    });
  }
  if (!input.triggerKey.trim()) {
    throw new AppError({
      code: "CENTRAL_AI_TRIGGER_INVALID",
      message: "Central generation requires a trigger key",
      status: 400,
    });
  }
  if (
    !Number.isInteger(input.season) ||
    input.season < 1900 ||
    input.season > 2200
  ) {
    throw new AppError({
      code: "CENTRAL_AI_SEASON_INVALID",
      message: "Central generation season is invalid",
      status: 400,
    });
  }
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 25) {
    throw new AppError({
      code: "CENTRAL_AI_WEEK_INVALID",
      message: "Central generation week is invalid",
      status: 400,
    });
  }
  if (input.columnId === "the-rundown") {
    if (
      !input.reportRequest?.category.trim() ||
      !input.reportRequest.brief.trim()
    ) {
      throw new AppError({
        code: "CENTRAL_AI_REPORT_REQUEST_INVALID",
        message: "The Rundown requires a report category and brief",
        status: 400,
      });
    }
  }
  if (input.preGenerationContext && !input.preGenerationContext.digest.trim()) {
    throw new AppError({
      code: "CENTRAL_AI_PRE_GENERATION_CONTEXT_INVALID",
      message: "Injected pre-generation context requires a digest",
      status: 400,
    });
  }
  if (
    input.preGenerationContext &&
    input.preGenerationContext.publicationPool !== "central"
  ) {
    throw new AppError({
      code: "CENTRAL_AI_PRE_GENERATION_CONTEXT_INVALID",
      message:
        "Central generation context must use the central publication pool",
      status: 400,
    });
  }
}

function playerRefsFromMetadata(
  metadata: Record<string, unknown>,
): CentralGenerationNewsEvidence["playerRefs"] {
  if (!Array.isArray(metadata.playerRefs)) {
    return [];
  }
  return metadata.playerRefs.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }
    const record = value as Record<string, unknown>;
    const provider =
      typeof record.provider === "string" ? record.provider.trim() : "";
    const providerId =
      typeof record.providerId === "string" ? record.providerId.trim() : "";
    const label =
      typeof record.label === "string" && record.label.trim()
        ? record.label.trim()
        : null;
    return provider && providerId ? [{ label, provider, providerId }] : [];
  });
}

async function loadCentralNewsEvidence(
  db: Db,
  input: GenerateCentralColumnInput,
): Promise<CentralGenerationNewsEvidence[]> {
  if (input.newsContentItemIds && input.newsContentItemIds.length === 0) {
    return [];
  }
  const requestedIds = input.newsContentItemIds
    ? [...new Set(input.newsContentItemIds)]
    : null;
  const rows = await db
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
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
        sql`(${contentItems.metadata}->>'generatedBy') is distinct from 'central-journalist-engine'`,
        requestedIds ? inArray(contentItems.id, requestedIds) : undefined,
      ),
    )
    .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
    .limit(CENTRAL_NEWS_LIMIT);

  return rows.map((row) => ({
    body: row.body,
    id: row.id,
    playerRefs: playerRefsFromMetadata(row.metadata),
    publishedAt: row.publishedAt.toISOString(),
    source: row.source ?? "Unknown source",
    sourceUrl: row.sourceUrl ?? "",
    summary: row.summary,
    title: row.title,
  }));
}

async function loadOddsEvidence({
  db,
  gameTimes,
}: {
  db: Db;
  gameTimes: readonly Date[];
}): Promise<CentralGenerationOddsEvidence[]> {
  if (gameTimes.length === 0) {
    return [];
  }
  const timestamps = gameTimes.map((date) => date.getTime());
  const windowStart = new Date(Math.min(...timestamps) - 24 * 60 * 60_000);
  const windowEnd = new Date(Math.max(...timestamps) + 24 * 60 * 60_000);
  const rows = await db
    .select({
      awayPrice: oddsSnapshots.awayPrice,
      awayTeam: bettingEvents.awayTeam,
      capturedAt: oddsSnapshots.capturedAt,
      createdAt: oddsSnapshots.createdAt,
      homePrice: oddsSnapshots.homePrice,
      homeTeam: bettingEvents.homeTeam,
      line: oddsSnapshots.line,
      marketId: bettingMarkets.id,
      marketType: bettingMarkets.type,
      outcomePrice: oddsSnapshots.outcomePrice,
      overPrice: oddsSnapshots.overPrice,
      propType: bettingMarkets.propType,
      subject: bettingMarkets.subject,
      underPrice: oddsSnapshots.underPrice,
    })
    .from(oddsSnapshots)
    .innerJoin(bettingMarkets, eq(bettingMarkets.id, oddsSnapshots.marketId))
    .innerJoin(bettingEvents, eq(bettingEvents.id, bettingMarkets.eventId))
    .where(
      and(
        eq(bettingEvents.sport, "nfl"),
        gte(bettingEvents.startTime, windowStart),
        lte(bettingEvents.startTime, windowEnd),
      ),
    )
    .orderBy(
      asc(bettingEvents.startTime),
      asc(bettingMarkets.id),
      desc(oddsSnapshots.capturedAt),
      desc(oddsSnapshots.createdAt),
    )
    .limit(CENTRAL_ODDS_LIMIT);

  const latestByMarket = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByMarket.has(row.marketId)) {
      latestByMarket.set(row.marketId, row);
    }
  }
  return [...latestByMarket.values()].map((row) => ({
    awayPrice: row.awayPrice,
    awayTeam: row.awayTeam,
    capturedAt: row.capturedAt.toISOString(),
    homePrice: row.homePrice,
    homeTeam: row.homeTeam,
    line: row.line,
    marketId: row.marketId,
    marketType: row.marketType,
    outcomePrice: row.outcomePrice,
    overPrice: row.overPrice,
    propType: row.propType,
    subject: row.subject,
    underPrice: row.underPrice,
  }));
}

function latestTimestamp(values: readonly (string | null)[]): string | null {
  const timestamps = values
    .flatMap((value) => (value ? [Date.parse(value)] : []))
    .filter(Number.isFinite);
  return timestamps.length > 0
    ? new Date(Math.max(...timestamps)).toISOString()
    : null;
}

async function buildCentralGenerationContext({
  deps,
  input,
  requestedAt,
  sourceFreshness,
}: {
  deps: CentralAiGenerationDependencies;
  input: GenerateCentralColumnInput;
  requestedAt: Date;
  sourceFreshness: CentralSourceFreshness[];
}): Promise<CentralGenerationContext> {
  const column = centralColumnForId(input.columnId);
  if (!column) {
    throw new AppError({
      code: "CENTRAL_AI_COLUMN_INVALID",
      message: "Central generation column is invalid",
      status: 400,
    });
  }
  const journalist = centralJournalistForId(column.journalistId);
  if (!journalist) {
    throw new AppError({
      code: "CENTRAL_AI_JOURNALIST_INVALID",
      message: "Central column journalist is not configured",
      status: 500,
    });
  }

  const dataSources: readonly CentralColumnDataSource[] = column.dataSources;
  const news = dataSources.includes("central-news")
    ? await loadCentralNewsEvidence(deps.db, input)
    : [];
  const stats = dataSources.includes("general-stats")
    ? await getGeneralStatsWeekSnapshot(deps.db, {
        season: input.season,
        source: GENERAL_STATS_MOCK_SOURCE,
        week: input.week,
      })
    : null;
  const odds = dataSources.includes("betting-odds")
    ? await loadOddsEvidence({
        db: deps.db,
        gameTimes: stats?.schedule.map((game) => game.gameTime) ?? [],
      })
    : [];

  const games =
    stats?.schedule.map((game) => ({
      awayScore: game.awayScore,
      awayTeam: game.awayTeam,
      fetchedAt: game.fetchedAt.toISOString(),
      gameTime: game.gameTime.toISOString(),
      homeScore: game.homeScore,
      homeTeam: game.homeTeam,
      sourceGameId: game.sourceGameId,
      status: game.status,
    })) ?? [];
  const players =
    stats?.playerWeekStats.map((player) => ({
      fantasyPoints: player.fantasyPoints,
      fetchedAt: player.fetchedAt.toISOString(),
      fullName: player.player.fullName,
      opponentTeam: player.opponentTeam,
      position: player.player.position,
      receptions: player.receptions,
      receivingYards: player.receivingYards,
      rushingYards: player.rushingYards,
      sourcePlayerId: player.player.sourcePlayerId,
      targets: player.targets,
      team: player.team,
    })) ?? [];
  const teamStats =
    stats?.teamBoxScores.map((team) => ({
      fetchedAt: team.fetchedAt.toISOString(),
      opponentTeam: team.opponentTeam,
      passingYards: team.passingYards,
      pointsAgainst: team.pointsAgainst,
      pointsFor: team.pointsFor,
      receivingYards: team.receivingYards,
      rushingYards: team.rushingYards,
      sourceGameId: team.sourceGameId,
      team: team.team,
      turnovers: team.turnovers,
    })) ?? [];

  return {
    column: {
      branch: column.branch,
      contentType: column.contentType,
      dataSources: column.dataSources,
      formatContract: column.formatContract,
      id: column.id,
      name: column.name,
      section: column.section,
    },
    evidence: {
      fetchedAt: latestTimestamp([
        stats?.fetchedAt?.toISOString() ?? null,
        ...news.map((item) => item.publishedAt),
        ...odds.map((market) => market.capturedAt),
      ]),
      games,
      news,
      odds,
      players,
      source: stats?.source ?? (news.length > 0 ? "central-news" : null),
      sourceFreshness,
      teamStats,
    },
    journalist: {
      beat: journalist.beat,
      id: journalist.id,
      name: journalist.name,
      persona: journalist.persona,
      registerContract: journalist.registerContract,
    },
    preGenerationContext: input.preGenerationContext ?? null,
    reportRequest: input.reportRequest
      ? {
          brief: input.reportRequest.brief.trim(),
          category: input.reportRequest.category.trim(),
        }
      : null,
    requestedAt: requestedAt.toISOString(),
    season: input.season,
    triggerKey: input.triggerKey.trim(),
    week: input.week,
  };
}

export function buildCentralPromptParts(
  context: CentralGenerationContext,
): PromptParts {
  const stable = {
    column: context.column,
    journalist: context.journalist,
  };
  const volatile = {
    evidence: context.evidence,
    preGenerationContext: context.preGenerationContext,
    reportRequest: context.reportRequest,
    requestedAt: context.requestedAt,
    season: context.season,
    triggerKey: context.triggerKey,
    week: context.week,
  };
  const systemPrefix = JSON.stringify(stable);
  const volatileContext = JSON.stringify(volatile);
  return {
    prompt: `${systemPrefix}\n${volatileContext}`,
    systemPrefix,
    volatileContext,
  };
}

function centralRecallQuery(context: CentralGenerationContext): string {
  return [
    context.column.name,
    context.column.branch,
    context.column.section,
    context.column.contentType,
    context.column.formatContract,
    context.journalist.beat,
    context.reportRequest?.category ?? "",
    context.reportRequest?.brief ?? "",
    ...context.evidence.news.flatMap((item) => [item.title, item.summary]),
    ...context.evidence.games.map(
      (game) => `${game.awayTeam} at ${game.homeTeam}`,
    ),
    ...context.evidence.players.map(
      (player) => `${player.fullName} ${player.team} ${player.position}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function maxCentralPriorSimilarity(
  embedding: readonly number[],
  memories: readonly { embedding: number[] }[],
): number {
  return memories.reduce(
    (maximum, memory) =>
      Math.max(maximum, cosineSimilarity(embedding, memory.embedding)),
    0,
  );
}

async function loadNearestCentralArticleMemories({
  contentType,
  deps,
  embedding,
  publishedAt,
}: {
  contentType: CentralColumnContentType;
  deps: Pick<CentralAiGenerationDependencies, "db" | "embeddings">;
  embedding: readonly number[];
  publishedAt: Date;
}): Promise<{ embedding: number[] }[]> {
  if (embedding.length === 0) {
    return [];
  }

  const queryVector = JSON.stringify(embedding);
  const distance = sql`${aiMemory.embedding} <=> ${queryVector}::vector`;
  return deps.db
    .select({ embedding: aiMemory.embedding })
    .from(aiMemory)
    .innerJoin(contentItems, eq(aiMemory.contentItemId, contentItems.id))
    .where(
      and(
        isNull(aiMemory.leagueId),
        eq(aiMemory.source, "central_article"),
        eq(aiMemory.embeddingDimensions, embedding.length),
        eq(aiMemory.embeddingModel, deps.embeddings.model),
        sql`${aiMemory.metadata}->>'contentType' = ${contentType}`,
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
        contentItemIsPublished(),
        sql`${contentItems.metadata}->>'generatedBy' = 'central-journalist-engine'`,
        gte(
          contentItems.publishedAt,
          new Date(publishedAt.getTime() - CENTRAL_DUPLICATE_LOOKBACK_MS),
        ),
        lte(contentItems.publishedAt, publishedAt),
      ),
    )
    .orderBy(distance)
    .limit(CENTRAL_DUPLICATE_MEMORY_LIMIT);
}

async function findExistingCentralGeneration(
  db: Db,
  dedupKey: string,
): Promise<PublishedCentralColumnResult | null> {
  const [item] = await db
    .select({
      contentItemId: contentItems.id,
      publishedAt: contentItems.publishedAt,
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
  return item
    ? {
        contentItemId: item.contentItemId,
        publishedAt: item.publishedAt.toISOString(),
        reused: true,
        status: "published",
        title: item.title,
      }
    : null;
}

export function createMockCentralAiDependencies(
  db: Db,
): CentralAiGenerationDependencies {
  return {
    db,
    embeddings: new DeterministicEmbeddingProvider(),
    freshness: createMockCentralDataFreshness(db),
    llm: new MockLlmClient(),
  };
}

export async function generateCentralColumn({
  deps,
  input,
}: {
  deps: CentralAiGenerationDependencies;
  input: GenerateCentralColumnInput;
}): Promise<GenerateCentralColumnResult> {
  validateInput(input);
  const duplicateThreshold =
    deps.duplicateThreshold ?? DEFAULT_CENTRAL_DUPLICATE_THRESHOLD;
  const dedupKey = centralDedupKey(input);
  const existing = await findExistingCentralGeneration(deps.db, dedupKey);
  if (existing) {
    return existing;
  }

  const column = centralColumnForId(input.columnId);
  if (!column) {
    throw new AppError({
      code: "CENTRAL_AI_COLUMN_INVALID",
      message: "Central generation column is invalid",
      status: 400,
    });
  }
  const requestedAt = timestamp(deps);
  const sourceFreshness = await deps.freshness.ensureFresh({
    dataSources: column.dataSources,
    now: requestedAt,
    season: input.season,
    week: input.week,
  });
  const baseContext = await buildCentralGenerationContext({
    deps,
    input,
    requestedAt,
    sourceFreshness,
  });
  const preGenerationContext =
    input.preGenerationContext ??
    (await buildCentralEditorialRecall({
      currentJournalistId: baseContext.journalist.id,
      db: deps.db,
      embeddings: deps.embeddings,
      now: requestedAt,
      query: centralRecallQuery(baseContext),
      queuedGenerationKeys: input.queuedGenerationKeys,
    }));
  const context: CentralGenerationContext = {
    ...baseContext,
    preGenerationContext,
  };
  const request: CentralLlmGenerateRequest = {
    attempt: 1,
    contentType: context.column.contentType,
    context,
    prompt: buildCentralPromptParts(context),
  };
  let draft = validateCentralArticleDraft(
    await deps.llm.generateCentral(request),
    { context },
  );
  let articleText = centralArticleText(draft);
  let embedding = await deps.embeddings.embed(articleText);
  let nearestMemories = await loadNearestCentralArticleMemories({
    contentType: context.column.contentType,
    deps,
    embedding,
    publishedAt: requestedAt,
  });
  let maxSimilarity = maxCentralPriorSimilarity(embedding, nearestMemories);

  if (maxSimilarity > duplicateThreshold) {
    const duplicateNudge =
      "The first draft was too similar to a recent central article in this publication pool. Use a genuinely different angle and avoid repeating its framing or phrasing while staying within the supplied evidence.";
    const retryRequest: CentralLlmGenerateRequest = {
      attempt: 2,
      contentType: context.column.contentType,
      context,
      duplicateNudge,
      prompt: buildCentralPromptParts(context),
    };
    draft = validateCentralArticleDraft(
      await deps.llm.generateCentral(retryRequest),
      { context },
    );
    articleText = centralArticleText(draft);
    embedding = await deps.embeddings.embed(articleText);
    nearestMemories = await loadNearestCentralArticleMemories({
      contentType: context.column.contentType,
      deps,
      embedding,
      publishedAt: requestedAt,
    });
    maxSimilarity = maxCentralPriorSimilarity(embedding, nearestMemories);
  }

  if (maxSimilarity > duplicateThreshold) {
    return {
      reused: false,
      skipReason: `near_duplicate:${maxSimilarity.toFixed(4)}`,
      status: "skipped",
    };
  }

  const metadata = centralArticleMetadata({ context, draft });
  const contentHash = stableContentHash({
    article: articleText,
    metadata,
  });
  const publishedAt = requestedAt;
  const inserted = await deps.db.transaction(async (tx) => {
    const [item] = await tx
      .insert(contentItems)
      .values({
        authorPersona: context.journalist.persona,
        body: draft.body,
        contentHash,
        dedupKey,
        kind: "news",
        leagueId: null,
        metadata,
        publishedAt,
        source: context.journalist.name,
        sourceUrl: null,
        summary: draft.summary,
        title: draft.title,
      })
      .onConflictDoNothing({
        target: [contentItems.kind, contentItems.dedupKey],
        where: sql`${contentItems.leagueId} is null`,
      })
      .returning({
        contentItemId: contentItems.id,
        publishedAt: contentItems.publishedAt,
        title: contentItems.title,
      });

    if (item) {
      await tx.insert(aiMemory).values({
        contentItemId: item.contentItemId,
        embedding,
        embeddingDimensions: embedding.length,
        embeddingModel: deps.embeddings.model,
        leagueId: null,
        metadata: {
          contentHash,
          contentType: context.column.contentType,
          generatedBy: "central-journalist-engine",
        },
        source: "central_article",
        textContent: articleText,
      });
    }

    return item;
  });

  if (inserted) {
    return {
      contentItemId: inserted.contentItemId,
      publishedAt: inserted.publishedAt.toISOString(),
      reused: false,
      status: "published",
      title: inserted.title,
    };
  }
  const conflicted = await findExistingCentralGeneration(deps.db, dedupKey);
  if (!conflicted) {
    throw new AppError({
      code: "CENTRAL_AI_CONTENT_PUBLISH_FAILED",
      message: "Central AI content item could not be persisted",
      status: 500,
    });
  }
  return conflicted;
}

export function centralPromptPrefixHash(
  context: CentralGenerationContext,
): string {
  return createHash("sha256")
    .update(buildCentralPromptParts(context).systemPrefix)
    .digest("hex");
}
