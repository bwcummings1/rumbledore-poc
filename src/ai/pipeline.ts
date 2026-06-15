import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getArenaLeaderboardData } from "@/betting/arena";
import { DEFAULT_ENTITLEMENT_CAPS } from "@/core/env/schema";
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
  headToHeadRecords,
  instigations,
  leagues,
  loreClaims,
  loreVerifications,
  persons,
  polls,
} from "@/db/schema";
import {
  type EntitlementReason,
  type EntitlementRequiredTier,
  type EntitlementResolverEnv,
  type EntitlementTier,
  resolveEntitlement,
} from "@/entitlements";
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
  LeagueAuthenticityContext,
  LeagueBlogContext,
  LeagueContextArena,
  LeagueContextArenaMover,
  LeagueContextArenaStanding,
  LeagueContextCadenceFrame,
  LeagueContextCanonLore,
  LeagueContextDisputedLore,
  LeagueContextInstigation,
  LeagueContextLore,
  LeagueContextLoreClaim,
  LeagueContextMemory,
  LeagueContextPendingLore,
  LeagueContextPerson,
  LeagueContextPoll,
  LeagueContextRefutedLore,
  LeagueContextRivalry,
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
  entitlements: EntitlementResolverEnv;
  llm: LlmClient;
  push: PushNotifier;
  realtime: RealtimePublisher;
  web: WebGrounding;
  embeddings: EmbeddingProvider;
  duplicateThreshold?: number;
  now?: () => Date;
}

type ArenaLeaderboardData = Awaited<ReturnType<typeof getArenaLeaderboardData>>;
type ArenaLeaderboardRow = ArenaLeaderboardData["leagueStandings"][number];
type ArenaHeadToHeadLeague = NonNullable<
  ArenaLeaderboardData["headToHead"]
>["anchor"];
type ArenaMoverRow = ArenaLeaderboardData["movers"]["risers"][number];

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
    }
  | {
      status: "blocked";
      reused: boolean;
      reason: EntitlementReason;
      requiredTier: EntitlementRequiredTier;
      tier: EntitlementTier;
      promptPrefixHash: null;
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

const NFL_PHASES = [
  "offseason",
  "preseason",
  "regular",
  "playoffs",
  "superbowl_week",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    return {
      id: triggerTargetIdFromKey("poll-closed", triggerKey),
      kind: "poll",
    };
  }
  if (triggerKey.startsWith("lore-canonized:")) {
    return {
      id: triggerTargetIdFromKey("lore-canonized", triggerKey),
      kind: "claim",
    };
  }
  return null;
}

function triggerTargetIdFromKey(prefix: string, triggerKey: string): string {
  const rest = triggerKey.slice(`${prefix}:`.length);
  const parts = rest.split(":");
  if (parts.length >= 3 && isNflPhase(parts[0])) {
    return parts.slice(2).join(":");
  }
  return rest;
}

function isNflPhase(
  value: string | undefined,
): value is (typeof NFL_PHASES)[number] {
  return Boolean(value && (NFL_PHASES as readonly string[]).includes(value));
}

function gamePhaseForCadence(cadence: string): string | null {
  switch (cadence) {
    case "weekly-wrap":
      return "post_games";
    case "mid-week":
    case "offseason-beat":
      return "quiet";
    case "weekly-preview":
    case "post-odds-refresh":
      return "pre_kickoff";
    default:
      return null;
  }
}

function stakesForFrame({
  cadence,
  event,
  phase,
}: {
  cadence: string | null;
  event: string | null;
  phase: string;
}): string[] {
  if (phase === "playoffs") {
    return ["playoff_stakes"];
  }
  if (phase === "superbowl_week") {
    return ["championship_stakes"];
  }
  if (phase === "preseason") {
    return ["preseason_countdown"];
  }
  if (phase === "offseason") {
    return ["offseason_mythology"];
  }
  if (cadence === "offseason-beat") {
    return ["quiet_week"];
  }
  if (event === "bet.settled" || event === "arena.standings.swing") {
    return ["arena_movement"];
  }
  return [];
}

function parseSeasonWeek(weekToken: string): number | null {
  if (!/^\d+$/.test(weekToken)) {
    return null;
  }

  const parsed = Number.parseInt(weekToken, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFramedReactiveKey({
  event,
  prefix,
  triggerKey,
}: {
  event: string;
  prefix: string;
  triggerKey: string;
}): LeagueContextCadenceFrame | null {
  if (!triggerKey.startsWith(`${prefix}:`)) {
    return null;
  }

  const parts = triggerKey.slice(`${prefix}:`.length).split(":");
  const phase = parts[0];
  const weekToken = parts[1];
  if (!isNflPhase(phase) || !weekToken) {
    return null;
  }

  return {
    cadence: null,
    event,
    gamePhase: null,
    phase,
    seasonWeek: parseSeasonWeek(weekToken),
    source: "reactive",
    stakes: stakesForFrame({ cadence: null, event, phase }),
    weekToken,
  };
}

function parseTriggerCadenceFrame(
  triggerKey: string,
): LeagueContextCadenceFrame | null {
  if (triggerKey.startsWith("cron:")) {
    const [, cadence, phase, weekToken] = triggerKey.split(":");
    if (!cadence || !isNflPhase(phase) || !weekToken) {
      return null;
    }

    return {
      cadence,
      event: cadence === "weekly-wrap" ? "game.final" : null,
      gamePhase: gamePhaseForCadence(cadence),
      phase,
      seasonWeek: parseSeasonWeek(weekToken),
      source: "scheduled",
      stakes: stakesForFrame({ cadence, event: null, phase }),
      weekToken,
    };
  }

  return (
    parseFramedReactiveKey({
      event: "lore.canonized",
      prefix: "lore-canonized",
      triggerKey,
    }) ??
    parseFramedReactiveKey({
      event: "poll.closed",
      prefix: "poll-closed",
      triggerKey,
    }) ??
    parseFramedReactiveKey({
      event: "bet.settled",
      prefix: "bet-settled",
      triggerKey,
    }) ??
    parseFramedReactiveKey({
      event: "arena.standings.swing",
      prefix: "arena-swing",
      triggerKey,
    }) ??
    null
  );
}

function recordTargetIdFromTriggerKey(triggerKey: string): string | null {
  if (!triggerKey.startsWith("record-broken:")) {
    return null;
  }
  const candidate = triggerKey.slice(triggerKey.lastIndexOf(":") + 1);
  return UUID_PATTERN.test(candidate) ? candidate : null;
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

async function loadNearestBlogMemories({
  deps,
  embedding,
  input,
}: {
  deps: Pick<AiGenerationDependencies, "db" | "embeddings">;
  embedding: readonly number[];
  input: GenerateLeagueBlogPostInput;
}): Promise<LeagueContextMemory[]> {
  if (embedding.length === 0) {
    return [];
  }

  const queryVector = JSON.stringify(embedding);
  const distance = sql`${aiMemory.embedding} <=> ${queryVector}::vector`;
  return withLeagueContext(deps.db, input.leagueId, (tx) =>
    tx
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
          eq(aiMemory.embeddingDimensions, embedding.length),
          eq(aiMemory.embeddingModel, deps.embeddings.model),
          sql`${aiMemory.metadata}->>'contentType' = ${input.contentType}`,
        ),
      )
      .orderBy(distance)
      .limit(20),
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
    id: record.id,
    label: record.label,
    previousHolderName: record.previousHolderName,
    previousRecordId: record.previousRecordId,
    previousValue: record.previousValue,
    recordType: record.recordType,
    scoringPeriod: record.scoringPeriod,
    season: record.season,
    value: record.value,
  }));
}

function stableAuthenticityFacts(context: LeagueBlogContext) {
  const serializeLoreItem = (
    claim:
      | LeagueContextCanonLore
      | LeagueContextDisputedLore
      | LeagueContextPendingLore
      | LeagueContextRefutedLore,
  ) => ({
    authorPersona: claim.authorPersona,
    branchOf: claim.branchOf,
    id: claim.id,
    kind: claim.kind,
    origin: claim.origin,
    ratifiedAt: claim.ratifiedAt?.toISOString() ?? null,
    ratifiedBy: claim.ratifiedBy,
    relation: claim.relation,
    sourceInstigationId: claim.sourceInstigationId,
    sourcePollId: claim.sourcePollId,
    statement: claim.statement,
    status: claim.status,
    title: claim.title,
    verification: claim.verification,
    voteClosesAt: claim.voteClosesAt?.toISOString() ?? null,
  });
  return {
    canonLore: context.authenticity.canonLore.map((claim) => ({
      id: claim.id,
      ratifiedAt: claim.ratifiedAt?.toISOString() ?? null,
      ratifiedBy: claim.ratifiedBy,
      statement: claim.statement,
      title: claim.title,
    })),
    lore: {
      canon: context.authenticity.lore.canon.map((claim) => ({
        ...serializeLoreItem(claim),
        provenance: claim.provenance,
      })),
      disputed: context.authenticity.lore.disputed.map(serializeLoreItem),
      pending: context.authenticity.lore.pending.map(serializeLoreItem),
      refuted: context.authenticity.lore.refuted.map((claim) => ({
        ...serializeLoreItem(claim),
        actualValue: claim.actualValue,
        assertedValue: claim.assertedValue,
        matchedRefs: claim.matchedRefs,
      })),
    },
    people: context.authenticity.people.map((person) => ({
      canonicalName: person.canonicalName,
      ownerNames: person.ownerNames,
    })),
    rivalries: context.authenticity.rivalries.map((rivalry) => ({
      currentStreakLength: rivalry.currentStreakLength,
      currentStreakName: rivalry.currentStreakName,
      longestStreakLength: rivalry.longestStreakLength,
      longestStreakName: rivalry.longestStreakName,
      meetings: rivalry.meetings,
      personAName: rivalry.personAName,
      personAWins: rivalry.personAWins,
      personBName: rivalry.personBName,
      personBWins: rivalry.personBWins,
      ties: rivalry.ties,
    })),
  };
}

function emptyArenaContext(): LeagueContextArena {
  return {
    computedAt: null,
    fieldLeader: null,
    headToHead: null,
    leagueStanding: null,
    movers: { fallers: [], risers: [] },
    season: null,
    topLeagueStandings: [],
  };
}

function arenaStandingFromLeaderboardRow(
  row: ArenaLeaderboardRow,
): LeagueContextArenaStanding {
  return {
    currentBalanceCents: row.currentBalanceCents,
    displayName: row.displayName,
    id: row.id,
    netPnlCents: row.netPnlCents,
    rank: row.rank,
    rankDelta: row.rankDelta,
    roiBps: row.roiBps,
    weeksSurvived: row.weeksSurvived,
    winRateBps: row.winRateBps,
  };
}

function arenaStandingFromHeadToHeadLeague(
  row: ArenaHeadToHeadLeague,
): LeagueContextArenaStanding {
  return {
    currentBalanceCents: row.currentBalanceCents,
    displayName: row.displayName,
    id: row.id,
    netPnlCents: row.netPnlCents,
    rank: row.rank,
    rankDelta: row.rankDelta,
    roiBps: row.roiBps,
    weeksSurvived: row.weeksSurvived,
    winRateBps: row.winRateBps,
  };
}

function arenaMoverFromRow(row: ArenaMoverRow): LeagueContextArenaMover {
  return {
    displayName: row.displayName,
    kind: row.kind,
    netPnlCents: row.netPnlCents,
    previousRank: row.previousRank,
    rank: row.rank,
    rankDelta: row.rankDelta,
  };
}

async function loadArenaContext({
  db,
  leagueId,
}: {
  db: Db;
  leagueId: string;
}): Promise<LeagueContextArena> {
  const data = await getArenaLeaderboardData(db, {
    leagueId,
    limit: 5,
    movementLimit: 5,
  });
  const topLeagueStandings = data.leagueStandings.map(
    arenaStandingFromLeaderboardRow,
  );
  const headToHead = data.headToHead
    ? {
        anchor: arenaStandingFromHeadToHeadLeague(data.headToHead.anchor),
        comparison: data.headToHead.comparison,
        leaderDisplayName: data.headToHead.leader?.displayName ?? null,
        marginCents: data.headToHead.marginCents,
        rankGap: data.headToHead.rankGap,
        rival: arenaStandingFromHeadToHeadLeague(data.headToHead.rival),
      }
    : null;

  return {
    computedAt: data.computedAt,
    fieldLeader: topLeagueStandings[0] ?? null,
    headToHead,
    leagueStanding:
      headToHead?.anchor ??
      topLeagueStandings.find((row) => row.id === leagueId) ??
      null,
    movers: {
      fallers: data.movers.fallers.map(arenaMoverFromRow),
      risers: data.movers.risers.map(arenaMoverFromRow),
    },
    season: data.season,
    topLeagueStandings,
  };
}

function uniqueStrings(
  values: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function ownerNamesFromHistory(
  history: readonly { ownerNames?: readonly string[] }[],
): string[] {
  return uniqueStrings(history.flatMap((entry) => entry.ownerNames ?? []));
}

function buildEntityTokens({
  canonLore,
  people,
  records,
  rivalries,
  teams,
}: {
  canonLore: readonly LeagueContextCanonLore[];
  people: readonly LeagueContextPerson[];
  records: Readonly<LeagueBlogContext["records"]>;
  rivalries: readonly LeagueContextRivalry[];
  teams: readonly LeagueContextTeam[];
}): string[] {
  return uniqueStrings([
    ...teams.flatMap((team) => [team.name, ...team.managerNames]),
    ...records.flatMap((record) => [record.holderName, record.label]),
    ...people.flatMap((person) => [person.canonicalName, ...person.ownerNames]),
    ...rivalries.flatMap((rivalry) => [
      rivalry.personAName,
      rivalry.personBName,
      `${rivalry.personAName} vs ${rivalry.personBName}`,
      rivalry.currentStreakName,
      rivalry.longestStreakName,
    ]),
    ...canonLore.flatMap((claim) => [claim.title, claim.statement]),
  ]).filter((token) => token.length >= 3);
}

function tokenAppearsInText(text: string, token: string): boolean {
  return text.toLocaleLowerCase().includes(token.toLocaleLowerCase());
}

function referencedLeagueEntity({
  context,
  draft,
}: {
  context: LeagueBlogContext;
  draft: BlogDraft;
}): string | null {
  const text = blogDraftText(draft);
  return (
    context.authenticity.entityTokens.find((token) =>
      tokenAppearsInText(text, token),
    ) ?? null
  );
}

function validateDraftOrGeneric({
  contentType,
  context,
  draft,
}: {
  contentType: AiContentType;
  context: LeagueBlogContext;
  draft: BlogDraft;
}): BlogDraft | null {
  try {
    return validateBlogDraft(draft, { contentType, context });
  } catch (error) {
    if (error instanceof AppError && error.code === "AI_DRAFT_GENERIC") {
      return null;
    }
    throw error;
  }
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
    authenticity: stableAuthenticityFacts(context),
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
    arena: context.arena,
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

interface LoreClaimReadRow {
  authorPersona: AiPersona | null;
  branchOf: string | null;
  id: string;
  kind: string;
  origin: string;
  ratifiedAt: Date | null;
  ratifiedBy: "verified" | "vote" | "steward" | null;
  relation: string;
  sourceInstigationId: string | null;
  sourcePollId: string | null;
  statement: string;
  status: string;
  title: string;
  verification: string;
  voteClosesAt: Date | null;
}

function commonLoreFields(row: LoreClaimReadRow) {
  return {
    authorPersona: row.authorPersona,
    branchOf: row.branchOf,
    id: row.id,
    kind: row.kind,
    origin: row.origin,
    ratifiedAt: row.ratifiedAt,
    ratifiedBy: row.ratifiedBy,
    relation: row.relation,
    sourceInstigationId: row.sourceInstigationId,
    sourcePollId: row.sourcePollId,
    statement: row.statement,
    title: row.title,
    verification: row.verification,
    voteClosesAt: row.voteClosesAt,
  };
}

function canonLoreFromRow(row: LoreClaimReadRow): LeagueContextCanonLore {
  return {
    ...commonLoreFields(row),
    provenance: row.ratifiedBy ?? "vote",
    status: "canon",
  };
}

function pendingLoreFromRow(row: LoreClaimReadRow): LeagueContextPendingLore {
  return {
    ...commonLoreFields(row),
    status: row.status === "pending" ? "pending" : "vote",
  };
}

function disputedLoreFromRow(row: LoreClaimReadRow): LeagueContextDisputedLore {
  return {
    ...commonLoreFields(row),
    status: "disputed",
  };
}

function refutedLoreFromRow(
  row: LoreClaimReadRow & {
    actualValue: string | null;
    assertedValue: string | null;
    matchedRefs: Record<string, unknown>[] | null;
  },
): LeagueContextRefutedLore {
  return {
    ...commonLoreFields(row),
    actualValue: row.actualValue,
    assertedValue: row.assertedValue,
    matchedRefs: row.matchedRefs ?? [],
    status: "rejected",
    verification: "refuted",
  };
}

async function loadTriggerContext({
  input,
  tx,
}: {
  input: GenerateLeagueBlogPostInput;
  tx: LeagueScopedTx;
}): Promise<LeagueContextTrigger> {
  const cadence = parseTriggerCadenceFrame(input.triggerKey);
  const empty = {
    cadence,
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
    return { cadence, instigation, loreClaim, poll };
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
  return { cadence, instigation, loreClaim, poll };
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

  const recordTargetId = recordTargetIdFromTriggerKey(input.triggerKey);
  const defaultRecordRows =
    unresolvedIntegrityFailures.length > 0
      ? []
      : await tx
          .select({
            holderPersonId: allTimeRecords.holderPersonId,
            id: allTimeRecords.id,
            previousRecordId: allTimeRecords.previousRecordId,
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
          .orderBy(asc(allTimeRecords.recordType))
          .limit(8);
  const targetedRecordRows =
    unresolvedIntegrityFailures.length > 0 || !recordTargetId
      ? []
      : await tx
          .select({
            holderPersonId: allTimeRecords.holderPersonId,
            id: allTimeRecords.id,
            previousRecordId: allTimeRecords.previousRecordId,
            recordType: allTimeRecords.recordType,
            scoringPeriod: allTimeRecords.scoringPeriod,
            season: allTimeRecords.season,
            value: allTimeRecords.value,
          })
          .from(allTimeRecords)
          .where(
            and(
              eq(allTimeRecords.leagueId, input.leagueId),
              eq(allTimeRecords.id, recordTargetId),
              eq(allTimeRecords.isCurrent, true),
            ),
          )
          .limit(1);
  const recordRows = [
    ...targetedRecordRows,
    ...defaultRecordRows.filter(
      (record) =>
        !targetedRecordRows.some((targeted) => targeted.id === record.id),
    ),
  ];
  const previousRecordIds = [
    ...new Set(
      recordRows
        .map((record) => record.previousRecordId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const previousRecordRows =
    previousRecordIds.length > 0
      ? await tx
          .select({
            holderPersonId: allTimeRecords.holderPersonId,
            id: allTimeRecords.id,
            value: allTimeRecords.value,
          })
          .from(allTimeRecords)
          .where(
            and(
              eq(allTimeRecords.leagueId, input.leagueId),
              inArray(allTimeRecords.id, previousRecordIds),
            ),
          )
      : [];
  const previousRecordsById = new Map(
    previousRecordRows.map((record) => [record.id, record]),
  );

  const rivalryRows =
    unresolvedIntegrityFailures.length > 0
      ? []
      : await tx
          .select({
            currentStreakLength: headToHeadRecords.currentStreakLength,
            currentStreakPersonId: headToHeadRecords.currentStreakPersonId,
            id: headToHeadRecords.id,
            longestStreakLength: headToHeadRecords.longestStreakLength,
            longestStreakPersonId: headToHeadRecords.longestStreakPersonId,
            meetings: headToHeadRecords.meetings,
            personAId: headToHeadRecords.personAId,
            personAWins: headToHeadRecords.personAWins,
            personBId: headToHeadRecords.personBId,
            personBWins: headToHeadRecords.personBWins,
            ties: headToHeadRecords.ties,
          })
          .from(headToHeadRecords)
          .where(eq(headToHeadRecords.leagueId, input.leagueId))
          .orderBy(
            desc(headToHeadRecords.meetings),
            desc(headToHeadRecords.updatedAt),
          )
          .limit(6);

  const visiblePersonRows = await tx
    .select({
      canonicalName: persons.canonicalName,
      id: persons.id,
      ownerHistory: persons.ownerHistory,
    })
    .from(persons)
    .where(eq(persons.leagueId, input.leagueId))
    .orderBy(asc(persons.canonicalName))
    .limit(24);

  const neededPersonIds = [
    ...new Set(
      [
        ...recordRows.map((record) => record.holderPersonId),
        ...previousRecordRows.map((record) => record.holderPersonId),
        ...rivalryRows.flatMap((rivalry) => [
          rivalry.currentStreakPersonId,
          rivalry.longestStreakPersonId,
          rivalry.personAId,
          rivalry.personBId,
        ]),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const visiblePersonIds = new Set(
    visiblePersonRows.map((person) => person.id),
  );
  const missingPersonIds = neededPersonIds.filter(
    (id) => !visiblePersonIds.has(id),
  );
  const missingPersonRows =
    missingPersonIds.length > 0
      ? await tx
          .select({
            canonicalName: persons.canonicalName,
            id: persons.id,
            ownerHistory: persons.ownerHistory,
          })
          .from(persons)
          .where(
            and(
              eq(persons.leagueId, input.leagueId),
              inArray(persons.id, missingPersonIds),
            ),
          )
      : [];

  const allPersonRows = [...visiblePersonRows, ...missingPersonRows].sort(
    (left, right) => left.canonicalName.localeCompare(right.canonicalName),
  );
  const personNamesById = new Map(
    allPersonRows.map((person) => [person.id, person.canonicalName]),
  );

  const canonRows = await tx
    .select({
      authorPersona: loreClaims.authorPersona,
      branchOf: loreClaims.branchOf,
      id: loreClaims.id,
      kind: loreClaims.kind,
      origin: loreClaims.origin,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      relation: loreClaims.relation,
      sourceInstigationId: loreClaims.sourceInstigationId,
      sourcePollId: loreClaims.sourcePollId,
      statement: loreClaims.statement,
      status: loreClaims.status,
      title: loreClaims.title,
      verification: loreClaims.verification,
      voteClosesAt: loreClaims.voteClosesAt,
    })
    .from(loreClaims)
    .where(
      and(
        eq(loreClaims.leagueId, input.leagueId),
        eq(loreClaims.status, "canon"),
      ),
    )
    .orderBy(desc(loreClaims.ratifiedAt), desc(loreClaims.createdAt))
    .limit(8);

  const pendingLoreRows = await tx
    .select({
      authorPersona: loreClaims.authorPersona,
      branchOf: loreClaims.branchOf,
      id: loreClaims.id,
      kind: loreClaims.kind,
      origin: loreClaims.origin,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      relation: loreClaims.relation,
      sourceInstigationId: loreClaims.sourceInstigationId,
      sourcePollId: loreClaims.sourcePollId,
      statement: loreClaims.statement,
      status: loreClaims.status,
      title: loreClaims.title,
      verification: loreClaims.verification,
      voteClosesAt: loreClaims.voteClosesAt,
    })
    .from(loreClaims)
    .where(
      and(
        eq(loreClaims.leagueId, input.leagueId),
        inArray(loreClaims.status, ["pending", "vote"]),
      ),
    )
    .orderBy(asc(loreClaims.voteClosesAt), desc(loreClaims.createdAt))
    .limit(8);

  const disputedLoreRows = await tx
    .select({
      authorPersona: loreClaims.authorPersona,
      branchOf: loreClaims.branchOf,
      id: loreClaims.id,
      kind: loreClaims.kind,
      origin: loreClaims.origin,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      relation: loreClaims.relation,
      sourceInstigationId: loreClaims.sourceInstigationId,
      sourcePollId: loreClaims.sourcePollId,
      statement: loreClaims.statement,
      status: loreClaims.status,
      title: loreClaims.title,
      verification: loreClaims.verification,
      voteClosesAt: loreClaims.voteClosesAt,
    })
    .from(loreClaims)
    .where(
      and(
        eq(loreClaims.leagueId, input.leagueId),
        eq(loreClaims.status, "disputed"),
      ),
    )
    .orderBy(desc(loreClaims.updatedAt), desc(loreClaims.createdAt))
    .limit(8);

  const refutedLoreRows = await tx
    .select({
      actualValue: loreVerifications.actualValue,
      assertedValue: loreVerifications.assertedValue,
      authorPersona: loreClaims.authorPersona,
      branchOf: loreClaims.branchOf,
      id: loreClaims.id,
      kind: loreClaims.kind,
      matchedRefs: loreVerifications.matchedRefs,
      origin: loreClaims.origin,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      relation: loreClaims.relation,
      sourceInstigationId: loreClaims.sourceInstigationId,
      sourcePollId: loreClaims.sourcePollId,
      statement: loreClaims.statement,
      status: loreClaims.status,
      title: loreClaims.title,
      verification: loreClaims.verification,
      voteClosesAt: loreClaims.voteClosesAt,
    })
    .from(loreClaims)
    .leftJoin(
      loreVerifications,
      and(
        eq(loreVerifications.leagueId, input.leagueId),
        eq(loreVerifications.claimId, loreClaims.id),
      ),
    )
    .where(
      and(
        eq(loreClaims.leagueId, input.leagueId),
        eq(loreClaims.status, "rejected"),
        eq(loreClaims.verification, "refuted"),
      ),
    )
    .orderBy(desc(loreClaims.createdAt))
    .limit(8);

  const records = recordRows.map((record) => {
    const previous = record.previousRecordId
      ? previousRecordsById.get(record.previousRecordId)
      : null;
    return {
      holderName: record.holderPersonId
        ? (personNamesById.get(record.holderPersonId) ?? null)
        : null,
      id: record.id,
      label: recordLabel(record.recordType),
      previousHolderName: previous?.holderPersonId
        ? (personNamesById.get(previous.holderPersonId) ?? null)
        : null,
      previousRecordId: record.previousRecordId,
      previousValue: previous?.value ?? null,
      recordType: record.recordType,
      scoringPeriod: record.scoringPeriod,
      season: record.season,
      value: record.value,
    };
  });
  const people = allPersonRows.map((person) => ({
    canonicalName: person.canonicalName,
    id: person.id,
    ownerNames: ownerNamesFromHistory(person.ownerHistory),
  }));
  const rivalries = rivalryRows.map((rivalry) => ({
    currentStreakLength: rivalry.currentStreakLength,
    currentStreakName: rivalry.currentStreakPersonId
      ? (personNamesById.get(rivalry.currentStreakPersonId) ?? null)
      : null,
    id: rivalry.id,
    longestStreakLength: rivalry.longestStreakLength,
    longestStreakName: rivalry.longestStreakPersonId
      ? (personNamesById.get(rivalry.longestStreakPersonId) ?? null)
      : null,
    meetings: rivalry.meetings,
    personAName: personNamesById.get(rivalry.personAId) ?? "Unknown manager",
    personAWins: rivalry.personAWins,
    personBName: personNamesById.get(rivalry.personBId) ?? "Unknown manager",
    personBWins: rivalry.personBWins,
    ties: rivalry.ties,
  }));
  const lore: LeagueContextLore = {
    canon: canonRows.map(canonLoreFromRow),
    disputed: disputedLoreRows.map(disputedLoreFromRow),
    pending: pendingLoreRows.map(pendingLoreFromRow),
    refuted: refutedLoreRows.map(refutedLoreFromRow),
  };
  const canonLore = lore.canon;
  const authenticity: LeagueAuthenticityContext = {
    canonLore,
    entityTokens: buildEntityTokens({
      canonLore,
      people,
      records,
      rivalries,
      teams,
    }),
    lore,
    people,
    rivalries,
  };

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
    .orderBy(desc(aiMemory.createdAt))
    .limit(20);

  const trigger = await loadTriggerContext({ input, tx });

  return {
    context: {
      league,
      arena: emptyArenaContext(),
      authenticity,
      memory,
      persona,
      priorPosts,
      records,
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

function blockedEntitlementReason({
  capability,
  reason,
  requiredTier,
}: {
  capability: string;
  reason: EntitlementReason;
  requiredTier: EntitlementRequiredTier;
}): string {
  return `entitlement:${capability}:${reason}:requires_${requiredTier}`;
}

async function markBlockedByEntitlement({
  deps,
  input,
  reason,
  requiredTier,
  tier,
}: {
  deps: AiGenerationDependencies;
  input: GenerateLeagueBlogPostInput;
  reason: EntitlementReason;
  requiredTier: EntitlementRequiredTier;
  tier: EntitlementTier;
}): Promise<GenerateLeagueBlogPostResult> {
  const timestamp = now(deps);
  const runTriggerKey = generationRunTriggerKey(input);
  const skipReason = blockedEntitlementReason({
    capability: "ai.cast.generate",
    reason,
    requiredTier,
  });
  let reused = false;

  await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [existingRun] = await tx
      .select({ id: aiGenerationRuns.id })
      .from(aiGenerationRuns)
      .where(
        and(
          eq(aiGenerationRuns.leagueId, input.leagueId),
          eq(aiGenerationRuns.persona, input.persona),
          eq(aiGenerationRuns.triggerKey, runTriggerKey),
        ),
      )
      .limit(1);

    reused = Boolean(existingRun);

    if (existingRun) {
      await tx
        .update(aiGenerationRuns)
        .set({
          contentItemId: null,
          errorMessage: null,
          promptPrefixHash: null,
          skipReason,
          status: "blocked_entitlement",
          updatedAt: timestamp,
        })
        .where(eq(aiGenerationRuns.id, existingRun.id));
      return;
    }

    await tx.insert(aiGenerationRuns).values({
      leagueId: input.leagueId,
      persona: input.persona,
      promptPrefixHash: null,
      skipReason,
      status: "blocked_entitlement",
      triggerKey: runTriggerKey,
      updatedAt: timestamp,
    });
  });

  return {
    promptPrefixHash: null,
    reason,
    requiredTier,
    reused,
    status: "blocked",
    tier,
  };
}

async function publishDraft({
  context,
  deps,
  draft,
  embedding,
  input,
  promptPrefixHash,
}: {
  context: LeagueBlogContext;
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
            context,
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
    entitlements: {
      entitlements: {
        caps: DEFAULT_ENTITLEMENT_CAPS,
        devOverride: true,
        gateArenaAdvanced: false,
      },
    },
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
  const entitlement = await resolveEntitlement({
    capability: "ai.cast.generate",
    db: deps.db,
    env: deps.entitlements,
    leagueId: input.leagueId,
    now: deps.now,
  });
  if (!entitlement.allowed) {
    return markBlockedByEntitlement({
      deps,
      input,
      reason: entitlement.reason,
      requiredTier: entitlement.requiredTier,
      tier: entitlement.tier,
    });
  }

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

  const context: LeagueBlogContext = {
    ...prepared.context,
    arena: await loadArenaContext({
      db: deps.db,
      leagueId: input.leagueId,
    }),
  };

  let newsItems: NewsItem[] = [];
  try {
    newsItems = await deps.web.fetch({
      leagueId: input.leagueId,
      leagueName: context.league.name,
      persona: input.persona,
      triggerKey: input.triggerKey,
    });
  } catch {
    newsItems = [];
  }
  const prompt = buildPromptParts({
    contentType: input.contentType,
    context,
    newsItems,
    triggerKey: input.triggerKey,
  });
  const promptPrefixHash = hashText(prompt.systemPrefix);
  const initialDraft = validateDraftOrGeneric({
    contentType: input.contentType,
    context,
    draft: await deps.llm.generate({
      attempt: 1,
      context,
      contentType: input.contentType,
      newsItems,
      persona: input.persona,
      prompt,
    }),
  });
  let draft = initialDraft;
  let alreadyRetried = false;
  if (!draft || !referencedLeagueEntity({ context, draft })) {
    const authenticityNudge =
      "The first draft was too generic. Name a concrete league-owned team, manager, record, rivalry, or canon fact from the supplied context.";
    const retryPrompt = buildPromptParts({
      contentType: input.contentType,
      context,
      duplicateNudge: authenticityNudge,
      newsItems,
      triggerKey: input.triggerKey,
    });
    draft = validateDraftOrGeneric({
      contentType: input.contentType,
      context,
      draft: await deps.llm.generate({
        attempt: 2,
        context,
        contentType: input.contentType,
        duplicateNudge: authenticityNudge,
        newsItems,
        persona: input.persona,
        prompt: retryPrompt,
      }),
    });
    alreadyRetried = true;
  }

  if (!draft || !referencedLeagueEntity({ context, draft })) {
    return markSkipped({
      deps,
      input,
      promptPrefixHash,
      reason: "generic_slop:missing_league_entity",
    });
  }

  let embedding = await deps.embeddings.embed(blogDraftText(draft));
  let nearestMemories = await loadNearestBlogMemories({
    deps,
    embedding,
    input,
  });
  let maxSimilarity = maxPriorSimilarity(embedding, nearestMemories);

  if (maxSimilarity > duplicateThreshold && !alreadyRetried) {
    const duplicateNudge =
      "The first draft was too similar to a prior league post. Use a different angle and avoid repeating phrasing.";
    const retryPrompt = buildPromptParts({
      contentType: input.contentType,
      context,
      duplicateNudge,
      newsItems,
      triggerKey: input.triggerKey,
    });
    const duplicateDraft = validateDraftOrGeneric({
      contentType: input.contentType,
      context,
      draft: await deps.llm.generate({
        attempt: 2,
        context,
        contentType: input.contentType,
        duplicateNudge,
        newsItems,
        persona: input.persona,
        prompt: retryPrompt,
      }),
    });
    if (!duplicateDraft) {
      return markSkipped({
        deps,
        input,
        promptPrefixHash,
        reason: "generic_slop:missing_league_entity",
      });
    }
    draft = duplicateDraft;
    embedding = await deps.embeddings.embed(blogDraftText(draft));
    if (!referencedLeagueEntity({ context, draft })) {
      return markSkipped({
        deps,
        input,
        promptPrefixHash,
        reason: "generic_slop:missing_league_entity",
      });
    }
    nearestMemories = await loadNearestBlogMemories({
      deps,
      embedding,
      input,
    });
    maxSimilarity = maxPriorSimilarity(embedding, nearestMemories);
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
    context,
    deps,
    draft,
    embedding,
    input,
    promptPrefixHash,
  });
}
