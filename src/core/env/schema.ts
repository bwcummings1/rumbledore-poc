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

export const PAID_SERVICES = [
  "anthropic",
  "odds",
  "sportsdataio",
  "tavily",
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

  ANTHROPIC_API_KEY: secret.optional(),
  THE_ODDS_API_KEY: secret.optional(),
  SPORTSDATAIO_API_KEY: secret.optional(),
  TAVILY_API_KEY: secret.optional(),
  BROWSERBASE_API_KEY: secret.optional(),

  MOCK_ANTHROPIC: stringbool.optional(),
  MOCK_ODDS: stringbool.optional(),
  MOCK_SPORTSDATAIO: stringbool.optional(),
  MOCK_TAVILY: stringbool.optional(),
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
    services: {
      anthropic: service(parsed.ANTHROPIC_API_KEY, parsed.MOCK_ANTHROPIC),
      odds: service(parsed.THE_ODDS_API_KEY, parsed.MOCK_ODDS),
      sportsdataio: service(
        parsed.SPORTSDATAIO_API_KEY,
        parsed.MOCK_SPORTSDATAIO,
      ),
      tavily: service(parsed.TAVILY_API_KEY, parsed.MOCK_TAVILY),
      browserbase: service(parsed.BROWSERBASE_API_KEY, parsed.MOCK_BROWSERBASE),
    },
  };
}
