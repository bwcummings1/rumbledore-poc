import { CompositeCentralNewsSource } from "./composite";
import type {
  CentralNewsFetchInput,
  CentralNewsSource,
  CentralNewsSourceItem,
} from "./interfaces";

export class MockWebGroundingCentralNewsSource implements CentralNewsSource {
  async fetch(_input: CentralNewsFetchInput): Promise<CentralNewsSourceItem[]> {
    return [
      {
        body: "A mocked national fantasy update suitable for the central firehose. It is general-audience football context, not league framing.",
        id: "mock-web-central-news-1",
        publishedAt: new Date("2026-06-11T12:00:00.000Z"),
        source: "Mock Web Wire",
        sourceUrl:
          "https://example.invalid/fantasy/week-one-context?utm_source=rumbledore",
        summary: "Central fantasy context without league-specific framing.",
        sourceType: "web",
        title: "Mock fantasy week one context",
        topics: ["nfl", "fantasy"],
        playerRefs: [
          {
            label: "Mock Fixture Starter",
            provider: "espn",
            providerId: "player-1",
          },
        ],
      },
      {
        body: "A mocked practice report with injuries that should land in the injury beat.",
        id: "mock-web-central-news-2",
        publishedAt: new Date("2026-06-11T11:00:00.000Z"),
        source: "Mock Injury Desk",
        sourceUrl: "https://example.invalid/fantasy/injury-roundup",
        summary: "Mock injury roundup for central news.",
        sourceType: "web",
        title: "Mock injury roundup",
        topics: ["injury", "fantasy"],
      },
      {
        body: "A mocked rankings note that gives the central front another beat.",
        id: "mock-web-central-news-3",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
        source: "Mock Rankings Board",
        sourceUrl: "https://example.invalid/fantasy/week-one-rankings",
        summary: "Mock rankings movement for central news.",
        sourceType: "web",
        title: "Mock week one rankings update",
        topics: ["rankings", "fantasy"],
      },
    ];
  }
}

export class MockRssCentralNewsSource implements CentralNewsSource {
  async fetch(_input: CentralNewsFetchInput): Promise<CentralNewsSourceItem[]> {
    return [
      {
        body: "The same mocked update through an RSS feed; URL tracking should not create a second story.",
        id: "mock-rss-central-news-1",
        publishedAt: new Date("2026-06-11T12:05:00.000Z"),
        source: "Mock RSS Wire",
        sourceUrl:
          "https://example.invalid/fantasy/week-one-context/?utm_medium=rss",
        summary: "Duplicate central fantasy context from a feed source.",
        sourceType: "rss",
        title: "Mock fantasy week one context",
        topics: ["fantasy"],
        playerRefs: [
          {
            label: "Mock Fixture Starter",
            provider: "espn",
            providerId: "player-1",
          },
        ],
      },
      {
        body: "A mocked RSS item with waiver context and no league-specific framing.",
        id: "mock-rss-central-news-2",
        publishedAt: new Date("2026-06-11T09:45:00.000Z"),
        source: "Mock Waiver Feed",
        sourceUrl: "https://example.invalid/fantasy/waiver-wire",
        summary: "Mock waiver wire movement for central news.",
        sourceType: "rss",
        title: "Mock waiver wire movement",
        topics: ["waivers", "fantasy"],
      },
      {
        body: "This item is intentionally missing a title so ingestion proves bad feed rows are inertly skipped.",
        id: "mock-rss-central-news-bad",
        publishedAt: new Date("2026-06-11T09:00:00.000Z"),
        source: "Mock Broken Feed",
        sourceType: "rss",
        sourceUrl: "https://example.invalid/fantasy/broken",
        title: "   ",
      },
    ];
  }
}

export class MockCentralNewsSource extends CompositeCentralNewsSource {
  constructor() {
    super([
      new MockWebGroundingCentralNewsSource(),
      new MockRssCentralNewsSource(),
    ]);
  }
}
