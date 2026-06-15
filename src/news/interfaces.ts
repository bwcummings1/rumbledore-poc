export interface CentralNewsSourceItem {
  id?: string;
  title: string;
  summary?: string;
  body?: string;
  source: string;
  sourceUrl: string;
  canonicalUrl?: string;
  heroImageUrl?: string;
  publishedAt: Date;
  sourceType?: "rss" | "web" | "mock" | "manual";
  topics?: string[];
}

export interface CentralNewsFetchInput {
  topic: string;
  limit: number;
  now: Date;
}

export interface CentralNewsSource {
  fetch(input: CentralNewsFetchInput): Promise<CentralNewsSourceItem[]>;
}
