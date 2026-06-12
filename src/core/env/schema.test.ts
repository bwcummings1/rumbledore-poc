import { describe, expect, it } from "vitest";
import {
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

  it("defaults auth to the dev secret, localhost URL, and a mocked Google provider", () => {
    const env = parseEnv({});
    expect(env.auth.secret).toBe(DEV_AUTH_SECRET);
    expect(env.auth.url).toBe("http://localhost:3000");
    expect(env.auth.google).toEqual({ mock: true });
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
