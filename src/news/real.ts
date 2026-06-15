import { createHash } from "node:crypto";
import { type TavilyClient, tavily } from "@tavily/core";
import type {
  CentralNewsFetchInput,
  CentralNewsSource,
  CentralNewsSourceItem,
} from "./interfaces";
import {
  type CentralNewsPlayerRefExtractionInput,
  type CentralNewsPlayerRefExtractor,
  EMPTY_PLAYER_REF_EXTRACTOR,
} from "./player-refs";

type TavilySearchClient = Pick<TavilyClient, "search">;

export interface TavilyCentralNewsSourceOptions {
  apiKey: string;
  client?: TavilySearchClient;
  playerRefExtractor?: CentralNewsPlayerRefExtractor;
}

export interface RssCentralNewsSourceOptions {
  feedUrls: readonly string[];
  fetcher?: RssFetcher;
  playerRefExtractor?: CentralNewsPlayerRefExtractor;
}

type RssFetcherResponse = Pick<Response, "ok" | "status" | "text">;
type RssFetcher = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<RssFetcherResponse>;

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

function cleanXmlText(value: string | undefined): string {
  return (value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(block: string, tags: readonly string[]): string {
  for (const tag of tags) {
    const match = new RegExp(
      `<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`,
      "i",
    ).exec(block);
    const value = cleanXmlText(match?.[1]);
    if (value) {
      return value;
    }
  }

  return "";
}

function atomLinkValue(block: string): string {
  const match = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block);
  return cleanXmlText(match?.[1]);
}

function rssSourceName(xml: string, feedUrl: string): string {
  const channelMatch = /<channel\b[^>]*>([\s\S]*?)<\/channel>/i.exec(xml);
  const channelTitle = channelMatch
    ? tagValue(channelMatch[1] ?? "", ["title"])
    : "";
  if (channelTitle) {
    return channelTitle;
  }

  return sourceFromUrl(feedUrl);
}

function categoriesFrom(block: string): string[] {
  const categories: string[] = [];
  for (const match of block.matchAll(
    /<(?:[\w-]+:)?category\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?category>/gi,
  )) {
    const value = cleanXmlText(match[1]);
    if (value) {
      categories.push(value);
    }
  }
  return categories;
}

function blocksFor(xml: string): string[] {
  const rssItems = [...xml.matchAll(/<item\b[^>]*>[\s\S]*?<\/item>/gi)].map(
    ([block]) => block,
  );
  if (rssItems.length > 0) {
    return rssItems;
  }

  return [...xml.matchAll(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi)].map(
    ([block]) => block,
  );
}

async function playerRefsFor(
  extractor: CentralNewsPlayerRefExtractor,
  input: CentralNewsPlayerRefExtractionInput,
) {
  return extractor.extract(input);
}

export class TavilyCentralNewsSource implements CentralNewsSource {
  private readonly client: TavilySearchClient;
  private readonly playerRefExtractor: CentralNewsPlayerRefExtractor;

  constructor(options: TavilyCentralNewsSourceOptions) {
    this.client = options.client ?? tavily({ apiKey: options.apiKey });
    this.playerRefExtractor =
      options.playerRefExtractor ?? EMPTY_PLAYER_REF_EXTRACTOR;
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

    return Promise.all(
      response.results.map(async (result, index) => {
        const body = result.rawContent ?? result.content;
        const summary = result.content;
        const title = result.title;
        const topics = ["nfl", "fantasy"];
        const playerRefs = await playerRefsFor(this.playerRefExtractor, {
          body,
          summary,
          title,
          topics,
        });

        return {
          body,
          canonicalUrl: result.url,
          id: stableId([
            response.requestId,
            result.url,
            result.title,
            String(index),
          ]),
          ...(playerRefs.length > 0 ? { playerRefs } : {}),
          publishedAt: parsePublishedAt(result.publishedDate, input.now),
          source: sourceFromUrl(result.url),
          sourceUrl: result.url,
          sourceType: "web",
          summary,
          title,
          topics,
        };
      }),
    );
  }
}

export class RssCentralNewsSource implements CentralNewsSource {
  private readonly feedUrls: readonly string[];
  private readonly fetcher: RssFetcher;
  private readonly playerRefExtractor: CentralNewsPlayerRefExtractor;

  constructor(options: RssCentralNewsSourceOptions) {
    this.feedUrls = options.feedUrls;
    this.fetcher = options.fetcher ?? fetch;
    this.playerRefExtractor =
      options.playerRefExtractor ?? EMPTY_PLAYER_REF_EXTRACTOR;
  }

  async fetch(input: CentralNewsFetchInput): Promise<CentralNewsSourceItem[]> {
    const fetchedFeeds = await Promise.all(
      this.feedUrls.map(async (feedUrl) => {
        const response = await this.fetcher(feedUrl, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          return [];
        }

        const xml = await response.text();
        const source = rssSourceName(xml, feedUrl);
        return Promise.all(
          blocksFor(xml)
            .slice(0, input.limit)
            .map(async (block, index): Promise<CentralNewsSourceItem> => {
              const sourceUrl =
                tagValue(block, ["link"]) || atomLinkValue(block) || feedUrl;
              const summary = tagValue(block, [
                "description",
                "summary",
                "content",
              ]);
              const body =
                tagValue(block, ["encoded", "content"]) || summary || "";
              const title = tagValue(block, ["title"]);
              const topics = ["rss", ...categoriesFrom(block)];
              const playerRefs = await playerRefsFor(this.playerRefExtractor, {
                body,
                summary,
                title,
                topics,
              });
              return {
                body,
                canonicalUrl: sourceUrl,
                id:
                  tagValue(block, ["guid", "id"]) ||
                  stableId([feedUrl, sourceUrl, String(index)]),
                publishedAt: parsePublishedAt(
                  tagValue(block, ["pubDate", "published", "updated"]),
                  input.now,
                ),
                source,
                sourceType: "rss",
                sourceUrl,
                summary,
                title,
                topics,
                ...(playerRefs.length > 0 ? { playerRefs } : {}),
              };
            }),
        );
      }),
    );

    return fetchedFeeds.flat();
  }
}
