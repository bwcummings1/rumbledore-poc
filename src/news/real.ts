import { createHash } from "node:crypto";
import { type TavilyClient, tavily } from "@tavily/core";
import type {
  CentralNewsFetchInput,
  CentralNewsSource,
  CentralNewsSourceItem,
} from "./interfaces";

type TavilySearchClient = Pick<TavilyClient, "search">;

export interface TavilyCentralNewsSourceOptions {
  apiKey: string;
  client?: TavilySearchClient;
}

function stableId(fields: readonly string[]): string {
  return `tavily:${createHash("sha256").update(fields.join("\n")).digest("hex")}`;
}

function parsePublishedAt(value: string | undefined, fallback: Date): Date {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallback;
}

function sourceFromUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Tavily";
  }
}

export class TavilyCentralNewsSource implements CentralNewsSource {
  private readonly client: TavilySearchClient;

  constructor(options: TavilyCentralNewsSourceOptions) {
    this.client = options.client ?? tavily({ apiKey: options.apiKey });
  }

  async fetch(input: CentralNewsFetchInput): Promise<CentralNewsSourceItem[]> {
    // ubs:ignore — interface method name; outbound calls are bounded by Tavily SDK options.
    const response = await this.client.search(input.topic, {
      autoParameters: true,
      includeAnswer: false,
      includeImages: false,
      includeRawContent: "text",
      maxResults: input.limit,
      topic: "news",
    });

    return response.results.map((result, index) => ({
      body: result.rawContent ?? result.content,
      canonicalUrl: result.url,
      id: stableId([
        response.requestId,
        result.url,
        result.title,
        String(index),
      ]),
      publishedAt: parsePublishedAt(result.publishedDate, input.now),
      source: sourceFromUrl(result.url),
      sourceUrl: result.url,
      summary: result.content,
      title: result.title,
      topics: ["nfl", "fantasy"],
    }));
  }
}
