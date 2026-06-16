// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDictionaryPlayerRefExtractor } from "./player-refs";
import { RssCentralNewsSource, TavilyCentralNewsSource } from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

describe("TavilyCentralNewsSource", () => {
  it("maps Tavily search results into central news source items", async () => {
    const calls: Array<{ options: unknown; query: string }> = [];
    const source = new TavilyCentralNewsSource({
      apiKey: fakeKey(),
      client: {
        search: async (query: string, options?: unknown) => {
          calls.push({ options, query });
          return {
            images: [],
            query,
            requestId: "news-request-1",
            responseTime: 0.1,
            results: [
              {
                content: "Brief central news summary.",
                publishedDate: "2026-06-11T09:00:00.000Z",
                rawContent: "Full central news text.",
                score: 0.95,
                title: "Central fantasy news",
                url: "https://fantasy.example.com/news/story",
              },
            ],
          };
        },
      },
    });

    const items = await source.fetch({
      limit: 4,
      now: new Date("2026-06-11T10:00:00.000Z"),
      topic: "nfl fantasy injuries",
    });

    expect(calls[0]).toMatchObject({
      options: {
        includeRawContent: "text",
        maxResults: 4,
        timeout: 10,
        topic: "news",
      },
      query: "nfl fantasy injuries",
    });
    expect(items).toEqual([
      {
        body: "Full central news text.",
        canonicalUrl: "https://fantasy.example.com/news/story",
        id: expect.stringMatching(/^tavily:/),
        publishedAt: new Date("2026-06-11T09:00:00.000Z"),
        source: "fantasy.example.com",
        sourceType: "web",
        sourceUrl: "https://fantasy.example.com/news/story",
        summary: "Brief central news summary.",
        title: "Central fantasy news",
        topics: ["nfl", "fantasy"],
      },
    ]);
  });

  it("uses the refresh timestamp when Tavily omits a publish date", async () => {
    const source = new TavilyCentralNewsSource({
      apiKey: fakeKey(),
      client: {
        search: async () => ({
          images: [],
          query: "nfl",
          requestId: "news-request-2",
          responseTime: 0.1,
          results: [
            {
              content: "No date content.",
              publishedDate: "",
              score: 0.8,
              title: "No date",
              url: "https://fantasy.example.com/no-date",
            },
          ],
        }),
      },
    });

    const fallback = new Date("2026-06-11T10:00:00.000Z");
    await expect(
      source.fetch({ limit: 1, now: fallback, topic: "nfl" }),
    ).resolves.toMatchObject([{ publishedAt: fallback }]);
  });

  it("emits provider player refs from real search result text", async () => {
    const source = new TavilyCentralNewsSource({
      apiKey: fakeKey(),
      client: {
        search: async () => ({
          images: [],
          query: "nfl",
          requestId: "news-request-player",
          responseTime: 0.1,
          results: [
            {
              content: "Star Runner missed practice with a late-week injury.",
              publishedDate: "2026-06-11T09:00:00.000Z",
              score: 0.8,
              title: "Star Runner injury update",
              url: "https://fantasy.example.com/star-runner",
            },
          ],
        }),
      },
      playerRefExtractor: createDictionaryPlayerRefExtractor([
        {
          label: "Star Runner",
          provider: "espn",
          providerId: "player-1",
        },
      ]),
    });

    await expect(
      source.fetch({
        limit: 1,
        now: new Date("2026-06-11T10:00:00.000Z"),
        topic: "nfl",
      }),
    ).resolves.toMatchObject([
      {
        playerRefs: [
          {
            label: "Star Runner",
            provider: "espn",
            providerId: "player-1",
          },
        ],
      },
    ]);
  });

  it("uses a configurable Tavily SDK timeout", async () => {
    const calls: Array<{ options: unknown; query: string }> = [];
    const source = new TavilyCentralNewsSource({
      apiKey: fakeKey(),
      client: {
        search: async (query: string, options?: unknown) => {
          calls.push({ options, query });
          return {
            images: [],
            query,
            requestId: "news-request-timeout",
            responseTime: 0.1,
            results: [],
          };
        },
      },
      timeoutSeconds: 2,
    });

    await source.fetch({
      limit: 1,
      now: new Date("2026-06-11T10:00:00.000Z"),
      topic: "nfl",
    });

    expect(calls[0]?.options).toMatchObject({ timeout: 2 });
  });
});

describe("RssCentralNewsSource", () => {
  it("maps RSS feed items into central news source items", async () => {
    const calls: string[] = [];
    const source = new RssCentralNewsSource({
      feedUrls: ["https://feeds.example.invalid/nfl.xml"],
      fetcher: async (url) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          text: async () => `
            <rss>
              <channel>
                <title>Fixture Fantasy Feed</title>
                <item>
                  <title><![CDATA[Starter questionable for Sunday]]></title>
                  <link>https://fantasy.example.com/injury?utm_source=rss</link>
                  <guid>rss-item-1</guid>
                  <pubDate>Thu, 11 Jun 2026 08:30:00 GMT</pubDate>
                  <description><![CDATA[Practice report summary.]]></description>
                  <category>injury</category>
                  <category>fantasy</category>
                </item>
              </channel>
            </rss>
          `,
        };
      },
    });

    const items = await source.fetch({
      limit: 5,
      now: new Date("2026-06-11T10:00:00.000Z"),
      topic: "ignored by rss",
    });

    expect(calls).toEqual(["https://feeds.example.invalid/nfl.xml"]);
    expect(items).toEqual([
      {
        body: "Practice report summary.",
        canonicalUrl: "https://fantasy.example.com/injury?utm_source=rss",
        id: "rss-item-1",
        publishedAt: new Date("2026-06-11T08:30:00.000Z"),
        source: "Fixture Fantasy Feed",
        sourceType: "rss",
        sourceUrl: "https://fantasy.example.com/injury?utm_source=rss",
        summary: "Practice report summary.",
        title: "Starter questionable for Sunday",
        topics: ["rss", "injury", "fantasy"],
      },
    ]);
  });

  it("uses the refresh timestamp when RSS omits a publish date", async () => {
    const fallback = new Date("2026-06-11T10:00:00.000Z");
    const source = new RssCentralNewsSource({
      feedUrls: ["https://feeds.example.invalid/nfl.xml"],
      fetcher: async () => ({
        ok: true,
        status: 200,
        text: async () => `
          <rss>
            <channel>
              <item>
                <title>No date RSS item</title>
                <link>https://fantasy.example.com/no-date-rss</link>
                <description>No date summary.</description>
              </item>
            </channel>
          </rss>
        `,
      }),
    });

    await expect(
      source.fetch({ limit: 1, now: fallback, topic: "nfl" }),
    ).resolves.toMatchObject([{ publishedAt: fallback }]);
  });

  it("emits provider player refs from real RSS item text", async () => {
    const source = new RssCentralNewsSource({
      feedUrls: ["https://feeds.example.invalid/nfl.xml"],
      fetcher: async () => ({
        ok: true,
        status: 200,
        text: async () => `
          <rss>
            <channel>
              <item>
                <title>Star Runner questionable for Sunday</title>
                <link>https://fantasy.example.com/rss-star-runner</link>
                <description>Star Runner missed practice.</description>
              </item>
            </channel>
          </rss>
        `,
      }),
      playerRefExtractor: createDictionaryPlayerRefExtractor([
        {
          label: "Star Runner",
          provider: "espn",
          providerId: "player-1",
        },
      ]),
    });

    await expect(
      source.fetch({
        limit: 1,
        now: new Date("2026-06-11T10:00:00.000Z"),
        topic: "nfl",
      }),
    ).resolves.toMatchObject([
      {
        playerRefs: [
          {
            label: "Star Runner",
            provider: "espn",
            providerId: "player-1",
          },
        ],
      },
    ]);
  });
});
