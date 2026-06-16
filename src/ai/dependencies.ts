import type { Env } from "@/core/env/schema";
import {
  createSpendGuard,
  runGuardedProviderCall,
  type SpendGuard,
} from "@/core/spend-guard";
import type { Db } from "@/db/client";
import { createPushNotifier } from "@/push";
import { createRealtimePublisher } from "@/realtime";
import type {
  BlogDraft,
  EmbeddingProvider,
  LlmClient,
  LlmGenerateRequest,
  NewsItem,
  WebGrounding,
} from "./interfaces";
import {
  DeterministicEmbeddingProvider,
  MockLlmClient,
  MockWebGrounding,
} from "./mocks";
import type { AiGenerationDependencies } from "./pipeline";
import {
  AnthropicLlmClient,
  type AnthropicUsageBreakdown,
  anthropicModelForTier,
  TavilyWebGrounding,
  VoyageEmbeddingProvider,
} from "./real";

function anthropicUsageUnits(usage: AnthropicUsageBreakdown): number {
  return Math.max(
    1,
    usage.inputTokens +
      usage.outputTokens +
      usage.cacheCreationInputTokens +
      Math.ceil(usage.cacheReadInputTokens / 10),
  );
}

export class GuardedLlmClient implements LlmClient {
  constructor(
    readonly real: AnthropicLlmClient,
    private readonly mock: LlmClient,
    private readonly guard: SpendGuard,
  ) {}

  async generate(request: LlmGenerateRequest): Promise<BlogDraft> {
    return runGuardedProviderCall({
      guard: this.guard,
      mockCall: () => this.mock.generate(request),
      operation: "llm.generate",
      provider: "anthropic",
      realCall: async () => {
        const result = await this.real.generateWithUsage(request);
        return {
          usage: {
            details: {
              cacheCreationInputTokens: result.usage.cacheCreationInputTokens,
              cacheReadInputTokens: result.usage.cacheReadInputTokens,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
            },
            units: anthropicUsageUnits(result.usage),
          },
          value: result.draft,
        };
      },
    });
  }
}

export class GuardedWebGrounding implements WebGrounding {
  constructor(
    readonly real: WebGrounding,
    private readonly mock: WebGrounding,
    private readonly guard: SpendGuard,
  ) {}

  async fetch(
    input: Parameters<WebGrounding["fetch"]>[0],
  ): Promise<NewsItem[]> {
    // ubs:ignore — interface method name; outbound calls are guarded before paid SDK use.
    return runGuardedProviderCall({
      guard: this.guard,
      mockCall: () => this.mock.fetch(input),
      operation: "web.fetch",
      provider: "tavily",
      realCall: async () => ({
        usage: { units: 1 },
        value: await this.real.fetch(input),
      }),
    });
  }
}

export class GuardedEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;

  constructor(
    readonly real: EmbeddingProvider,
    private readonly mock: EmbeddingProvider,
    private readonly guard: SpendGuard,
  ) {
    this.model = real.model;
  }

  async embed(text: string): Promise<number[]> {
    return runGuardedProviderCall({
      guard: this.guard,
      mockCall: () => this.mock.embed(text),
      operation: "embeddings.embed",
      provider: "voyage",
      realCall: async () => ({
        usage: { units: 1 },
        value: await this.real.embed(text),
      }),
    });
  }
}

export interface AiDependencyFactoryOptions {
  spendGuard?: SpendGuard;
}

export function createAiDependencies(
  db: Db,
  env: Pick<
    Env,
    | "ai"
    | "entitlements"
    | "push"
    | "realtime"
    | "redisUrl"
    | "services"
    | "spendGuard"
  >,
  options: AiDependencyFactoryOptions = {},
): AiGenerationDependencies {
  const spendGuard = options.spendGuard ?? createSpendGuard(env);
  const mockEmbeddings = new DeterministicEmbeddingProvider();
  const mockLlm = new MockLlmClient();
  const mockWeb = new MockWebGrounding();

  return {
    db,
    embeddings: env.services.voyage.mock
      ? mockEmbeddings
      : new GuardedEmbeddingProvider(
          new VoyageEmbeddingProvider({
            apiKey: env.services.voyage.apiKey,
            model: env.ai.voyageEmbeddingModel,
          }),
          mockEmbeddings,
          spendGuard,
        ),
    entitlements: {
      entitlements: env.entitlements,
    },
    llm: env.services.anthropic.mock
      ? mockLlm
      : new GuardedLlmClient(
          new AnthropicLlmClient({
            apiKey: env.services.anthropic.apiKey,
            modelForPersona: anthropicModelForTier(env.ai.anthropicModelTier),
          }),
          mockLlm,
          spendGuard,
        ),
    push: createPushNotifier(db, env),
    web: env.services.tavily.mock
      ? mockWeb
      : new GuardedWebGrounding(
          new TavilyWebGrounding({ apiKey: env.services.tavily.apiKey }),
          mockWeb,
          spendGuard,
        ),
    realtime: createRealtimePublisher(env),
  };
}
