import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import {
  leagues,
  members,
  onboardingDiscoveredLeagues,
  providerCredentials,
} from "@/db/schema";
import { type CurrentLeagueSyncResult, syncCurrentLeague } from "@/ingestion";
import type { ImportRequestedData, LeagueConnectedData } from "@/jobs/events";
import type {
  FantasyProvider,
  FantasyProviderId,
  FantasyProviderSession,
  ProviderError,
  ProviderLeagueRef,
} from "@/providers";
import { yahooCredentialsSchema } from "@/providers/yahoo/client";
import type { RealtimePublisher } from "@/realtime";
import { recomputeLeagueStatistics } from "@/stats";
import type { CredentialCipher } from "./credential-crypto";
import {
  type LeagueInviteTarget,
  listLeaguemateInviteTargets,
} from "./invites";
import {
  type ProviderReconnectAction,
  reconnectActionForProvider,
} from "./reconnect";
import {
  type DataStewardReviewDoorway,
  listDataStewardDoorway,
} from "./stewards";
import {
  refreshStoredYahooCredentials,
  type YahooCredentialRefresher,
} from "./yahoo-refresh";

export type OnboardingConnectionFlow =
  | "browser"
  | "manual"
  | "extension"
  | "public"
  | "oauth";

export interface DiscoveredLeague {
  provider: FantasyProviderId;
  providerId: string;
  season: number;
  sport: "ffl" | "unknown";
  name: string;
  providerTeamId?: string;
  teamName?: string;
  size?: number;
}

export interface ProviderConnectResult {
  credentialId: string;
  discoveredLeagues: DiscoveredLeague[];
}

export interface DiscoveredLeagueImportCandidate extends DiscoveredLeague {
  credentialId: string;
  connectionInvalidAt?: Date;
  connectionState: "connected" | "invalid";
  imported: boolean;
  isRecommendedImport: boolean;
  lastDiscoveredAt: Date;
  leagueId?: string;
  reconnect?: ProviderReconnectAction;
}

export interface ProviderImportLeaguemateSummary {
  importedMembers: number;
  inviteTargets: number;
  stewardReview?: DataStewardReviewDoorway;
  targets: Array<
    Pick<
      LeagueInviteTarget,
      "displayName" | "providerMemberId" | "suggestedChannel" | "teamNames"
    >
  >;
}

export interface ProviderImportResult {
  credentialId: string;
  leagueId: string;
  leaguemateInvites: ProviderImportLeaguemateSummary;
  sync: CurrentLeagueSyncResult;
}

export type RequestHistoricalImport = (
  data: ImportRequestedData,
) => Promise<void>;

export type RequestLeagueConnected = (
  data: LeagueConnectedData,
) => Promise<void>;

type OnboardingProvider = Pick<
  FantasyProvider<unknown, FantasyProviderSession>,
  | "authenticate"
  | "capabilities"
  | "discoverLeagues"
  | "getLeague"
  | "getMatchups"
  | "getMembers"
  | "getTeams"
> &
  Partial<Pick<FantasyProvider<unknown, FantasyProviderSession>, "getRosters">>;

export type OnboardingProviderRegistry = Partial<
  Record<FantasyProviderId, unknown>
>;

export interface ProviderOnboardingDependencies {
  cipher: CredentialCipher;
  db: Db;
  now?: () => Date;
  providers: OnboardingProviderRegistry;
  realtime?: RealtimePublisher;
  requestHistoricalImport?: RequestHistoricalImport;
  requestLeagueConnected?: RequestLeagueConnected;
  yahooOAuthClient?: YahooCredentialRefresher;
}

export type ProviderOnboardingError = AppError | ProviderError;

export class OnboardingError extends AppError {
  constructor({
    code,
    message,
    status,
    details,
    cause,
  }: {
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super({ cause, code, details, message, status });
    this.name = "OnboardingError";
  }
}

const storedEspnCredentialsSchema = z.object({
  espn_s2: z.string().min(1),
  swid: z.string().min(1),
});

export const storedSleeperCredentialsSchema = z.object({
  seasons: z
    .array(z.number().int().min(2000).max(2100))
    .min(1)
    .max(10)
    .optional(),
  usernameOrUserId: z.string().trim().min(1),
});

const storedCredentialSchemas = {
  espn: storedEspnCredentialsSchema,
  sleeper: storedSleeperCredentialsSchema,
  yahoo: yahooCredentialsSchema,
} satisfies Partial<Record<FantasyProviderId, z.ZodType<unknown>>>;
type HistoricalImportProviderId = ImportRequestedData["provider"];

function currentTime(deps: Pick<ProviderOnboardingDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function providerUnsupported(provider: FantasyProviderId): OnboardingError {
  return new OnboardingError({
    code: "ONBOARDING_PROVIDER_UNSUPPORTED",
    message: "This fantasy provider is not supported by onboarding yet",
    status: 400,
    details: { provider },
  });
}

function credentialInvalidError(
  provider: FantasyProviderId,
  cause?: unknown,
): OnboardingError {
  const reconnect = reconnectActionForProvider(provider);
  return new OnboardingError({
    cause,
    code: "ONBOARDING_CREDENTIAL_INVALID",
    details: { provider, reconnect },
    message: reconnect.message,
    status: 409,
  });
}

function providerAuthExpiredError(
  provider: FantasyProviderId,
  cause?: unknown,
): OnboardingError {
  const reconnect = reconnectActionForProvider(provider);
  return new OnboardingError({
    cause,
    code: "PROVIDER_AUTH_EXPIRED",
    details: { provider, reconnect },
    message: reconnect.message,
    status: 401,
  });
}

function shouldInvalidateCredential(error: ProviderError): boolean {
  return error.code === "PROVIDER_AUTH_EXPIRED";
}

function isYahooProvider(provider: FantasyProviderId): boolean {
  switch (provider) {
    case "yahoo":
      return true;
    default:
      return false;
  }
}

function reconnectErrorForProviderError(
  provider: FantasyProviderId,
  error: ProviderError,
): ProviderError | OnboardingError {
  if (!shouldInvalidateCredential(error)) {
    return error;
  }

  return providerAuthExpiredError(provider, error);
}

function resolveProvider(
  deps: ProviderOnboardingDependencies,
  provider: FantasyProviderId,
): Result<OnboardingProvider, OnboardingError> {
  const resolved = deps.providers[provider];
  if (!resolved) {
    return err(providerUnsupported(provider));
  }

  return ok(resolved as OnboardingProvider);
}

function parseStoredCredentials(
  provider: FantasyProviderId,
  payload: unknown,
): unknown {
  const schema = (
    storedCredentialSchemas as Partial<
      Record<FantasyProviderId, z.ZodType<unknown>>
    >
  )[provider];
  if (!schema) {
    throw providerUnsupported(provider);
  }

  return schema.parse(payload);
}

function toDiscoveredLeague(ref: ProviderLeagueRef): DiscoveredLeague {
  return {
    provider: ref.provider,
    providerId: ref.providerId,
    season: ref.season,
    sport: ref.sport,
    name: ref.name,
    ...(ref.providerTeamId ? { providerTeamId: ref.providerTeamId } : {}),
    ...(ref.teamName ? { teamName: ref.teamName } : {}),
    ...(ref.size === undefined ? {} : { size: ref.size }),
  };
}

function toProviderRef(league: DiscoveredLeague): ProviderLeagueRef {
  return {
    provider: league.provider,
    providerId: league.providerId,
    season: league.season,
    sport: league.sport,
    name: league.name,
    ...(league.providerTeamId ? { providerTeamId: league.providerTeamId } : {}),
    ...(league.teamName ? { teamName: league.teamName } : {}),
    ...(league.size === undefined ? {} : { size: league.size }),
  };
}

export async function persistConnectedCredential({
  credentials,
  deps,
  discoveredLeagues,
  flow,
  provider,
  subjectProviderId,
  userId,
}: {
  credentials: unknown;
  deps: ProviderOnboardingDependencies;
  discoveredLeagues: readonly DiscoveredLeague[];
  flow: OnboardingConnectionFlow;
  provider: FantasyProviderId;
  subjectProviderId: string;
  userId: string;
}): Promise<{ credentialId: string }> {
  const now = currentTime(deps);
  const encryptedPayload = deps.cipher.encryptJson(credentials);

  return deps.db.transaction(async (tx) => {
    const [credential] = await tx
      .insert(providerCredentials)
      .values({
        connectionFlow: flow,
        encryptedPayload,
        invalidAt: null,
        lastValidatedAt: now,
        provider,
        status: "connected",
        subjectProviderId,
        userId,
      })
      .onConflictDoUpdate({
        target: [
          providerCredentials.userId,
          providerCredentials.provider,
          providerCredentials.subjectProviderId,
        ],
        set: {
          connectionFlow: sql`excluded.connection_flow`,
          encryptedPayload: sql`excluded.encrypted_payload`,
          invalidAt: null,
          lastValidatedAt: sql`excluded.last_validated_at`,
          status: "connected",
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: providerCredentials.id });

    if (!credential) {
      throw new OnboardingError({
        code: "ONBOARDING_CREDENTIAL_NOT_PERSISTED",
        message: "Provider credential could not be persisted",
        status: 500,
      });
    }

    for (const league of discoveredLeagues) {
      await tx
        .insert(onboardingDiscoveredLeagues)
        .values({
          credentialId: credential.id,
          lastDiscoveredAt: now,
          name: league.name,
          provider: league.provider,
          providerLeagueId: league.providerId,
          providerTeamId: league.providerTeamId ?? null,
          season: league.season,
          size: league.size ?? null,
          sport: league.sport,
          teamName: league.teamName ?? null,
          userId,
        })
        .onConflictDoUpdate({
          target: [
            onboardingDiscoveredLeagues.userId,
            onboardingDiscoveredLeagues.provider,
            onboardingDiscoveredLeagues.providerLeagueId,
            onboardingDiscoveredLeagues.season,
          ],
          set: {
            credentialId: sql`excluded.credential_id`,
            lastDiscoveredAt: sql`excluded.last_discovered_at`,
            name: sql`excluded.name`,
            providerTeamId: sql`excluded.provider_team_id`,
            size: sql`excluded.size`,
            sport: sql`excluded.sport`,
            teamName: sql`excluded.team_name`,
            updatedAt: sql`now()`,
          },
        });
    }

    return { credentialId: credential.id };
  });
}

export async function connectProviderWithCredentials({
  credentials,
  deps,
  flow,
  provider: providerId,
  userId,
}: {
  credentials: unknown;
  deps: ProviderOnboardingDependencies;
  flow: OnboardingConnectionFlow;
  provider: FantasyProviderId;
  userId: string;
}): Promise<Result<ProviderConnectResult, ProviderOnboardingError>> {
  const provider = resolveProvider(deps, providerId);
  if (!provider.ok) {
    return provider;
  }

  const session = await provider.value.authenticate(credentials);
  if (!session.ok) {
    return session;
  }

  const discovered = await provider.value.discoverLeagues(session.value);
  if (!discovered.ok) {
    return discovered;
  }

  const discoveredLeagues = discovered.value.map(toDiscoveredLeague);
  const persisted = await persistConnectedCredential({
    credentials,
    deps,
    discoveredLeagues,
    flow,
    provider: providerId,
    subjectProviderId:
      session.value.subjectProviderId ?? `${providerId}:${userId}`,
    userId,
  });

  return ok({
    credentialId: persisted.credentialId,
    discoveredLeagues,
  });
}

async function listDiscoveredLeagueCandidates(
  deps: Pick<ProviderOnboardingDependencies, "db">,
  input: { provider?: FantasyProviderId; userId: string },
): Promise<Result<DiscoveredLeagueImportCandidate[], OnboardingError>> {
  const rows = await deps.db
    .select({
      credentialId: onboardingDiscoveredLeagues.credentialId,
      connectionInvalidAt: providerCredentials.invalidAt,
      connectionState: providerCredentials.status,
      importedLeagueId: leagues.id,
      lastDiscoveredAt: onboardingDiscoveredLeagues.lastDiscoveredAt,
      memberUserId: members.userId,
      name: onboardingDiscoveredLeagues.name,
      provider: onboardingDiscoveredLeagues.provider,
      providerLeagueId: onboardingDiscoveredLeagues.providerLeagueId,
      providerTeamId: onboardingDiscoveredLeagues.providerTeamId,
      season: onboardingDiscoveredLeagues.season,
      size: onboardingDiscoveredLeagues.size,
      sport: onboardingDiscoveredLeagues.sport,
      teamName: onboardingDiscoveredLeagues.teamName,
    })
    .from(onboardingDiscoveredLeagues)
    .innerJoin(
      providerCredentials,
      and(
        eq(providerCredentials.id, onboardingDiscoveredLeagues.credentialId),
        eq(providerCredentials.userId, input.userId),
      ),
    )
    .leftJoin(
      leagues,
      and(
        eq(leagues.provider, onboardingDiscoveredLeagues.provider),
        eq(
          leagues.providerLeagueId,
          onboardingDiscoveredLeagues.providerLeagueId,
        ),
        eq(leagues.season, onboardingDiscoveredLeagues.season),
      ),
    )
    .leftJoin(
      members,
      and(
        eq(members.organizationId, leagues.id),
        eq(members.userId, input.userId),
      ),
    )
    .where(
      input.provider
        ? and(
            eq(onboardingDiscoveredLeagues.userId, input.userId),
            eq(onboardingDiscoveredLeagues.provider, input.provider),
          )
        : eq(onboardingDiscoveredLeagues.userId, input.userId),
    )
    .orderBy(
      asc(onboardingDiscoveredLeagues.provider),
      desc(onboardingDiscoveredLeagues.season),
      asc(onboardingDiscoveredLeagues.name),
    );

  const latestFflSeason = rows.reduce<number | null>((latest, row) => {
    if (row.sport !== "ffl") {
      return latest;
    }
    return latest === null ? row.season : Math.max(latest, row.season);
  }, null);

  return ok(
    rows.map((row) => {
      const imported =
        row.memberUserId !== null && row.importedLeagueId !== null;
      let invalidConnection = false;
      switch (row.connectionState) {
        case "invalid":
          invalidConnection = true;
          break;
        case "connected":
          break;
      }
      return {
        credentialId: row.credentialId,
        connectionState: row.connectionState,
        imported,
        isRecommendedImport:
          !imported &&
          !invalidConnection &&
          row.sport === "ffl" &&
          row.season === latestFflSeason,
        lastDiscoveredAt: row.lastDiscoveredAt,
        name: row.name,
        provider: row.provider,
        providerId: row.providerLeagueId,
        ...(row.providerTeamId ? { providerTeamId: row.providerTeamId } : {}),
        season: row.season,
        sport: row.sport,
        ...(row.teamName ? { teamName: row.teamName } : {}),
        ...(row.size === null ? {} : { size: row.size }),
        ...(row.connectionInvalidAt
          ? { connectionInvalidAt: row.connectionInvalidAt }
          : {}),
        ...(imported && row.importedLeagueId
          ? { leagueId: row.importedLeagueId }
          : {}),
        ...(invalidConnection
          ? { reconnect: reconnectActionForProvider(row.provider) }
          : {}),
      };
    }),
  );
}

export async function listDiscoveredLeagues(
  deps: Pick<ProviderOnboardingDependencies, "db">,
  input: { provider: FantasyProviderId; userId: string },
): Promise<Result<DiscoveredLeagueImportCandidate[], OnboardingError>> {
  return listDiscoveredLeagueCandidates(deps, input);
}

export async function listDiscoveredLeagueInventory(
  deps: Pick<ProviderOnboardingDependencies, "db">,
  input: { userId: string },
): Promise<Result<DiscoveredLeagueImportCandidate[], OnboardingError>> {
  return listDiscoveredLeagueCandidates(deps, input);
}

async function loadStoredCredentials({
  deps,
  provider,
  credentialId,
  userId,
}: {
  deps: ProviderOnboardingDependencies;
  provider: FantasyProviderId;
  credentialId: string;
  userId: string;
}): Promise<unknown> {
  const [credential] = await deps.db
    .select()
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.id, credentialId),
        eq(providerCredentials.provider, provider),
        eq(providerCredentials.userId, userId),
      ),
    )
    .limit(1);

  if (!credential) {
    throw new OnboardingError({
      code: "ONBOARDING_CREDENTIAL_NOT_FOUND",
      message: "Provider credential is not connected",
      status: 404,
    });
  }

  switch (credential.status) {
    case "connected":
      break;
    case "invalid":
      throw credentialInvalidError(provider);
    default:
      throw new OnboardingError({
        code: "ONBOARDING_CREDENTIAL_NOT_FOUND",
        message: "Provider credential is not connected",
        status: 404,
      });
  }

  return parseStoredCredentials(
    provider,
    deps.cipher.decryptJson(credential.encryptedPayload),
  );
}

async function markCredentialInvalid({
  credentialId,
  deps,
}: {
  credentialId: string;
  deps: Pick<ProviderOnboardingDependencies, "db" | "now">;
}): Promise<void> {
  await deps.db
    .update(providerCredentials)
    .set({
      invalidAt: currentTime(deps),
      status: "invalid",
      updatedAt: new Date(),
    })
    .where(eq(providerCredentials.id, credentialId));
}

export async function importDiscoveredLeague(
  deps: ProviderOnboardingDependencies,
  input: {
    provider: FantasyProviderId;
    providerLeagueId: string;
    season: number;
    userId: string;
  },
): Promise<Result<ProviderImportResult, ProviderOnboardingError>> {
  const provider = resolveProvider(deps, input.provider);
  if (!provider.ok) {
    return provider;
  }

  const [discovered] = await deps.db
    .select()
    .from(onboardingDiscoveredLeagues)
    .where(
      and(
        eq(onboardingDiscoveredLeagues.userId, input.userId),
        eq(onboardingDiscoveredLeagues.provider, input.provider),
        eq(
          onboardingDiscoveredLeagues.providerLeagueId,
          input.providerLeagueId,
        ),
        eq(onboardingDiscoveredLeagues.season, input.season),
      ),
    )
    .limit(1);

  if (!discovered) {
    return err(
      new OnboardingError({
        code: "ONBOARDING_DISCOVERED_LEAGUE_NOT_FOUND",
        message: "Discovered league was not found",
        status: 404,
      }),
    );
  }

  let credentials: unknown;
  try {
    credentials = await loadStoredCredentials({
      credentialId: discovered.credentialId,
      deps,
      provider: input.provider,
      userId: input.userId,
    });
  } catch (cause) {
    return err(
      cause instanceof OnboardingError
        ? cause
        : new OnboardingError({
            cause,
            code: "ONBOARDING_CREDENTIAL_DECRYPT_FAILED",
            message: "Provider credential could not be read",
            status: 500,
          }),
    );
  }

  let session = await provider.value.authenticate(credentials);
  if (
    !session.ok &&
    shouldInvalidateCredential(session.error) &&
    isYahooProvider(input.provider)
  ) {
    const refreshed = await refreshStoredYahooCredentials({
      credentialId: discovered.credentialId,
      credentials,
      deps,
    });
    session = refreshed.ok
      ? await provider.value.authenticate(refreshed.value)
      : err(refreshed.error);
  }
  if (!session.ok) {
    if (shouldInvalidateCredential(session.error)) {
      await markCredentialInvalid({
        credentialId: discovered.credentialId,
        deps,
      });
    }
    return err(reconnectErrorForProviderError(input.provider, session.error));
  }

  const ref = toProviderRef({
    name: discovered.name,
    provider: discovered.provider,
    providerId: discovered.providerLeagueId,
    season: discovered.season,
    sport: discovered.sport,
    ...(discovered.providerTeamId
      ? { providerTeamId: discovered.providerTeamId }
      : {}),
    ...(discovered.teamName ? { teamName: discovered.teamName } : {}),
    ...(discovered.size === null ? {} : { size: discovered.size }),
  });

  const sync = await syncCurrentLeague({
    db: deps.db,
    now: deps.now,
    provider: provider.value,
    realtime: deps.realtime,
    ref,
    session: session.value,
  });
  if (!sync.ok) {
    return sync;
  }

  const importProvider = ref.provider;
  if (
    importProvider !== "espn" &&
    importProvider !== "sleeper" &&
    importProvider !== "yahoo"
  ) {
    return err(providerUnsupported(importProvider));
  }

  await recomputeLeagueStatistics(deps.db, { leagueId: sync.value.league.id });

  await deps.db
    .insert(members)
    .values({
      organizationId: sync.value.league.id,
      role: "commissioner",
      userId: input.userId,
    })
    .onConflictDoNothing({
      target: [members.organizationId, members.userId],
    });

  const leaguemateInvites = await listLeaguemateInviteTargets(
    { db: deps.db },
    {
      leagueId: sync.value.league.id,
      userId: input.userId,
      userRole: "commissioner",
    },
  );
  if (!leaguemateInvites.ok) {
    return leaguemateInvites;
  }
  const stewardDoorway = await listDataStewardDoorway(deps.db, {
    leagueId: sync.value.league.id,
    userId: input.userId,
    userRole: "commissioner",
  });
  if (!stewardDoorway.ok) {
    return stewardDoorway;
  }

  try {
    await deps.requestHistoricalImport?.({
      credentialId: discovered.credentialId,
      leagueId: sync.value.league.id,
      name: ref.name,
      provider: importProvider satisfies HistoricalImportProviderId,
      providerLeagueId: ref.providerId,
      season: ref.season,
      sport: ref.sport,
      ...(ref.teamName ? { teamName: ref.teamName } : {}),
      ...(ref.size === undefined ? {} : { size: ref.size }),
    });
  } catch (cause) {
    return err(
      new OnboardingError({
        cause,
        code: "ONBOARDING_IMPORT_JOB_ENQUEUE_FAILED",
        message: "Historical import could not be enqueued",
        status: 500,
      }),
    );
  }

  try {
    await deps.requestLeagueConnected?.({
      leagueId: sync.value.league.id,
    });
  } catch (cause) {
    return err(
      new OnboardingError({
        cause,
        code: "ONBOARDING_LIVE_INGEST_JOB_ENQUEUE_FAILED",
        message: "Live ingestion could not be enqueued",
        status: 500,
      }),
    );
  }

  return ok({
    credentialId: discovered.credentialId,
    leagueId: sync.value.league.id,
    leaguemateInvites: {
      importedMembers: leaguemateInvites.value.totals.importedMembers,
      inviteTargets: leaguemateInvites.value.totals.inviteTargets,
      ...(stewardDoorway.value.review?.needsReview
        ? { stewardReview: stewardDoorway.value.review }
        : {}),
      targets: leaguemateInvites.value.targets.map((target) => ({
        displayName: target.displayName,
        providerMemberId: target.providerMemberId,
        suggestedChannel: target.suggestedChannel,
        teamNames: target.teamNames,
      })),
    },
    sync: sync.value,
  });
}
