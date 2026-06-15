import { and, eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import type { Env } from "@/core/env/schema";
import { recordJobRun } from "@/core/metrics";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { leagues, members, providerCredentials } from "@/db/schema";
import { type HistoricalImportResult, importLeagueHistory } from "@/ingestion";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";
import { storedSleeperCredentialsSchema } from "@/onboarding/provider-service";
import {
  refreshStoredYahooCredentials,
  type YahooCredentialRefresher,
} from "@/onboarding/yahoo-refresh";
import {
  createMockYahooOAuthClient,
  createYahooOAuthClient,
} from "@/onboarding/yahoo-service";
import { createEspnDiscoveryProvider } from "@/providers/espn/client";
import type {
  FantasyProvider,
  FantasyProviderId,
  FantasyProviderSession,
  ProviderError,
  ProviderLeagueRef,
} from "@/providers/model";
import { createSleeperProvider } from "@/providers/sleeper/client";
import {
  createYahooProvider,
  yahooCredentialsSchema,
} from "@/providers/yahoo/client";
import { createRealtimePublisher, type RealtimePublisher } from "@/realtime";
import { recomputeLeagueStatistics } from "@/stats";
import { inngest } from "../client";
import { type ImportRequestedData, JOB_EVENTS } from "../events";

type ImportRequestedProvider = Pick<
  FantasyProvider<unknown, FantasyProviderSession>,
  "authenticate" | "capabilities" | "getHistory"
>;
type ImportableProviderId = Extract<
  FantasyProviderId,
  "espn" | "sleeper" | "yahoo"
>;
type ImportRequestedProviderRegistry = Partial<
  Record<ImportableProviderId, unknown>
>;

interface ImportRequestedDependencies {
  cipher: CredentialCipher;
  db: Db;
  providers: ImportRequestedProviderRegistry;
  recomputeStats?: typeof recomputeLeagueStatistics;
  now?: () => Date;
  realtime?: RealtimePublisher;
  yahooOAuthClient?: YahooCredentialRefresher;
}

export interface ImportRequestedResponse extends HistoricalImportResult {
  ok: true;
  eventName: typeof JOB_EVENTS.importRequested;
  stats: Awaited<ReturnType<typeof recomputeLeagueStatistics>>;
}

const storedEspnCredentialsSchema = z.object({
  espn_s2: z.string().min(1),
  swid: z.string().min(1),
});

const storedCredentialSchemas = {
  espn: storedEspnCredentialsSchema,
  sleeper: storedSleeperCredentialsSchema,
  yahoo: yahooCredentialsSchema,
} satisfies Record<ImportableProviderId, z.ZodType<unknown>>;

interface AuthenticatedProviderSession {
  credentials: unknown;
  refreshed: boolean;
  session: FantasyProviderSession;
}

const importRequestedDataSchema = z.object({
  credentialId: z.uuid(),
  leagueId: z.uuid(),
  provider: z.enum(["espn", "sleeper", "yahoo"]),
  providerLeagueId: z.string().trim().min(1),
  season: z.number().int().min(2000).max(2100),
  sport: z.enum(["ffl", "unknown"]),
  name: z.string().trim().min(1),
  teamName: z.string().trim().min(1).optional(),
  size: z.number().int().positive().optional(),
  seasons: z
    .array(z.number().int().min(2000).max(2100))
    .min(1)
    .max(10)
    .optional(),
  maxSeasons: z.number().int().min(1).max(10).optional(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function importJobError({
  code,
  message,
  status,
  cause,
}: {
  code: string;
  message: string;
  status: number;
  cause?: unknown;
}) {
  return new AppError({ cause, code, message, status });
}

function parseImportRequestedData(data: unknown): ImportRequestedData {
  const parsed = importRequestedDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      importJobError({
        cause: parsed.error,
        code: "IMPORT_REQUEST_INVALID",
        message: "Historical import request payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

function toProviderRef(data: ImportRequestedData): ProviderLeagueRef {
  return {
    name: data.name,
    provider: data.provider,
    providerId: data.providerLeagueId,
    season: data.season,
    sport: data.sport,
    ...(data.teamName ? { teamName: data.teamName } : {}),
    ...(data.size === undefined ? {} : { size: data.size }),
  };
}

function now(deps: Pick<ImportRequestedDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function resolveProvider(
  data: ImportRequestedData,
  deps: ImportRequestedDependencies,
): ImportRequestedProvider {
  const provider = deps.providers[data.provider];
  if (!provider) {
    throw toNonRetriable(
      importJobError({
        code: "IMPORT_PROVIDER_UNSUPPORTED",
        message: "Historical import provider is not supported",
        status: 400,
      }),
    );
  }

  return provider as ImportRequestedProvider;
}

async function loadCredentialsForImport({
  data,
  deps,
}: {
  data: ImportRequestedData;
  deps: ImportRequestedDependencies;
}): Promise<unknown> {
  const [row] = await deps.db
    .select({
      encryptedPayload: providerCredentials.encryptedPayload,
      status: providerCredentials.status,
    })
    .from(providerCredentials)
    .innerJoin(
      members,
      and(
        eq(members.userId, providerCredentials.userId),
        eq(members.organizationId, data.leagueId),
      ),
    )
    .innerJoin(leagues, eq(leagues.id, members.organizationId))
    .where(
      and(
        eq(providerCredentials.id, data.credentialId),
        eq(providerCredentials.provider, data.provider),
        eq(leagues.id, data.leagueId),
        eq(leagues.provider, data.provider),
        eq(leagues.providerLeagueId, data.providerLeagueId),
      ),
    )
    .limit(1);

  if (!row) {
    throw toNonRetriable(
      importJobError({
        code: "IMPORT_REQUEST_NOT_AUTHORIZED",
        message:
          "Historical import credential is not authorized for this league",
        status: 403,
      }),
    );
  }

  switch (row.status) {
    case "connected":
      break;
    default:
      throw toNonRetriable(
        importJobError({
          code: "IMPORT_CREDENTIAL_NOT_CONNECTED",
          message: "Provider credential is not connected",
          status: 409,
        }),
      );
  }

  try {
    return storedCredentialSchemas[data.provider].parse(
      deps.cipher.decryptJson(row.encryptedPayload),
    );
  } catch (cause) {
    throw toNonRetriable(
      importJobError({
        cause,
        code: "IMPORT_CREDENTIAL_DECRYPT_FAILED",
        message: "Provider credential could not be read",
        status: 500,
      }),
    );
  }
}

async function markCredentialInvalid({
  credentialId,
  deps,
}: {
  credentialId: string;
  deps: ImportRequestedDependencies;
}) {
  await deps.db
    .update(providerCredentials)
    .set({
      invalidAt: now(deps),
      status: "invalid",
      updatedAt: new Date(),
    })
    .where(eq(providerCredentials.id, credentialId));
}

function shouldStopRetries(error: ProviderError): boolean {
  return error.code === "PROVIDER_AUTH_EXPIRED";
}

function isYahooProvider(provider: ImportableProviderId): boolean {
  switch (provider) {
    case "yahoo":
      return true;
    case "espn":
    case "sleeper":
      return false;
  }
}

function throwProviderError(error: ProviderError): never {
  if (shouldStopRetries(error)) {
    throw toNonRetriable(error);
  }

  throw error;
}

function createYahooOAuthClientForEnv(env: Pick<Env, "auth">) {
  const redirectUri = env.auth.yahoo.mock
    ? new URL("/api/onboarding/yahoo/callback", env.auth.url).toString()
    : env.auth.yahoo.redirectUri;
  return env.auth.yahoo.mock
    ? createMockYahooOAuthClient({ redirectUri })
    : createYahooOAuthClient({
        clientId: env.auth.yahoo.clientId,
        clientSecret: env.auth.yahoo.clientSecret,
        redirectUri,
        scope: env.auth.yahoo.scope,
      });
}

async function authenticateWithYahooRefresh({
  credentialId,
  credentials,
  deps,
  provider,
  providerId,
}: {
  credentialId: string;
  credentials: unknown;
  deps: Pick<
    ImportRequestedDependencies,
    "cipher" | "db" | "now" | "yahooOAuthClient"
  >;
  provider: Pick<
    FantasyProvider<unknown, FantasyProviderSession>,
    "authenticate"
  >;
  providerId: ImportableProviderId;
}): Promise<Result<AuthenticatedProviderSession, ProviderError>> {
  const session = await provider.authenticate(credentials);
  if (session.ok) {
    return ok({ credentials, refreshed: false, session: session.value });
  }
  if (!isYahooProvider(providerId) || !shouldStopRetries(session.error)) {
    return err(session.error);
  }

  const refreshed = await refreshStoredYahooCredentials({
    credentialId,
    credentials,
    deps,
  });
  if (!refreshed.ok) {
    return err(refreshed.error);
  }

  const retry = await provider.authenticate(refreshed.value);
  if (!retry.ok) {
    return err(retry.error);
  }

  return ok({
    credentials: refreshed.value,
    refreshed: true,
    session: retry.value,
  });
}

async function getDefaultImportRequestedDependencies(): Promise<ImportRequestedDependencies> {
  const [{ getEnv }, { getDb }] = await Promise.all([
    import("@/core/env"),
    import("@/db"),
  ]);
  const env = getEnv();

  return {
    cipher: createCredentialCipher(env.credentials.encryptionKey),
    db: getDb(),
    providers: {
      espn: createEspnDiscoveryProvider(),
      sleeper: createSleeperProvider(),
      yahoo: createYahooProvider(),
    },
    realtime: createRealtimePublisher(env),
    yahooOAuthClient: createYahooOAuthClientForEnv(env),
  };
}

export async function runImportRequested({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: ImportRequestedDependencies;
}): Promise<ImportRequestedResponse> {
  const data = parseImportRequestedData(rawData);
  const provider = resolveProvider(data, deps);
  const credentials = await loadCredentialsForImport({ data, deps });
  let auth = await authenticateWithYahooRefresh({
    credentialId: data.credentialId,
    credentials,
    deps,
    provider,
    providerId: data.provider,
  });

  if (!auth.ok) {
    if (shouldStopRetries(auth.error)) {
      await markCredentialInvalid({ credentialId: data.credentialId, deps });
    }
    throwProviderError(auth.error);
  }

  let history = await importLeagueHistory({
    db: deps.db,
    maxSeasons: data.maxSeasons,
    now: deps.now,
    provider,
    ref: toProviderRef(data),
    realtime: deps.realtime,
    seasons: data.seasons,
    session: auth.value.session,
  });
  if (
    !history.ok &&
    shouldStopRetries(history.error) &&
    isYahooProvider(data.provider) &&
    !auth.value.refreshed
  ) {
    const refreshed = await refreshStoredYahooCredentials({
      credentialId: data.credentialId,
      credentials: auth.value.credentials,
      deps,
    });
    if (refreshed.ok) {
      const retryAuth = await provider.authenticate(refreshed.value);
      if (retryAuth.ok) {
        auth = ok({
          credentials: refreshed.value,
          refreshed: true,
          session: retryAuth.value,
        });
        history = await importLeagueHistory({
          db: deps.db,
          maxSeasons: data.maxSeasons,
          now: deps.now,
          provider,
          ref: toProviderRef(data),
          realtime: deps.realtime,
          seasons: data.seasons,
          session: auth.value.session,
        });
      } else {
        history = err(retryAuth.error);
      }
    } else {
      history = err(refreshed.error);
    }
  }

  if (!history.ok) {
    if (shouldStopRetries(history.error)) {
      await markCredentialInvalid({ credentialId: data.credentialId, deps });
    }
    throwProviderError(history.error);
  }

  const stats = await (deps.recomputeStats ?? recomputeLeagueStatistics)(
    deps.db,
    { leagueId: data.leagueId },
  );

  return {
    ok: true,
    eventName: JOB_EVENTS.importRequested,
    stats,
    ...history.value,
  };
}

export function createImportRequestedFunction(
  resolveDeps: () =>
    | ImportRequestedDependencies
    | Promise<ImportRequestedDependencies> = getDefaultImportRequestedDependencies,
) {
  return inngest.createFunction(
    {
      id: "import-requested",
      name: "Historical import requested",
      description:
        "Runs a resumable historical fantasy import from stored provider credentials.",
      triggers: [{ event: JOB_EVENTS.importRequested }],
      idempotency:
        "event.data.leagueId + ':' + event.data.provider + ':' + event.data.providerLeagueId",
    },
    async ({ event, step }): Promise<ImportRequestedResponse> =>
      recordJobRun("import-requested", async () => {
        const deps = await resolveDeps();
        return step.run("run-historical-import", () =>
          runImportRequested({ data: event.data, deps }),
        );
      }),
  );
}

export const importRequested = createImportRequestedFunction();
