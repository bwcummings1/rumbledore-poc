import type { Env } from "@/core/env/schema";
import type { Db } from "@/db/client";
import { createPushNotifier } from "@/push";
import { createRealtimePublisher } from "@/realtime";
import {
  DeterministicEmbeddingProvider,
  MockLlmClient,
  MockWebGrounding,
} from "./mocks";
import type { AiGenerationDependencies } from "./pipeline";
import {
  AnthropicLlmClient,
  TavilyWebGrounding,
  VoyageEmbeddingProvider,
} from "./real";

export function createAiDependencies(
  db: Db,
  env: Pick<Env, "push" | "realtime" | "services">,
): AiGenerationDependencies {
  return {
    db,
    embeddings: env.services.voyage.mock
      ? new DeterministicEmbeddingProvider()
      : new VoyageEmbeddingProvider({ apiKey: env.services.voyage.apiKey }),
    llm: env.services.anthropic.mock
      ? new MockLlmClient()
      : new AnthropicLlmClient({ apiKey: env.services.anthropic.apiKey }),
    push: createPushNotifier(db, env),
    web: env.services.tavily.mock
      ? new MockWebGrounding()
      : new TavilyWebGrounding({ apiKey: env.services.tavily.apiKey }),
    realtime: createRealtimePublisher(env),
  };
}
