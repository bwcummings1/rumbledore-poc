// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AppError } from "@/core/result";
import type { LlmGenerateRequest } from "./interfaces";
import { AI_PERSONAS } from "./personas";
import {
  ANTHROPIC_BULK_MODEL,
  ANTHROPIC_FLAGSHIP_MODEL,
  AnthropicLlmClient,
  type AnthropicMessagesClient,
  anthropicModelForTier,
  TavilyWebGrounding,
  VoyageEmbeddingProvider,
} from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

function requestFor(
  persona: LlmGenerateRequest["persona"],
): LlmGenerateRequest {
  return {
    attempt: 1,
    contentType: "matchup_preview",
    context: {
      league: {
        currentScoringPeriod: 1,
        id: "00000000-0000-0000-0000-000000000001",
        name: "Private Fixture League",
        providerLeagueId: "95050",
        scoringType: "H2H_POINTS",
        season: 2026,
        status: "in_season",
      },
      authenticity: {
        canonLore: [],
        entityTokens: [],
        lore: {
          canon: [],
          disputed: [],
          pending: [],
          refuted: [],
        },
        people: [],
        rivalries: [],
      },
      arena: {
        computedAt: null,
        fieldLeader: null,
        headToHead: null,
        leagueStanding: null,
        movers: { fallers: [], risers: [] },
        season: null,
        topLeagueStandings: [],
      },
      memory: [],
      persona: {
        beat: "League-official framing",
        enabled: true,
        id: "00000000-0000-0000-0000-000000000002",
        maxWords: 180,
        minWords: 80,
        name: "Commissioner",
        performsWhen: ["weekly-preview"],
        persona,
        pointOfView: "Warm and authoritative",
        promptTemplate: "Frame the week.",
        purpose: "League framing",
        tone: "warm and direct",
      },
      priorPosts: [],
      records: [],
      teams: [],
      trigger: {
        instigation: null,
        loreClaim: null,
        poll: null,
      },
    },
    newsItems: [],
    persona,
    prompt: {
      prompt: "stable\nvolatile",
      systemPrefix: '{"league":"fixture"}',
      volatileContext:
        '{"untrustedNews":"<untrusted_news>[]</untrusted_news>"}',
    },
  };
}

describe("AnthropicLlmClient", () => {
  it("resolves cheap and mixed Anthropic model tiers", () => {
    const cheap = anthropicModelForTier("cheap");
    const mixed = anthropicModelForTier("mixed");

    for (const persona of AI_PERSONAS) {
      expect(cheap(persona)).toBe(ANTHROPIC_BULK_MODEL);
    }
    expect(mixed("narrator")).toBe(ANTHROPIC_FLAGSHIP_MODEL);
    expect(mixed("trash_talker")).toBe(ANTHROPIC_FLAGSHIP_MODEL);
    expect(mixed("analyst")).toBe(ANTHROPIC_BULK_MODEL);
  });

  it("maps generation requests to structured Anthropic messages with cached stable context", async () => {
    const calls: unknown[] = [];
    const client = {
      messages: {
        parse: async (params: unknown) => {
          calls.push(params);
          return {
            parsed_output: {
              body: "Body from Claude.",
              bodyBlocks: [
                { text: "Filed from the desk", type: "heading" },
                { text: "Body from Claude.", type: "paragraph" },
              ],
              citedCanonClaimIds: [],
              contentType: "matchup_preview",
              dek: "Dek from Claude.",
              section: "previews",
              structure: {
                matchups: [
                  {
                    edge: "Fixture Team has the edge.",
                    keyNumber: "120 points for",
                    opponent: "Fixture Opponent",
                    prediction: "Fixture Team is a lean, not a lock.",
                    team: "Fixture Team",
                    xFactor: "Fixture Manager",
                  },
                ],
                type: "matchup_preview",
              },
              summary: "Summary from Claude.",
              tags: ["Fixture Team", "Preview"],
              title: "Title from Claude",
            },
            usage: {
              cache_creation_input_tokens: 30,
              cache_read_input_tokens: 40,
              input_tokens: 100,
              output_tokens: 50,
            },
          };
        },
      },
    } as unknown as AnthropicMessagesClient;
    const llm = new AnthropicLlmClient({
      apiKey: fakeKey(),
      client,
    });

    await expect(llm.generate(requestFor("commissioner"))).resolves.toEqual({
      body: "Body from Claude.",
      bodyBlocks: [
        { text: "Filed from the desk", type: "heading" },
        { text: "Body from Claude.", type: "paragraph" },
      ],
      citedCanonClaimIds: [],
      contentType: "matchup_preview",
      dek: "Dek from Claude.",
      section: "previews",
      structure: {
        matchups: [
          {
            edge: "Fixture Team has the edge.",
            keyNumber: "120 points for",
            opponent: "Fixture Opponent",
            prediction: "Fixture Team is a lean, not a lock.",
            team: "Fixture Team",
            xFactor: "Fixture Manager",
          },
        ],
        type: "matchup_preview",
      },
      summary: "Summary from Claude.",
      tags: ["Fixture Team", "Preview"],
      title: "Title from Claude",
    });
    await llm.generate(requestFor("analyst"));
    await llm.generate(requestFor("beat_reporter"));
    await expect(
      llm.generateWithUsage(requestFor("commissioner")),
    ).resolves.toMatchObject({
      usage: {
        cacheCreationInputTokens: 30,
        cacheReadInputTokens: 40,
        inputTokens: 100,
        outputTokens: 50,
      },
    });

    const first = calls[0] as Record<string, unknown>;
    const second = calls[1] as Record<string, unknown>;
    const third = calls[2] as Record<string, unknown>;
    expect(first.model).toBe(ANTHROPIC_BULK_MODEL);
    expect(second.model).toBe(ANTHROPIC_BULK_MODEL);
    expect(third.model).toBe(ANTHROPIC_BULK_MODEL);
    expect(first).toMatchObject({
      cache_control: { type: "ephemeral" },
      metadata: { user_id: "00000000-0000-0000-0000-000000000001" },
      tool_choice: { type: "none" },
    });
    const system = first.system as Array<Record<string, unknown>>;
    expect(system[0]?.text).toEqual(expect.stringContaining("Beat: "));
    expect(system[0]?.text).toEqual(
      expect.stringContaining("required content_type is matchup_preview"),
    );
    expect(system[0]?.text).toEqual(expect.stringContaining("Point of view: "));
    expect(system[0]?.text).toEqual(expect.stringContaining("Performs when: "));
    expect(system[0]?.text).toEqual(
      expect.stringContaining("citedCanonClaimIds"),
    );
    expect(system[1]).toMatchObject({
      cache_control: { type: "ephemeral" },
      text: expect.stringContaining("Stable league context JSON"),
    });
    expect(JSON.stringify(first)).toContain("<untrusted_news>");
  });

  it("rejects invalid structured output before the pipeline publishes it", async () => {
    const client = {
      messages: {
        parse: async () => ({ parsed_output: { title: "Missing fields" } }),
      },
    } as unknown as AnthropicMessagesClient;
    const llm = new AnthropicLlmClient({
      apiKey: fakeKey(),
      client,
    });

    await expect(llm.generate(requestFor("narrator"))).rejects.toMatchObject({
      code: "AI_LLM_RESPONSE_INVALID",
    } satisfies Partial<AppError>);
  });
});

describe("TavilyWebGrounding", () => {
  it("maps Tavily news results without sending league identifiers to search", async () => {
    const calls: Array<{ options: unknown; query: string }> = [];
    const web = new TavilyWebGrounding({
      apiKey: fakeKey(),
      client: {
        search: async (query: string, options?: unknown) => {
          calls.push({ options, query });
          return {
            images: [],
            query,
            requestId: "request-1",
            responseTime: 0.1,
            results: [
              {
                content: "Short fantasy news summary.",
                publishedDate: "2026-06-11T10:00:00.000Z",
                rawContent: "Full fantasy news text.",
                score: 0.9,
                title: "Fantasy injury update",
                url: "https://news.example.com/story",
              },
            ],
          };
        },
      },
      maxResults: 3,
    });

    const items = await web.fetch({
      leagueId: "00000000-0000-0000-0000-000000000001",
      leagueName: "Do Not Send This League",
      persona: "analyst",
      triggerKey: "weekly:fixture",
    });
    await web.fetch({
      leagueId: "00000000-0000-0000-0000-000000000001",
      leagueName: "Do Not Send This League",
      persona: "beat_reporter",
      triggerKey: "transaction:fixture",
    });

    expect(calls[0]?.query).toContain("latest NFL fantasy football news");
    expect(calls[0]?.query).not.toContain("Do Not Send This League");
    expect(calls[1]?.query).toContain("waiver wire fantasy football");
    expect(calls[1]?.query).not.toContain("Do Not Send This League");
    expect(calls[0]?.options).toMatchObject({
      includeRawContent: "text",
      maxResults: 3,
      topic: "news",
    });
    expect(items).toEqual([
      {
        id: expect.stringMatching(/^tavily-ai-news:/),
        publishedAt: new Date("2026-06-11T10:00:00.000Z"),
        source: "news.example.com",
        text: "Full fantasy news text.",
        title: "Fantasy injury update",
        url: "https://news.example.com/story",
      },
    ]);
  });

  it("degrades to no news when Tavily search fails", async () => {
    const web = new TavilyWebGrounding({
      apiKey: fakeKey(),
      client: {
        search: async () => {
          throw new Error("search unavailable");
        },
      },
    });

    await expect(
      web.fetch({
        leagueId: "00000000-0000-0000-0000-000000000001",
        leagueName: "Fixture",
        persona: "commissioner",
        triggerKey: "weekly:fixture",
      }),
    ).resolves.toEqual([]);
  });
});

describe("VoyageEmbeddingProvider", () => {
  it("posts document text to Voyage and returns the numeric vector", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ init, input });
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
        { status: 200 },
      );
    };
    const provider = new VoyageEmbeddingProvider({
      apiKey: fakeKey(),
      endpoint: "https://voyage.example.test/v1/embeddings",
      fetcher,
      model: "voyage-fixture",
    });

    await expect(provider.embed("league post text")).resolves.toEqual([
      0.1, 0.2, 0.3,
    ]);
    expect(requests[0]?.input).toBe(
      "https://voyage.example.test/v1/embeddings",
    );
    expect(requests[0]?.init?.headers).toMatchObject({
      Authorization: `Bearer ${fakeKey()}`,
      "Content-Type": "application/json",
    });
    await expect(new Response(requests[0]?.init?.body).json()).resolves.toEqual(
      {
        input: "league post text",
        input_type: "document",
        model: "voyage-fixture",
      },
    );
  });

  it("rejects malformed embedding responses", async () => {
    const provider = new VoyageEmbeddingProvider({
      apiKey: fakeKey(),
      fetcher: async () =>
        new Response(JSON.stringify({ data: [{ embedding: ["bad"] }] }), {
          status: 200,
        }),
    });

    await expect(provider.embed("text")).rejects.toMatchObject({
      code: "AI_EMBEDDING_RESPONSE_INVALID",
    } satisfies Partial<AppError>);
  });
});
