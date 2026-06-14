import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { logger } from "@/core/logging";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import type { LeagueScopedTx } from "@/db/rls";
import { withLeagueContext } from "@/db/rls";
import {
  aiGenerationRuns,
  aiMemory,
  aiPersonaCards,
  allTimeRecords,
  contentItems,
  dataIntegrityChecks,
  fantasyMembers,
  fantasyTeams,
  instigations,
  leagues,
  loreClaims,
  persons,
  polls,
} from "@/db/schema";
import { NoopPushNotifier, PUSH_EVENTS, type PushNotifier } from "@/push";
import {
  NoopRealtimePublisher,
  REALTIME_EVENTS,
  type RealtimePublisher,
} from "@/realtime";
import { RECORD_TYPE_LABELS, type RecordType } from "@/stats";
import {
  blogDraftMetadata,
  blogDraftText,
  validateBlogDraft,
} from "./article-draft";
import {
  type AiContentType,
  contentTypePromptContract,
  parseAiContentType,
} from "./content-types";
import type {
  BlogDraft,
  EmbeddingProvider,
  LeagueBlogContext,
  LeagueContextInstigation,
  LeagueContextLoreClaim,
  LeagueContextMemory,
  LeagueContextPoll,
  LeagueContextTeam,
  LeagueContextTrigger,
  LeaguePersonaCard,
  LlmClient,
  NewsItem,
  PromptParts,
  WebGrounding,
} from "./interfaces";
import {
  DeterministicEmbeddingProvider,
  MockLlmClient,
  MockWebGrounding,
} from "./mocks";
import { AI_PERSONAS, type AiPersona, DEFAULT_PERSONA_CARDS } from "./personas";

export const DEFAULT_DUPLICATE_THRESHOLD = 0.92;

export interface GenerateLeagueBlogPostInput {
  leagueId: string;
  persona: AiPersona;
  contentType: AiContentType;
  triggerKey: string;
}

export interface AiGenerationDependencies {
  db: Db;
  llm: LlmClient;
  push: PushNotifier;
  realtime: RealtimePublisher;
  web: WebGrounding;
  embeddings: EmbeddingProvider;
  duplicateThreshold?: number;
  now?: () => Date;
}

export type GenerateLeagueBlogPostResult =
  | {
      status: "published";
      reused: boolean;
      contentItemId: string;
      title: string;
      promptPrefixHash: string;
      publishedAt: string;
    }
  | {
      status: "skipped";
      reused: boolean;
      skipReason: string;
      promptPrefixHash: string | null;
    };

interface PreparedGeneration {
  context: LeagueBlogContext;
  runId: string;
}

function isAiPersona(value: string): value is AiPersona {
  return (AI_PERSONAS as readonly string[]).includes(value);
}

export function parseAiPersona(value: string): AiPersona {
  if (isAiPersona(value)) {
    return value;
  }
  throw new AppError({
    code: "AI_PERSONA_INVALID",
    message: "AI persona is invalid",
    status: 400,
  });
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function generationRunTriggerKey(input: GenerateLeagueBlogPostInput): string {
  return `${input.contentType}:${input.triggerKey}`;
}

function contentDedupKey(input: GenerateLeagueBlogPostInput): string {
  return `blog:${input.persona}:${input.contentType}:${input.triggerKey}`;
}

type TriggerContextTarget =
  | { kind: "instigation"; id: string }
  | { kind: "poll"; id: string }
  | { kind: "claim"; id: string };

function now(deps: Pick<AiGenerationDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function parseTriggerContextTarget(
  triggerKey: string,
): TriggerContextTarget | null {
  if (triggerKey.startsWith("instigation:")) {
    return { id: triggerKey.slice("instigation:".length), kind: "instigation" };
  }
  if (triggerKey.startsWith("poll-closed:")) {
    return { id: triggerKey.slice("poll-closed:".length), kind: "poll" };
  }
  if (triggerKey.startsWith("lore-canonized:")) {
    return { id: triggerKey.slice("lore-canonized:".length), kind: "claim" };
  }
  return null;
}

function managerNamesFor(
  ownerMemberIds: readonly string[],
  membersByProviderId: ReadonlyMap<string, string>,
): string[] {
  const names = ownerMemberIds
    .map((ownerId) => membersByProviderId.get(ownerId))
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names : ["Unknown manager"];
}

function recordLabel(recordType: string): string {
  return (
    RECORD_TYPE_LABELS[recordType as RecordType] ??
    recordType.replaceAll("_", " ")
  );
}

function cosineSimilarity(left: readonly number[], right: readonly number[]) {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}

function maxPriorSimilarity(
  embedding: readonly number[],
  memories: readonly LeagueContextMemory[],
): number {
  return memories.reduce(
    (max, memory) =>
      Math.max(max, cosineSimilarity(embedding, memory.embedding)),
    0,
  );
}

function stableTeamFacts(teams: readonly LeagueContextTeam[]) {
  return [...teams]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((team) => ({
      losses: team.losses,
      managers: team.managerNames,
      name: team.name,
      pointsAgainst: team.pointsAgainst,
      pointsFor: team.pointsFor,
      ties: team.ties,
      wins: team.wins,
    }));
}

function stableRecordFacts(context: LeagueBlogContext) {
  return context.records.map((record) => ({
    holderName: record.holderName,
    label: record.label,
    scoringPeriod: record.scoringPeriod,
    season: record.season,
    value: record.value,
  }));
}

function untrustedNewsBlock(newsItems: readonly NewsItem[]): string {
  if (newsItems.length === 0) {
    return "<untrusted_news>[]</untrusted_news>";
  }

  const inertItems = newsItems.map((item) => ({
    id: item.id,
    publishedAt: item.publishedAt.toISOString(),
    source: item.source,
    text: item.text,
    title: item.title,
    url: item.url,
  }));
  return `<untrusted_news>${JSON.stringify(inertItems)}</untrusted_news>`;
}

export function buildPromptParts({
  contentType,
  context,
  duplicateNudge,
  newsItems,
  triggerKey,
}: {
  contentType: AiContentType;
  context: LeagueBlogContext;
  duplicateNudge?: string;
  newsItems: readonly NewsItem[];
  triggerKey: string;
}): PromptParts {
  const stablePrefix = {
    league: {
      name: context.league.name,
      providerLeagueId: context.league.providerLeagueId,
      scoringType: context.league.scoringType,
      season: context.league.season,
    },
    persona: {
      beat: context.persona.beat,
      maxWords: context.persona.maxWords,
      minWords: context.persona.minWords,
      name: context.persona.name,
      performsWhen: context.persona.performsWhen,
      pointOfView: context.persona.pointOfView,
      promptTemplate: context.persona.promptTemplate,
      purpose: context.persona.purpose,
      tone: context.persona.tone,
    },
    records: stableRecordFacts(context),
    teams: stableTeamFacts(context.teams),
  };
  const systemPrefix = JSON.stringify(stablePrefix);
  const volatileContext = JSON.stringify({
    currentScoringPeriod: context.league.currentScoringPeriod,
    contentType: contentTypePromptContract(contentType),
    duplicateNudge: duplicateNudge ?? null,
    priorPosts: context.priorPosts.map((post) => ({
      publishedAt: post.publishedAt.toISOString(),
      summary: post.summary,
      title: post.title,
    })),
    trigger: context.trigger,
    triggerKey,
    untrustedNews: untrustedNewsBlock(newsItems),
  });

  return {
    prompt: `${systemPrefix}\n\n${volatileContext}`,
    systemPrefix,
    volatileContext,
  };
}

async function ensurePersonaCard({
  leagueId,
  persona,
  tx,
}: {
  leagueId: string;
  persona: AiPersona;
  tx: LeagueScopedTx;
}): Promise<LeaguePersonaCard> {
  const defaults = DEFAULT_PERSONA_CARDS[persona];
  const [inserted] = await tx
    .insert(aiPersonaCards)
    .values({
      enabled: defaults.enabled,
      beat: defaults.beat,
      leagueId,
      maxWords: defaults.maxWords,
      minWords: defaults.minWords,
      name: defaults.name,
      performsWhen: defaults.performsWhen,
      pointOfView: defaults.pointOfView,
      persona,
      promptTemplate: defaults.promptTemplate,
      purpose: defaults.purpose,
      tone: defaults.tone,
      triggerConfig: defaults.triggerConfig,
    })
    .onConflictDoNothing({
      target: [aiPersonaCards.leagueId, aiPersonaCards.persona],
    })
    .returning({
      enabled: aiPersonaCards.enabled,
      beat: aiPersonaCards.beat,
      id: aiPersonaCards.id,
      maxWords: aiPersonaCards.maxWords,
      minWords: aiPersonaCards.minWords,
      name: aiPersonaCards.name,
      performsWhen: aiPersonaCards.performsWhen,
      persona: aiPersonaCards.persona,
      pointOfView: aiPersonaCards.pointOfView,
      promptTemplate: aiPersonaCards.promptTemplate,
      purpose: aiPersonaCards.purpose,
      tone: aiPersonaCards.tone,
    });

  if (inserted) {
    return inserted;
  }

  const [row] = await tx
    .select({
      enabled: aiPersonaCards.enabled,
      beat: aiPersonaCards.beat,
      id: aiPersonaCards.id,
      maxWords: aiPersonaCards.maxWords,
      minWords: aiPersonaCards.minWords,
      name: aiPersonaCards.name,
      performsWhen: aiPersonaCards.performsWhen,
      persona: aiPersonaCards.persona,
      pointOfView: aiPersonaCards.pointOfView,
      promptTemplate: aiPersonaCards.promptTemplate,
      purpose: aiPersonaCards.purpose,
      tone: aiPersonaCards.tone,
    })
    .from(aiPersonaCards)
    .where(
      and(
        eq(aiPersonaCards.leagueId, leagueId),
        eq(aiPersonaCards.persona, persona),
      ),
    )
    .limit(1);

  if (!row) {
    throw new AppError({
      code: "AI_PERSONA_CARD_MISSING",
      message: "AI persona card could not be loaded",
      status: 500,
    });
  }

  return row;
}

async function loadInstigationContext({
  id,
  leagueId,
  tx,
}: {
  id: string;
  leagueId: string;
  tx: LeagueScopedTx;
}): Promise<LeagueContextInstigation | null> {
  const [row] = await tx
    .select({
      groundingRefs: instigations.groundingRefs,
      id: instigations.id,
      kind: instigations.kind,
      options: instigations.options,
      persona: instigations.persona,
      promptText: instigations.promptText,
      status: instigations.status,
    })
    .from(instigations)
    .where(and(eq(instigations.leagueId, leagueId), eq(instigations.id, id)))
    .limit(1);

  return row ?? null;
}

async function loadPollContext({
  id,
  leagueId,
  tx,
}: {
  id: string;
  leagueId: string;
  tx: LeagueScopedTx;
}): Promise<(LeagueContextPoll & { instigationId: string }) | null> {
  const [row] = await tx
    .select({
      id: polls.id,
      instigationId: polls.instigationId,
      options: polls.options,
      question: polls.question,
      result: polls.result,
      status: polls.status,
      winningOptionIdx: polls.winningOptionIdx,
    })
    .from(polls)
    .where(and(eq(polls.leagueId, leagueId), eq(polls.id, id)))
    .limit(1);

  return row ?? null;
}

async function loadLoreClaimContext({
  id,
  leagueId,
  tx,
}: {
  id: string;
  leagueId: string;
  tx: LeagueScopedTx;
}): Promise<(LeagueContextLoreClaim & { sourcePollId: string | null }) | null> {
  const [row] = await tx
    .select({
      id: loreClaims.id,
      kind: loreClaims.kind,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      sourcePollId: loreClaims.sourcePollId,
      statement: loreClaims.statement,
      status: loreClaims.status,
      title: loreClaims.title,
    })
    .from(loreClaims)
    .where(and(eq(loreClaims.leagueId, leagueId), eq(loreClaims.id, id)))
    .limit(1);

  return row ?? null;
}

async function loadLoreClaimForPoll({
  leagueId,
  pollId,
  tx,
}: {
  leagueId: string;
  pollId: string;
  tx: LeagueScopedTx;
}): Promise<LeagueContextLoreClaim | null> {
  const [row] = await tx
    .select({
      id: loreClaims.id,
      kind: loreClaims.kind,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      statement: loreClaims.statement,
      status: loreClaims.status,
      title: loreClaims.title,
    })
    .from(loreClaims)
    .where(
      and(
        eq(loreClaims.leagueId, leagueId),
        eq(loreClaims.sourcePollId, pollId),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function loadTriggerContext({
  input,
  tx,
}: {
  input: GenerateLeagueBlogPostInput;
  tx: LeagueScopedTx;
}): Promise<LeagueContextTrigger> {
  const empty = {
    instigation: null,
    loreClaim: null,
    poll: null,
  } satisfies LeagueContextTrigger;
  const target = parseTriggerContextTarget(input.triggerKey);
  if (!target) {
    return empty;
  }

  if (target.kind === "instigation") {
    const instigation = await loadInstigationContext({
      id: target.id,
      leagueId: input.leagueId,
      tx,
    });
    return { ...empty, instigation };
  }

  if (target.kind === "poll") {
    const poll = await loadPollContext({
      id: target.id,
      leagueId: input.leagueId,
      tx,
    });
    const instigation = poll
      ? await loadInstigationContext({
          id: poll.instigationId,
          leagueId: input.leagueId,
          tx,
        })
      : null;
    const loreClaim = poll
      ? await loadLoreClaimForPoll({
          leagueId: input.leagueId,
          pollId: poll.id,
          tx,
        })
      : null;
    return { instigation, loreClaim, poll };
  }

  const claim = await loadLoreClaimContext({
    id: target.id,
    leagueId: input.leagueId,
    tx,
  });
  const poll = claim?.sourcePollId
    ? await loadPollContext({
        id: claim.sourcePollId,
        leagueId: input.leagueId,
        tx,
      })
    : null;
  const instigation = poll
    ? await loadInstigationContext({
        id: poll.instigationId,
        leagueId: input.leagueId,
        tx,
      })
    : null;
  const loreClaim = claim
    ? {
        id: claim.id,
        kind: claim.kind,
        ratifiedAt: claim.ratifiedAt,
        ratifiedBy: claim.ratifiedBy,
        statement: claim.statement,
        status: claim.status,
        title: claim.title,
      }
    : null;
  return { instigation, loreClaim, poll };
}

async function prepareGeneration({
  input,
  tx,
}: {
  input: GenerateLeagueBlogPostInput;
  tx: LeagueScopedTx;
}): Promise<PreparedGeneration | GenerateLeagueBlogPostResult> {
  const runTriggerKey = generationRunTriggerKey(input);
  const [existingRun] = await tx
    .select({
      contentItemId: aiGenerationRuns.contentItemId,
      id: aiGenerationRuns.id,
      promptPrefixHash: aiGenerationRuns.promptPrefixHash,
      skipReason: aiGenerationRuns.skipReason,
      status: aiGenerationRuns.status,
    })
    .from(aiGenerationRuns)
    .where(
      and(
        eq(aiGenerationRuns.leagueId, input.leagueId),
        eq(aiGenerationRuns.persona, input.persona),
        eq(aiGenerationRuns.triggerKey, runTriggerKey),
      ),
    )
    .limit(1);

  if (existingRun?.status === "published" && existingRun.contentItemId) {
    const [item] = await tx
      .select({
        id: contentItems.id,
        publishedAt: contentItems.publishedAt,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, existingRun.contentItemId),
          eq(contentItems.leagueId, input.leagueId),
        ),
      )
      .limit(1);
    if (item) {
      return {
        contentItemId: item.id,
        publishedAt: item.publishedAt.toISOString(),
        promptPrefixHash: existingRun.promptPrefixHash ?? "",
        reused: true,
        status: "published",
        title: item.title,
      };
    }
  }

  if (existingRun?.status === "skipped") {
    return {
      promptPrefixHash: existingRun.promptPrefixHash,
      reused: true,
      skipReason: existingRun.skipReason ?? "Previously skipped",
      status: "skipped",
    };
  }

  const [run] = existingRun
    ? [existingRun]
    : await tx
        .insert(aiGenerationRuns)
        .values({
          leagueId: input.leagueId,
          persona: input.persona,
          triggerKey: runTriggerKey,
        })
        .returning({ id: aiGenerationRuns.id });

  const [league] = await tx
    .select({
      currentScoringPeriod: leagues.currentScoringPeriod,
      id: leagues.id,
      name: leagues.name,
      providerLeagueId: leagues.providerLeagueId,
      scoringType: leagues.scoringType,
      season: leagues.season,
      status: leagues.status,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    throw new AppError({
      code: "AI_LEAGUE_NOT_FOUND",
      message: "League could not be found for AI generation",
      status: 404,
    });
  }

  const persona = await ensurePersonaCard({
    leagueId: input.leagueId,
    persona: input.persona,
    tx,
  });

  if (!persona.enabled) {
    return {
      promptPrefixHash: null,
      reused: false,
      skipReason: `${persona.name} persona is disabled`,
      status: "skipped",
    };
  }

  const memberRows = await tx
    .select({
      displayName: fantasyMembers.displayName,
      providerMemberId: fantasyMembers.providerMemberId,
    })
    .from(fantasyMembers)
    .where(
      and(
        eq(fantasyMembers.leagueId, input.leagueId),
        eq(fantasyMembers.season, league.season),
      ),
    );
  const membersByProviderId = new Map(
    memberRows.map((member) => [member.providerMemberId, member.displayName]),
  );

  const teamRows = await tx
    .select({
      losses: fantasyTeams.losses,
      name: fantasyTeams.name,
      ownerMemberIds: fantasyTeams.ownerMemberIds,
      pointsAgainst: fantasyTeams.pointsAgainst,
      pointsFor: fantasyTeams.pointsFor,
      ties: fantasyTeams.ties,
      wins: fantasyTeams.wins,
    })
    .from(fantasyTeams)
    .where(
      and(
        eq(fantasyTeams.leagueId, input.leagueId),
        eq(fantasyTeams.season, league.season),
      ),
    );
  const teams = teamRows.map((team) => ({
    losses: team.losses,
    managerNames: managerNamesFor(team.ownerMemberIds, membersByProviderId),
    name: team.name,
    pointsAgainst: team.pointsAgainst,
    pointsFor: team.pointsFor,
    ties: team.ties,
    wins: team.wins,
  }));

  const unresolvedIntegrityFailures = await tx
    .select({ id: dataIntegrityChecks.id })
    .from(dataIntegrityChecks)
    .where(
      and(
        eq(dataIntegrityChecks.leagueId, input.leagueId),
        eq(dataIntegrityChecks.status, "fail"),
      ),
    )
    .limit(1);

  const recordRows =
    unresolvedIntegrityFailures.length > 0
      ? []
      : await tx
          .select({
            holderPersonId: allTimeRecords.holderPersonId,
            recordType: allTimeRecords.recordType,
            scoringPeriod: allTimeRecords.scoringPeriod,
            season: allTimeRecords.season,
            value: allTimeRecords.value,
          })
          .from(allTimeRecords)
          .where(
            and(
              eq(allTimeRecords.leagueId, input.leagueId),
              eq(allTimeRecords.isCurrent, true),
            ),
          )
          .limit(8);
  const personIds = [
    ...new Set(
      recordRows
        .map((record) => record.holderPersonId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const personRows =
    personIds.length > 0
      ? await tx
          .select({
            canonicalName: persons.canonicalName,
            id: persons.id,
          })
          .from(persons)
          .where(
            and(
              eq(persons.leagueId, input.leagueId),
              inArray(persons.id, personIds),
            ),
          )
      : [];
  const personNamesById = new Map(
    personRows.map((person) => [person.id, person.canonicalName]),
  );

  const priorPosts = await tx
    .select({
      id: contentItems.id,
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
    .orderBy(desc(contentItems.publishedAt))
    .limit(8);

  const memory = await tx
    .select({
      embedding: aiMemory.embedding,
      embeddingDimensions: aiMemory.embeddingDimensions,
      id: aiMemory.id,
      textContent: aiMemory.textContent,
    })
    .from(aiMemory)
    .where(
      and(
        eq(aiMemory.leagueId, input.leagueId),
        eq(aiMemory.source, "blog_post"),
        sql`${aiMemory.metadata}->>'contentType' = ${input.contentType}`,
      ),
    )
    .limit(20);

  const trigger = await loadTriggerContext({ input, tx });

  return {
    context: {
      league,
      memory,
      persona,
      priorPosts,
      records: recordRows.map((record) => ({
        holderName: record.holderPersonId
          ? (personNamesById.get(record.holderPersonId) ?? null)
          : null,
        label: recordLabel(record.recordType),
        scoringPeriod: record.scoringPeriod,
        season: record.season,
        value: record.value,
      })),
      teams,
      trigger,
    },
    runId: run.id,
  };
}

async function markSkipped({
  deps,
  input,
  promptPrefixHash,
  reason,
}: {
  deps: AiGenerationDependencies;
  input: GenerateLeagueBlogPostInput;
  promptPrefixHash: string | null;
  reason: string;
}): Promise<GenerateLeagueBlogPostResult> {
  const timestamp = now(deps);
  const runTriggerKey = generationRunTriggerKey(input);
  await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    await tx
      .update(aiGenerationRuns)
      .set({
        promptPrefixHash,
        skipReason: reason,
        status: "skipped",
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(aiGenerationRuns.leagueId, input.leagueId),
          eq(aiGenerationRuns.persona, input.persona),
          eq(aiGenerationRuns.triggerKey, runTriggerKey),
        ),
      );
  });

  return {
    promptPrefixHash,
    reused: false,
    skipReason: reason,
    status: "skipped",
  };
}

async function publishDraft({
  deps,
  draft,
  embedding,
  input,
  promptPrefixHash,
}: {
  deps: AiGenerationDependencies;
  draft: BlogDraft;
  embedding: number[];
  input: GenerateLeagueBlogPostInput;
  promptPrefixHash: string;
}): Promise<GenerateLeagueBlogPostResult> {
  const timestamp = now(deps);
  const dedupKey = contentDedupKey(input);
  const contentHash = hashText(blogDraftText(draft));
  const runTriggerKey = generationRunTriggerKey(input);

  const result = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (tx) => {
      const [inserted] = await tx
        .insert(contentItems)
        .values({
          authorPersona: input.persona,
          body: draft.body,
          contentHash,
          dedupKey,
          kind: "blog",
          leagueId: input.leagueId,
          metadata: blogDraftMetadata({
            draft,
            persona: input.persona,
            triggerKey: input.triggerKey,
          }),
          publishedAt: timestamp,
          summary: draft.summary,
          title: draft.title,
        })
        .onConflictDoNothing({
          target: [
            contentItems.leagueId,
            contentItems.kind,
            contentItems.dedupKey,
          ],
        })
        .returning({
          id: contentItems.id,
          publishedAt: contentItems.publishedAt,
          title: contentItems.title,
        });

      const item =
        inserted ??
        (
          await tx
            .select({
              id: contentItems.id,
              publishedAt: contentItems.publishedAt,
              title: contentItems.title,
            })
            .from(contentItems)
            .where(
              and(
                eq(contentItems.leagueId, input.leagueId),
                eq(contentItems.kind, "blog"),
                eq(contentItems.dedupKey, dedupKey),
              ),
            )
            .limit(1)
        )[0];

      if (!item) {
        throw new AppError({
          code: "AI_CONTENT_PUBLISH_FAILED",
          message: "AI content item could not be persisted",
          status: 500,
        });
      }

      if (inserted) {
        await tx.insert(aiMemory).values({
          contentItemId: item.id,
          embedding,
          embeddingDimensions: embedding.length,
          embeddingModel: deps.embeddings.model,
          leagueId: input.leagueId,
          metadata: { contentHash, contentType: input.contentType },
          source: "blog_post",
          textContent: blogDraftText(draft),
        });
      }

      await tx
        .update(aiGenerationRuns)
        .set({
          contentItemId: item.id,
          promptPrefixHash,
          status: "published",
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(aiGenerationRuns.leagueId, input.leagueId),
            eq(aiGenerationRuns.persona, input.persona),
            eq(aiGenerationRuns.triggerKey, runTriggerKey),
          ),
        );

      return {
        contentItemId: item.id,
        publishedAt: item.publishedAt.toISOString(),
        promptPrefixHash,
        reused: !inserted,
        status: "published" as const,
        title: item.title,
      };
    },
  );

  if (!result.reused) {
    try {
      await deps.realtime.publishLeagueBlogPublished({
        at: now(deps).toISOString(),
        contentItemId: result.contentItemId,
        leagueId: input.leagueId,
        persona: input.persona,
        publishedAt: result.publishedAt,
        title: result.title,
        triggerKey: input.triggerKey,
        type: REALTIME_EVENTS.blogPublished,
        v: 1,
      });
    } catch (error) {
      logger.warn("Realtime blog publish event failed", {
        contentItemId: result.contentItemId,
        error,
        leagueId: input.leagueId,
      });
    }

    try {
      await deps.push.notifyLeague({
        at: now(deps),
        body: result.title,
        leagueId: input.leagueId,
        tag: `league:${input.leagueId}:blog:${result.contentItemId}`,
        title: "New league post",
        type: PUSH_EVENTS.leagueBlogPublished,
        url: `/leagues/${input.leagueId}/press/${result.contentItemId}`,
      });
    } catch (error) {
      logger.warn("Push blog publish notification failed", {
        contentItemId: result.contentItemId,
        error,
        leagueId: input.leagueId,
      });
    }
  }

  return result;
}

export function createMockAiDependencies(db: Db): AiGenerationDependencies {
  return {
    db,
    embeddings: new DeterministicEmbeddingProvider(),
    llm: new MockLlmClient(),
    push: new NoopPushNotifier(),
    realtime: new NoopRealtimePublisher(),
    web: new MockWebGrounding(),
  };
}

export async function generateLeagueBlogPost({
  deps,
  input,
}: {
  deps: AiGenerationDependencies;
  input: GenerateLeagueBlogPostInput;
}): Promise<GenerateLeagueBlogPostResult> {
  parseAiPersona(input.persona);
  parseAiContentType(input.contentType);
  const duplicateThreshold =
    deps.duplicateThreshold ?? DEFAULT_DUPLICATE_THRESHOLD;

  const prepared = await withLeagueContext(deps.db, input.leagueId, (tx) =>
    prepareGeneration({ input, tx }),
  );
  if ("status" in prepared) {
    if (prepared.status === "skipped" && !prepared.reused) {
      return markSkipped({
        deps,
        input,
        promptPrefixHash: prepared.promptPrefixHash,
        reason: prepared.skipReason,
      });
    }
    return prepared;
  }

  let newsItems: NewsItem[] = [];
  try {
    newsItems = await deps.web.fetch({
      leagueId: input.leagueId,
      leagueName: prepared.context.league.name,
      persona: input.persona,
      triggerKey: input.triggerKey,
    });
  } catch {
    newsItems = [];
  }
  const prompt = buildPromptParts({
    contentType: input.contentType,
    context: prepared.context,
    newsItems,
    triggerKey: input.triggerKey,
  });
  const promptPrefixHash = hashText(prompt.systemPrefix);
  const initialDraft = validateBlogDraft(
    await deps.llm.generate({
      attempt: 1,
      context: prepared.context,
      contentType: input.contentType,
      newsItems,
      persona: input.persona,
      prompt,
    }),
    { contentType: input.contentType, context: prepared.context },
  );
  let embedding = await deps.embeddings.embed(blogDraftText(initialDraft));
  let maxSimilarity = maxPriorSimilarity(embedding, prepared.context.memory);
  let draft = initialDraft;

  if (maxSimilarity > duplicateThreshold) {
    const duplicateNudge =
      "The first draft was too similar to a prior league post. Use a different angle and avoid repeating phrasing.";
    const retryPrompt = buildPromptParts({
      contentType: input.contentType,
      context: prepared.context,
      duplicateNudge,
      newsItems,
      triggerKey: input.triggerKey,
    });
    draft = validateBlogDraft(
      await deps.llm.generate({
        attempt: 2,
        context: prepared.context,
        contentType: input.contentType,
        duplicateNudge,
        newsItems,
        persona: input.persona,
        prompt: retryPrompt,
      }),
      { contentType: input.contentType, context: prepared.context },
    );
    embedding = await deps.embeddings.embed(blogDraftText(draft));
    maxSimilarity = maxPriorSimilarity(embedding, prepared.context.memory);
  }

  if (maxSimilarity > duplicateThreshold) {
    return markSkipped({
      deps,
      input,
      promptPrefixHash,
      reason: `near_duplicate:${maxSimilarity.toFixed(4)}`,
    });
  }

  return publishDraft({
    deps,
    draft,
    embedding,
    input,
    promptPrefixHash,
  });
}
