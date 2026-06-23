import { z } from "zod";
import {
  ANTHROPIC_MODEL_TIERS,
  type AnthropicModelTier,
  VOYAGE_EMBEDDING_MODEL,
} from "@/ai/model-config";
import type { CustomModelProvider } from "@/ai/model-providers";
import {
  defaultModelRouteConfig,
  type ModelRouteConfig,
  parseModelRouteConfigJson,
} from "@/ai/model-routing";
import {
  type PollPolicyConfigOverride,
  parsePollPolicyConfigJson,
} from "@/ingestion/poll-policy";

// Dev defaults match docker-compose.yml (host ports 5440/6390 — 5432/6379 are taken on the shared box).
export const LOCAL_DATABASE_URL =
  "postgres://rumbledore:rumbledore@localhost:5440/rumbledore";
export const LOCAL_REDIS_URL = "redis://localhost:6390";
export const LOCAL_INNGEST_DEV_SERVER_URL = "http://localhost:8288";
export const INNGEST_CLOUD_API_BASE_URL = "https://api.inngest.com";
export const INNGEST_CLOUD_EVENT_BASE_URL = "https://inn.gs";

/**
 * Paid integrations default to mocks so the app runs with only local Postgres/Redis.
 * Effective mode per service:
 *   - MOCK_<X>=true        → mock, even if a key is set
 *   - MOCK_<X>=false       → real; missing key is a validation error
 *   - MOCK_<X> unset       → real iff the key is set, otherwise mock
 */
export type ServiceConfig = { mock: true } | { mock: false; apiKey: string };

export type NewsRssConfig =
  | { mock: true }
  | { mock: false; feedUrls: string[] };

export interface NewsConfig {
  grounding: ServiceConfig;
  rss: NewsRssConfig;
}

export type GeneralStatsConfig = { mock: true };

/**
 * Google OAuth is the social-login stub (spec 02 §8): with no creds Better
 * Auth gets placeholder values so the provider routes exist; real creds drop
 * in via env with no code change. Both vars must be set together.
 */
export type GoogleOAuthConfig =
  | { mock: true }
  | { mock: false; clientId: string; clientSecret: string };

export type YahooOAuthConfig =
  | { mock: true }
  | {
      mock: false;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      scope: string;
    };

export type RealtimeConfig =
  | { mock: true }
  | {
      mock: false;
      jwtSecret: string;
      publishableKey: string;
      serviceRoleKey: string;
      url: string;
    };

export type InngestConfig =
  | { mode: "mock" }
  | {
      mode: "dev";
      baseUrl: string;
      eventKey: string | undefined;
      signingKey: string | undefined;
      signingKeyFallback: string | undefined;
    }
  | {
      mode: "cloud";
      apiBaseUrl: string;
      eventApiBaseUrl: string;
      eventKey: string;
      signingKey: string | undefined;
      signingKeyFallback: string | undefined;
    };

export type PushConfig =
  | { mock: true; publicKey: string }
  | {
      mock: false;
      privateKey: string;
      publicKey: string;
      subject: string;
    };

export interface EntitlementCapsConfig {
  aiPostsPerWeek: number;
  maxPremiumLeaguesPerUser: number | null;
  individualLeaguesCovered: number;
}

export interface EntitlementsConfig {
  devOverride: boolean;
  gateArenaAdvanced: boolean;
  caps: EntitlementCapsConfig;
}

export interface IngestionConfig {
  pollPolicyConfig: PollPolicyConfigOverride | undefined;
}

export interface AiConfig {
  anthropicModelTier: AnthropicModelTier;
  customModelProvider: CustomModelProvider | undefined;
  llmProviderKey: "anthropic" | "custom";
  modelRoute: ModelRouteConfig;
  voyageEmbeddingModel: string;
}

export const SPEND_GUARD_PROVIDERS = [
  "anthropic",
  "odds",
  "sportsdataio",
  "tavily",
  "voyage",
] as const;
export type SpendGuardProvider = (typeof SPEND_GUARD_PROVIDERS)[number];

export const SPEND_GUARD_WINDOWS = ["total-run", "rolling-24h"] as const;
export type SpendGuardWindow = (typeof SPEND_GUARD_WINDOWS)[number];
export type SpendGuardUnit = "requests" | "tokens";

export interface SpendGuardProviderConfig {
  cap: number;
  unit: SpendGuardUnit;
}

export interface SpendGuardConfig {
  providers: Record<SpendGuardProvider, SpendGuardProviderConfig>;
  window: SpendGuardWindow;
}

export const DEFAULT_ENTITLEMENT_CAPS = {
  aiPostsPerWeek: 25,
  individualLeaguesCovered: 10,
  maxPremiumLeaguesPerUser: null,
} as const satisfies EntitlementCapsConfig;

export const DEFAULT_SPEND_GUARD_CAPS = {
  anthropic: { cap: 2_000_000, unit: "tokens" },
  odds: { cap: 250, unit: "requests" },
  sportsdataio: { cap: 250, unit: "requests" },
  tavily: { cap: 250, unit: "requests" },
  voyage: { cap: 25_000, unit: "requests" },
} as const satisfies Record<SpendGuardProvider, SpendGuardProviderConfig>;

// Dev-only fallback so the app boots with zero config; production requires BETTER_AUTH_SECRET.
export const DEV_AUTH_SECRET = "rumbledore-dev-only-secret"; // ubs:ignore — not a credential, dev placeholder rejected in production
export const DEV_CREDENTIAL_ENCRYPTION_KEY =
  "rumbledore-dev-only-credential-key-32chars"; // ubs:ignore — not a credential, dev placeholder rejected in production
export const DEV_PUSH_PUBLIC_KEY =
  "BF_-asb0YkmLyoUqIg_c4WoJJHyU0xf1kviNES_xMb-a_41mQdPMnlBa_7r4rjFb8dnk6X4XuGp8-P95kLLLTjc";

export const PAID_SERVICES = [
  "anthropic",
  "odds",
  "sportsdataio",
  "tavily",
  "voyage",
  "browserbase",
] as const;
export type PaidService = (typeof PAID_SERVICES)[number];

const SERVICE_VARS: Record<PaidService, { keyVar: string; mockVar: string }> = {
  anthropic: { keyVar: "ANTHROPIC_API_KEY", mockVar: "MOCK_ANTHROPIC" },
  odds: { keyVar: "THE_ODDS_API_KEY", mockVar: "MOCK_ODDS" },
  sportsdataio: {
    keyVar: "SPORTSDATAIO_API_KEY",
    mockVar: "MOCK_SPORTSDATAIO",
  },
  tavily: { keyVar: "TAVILY_API_KEY", mockVar: "MOCK_TAVILY" },
  voyage: { keyVar: "VOYAGE_API_KEY", mockVar: "MOCK_VOYAGE" },
  browserbase: { keyVar: "BROWSERBASE_API_KEY", mockVar: "MOCK_BROWSERBASE" },
};

const secret = z.string().min(1);
const stringbool = z.stringbool();
const CUSTOM_MODEL_API_KEY_VAR_NAME = [
  "AI_CUSTOM_MODEL",
  "API",
  "KEY_VAR",
].join("_");
const CUSTOM_MODEL_DEFAULT_API_KEY_VAR_NAME = [
  "AI_CUSTOM_MODEL",
  "API",
  "KEY",
].join("_");

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.url().default(LOCAL_DATABASE_URL),
  REDIS_URL: z.url().default(LOCAL_REDIS_URL),

  // ESPN is cookie-authed, not a paid API; optional until a user connects.
  ESPN_SWID: secret
    .regex(
      /^\{[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}$/,
      "must be a braced GUID",
    )
    .optional(),
  ESPN_S2: secret.optional(),
  ESPN_TEST_LEAGUE_ID: z.coerce.number().int().positive().optional(),
  ESPN_TEST_SEASON: z.coerce.number().int().min(2000).max(2100).optional(),

  BETTER_AUTH_SECRET: secret.optional(),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: secret.optional(),
  GOOGLE_CLIENT_SECRET: secret.optional(),
  YAHOO_CLIENT_ID: secret.optional(),
  YAHOO_CLIENT_SECRET: secret.optional(),
  YAHOO_REDIRECT_URI: z.url().optional(),
  YAHOO_OAUTH_SCOPE: secret.default("fspt-r"),
  CREDENTIAL_ENCRYPTION_KEY: secret.optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: secret.optional(),
  SUPABASE_SERVICE_ROLE_KEY: secret.optional(),
  SUPABASE_JWT_SECRET: secret.optional(),
  MOCK_REALTIME: stringbool.optional(),
  INNGEST_DEV: z.string().trim().min(1).optional(),
  INNGEST_DEVSERVER_URL: z.url().optional(),
  INNGEST_BASE_URL: z.url().optional(),
  INNGEST_API_BASE_URL: z.url().optional(),
  INNGEST_EVENT_API_BASE_URL: z.url().optional(),
  INNGEST_EVENT_KEY: secret.optional(),
  INNGEST_SIGNING_KEY: secret.optional(),
  INNGEST_SIGNING_KEY_FALLBACK: secret.optional(),
  WEB_PUSH_PUBLIC_KEY: secret.optional(),
  WEB_PUSH_PRIVATE_KEY: secret.optional(),
  WEB_PUSH_SUBJECT: secret.optional(),
  MOCK_PUSH: stringbool.optional(),
  ENTITLEMENTS_DEV_OVERRIDE: stringbool.optional(),
  ENTITLEMENTS_GATE_ARENA_ADVANCED: stringbool.optional(),
  ENTITLEMENTS_AI_POSTS_PER_WEEK: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_ENTITLEMENT_CAPS.aiPostsPerWeek),
  ENTITLEMENTS_MAX_PREMIUM_LEAGUES_PER_USER: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  ENTITLEMENTS_INDIVIDUAL_LEAGUES_COVERED: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_ENTITLEMENT_CAPS.individualLeaguesCovered),
  INGESTION_POLL_POLICY_JSON: z.string().trim().min(1).optional(),
  NEWS_RSS_FEED_URLS: z.string().trim().min(1).optional(),
  MOCK_NEWS_RSS: stringbool.optional(),
  MOCK_GENERAL_STATS: stringbool.optional(),
  SPEND_GUARD_WINDOW: z.enum(SPEND_GUARD_WINDOWS).default("total-run"),
  SPEND_GUARD_ANTHROPIC_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_SPEND_GUARD_CAPS.anthropic.cap),
  SPEND_GUARD_ODDS_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_SPEND_GUARD_CAPS.odds.cap),
  SPEND_GUARD_SPORTSDATAIO_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_SPEND_GUARD_CAPS.sportsdataio.cap),
  SPEND_GUARD_TAVILY_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_SPEND_GUARD_CAPS.tavily.cap),
  SPEND_GUARD_VOYAGE_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_SPEND_GUARD_CAPS.voyage.cap),

  ANTHROPIC_API_KEY: secret.optional(),
  ANTHROPIC_MODEL_TIER: z.enum(ANTHROPIC_MODEL_TIERS).default("cheap"),
  THE_ODDS_API_KEY: secret.optional(),
  SPORTSDATAIO_API_KEY: secret.optional(),
  TAVILY_API_KEY: secret.optional(),
  VOYAGE_API_KEY: secret.optional(),
  VOYAGE_EMBEDDING_MODEL: secret.default(VOYAGE_EMBEDDING_MODEL),
  BROWSERBASE_API_KEY: secret.optional(),
  AI_LLM_PROVIDER_KEY: z.enum(["anthropic", "custom"]).default("anthropic"),
  AI_CUSTOM_MODEL_KIND: z
    .enum(["anthropic_compatible", "openai_compatible"])
    .optional(),
  AI_CUSTOM_MODEL_BASE_URL: z.url().optional(),
  AI_CUSTOM_MODEL_ID: z.string().trim().min(1).optional(),
  AI_CUSTOM_MODEL_API_KEY: secret.optional(),
  AI_CUSTOM_MODEL_API_KEY_VAR: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
  AI_CUSTOM_MODEL_ALLOW_UNAUTHENTICATED: stringbool.optional(),
  AI_MODEL_ROUTE_JSON: z.string().trim().min(1).optional(),

  MOCK_ANTHROPIC: stringbool.optional(),
  MOCK_ODDS: stringbool.optional(),
  MOCK_SPORTSDATAIO: stringbool.optional(),
  MOCK_TAVILY: stringbool.optional(),
  MOCK_VOYAGE: stringbool.optional(),
  MOCK_BROWSERBASE: stringbool.optional(),
});

type RawEnv = z.infer<typeof baseSchema>;

function defaultEntitlementDevOverride(nodeEnv: RawEnv["NODE_ENV"]): boolean {
  // TEMPORARY (pre-pricing testing): the free tier has every feature, so the
  // entitlement dev-override defaults ON in every environment — nothing is gated.
  // Re-gate when the pricing plan lands by restoring the production case to `false`.
  switch (nodeEnv) {
    case "production":
      return true;
    case "development":
    case "test":
      return true;
  }
}

export interface Env {
  nodeEnv: RawEnv["NODE_ENV"];
  databaseUrl: string;
  redisUrl: string;
  espn: {
    swid: string | undefined;
    s2: string | undefined;
    testLeagueId: number | undefined;
    testSeason: number | undefined;
  };
  auth: {
    secret: string;
    url: string;
    google: GoogleOAuthConfig;
    yahoo: YahooOAuthConfig;
  };
  credentials: {
    encryptionKey: string;
  };
  realtime: RealtimeConfig;
  jobs: {
    inngest: InngestConfig;
  };
  entitlements: EntitlementsConfig;
  generalStats: GeneralStatsConfig;
  ingestion: IngestionConfig;
  ai: AiConfig;
  news: NewsConfig;
  push: PushConfig;
  spendGuard: SpendGuardConfig;
  services: Record<PaidService, ServiceConfig>;
}

/**
 * Validates raw env vars (empty/whitespace-only values count as unset).
 * Throws with var names and rule violations only — never echoes secret values.
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const present = Object.fromEntries(
    Object.entries(raw).filter(
      ([, value]) => value !== undefined && value.trim() !== "",
    ),
  );

  const problems: string[] = [];
  const base = baseSchema.safeParse(present);
  if (!base.success) {
    problems.push(z.prettifyError(base.error));
  }

  // Checked against `present` (not the parsed result) so these surface even when other vars are invalid.
  for (const { keyVar, mockVar } of Object.values(SERVICE_VARS)) {
    const flag =
      mockVar in present ? stringbool.safeParse(present[mockVar]) : undefined;
    if (flag?.success && flag.data === false && !(keyVar in present)) {
      problems.push(
        `✖ ${mockVar}=false requires ${keyVar} to be set\n  → at ${keyVar}`,
      );
    }
  }

  switch (present.NODE_ENV) {
    case "production":
      if (!("BETTER_AUTH_SECRET" in present)) {
        problems.push(
          "✖ BETTER_AUTH_SECRET is required when NODE_ENV=production\n  → at BETTER_AUTH_SECRET",
        );
      }
      if (!("CREDENTIAL_ENCRYPTION_KEY" in present)) {
        problems.push(
          "✖ CREDENTIAL_ENCRYPTION_KEY is required when NODE_ENV=production\n  → at CREDENTIAL_ENCRYPTION_KEY",
        );
      }
      {
        const entitlementDevOverrideFlag =
          "ENTITLEMENTS_DEV_OVERRIDE" in present
            ? stringbool.safeParse(present.ENTITLEMENTS_DEV_OVERRIDE)
            : undefined;
        if (
          entitlementDevOverrideFlag?.success &&
          entitlementDevOverrideFlag.data === true
        ) {
          problems.push(
            "✖ ENTITLEMENTS_DEV_OVERRIDE=true is not allowed when NODE_ENV=production\n  → at ENTITLEMENTS_DEV_OVERRIDE",
          );
        }
      }
      break;
    default:
      break;
  }

  const googleVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].filter(
    (v) => v in present,
  );
  if (googleVars.length === 1) {
    problems.push(
      `✖ GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together (only ${googleVars[0]} is set)\n  → at GOOGLE_CLIENT_ID`,
    );
  }

  const yahooVars = ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET"].filter(
    (v) => v in present,
  );
  if (yahooVars.length === 1) {
    problems.push(
      `✖ YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET must be set together (only ${yahooVars[0]} is set)\n  → at YAHOO_CLIENT_ID`,
    );
  }

  const realtimeFlag =
    "MOCK_REALTIME" in present
      ? stringbool.safeParse(present.MOCK_REALTIME)
      : undefined;
  if (realtimeFlag?.success && realtimeFlag.data === false) {
    if (!("SUPABASE_URL" in present)) {
      problems.push(
        "✖ MOCK_REALTIME=false requires SUPABASE_URL to be set\n  → at SUPABASE_URL",
      );
    }
    if (!("SUPABASE_PUBLISHABLE_KEY" in present)) {
      problems.push(
        "✖ MOCK_REALTIME=false requires SUPABASE_PUBLISHABLE_KEY to be set\n  → at SUPABASE_PUBLISHABLE_KEY",
      );
    }
    if (!("SUPABASE_SERVICE_ROLE_KEY" in present)) {
      problems.push(
        "✖ MOCK_REALTIME=false requires SUPABASE_SERVICE_ROLE_KEY to be set\n  → at SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    if (!("SUPABASE_JWT_SECRET" in present)) {
      problems.push(
        "✖ MOCK_REALTIME=false requires SUPABASE_JWT_SECRET to be set\n  → at SUPABASE_JWT_SECRET",
      );
    }
  }

  const inngestDevValue = present.INNGEST_DEV;
  if (typeof inngestDevValue === "string") {
    const devFlag = stringbool.safeParse(inngestDevValue);
    if (!devFlag.success) {
      try {
        new URL(inngestDevValue);
      } catch {
        problems.push(
          "✖ INNGEST_DEV must be a boolean or URL\n  → at INNGEST_DEV",
        );
      }
    }
  }

  const pushFlag =
    "MOCK_PUSH" in present
      ? stringbool.safeParse(present.MOCK_PUSH)
      : undefined;
  if (pushFlag?.success && pushFlag.data === false) {
    if (!("WEB_PUSH_PUBLIC_KEY" in present)) {
      problems.push(
        "✖ MOCK_PUSH=false requires WEB_PUSH_PUBLIC_KEY to be set\n  → at WEB_PUSH_PUBLIC_KEY",
      );
    }
    if (!("WEB_PUSH_PRIVATE_KEY" in present)) {
      problems.push(
        "✖ MOCK_PUSH=false requires WEB_PUSH_PRIVATE_KEY to be set\n  → at WEB_PUSH_PRIVATE_KEY",
      );
    }
    if (!("WEB_PUSH_SUBJECT" in present)) {
      problems.push(
        "✖ MOCK_PUSH=false requires WEB_PUSH_SUBJECT to be set\n  → at WEB_PUSH_SUBJECT",
      );
    }
  }

  let ingestionPollPolicyConfig: PollPolicyConfigOverride | undefined;
  if ("INGESTION_POLL_POLICY_JSON" in present) {
    try {
      ingestionPollPolicyConfig = parsePollPolicyConfigJson(
        present.INGESTION_POLL_POLICY_JSON,
      );
    } catch {
      problems.push(
        "✖ INGESTION_POLL_POLICY_JSON must be JSON with positive integer intervalsMs values keyed by game state and data class\n  → at INGESTION_POLL_POLICY_JSON",
      );
    }
  }

  let modelRouteConfig: ModelRouteConfig | undefined;
  if ("AI_MODEL_ROUTE_JSON" in present) {
    try {
      const routeBase = defaultModelRouteConfig(
        base.success ? base.data.ANTHROPIC_MODEL_TIER : "cheap",
        base.success ? base.data.AI_LLM_PROVIDER_KEY : "anthropic",
      );
      modelRouteConfig = parseModelRouteConfigJson(
        String(present.AI_MODEL_ROUTE_JSON),
        routeBase,
      );
    } catch {
      problems.push(
        "✖ AI_MODEL_ROUTE_JSON must be JSON using known personas, content types, and bulk/flagship/custom provider keys\n  → at AI_MODEL_ROUTE_JSON",
      );
    }
  }

  const customModelProviderTouched = [
    "AI_CUSTOM_MODEL_BASE_URL",
    "AI_CUSTOM_MODEL_ID",
    "AI_CUSTOM_MODEL_KIND",
  ].some((key) => key in present);
  const customModelProviderSelected = present.AI_LLM_PROVIDER_KEY === "custom";
  if (customModelProviderTouched || customModelProviderSelected) {
    if (!("AI_CUSTOM_MODEL_KIND" in present)) {
      problems.push(
        "✖ custom model provider requires AI_CUSTOM_MODEL_KIND to be set\n  → at AI_CUSTOM_MODEL_KIND",
      );
    }
    if (!("AI_CUSTOM_MODEL_BASE_URL" in present)) {
      problems.push(
        "✖ custom model provider requires AI_CUSTOM_MODEL_BASE_URL to be set\n  → at AI_CUSTOM_MODEL_BASE_URL",
      );
    }
    if (!("AI_CUSTOM_MODEL_ID" in present)) {
      problems.push(
        "✖ custom model provider requires AI_CUSTOM_MODEL_ID to be set\n  → at AI_CUSTOM_MODEL_ID",
      );
    }
    const allowUnauthenticated =
      present.AI_CUSTOM_MODEL_KIND !== "anthropic_compatible" &&
      "AI_CUSTOM_MODEL_ALLOW_UNAUTHENTICATED" in present
        ? stringbool.safeParse(present.AI_CUSTOM_MODEL_ALLOW_UNAUTHENTICATED)
            .data === true
        : false;
    const credentialEnvName =
      CUSTOM_MODEL_API_KEY_VAR_NAME in present
        ? String(present[CUSTOM_MODEL_API_KEY_VAR_NAME])
        : CUSTOM_MODEL_DEFAULT_API_KEY_VAR_NAME;
    if (!allowUnauthenticated && !(credentialEnvName in present)) {
      problems.push(
        `✖ custom model provider requires ${credentialEnvName} to be set or AI_CUSTOM_MODEL_ALLOW_UNAUTHENTICATED=true\n  → at ${credentialEnvName}`,
      );
    }
  }

  const newsRssFlag =
    "MOCK_NEWS_RSS" in present
      ? stringbool.safeParse(present.MOCK_NEWS_RSS)
      : undefined;
  if (newsRssFlag?.success && newsRssFlag.data === false) {
    if (!("NEWS_RSS_FEED_URLS" in present)) {
      problems.push(
        "✖ MOCK_NEWS_RSS=false requires NEWS_RSS_FEED_URLS to be set\n  → at NEWS_RSS_FEED_URLS",
      );
    }
  }
  const rawNewsRssFeedUrls = (present.NEWS_RSS_FEED_URLS ?? "")
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  for (const feedUrl of rawNewsRssFeedUrls) {
    try {
      const url = new URL(feedUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      problems.push(
        "✖ NEWS_RSS_FEED_URLS must contain only http(s) URLs separated by commas or newlines\n  → at NEWS_RSS_FEED_URLS",
      );
      break;
    }
  }

  const generalStatsFlag =
    "MOCK_GENERAL_STATS" in present
      ? stringbool.safeParse(present.MOCK_GENERAL_STATS)
      : undefined;
  if (generalStatsFlag?.success && generalStatsFlag.data === false) {
    problems.push(
      "✖ MOCK_GENERAL_STATS=false is not supported yet; T12 only provides the mock/$0 general-stats source\n  → at MOCK_GENERAL_STATS",
    );
  }

  if (!base.success || problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${problems.join("\n")}`,
    );
  }

  const parsed = base.data;
  const service = (
    key: string | undefined,
    mockFlag: boolean | undefined,
  ): ServiceConfig =>
    // (mockFlag === false && key undefined) was rejected above, so "not forced mock + key present" = real.
    mockFlag !== true && key !== undefined
      ? { mock: false, apiKey: key }
      : { mock: true };

  const newsRss: NewsRssConfig =
    parsed.MOCK_NEWS_RSS !== true && rawNewsRssFeedUrls.length > 0
      ? { mock: false, feedUrls: rawNewsRssFeedUrls }
      : { mock: true };

  // Presence checks, not secret-value comparisons (empty strings were
  // already filtered out above, so truthiness == presence here).
  const googleClientId = parsed.GOOGLE_CLIENT_ID;
  const googleClientSecret = parsed.GOOGLE_CLIENT_SECRET;
  const yahooClientId = parsed.YAHOO_CLIENT_ID;
  const yahooClientSecret = parsed.YAHOO_CLIENT_SECRET;
  const realtimeIsReal =
    parsed.MOCK_REALTIME !== true &&
    parsed.SUPABASE_URL !== undefined &&
    parsed.SUPABASE_PUBLISHABLE_KEY !== undefined &&
    parsed.SUPABASE_JWT_SECRET !== undefined &&
    parsed.SUPABASE_SERVICE_ROLE_KEY !== undefined;
  const pushIsReal =
    parsed.MOCK_PUSH !== true &&
    parsed.WEB_PUSH_PUBLIC_KEY !== undefined &&
    parsed.WEB_PUSH_PRIVATE_KEY !== undefined &&
    parsed.WEB_PUSH_SUBJECT !== undefined;
  const inngestDevFlag =
    parsed.INNGEST_DEV === undefined
      ? undefined
      : stringbool.safeParse(parsed.INNGEST_DEV);
  const inngestExplicitDevUrl =
    parsed.INNGEST_DEV !== undefined && inngestDevFlag?.success !== true
      ? new URL(parsed.INNGEST_DEV).href
      : undefined;
  const inngestDevMode =
    inngestExplicitDevUrl !== undefined ||
    inngestDevFlag?.data === true ||
    parsed.INNGEST_DEVSERVER_URL !== undefined;
  const inngestCloudMode =
    !inngestDevMode && parsed.INNGEST_EVENT_KEY !== undefined;
  const inngest: InngestConfig = inngestDevMode
    ? {
        baseUrl:
          inngestExplicitDevUrl ??
          parsed.INNGEST_DEVSERVER_URL ??
          parsed.INNGEST_BASE_URL ??
          LOCAL_INNGEST_DEV_SERVER_URL,
        eventKey: parsed.INNGEST_EVENT_KEY,
        mode: "dev",
        signingKey: parsed.INNGEST_SIGNING_KEY,
        signingKeyFallback: parsed.INNGEST_SIGNING_KEY_FALLBACK,
      }
    : inngestCloudMode
      ? {
          apiBaseUrl:
            parsed.INNGEST_API_BASE_URL ??
            parsed.INNGEST_BASE_URL ??
            INNGEST_CLOUD_API_BASE_URL,
          eventApiBaseUrl:
            parsed.INNGEST_EVENT_API_BASE_URL ??
            parsed.INNGEST_BASE_URL ??
            INNGEST_CLOUD_EVENT_BASE_URL,
          eventKey: parsed.INNGEST_EVENT_KEY as string,
          mode: "cloud",
          signingKey: parsed.INNGEST_SIGNING_KEY,
          signingKeyFallback: parsed.INNGEST_SIGNING_KEY_FALLBACK,
        }
      : { mode: "mock" };

  const services: Record<PaidService, ServiceConfig> = {
    anthropic: service(parsed.ANTHROPIC_API_KEY, parsed.MOCK_ANTHROPIC),
    odds: service(parsed.THE_ODDS_API_KEY, parsed.MOCK_ODDS),
    sportsdataio: service(
      parsed.SPORTSDATAIO_API_KEY,
      parsed.MOCK_SPORTSDATAIO,
    ),
    tavily: service(parsed.TAVILY_API_KEY, parsed.MOCK_TAVILY),
    voyage: service(parsed.VOYAGE_API_KEY, parsed.MOCK_VOYAGE),
    browserbase: service(parsed.BROWSERBASE_API_KEY, parsed.MOCK_BROWSERBASE),
  };
  const customModelCredentialEnvName = parsed.AI_CUSTOM_MODEL_API_KEY_VAR;
  const customModelCredential = customModelCredentialEnvName
    ? present[customModelCredentialEnvName]
    : parsed.AI_CUSTOM_MODEL_API_KEY;
  const customModelProvider: CustomModelProvider | undefined =
    parsed.AI_CUSTOM_MODEL_KIND !== undefined &&
    parsed.AI_CUSTOM_MODEL_BASE_URL !== undefined &&
    parsed.AI_CUSTOM_MODEL_ID !== undefined
      ? parsed.AI_CUSTOM_MODEL_KIND === "anthropic_compatible"
        ? {
            apiKey: customModelCredential as string,
            ...(customModelCredentialEnvName
              ? { apiKeyVar: customModelCredentialEnvName }
              : {}),
            baseUrl: parsed.AI_CUSTOM_MODEL_BASE_URL,
            key: "custom",
            kind: "anthropic_compatible",
            model: parsed.AI_CUSTOM_MODEL_ID,
          }
        : {
            ...(customModelCredential
              ? {
                  apiKey: customModelCredential,
                  ...(customModelCredentialEnvName
                    ? { apiKeyVar: customModelCredentialEnvName }
                    : {}),
                }
              : {}),
            baseUrl: parsed.AI_CUSTOM_MODEL_BASE_URL,
            key: "custom",
            kind: "openai_compatible",
            model: parsed.AI_CUSTOM_MODEL_ID,
          }
      : undefined;
  const modelRoute =
    modelRouteConfig ??
    defaultModelRouteConfig(
      parsed.ANTHROPIC_MODEL_TIER,
      parsed.AI_LLM_PROVIDER_KEY,
    );

  return {
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    espn: {
      swid: parsed.ESPN_SWID,
      s2: parsed.ESPN_S2,
      testLeagueId: parsed.ESPN_TEST_LEAGUE_ID,
      testSeason: parsed.ESPN_TEST_SEASON,
    },
    auth: {
      secret: parsed.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
      url: parsed.BETTER_AUTH_URL,
      google:
        googleClientId && googleClientSecret
          ? {
              mock: false,
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            }
          : { mock: true },
      yahoo:
        yahooClientId && yahooClientSecret
          ? {
              mock: false,
              clientId: yahooClientId,
              clientSecret: yahooClientSecret,
              redirectUri:
                parsed.YAHOO_REDIRECT_URI ??
                new URL(
                  "/api/onboarding/yahoo/callback",
                  parsed.BETTER_AUTH_URL,
                ).toString(),
              scope: parsed.YAHOO_OAUTH_SCOPE,
            }
          : { mock: true },
    },
    credentials: {
      encryptionKey:
        parsed.CREDENTIAL_ENCRYPTION_KEY ?? DEV_CREDENTIAL_ENCRYPTION_KEY,
    },
    realtime: realtimeIsReal
      ? {
          jwtSecret: parsed.SUPABASE_JWT_SECRET as string,
          mock: false,
          publishableKey: parsed.SUPABASE_PUBLISHABLE_KEY as string,
          serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY as string,
          url: parsed.SUPABASE_URL as string,
        }
      : { mock: true },
    jobs: {
      inngest,
    },
    entitlements: {
      devOverride:
        parsed.ENTITLEMENTS_DEV_OVERRIDE ??
        defaultEntitlementDevOverride(parsed.NODE_ENV),
      gateArenaAdvanced: parsed.ENTITLEMENTS_GATE_ARENA_ADVANCED ?? false,
      caps: {
        aiPostsPerWeek: parsed.ENTITLEMENTS_AI_POSTS_PER_WEEK,
        individualLeaguesCovered:
          parsed.ENTITLEMENTS_INDIVIDUAL_LEAGUES_COVERED,
        maxPremiumLeaguesPerUser:
          parsed.ENTITLEMENTS_MAX_PREMIUM_LEAGUES_PER_USER ??
          DEFAULT_ENTITLEMENT_CAPS.maxPremiumLeaguesPerUser,
      },
    },
    generalStats: { mock: true },
    ingestion: {
      pollPolicyConfig: ingestionPollPolicyConfig,
    },
    ai: {
      anthropicModelTier: parsed.ANTHROPIC_MODEL_TIER,
      customModelProvider,
      llmProviderKey: parsed.AI_LLM_PROVIDER_KEY,
      modelRoute,
      voyageEmbeddingModel: parsed.VOYAGE_EMBEDDING_MODEL,
    },
    news: {
      grounding: service(parsed.TAVILY_API_KEY, parsed.MOCK_TAVILY),
      rss: newsRss,
    },
    push: pushIsReal
      ? {
          mock: false,
          privateKey: parsed.WEB_PUSH_PRIVATE_KEY as string,
          publicKey: parsed.WEB_PUSH_PUBLIC_KEY as string,
          subject: parsed.WEB_PUSH_SUBJECT as string,
        }
      : {
          mock: true,
          publicKey: parsed.WEB_PUSH_PUBLIC_KEY ?? DEV_PUSH_PUBLIC_KEY,
        },
    spendGuard: {
      providers: {
        anthropic: {
          cap: parsed.SPEND_GUARD_ANTHROPIC_TOKENS,
          unit: "tokens",
        },
        odds: {
          cap: parsed.SPEND_GUARD_ODDS_REQUESTS,
          unit: "requests",
        },
        sportsdataio: {
          cap: parsed.SPEND_GUARD_SPORTSDATAIO_REQUESTS,
          unit: "requests",
        },
        tavily: {
          cap: parsed.SPEND_GUARD_TAVILY_REQUESTS,
          unit: "requests",
        },
        voyage: {
          cap: parsed.SPEND_GUARD_VOYAGE_REQUESTS,
          unit: "requests",
        },
      },
      window: parsed.SPEND_GUARD_WINDOW,
    },
    services,
  };
}
