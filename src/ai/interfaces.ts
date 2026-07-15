import type { ContentEmbedBodyBlock } from "@/content/embeds";
import type { RoastLevel } from "@/members/roast-consent-types";
import type {
  CentralPublicationBranchId,
  CentralPublicationSectionId,
  LeaguePublicationSectionId,
} from "@/news/sections";
import type {
  CentralColumnContentType,
  CentralColumnDataSource,
  CentralColumnId,
  CentralJournalistId,
} from "./central-columns";
import type { CentralContentStructure } from "./central-content-types";
import type { CentralSourceFreshness } from "./central-freshness";
import type { AiContentType, BlogContentStructure } from "./content-types";
import type { LeagueColumnId } from "./league-columns";
import type { AiPersona, ToneProfile } from "./personas";

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: Date;
  text: string;
}

export interface LeagueContextTeam {
  name: string;
  managerNames: string[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface LeagueContextRecord {
  id: string;
  label: string;
  recordType: string;
  holderName: string | null;
  previousHolderName: string | null;
  previousRecordId: string | null;
  previousValue: number | null;
  value: number;
  season: number | null;
  scoringPeriod: number | null;
}

export interface LeagueContextPriorPost {
  id: string;
  title: string;
  summary: string;
  publishedAt: Date;
}

export interface LeagueContextMemory {
  id: string;
  embedding: number[];
  embeddingDimensions: number;
  textContent: string;
}

export interface LeagueContextPerson {
  id: string;
  canonicalName: string;
  ownerNames: string[];
}

export interface LeagueContextRivalry {
  id: string;
  personAName: string;
  personBName: string;
  meetings: number;
  personAWins: number;
  personBWins: number;
  ties: number;
  currentStreakName: string | null;
  currentStreakLength: number;
  longestStreakName: string | null;
  longestStreakLength: number;
}

export interface LeagueContextCanonLore {
  id: string;
  authorPersona: AiPersona | null;
  branchOf: string | null;
  kind: string;
  origin: string;
  provenance: "verified" | "vote" | "steward";
  title: string;
  relation: string;
  statement: string;
  sourceInstigationId: string | null;
  sourcePollId: string | null;
  status: "canon";
  verification: string;
  ratifiedBy: string | null;
  ratifiedAt: Date | null;
  voteClosesAt: Date | null;
}

export interface LeagueContextPendingLore {
  id: string;
  authorPersona: AiPersona | null;
  branchOf: string | null;
  kind: string;
  origin: string;
  title: string;
  relation: string;
  statement: string;
  sourceInstigationId: string | null;
  sourcePollId: string | null;
  status: "pending" | "vote";
  verification: string;
  ratifiedBy: string | null;
  ratifiedAt: Date | null;
  voteClosesAt: Date | null;
}

export interface LeagueContextDisputedLore {
  id: string;
  authorPersona: AiPersona | null;
  branchOf: string | null;
  kind: string;
  origin: string;
  title: string;
  relation: string;
  statement: string;
  sourceInstigationId: string | null;
  sourcePollId: string | null;
  status: "disputed";
  verification: string;
  ratifiedBy: string | null;
  ratifiedAt: Date | null;
  voteClosesAt: Date | null;
}

export interface LeagueContextRefutedLore {
  id: string;
  actualValue: string | null;
  assertedValue: string | null;
  authorPersona: AiPersona | null;
  branchOf: string | null;
  kind: string;
  matchedRefs: Record<string, unknown>[];
  origin: string;
  title: string;
  relation: string;
  statement: string;
  sourceInstigationId: string | null;
  sourcePollId: string | null;
  status: "rejected";
  verification: "refuted";
  ratifiedBy: string | null;
  ratifiedAt: Date | null;
  voteClosesAt: Date | null;
}

export interface LeagueContextLore {
  canon: LeagueContextCanonLore[];
  pending: LeagueContextPendingLore[];
  disputed: LeagueContextDisputedLore[];
  refuted: LeagueContextRefutedLore[];
}

export interface LeagueAuthenticityContext {
  people: LeagueContextPerson[];
  rivalries: LeagueContextRivalry[];
  lore: LeagueContextLore;
  canonLore: LeagueContextCanonLore[];
  entityTokens: string[];
  roastConsent: Record<RoastLevel, string[]>;
}

export interface LeagueContextInstigation {
  id: string;
  kind: string;
  persona: AiPersona;
  promptText: string;
  options: string[];
  groundingRefs: Record<string, unknown>[];
  status: string;
}

export interface LeagueContextPoll {
  id: string;
  question: string;
  options: string[];
  status: string;
  winningOptionIdx: number | null;
  result: Record<string, unknown> | null;
}

export interface LeagueContextLoreClaim {
  id: string;
  kind: string;
  status: string;
  title: string;
  statement: string;
  ratifiedBy: string | null;
  ratifiedAt: Date | null;
}

export interface LeagueContextCorrection {
  affectedWeeks: {
    scoringPeriod: number;
    season: number;
  }[];
  changedMatchups: {
    contentHash: string;
    id: string;
    scoringPeriod: number;
    season: number;
  }[];
  correctionHash: string;
  originalContentItemId: string;
  reason: string;
}

export interface LeagueContextCadenceFrame {
  cadence: string | null;
  columnFormat: LeagueColumnId | null;
  event: string | null;
  gamePhase: string | null;
  phase: string;
  seasonWeek: number | null;
  source: "scheduled" | "reactive";
  stakes: string[];
  weekToken: string;
}

export interface LeagueContextTrigger {
  cadence?: LeagueContextCadenceFrame | null;
  correction: LeagueContextCorrection | null;
  instigation: LeagueContextInstigation | null;
  poll: LeagueContextPoll | null;
  loreClaim: LeagueContextLoreClaim | null;
}

export interface LeagueContextArenaStanding {
  currentBalanceCents: number;
  displayName: string;
  id: string;
  netPnlCents: number;
  rank: number;
  rankDelta: number;
  roiBps: number;
  weeksSurvived: number;
  winRateBps: number;
}

export interface LeagueContextArenaMover {
  displayName: string;
  kind: "league" | "individual";
  netPnlCents: number;
  previousRank: number;
  rank: number;
  rankDelta: number;
}

export interface LeagueContextArenaHeadToHead {
  anchor: LeagueContextArenaStanding;
  comparison: "leading" | "tied" | "trailing";
  leaderDisplayName: string | null;
  marginCents: number;
  rankGap: number;
  rival: LeagueContextArenaStanding;
}

export interface LeagueContextArena {
  computedAt: string | null;
  fieldLeader: LeagueContextArenaStanding | null;
  headToHead: LeagueContextArenaHeadToHead | null;
  leagueStanding: LeagueContextArenaStanding | null;
  movers: {
    fallers: LeagueContextArenaMover[];
    risers: LeagueContextArenaMover[];
  };
  season: {
    endsAt: string;
    id: string;
    name: string;
    startsAt: string;
    status: "active" | "complete" | "upcoming";
  } | null;
  topLeagueStandings: LeagueContextArenaStanding[];
}

export interface LeagueContextGeneralNflWeekStats {
  fantasyPoints: number;
  interceptions: number;
  opponentTeam: string;
  passingTouchdowns: number;
  passingYards: number;
  receptions: number;
  receivingTouchdowns: number;
  receivingYards: number;
  rushingTouchdowns: number;
  rushingYards: number;
  targets: number;
  team: string;
  week: number;
}

export interface LeagueContextGeneralNflScheduleGame {
  awayScore: number | null;
  awayTeam: string;
  gameTime: string;
  homeScore: number | null;
  homeTeam: string;
  status: "scheduled" | "in_progress" | "final";
  week: number;
}

export interface LeagueContextGeneralNflSeasonTotals {
  fantasyPoints: number;
  games: number;
  interceptions: number;
  passingTouchdowns: number;
  passingYards: number;
  receptions: number;
  receivingTouchdowns: number;
  receivingYards: number;
  rushingTouchdowns: number;
  rushingYards: number;
  targets: number;
}

export interface LeagueContextGeneralNflPlayerFact {
  boundary: "general_nfl_context_not_league_canon";
  confidence: "provider_id" | "name";
  latestWeek: LeagueContextGeneralNflWeekStats | null;
  player: {
    fullName: string;
    position: string;
    sourcePlayerId: string;
    team: string;
  };
  roster: {
    leagueTeamName: string | null;
    playerName: string | null;
    provider: string | null;
    providerPlayerId: string | null;
    providerTeamId: string | null;
    rosterSlot: string | null;
    started: boolean | null;
  };
  schedule: LeagueContextGeneralNflScheduleGame[];
  season: number;
  seasonTotals: LeagueContextGeneralNflSeasonTotals;
  source: string;
}

export interface LeagueContextGeneralNfl {
  boundary: "general_nfl_context_not_league_canon";
  facts: LeagueContextGeneralNflPlayerFact[];
  source: string | null;
}

export interface LeagueContextMatchup {
  awayScore: number;
  awayTeam: string;
  homeScore: number;
  homeTeam: string;
  status: "scheduled" | "in_progress" | "final" | "unknown";
}

export interface LeagueContextMatchupProjection {
  opponent: string;
  opponentProjectedScore: number | null;
  team: string;
  teamProjectedScore: number | null;
}

export interface LeagueContextPlayerProjection {
  leagueTeam: string;
  player: string;
  position: string | null;
  proTeam: string | null;
  projectedPoints: number | null;
}

export interface LeagueContextThursdayNightGame {
  awayScore: number | null;
  awayTeam: string;
  gameTime: string;
  homeScore: number | null;
  homeTeam: string;
  status: "scheduled" | "in_progress" | "final";
}

export interface LeagueContextOddsSignal {
  after: number;
  before: number;
  changed: boolean;
  event: string;
  market: string;
  unit: "implied_percentage" | "line";
}

export interface LeagueContextBlendedColumnData {
  matchupProjections: LeagueContextMatchupProjection[];
  oddsSignals: LeagueContextOddsSignal[];
  playerProjections: LeagueContextPlayerProjection[];
  thursdayNightGames: LeagueContextThursdayNightGame[];
}

export interface LeagueContextWaiverMove {
  fabRemaining: number | null;
  fabSpent: number | null;
  rosterChanges: string[];
  team: string;
}

export interface LeagueContextWaivers {
  fabBudget: number | null;
  moves: LeagueContextWaiverMove[];
}

export interface LeaguePersonaCard {
  id: string;
  persona: AiPersona;
  name: string;
  beat: string;
  pointOfView: string;
  performsWhen: string[];
  purpose: string;
  tone: string;
  promptTemplate: string;
  enabled: boolean;
  minWords: number;
  maxWords: number;
  toneProfile: ToneProfile;
  toneVersion: number;
  toneUpdatedAt: Date;
  toneUpdatedBy: string | null;
}

export interface LeagueBlogContext {
  league: {
    id: string;
    name: string;
    providerLeagueId: string;
    season: number;
    scoringType: string;
    currentScoringPeriod: number;
    status: string;
  };
  persona: LeaguePersonaCard;
  teams: LeagueContextTeam[];
  records: LeagueContextRecord[];
  authenticity: LeagueAuthenticityContext;
  preGenerationContext: LeaguePreGenerationContext | null;
  priorPosts: LeagueContextPriorPost[];
  memory: LeagueContextMemory[];
  trigger: LeagueContextTrigger;
  arena: LeagueContextArena;
  blended?: LeagueContextBlendedColumnData;
  generalNfl: LeagueContextGeneralNfl;
  matchups?: LeagueContextMatchup[];
  waivers?: LeagueContextWaivers;
}

export interface PromptParts {
  promptSectionNames?: string[];
  promptTemplateId?: string;
  promptTemplateVersion?: number;
  systemPrefix: string;
  systemInstructions?: string;
  userTask?: string;
  volatileContext: string;
  prompt: string;
}

export interface CentralPreGenerationContext {
  /** Always central: recall must never borrow from a league publication pool. */
  publicationPool: "central";
  digest: string;
  publishedContentItemIds: string[];
  queuedGenerationKeys: string[];
}

export interface LeaguePreGenerationContext {
  /** The league pool is both explicitly identified and enforced through RLS. */
  publicationPool: "league";
  leagueId: string;
  digest: string;
  publishedContentItemIds: string[];
  queuedGenerationKeys: string[];
}

export interface CentralGenerationNewsEvidence {
  body: string;
  id: string;
  playerRefs: {
    label: string | null;
    provider: string;
    providerId: string;
  }[];
  publishedAt: string;
  source: string;
  sourceUrl: string;
  summary: string;
  title: string;
}

export interface CentralGenerationGameEvidence {
  awayScore: number | null;
  awayTeam: string;
  fetchedAt: string;
  gameTime: string;
  homeScore: number | null;
  homeTeam: string;
  sourceGameId: string;
  status: "scheduled" | "in_progress" | "final";
}

export interface CentralGenerationPlayerEvidence {
  fantasyPoints: number;
  fetchedAt: string;
  fullName: string;
  opponentTeam: string;
  position: string;
  receptions: number;
  receivingYards: number;
  rushingYards: number;
  sourcePlayerId: string;
  targets: number;
  team: string;
}

export interface CentralGenerationTeamStatEvidence {
  fetchedAt: string;
  opponentTeam: string;
  passingYards: number;
  pointsAgainst: number;
  pointsFor: number;
  receivingYards: number;
  rushingYards: number;
  sourceGameId: string;
  team: string;
  turnovers: number;
}

export interface CentralGenerationOddsEvidence {
  awayPrice: number | null;
  awayTeam: string;
  capturedAt: string;
  homePrice: number | null;
  homeTeam: string;
  line: number | null;
  marketId: string;
  marketType: "moneyline" | "spread" | "total" | "player_prop";
  outcomePrice: number | null;
  overPrice: number | null;
  propType: string | null;
  subject: string;
  underPrice: number | null;
}

export interface CentralGenerationContext {
  column: {
    branch: CentralPublicationBranchId;
    contentType: CentralColumnContentType;
    dataSources: readonly CentralColumnDataSource[];
    formatContract: string;
    id: CentralColumnId;
    name: string;
    section: CentralPublicationSectionId;
  };
  evidence: {
    fetchedAt: string | null;
    games: CentralGenerationGameEvidence[];
    news: CentralGenerationNewsEvidence[];
    odds: CentralGenerationOddsEvidence[];
    players: CentralGenerationPlayerEvidence[];
    source: string | null;
    sourceFreshness: CentralSourceFreshness[];
    teamStats: CentralGenerationTeamStatEvidence[];
  };
  journalist: {
    beat: string;
    id: CentralJournalistId;
    name: string;
    persona: AiPersona;
    registerContract: string;
  };
  preGenerationContext: CentralPreGenerationContext | null;
  reportRequest: {
    brief: string;
    category: string;
  } | null;
  requestedAt: string;
  season: number;
  triggerKey: string;
  week: number;
}

export type CentralArticleBodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] };

export interface CentralArticleDraft {
  body: string;
  bodyBlocks: CentralArticleBodyBlock[];
  contentType: CentralColumnContentType;
  dek: string;
  section: CentralPublicationSectionId;
  structure: CentralContentStructure;
  summary: string;
  tags: string[];
  title: string;
}

export interface CentralLlmGenerateRequest {
  contentType: CentralColumnContentType;
  context: CentralGenerationContext;
  prompt: PromptParts;
}

export interface CentralLlmGenerateResult {
  draft: CentralArticleDraft;
  estimated?: boolean;
  usage: LlmUsageBreakdown;
}

export interface CentralLlmClient {
  generateCentral(
    request: CentralLlmGenerateRequest,
  ): Promise<CentralArticleDraft>;
}

export interface UsageReportingCentralLlmClient extends CentralLlmClient {
  generateCentralWithUsage(
    request: CentralLlmGenerateRequest,
  ): Promise<CentralLlmGenerateResult>;
}

export type BlogDraftBodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | ContentEmbedBodyBlock;

export interface BlogDraft {
  contentType: AiContentType;
  title: string;
  summary: string;
  dek: string;
  section: LeaguePublicationSectionId;
  tags: string[];
  citedCanonClaimIds?: string[];
  body: string;
  bodyBlocks: BlogDraftBodyBlock[];
  structure: BlogContentStructure;
}

export interface LlmGenerateRequest {
  columnFormat?: LeagueColumnId | null;
  contentType: AiContentType;
  persona: AiPersona;
  context: LeagueBlogContext;
  newsItems: NewsItem[];
  prompt: PromptParts;
  attempt: 1 | 2;
  duplicateNudge?: string;
}

export interface LlmUsageBreakdown {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmGenerateResult {
  draft: BlogDraft;
  estimated?: boolean;
  usage: LlmUsageBreakdown;
}

export interface LlmClient {
  generate(request: LlmGenerateRequest): Promise<BlogDraft>;
}

export interface UsageReportingLlmClient extends LlmClient {
  generateWithUsage(request: LlmGenerateRequest): Promise<LlmGenerateResult>;
}

export interface LlmModelProviderKeyResolver {
  resolveModelProviderKey(
    request: Pick<LlmGenerateRequest, "contentType" | "persona">,
  ): string | null;
}

export interface LlmModelMetadataResolver {
  resolveModelName(
    request: Pick<LlmGenerateRequest, "contentType" | "persona">,
  ): string | null;
}

export interface LlmJudgeRubric {
  authenticityThreshold: number;
  personaMatchThreshold: number;
  targetingConsentRequired: boolean;
}

export interface LlmJudgeLeagueFacts {
  context: LeagueBlogContext;
  otherLeagueEntityTokens?: string[];
}

export interface LlmJudgeRequest {
  piece: BlogDraft;
  rubric: LlmJudgeRubric;
  leagueFacts: LlmJudgeLeagueFacts;
}

export interface LlmJudgeScore {
  authenticity: number;
  personaMatch: number;
  leakage: boolean;
  targetingConsent: boolean;
  matchedLeagueFacts: string[];
  matchedPersonaMarkers: string[];
  leakedTokens: string[];
  targetedOffLimits: string[];
  notes: string[];
}

export interface LlmJudge {
  score(request: LlmJudgeRequest): Promise<LlmJudgeScore>;
}

export interface WebGrounding {
  fetch(input: {
    leagueId: string;
    leagueName: string;
    persona: AiPersona;
    triggerKey: string;
  }): Promise<NewsItem[]>;
}

export interface EmbeddingProvider {
  model: string;
  embed(text: string): Promise<number[]>;
}
