// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertCassetteSecretFree,
  createVcrFetch,
  createVcrReplayer,
  readVcrCassette,
} from "@/testing/vcr";
import type { LlmGenerateRequest } from "./interfaces";
import {
  AnthropicLlmClient,
  type AnthropicMessagesClient,
  TavilyWebGrounding,
  VOYAGE_EMBEDDING_MODEL,
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
      arena: {
        computedAt: null,
        fieldLeader: null,
        headToHead: null,
        leagueStanding: null,
        movers: { fallers: [], risers: [] },
        season: null,
        topLeagueStandings: [],
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

describe("AI provider VCR replay", () => {
  it("replays an Anthropic structured draft cassette offline", async () => {
    const cassette = await readVcrCassette(
      new URL("__cassettes__/anthropic-blog-draft.json", import.meta.url),
    );
    assertCassetteSecretFree(cassette, [fakeKey()]);
    const replayer = createVcrReplayer(cassette, { mode: "replay" });
    const client = {
      messages: {
        parse: async (rawParams: unknown) => {
          const params = rawParams as {
            max_tokens: number;
            metadata: unknown;
            model: string;
          };
          return replayer.replay({
            maxTokens: params.max_tokens,
            metadata: params.metadata,
            method: "anthropic.messages.parse",
            model: params.model,
          });
        },
      },
    } as unknown as AnthropicMessagesClient;
    const llm = new AnthropicLlmClient({
      apiKey: fakeKey(),
      client,
    });

    await expect(
      llm.generateWithUsage(requestFor("commissioner")),
    ).resolves.toMatchObject({
      draft: {
        contentType: "matchup_preview",
        section: "previews",
        structure: { type: "matchup_preview" },
        title: "Fixture Team Gets the Replay Edge",
      },
      usage: {
        inputTokens: 822,
        outputTokens: 218,
      },
    });
  });

  it("replays a Tavily web-grounding cassette offline", async () => {
    const cassette = await readVcrCassette(
      new URL("__cassettes__/tavily-web-grounding.json", import.meta.url),
    );
    assertCassetteSecretFree(cassette, [fakeKey()]);
    const replayer = createVcrReplayer(cassette, { mode: "replay" });
    const web = new TavilyWebGrounding({
      apiKey: fakeKey(),
      client: {
        search: (query: string, options?: unknown) =>
          replayer.replay({
            method: "tavily.search",
            options,
            query,
          }),
      },
      maxResults: 2,
    });

    await expect(
      web.fetch({
        leagueId: "00000000-0000-0000-0000-000000000001",
        leagueName: "Do Not Send This League",
        persona: "analyst",
        triggerKey: "weekly:fixture",
      }),
    ).resolves.toEqual([
      {
        id: expect.stringMatching(/^tavily-ai-news:/),
        publishedAt: new Date("2026-06-15T15:00:00.000Z"),
        source: "news.example.com",
        text: "A replayed fantasy football injury note suitable for grounding. It contains general NFL context and no league private data.",
        title: "Replay fantasy injury note",
        url: "https://news.example.com/fantasy/injury-note",
      },
    ]);
  });

  it("replays a Voyage embedding cassette offline with auth stripped", async () => {
    const cassette = await readVcrCassette(
      new URL("__cassettes__/voyage-embedding.json", import.meta.url),
    );
    const fixtureKey = ["real", "provider", "value", "never", "written"].join(
      "-",
    );
    assertCassetteSecretFree(cassette, [fixtureKey]);
    const provider = new VoyageEmbeddingProvider({
      apiKey: fixtureKey,
      fetcher: createVcrFetch(cassette, { mode: "replay" }),
      model: VOYAGE_EMBEDDING_MODEL,
    });

    await expect(provider.embed("league post text")).resolves.toEqual([
      0.0125, -0.034, 0.056, 0.078,
    ]);
  });
});
