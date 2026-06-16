import { AppError } from "@/core/result";
import { AI_CONTENT_TYPES, type AiContentType } from "./content-types";
import type { LlmGenerateRequest } from "./interfaces";
import {
  ANTHROPIC_FLAGSHIP_PERSONAS,
  type AnthropicModelTier,
} from "./model-config";
import type { ModelProvider } from "./model-providers";
import { AI_PERSONAS, type AiPersona } from "./personas";
import type { LlmGenerateResult, UsageReportingLlmClient } from "./real";

export const MODEL_ROUTE_PROVIDER_KEYS = [
  "bulk",
  "flagship",
  "custom",
] as const;

export type ModelRouteProviderKey = (typeof MODEL_ROUTE_PROVIDER_KEYS)[number];

export type ModelRouteOverrideKey = `${AiPersona}|${AiContentType}`;

export interface ModelRouteConfig {
  contentTypeDefaults: Partial<Record<AiContentType, ModelRouteProviderKey>>;
  defaultProviderKey: ModelRouteProviderKey;
  overrides: Partial<Record<ModelRouteOverrideKey, ModelRouteProviderKey>>;
  personaDefaults: Partial<Record<AiPersona, ModelRouteProviderKey>>;
}

export type ModelProviderRegistry<T = ModelProvider> = Partial<
  Record<ModelRouteProviderKey, T>
>;

export interface ResolveModelRouteInput {
  contentType: AiContentType;
  persona: AiPersona;
  route: ModelRouteConfig;
}

export interface ResolvedModelRoute<T = ModelProvider> {
  provider: T;
  providerKey: ModelRouteProviderKey;
  requestedProviderKey: ModelRouteProviderKey;
}

function emptyModelRouteConfig(
  defaultProviderKey: ModelRouteProviderKey,
): ModelRouteConfig {
  return {
    contentTypeDefaults: {},
    defaultProviderKey,
    overrides: {},
    personaDefaults: {},
  };
}

export function defaultModelRouteConfig(
  anthropicModelTier: AnthropicModelTier,
  llmProviderKey: "anthropic" | "custom",
): ModelRouteConfig {
  if (llmProviderKey === "custom") {
    return emptyModelRouteConfig("custom");
  }

  if (anthropicModelTier === "mixed") {
    return {
      ...emptyModelRouteConfig("bulk"),
      personaDefaults: Object.fromEntries(
        ANTHROPIC_FLAGSHIP_PERSONAS.map((persona) => [
          persona,
          "flagship" satisfies ModelRouteProviderKey,
        ]),
      ),
    };
  }

  return emptyModelRouteConfig("bulk");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isModelRouteProviderKey(
  value: unknown,
): value is ModelRouteProviderKey {
  return (
    typeof value === "string" &&
    MODEL_ROUTE_PROVIDER_KEYS.includes(value as ModelRouteProviderKey)
  );
}

function isAiPersona(value: string): value is AiPersona {
  return AI_PERSONAS.includes(value as AiPersona);
}

function isAiContentType(value: string): value is AiContentType {
  return AI_CONTENT_TYPES.includes(value as AiContentType);
}

function assertModelRouteProviderKey(value: unknown): ModelRouteProviderKey {
  if (!isModelRouteProviderKey(value)) {
    throw new Error("invalid model route provider key");
  }
  return value;
}

function parseRouteMap<Key extends string>(
  raw: unknown,
  isKnownKey: (key: string) => key is Key,
): Partial<Record<Key, ModelRouteProviderKey>> {
  if (raw === undefined) {
    return {};
  }
  if (!isPlainRecord(raw)) {
    throw new Error("invalid model route map");
  }

  const parsed: Partial<Record<Key, ModelRouteProviderKey>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isKnownKey(key)) {
      throw new Error("invalid model route map key");
    }
    parsed[key] = assertModelRouteProviderKey(value);
  }
  return parsed;
}

function isModelRouteOverrideKey(key: string): key is ModelRouteOverrideKey {
  const [persona, contentType, extra] = key.split("|");
  return (
    extra === undefined &&
    persona !== undefined &&
    contentType !== undefined &&
    isAiPersona(persona) &&
    isAiContentType(contentType)
  );
}

function parseOverrideMap(
  raw: unknown,
): Partial<Record<ModelRouteOverrideKey, ModelRouteProviderKey>> {
  if (raw === undefined) {
    return {};
  }
  if (!isPlainRecord(raw)) {
    throw new Error("invalid model route override map");
  }

  const parsed: Partial<Record<ModelRouteOverrideKey, ModelRouteProviderKey>> =
    {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isModelRouteOverrideKey(key)) {
      throw new Error("invalid model route override key");
    }
    parsed[key] = assertModelRouteProviderKey(value);
  }
  return parsed;
}

export function parseModelRouteConfigJson(
  raw: string,
  base: ModelRouteConfig,
): ModelRouteConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("invalid model route json");
  }
  if (!isPlainRecord(parsed)) {
    throw new Error("invalid model route json");
  }

  const defaultProviderKey =
    parsed.defaultProviderKey !== undefined
      ? assertModelRouteProviderKey(parsed.defaultProviderKey)
      : parsed.default !== undefined
        ? assertModelRouteProviderKey(parsed.default)
        : base.defaultProviderKey;

  return {
    contentTypeDefaults: {
      ...base.contentTypeDefaults,
      ...parseRouteMap(parsed.contentTypes, isAiContentType),
      ...parseRouteMap(parsed.contentTypeDefaults, isAiContentType),
    },
    defaultProviderKey,
    overrides: {
      ...base.overrides,
      ...parseOverrideMap(parsed.overrides),
    },
    personaDefaults: {
      ...base.personaDefaults,
      ...parseRouteMap(parsed.personas, isAiPersona),
      ...parseRouteMap(parsed.personaDefaults, isAiPersona),
    },
  };
}

export function modelRouteOverrideKey(
  persona: AiPersona,
  contentType: AiContentType,
): ModelRouteOverrideKey {
  return `${persona}|${contentType}`;
}

export function resolveModelRouteKey({
  contentType,
  persona,
  route,
}: ResolveModelRouteInput): ModelRouteProviderKey {
  return (
    route.overrides[modelRouteOverrideKey(persona, contentType)] ??
    route.personaDefaults[persona] ??
    route.contentTypeDefaults[contentType] ??
    route.defaultProviderKey
  );
}

function uniqueRouteKeys(
  keys: ModelRouteProviderKey[],
): ModelRouteProviderKey[] {
  return keys.filter((key, index) => keys.indexOf(key) === index);
}

export function resolveModelRoute<T>(
  input: ResolveModelRouteInput,
  providers: ModelProviderRegistry<T>,
): ResolvedModelRoute<T> | null {
  const requestedProviderKey = resolveModelRouteKey(input);
  const candidates = uniqueRouteKeys([
    requestedProviderKey,
    input.route.defaultProviderKey,
    "bulk",
    "flagship",
    ...(requestedProviderKey === "custom" ||
    input.route.defaultProviderKey === "custom"
      ? (["custom"] as const)
      : []),
  ]);

  for (const providerKey of candidates) {
    const provider = providers[providerKey];
    if (provider !== undefined) {
      return {
        provider,
        providerKey,
        requestedProviderKey,
      };
    }
  }

  return null;
}

export class RoutedLlmClient implements UsageReportingLlmClient {
  constructor(
    private readonly clients: ModelProviderRegistry<UsageReportingLlmClient>,
    private readonly route: ModelRouteConfig,
  ) {}

  resolve(
    request: Pick<LlmGenerateRequest, "contentType" | "persona">,
  ): ResolvedModelRoute<UsageReportingLlmClient> | null {
    return resolveModelRoute(
      {
        contentType: request.contentType,
        persona: request.persona,
        route: this.route,
      },
      this.clients,
    );
  }

  async generate(request: LlmGenerateRequest) {
    return (await this.generateWithUsage(request)).draft;
  }

  async generateWithUsage(
    request: LlmGenerateRequest,
  ): Promise<LlmGenerateResult> {
    const resolved = this.resolve(request);
    if (resolved === null) {
      throw new AppError({
        code: "AI_LLM_PROVIDER_UNAVAILABLE",
        message: "No configured model provider is available for generation",
        status: 503,
      });
    }

    return resolved.provider.generateWithUsage(request);
  }
}
