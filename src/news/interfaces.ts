export interface CentralNewsSourceItem {
  id?: string;
  title: string;
  summary?: string;
  body?: string;
  source: string;
  sourceUrl: string;
  canonicalUrl?: string;
  publishedAt: Date;
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
