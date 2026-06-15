import { Buffer } from "node:buffer";
import { z } from "zod";
import { err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import {
  AuthExpiredError,
  ProviderBlockedError,
  type ProviderError,
  ProviderParseError,
  RateLimitedError,
} from "@/providers/model";
import {
  type YahooCredentials,
  type YahooProvider,
  yahooCredentialsSchema,
} from "@/providers/yahoo/client";
import type { RealtimePublisher } from "@/realtime";
import type { CredentialCipher } from "./credential-crypto";
import {
  FIXTURE_YAHOO_ACCESS_TOKEN,
  FIXTURE_YAHOO_REFRESH_TOKEN,
} from "./fixture-yahoo";
import {
  connectProviderWithCredentials,
  type DiscoveredLeague,
  type DiscoveredLeagueImportCandidate,
  importDiscoveredLeague,
  listDiscoveredLeagues,
  OnboardingError,
  type ProviderConnectResult,
  type ProviderImportResult,
  type ProviderOnboardingDependencies,
  type ProviderOnboardingError,
  type RequestHistoricalImport,
} from "./provider-service";

const YAHOO_PROVIDER_ID = "yahoo";
const YAHOO_AUTHORIZE_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const YAHOO_OAUTH_EXCHANGE_URL = "https://api.login.yahoo.com/oauth2/get_token";
const YAHOO_DEFAULT_LANGUAGE = "en-us";
const TOKEN_EXPIRY_SAFETY_SECONDS = 60;
export const YAHOO_OAUTH_STATE_COOKIE = "rumbledore_yahoo_oauth_state";

const yahooOAuthTokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  expires_in: z.coerce.number().int().positive().optional(),
  refresh_token: z.string().trim().min(1).optional(),
  scope: z.string().trim().min(1).optional(),
  token_type: z.string().trim().min(1).default("Bearer"),
});

export type YahooDiscoveredLeague = DiscoveredLeague & { provider: "yahoo" };
export type YahooConnectResult = ProviderConnectResult;
export type YahooDiscoveredLeagueImportCandidate =
  DiscoveredLeagueImportCandidate & { provider: "yahoo" };
export type YahooImportResult = ProviderImportResult;

export interface YahooOAuthClient {
  authorizationUrl(input: { state: string }): string;
  exchangeCode(input: { code: string }): Promise<YahooCredentials>;
  refreshCredentials(input: {
    credentials: YahooCredentials;
  }): Promise<Result<YahooCredentials, ProviderError>>;
}

export interface YahooOnboardingDependencies {
  cipher: CredentialCipher;
  db: Db;
  now?: () => Date;
  oauthClient: YahooOAuthClient;
  provider: YahooProvider;
  realtime?: RealtimePublisher;
  requestHistoricalImport?: RequestHistoricalImport;
}

export interface YahooOAuthClientOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => Date;
  redirectUri: string;
  scope: string;
}

function providerDeps(
  deps: YahooOnboardingDependencies,
): ProviderOnboardingDependencies {
  return {
    cipher: deps.cipher,
    db: deps.db,
    now: deps.now,
    providers: { yahoo: deps.provider },
    realtime: deps.realtime,
    requestHistoricalImport: deps.requestHistoricalImport,
    yahooOAuthClient: deps.oauthClient,
  };
}

function tokenExpiresAt(expiresIn: number | undefined, now: Date) {
  if (!expiresIn || expiresIn <= TOKEN_EXPIRY_SAFETY_SECONDS) {
    return undefined;
  }
  return new Date(
    now.getTime() + (expiresIn - TOKEN_EXPIRY_SAFETY_SECONDS) * 1000,
  ).toISOString();
}

function yahooTokenErrorForStatus(response: Response): ProviderError {
  if (
    response.status === 400 ||
    response.status === 401 ||
    response.status === 403
  ) {
    return new AuthExpiredError(YAHOO_PROVIDER_ID);
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new RateLimitedError(
      YAHOO_PROVIDER_ID,
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined,
    );
  }
  if (response.status >= 500) {
    return new ProviderBlockedError(YAHOO_PROVIDER_ID);
  }
  return new ProviderParseError(
    YAHOO_PROVIDER_ID,
    `Yahoo OAuth token endpoint returned HTTP ${response.status}`,
  );
}

function credentialsFromTokenResponse({
  existing,
  now,
  token,
}: {
  existing?: YahooCredentials;
  now: Date;
  token: z.infer<typeof yahooOAuthTokenResponseSchema>;
}): YahooCredentials {
  const expiresAt = tokenExpiresAt(token.expires_in, now);
  return {
    ...existing,
    accessToken: token.access_token,
    ...(expiresAt ? { expiresAt } : {}),
    ...(token.refresh_token || existing?.refreshToken
      ? { refreshToken: token.refresh_token ?? existing?.refreshToken }
      : {}),
    ...(token.scope ? { scope: token.scope } : {}),
    tokenType: token.token_type,
  };
}

export function createYahooOAuthClient({
  clientId,
  clientSecret,
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
  now = () => new Date(),
  redirectUri,
  scope,
}: YahooOAuthClientOptions): YahooOAuthClient {
  return {
    authorizationUrl({ state }) {
      const url = new URL(YAHOO_AUTHORIZE_URL);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("language", YAHOO_DEFAULT_LANGUAGE);
      url.searchParams.set("state", state);
      url.searchParams.set("scope", scope);
      return url.toString();
    },

    async exchangeCode({ code }) {
      const body = new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const response = await fetchImpl(YAHOO_OAUTH_EXCHANGE_URL, {
        body,
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${clientId}:${clientSecret}`,
          ).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new OnboardingError({
          code: "YAHOO_OAUTH_TOKEN_EXCHANGE_FAILED",
          message: "Yahoo authorization could not be completed",
          status:
            response.status === 400 || response.status === 401 ? 401 : 502,
        });
      }

      const parsed = yahooOAuthTokenResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        throw new OnboardingError({
          cause: parsed.error,
          code: "YAHOO_OAUTH_TOKEN_PARSE_FAILED",
          message: "Yahoo authorization returned an invalid token response",
          status: 502,
        });
      }

      return credentialsFromTokenResponse({
        now: now(),
        token: parsed.data,
      });
    },

    async refreshCredentials({ credentials }) {
      const parsedCredentials = yahooCredentialsSchema.safeParse(credentials);
      if (!parsedCredentials.success || !parsedCredentials.data.refreshToken) {
        return err(new AuthExpiredError(YAHOO_PROVIDER_ID));
      }

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        redirect_uri: redirectUri,
        refresh_token: parsedCredentials.data.refreshToken,
      });

      let response: Response;
      try {
        response = await fetchImpl(YAHOO_OAUTH_EXCHANGE_URL, {
          body,
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${clientId}:${clientSecret}`,
            ).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        });
      } catch (cause) {
        return err(new ProviderBlockedError(YAHOO_PROVIDER_ID, cause));
      }

      if (!response.ok) {
        return err(yahooTokenErrorForStatus(response));
      }

      const parsed = yahooOAuthTokenResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        return err(
          new ProviderParseError(
            YAHOO_PROVIDER_ID,
            "Yahoo authorization returned an invalid token response",
            parsed.error,
          ),
        );
      }

      return ok(
        credentialsFromTokenResponse({
          existing: parsedCredentials.data,
          now: now(),
          token: parsed.data,
        }),
      );
    },
  };
}

export function createMockYahooOAuthClient({
  currentLeagueKey = "461.l.95050",
  previousLeagueKey = "449.l.95050",
  redirectUri,
}: {
  currentLeagueKey?: string;
  previousLeagueKey?: string;
  redirectUri: string;
}): YahooOAuthClient {
  return {
    authorizationUrl({ state }) {
      const url = new URL(redirectUri);
      url.searchParams.set("code", "mock-yahoo-code");
      url.searchParams.set("state", state);
      return url.toString();
    },

    async exchangeCode() {
      return {
        accessToken: FIXTURE_YAHOO_ACCESS_TOKEN,
        expiresAt: "2030-01-01T00:00:00.000Z",
        historicalLeagueKeysByLeagueKey: {
          [currentLeagueKey]: [previousLeagueKey],
        },
        leagueKeys: [previousLeagueKey],
        refreshToken: FIXTURE_YAHOO_REFRESH_TOKEN,
        tokenType: "Bearer",
      };
    },

    async refreshCredentials({ credentials }) {
      const parsed = yahooCredentialsSchema.safeParse(credentials);
      if (!parsed.success || !parsed.data.refreshToken) {
        return err(new AuthExpiredError(YAHOO_PROVIDER_ID));
      }
      return ok({
        ...parsed.data,
        accessToken: `${FIXTURE_YAHOO_ACCESS_TOKEN}-refreshed`,
        expiresAt: "2030-01-01T00:00:00.000Z",
        refreshToken: `${FIXTURE_YAHOO_REFRESH_TOKEN}-refreshed`,
        tokenType: parsed.data.tokenType,
      });
    },
  };
}

export async function connectYahooOAuth(
  deps: YahooOnboardingDependencies,
  input: {
    code: string;
    userId: string;
  },
): Promise<Result<YahooConnectResult, ProviderOnboardingError>> {
  let credentials: YahooCredentials;
  try {
    credentials = await deps.oauthClient.exchangeCode({ code: input.code });
  } catch (cause) {
    return err(
      cause instanceof OnboardingError
        ? cause
        : new OnboardingError({
            cause,
            code: "YAHOO_OAUTH_TOKEN_EXCHANGE_FAILED",
            message: "Yahoo authorization could not be completed",
            status: 502,
          }),
    );
  }

  const parsed = yahooCredentialsSchema.safeParse(credentials);
  if (!parsed.success) {
    return err(
      new OnboardingError({
        cause: parsed.error,
        code: "ONBOARDING_INVALID_OAUTH_CREDENTIALS",
        message: "Yahoo returned invalid OAuth credentials",
        status: 502,
      }),
    );
  }

  return connectProviderWithCredentials({
    credentials: parsed.data,
    deps: providerDeps(deps),
    flow: "oauth",
    provider: YAHOO_PROVIDER_ID,
    userId: input.userId,
  });
}

export function startYahooOAuth(
  deps: YahooOnboardingDependencies,
  input: { state: string },
): Result<{ authorizationUrl: string }, OnboardingError> {
  return {
    ok: true,
    value: {
      authorizationUrl: deps.oauthClient.authorizationUrl(input),
    },
  };
}

export async function listYahooDiscoveredLeagues(
  deps: Pick<YahooOnboardingDependencies, "db">,
  input: { userId: string },
): Promise<Result<YahooDiscoveredLeagueImportCandidate[], OnboardingError>> {
  const result = await listDiscoveredLeagues(deps, {
    provider: YAHOO_PROVIDER_ID,
    userId: input.userId,
  });

  return result as Result<
    YahooDiscoveredLeagueImportCandidate[],
    OnboardingError
  >;
}

export async function importYahooDiscoveredLeague(
  deps: YahooOnboardingDependencies,
  input: {
    providerLeagueId: string;
    season: number;
    userId: string;
  },
): Promise<Result<YahooImportResult, ProviderOnboardingError>> {
  return importDiscoveredLeague(providerDeps(deps), {
    provider: YAHOO_PROVIDER_ID,
    providerLeagueId: input.providerLeagueId,
    season: input.season,
    userId: input.userId,
  });
}
