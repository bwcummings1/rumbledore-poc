import { describe, expect, it } from "vitest";
import { VOYAGE_EMBEDDING_MODEL } from "@/ai/model-config";
import { defaultModelRouteConfig } from "@/ai/model-routing";
import {
  DEFAULT_ENTITLEMENT_CAPS,
  DEFAULT_SPEND_GUARD_CAPS,
  DEV_AUTH_SECRET,
  DEV_CREDENTIAL_ENCRYPTION_KEY,
  DEV_PUSH_PUBLIC_KEY,
  INNGEST_CLOUD_API_BASE_URL,
  INNGEST_CLOUD_EVENT_BASE_URL,
  LOCAL_DATABASE_URL,
  LOCAL_INNGEST_DEV_SERVER_URL,
  LOCAL_REDIS_URL,
  parseEnv,
} from "./schema";

function fixtureValue(...parts: string[]): string {
  return parts.join("-");
}

const paidServiceCases = [
  {
    keyVar: "ANTHROPIC_API_KEY",
    mockVar: "MOCK_ANTHROPIC",
    service: "anthropic",
  },
  { keyVar: "THE_ODDS_API_KEY", mockVar: "MOCK_ODDS", service: "odds" },
  {
    keyVar: "SPORTSDATAIO_API_KEY",
    mockVar: "MOCK_SPORTSDATAIO",
    service: "sportsdataio",
  },
  { keyVar: "TAVILY_API_KEY", mockVar: "MOCK_TAVILY", service: "tavily" },
  { keyVar: "VOYAGE_API_KEY", mockVar: "MOCK_VOYAGE", service: "voyage" },
] as const;

describe("parseEnv", () => {
  it("runs with zero config: local URLs by default and all paid services mocked", () => {
    const env = parseEnv({});
    expect(env.nodeEnv).toBe("development");
    expect(env.databaseUrl).toBe(LOCAL_DATABASE_URL);
    expect(env.redisUrl).toBe(LOCAL_REDIS_URL);
    expect(env.services.anthropic).toEqual({ mock: true });
    expect(env.services.odds).toEqual({ mock: true });
    expect(env.services.sportsdataio).toEqual({ mock: true });
    expect(env.services.tavily).toEqual({ mock: true });
    expect(env.services.voyage).toEqual({ mock: true });
    expect(env.services.browserbase).toEqual({ mock: true });
    expect(env.realtime).toEqual({ mock: true });
    expect(env.jobs.inngest).toEqual({ mode: "mock" });
    expect(env.push).toEqual({ mock: true, publicKey: DEV_PUSH_PUBLIC_KEY });
    expect(env.credentials.encryptionKey).toBe(DEV_CREDENTIAL_ENCRYPTION_KEY);
    expect(env.ingestion).toEqual({ pollPolicyConfig: undefined });
    expect(env.ai).toEqual({
      anthropicModelTier: "cheap",
      customModelProvider: undefined,
      llmProviderKey: "anthropic",
      modelRoute: defaultModelRouteConfig("cheap", "anthropic"),
      voyageEmbeddingModel: VOYAGE_EMBEDDING_MODEL,
    });
    expect(env.news).toEqual({
      grounding: { mock: true },
      rss: { mock: true },
    });
    expect(env.generalStats).toEqual({ mock: true });
    expect(env.entitlements).toEqual({
      caps: DEFAULT_ENTITLEMENT_CAPS,
      devOverride: true,
      gateArenaAdvanced: false,
    });
    expect(env.spendGuard).toEqual({
      providers: DEFAULT_SPEND_GUARD_CAPS,
      window: "total-run",
    });
  });

  it("goes real for a service when its key is set", () => {
    // ubs:ignore — fake fixture value, not a real credential
    const env = parseEnv({ ANTHROPIC_API_KEY: "test-anthropic-key" });
    expect(env.services.anthropic).toEqual({
      mock: false,
      apiKey: "test-anthropic-key", // ubs:ignore — fake fixture value
    });
    expect(env.services.tavily).toEqual({ mock: true });
  });

  it.each(paidServiceCases)(
    "resolves $service real when its key is set and mock flag is unset",
    ({ keyVar, service }) => {
      const value = fixtureValue(service, "fixture", "value");
      const env = parseEnv({ [keyVar]: value });

      expect(env.services[service]).toEqual({ mock: false, apiKey: value });
    },
  );

  it.each(paidServiceCases)(
    "keeps $service mocked when its mock flag is true even with a key",
    ({ keyVar, mockVar, service }) => {
      const env = parseEnv({
        [keyVar]: fixtureValue(service, "fixture", "value"),
        [mockVar]: "true",
      });

      expect(env.services[service]).toEqual({ mock: true });
    },
  );

  it("maps Tavily config into the central news grounding seam", () => {
    const key = fixtureValue("tavily", "news", "fixture");
    const env = parseEnv({ TAVILY_API_KEY: key });

    expect(env.services.tavily).toEqual({ mock: false, apiKey: key });
    expect(env.news.grounding).toEqual({ mock: false, apiKey: key });
  });

  it("configures central RSS feeds from comma or newline separated URLs", () => {
    const env = parseEnv({
      NEWS_RSS_FEED_URLS:
        "https://feeds.example.invalid/nfl.xml,\nhttps://feeds.example.invalid/fantasy.xml",
    });

    expect(env.news.rss).toEqual({
      mock: false,
      feedUrls: [
        "https://feeds.example.invalid/nfl.xml",
        "https://feeds.example.invalid/fantasy.xml",
      ],
    });
  });

  it("MOCK_NEWS_RSS=true keeps RSS mocked even when feed URLs are set", () => {
    const env = parseEnv({
      MOCK_NEWS_RSS: "true",
      NEWS_RSS_FEED_URLS: "https://feeds.example.invalid/nfl.xml",
    });

    expect(env.news.rss).toEqual({ mock: true });
  });

  it("MOCK_NEWS_RSS=false requires RSS feed URLs", () => {
    expect(() => parseEnv({ MOCK_NEWS_RSS: "false" })).toThrow(
      /MOCK_NEWS_RSS=false requires NEWS_RSS_FEED_URLS/,
    );
  });

  it("keeps general stats mock-only until a real source is wired", () => {
    expect(parseEnv({ MOCK_GENERAL_STATS: "true" }).generalStats).toEqual({
      mock: true,
    });
    expect(() => parseEnv({ MOCK_GENERAL_STATS: "false" })).toThrow(
      /MOCK_GENERAL_STATS=false is not supported yet/,
    );
  });

  it("rejects malformed RSS feed URLs without echoing them", () => {
    let message = "";
    try {
      parseEnv({ NEWS_RSS_FEED_URLS: "malformed feed value" });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("NEWS_RSS_FEED_URLS");
    expect(message).not.toContain("malformed feed value");
  });

  it("MOCK_<X>=true forces mock even when a key is set", () => {
    const env = parseEnv({
      ANTHROPIC_API_KEY: "test-anthropic-key", // ubs:ignore — fake fixture value
      MOCK_ANTHROPIC: "true",
    });
    expect(env.services.anthropic).toEqual({ mock: true });
  });

  it("MOCK_<X>=false without a key is a validation error naming the missing var", () => {
    expect(() => parseEnv({ MOCK_ODDS: "false" })).toThrow(
      /MOCK_ODDS=false requires THE_ODDS_API_KEY/,
    );
  });

  it("MOCK_VOYAGE=false without a key is a validation error naming VOYAGE_API_KEY", () => {
    expect(() => parseEnv({ MOCK_VOYAGE: "false" })).toThrow(
      /MOCK_VOYAGE=false requires VOYAGE_API_KEY/,
    );
  });

  it("MOCK_<X>=false with a key goes real", () => {
    const env = parseEnv({ MOCK_ODDS: "false", THE_ODDS_API_KEY: "odds-key" });
    expect(env.services.odds).toEqual({ mock: false, apiKey: "odds-key" });
  });

  it("supports a separate real embeddings provider through Voyage", () => {
    const env = parseEnv({
      MOCK_VOYAGE: "false",
      VOYAGE_API_KEY: "voyage-key", // ubs:ignore — fake fixture value
    });
    expect(env.services.voyage).toEqual({
      mock: false,
      apiKey: "voyage-key", // ubs:ignore — fake fixture value
    });
  });

  it("configures cheap AI model defaults and explicit mixed Anthropic routing", () => {
    expect(parseEnv({}).ai.anthropicModelTier).toBe("cheap");

    expect(parseEnv({ ANTHROPIC_MODEL_TIER: "mixed" }).ai).toEqual({
      anthropicModelTier: "mixed",
      customModelProvider: undefined,
      llmProviderKey: "anthropic",
      modelRoute: defaultModelRouteConfig("mixed", "anthropic"),
      voyageEmbeddingModel: VOYAGE_EMBEDDING_MODEL,
    });
  });

  it("rejects invalid Anthropic model tiers without echoing arbitrary values", () => {
    let message = "";
    try {
      parseEnv({ ANTHROPIC_MODEL_TIER: "fixture-private-tier" });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("ANTHROPIC_MODEL_TIER");
    expect(message).not.toContain("fixture-private-tier");
  });

  it("defaults and overrides the Voyage embedding model", () => {
    expect(parseEnv({}).ai.voyageEmbeddingModel).toBe(VOYAGE_EMBEDDING_MODEL);

    expect(
      parseEnv({ VOYAGE_EMBEDDING_MODEL: "voyage-fixture-model" }).ai
        .voyageEmbeddingModel,
    ).toBe("voyage-fixture-model");
  });

  it("configures an OpenAI-compatible custom LLM provider", () => {
    const customCredentialFixture = fixtureValue("custom", "auth", "fixture");
    const env = parseEnv({
      AI_CUSTOM_MODEL_API_KEY: customCredentialFixture, // ubs:ignore secret-scan:ignore — fake custom model credential fixture
      AI_CUSTOM_MODEL_BASE_URL: "https://models.example.invalid",
      AI_CUSTOM_MODEL_ID: "rumbledore-tuned-fixture",
      AI_CUSTOM_MODEL_KIND: "openai_compatible",
      AI_LLM_PROVIDER_KEY: "custom",
    });

    expect(env.ai.llmProviderKey).toBe("custom");
    expect(env.ai.customModelProvider).toEqual({
      apiKey: customCredentialFixture,
      baseUrl: "https://models.example.invalid",
      key: "custom",
      kind: "openai_compatible",
      model: "rumbledore-tuned-fixture",
    });
    expect(env.ai.modelRoute).toEqual(
      defaultModelRouteConfig("cheap", "custom"),
    );
  });

  it("parses data-driven AI model routing overrides", () => {
    const env = parseEnv({
      AI_MODEL_ROUTE_JSON: JSON.stringify({
        contentTypes: { weekly_recap: "flagship" },
        default: "bulk",
        overrides: { "trash_talker|awards_superlatives": "custom" },
        personas: { narrator: "flagship" },
      }),
    });

    expect(env.ai.modelRoute).toEqual({
      contentTypeDefaults: { weekly_recap: "flagship" },
      defaultProviderKey: "bulk",
      overrides: { "trash_talker|awards_superlatives": "custom" },
      personaDefaults: { narrator: "flagship" },
    });
  });

  it("rejects invalid AI model routing JSON without echoing values", () => {
    let message = "";
    try {
      parseEnv({
        AI_MODEL_ROUTE_JSON: JSON.stringify({
          default: "private-expensive-model",
        }),
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("AI_MODEL_ROUTE_JSON");
    expect(message).not.toContain("private-expensive-model");
  });

  it("configures a custom LLM provider with a named credential env var", () => {
    const namedCredentialFixture = fixtureValue("named", "auth", "fixture");
    const customProviderCredentialPointer = [
      "AI_CUSTOM_MODEL",
      "API",
      "KEY_VAR",
    ].join("_");
    const tunedModelCredentialEnvName = [
      "RUMBLEDORE",
      "TUNED",
      "MODEL",
      "AUTH",
    ].join("_");
    const env = parseEnv({
      [customProviderCredentialPointer]: tunedModelCredentialEnvName,
      AI_CUSTOM_MODEL_BASE_URL: "https://models.example.invalid",
      AI_CUSTOM_MODEL_ID: "rumbledore-tuned-fixture",
      AI_CUSTOM_MODEL_KIND: "anthropic_compatible",
      AI_LLM_PROVIDER_KEY: "custom",
      [tunedModelCredentialEnvName]: namedCredentialFixture, // ubs:ignore secret-scan:ignore — fake custom model credential fixture
    });

    expect(env.ai.customModelProvider).toEqual({
      apiKey: namedCredentialFixture,
      apiKeyVar: tunedModelCredentialEnvName,
      baseUrl: "https://models.example.invalid",
      key: "custom",
      kind: "anthropic_compatible",
      model: "rumbledore-tuned-fixture",
    });
  });

  it("allows explicitly unauthenticated OpenAI-compatible custom endpoints", () => {
    const env = parseEnv({
      AI_CUSTOM_MODEL_ALLOW_UNAUTHENTICATED: "true",
      AI_CUSTOM_MODEL_BASE_URL: "http://127.0.0.1:8080",
      AI_CUSTOM_MODEL_ID: "local-fixture-model",
      AI_CUSTOM_MODEL_KIND: "openai_compatible",
      AI_LLM_PROVIDER_KEY: "custom",
    });

    expect(env.ai.customModelProvider).toEqual({
      baseUrl: "http://127.0.0.1:8080",
      key: "custom",
      kind: "openai_compatible",
      model: "local-fixture-model",
    });
  });

  it("rejects selected custom LLM providers with missing base URL, model, or key", () => {
    let message = "";
    try {
      parseEnv({
        AI_CUSTOM_MODEL_KIND: "openai_compatible",
        AI_LLM_PROVIDER_KEY: "custom",
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("AI_CUSTOM_MODEL_BASE_URL");
    expect(message).toContain("AI_CUSTOM_MODEL_ID");
    expect(message).toContain("AI_CUSTOM_MODEL_API_KEY");
  });

  it("requires a key for Anthropic-compatible custom endpoints", () => {
    expect(() =>
      parseEnv({
        AI_CUSTOM_MODEL_ALLOW_UNAUTHENTICATED: "true",
        AI_CUSTOM_MODEL_BASE_URL: "https://models.example.invalid",
        AI_CUSTOM_MODEL_ID: "anthropic-compatible-fixture",
        AI_CUSTOM_MODEL_KIND: "anthropic_compatible",
        AI_LLM_PROVIDER_KEY: "custom",
      }),
    ).toThrow(/AI_CUSTOM_MODEL_API_KEY/);
  });

  it("defaults and overrides spend guard caps", () => {
    const env = parseEnv({
      SPEND_GUARD_ANTHROPIC_TOKENS: "1",
      SPEND_GUARD_ODDS_REQUESTS: "2",
      SPEND_GUARD_SPORTSDATAIO_REQUESTS: "3",
      SPEND_GUARD_TAVILY_REQUESTS: "4",
      SPEND_GUARD_VOYAGE_REQUESTS: "5",
      SPEND_GUARD_WINDOW: "rolling-24h",
    });

    expect(env.spendGuard).toEqual({
      providers: {
        anthropic: { cap: 1, unit: "tokens" },
        odds: { cap: 2, unit: "requests" },
        sportsdataio: { cap: 3, unit: "requests" },
        tavily: { cap: 4, unit: "requests" },
        voyage: { cap: 5, unit: "requests" },
      },
      window: "rolling-24h",
    });
  });

  it("rejects non-positive spend guard caps by variable name", () => {
    expect(() => parseEnv({ SPEND_GUARD_TAVILY_REQUESTS: "0" })).toThrow(
      /SPEND_GUARD_TAVILY_REQUESTS/,
    );
  });

  it("goes real for realtime when Supabase publish and subscription credentials are set", () => {
    const supabaseJwtFixture = fixtureValue("supabase", "jwt", "fixture");
    const supabasePublishableFixture = fixtureValue(
      "supabase",
      "publishable",
      "fixture",
    );
    const supabaseServiceFixture = fixtureValue(
      "supabase",
      "service",
      "fixture",
    );
    const env = parseEnv({
      SUPABASE_JWT_SECRET: supabaseJwtFixture,
      SUPABASE_PUBLISHABLE_KEY: supabasePublishableFixture,
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceFixture,
      SUPABASE_URL: "https://project.supabase.co",
    });
    expect(env.realtime).toEqual({
      jwtSecret: supabaseJwtFixture,
      mock: false,
      publishableKey: supabasePublishableFixture,
      serviceRoleKey: supabaseServiceFixture,
      url: "https://project.supabase.co",
    });
  });

  it("MOCK_REALTIME=false requires Supabase publish and subscription credentials", () => {
    expect(() => parseEnv({ MOCK_REALTIME: "false" })).toThrow(/SUPABASE_URL/);
    expect(() =>
      parseEnv({
        MOCK_REALTIME: "false",
        SUPABASE_URL: "https://project.supabase.co",
      }),
    ).toThrow(/SUPABASE_PUBLISHABLE_KEY/);
    expect(() =>
      parseEnv({
        MOCK_REALTIME: "false",
        SUPABASE_PUBLISHABLE_KEY: fixtureValue(
          "supabase",
          "publishable",
          "fixture",
        ),
        SUPABASE_SERVICE_ROLE_KEY: fixtureValue(
          "supabase",
          "service",
          "fixture",
        ),
        SUPABASE_URL: "https://project.supabase.co",
      }),
    ).toThrow(/SUPABASE_JWT_SECRET/);
  });

  it("MOCK_REALTIME=true forces the mock publisher even when Supabase is configured", () => {
    const env = parseEnv({
      MOCK_REALTIME: "true",
      SUPABASE_JWT_SECRET: fixtureValue("supabase", "jwt", "fixture"),
      SUPABASE_PUBLISHABLE_KEY: fixtureValue(
        "supabase",
        "publishable",
        "fixture",
      ),
      SUPABASE_SERVICE_ROLE_KEY: fixtureValue("supabase", "service", "fixture"),
      SUPABASE_URL: "https://project.supabase.co",
    });
    expect(env.realtime).toEqual({ mock: true });
  });

  it("uses the local Inngest dev server when INNGEST_DEV is enabled", () => {
    const env = parseEnv({ INNGEST_DEV: "true" });
    expect(env.jobs.inngest).toEqual({
      baseUrl: LOCAL_INNGEST_DEV_SERVER_URL,
      eventKey: undefined,
      mode: "dev",
      signingKey: undefined,
      signingKeyFallback: undefined,
    });
  });

  it("uses explicit Inngest dev and cloud endpoints when configured", () => {
    const dev = parseEnv({
      INNGEST_DEV: "http://127.0.0.1:9999",
      INNGEST_EVENT_KEY: fixtureValue("inngest", "event", "fixture"),
      INNGEST_SIGNING_KEY: fixtureValue("inngest", "signing", "fixture"),
      INNGEST_SIGNING_KEY_FALLBACK: fixtureValue(
        "inngest",
        "signing",
        "fallback",
      ),
    });
    expect(dev.jobs.inngest).toEqual({
      baseUrl: "http://127.0.0.1:9999/",
      eventKey: fixtureValue("inngest", "event", "fixture"),
      mode: "dev",
      signingKey: fixtureValue("inngest", "signing", "fixture"),
      signingKeyFallback: fixtureValue("inngest", "signing", "fallback"),
    });

    const cloud = parseEnv({
      INNGEST_EVENT_KEY: fixtureValue("inngest", "event", "fixture"),
    });
    expect(cloud.jobs.inngest).toEqual({
      apiBaseUrl: INNGEST_CLOUD_API_BASE_URL,
      eventApiBaseUrl: INNGEST_CLOUD_EVENT_BASE_URL,
      eventKey: fixtureValue("inngest", "event", "fixture"),
      mode: "cloud",
      signingKey: undefined,
      signingKeyFallback: undefined,
    });
  });

  it("rejects malformed INNGEST_DEV values without echoing them", () => {
    let message = "";
    try {
      parseEnv({ INNGEST_DEV: "fixture private dev value" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("INNGEST_DEV");
    expect(message).not.toContain("fixture private dev value");
  });

  it("rejects Inngest dev mode in production", () => {
    expect(() =>
      parseEnv({
        BETTER_AUTH_SECRET: fixtureValue("better", "auth", "prod"),
        CREDENTIAL_ENCRYPTION_KEY: fixtureValue("credential", "key", "prod"),
        INNGEST_DEV: "true",
        NODE_ENV: "production",
      }),
    ).toThrow(/Inngest dev mode is not allowed/);
  });

  it("requires production Inngest cloud signing parity when cloud config is present", () => {
    expect(() =>
      parseEnv({
        BETTER_AUTH_SECRET: fixtureValue("better", "auth", "prod"),
        CREDENTIAL_ENCRYPTION_KEY: fixtureValue("credential", "key", "prod"),
        INNGEST_EVENT_KEY: fixtureValue("inngest", "event", "prod"),
        NODE_ENV: "production",
      }),
    ).toThrow(/INNGEST_SIGNING_KEY/);

    const env = parseEnv({
      BETTER_AUTH_SECRET: fixtureValue("better", "auth", "prod"),
      CREDENTIAL_ENCRYPTION_KEY: fixtureValue("credential", "key", "prod"),
      INNGEST_EVENT_KEY: fixtureValue("inngest", "event", "prod"),
      INNGEST_SIGNING_KEY: fixtureValue("inngest", "signing", "prod"),
      NODE_ENV: "production",
    });
    expect(env.jobs.inngest).toMatchObject({
      mode: "cloud",
      signingKey: fixtureValue("inngest", "signing", "prod"),
    });
  });

  it("goes real for web push when VAPID config is present", () => {
    const publicKey = fixtureValue("web", "push", "public");
    const privateKey = fixtureValue("web", "push", "private");
    const subject = "mailto:ops@example.invalid";
    const env = parseEnv({
      WEB_PUSH_PRIVATE_KEY: privateKey,
      WEB_PUSH_PUBLIC_KEY: publicKey,
      WEB_PUSH_SUBJECT: subject,
    });
    expect(env.push).toEqual({
      mock: false,
      privateKey,
      publicKey,
      subject,
    });
  });

  it("MOCK_PUSH=false requires VAPID config", () => {
    expect(() => parseEnv({ MOCK_PUSH: "false" })).toThrow(
      /WEB_PUSH_PUBLIC_KEY/,
    );
    expect(() =>
      parseEnv({
        MOCK_PUSH: "false",
        WEB_PUSH_PUBLIC_KEY: fixtureValue("web", "push", "public"),
      }),
    ).toThrow(/WEB_PUSH_PRIVATE_KEY/);
    expect(() =>
      parseEnv({
        MOCK_PUSH: "false",
        WEB_PUSH_PRIVATE_KEY: fixtureValue("web", "push", "private"),
        WEB_PUSH_PUBLIC_KEY: fixtureValue("web", "push", "public"),
      }),
    ).toThrow(/WEB_PUSH_SUBJECT/);
  });

  it("treats empty and whitespace-only values as unset", () => {
    const env = parseEnv({
      ANTHROPIC_API_KEY: "",
      TAVILY_API_KEY: "   ",
      DATABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_URL: "   ",
    });
    expect(env.services.anthropic).toEqual({ mock: true });
    expect(env.services.tavily).toEqual({ mock: true });
    expect(env.databaseUrl).toBe(LOCAL_DATABASE_URL);
    expect(env.realtime).toEqual({ mock: true });
  });

  it("rejects a malformed DATABASE_URL", () => {
    expect(() => parseEnv({ DATABASE_URL: "not a url" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("coerces ESPN test fixture vars to numbers", () => {
    const env = parseEnv({
      ESPN_SWID: "{FD5A81BC-70C4-4C77-8569-1951A36F3F5F}",
      ESPN_S2: "AEC-fake-cookie",
      ESPN_TEST_LEAGUE_ID: "95050",
      ESPN_TEST_SEASON: "2026",
    });
    expect(env.espn).toEqual({
      swid: "{FD5A81BC-70C4-4C77-8569-1951A36F3F5F}",
      s2: "AEC-fake-cookie",
      testLeagueId: 95050,
      testSeason: 2026,
    });
  });

  it("rejects an ESPN_SWID that is not a braced GUID without echoing its value", () => {
    let message = "";
    try {
      parseEnv({ ESPN_SWID: "super-secret-but-malformed" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("ESPN_SWID");
    expect(message).not.toContain("super-secret-but-malformed");
  });

  it("defaults auth to the dev secret, localhost URL, and mocked OAuth providers", () => {
    const env = parseEnv({});
    expect(env.auth.secret).toBe(DEV_AUTH_SECRET);
    expect(env.auth.url).toBe("http://localhost:3000");
    expect(env.auth.google).toEqual({ mock: true });
    expect(env.auth.yahoo).toEqual({ mock: true });
  });

  it("requires production-only secrets in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(
      /BETTER_AUTH_SECRET is required when NODE_ENV=production/,
    );
    const env = parseEnv({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "prod-secret", // ubs:ignore — fake fixture value
      CREDENTIAL_ENCRYPTION_KEY: "prod-credential-key-minimum-32-chars", // ubs:ignore — fake fixture value
    });
    expect(env.auth.secret).toBe("prod-secret");
    expect(env.credentials.encryptionKey).toBe(
      "prod-credential-key-minimum-32-chars",
    );
    // TEMPORARY (pre-pricing): dev-override defaults ON everywhere — nothing gated.
    expect(env.entitlements.devOverride).toBe(true);
  });

  it("configures entitlement dev override by environment", () => {
    expect(parseEnv({ NODE_ENV: "test" }).entitlements.devOverride).toBe(true);
    expect(
      parseEnv({
        ENTITLEMENTS_DEV_OVERRIDE: "false",
        NODE_ENV: "test",
      }).entitlements.devOverride,
    ).toBe(false);
    expect(() =>
      parseEnv({
        CREDENTIAL_ENCRYPTION_KEY: "prod-credential-key-minimum-32-chars", // ubs:ignore — fake fixture value
        BETTER_AUTH_SECRET: "prod-secret", // ubs:ignore — fake fixture value
        ENTITLEMENTS_DEV_OVERRIDE: "1",
        NODE_ENV: "production",
      }),
    ).toThrow(/ENTITLEMENTS_DEV_OVERRIDE=true is not allowed/);
  });

  it("configures entitlement caps and advisory arena gating", () => {
    const env = parseEnv({
      ENTITLEMENTS_AI_POSTS_PER_WEEK: "7",
      ENTITLEMENTS_GATE_ARENA_ADVANCED: "true",
      ENTITLEMENTS_INDIVIDUAL_LEAGUES_COVERED: "3",
      ENTITLEMENTS_MAX_PREMIUM_LEAGUES_PER_USER: "2",
    });

    expect(env.entitlements).toEqual({
      caps: {
        aiPostsPerWeek: 7,
        individualLeaguesCovered: 3,
        maxPremiumLeaguesPerUser: 2,
      },
      devOverride: true,
      gateArenaAdvanced: true,
    });
  });

  it("configures the ingestion poll policy override from JSON", () => {
    const env = parseEnv({
      INGESTION_POLL_POLICY_JSON: JSON.stringify({
        intervalsMs: {
          live_window: { matchups: 5_000 },
        },
      }),
    });

    expect(env.ingestion.pollPolicyConfig).toEqual({
      intervalsMs: {
        live_window: { matchups: 5_000 },
      },
    });
  });

  it("rejects malformed ingestion poll policy JSON without echoing it", () => {
    let message = "";
    try {
      parseEnv({
        INGESTION_POLL_POLICY_JSON:
          '{"intervalsMs":{"live_window":{"matchups":0}}}',
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("INGESTION_POLL_POLICY_JSON");
    expect(message).not.toContain("matchups");
  });

  it("rejects invalid entitlement cap values", () => {
    expect(() => parseEnv({ ENTITLEMENTS_AI_POSTS_PER_WEEK: "0" })).toThrow(
      /ENTITLEMENTS_AI_POSTS_PER_WEEK/,
    );
    expect(() =>
      parseEnv({ ENTITLEMENTS_INDIVIDUAL_LEAGUES_COVERED: "-1" }),
    ).toThrow(/ENTITLEMENTS_INDIVIDUAL_LEAGUES_COVERED/);
    expect(() =>
      parseEnv({ ENTITLEMENTS_MAX_PREMIUM_LEAGUES_PER_USER: "1.5" }),
    ).toThrow(/ENTITLEMENTS_MAX_PREMIUM_LEAGUES_PER_USER/);
  });

  it("goes real for Google when both OAuth vars are set", () => {
    const env = parseEnv({
      GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "gsecret", // ubs:ignore — fake fixture value
    });
    expect(env.auth.google).toEqual({
      mock: false,
      clientId: "gid.apps.googleusercontent.com",
      clientSecret: "gsecret", // ubs:ignore — fake fixture value
    });
  });

  it("rejects a lone Google OAuth var", () => {
    expect(() => parseEnv({ GOOGLE_CLIENT_ID: "gid-only" })).toThrow(
      /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together/,
    );
  });

  it("goes real for Yahoo when both OAuth vars are set", () => {
    const env = parseEnv({
      BETTER_AUTH_URL: "https://app.example.com",
      YAHOO_CLIENT_ID: "yahoo-client-id",
      YAHOO_CLIENT_SECRET: "yahoo-client-secret", // secret-scan:ignore - fake fixture value; ubs:ignore — fake fixture value
    });
    expect(env.auth.yahoo).toEqual({
      mock: false,
      clientId: "yahoo-client-id",
      clientSecret: "yahoo-client-secret", // ubs:ignore — fake fixture value
      redirectUri: "https://app.example.com/api/onboarding/yahoo/callback",
      scope: "fspt-r",
    });
  });

  it("rejects a lone Yahoo OAuth var", () => {
    expect(() => parseEnv({ YAHOO_CLIENT_ID: "yahoo-client-only" })).toThrow(
      /YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET must be set together/,
    );
  });

  it("reports every invalid var in one error", () => {
    let message = "";
    try {
      parseEnv({
        MOCK_TAVILY: "false",
        MOCK_VOYAGE: "false",
        MOCK_BROWSERBASE: "false",
        MOCK_REALTIME: "false",
        MOCK_PUSH: "false",
        REDIS_URL: "nope",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("TAVILY_API_KEY");
    expect(message).toContain("VOYAGE_API_KEY");
    expect(message).toContain("BROWSERBASE_API_KEY");
    expect(message).toContain("SUPABASE_URL");
    expect(message).toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(message).toContain("SUPABASE_JWT_SECRET");
    expect(message).toContain("WEB_PUSH_PUBLIC_KEY");
    expect(message).toContain("REDIS_URL");
  });
});
