// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AppError } from "@/core/result";
import type { LlmGenerateRequest, LlmJudgeRequest } from "./interfaces";
import { createLlmClient } from "./model-providers";
import {
  AI_PERSONAS,
  DEFAULT_TONE_PROFILES,
  DEFAULT_TONE_VERSION,
} from "./personas";
import {
  ANTHROPIC_BULK_MODEL,
  ANTHROPIC_FLAGSHIP_MODEL,
  AnthropicLlmClient,
  AnthropicLlmJudge,
  type AnthropicMessagesClient,
  anthropicModelForTier,
  OpenAiCompatibleLlmClient,
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
        toneProfile: DEFAULT_TONE_PROFILES[persona],
        toneUpdatedAt: new Date("2026-06-11T00:00:00.000Z"),
        toneUpdatedBy: null,
        toneVersion: DEFAULT_TONE_VERSION,
      },
      priorPosts: [],
      records: [],
      teams: [],
      trigger: {
        correction: null,
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

  it("rejects structured output for the wrong requested content type", async () => {
    const client = {
      messages: {
        parse: async () => ({
          parsed_output: {
            body: "Body from Claude.",
            bodyBlocks: [
              { text: "Wrong shape", type: "heading" },
              { text: "Body from Claude.", type: "paragraph" },
            ],
            citedCanonClaimIds: [],
            contentType: "weekly_recap",
            dek: "Dek from Claude.",
            section: "recaps",
            structure: {
              kicker: "Kicker.",
              lead: "Lead.",
              standingsShift: "Standings.",
              topResult: "Top result.",
              type: "weekly_recap",
              upsetOrBlowout: "Upset.",
            },
            summary: "Summary from Claude.",
            tags: ["Fixture Team", "Recap"],
            title: "Wrong Content Type",
          },
        }),
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

function judgeRequestFor(
  persona: LlmGenerateRequest["persona"],
): LlmJudgeRequest {
  const context = requestFor(persona).context;
  return {
    leagueFacts: {
      context: {
        ...context,
        authenticity: {
          ...context.authenticity,
          entityTokens: ["Fixture Team", "Fixture Manager"],
        },
      },
      otherLeagueEntityTokens: ["Other League Team"],
    },
    piece: {
      body: "Fixture Team and Fixture Manager get a concrete local paragraph.",
      bodyBlocks: [
        { text: "Fixture Team report", type: "heading" },
        {
          text: "Fixture Team and Fixture Manager get a concrete local paragraph.",
          type: "paragraph",
        },
      ],
      citedCanonClaimIds: [],
      contentType: "weekly_recap",
      dek: "Fixture Team gets judged.",
      section: "recaps",
      structure: {
        kicker: "Fixture Team closes it.",
        lead: "Fixture Team leads.",
        standingsShift: "Fixture Team shifts.",
        topResult: "Fixture Team wins.",
        type: "weekly_recap",
        upsetOrBlowout: "Fixture Team owns the margin.",
      },
      summary: "Fixture Team gets judged.",
      tags: ["Fixture Team"],
      title: "Fixture Team report",
    },
    rubric: {
      authenticityThreshold: 0.7,
      personaMatchThreshold: 0.7,
    },
  };
}

describe("AnthropicLlmJudge", () => {
  it("maps judge requests to structured Anthropic messages and returns a score", async () => {
    const calls: unknown[] = [];
    const client = {
      messages: {
        parse: async (params: unknown) => {
          calls.push(params);
          return {
            parsed_output: {
              authenticity: 0.9,
              leakedTokens: [],
              leakage: false,
              matchedLeagueFacts: ["Fixture Team"],
              matchedPersonaMarkers: ["League-official framing"],
              notes: ["Concrete league fact and persona beat are present."],
              personaMatch: 0.85,
            },
            usage: {
              input_tokens: 80,
              output_tokens: 20,
            },
          };
        },
      },
    } as unknown as AnthropicMessagesClient;
    const judge = new AnthropicLlmJudge({
      apiKey: fakeKey(),
      client,
    });

    await expect(judge.score(judgeRequestFor("commissioner"))).resolves.toEqual(
      {
        authenticity: 0.9,
        leakedTokens: [],
        leakage: false,
        matchedLeagueFacts: ["Fixture Team"],
        matchedPersonaMarkers: ["League-official framing"],
        notes: ["Concrete league fact and persona beat are present."],
        personaMatch: 0.85,
      },
    );
    await expect(
      judge.scoreWithUsage(judgeRequestFor("commissioner")),
    ).resolves.toMatchObject({
      usage: {
        inputTokens: 80,
        outputTokens: 20,
      },
    });

    const first = calls[0] as Record<string, unknown>;
    expect(first).toMatchObject({
      max_tokens: 768,
      metadata: { user_id: "00000000-0000-0000-0000-000000000001" },
      model: ANTHROPIC_BULK_MODEL,
      tool_choice: { type: "none" },
    });
    expect(JSON.stringify(first)).toContain("Other League Team");
    expect(JSON.stringify(first)).toContain("Fixture Team");
  });

  it("rejects malformed structured judge output", async () => {
    const client = {
      messages: {
        parse: async () => ({ parsed_output: { authenticity: 1 } }),
      },
    } as unknown as AnthropicMessagesClient;
    const judge = new AnthropicLlmJudge({
      apiKey: fakeKey(),
      client,
    });

    await expect(
      judge.score(judgeRequestFor("narrator")),
    ).rejects.toMatchObject({
      code: "AI_LLM_JUDGE_RESPONSE_INVALID",
    } satisfies Partial<AppError>);
  });
});

describe("model provider LLM factories", () => {
  it("builds Anthropic-compatible clients with a custom endpoint", () => {
    const llm = createLlmClient({
      apiKey: fakeKey(),
      baseUrl: "https://anthropic-compatible.example.invalid",
      key: "custom",
      kind: "anthropic_compatible",
      model: "rumbledore-anthropic-compatible",
    });

    expect(llm).toBeInstanceOf(AnthropicLlmClient);
  });

  it("builds OpenAI-compatible clients with a custom endpoint", () => {
    const llm = createLlmClient({
      apiKey: fakeKey(),
      baseUrl: "https://openai-compatible.example.invalid",
      key: "custom",
      kind: "openai_compatible",
      model: "rumbledore-openai-compatible",
    });

    expect(llm).toBeInstanceOf(OpenAiCompatibleLlmClient);
  });
});

describe("OpenAiCompatibleLlmClient", () => {
  it("posts a JSON-schema chat completion request and returns a valid draft", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ init, input });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  body: "Body from tuned model.",
                  bodyBlocks: [
                    { text: "Filed from the endpoint", type: "heading" },
                    { text: "Body from tuned model.", type: "paragraph" },
                  ],
                  citedCanonClaimIds: [],
                  contentType: "matchup_preview",
                  dek: "Dek from tuned model.",
                  section: "previews",
                  structure: {
                    matchups: [
                      {
                        edge: "Fixture Team has the tuned edge.",
                        keyNumber: "120 points for",
                        opponent: "Fixture Opponent",
                        prediction: "Fixture Team is the tuned lean.",
                        team: "Fixture Team",
                        xFactor: "Fixture Manager",
                      },
                    ],
                    type: "matchup_preview",
                  },
                  summary: "Summary from tuned model.",
                  tags: ["Fixture Team", "Tuned"],
                  title: "Tuned Endpoint Title",
                }),
              },
            },
          ],
          usage: {
            completion_tokens: 45,
            prompt_tokens: 120,
            total_tokens: 165,
          },
        }),
        { status: 200 },
      );
    };
    const llm = new OpenAiCompatibleLlmClient({
      apiKey: fakeKey(),
      baseUrl: "https://models.example.invalid",
      fetcher,
      model: "rumbledore-tuned-fixture",
    });

    await expect(llm.generate(requestFor("trash_talker"))).resolves.toEqual({
      body: "Body from tuned model.",
      bodyBlocks: [
        { text: "Filed from the endpoint", type: "heading" },
        { text: "Body from tuned model.", type: "paragraph" },
      ],
      citedCanonClaimIds: [],
      contentType: "matchup_preview",
      dek: "Dek from tuned model.",
      section: "previews",
      structure: {
        matchups: [
          {
            edge: "Fixture Team has the tuned edge.",
            keyNumber: "120 points for",
            opponent: "Fixture Opponent",
            prediction: "Fixture Team is the tuned lean.",
            team: "Fixture Team",
            xFactor: "Fixture Manager",
          },
        ],
        type: "matchup_preview",
      },
      summary: "Summary from tuned model.",
      tags: ["Fixture Team", "Tuned"],
      title: "Tuned Endpoint Title",
    });
    await expect(
      llm.generateWithUsage(requestFor("trash_talker")),
    ).resolves.toMatchObject({
      usage: {
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        inputTokens: 120,
        outputTokens: 45,
      },
    });

    expect(requests[0]?.input).toBe(
      "https://models.example.invalid/v1/chat/completions",
    );
    expect(requests[0]?.init?.headers).toMatchObject({
      Authorization: `Bearer ${fakeKey()}`,
      "Content-Type": "application/json",
    });
    await expect(new Response(requests[0]?.init?.body).json()).resolves.toEqual(
      expect.objectContaining({
        max_tokens: 720,
        model: "rumbledore-tuned-fixture",
        response_format: expect.objectContaining({
          json_schema: expect.objectContaining({
            name: "rumbledore_blog_draft",
            strict: true,
          }),
          type: "json_schema",
        }),
        user: "00000000-0000-0000-0000-000000000001",
      }),
    );
  });

  it("supports explicit unauthenticated local endpoints", async () => {
    const requests: RequestInit[] = [];
    const llm = new OpenAiCompatibleLlmClient({
      baseUrl: "http://127.0.0.1:8080/v1",
      fetcher: async (_input, init) => {
        requests.push(init ?? {});
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: { title: "Missing fields" } } }],
          }),
          { status: 200 },
        );
      },
      model: "local-fixture",
    });

    await expect(llm.generate(requestFor("analyst"))).rejects.toMatchObject({
      code: "AI_LLM_RESPONSE_INVALID",
    } satisfies Partial<AppError>);
    expect(requests[0]?.headers).not.toHaveProperty("Authorization");
  });

  it("rejects malformed OpenAI-compatible structured output", async () => {
    const llm = new OpenAiCompatibleLlmClient({
      apiKey: fakeKey(),
      baseUrl: "https://models.example.invalid",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"title":"Missing fields"}' } }],
          }),
          { status: 200 },
        ),
      model: "rumbledore-tuned-fixture",
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
      timeout: 10,
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

  it("uses a configurable Tavily SDK timeout", async () => {
    const calls: Array<{ options: unknown; query: string }> = [];
    const web = new TavilyWebGrounding({
      apiKey: fakeKey(),
      client: {
        search: async (query: string, options?: unknown) => {
          calls.push({ options, query });
          return {
            images: [],
            query,
            requestId: "request-timeout",
            responseTime: 0.1,
            results: [],
          };
        },
      },
      timeoutSeconds: 2,
    });

    await web.fetch({
      leagueId: "00000000-0000-0000-0000-000000000001",
      leagueName: "Fixture",
      persona: "commissioner",
      triggerKey: "weekly:fixture",
    });

    expect(calls[0]?.options).toMatchObject({ timeout: 2 });
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
