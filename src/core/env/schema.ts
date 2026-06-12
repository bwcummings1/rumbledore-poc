import { z } from "zod";

// Dev defaults match docker-compose.yml (host ports 5440/6390 — 5432/6379 are taken on the shared box).
export const LOCAL_DATABASE_URL =
  "postgres://rumbledore:rumbledore@localhost:5440/rumbledore";
export const LOCAL_REDIS_URL = "redis://localhost:6390";

/**
 * Paid integrations default to mocks so the app runs with only local Postgres/Redis.
 * Effective mode per service:
 *   - MOCK_<X>=true        → mock, even if a key is set
 *   - MOCK_<X>=false       → real; missing key is a validation error
 *   - MOCK_<X> unset       → real iff the key is set, otherwise mock
 */
export type ServiceConfig = { mock: true } | { mock: false; apiKey: string };

/**
 * Google OAuth is the social-login stub (spec 02 §8): with no creds Better
 * Auth gets placeholder values so the provider routes exist; real creds drop
 * in via env with no code change. Both vars must be set together.
 */
export type GoogleOAuthConfig =
  | { mock: true }
  | { mock: false; clientId: string; clientSecret: string };

export type RealtimeConfig =
  | { mock: true }
  | {
      mock: false;
      jwtSecret: string;
      publishableKey: string;
      serviceRoleKey: string;
      url: string;
    };

// Dev-only fallback so the app boots with zero config; production requires BETTER_AUTH_SECRET.
export const DEV_AUTH_SECRET = "rumbledore-dev-only-secret"; // ubs:ignore — not a credential, dev placeholder rejected in production
export const DEV_CREDENTIAL_ENCRYPTION_KEY =
  "rumbledore-dev-only-credential-key-32chars"; // ubs:ignore — not a credential, dev placeholder rejected in production

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
  CREDENTIAL_ENCRYPTION_KEY: secret.optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: secret.optional(),
  SUPABASE_SERVICE_ROLE_KEY: secret.optional(),
  SUPABASE_JWT_SECRET: secret.optional(),
  MOCK_REALTIME: stringbool.optional(),

  ANTHROPIC_API_KEY: secret.optional(),
  THE_ODDS_API_KEY: secret.optional(),
  SPORTSDATAIO_API_KEY: secret.optional(),
  TAVILY_API_KEY: secret.optional(),
  VOYAGE_API_KEY: secret.optional(),
  BROWSERBASE_API_KEY: secret.optional(),

  MOCK_ANTHROPIC: stringbool.optional(),
  MOCK_ODDS: stringbool.optional(),
  MOCK_SPORTSDATAIO: stringbool.optional(),
  MOCK_TAVILY: stringbool.optional(),
  MOCK_VOYAGE: stringbool.optional(),
  MOCK_BROWSERBASE: stringbool.optional(),
});

type RawEnv = z.infer<typeof baseSchema>;

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
  };
  credentials: {
    encryptionKey: string;
  };
  realtime: RealtimeConfig;
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

  // Presence checks, not secret-value comparisons (empty strings were
  // already filtered out above, so truthiness == presence here).
  const googleClientId = parsed.GOOGLE_CLIENT_ID;
  const googleClientSecret = parsed.GOOGLE_CLIENT_SECRET;
  const realtimeIsReal =
    parsed.MOCK_REALTIME !== true &&
    parsed.SUPABASE_URL !== undefined &&
    parsed.SUPABASE_PUBLISHABLE_KEY !== undefined &&
    parsed.SUPABASE_JWT_SECRET !== undefined &&
    parsed.SUPABASE_SERVICE_ROLE_KEY !== undefined;

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
    services: {
      anthropic: service(parsed.ANTHROPIC_API_KEY, parsed.MOCK_ANTHROPIC),
      odds: service(parsed.THE_ODDS_API_KEY, parsed.MOCK_ODDS),
      sportsdataio: service(
        parsed.SPORTSDATAIO_API_KEY,
        parsed.MOCK_SPORTSDATAIO,
      ),
      tavily: service(parsed.TAVILY_API_KEY, parsed.MOCK_TAVILY),
      voyage: service(parsed.VOYAGE_API_KEY, parsed.MOCK_VOYAGE),
      browserbase: service(parsed.BROWSERBASE_API_KEY, parsed.MOCK_BROWSERBASE),
    },
  };
}
