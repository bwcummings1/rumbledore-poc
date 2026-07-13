import { and, eq, inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import type { Env } from "@/core/env/schema";
import { recordJobRun } from "@/core/metrics";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import {
  leagues,
  members,
  onboardingDiscoveredLeagues,
  providerCredentials,
} from "@/db/schema";
import {
  FileSystemQuarantineCorpusWriter,
  type HistoricalImportResult,
  importLeagueHistory,
  type QuarantineCaptureManifestEntry,
  type QuarantineCorpusWriter,
} from "@/ingestion";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";
import { createFixtureEspnProvider } from "@/onboarding/fixture-espn";
import { createFixtureYahooProvider } from "@/onboarding/fixture-yahoo";
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
  NormalizedSeasonBundle,
  ProviderError,
  ProviderLeagueRef,
} from "@/providers/model";
import { createSleeperProvider } from "@/providers/sleeper/client";
import {
  createYahooProvider,
  yahooCredentialsSchema,
} from "@/providers/yahoo/client";
import { createRealtimePublisher, type RealtimePublisher } from "@/realtime";
import {
  listDataStewardReview,
  recomputeLeagueStatistics,
  runDataIntegrityChecks,
} from "@/stats";
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
  loadIntegrityReview?: typeof listDataStewardReview;
  quarantineWriter?: QuarantineCorpusWriter;
  recomputeStats?: typeof recomputeLeagueStatistics;
  runIntegrity?: typeof runDataIntegrityChecks;
  now?: () => Date;
  realtime?: RealtimePublisher;
  yahooOAuthClient?: YahooCredentialRefresher;
}

export interface ImportRequestedResponse extends HistoricalImportResult {
  ok: true;
  eventName: typeof JOB_EVENTS.importRequested;
  stats: Awaited<ReturnType<typeof recomputeLeagueStatistics>>;
  shadowRun?: {
    becameLive: boolean;
    captures: QuarantineCaptureManifestEntry[];
    failures: number;
    state: "quarantined" | "live";
  };
}

interface ShadowImportAuthorization {
  attempt: number;
  discoveryId: string;
  userId: string;
}

interface ImportAuthorization {
  credentials: unknown;
  shadowImport?: ShadowImportAuthorization;
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
  maxSeasons: z.number().int().min(1).max(25).optional(),
  shadowAttempt: z.number().int().positive().optional(),
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

async function loadImportAuthorization({
  data,
  deps,
}: {
  data: ImportRequestedData;
  deps: ImportRequestedDependencies;
}): Promise<ImportAuthorization> {
  const [credential] = await deps.db
    .select({
      encryptedPayload: providerCredentials.encryptedPayload,
      status: providerCredentials.status,
      userId: providerCredentials.userId,
    })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.id, data.credentialId),
        eq(providerCredentials.provider, data.provider),
      ),
    )
    .limit(1);

  const [league] = await deps.db
    .select({ id: leagues.id })
    .from(leagues)
    .where(
      and(
        eq(leagues.id, data.leagueId),
        eq(leagues.provider, data.provider),
        eq(leagues.providerLeagueId, data.providerLeagueId),
      ),
    )
    .limit(1);

  if (!credential || !league) {
    throw toNonRetriable(
      importJobError({
        code: "IMPORT_REQUEST_NOT_AUTHORIZED",
        message:
          "Historical import credential is not authorized for this league",
        status: 403,
      }),
    );
  }

  switch (credential.status) {
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

  const [shadowImport] = await deps.db
    .select({
      attempt: onboardingDiscoveredLeagues.importAttempts,
      discoveryId: onboardingDiscoveredLeagues.id,
      userId: onboardingDiscoveredLeagues.userId,
    })
    .from(onboardingDiscoveredLeagues)
    .where(
      and(
        eq(onboardingDiscoveredLeagues.credentialId, data.credentialId),
        eq(onboardingDiscoveredLeagues.userId, credential.userId),
        eq(onboardingDiscoveredLeagues.provider, data.provider),
        eq(onboardingDiscoveredLeagues.providerLeagueId, data.providerLeagueId),
        eq(onboardingDiscoveredLeagues.season, data.season),
        eq(onboardingDiscoveredLeagues.importedLeagueId, data.leagueId),
        data.shadowAttempt === undefined
          ? undefined
          : eq(onboardingDiscoveredLeagues.importAttempts, data.shadowAttempt),
        inArray(onboardingDiscoveredLeagues.importState, [
          "shadow_running",
          "quarantined",
        ]),
      ),
    )
    .limit(1);

  if (!shadowImport) {
    const [membership] = await deps.db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.userId, credential.userId),
          eq(members.organizationId, data.leagueId),
        ),
      )
      .limit(1);
    if (!membership) {
      throw toNonRetriable(
        importJobError({
          code: "IMPORT_REQUEST_NOT_AUTHORIZED",
          message:
            "Historical import credential is not authorized for this league",
          status: 403,
        }),
      );
    }
  }

  try {
    return {
      credentials: storedCredentialSchemas[data.provider].parse(
        deps.cipher.decryptJson(credential.encryptedPayload),
      ),
      ...(shadowImport ? { shadowImport } : {}),
    };
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
  const browserbase = env.services.browserbase;

  return {
    cipher: createCredentialCipher(env.credentials.encryptionKey),
    db: getDb(),
    quarantineWriter: new FileSystemQuarantineCorpusWriter(),
    providers: {
      espn: browserbase.mock
        ? createFixtureEspnProvider()
        : createEspnDiscoveryProvider(),
      sleeper: createSleeperProvider(),
      yahoo: env.auth.yahoo.mock
        ? createFixtureYahooProvider()
        : createYahooProvider(),
    },
    realtime: createRealtimePublisher(env),
    yahooOAuthClient: createYahooOAuthClientForEnv(env),
  };
}

export async function runImportRequestedWithDefaultDependencies(
  data: unknown,
): Promise<ImportRequestedResponse> {
  return runImportRequested({
    data,
    deps: await getDefaultImportRequestedDependencies(),
  });
}

async function loadUnresolvedIntegrityFailures(
  deps: ImportRequestedDependencies,
  leagueId: string,
) {
  const review = await (deps.loadIntegrityReview ?? listDataStewardReview)(
    deps.db,
    { leagueId, limit: 100 },
  );
  if (!review.ok) {
    throw review.error;
  }

  return review.value.integrityChecks
    .filter((check) => check.status === "fail")
    .map((check) => ({
      checkKey: check.checkKey,
      detail: check.detail,
      id: check.id,
      season: check.season,
    }));
}

async function quarantineShadowImport({
  capturedAt,
  captures,
  data,
  deps,
  failures,
  shadowImport,
}: {
  capturedAt: Date;
  captures: QuarantineCaptureManifestEntry[];
  data: ImportRequestedData;
  deps: ImportRequestedDependencies;
  failures: Awaited<ReturnType<typeof loadUnresolvedIntegrityFailures>>;
  shadowImport: ShadowImportAuthorization;
}): Promise<void> {
  await deps.db
    .update(onboardingDiscoveredLeagues)
    .set({
      importState: "quarantined",
      integrityFailureCount: failures.length,
      quarantinedAt: capturedAt,
      quarantineManifest: {
        capturedAt: capturedAt.toISOString(),
        captures,
        checkIds: failures.map((failure) => failure.id),
        checkKeys: failures.map((failure) => failure.checkKey),
      },
      updatedAt: capturedAt,
    })
    .where(
      and(
        eq(onboardingDiscoveredLeagues.id, shadowImport.discoveryId),
        eq(onboardingDiscoveredLeagues.importedLeagueId, data.leagueId),
        eq(onboardingDiscoveredLeagues.importAttempts, shadowImport.attempt),
        inArray(onboardingDiscoveredLeagues.importState, [
          "shadow_running",
          "quarantined",
        ]),
      ),
    );
}

function errorClassName(error: unknown): string {
  if (!(error instanceof Error)) {
    return "UnknownError";
  }

  return error.name.trim() || error.constructor.name || "Error";
}

export async function quarantineExhaustedShadowImport({
  data: rawData,
  deps,
  error,
}: {
  data: unknown;
  deps: Pick<ImportRequestedDependencies, "db" | "now">;
  error: unknown;
}): Promise<boolean> {
  const parsed = importRequestedDataSchema.safeParse(rawData);
  if (!parsed.success) {
    return false;
  }

  const data = parsed.data;
  const shadowAttempt = data.shadowAttempt;
  if (shadowAttempt === undefined) {
    return false;
  }
  const quarantinedAt = now(deps);
  const [quarantined] = await deps.db
    .update(onboardingDiscoveredLeagues)
    .set({
      importState: "quarantined",
      integrityFailureCount: 0,
      quarantinedAt,
      quarantineManifest: {
        capturedAt: quarantinedAt.toISOString(),
        captures: [],
        checkIds: [],
        checkKeys: [],
        jobFailure: { errorClass: errorClassName(error) },
      },
      updatedAt: quarantinedAt,
    })
    .where(
      and(
        eq(onboardingDiscoveredLeagues.credentialId, data.credentialId),
        eq(onboardingDiscoveredLeagues.provider, data.provider),
        eq(onboardingDiscoveredLeagues.providerLeagueId, data.providerLeagueId),
        eq(onboardingDiscoveredLeagues.season, data.season),
        eq(onboardingDiscoveredLeagues.importedLeagueId, data.leagueId),
        eq(onboardingDiscoveredLeagues.importAttempts, shadowAttempt),
        eq(onboardingDiscoveredLeagues.importState, "shadow_running"),
      ),
    )
    .returning({ id: onboardingDiscoveredLeagues.id });

  return Boolean(quarantined);
}

async function promoteShadowImport({
  data,
  deps,
  shadowImport,
}: {
  data: ImportRequestedData;
  deps: ImportRequestedDependencies;
  shadowImport: ShadowImportAuthorization;
}): Promise<boolean> {
  const promotedAt = now(deps);
  return deps.db.transaction(async (tx) => {
    const [promoted] = await tx
      .update(onboardingDiscoveredLeagues)
      .set({
        importState: "live",
        integrityFailureCount: 0,
        liveAt: promotedAt,
        quarantineManifest: null,
        quarantinedAt: null,
        updatedAt: promotedAt,
      })
      .where(
        and(
          eq(onboardingDiscoveredLeagues.id, shadowImport.discoveryId),
          eq(onboardingDiscoveredLeagues.importedLeagueId, data.leagueId),
          eq(onboardingDiscoveredLeagues.importAttempts, shadowImport.attempt),
          inArray(onboardingDiscoveredLeagues.importState, [
            "shadow_running",
            "quarantined",
          ]),
        ),
      )
      .returning({ id: onboardingDiscoveredLeagues.id });
    if (!promoted) {
      return false;
    }

    await tx
      .insert(members)
      .values({
        organizationId: data.leagueId,
        role: "commissioner",
        userId: shadowImport.userId,
      })
      .onConflictDoNothing({
        target: [members.organizationId, members.userId],
      });
    return true;
  });
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
  const authorization = await loadImportAuthorization({ data, deps });
  const credentials = authorization.credentials;
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

  const capturedBundles: NormalizedSeasonBundle[] = [];
  let history = await importLeagueHistory({
    db: deps.db,
    forceReimport: Boolean(authorization.shadowImport),
    maxSeasons: data.maxSeasons,
    now: deps.now,
    onBundleFetched: (bundle) => capturedBundles.push(bundle),
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
          forceReimport: Boolean(authorization.shadowImport),
          maxSeasons: data.maxSeasons,
          now: deps.now,
          onBundleFetched: (bundle) => capturedBundles.push(bundle),
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
  const integrity = await (deps.runIntegrity ?? runDataIntegrityChecks)(
    deps.db,
    { leagueId: data.leagueId },
  );

  if (authorization.shadowImport) {
    const failures = await loadUnresolvedIntegrityFailures(deps, data.leagueId);
    if (integrity.failures > 0 && failures.length === 0) {
      throw importJobError({
        code: "SHADOW_IMPORT_FAILURE_DETAIL_MISSING",
        message: "Shadow import failed without persisted integrity detail",
        status: 500,
      });
    }

    if (failures.length > 0) {
      const capturedAt = now(deps);
      const captures = await (
        deps.quarantineWriter ?? new FileSystemQuarantineCorpusWriter()
      ).capture({
        attempt: authorization.shadowImport.attempt,
        bundles: capturedBundles,
        capturedAt,
        failures,
        provider: data.provider,
        providerLeagueId: data.providerLeagueId,
        season: data.season,
      });
      await quarantineShadowImport({
        capturedAt,
        captures,
        data,
        deps,
        failures,
        shadowImport: authorization.shadowImport,
      });
      return {
        ok: true,
        eventName: JOB_EVENTS.importRequested,
        shadowRun: {
          becameLive: false,
          captures,
          failures: failures.length,
          state: "quarantined",
        },
        stats,
        ...history.value,
      };
    }

    const becameLive = await promoteShadowImport({
      data,
      deps,
      shadowImport: authorization.shadowImport,
    });
    return {
      ok: true,
      eventName: JOB_EVENTS.importRequested,
      shadowRun: {
        becameLive,
        captures: [],
        failures: 0,
        state: "live",
      },
      stats,
      ...history.value,
    };
  }

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
        "event.data.leagueId + ':' + event.data.provider + ':' + event.data.providerLeagueId + ':' + (event.data.shadowAttempt || 'legacy')",
      onFailure: async ({ error, event, step }) => {
        const deps = await resolveDeps();
        await step.run("quarantine-exhausted-shadow-import", () =>
          quarantineExhaustedShadowImport({
            data: event.data.event.data,
            deps,
            error,
          }),
        );
      },
    },
    async ({ event, step }): Promise<ImportRequestedResponse> =>
      recordJobRun("import-requested", async () => {
        const deps = await resolveDeps();
        const response = await step.run("run-historical-import", () =>
          runImportRequested({ data: event.data, deps }),
        );
        if (response.shadowRun?.becameLive) {
          await step.sendEvent("announce-league-connected", {
            data: { leagueId: response.league.id },
            id: `league.connected:${response.league.id}`,
            name: JOB_EVENTS.leagueConnected,
          });
        }
        return response;
      }),
  );
}

export const importRequested = createImportRequestedFunction();
