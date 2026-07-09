// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createLogger } from "@/core/logging";
import { AppError } from "@/core/result";
import { MemorySpendCounterStore, SpendGuard } from "@/core/spend-guard";
import type { Db } from "@/db/client";
import { NoopPushNotifier, WebPushNotifier } from "@/push";
import { NoopRealtimePublisher, SupabaseRealtimePublisher } from "@/realtime";
import type { AiContentType } from "./content-types";
import {
  createAiDependencies,
  GuardedEmbeddingProvider,
  GuardedLlmClient,
  GuardedLlmJudge,
  GuardedWebGrounding,
} from "./dependencies";
import type {
  BlogDraft,
  EmbeddingProvider,
  LlmClient,
  LlmGenerateRequest,
  LlmJudge,
  LlmJudgeRequest,
  LlmJudgeScore,
  NewsItem,
  WebGrounding,
} from "./interfaces";
import {
  DeterministicEmbeddingProvider,
  MockLlmClient,
  MockLlmJudge,
  MockWebGrounding,
} from "./mocks";
import { RoutedLlmClient } from "./model-routing";
import type { AiPersona } from "./personas";
import {
  ANTHROPIC_BULK_MODEL,
  ANTHROPIC_FLAGSHIP_MODEL,
  AnthropicLlmClient,
  AnthropicLlmJudge,
  OpenAiCompatibleLlmClient,
  TavilyWebGrounding,
  type UsageReportingLlmClient,
  type UsageReportingLlmJudge,
  VOYAGE_EMBEDDING_MODEL,
  VoyageEmbeddingProvider,
} from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

function spendGuard() {
  return new SpendGuard({
    config: parseEnv({}).spendGuard,
    store: new MemorySpendCounterStore(),
  });
}

function testLogger() {
  return createLogger({ sink: () => undefined });
}

const fallbackDraft: BlogDraft = {
  body: "Mock fallback body.",
  bodyBlocks: [{ text: "Mock fallback body.", type: "paragraph" }],
  contentType: "weekly_recap",
  dek: "Mock fallback dek.",
  section: "recaps",
  structure: {
    kicker: "Mock kicker.",
    lead: "Mock lead.",
    standingsShift: "Mock standings shift.",
    topResult: "Mock top result.",
    type: "weekly_recap",
    upsetOrBlowout: "Mock margin.",
  },
  summary: "Mock fallback summary.",
  tags: ["mock"],
  title: "Mock fallback draft",
};

const fallbackJudgeScore: LlmJudgeScore = {
  authenticity: 0.9,
  leakage: false,
  leakedTokens: [],
  matchedLeagueFacts: ["Fixture Team"],
  matchedPersonaMarkers: ["Commissioner"],
  notes: ["mock fallback"],
  personaMatch: 0.9,
  targetedOffLimits: [],
  targetingConsent: true,
};

const fallbackNews: NewsItem[] = [
  {
    id: "mock-news",
    publishedAt: new Date("2026-06-16T00:00:00.000Z"),
    source: "Mock Wire",
    text: "Mock fallback news.",
    title: "Mock news",
    url: "https://news.example.invalid/mock",
  },
];

function resolvedAnthropicModel(
  llm: unknown,
  persona: AiPersona,
  contentType: AiContentType = "weekly_recap",
): string | undefined {
  const target =
    llm instanceof GuardedLlmClient && llm.real instanceof RoutedLlmClient
      ? llm.real.resolve({ contentType, persona })?.provider
      : llm instanceof GuardedLlmClient
        ? llm.real
        : llm;
  return (
    target as { modelForPersona?: (persona: AiPersona) => string }
  ).modelForPersona?.(persona);
}

function resolvedRoute(
  llm: unknown,
  persona: AiPersona,
  contentType: AiContentType = "weekly_recap",
) {
  const target = llm instanceof GuardedLlmClient ? llm.real : llm;
  return target instanceof RoutedLlmClient
    ? target.resolve({ contentType, persona })
    : null;
}

describe("createAiDependencies", () => {
  it("keeps the full AI pipeline mocked with zero paid configuration", () => {
    const deps = createAiDependencies({} as Db, parseEnv({}));

    expect(deps.llm).toBeInstanceOf(MockLlmClient);
    expect(deps.judge).toBeInstanceOf(MockLlmJudge);
    expect(deps.web).toBeInstanceOf(MockWebGrounding);
    expect(deps.embeddings).toBeInstanceOf(DeterministicEmbeddingProvider);
    expect(deps.realtime).toBeInstanceOf(NoopRealtimePublisher);
    expect(deps.push).toBeInstanceOf(NoopPushNotifier);
  });

  it("selects real Anthropic, Tavily, and Voyage clients when keys are present", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        ANTHROPIC_API_KEY: fakeKey(),
        TAVILY_API_KEY: fakeKey(),
        VOYAGE_API_KEY: fakeKey(),
      }),
    );

    expect(deps.llm).toBeInstanceOf(GuardedLlmClient);
    expect((deps.llm as GuardedLlmClient).real).toBeInstanceOf(RoutedLlmClient);
    expect(resolvedRoute(deps.llm, "analyst")?.provider).toBeInstanceOf(
      AnthropicLlmClient,
    );
    expect(deps.judge).toBeInstanceOf(GuardedLlmJudge);
    expect((deps.judge as GuardedLlmJudge).real).toBeInstanceOf(
      AnthropicLlmJudge,
    );
    expect(deps.web).toBeInstanceOf(GuardedWebGrounding);
    expect((deps.web as GuardedWebGrounding).real).toBeInstanceOf(
      TavilyWebGrounding,
    );
    expect(deps.embeddings).toBeInstanceOf(GuardedEmbeddingProvider);
    expect((deps.embeddings as GuardedEmbeddingProvider).real).toBeInstanceOf(
      VoyageEmbeddingProvider,
    );
    expect((deps.embeddings as GuardedEmbeddingProvider).model).toBe(
      VOYAGE_EMBEDDING_MODEL,
    );
  });

  it("defaults real Anthropic routing to the cheap tier for all personas", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        ANTHROPIC_API_KEY: fakeKey(),
      }),
    );

    expect(resolvedAnthropicModel(deps.llm, "narrator")).toBe(
      ANTHROPIC_BULK_MODEL,
    );
    expect(resolvedAnthropicModel(deps.llm, "trash_talker")).toBe(
      ANTHROPIC_BULK_MODEL,
    );
  });

  it("restores mixed Anthropic routing when explicitly configured", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        ANTHROPIC_API_KEY: fakeKey(),
        ANTHROPIC_MODEL_TIER: "mixed",
      }),
    );

    expect(resolvedAnthropicModel(deps.llm, "narrator")).toBe(
      ANTHROPIC_FLAGSHIP_MODEL,
    );
    expect(resolvedAnthropicModel(deps.llm, "analyst")).toBe(
      ANTHROPIC_BULK_MODEL,
    );
  });

  it("selects a configured custom OpenAI-compatible LLM without requiring Anthropic", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        AI_CUSTOM_MODEL_API_KEY: fakeKey(),
        AI_CUSTOM_MODEL_BASE_URL: "https://models.example.invalid",
        AI_CUSTOM_MODEL_ID: "rumbledore-tuned-fixture",
        AI_CUSTOM_MODEL_KIND: "openai_compatible",
        AI_LLM_PROVIDER_KEY: "custom",
      }),
    );

    expect(deps.llm).toBeInstanceOf(GuardedLlmClient);
    expect((deps.llm as GuardedLlmClient).real).toBeInstanceOf(RoutedLlmClient);
    expect(resolvedRoute(deps.llm, "analyst")?.provider).toBeInstanceOf(
      OpenAiCompatibleLlmClient,
    );
    expect(resolvedRoute(deps.llm, "analyst")?.providerKey).toBe("custom");
    expect(deps.judge).toBeInstanceOf(MockLlmJudge);
  });

  it("routes selected tasks to a configured custom model while keeping default tasks on bulk", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        AI_CUSTOM_MODEL_API_KEY: fakeKey(),
        AI_CUSTOM_MODEL_BASE_URL: "https://models.example.invalid",
        AI_CUSTOM_MODEL_ID: "rumbledore-tuned-fixture",
        AI_CUSTOM_MODEL_KIND: "openai_compatible",
        AI_MODEL_ROUTE_JSON: JSON.stringify({
          default: "bulk",
          overrides: { "trash_talker|awards_superlatives": "custom" },
        }),
        ANTHROPIC_API_KEY: fakeKey(),
      }),
    );

    expect(resolvedAnthropicModel(deps.llm, "analyst", "power_rankings")).toBe(
      ANTHROPIC_BULK_MODEL,
    );
    expect(
      resolvedRoute(deps.llm, "trash_talker", "awards_superlatives")?.provider,
    ).toBeInstanceOf(OpenAiCompatibleLlmClient);
    expect(
      resolvedRoute(deps.llm, "trash_talker", "awards_superlatives")
        ?.providerKey,
    ).toBe("custom");
  });

  it("falls back to the route default when a custom task route has no provider", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        AI_MODEL_ROUTE_JSON: JSON.stringify({
          default: "flagship",
          overrides: { "trash_talker|awards_superlatives": "custom" },
        }),
        ANTHROPIC_API_KEY: fakeKey(),
      }),
    );

    const route = resolvedRoute(
      deps.llm,
      "trash_talker",
      "awards_superlatives",
    );

    expect(route?.requestedProviderKey).toBe("custom");
    expect(route?.providerKey).toBe("flagship");
    expect(
      resolvedAnthropicModel(deps.llm, "trash_talker", "awards_superlatives"),
    ).toBe(ANTHROPIC_FLAGSHIP_MODEL);
  });

  it("does not route bulk tasks to an inactive custom provider", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        AI_CUSTOM_MODEL_API_KEY: fakeKey(),
        AI_CUSTOM_MODEL_BASE_URL: "https://models.example.invalid",
        AI_CUSTOM_MODEL_ID: "rumbledore-tuned-fixture",
        AI_CUSTOM_MODEL_KIND: "openai_compatible",
      }),
    );

    expect(deps.llm).toBeInstanceOf(GuardedLlmClient);
    expect(resolvedRoute(deps.llm, "analyst", "power_rankings")).toBeNull();
  });

  it("passes the configured Voyage embedding model to the real provider", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        VOYAGE_API_KEY: fakeKey(),
        VOYAGE_EMBEDDING_MODEL: "voyage-fixture-model",
      }),
    );

    expect(deps.embeddings).toBeInstanceOf(GuardedEmbeddingProvider);
    expect((deps.embeddings as GuardedEmbeddingProvider).model).toBe(
      "voyage-fixture-model",
    );
  });

  it("keeps Anthropic mocked when forced even if its key is present", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        ANTHROPIC_API_KEY: fakeKey(),
        MOCK_ANTHROPIC: "true",
        TAVILY_API_KEY: fakeKey(),
        VOYAGE_API_KEY: fakeKey(),
      }),
    );

    expect(deps.llm).toBeInstanceOf(MockLlmClient);
    expect(deps.judge).toBeInstanceOf(MockLlmJudge);
    expect(deps.web).toBeInstanceOf(GuardedWebGrounding);
    expect((deps.web as GuardedWebGrounding).real).toBeInstanceOf(
      TavilyWebGrounding,
    );
    expect(deps.embeddings).toBeInstanceOf(GuardedEmbeddingProvider);
  });

  it("keeps Tavily mocked when forced even if its key is present", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        ANTHROPIC_API_KEY: fakeKey(),
        MOCK_TAVILY: "true",
        TAVILY_API_KEY: fakeKey(),
        VOYAGE_API_KEY: fakeKey(),
      }),
    );

    expect(deps.llm).toBeInstanceOf(GuardedLlmClient);
    expect(deps.web).toBeInstanceOf(MockWebGrounding);
    expect(deps.embeddings).toBeInstanceOf(GuardedEmbeddingProvider);
  });

  it("keeps Voyage mocked when forced even if its key is present", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        ANTHROPIC_API_KEY: fakeKey(),
        MOCK_VOYAGE: "true",
        TAVILY_API_KEY: fakeKey(),
        VOYAGE_API_KEY: fakeKey(),
      }),
    );

    expect(deps.llm).toBeInstanceOf(GuardedLlmClient);
    expect(deps.web).toBeInstanceOf(GuardedWebGrounding);
    expect(deps.embeddings).toBeInstanceOf(DeterministicEmbeddingProvider);
  });

  it("selects the Supabase realtime publisher when publish credentials are present", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        SUPABASE_JWT_SECRET: fakeKey(),
        SUPABASE_PUBLISHABLE_KEY: fakeKey(),
        SUPABASE_SERVICE_ROLE_KEY: fakeKey(),
        SUPABASE_URL: "https://project.supabase.co",
      }),
    );

    expect(deps.realtime).toBeInstanceOf(SupabaseRealtimePublisher);
  });

  it("selects the web push notifier when VAPID config is present", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        WEB_PUSH_PRIVATE_KEY: "6ZfvaEkuyWBKllOiVJI4YAjobzGhKFjAvfQIjUe84xU", // ubs:ignore secret-scan:ignore — generated test-only VAPID fixture
        WEB_PUSH_PUBLIC_KEY:
          "BFXTO-LWlA9jYrLXQ_oIdz44ChgSjlqr0ZGxPTohbi9J_vtBUgYucGhVs4ywXvlcS8tTLFl2mPmgEw70cjNveAk",
        WEB_PUSH_SUBJECT: "mailto:ops@example.invalid",
      }),
    );

    expect(deps.push).toBeInstanceOf(WebPushNotifier);
  });
});

describe("guarded AI provider fallbacks", () => {
  it("falls back to the mock LLM when the configured real LLM is unavailable", async () => {
    const real: UsageReportingLlmClient = {
      generate: async () => fallbackDraft,
      generateWithUsage: async () => {
        throw new AppError({
          code: "AI_LLM_PROVIDER_UNAVAILABLE",
          message: "No configured model provider is available",
          status: 503,
        });
      },
    };
    const mock: LlmClient = {
      generate: async () => fallbackDraft,
    };
    const client = new GuardedLlmClient(real, mock, spendGuard(), testLogger());

    await expect(client.generate({} as LlmGenerateRequest)).resolves.toBe(
      fallbackDraft,
    );
  });

  it("falls back to the mock judge when Anthropic judge scoring is unavailable", async () => {
    const real: UsageReportingLlmJudge = {
      score: async () => fallbackJudgeScore,
      scoreWithUsage: async () => {
        throw new AppError({
          code: "AI_LLM_JUDGE_FAILED",
          message: "Anthropic judge scoring failed",
          status: 502,
        });
      },
    };
    const mock: LlmJudge = {
      score: async () => fallbackJudgeScore,
    };
    const judge = new GuardedLlmJudge(real, mock, spendGuard(), testLogger());

    await expect(judge.score({} as LlmJudgeRequest)).resolves.toBe(
      fallbackJudgeScore,
    );
  });

  it("falls back to mock web grounding when the real web provider is unavailable", async () => {
    const real: WebGrounding = {
      fetch: async () => {
        // ubs:ignore — interface test double named fetch; it performs no network request.
        throw new Error("Tavily unavailable");
      },
    };
    const mock: WebGrounding = {
      fetch: async () => fallbackNews,
    };
    const grounding = new GuardedWebGrounding(
      real,
      mock,
      spendGuard(),
      testLogger(),
    );

    await expect(
      grounding.fetch({
        leagueId: "00000000-0000-0000-0000-000000000001",
        leagueName: "Fixture League",
        persona: "analyst",
        triggerKey: "weekly:fixture",
      }),
    ).resolves.toEqual(fallbackNews);
  });

  it("falls back to mock embeddings when the real embedding provider is unavailable", async () => {
    const real: EmbeddingProvider = {
      embed: async () => {
        throw new AppError({
          code: "AI_EMBEDDING_REQUEST_FAILED",
          message: "Voyage embedding request failed",
          status: 502,
        });
      },
      model: "voyage-fixture",
    };
    const mock: EmbeddingProvider = {
      embed: async () => [0.25, 0.75],
      model: "mock-fixture",
    };
    const embeddings = new GuardedEmbeddingProvider(
      real,
      mock,
      spendGuard(),
      testLogger(),
    );

    await expect(embeddings.embed("fixture text")).resolves.toEqual([
      0.25, 0.75,
    ]);
  });
});
