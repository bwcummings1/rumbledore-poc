import type { UsageReportingLlmClient } from "./real";
import { AnthropicLlmClient, OpenAiCompatibleLlmClient } from "./real";

export type ModelProviderKind =
  | "anthropic"
  | "anthropic_compatible"
  | "openai_compatible";

export interface AnthropicModelProvider {
  apiKey: string;
  key: string;
  kind: "anthropic";
  model: string;
}

export interface AnthropicCompatibleModelProvider {
  apiKey: string;
  apiKeyVar?: string;
  baseUrl: string;
  key: string;
  kind: "anthropic_compatible";
  model: string;
}

export interface OpenAiCompatibleModelProvider {
  apiKey?: string;
  apiKeyVar?: string;
  baseUrl: string;
  key: string;
  kind: "openai_compatible";
  model: string;
}

export type ModelProvider =
  | AnthropicModelProvider
  | AnthropicCompatibleModelProvider
  | OpenAiCompatibleModelProvider;

export type CustomModelProvider =
  | AnthropicCompatibleModelProvider
  | OpenAiCompatibleModelProvider;

export const DEFAULT_MODEL_PROVIDER_KEY = "anthropic";
export const CUSTOM_MODEL_PROVIDER_KEY = "custom";

export function createLlmClient(
  provider: ModelProvider,
): UsageReportingLlmClient {
  switch (provider.kind) {
    case "anthropic":
      return new AnthropicLlmClient({
        apiKey: provider.apiKey,
        modelForPersona: () => provider.model,
      });
    case "anthropic_compatible":
      return new AnthropicLlmClient({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
        modelForPersona: () => provider.model,
      });
    case "openai_compatible":
      return new OpenAiCompatibleLlmClient({
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        model: provider.model,
      });
  }
}
