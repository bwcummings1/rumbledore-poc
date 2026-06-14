import type { LeaguePublicationSectionId } from "@/news/sections";
import type { AiContentType, BlogContentStructure } from "./content-types";
import type { AiPersona } from "./personas";

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
  label: string;
  holderName: string | null;
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
  title: string;
  statement: string;
  ratifiedBy: string | null;
  ratifiedAt: Date | null;
}

export interface LeagueAuthenticityContext {
  people: LeagueContextPerson[];
  rivalries: LeagueContextRivalry[];
  canonLore: LeagueContextCanonLore[];
  entityTokens: string[];
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

export interface LeagueContextTrigger {
  instigation: LeagueContextInstigation | null;
  poll: LeagueContextPoll | null;
  loreClaim: LeagueContextLoreClaim | null;
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
  priorPosts: LeagueContextPriorPost[];
  memory: LeagueContextMemory[];
  trigger: LeagueContextTrigger;
}

export interface PromptParts {
  systemPrefix: string;
  volatileContext: string;
  prompt: string;
}

export type BlogDraftBodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] };

export interface BlogDraft {
  contentType: AiContentType;
  title: string;
  summary: string;
  dek: string;
  section: LeaguePublicationSectionId;
  tags: string[];
  body: string;
  bodyBlocks: BlogDraftBodyBlock[];
  structure: BlogContentStructure;
}

export interface LlmGenerateRequest {
  contentType: AiContentType;
  persona: AiPersona;
  context: LeagueBlogContext;
  newsItems: NewsItem[];
  prompt: PromptParts;
  attempt: 1 | 2;
  duplicateNudge?: string;
}

export interface LlmClient {
  generate(request: LlmGenerateRequest): Promise<BlogDraft>;
}

export interface LlmJudgeRubric {
  authenticityThreshold: number;
  personaMatchThreshold: number;
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
  matchedLeagueFacts: string[];
  matchedPersonaMarkers: string[];
  leakedTokens: string[];
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
