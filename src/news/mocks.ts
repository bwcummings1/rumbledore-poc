import type {
  CentralNewsFetchInput,
  CentralNewsSource,
  CentralNewsSourceItem,
} from "./interfaces";

export class MockCentralNewsSource implements CentralNewsSource {
  async fetch(_input: CentralNewsFetchInput): Promise<CentralNewsSourceItem[]> {
    return [
      {
        body: "A mocked national fantasy update suitable for the central firehose.",
        id: "mock-central-news-1",
        publishedAt: new Date("2026-06-11T12:00:00.000Z"),
        source: "Mock NFL Wire",
        sourceUrl:
          "https://example.invalid/fantasy/week-one-context?utm_source=rumbledore",
        summary: "Central fantasy context without league-specific framing.",
        title: "Mock fantasy week one context",
        topics: ["nfl", "fantasy"],
      },
      {
        body: "The same mocked update through a second feed; URL tracking should not create a second story.",
        id: "mock-central-news-1-duplicate",
        publishedAt: new Date("2026-06-11T12:00:00.000Z"),
        source: "Mock RSS Mirror",
        sourceUrl:
          "https://example.invalid/fantasy/week-one-context/?utm_medium=rss",
        summary: "Duplicate central fantasy context from another source.",
        title: "Mock fantasy week one context",
        topics: ["fantasy"],
      },
      {
        body: "A separate mocked injury news item for hub smoke coverage.",
        id: "mock-central-news-2",
        publishedAt: new Date("2026-06-11T11:00:00.000Z"),
        source: "Mock Injury Feed",
        sourceUrl: "https://example.invalid/fantasy/injury-roundup",
        summary: "Mock injury roundup for central news.",
        title: "Mock injury roundup",
        topics: ["injury", "fantasy"],
      },
    ];
  }
}
