import type { Env } from "@/core/env/schema";
import type { Logger } from "@/core/logging";
import { AppError } from "@/core/result";
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
  LlmJudge,
  LlmJudgeRequest,
  LlmJudgeScore,
  LlmModelProviderKeyResolver,
  NewsItem,
  WebGrounding,
} from "./interfaces";
import {
  DeterministicEmbeddingProvider,
  MockLlmClient,
  MockLlmJudge,
  MockWebGrounding,
} from "./mocks";
import { ANTHROPIC_BULK_MODEL, ANTHROPIC_FLAGSHIP_MODEL } from "./model-config";
import { createLlmClient } from "./model-providers";
import { type ModelProviderRegistry, RoutedLlmClient } from "./model-routing";
import type { AiGenerationDependencies } from "./pipeline";
import {
  AnthropicLlmJudge,
  type AnthropicUsageBreakdown,
  TavilyWebGrounding,
  type UsageReportingLlmClient,
  type UsageReportingLlmJudge,
  VoyageEmbeddingProvider,
} from "./real";

const LLM_MOCK_FALLBACK_CODES = new Set([
  "AI_LLM_GENERATION_FAILED",
  "AI_LLM_JUDGE_FAILED",
  "AI_LLM_PROVIDER_UNAVAILABLE",
]);

function isAppErrorCode(error: unknown, codes: ReadonlySet<string>): boolean {
  return error instanceof AppError && codes.has(error.code);
}

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
    readonly real: UsageReportingLlmClient,
    private readonly mock: LlmClient,
    private readonly guard: SpendGuard,
    private readonly logger?: Logger,
  ) {}

  resolveModelProviderKey(
    request: Pick<LlmGenerateRequest, "contentType" | "persona">,
  ): string | null {
    const realResolver = this.real as Partial<LlmModelProviderKeyResolver>;
    const mockResolver = this.mock as Partial<LlmModelProviderKeyResolver>;
    return (
      realResolver.resolveModelProviderKey?.(request) ??
      mockResolver.resolveModelProviderKey?.(request) ??
      null
    );
  }

  async generate(request: LlmGenerateRequest): Promise<BlogDraft> {
    return runGuardedProviderCall({
      fallbackOnError: (error) =>
        isAppErrorCode(error, LLM_MOCK_FALLBACK_CODES),
      guard: this.guard,
      logger: this.logger,
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

export class GuardedLlmJudge implements LlmJudge {
  constructor(
    readonly real: UsageReportingLlmJudge,
    private readonly mock: LlmJudge,
    private readonly guard: SpendGuard,
    private readonly logger?: Logger,
  ) {}

  async score(request: LlmJudgeRequest): Promise<LlmJudgeScore> {
    return runGuardedProviderCall({
      fallbackOnError: (error) =>
        isAppErrorCode(error, LLM_MOCK_FALLBACK_CODES),
      guard: this.guard,
      logger: this.logger,
      mockCall: () => this.mock.score(request),
      operation: "llm.judge",
      provider: "anthropic",
      realCall: async () => {
        const result = await this.real.scoreWithUsage(request);
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
          value: result.score,
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
    private readonly logger?: Logger,
  ) {}

  async fetch(
    input: Parameters<WebGrounding["fetch"]>[0],
  ): Promise<NewsItem[]> {
    // ubs:ignore — interface method name; outbound calls are guarded before paid SDK use.
    return runGuardedProviderCall({
      fallbackOnError: (error) => error instanceof Error,
      guard: this.guard,
      logger: this.logger,
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
    private readonly logger?: Logger,
  ) {
    this.model = real.model;
  }

  async embed(text: string): Promise<number[]> {
    return runGuardedProviderCall({
      fallbackOnError: (error) =>
        error instanceof AppError &&
        error.code === "AI_EMBEDDING_REQUEST_FAILED",
      guard: this.guard,
      logger: this.logger,
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

function createConfiguredRealLlmClient(
  env: Pick<Env, "ai" | "services">,
): UsageReportingLlmClient | null {
  const clients: ModelProviderRegistry<UsageReportingLlmClient> = {};

  if (!env.services.anthropic.mock) {
    clients.bulk = createLlmClient({
      apiKey: env.services.anthropic.apiKey,
      key: "bulk",
      kind: "anthropic",
      model: ANTHROPIC_BULK_MODEL,
    });
    clients.flagship = createLlmClient({
      apiKey: env.services.anthropic.apiKey,
      key: "flagship",
      kind: "anthropic",
      model: ANTHROPIC_FLAGSHIP_MODEL,
    });
  }

  if (env.ai.customModelProvider) {
    clients.custom = createLlmClient(env.ai.customModelProvider);
  }

  return Object.keys(clients).length > 0
    ? new RoutedLlmClient(clients, env.ai.modelRoute)
    : null;
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
  const mockJudge = new MockLlmJudge();
  const mockLlm = new MockLlmClient();
  const mockWeb = new MockWebGrounding();
  const realLlm = createConfiguredRealLlmClient(env);

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
    judge: env.services.anthropic.mock
      ? mockJudge
      : new GuardedLlmJudge(
          new AnthropicLlmJudge({
            apiKey: env.services.anthropic.apiKey,
            model: ANTHROPIC_BULK_MODEL,
          }),
          mockJudge,
          spendGuard,
        ),
    llm: realLlm ? new GuardedLlmClient(realLlm, mockLlm, spendGuard) : mockLlm,
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
