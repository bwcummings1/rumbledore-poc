import { describe, expect, it } from "vitest";
import {
  DEV_AUTH_SECRET,
  DEV_CREDENTIAL_ENCRYPTION_KEY,
  LOCAL_DATABASE_URL,
  LOCAL_REDIS_URL,
  parseEnv,
} from "./schema";

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

  it("treats empty and whitespace-only values as unset", () => {
    const env = parseEnv({
      ANTHROPIC_API_KEY: "",
      TAVILY_API_KEY: "   ",
      DATABASE_URL: "",
    });
    expect(env.services.anthropic).toEqual({ mock: true });
    expect(env.services.tavily).toEqual({ mock: true });
    expect(env.databaseUrl).toBe(LOCAL_DATABASE_URL);
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
        REDIS_URL: "nope",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("TAVILY_API_KEY");
    expect(message).toContain("VOYAGE_API_KEY");
    expect(message).toContain("BROWSERBASE_API_KEY");
    expect(message).toContain("REDIS_URL");
  });
});
