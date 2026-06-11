import { z } from "zod";
import { err, ok } from "@/core/result";
import {
  AuthExpiredError,
  type FantasyProvider,
  type FantasyProviderCapabilities,
  type FantasyProviderSession,
  ProviderBlockedError,
  type ProviderLeagueRef,
  ProviderNotFoundError,
  ProviderParseError,
  type ProviderResult,
  RateLimitedError,
} from "../model";

export interface EspnCookieCredentials {
  swid: string;
  espn_s2: string;
}

export interface EspnSession extends FantasyProviderSession {
  provider: "espn";
  authKind: "cookie";
  subjectProviderId: string;
  swid: string;
  espn_s2: string;
}

export type EspnFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface EspnDiscoveryClientOptions {
  fetch?: EspnFetch;
  maxAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export type EspnDiscoveryProvider = Pick<
  FantasyProvider<EspnCookieCredentials, EspnSession>,
  "authenticate" | "capabilities" | "discoverLeagues" | "id" | "name"
>;

const ESPN_PROVIDER_ID = "espn";
const FAN_API_ORIGIN = "https://fan.api.espn.com";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 10_000;
const ESPN_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const BRACED_SWID = /^\{[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}$/;
const UNBRACED_SWID = /^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/;

export const ESPN_PROVIDER_CAPABILITIES: FantasyProviderCapabilities = {
  authKind: "cookie",
  requiresOAuth: false,
  supportsHistory: true,
  supportsRosters: true,
  supportsTransactions: true,
};

const numericValue = z.union([z.number(), z.string()]);

const fanLeagueGroupSchema = z
  .object({
    groupId: numericValue,
    groupName: z.string().optional(),
    groupSize: numericValue.optional(),
  })
  .passthrough();

const fanEntrySchema = z
  .object({
    abbrev: z.string().optional(),
    entryMetadata: z
      .object({
        teamName: z.string().optional(),
      })
      .passthrough()
      .optional(),
    gameId: numericValue.optional(),
    groups: z.array(fanLeagueGroupSchema).optional(),
    name: z.string().optional(),
    seasonId: numericValue.optional(),
  })
  .passthrough();

const fanPreferenceSchema = z
  .object({
    metaData: z
      .object({
        entry: fanEntrySchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const fanApiResponseSchema = z
  .object({
    id: z.string().optional(),
    preferences: z.array(fanPreferenceSchema).optional(),
  })
  .passthrough();

type EspnFanApiResponse = z.infer<typeof fanApiResponseSchema>;
type NormalizedEspnCookies = Pick<EspnSession, "espn_s2" | "swid">;

function normalizeSwid(value: string): string | undefined {
  const trimmed = value.trim();
  if (BRACED_SWID.test(trimmed)) {
    return trimmed;
  }
  if (UNBRACED_SWID.test(trimmed)) {
    return `{${trimmed}}`;
  }
  return undefined;
}

function normalizeCredentials(
  credentials: EspnCookieCredentials,
): ProviderResult<NormalizedEspnCookies> {
  const swid = normalizeSwid(credentials.swid);
  const espnS2 = credentials.espn_s2.trim();

  if (!swid || !espnS2) {
    return err(new AuthExpiredError(ESPN_PROVIDER_ID));
  }

  return ok({ swid, espn_s2: espnS2 });
}

function toInteger(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : undefined;
  }
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function isFflEntry(entry: z.infer<typeof fanEntrySchema>): boolean {
  const gameId = toInteger(entry.gameId);
  return gameId === 1 || entry.abbrev?.toLowerCase() === "ffl";
}

function normalizeFanLeagues(fan: EspnFanApiResponse): ProviderLeagueRef[] {
  const leaguesByKey = new Map<string, ProviderLeagueRef>();

  for (const preference of fan.preferences ?? []) {
    const entry = preference.metaData?.entry;
    const season = toInteger(entry?.seasonId);
    if (!entry || !season || !isFflEntry(entry)) {
      continue;
    }

    for (const group of entry.groups ?? []) {
      const groupId = toInteger(group.groupId);
      if (!groupId) {
        continue;
      }

      const providerId = String(groupId);
      const key = `${season}:${providerId}`;
      leaguesByKey.set(key, {
        provider: ESPN_PROVIDER_ID,
        providerId,
        season,
        sport: "ffl",
        name: group.groupName ?? entry.name ?? `ESPN Fantasy League ${groupId}`,
        size: toInteger(group.groupSize),
        teamName: entry.entryMetadata?.teamName,
      });
    }
  }

  return [...leaguesByKey.values()].sort(
    (a, b) => b.season - a.season || a.name.localeCompare(b.name),
  );
}

function fanApiUrl(swid: string): string {
  return new URL(
    `/apis/v2/fans/${encodeURIComponent(swid)}`,
    FAN_API_ORIGIN,
  ).toString();
}

function espnHeaders(session: Pick<EspnSession, "espn_s2" | "swid">) {
  return {
    Accept: "application/json",
    Cookie: `SWID=${session.swid}; espn_s2=${session.espn_s2}`,
    "User-Agent": ESPN_USER_AGENT,
    "x-fantasy-source": "kona",
    "x-fantasy-platform": "kona",
    "X-Personalization-Source": "ESPN.com - FAM",
  };
}

function shouldRetry(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
}

function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) {
    return undefined;
  }

  const parsed = Number(header);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function errorForStatus(response: Response) {
  if (response.status === 401) {
    return new AuthExpiredError(ESPN_PROVIDER_ID);
  }
  if (response.status === 404) {
    return new ProviderNotFoundError(ESPN_PROVIDER_ID, {
      resource: "fan",
    });
  }
  if (response.status === 429) {
    return new RateLimitedError(ESPN_PROVIDER_ID, retryAfterSeconds(response));
  }
  if (response.status === 403 || response.status >= 500) {
    return new ProviderBlockedError(ESPN_PROVIDER_ID);
  }
  return new ProviderParseError(
    ESPN_PROVIDER_ID,
    `ESPN Fan API returned HTTP ${response.status}`,
  );
}

function createSession(
  cookies: NormalizedEspnCookies,
  fan: EspnFanApiResponse,
): EspnSession {
  return {
    provider: ESPN_PROVIDER_ID,
    authKind: "cookie",
    subjectProviderId: fan.id?.trim() || cookies.swid,
    swid: cookies.swid,
    espn_s2: cookies.espn_s2,
  };
}

export class EspnDiscoveryClient {
  private readonly fetchImpl: EspnFetch;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(options: EspnDiscoveryClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.retryDelayMs = Math.max(
      0,
      options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    );
    this.timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async authenticate(
    credentials: EspnCookieCredentials,
  ): Promise<ProviderResult<EspnSession>> {
    const cookies = normalizeCredentials(credentials);
    if (!cookies.ok) {
      return cookies;
    }

    const fan = await this.fetchFanApi(cookies.value);
    if (!fan.ok) {
      return fan;
    }

    return ok(createSession(cookies.value, fan.value));
  }

  async discoverLeagues(
    session: EspnSession,
  ): Promise<ProviderResult<ProviderLeagueRef[]>> {
    const fan = await this.fetchFanApi(session);
    if (!fan.ok) {
      return fan;
    }

    return ok(normalizeFanLeagues(fan.value));
  }

  private async fetchFanApi(
    session: Pick<EspnSession, "espn_s2" | "swid">,
  ): Promise<ProviderResult<EspnFanApiResponse>> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(fanApiUrl(session.swid), {
          cache: "no-store",
          headers: espnHeaders(session),
          method: "GET",
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) {
          return await parseFanApiResponse(response);
        }

        const providerError = errorForStatus(response);
        if (!shouldRetry(response.status) || attempt >= this.maxAttempts) {
          return err(providerError);
        }
      } catch (cause) {
        if (attempt >= this.maxAttempts) {
          return err(new ProviderBlockedError(ESPN_PROVIDER_ID, cause));
        }
      }

      await this.waitBeforeRetry(attempt);
    }

    return err(new ProviderBlockedError(ESPN_PROVIDER_ID));
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    if (!this.retryDelayMs) {
      return;
    }

    const delayMs = this.retryDelayMs * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function parseFanApiResponse(
  response: Response,
): Promise<ProviderResult<EspnFanApiResponse>> {
  try {
    const json = (await response.json()) as unknown;
    const parsed = fanApiResponseSchema.safeParse(json);
    if (!parsed.success) {
      return err(
        new ProviderParseError(
          ESPN_PROVIDER_ID,
          "ESPN Fan API returned an unexpected shape",
          parsed.error,
        ),
      );
    }
    return ok(parsed.data);
  } catch (cause) {
    return err(
      new ProviderParseError(
        ESPN_PROVIDER_ID,
        "ESPN Fan API response was not valid JSON",
        cause,
      ),
    );
  }
}

export function createEspnDiscoveryClient(
  options?: EspnDiscoveryClientOptions,
): EspnDiscoveryClient {
  return new EspnDiscoveryClient(options);
}

export function createEspnDiscoveryProvider(
  options?: EspnDiscoveryClientOptions,
): EspnDiscoveryProvider {
  const client = createEspnDiscoveryClient(options);
  return {
    id: ESPN_PROVIDER_ID,
    name: "ESPN Fantasy Football",
    capabilities: ESPN_PROVIDER_CAPABILITIES,
    authenticate: (credentials) => client.authenticate(credentials),
    discoverLeagues: (session) => client.discoverLeagues(session),
  };
}
