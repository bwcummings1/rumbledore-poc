import type { LeaguePublicationSectionId } from "@/news/sections";
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

export interface LeaguePersonaCard {
  id: string;
  persona: AiPersona;
  name: string;
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
  priorPosts: LeagueContextPriorPost[];
  memory: LeagueContextMemory[];
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
  title: string;
  summary: string;
  dek: string;
  section: LeaguePublicationSectionId;
  tags: string[];
  body: string;
  bodyBlocks: BlogDraftBodyBlock[];
}

export interface LlmGenerateRequest {
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
