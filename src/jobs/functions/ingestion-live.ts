import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { cron, NonRetriableError } from "inngest";
import { z } from "zod";
import type { Env } from "@/core/env/schema";
import { recordJobRun } from "@/core/metrics";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataCoverage,
  leagues,
  members,
  onboardingDiscoveredLeagues,
  providerCredentials,
} from "@/db/schema";
import {
  type CurrentLeagueSyncError,
  type CurrentLeagueSyncInput,
  type CurrentLeagueSyncResult,
  type DataCoverageObservationMap,
  recordDataCoverage,
  syncCurrentLeague,
} from "@/ingestion";
import {
  createConfiguredPollPolicy,
  type IngestionGameState,
  LIVE_INGESTION_DATA_CLASSES,
  type LiveIngestionDataClass,
  type PollPolicy,
  type PollPolicyConfigOverride,
} from "@/ingestion/poll-policy";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";
import { storedSleeperCredentialsSchema } from "@/onboarding/provider-service";
import {
  type ProviderReconnectAction,
  reconnectActionForProvider,
} from "@/onboarding/reconnect";
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
  ProviderDataClass,
  ProviderError,
  ProviderLeagueRef,
} from "@/providers/model";
import { PROVIDER_DATA_CLASSES } from "@/providers/model";
import { createSleeperProvider } from "@/providers/sleeper/client";
import {
  createYahooProvider,
  yahooCredentialsSchema,
} from "@/providers/yahoo/client";
import { createRealtimePublisher, type RealtimePublisher } from "@/realtime";
import {
  defaultNflCalendar,
  type NflCalendar,
  type NflWeekState,
} from "@/sports/nfl-calendar";
import { inngest } from "../client";
import {
  type GameFinalData,
  type ImportRequestedData,
  type IngestionTickData,
  JOB_EVENTS,
  type LeagueIngestData,
  type RecordBrokenData,
  type SeasonRolloverCheckData,
  type TransactionData,
  type WaiverData,
} from "../events";

const DEFAULT_TICK_LIMIT = 500;
const MAX_TICK_LIMIT = 2000;
const DEFAULT_ROLLOVER_LIMIT = 200;
const MAX_ROLLOVER_LIMIT = 1000;

export interface IngestionGameStateInput {
  currentScoringPeriod: number;
  leagueId: string;
  leagueStatus: "preseason" | "in_season" | "complete" | "unknown";
  now: Date;
  provider: IngestableProviderId;
  providerLeagueId: string;
  season: number;
}

export interface IngestionGameStateProvider {
  stateForLeague(
    input: IngestionGameStateInput,
  ): IngestionGameState | Promise<IngestionGameState>;
}

export function createNflCalendarGameStateProvider(
  nflCalendar: NflCalendar = defaultNflCalendar,
): IngestionGameStateProvider {
  return {
    async stateForLeague(input) {
      if (input.leagueStatus === "complete") {
        return "off_season";
      }

      return ingestionGameStateFromNflWeekState(
        await nflCalendar.weekState(input.now),
      );
    },
  };
}

function ingestionGameStateFromNflWeekState(
  weekState: NflWeekState,
): IngestionGameState {
  if (weekState.phase === "offseason") {
    return "off_season";
  }

  return weekState.gamePhase === "games_live"
    ? "live_window"
    : "in_season_off_hours";
}

const defaultGameStateProvider = createNflCalendarGameStateProvider();

type LeagueIngestProvider = Pick<
  FantasyProvider<unknown, FantasyProviderSession>,
  | "authenticate"
  | "capabilities"
  | "getLeague"
  | "getMatchups"
  | "getMembers"
  | "getTeams"
  | "getTransactions"
> &
  Partial<Pick<FantasyProvider<unknown, FantasyProviderSession>, "getRosters">>;

type IngestableProviderId = Extract<
  FantasyProviderId,
  "espn" | "sleeper" | "yahoo"
>;

type LeagueIngestProviderRegistry = Partial<
  Record<IngestableProviderId, unknown>
>;

type SeasonRolloverProvider = Pick<
  FantasyProvider<unknown, FantasyProviderSession>,
  "authenticate" | "discoverLeagues"
>;

type SeasonRolloverProviderRegistry = Partial<
  Record<IngestableProviderId, unknown>
>;

type SyncCurrentLeagueFn = (
  input: CurrentLeagueSyncInput<FantasyProviderSession>,
) => Promise<Result<CurrentLeagueSyncResult, CurrentLeagueSyncError>>;

export interface IngestionTickDependencies {
  db: Db;
  gameStateProvider?: IngestionGameStateProvider;
  globalPollPolicyConfig?: PollPolicyConfigOverride;
  now?: () => Date;
  pollPolicy?: PollPolicy;
  pollPolicyConfigOverride?: PollPolicyConfigOverride;
}

export interface LeagueIngestDependencies {
  cipher: CredentialCipher;
  db: Db;
  now?: () => Date;
  providers: LeagueIngestProviderRegistry;
  realtime?: RealtimePublisher;
  syncCurrent?: SyncCurrentLeagueFn;
  yahooOAuthClient?: YahooCredentialRefresher;
}

export interface SeasonRolloverCheckDependencies {
  cipher: CredentialCipher;
  db: Db;
  now?: () => Date;
  providers: SeasonRolloverProviderRegistry;
  yahooOAuthClient?: YahooCredentialRefresher;
}

export interface PlannedLeagueIngestEvent {
  data: LeagueIngestData;
  id: string;
  name: typeof JOB_EVENTS.leagueIngest;
}

export interface PlannedGameFinalEvent {
  data: GameFinalData;
  id: string;
  name: typeof JOB_EVENTS.gameFinal;
}

export interface PlannedRecordBrokenEvent {
  data: RecordBrokenData;
  id: string;
  name: typeof JOB_EVENTS.recordBroken;
}

export interface PlannedTransactionEvent {
  data: TransactionData;
  id: string;
  name: typeof JOB_EVENTS.transaction;
}

export interface PlannedWaiverEvent {
  data: WaiverData;
  id: string;
  name: typeof JOB_EVENTS.waiver;
}

export interface PlannedHistoricalBackfillEvent {
  data: ImportRequestedData;
  id: string;
  name: typeof JOB_EVENTS.importRequested;
}

export interface PausedLeagueIngestTarget {
  connectionInvalidAt?: string;
  connectionState: "invalid";
  credentialId: string;
  leagueId: string;
  name: string;
  provider: IngestableProviderId;
  providerLeagueId: string;
  reconnect: ProviderReconnectAction;
  season: number;
  sport: "ffl" | "unknown";
}

export interface IngestionTickResponse {
  connectedRows: number;
  eventName:
    | typeof JOB_EVENTS.ingestionTick
    | typeof JOB_EVENTS.leagueConnected;
  limit: number;
  ok: true;
  paused: PausedLeagueIngestTarget[];
  pausedCount: number;
  planned: PlannedLeagueIngestEvent[];
  plannedCount: number;
  sentCount: number;
  skippedDuplicateCredentials: number;
  skippedNotDue: number;
}

export interface LeagueIngestResponse extends CurrentLeagueSyncResult {
  dataClasses: ProviderDataClass[];
  eventName: typeof JOB_EVENTS.leagueIngest;
  gameFinalEvents: PlannedGameFinalEvent[];
  ok: true;
  recordBrokenEvents: PlannedRecordBrokenEvent[];
  transactionEvents: PlannedTransactionEvent[];
  waiverEvents: PlannedWaiverEvent[];
  sentGameFinalCount: number;
  sentRecordBrokenCount: number;
  sentTransactionCount: number;
  sentWaiverCount: number;
}

export interface SeasonRolloverFailure {
  credentialId: string;
  code: string;
  message: string;
  provider: IngestableProviderId;
}

export interface SeasonRolloverCheckResponse {
  advancedLeagueCount: number;
  checkedCredentialCount: number;
  discoveredLeagueCount: number;
  eventName: typeof JOB_EVENTS.seasonRolloverCheck;
  failures: SeasonRolloverFailure[];
  historicalBackfillCount: number;
  historicalBackfills: PlannedHistoricalBackfillEvent[];
  invalidatedCredentialCount: number;
  limit: number;
  ok: true;
  planned: PlannedLeagueIngestEvent[];
  plannedCount: number;
  sentCount: number;
}

const storedEspnCredentialsSchema = z.object({
  espn_s2: z.string().min(1),
  swid: z.string().min(1),
});

const storedCredentialSchemas = {
  espn: storedEspnCredentialsSchema,
  sleeper: storedSleeperCredentialsSchema,
  yahoo: yahooCredentialsSchema,
} satisfies Record<IngestableProviderId, z.ZodType<unknown>>;

interface AuthenticatedProviderSession {
  credentials: unknown;
  refreshed: boolean;
  session: FantasyProviderSession;
}

const ingestionTickDataSchema = z.object({
  leagueId: z.uuid().optional(),
  leagueIds: z.array(z.uuid()).max(200).optional(),
  limit: z.number().int().min(1).max(MAX_TICK_LIMIT).optional(),
  now: z.iso.datetime().optional(),
});

const leagueIngestDataSchema = z.object({
  credentialId: z.uuid(),
  currentScoringPeriod: z.number().int().positive().optional(),
  dataClasses: z.array(z.enum(PROVIDER_DATA_CLASSES)).optional(),
  leagueId: z.uuid(),
  name: z.string().trim().min(1),
  provider: z.enum(["espn", "sleeper", "yahoo"]),
  providerLeagueId: z.string().trim().min(1),
  season: z.number().int().min(2000).max(2100),
  size: z.number().int().positive().optional(),
  sport: z.enum(["ffl", "unknown"]),
});

const seasonRolloverCheckDataSchema = z.object({
  credentialIds: z.array(z.uuid()).max(200).optional(),
  leagueIds: z.array(z.uuid()).max(200).optional(),
  limit: z.number().int().min(1).max(MAX_ROLLOVER_LIMIT).optional(),
  now: z.iso.datetime().optional(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function liveIngestionError({
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

function parseIngestionTickData(
  data: unknown,
): IngestionTickData & { leagueIds?: string[]; limit: number } {
  const parsed = ingestionTickDataSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw toNonRetriable(
      liveIngestionError({
        cause: parsed.error,
        code: "INGESTION_TICK_INVALID",
        message: "Ingestion tick payload is invalid",
        status: 400,
      }),
    );
  }

  return {
    leagueId: parsed.data.leagueId,
    leagueIds: parsed.data.leagueIds ?? leagueIdsFromSingle(parsed.data),
    limit: parsed.data.limit ?? DEFAULT_TICK_LIMIT,
    now: parsed.data.now,
  };
}

function leagueIdsFromSingle(data: {
  leagueId?: string;
}): string[] | undefined {
  return data.leagueId ? [data.leagueId] : undefined;
}

function ingestionTickTriggerName(
  eventName: string,
): typeof JOB_EVENTS.ingestionTick | typeof JOB_EVENTS.leagueConnected {
  switch (eventName) {
    case JOB_EVENTS.leagueConnected:
      return JOB_EVENTS.leagueConnected;
    default:
      return JOB_EVENTS.ingestionTick;
  }
}

function parseLeagueIngestData(data: unknown): LeagueIngestData {
  const parsed = leagueIngestDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      liveIngestionError({
        cause: parsed.error,
        code: "LEAGUE_INGEST_INVALID",
        message: "League ingest payload is invalid",
        status: 400,
      }),
    );
  }

  return parsed.data;
}

function parseSeasonRolloverCheckData(
  data: unknown,
): SeasonRolloverCheckData & { limit: number } {
  const parsed = seasonRolloverCheckDataSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw toNonRetriable(
      liveIngestionError({
        cause: parsed.error,
        code: "SEASON_ROLLOVER_CHECK_INVALID",
        message: "Season rollover check payload is invalid",
        status: 400,
      }),
    );
  }

  return {
    credentialIds: parsed.data.credentialIds,
    leagueIds: parsed.data.leagueIds,
    limit: parsed.data.limit ?? DEFAULT_ROLLOVER_LIMIT,
    now: parsed.data.now,
  };
}

function currentTime(deps: Pick<LeagueIngestDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function resolveProvider(
  data: Pick<LeagueIngestData, "provider">,
  deps: LeagueIngestDependencies,
): LeagueIngestProvider {
  const provider = deps.providers[data.provider];
  if (!provider) {
    throw toNonRetriable(
      liveIngestionError({
        code: "LEAGUE_INGEST_PROVIDER_UNSUPPORTED",
        message: "Live ingestion provider is not supported",
        status: 400,
      }),
    );
  }

  return provider as LeagueIngestProvider;
}

function resolveRolloverProvider(
  providerId: IngestableProviderId,
  deps: SeasonRolloverCheckDependencies,
): SeasonRolloverProvider {
  const provider = deps.providers[providerId];
  if (!provider) {
    throw toNonRetriable(
      liveIngestionError({
        code: "SEASON_ROLLOVER_PROVIDER_UNSUPPORTED",
        message: "Season rollover provider is not supported",
        status: 400,
      }),
    );
  }

  return provider as SeasonRolloverProvider;
}

function toProviderRef(data: LeagueIngestData): ProviderLeagueRef {
  return {
    name: data.name,
    provider: data.provider,
    providerId: data.providerLeagueId,
    season: data.season,
    sport: data.sport,
    ...(data.size === undefined ? {} : { size: data.size }),
  };
}

async function markCredentialInvalid({
  credentialId,
  deps,
}: {
  credentialId: string;
  deps: Pick<LeagueIngestDependencies, "db" | "now">;
}): Promise<void> {
  const now = currentTime(deps);
  await deps.db
    .update(providerCredentials)
    .set({
      invalidAt: now,
      status: "invalid",
      updatedAt: now,
    })
    .where(eq(providerCredentials.id, credentialId));
}

function authFailureCoverageObservations({
  error,
  provider,
}: {
  error: ProviderError;
  provider: LeagueIngestProvider;
}): DataCoverageObservationMap {
  const observations: DataCoverageObservationMap = {};
  for (const dataClass of PROVIDER_DATA_CLASSES) {
    if (provider.capabilities.dataClasses[dataClass] === "none") {
      continue;
    }
    observations[dataClass] = {
      error,
      itemCount: 0,
    };
  }
  return observations;
}

async function recordAuthExpiredCoverage({
  data,
  deps,
  error,
  provider,
  stage,
}: {
  data: LeagueIngestData;
  deps: Pick<LeagueIngestDependencies, "db" | "now">;
  error: ProviderError;
  provider: LeagueIngestProvider;
  stage: "authenticate" | "sync";
}): Promise<void> {
  await recordDataCoverage({
    capabilities: provider.capabilities,
    db: deps.db,
    defaultDetails: { stage, sync: "current" },
    leagueId: data.leagueId,
    observedAt: currentTime(deps),
    observations: authFailureCoverageObservations({ error, provider }),
    provider: data.provider,
    providerLeagueId: data.providerLeagueId,
    season: data.season,
  });
}

function shouldStopRetries(error: ProviderError): boolean {
  return error.code === "PROVIDER_AUTH_EXPIRED";
}

function isIngestableProvider(
  provider: FantasyProviderId,
): provider is IngestableProviderId {
  switch (provider) {
    case "espn":
    case "sleeper":
    case "yahoo":
      return true;
    default:
      return false;
  }
}

function isYahooProvider(provider: FantasyProviderId): boolean {
  switch (provider) {
    case "yahoo":
      return true;
    default:
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
    LeagueIngestDependencies,
    "cipher" | "db" | "now" | "yahooOAuthClient"
  >;
  provider: Pick<
    FantasyProvider<unknown, FantasyProviderSession>,
    "authenticate"
  >;
  providerId: IngestableProviderId;
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

async function loadCredentialsForLeagueIngest({
  data,
  deps,
}: {
  data: LeagueIngestData;
  deps: LeagueIngestDependencies;
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
    .innerJoin(
      onboardingDiscoveredLeagues,
      and(
        eq(onboardingDiscoveredLeagues.credentialId, providerCredentials.id),
        eq(onboardingDiscoveredLeagues.userId, providerCredentials.userId),
        eq(onboardingDiscoveredLeagues.provider, data.provider),
        eq(onboardingDiscoveredLeagues.providerLeagueId, data.providerLeagueId),
        eq(onboardingDiscoveredLeagues.season, data.season),
      ),
    )
    .where(
      and(
        eq(providerCredentials.id, data.credentialId),
        eq(providerCredentials.provider, data.provider),
        eq(leagues.id, data.leagueId),
        eq(leagues.provider, data.provider),
        eq(leagues.providerLeagueId, data.providerLeagueId),
        eq(leagues.season, data.season),
      ),
    )
    .limit(1);

  if (!row) {
    throw toNonRetriable(
      liveIngestionError({
        code: "LEAGUE_INGEST_NOT_AUTHORIZED",
        message: "Live ingestion credential is not authorized for this league",
        status: 403,
      }),
    );
  }

  if (row.status !== "connected") {
    throw toNonRetriable(
      liveIngestionError({
        code: "LEAGUE_INGEST_CREDENTIAL_NOT_CONNECTED",
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
      liveIngestionError({
        cause,
        code: "LEAGUE_INGEST_CREDENTIAL_DECRYPT_FAILED",
        message: "Provider credential could not be read",
        status: 500,
      }),
    );
  }
}

interface LeagueCredentialRow {
  credentialId: string;
  credentialInvalidAt: Date | null;
  connectionState: "connected" | "invalid";
  currentScoringPeriod: number;
  leagueId: string;
  leagueStatus: IngestionGameStateInput["leagueStatus"];
  name: string;
  provider: IngestableProviderId;
  providerLeagueId: string;
  season: number;
  size: number;
  sport: "ffl" | "unknown";
}

async function listLeagueCredentialTargets({
  db,
  leagueIds,
}: {
  db: Db;
  leagueIds?: readonly string[];
}): Promise<LeagueCredentialRow[]> {
  if (leagueIds?.length === 0) {
    return [];
  }

  return db
    .select({
      credentialId: providerCredentials.id,
      credentialInvalidAt: providerCredentials.invalidAt,
      connectionState: providerCredentials.status,
      currentScoringPeriod: leagues.currentScoringPeriod,
      leagueId: leagues.id,
      leagueStatus: leagues.status,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
      size: leagues.size,
      sport: leagues.sport,
    })
    .from(leagues)
    .innerJoin(members, eq(members.organizationId, leagues.id))
    .innerJoin(
      providerCredentials,
      and(
        eq(providerCredentials.userId, members.userId),
        eq(providerCredentials.provider, leagues.provider),
      ),
    )
    .innerJoin(
      onboardingDiscoveredLeagues,
      and(
        eq(onboardingDiscoveredLeagues.credentialId, providerCredentials.id),
        eq(onboardingDiscoveredLeagues.userId, providerCredentials.userId),
        eq(onboardingDiscoveredLeagues.provider, leagues.provider),
        eq(
          onboardingDiscoveredLeagues.providerLeagueId,
          leagues.providerLeagueId,
        ),
        eq(onboardingDiscoveredLeagues.season, leagues.season),
      ),
    )
    .where(leagueIds ? inArray(leagues.id, [...leagueIds]) : undefined)
    .orderBy(
      asc(leagues.id),
      asc(providerCredentials.provider),
      asc(providerCredentials.id),
    );
}

interface RolloverCredentialTargetRow {
  credentialId: string;
  encryptedPayload: string;
  leagueId: string;
  name: string;
  provider: IngestableProviderId;
  providerLeagueId: string;
  season: number;
  size: number;
  sport: "ffl" | "unknown";
  userId: string;
}

interface RolloverCredentialGroup {
  credentialId: string;
  encryptedPayload: string;
  provider: IngestableProviderId;
  targets: RolloverCredentialTargetRow[];
  userId: string;
}

async function listRolloverCredentialTargets({
  credentialIds,
  db,
  leagueIds,
}: {
  credentialIds?: readonly string[];
  db: Db;
  leagueIds?: readonly string[];
}): Promise<RolloverCredentialGroup[]> {
  if (credentialIds?.length === 0 || leagueIds?.length === 0) {
    return [];
  }

  const filters = [
    eq(providerCredentials.status, "connected"),
    credentialIds ? inArray(providerCredentials.id, [...credentialIds]) : null,
    leagueIds ? inArray(leagues.id, [...leagueIds]) : null,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);

  const rows = await db
    .select({
      credentialId: providerCredentials.id,
      encryptedPayload: providerCredentials.encryptedPayload,
      leagueId: leagues.id,
      name: leagues.name,
      provider: providerCredentials.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
      size: leagues.size,
      sport: leagues.sport,
      userId: providerCredentials.userId,
    })
    .from(providerCredentials)
    .innerJoin(members, eq(members.userId, providerCredentials.userId))
    .innerJoin(
      leagues,
      and(
        eq(leagues.id, members.organizationId),
        eq(leagues.provider, providerCredentials.provider),
      ),
    )
    .where(and(...filters))
    .orderBy(
      asc(providerCredentials.provider),
      asc(providerCredentials.id),
      asc(leagues.id),
    );

  const groups = new Map<string, RolloverCredentialGroup>();
  for (const row of rows) {
    if (!isIngestableProvider(row.provider)) {
      continue;
    }

    const group = groups.get(row.credentialId) ?? {
      credentialId: row.credentialId,
      encryptedPayload: row.encryptedPayload,
      provider: row.provider,
      targets: [],
      userId: row.userId,
    };
    group.targets.push({
      credentialId: row.credentialId,
      encryptedPayload: row.encryptedPayload,
      leagueId: row.leagueId,
      name: row.name,
      provider: row.provider,
      providerLeagueId: row.providerLeagueId,
      season: row.season,
      size: row.size,
      sport: row.sport,
      userId: row.userId,
    });
    groups.set(row.credentialId, group);
  }

  return [...groups.values()];
}

function parseStoredCredentialsForProvider({
  encryptedPayload,
  group,
  deps,
}: {
  deps: SeasonRolloverCheckDependencies;
  encryptedPayload: string;
  group: Pick<RolloverCredentialGroup, "provider">;
}): unknown {
  return storedCredentialSchemas[group.provider].parse(
    deps.cipher.decryptJson(encryptedPayload),
  );
}

function failureForCredential({
  credentialId,
  error,
  provider,
}: {
  credentialId: string;
  error: AppError;
  provider: IngestableProviderId;
}): SeasonRolloverFailure {
  return {
    code: error.code,
    credentialId,
    message: error.message,
    provider,
  };
}

async function persistRolloverDiscoveries({
  credentialId,
  db,
  discovered,
  now,
  userId,
}: {
  credentialId: string;
  db: Db;
  discovered: readonly ProviderLeagueRef[];
  now: Date;
  userId: string;
}): Promise<void> {
  for (const ref of discovered) {
    await db
      .insert(onboardingDiscoveredLeagues)
      .values({
        credentialId,
        lastDiscoveredAt: now,
        name: ref.name,
        provider: ref.provider,
        providerLeagueId: ref.providerId,
        providerTeamId: ref.providerTeamId ?? null,
        season: ref.season,
        size: ref.size ?? null,
        sport: ref.sport,
        teamName: ref.teamName ?? null,
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
}

function yahooLeagueNumber(providerLeagueId: string): string | undefined {
  const marker = ".l.";
  const markerIndex = providerLeagueId.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const leagueNumber = providerLeagueId.slice(markerIndex + marker.length);
  return leagueNumber.length > 0 ? leagueNumber : undefined;
}

function sameRolloverLeague(
  ref: ProviderLeagueRef,
  target: RolloverCredentialTargetRow,
): boolean {
  if (ref.provider !== target.provider || ref.season <= target.season) {
    return false;
  }

  if (ref.providerId === target.providerLeagueId) {
    return true;
  }

  if (ref.previousProviderId === target.providerLeagueId) {
    return true;
  }

  if (ref.linkedProviderIds?.includes(target.providerLeagueId)) {
    return true;
  }

  if (isYahooProvider(ref.provider)) {
    const refLeagueNumber = yahooLeagueNumber(ref.providerId);
    return (
      refLeagueNumber !== undefined &&
      refLeagueNumber === yahooLeagueNumber(target.providerLeagueId)
    );
  }

  return false;
}

function latestRolloverRefForTarget({
  discovered,
  target,
}: {
  discovered: readonly ProviderLeagueRef[];
  target: RolloverCredentialTargetRow;
}): ProviderLeagueRef | undefined {
  return discovered
    .filter((ref) => sameRolloverLeague(ref, target))
    .sort(
      (left, right) =>
        right.season - left.season ||
        right.providerId.localeCompare(left.providerId),
    )[0];
}

async function advanceLeagueForRollover({
  db,
  now,
  ref,
  target,
}: {
  db: Db;
  now: Date;
  ref: ProviderLeagueRef;
  target: RolloverCredentialTargetRow;
}): Promise<boolean> {
  const [updated] = await db
    .update(leagues)
    .set({
      name: ref.name,
      providerLeagueId: ref.providerId,
      season: ref.season,
      size: ref.size ?? target.size,
      sport: ref.sport,
      status: "unknown",
      updatedAt: now,
    })
    .where(
      and(
        eq(leagues.id, target.leagueId),
        eq(leagues.provider, target.provider),
        eq(leagues.providerLeagueId, target.providerLeagueId),
        eq(leagues.season, target.season),
      ),
    )
    .returning({ id: leagues.id });

  return updated !== undefined;
}

function rolloverEventFor({
  credentialId,
  leagueId,
  ref,
}: {
  credentialId: string;
  leagueId: string;
  ref: ProviderLeagueRef;
}): PlannedLeagueIngestEvent {
  const data: LeagueIngestData = {
    credentialId,
    dataClasses: [...LIVE_INGESTION_DATA_CLASSES],
    leagueId,
    name: ref.name,
    provider: ref.provider as IngestableProviderId,
    providerLeagueId: ref.providerId,
    season: ref.season,
    ...(ref.size === undefined ? {} : { size: ref.size }),
    sport: ref.sport,
  };

  return {
    data,
    id: [
      JOB_EVENTS.leagueIngest,
      "rollover",
      leagueId,
      ref.provider,
      ref.providerId,
      ref.season,
    ].join(":"),
    name: JOB_EVENTS.leagueIngest,
  };
}

function rolloverHistoricalBackfillSeasons({
  currentSeason,
  previousSeason,
}: {
  currentSeason: number;
  previousSeason: number;
}): number[] {
  const seasonCount = Math.min(10, Math.max(0, currentSeason - previousSeason));
  return Array.from(
    { length: seasonCount },
    (_, index) => currentSeason - 1 - index,
  ).filter((season) => season >= previousSeason);
}

function rolloverHistoricalBackfillEventFor({
  credentialId,
  leagueId,
  ref,
  target,
}: {
  credentialId: string;
  leagueId: string;
  ref: ProviderLeagueRef;
  target: RolloverCredentialTargetRow;
}): PlannedHistoricalBackfillEvent | null {
  const seasons = rolloverHistoricalBackfillSeasons({
    currentSeason: ref.season,
    previousSeason: target.season,
  });
  if (seasons.length === 0) {
    return null;
  }

  const data: ImportRequestedData = {
    credentialId,
    leagueId,
    name: ref.name,
    provider: ref.provider as IngestableProviderId,
    providerLeagueId: ref.providerId,
    season: ref.season,
    seasons,
    ...(ref.size === undefined ? {} : { size: ref.size }),
    sport: ref.sport,
    ...(ref.teamName ? { teamName: ref.teamName } : {}),
  };

  return {
    data,
    id: [
      JOB_EVENTS.importRequested,
      "rollover-backfill",
      leagueId,
      ref.provider,
      ref.providerId,
      ref.season,
      seasons.join(","),
    ].join(":"),
    name: JOB_EVENTS.importRequested,
  };
}

type CoverageByDataClass = Partial<Record<LiveIngestionDataClass, Date>>;

interface DueDataClassPlan {
  dataClass: LiveIngestionDataClass;
  intervalMs: number;
}

async function loadCoverageByDataClass({
  db,
  row,
}: {
  db: Db;
  row: LeagueCredentialRow;
}): Promise<CoverageByDataClass> {
  const coverageRows = await withLeagueContext(db, row.leagueId, (tx) =>
    tx
      .select({
        dataClass: dataCoverage.dataClass,
        observedAt: dataCoverage.observedAt,
      })
      .from(dataCoverage)
      .where(
        and(
          eq(dataCoverage.leagueId, row.leagueId),
          eq(dataCoverage.provider, row.provider),
          eq(dataCoverage.providerLeagueId, row.providerLeagueId),
          eq(dataCoverage.season, row.season),
          inArray(dataCoverage.dataClass, [...LIVE_INGESTION_DATA_CLASSES]),
        ),
      ),
  );

  return Object.fromEntries(
    coverageRows.map((coverage) => [
      coverage.dataClass as LiveIngestionDataClass,
      coverage.observedAt,
    ]),
  );
}

function dueDataClassesFor({
  coverage,
  force,
  gameState,
  now,
  pollPolicy,
}: {
  coverage: CoverageByDataClass;
  force: boolean;
  gameState: IngestionGameState;
  now: Date;
  pollPolicy: PollPolicy;
}): DueDataClassPlan[] {
  return LIVE_INGESTION_DATA_CLASSES.flatMap((dataClass) => {
    const decision = pollPolicy.due({
      dataClass,
      gameState,
      lastSyncedAt: coverage[dataClass],
      now,
    });
    return force || decision.due
      ? [{ dataClass, intervalMs: decision.intervalMs }]
      : [];
  });
}

function idempotencyWindowBucket({
  gameState,
  intervalMs,
  now,
}: {
  gameState: IngestionGameState;
  intervalMs: number;
  now: Date;
}): string {
  return `${gameState}:${Math.floor(now.getTime() / intervalMs)}`;
}

function plannedEventFor({
  dueDataClasses,
  gameState,
  now,
  row,
}: {
  dueDataClasses: readonly DueDataClassPlan[];
  gameState: IngestionGameState;
  now: Date;
  row: LeagueCredentialRow;
}): PlannedLeagueIngestEvent {
  const dataClasses = dueDataClasses.map((plan) => plan.dataClass);
  const shortestIntervalMs = dueDataClasses.reduce(
    (shortest, plan) => Math.min(shortest, plan.intervalMs),
    Number.POSITIVE_INFINITY,
  );
  const data: LeagueIngestData = {
    credentialId: row.credentialId,
    ...(row.currentScoringPeriod > 0
      ? { currentScoringPeriod: row.currentScoringPeriod }
      : {}),
    dataClasses,
    leagueId: row.leagueId,
    name: row.name,
    provider: row.provider,
    providerLeagueId: row.providerLeagueId,
    season: row.season,
    ...(row.size > 0 ? { size: row.size } : {}),
    sport: row.sport,
  };
  return {
    data,
    id: [
      JOB_EVENTS.leagueIngest,
      row.leagueId,
      row.provider,
      row.providerLeagueId,
      row.season,
      dataClasses.join(","),
      idempotencyWindowBucket({
        gameState,
        intervalMs: Number.isFinite(shortestIntervalMs)
          ? shortestIntervalMs
          : 60 * 1000,
        now,
      }),
    ].join(":"),
    name: JOB_EVENTS.leagueIngest,
  };
}

function targetKeyFor(
  row: Pick<
    LeagueCredentialRow,
    "leagueId" | "provider" | "providerLeagueId" | "season"
  >,
): string {
  return [row.leagueId, row.provider, row.providerLeagueId, row.season].join(
    ":",
  );
}

function pausedTargetsFor(
  rows: readonly LeagueCredentialRow[],
  connectedKeys: ReadonlySet<string>,
): PausedLeagueIngestTarget[] {
  const seen = new Set<string>();
  const paused: PausedLeagueIngestTarget[] = [];

  for (const row of rows) {
    if (row.connectionState !== "invalid") {
      continue;
    }
    const key = targetKeyFor(row);
    if (connectedKeys.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);

    paused.push({
      connectionState: "invalid",
      credentialId: row.credentialId,
      leagueId: row.leagueId,
      name: row.name,
      provider: row.provider,
      providerLeagueId: row.providerLeagueId,
      reconnect: reconnectActionForProvider(row.provider),
      season: row.season,
      sport: row.sport,
      ...(row.credentialInvalidAt
        ? { connectionInvalidAt: row.credentialInvalidAt.toISOString() }
        : {}),
    });
  }

  return paused;
}

function plannedGameFinalEventsFor(
  sync: CurrentLeagueSyncResult,
): PlannedGameFinalEvent[] {
  return sync.changedFinalMatchups.map((matchup) => ({
    data: {
      gameId: matchup.id,
      leagueId: sync.league.id,
      sourceContentHash: matchup.contentHash,
    },
    id: [
      JOB_EVENTS.gameFinal,
      sync.league.id,
      matchup.id,
      matchup.contentHash,
    ].join(":"),
    name: JOB_EVENTS.gameFinal,
  }));
}

function plannedRecordBrokenEventsFor(
  sync: CurrentLeagueSyncResult,
): PlannedRecordBrokenEvent[] {
  return sync.recordBrokenHooks.map((hook) => ({
    data: {
      leagueId: sync.league.id,
      recordKey: hook.recordKey,
    },
    id: `${JOB_EVENTS.recordBroken}:${sync.league.id}:${hook.recordKey}`,
    name: JOB_EVENTS.recordBroken,
  }));
}

function plannedTransactionEventsFor(
  sync: CurrentLeagueSyncResult,
): PlannedTransactionEvent[] {
  return sync.changedTransactions
    .filter((transaction) => transaction.type !== "waiver")
    .map((transaction) => ({
      data: {
        leagueId: sync.league.id,
        transactionId: transaction.id,
      },
      id: `${JOB_EVENTS.transaction}:${sync.league.id}:${transaction.id}`,
      name: JOB_EVENTS.transaction,
    }));
}

function plannedWaiverEventsFor(
  sync: CurrentLeagueSyncResult,
): PlannedWaiverEvent[] {
  return sync.changedTransactions
    .filter((transaction) => transaction.type === "waiver")
    .map((transaction) => ({
      data: {
        leagueId: sync.league.id,
        waiverId: transaction.id,
      },
      id: `${JOB_EVENTS.waiver}:${sync.league.id}:${transaction.id}`,
      name: JOB_EVENTS.waiver,
    }));
}

async function getDefaultIngestionTickDependencies(): Promise<IngestionTickDependencies> {
  const [{ getEnv }, { getDb }] = await Promise.all([
    import("@/core/env"),
    import("@/db"),
  ]);
  const env = getEnv();
  return {
    db: getDb(),
    globalPollPolicyConfig: env.ingestion.pollPolicyConfig,
  };
}

async function getDefaultLeagueIngestDependencies(): Promise<LeagueIngestDependencies> {
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

async function getDefaultSeasonRolloverCheckDependencies(): Promise<SeasonRolloverCheckDependencies> {
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
    yahooOAuthClient: createYahooOAuthClientForEnv(env),
  };
}

export async function runIngestionTick({
  data: rawData,
  deps,
  eventName = JOB_EVENTS.ingestionTick,
}: {
  data: unknown;
  deps: IngestionTickDependencies;
  eventName?:
    | typeof JOB_EVENTS.ingestionTick
    | typeof JOB_EVENTS.leagueConnected;
}): Promise<IngestionTickResponse> {
  const data = parseIngestionTickData(rawData);
  const now = data.now ? new Date(data.now) : (deps.now?.() ?? new Date());
  const gameStateProvider = deps.gameStateProvider ?? defaultGameStateProvider;
  const pollPolicy =
    deps.pollPolicy ??
    createConfiguredPollPolicy({
      callSiteConfig: deps.pollPolicyConfigOverride,
      globalConfig: deps.globalPollPolicyConfig,
    });
  const forceDue = eventName === JOB_EVENTS.leagueConnected;
  const rows = await listLeagueCredentialTargets({
    db: deps.db,
    leagueIds: data.leagueIds,
  });
  const connectedRows = rows.filter(
    (row) => row.connectionState === "connected",
  );
  const connectedKeys = new Set(connectedRows.map(targetKeyFor));
  const paused = pausedTargetsFor(rows, connectedKeys);
  const planned: PlannedLeagueIngestEvent[] = [];
  const seen = new Set<string>();
  let skippedDuplicateCredentials = 0;
  let skippedNotDue = 0;

  for (const row of connectedRows) {
    const key = targetKeyFor(row);
    if (seen.has(key)) {
      skippedDuplicateCredentials += 1;
      continue;
    }
    seen.add(key);

    const gameState = await gameStateProvider.stateForLeague({
      currentScoringPeriod: row.currentScoringPeriod,
      leagueId: row.leagueId,
      leagueStatus: row.leagueStatus,
      now,
      provider: row.provider,
      providerLeagueId: row.providerLeagueId,
      season: row.season,
    });
    const coverage = await loadCoverageByDataClass({ db: deps.db, row });
    const dueDataClasses = dueDataClassesFor({
      coverage,
      force: forceDue,
      gameState,
      now,
      pollPolicy,
    });
    if (dueDataClasses.length === 0) {
      skippedNotDue += 1;
      continue;
    }

    planned.push(
      plannedEventFor({
        dueDataClasses,
        gameState,
        now,
        row,
      }),
    );
    if (planned.length >= data.limit) {
      break;
    }
  }

  return {
    connectedRows: connectedRows.length,
    eventName,
    limit: data.limit,
    ok: true,
    paused,
    pausedCount: paused.length,
    planned,
    plannedCount: planned.length,
    sentCount: 0,
    skippedDuplicateCredentials,
    skippedNotDue,
  };
}

export async function runLeagueIngest({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: LeagueIngestDependencies;
}): Promise<LeagueIngestResponse> {
  const data = parseLeagueIngestData(rawData);
  const provider = resolveProvider(data, deps);
  const credentials = await loadCredentialsForLeagueIngest({ data, deps });
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
      await recordAuthExpiredCoverage({
        data,
        deps,
        error: auth.error,
        provider,
        stage: "authenticate",
      });
    }
    throwProviderError(auth.error);
  }

  const syncCurrent = deps.syncCurrent ?? syncCurrentLeague;
  let sync = await syncCurrent({
    currentScoringPeriod: data.currentScoringPeriod,
    dataClasses: data.dataClasses,
    db: deps.db,
    leagueId: data.leagueId,
    now: deps.now,
    provider,
    realtime: deps.realtime,
    ref: toProviderRef(data),
    session: auth.value.session,
  });
  if (
    !sync.ok &&
    shouldStopRetries(sync.error) &&
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
        sync = await syncCurrent({
          currentScoringPeriod: data.currentScoringPeriod,
          dataClasses: data.dataClasses,
          db: deps.db,
          leagueId: data.leagueId,
          now: deps.now,
          provider,
          realtime: deps.realtime,
          ref: toProviderRef(data),
          session: auth.value.session,
        });
      } else {
        sync = err(retryAuth.error);
      }
    } else {
      sync = err(refreshed.error);
    }
  }

  if (!sync.ok) {
    if (shouldStopRetries(sync.error)) {
      await markCredentialInvalid({ credentialId: data.credentialId, deps });
      await recordAuthExpiredCoverage({
        data,
        deps,
        error: sync.error,
        provider,
        stage: "sync",
      });
    }
    throwProviderError(sync.error);
  }

  const gameFinalEvents = plannedGameFinalEventsFor(sync.value);
  const recordBrokenEvents = plannedRecordBrokenEventsFor(sync.value);
  const transactionEvents = plannedTransactionEventsFor(sync.value);
  const waiverEvents = plannedWaiverEventsFor(sync.value);

  return {
    dataClasses: data.dataClasses ?? [...PROVIDER_DATA_CLASSES],
    eventName: JOB_EVENTS.leagueIngest,
    gameFinalEvents,
    ok: true,
    recordBrokenEvents,
    transactionEvents,
    waiverEvents,
    sentGameFinalCount: 0,
    sentRecordBrokenCount: 0,
    sentTransactionCount: 0,
    sentWaiverCount: 0,
    ...sync.value,
  };
}

export async function runSeasonRolloverCheck({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: SeasonRolloverCheckDependencies;
}): Promise<SeasonRolloverCheckResponse> {
  const data = parseSeasonRolloverCheckData(rawData);
  const now = data.now ? new Date(data.now) : currentTime(deps);
  const groups = (
    await listRolloverCredentialTargets({
      credentialIds: data.credentialIds,
      db: deps.db,
      leagueIds: data.leagueIds,
    })
  ).slice(0, data.limit);
  const planned = new Map<string, PlannedLeagueIngestEvent>();
  const historicalBackfills = new Map<string, PlannedHistoricalBackfillEvent>();
  const failures: SeasonRolloverFailure[] = [];
  let advancedLeagueCount = 0;
  let discoveredLeagueCount = 0;
  let invalidatedCredentialCount = 0;

  for (const group of groups) {
    const provider = resolveRolloverProvider(group.provider, deps);
    let credentials: unknown;
    try {
      credentials = parseStoredCredentialsForProvider({
        deps,
        encryptedPayload: group.encryptedPayload,
        group,
      });
    } catch (cause) {
      failures.push(
        failureForCredential({
          credentialId: group.credentialId,
          error: liveIngestionError({
            cause,
            code: "SEASON_ROLLOVER_CREDENTIAL_DECRYPT_FAILED",
            message: "Provider credential could not be read",
            status: 500,
          }),
          provider: group.provider,
        }),
      );
      continue;
    }

    let auth = await authenticateWithYahooRefresh({
      credentialId: group.credentialId,
      credentials,
      deps,
      provider,
      providerId: group.provider,
    });
    if (!auth.ok) {
      if (shouldStopRetries(auth.error)) {
        await markCredentialInvalid({
          credentialId: group.credentialId,
          deps,
        });
        invalidatedCredentialCount += 1;
      }
      failures.push(
        failureForCredential({
          credentialId: group.credentialId,
          error: auth.error,
          provider: group.provider,
        }),
      );
      continue;
    }

    let discovered = await provider.discoverLeagues(auth.value.session);
    if (
      !discovered.ok &&
      shouldStopRetries(discovered.error) &&
      isYahooProvider(group.provider) &&
      !auth.value.refreshed
    ) {
      const refreshed = await refreshStoredYahooCredentials({
        credentialId: group.credentialId,
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
          discovered = await provider.discoverLeagues(auth.value.session);
        } else {
          discovered = err(retryAuth.error);
        }
      } else {
        discovered = err(refreshed.error);
      }
    }
    if (!discovered.ok) {
      if (shouldStopRetries(discovered.error)) {
        await markCredentialInvalid({
          credentialId: group.credentialId,
          deps,
        });
        invalidatedCredentialCount += 1;
      }
      failures.push(
        failureForCredential({
          credentialId: group.credentialId,
          error: discovered.error,
          provider: group.provider,
        }),
      );
      continue;
    }

    discoveredLeagueCount += discovered.value.length;
    await persistRolloverDiscoveries({
      credentialId: group.credentialId,
      db: deps.db,
      discovered: discovered.value,
      now,
      userId: group.userId,
    });

    for (const target of group.targets) {
      const ref = latestRolloverRefForTarget({
        discovered: discovered.value,
        target,
      });
      if (!ref) {
        continue;
      }

      const event = rolloverEventFor({
        credentialId: group.credentialId,
        leagueId: target.leagueId,
        ref,
      });
      if (planned.has(event.id)) {
        continue;
      }

      const advanced = await advanceLeagueForRollover({
        db: deps.db,
        now,
        ref,
        target,
      });
      if (!advanced) {
        continue;
      }

      planned.set(event.id, event);
      const backfill = rolloverHistoricalBackfillEventFor({
        credentialId: group.credentialId,
        leagueId: target.leagueId,
        ref,
        target,
      });
      if (backfill) {
        historicalBackfills.set(backfill.id, backfill);
      }
      advancedLeagueCount += 1;
    }
  }

  return {
    advancedLeagueCount,
    checkedCredentialCount: groups.length,
    discoveredLeagueCount,
    eventName: JOB_EVENTS.seasonRolloverCheck,
    failures,
    historicalBackfillCount: historicalBackfills.size,
    historicalBackfills: [...historicalBackfills.values()],
    invalidatedCredentialCount,
    limit: data.limit,
    ok: true,
    planned: [...planned.values()],
    plannedCount: planned.size,
    sentCount: 0,
  };
}

export function createIngestionTickFunction(
  resolveDeps: () =>
    | IngestionTickDependencies
    | Promise<IngestionTickDependencies> = getDefaultIngestionTickDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Plans live fantasy ingestion work for connected leagues and fans out league.ingest events.",
      id: "ingestion-tick",
      idempotency: "event.id",
      name: "Ingestion tick",
      triggers: [
        { event: JOB_EVENTS.ingestionTick },
        { event: JOB_EVENTS.leagueConnected },
        cron("TZ=UTC * * * * *"),
      ],
    },
    async ({ event, step }): Promise<IngestionTickResponse> =>
      recordJobRun("ingestion-tick", async () => {
        const deps = await resolveDeps();
        const plan = await step.run("plan-league-ingest-events", () =>
          runIngestionTick({
            data: event.data,
            deps,
            eventName: ingestionTickTriggerName(event.name),
          }),
        );

        if (plan.planned.length > 0) {
          await step.sendEvent("send-league-ingest-events", plan.planned);
        }

        return {
          ...plan,
          sentCount: plan.planned.length,
        };
      }),
  );
}

export function createLeagueIngestFunction(
  resolveDeps: () =>
    | LeagueIngestDependencies
    | Promise<LeagueIngestDependencies> = getDefaultLeagueIngestDependencies,
) {
  return inngest.createFunction(
    {
      concurrency: {
        key: "event.data.provider",
        limit: 4,
      },
      description:
        "Runs current fantasy ingestion for one connected league from stored provider credentials.",
      id: "league-ingest",
      idempotency: "event.id",
      name: "League ingest",
      triggers: [{ event: JOB_EVENTS.leagueIngest }],
    },
    async ({ event, step }): Promise<LeagueIngestResponse> =>
      recordJobRun("league-ingest", async () => {
        const deps = await resolveDeps();
        const result = await step.run("sync-current-league", () =>
          runLeagueIngest({ data: event.data, deps }),
        );
        if (result.gameFinalEvents.length > 0) {
          await step.sendEvent(
            "send-game-final-events",
            result.gameFinalEvents,
          );
        }
        if (result.recordBrokenEvents.length > 0) {
          await step.sendEvent(
            "send-record-broken-events",
            result.recordBrokenEvents,
          );
        }
        if (result.transactionEvents.length > 0) {
          await step.sendEvent(
            "send-transaction-events",
            result.transactionEvents,
          );
        }
        if (result.waiverEvents.length > 0) {
          await step.sendEvent("send-waiver-events", result.waiverEvents);
        }
        return {
          ...result,
          sentGameFinalCount: result.gameFinalEvents.length,
          sentRecordBrokenCount: result.recordBrokenEvents.length,
          sentTransactionCount: result.transactionEvents.length,
          sentWaiverCount: result.waiverEvents.length,
        };
      }),
  );
}

export function createSeasonRolloverCheckFunction(
  resolveDeps: () =>
    | SeasonRolloverCheckDependencies
    | Promise<SeasonRolloverCheckDependencies> = getDefaultSeasonRolloverCheckDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Re-discovers connected fantasy credentials and starts live ingestion when a provider opens a new season.",
      id: "season-rollover-check",
      idempotency: "event.id",
      name: "Season rollover check",
      triggers: [
        { event: JOB_EVENTS.seasonRolloverCheck },
        cron("TZ=UTC 17 9 * * *"),
      ],
    },
    async ({ event, step }): Promise<SeasonRolloverCheckResponse> =>
      recordJobRun("season-rollover-check", async () => {
        const deps = await resolveDeps();
        const plan = await step.run("plan-season-rollover-ingest", () =>
          runSeasonRolloverCheck({ data: event.data, deps }),
        );

        if (plan.planned.length > 0) {
          await step.sendEvent("send-season-rollover-ingest", plan.planned);
        }
        if (plan.historicalBackfills.length > 0) {
          await step.sendEvent(
            "send-season-rollover-history-backfill",
            plan.historicalBackfills,
          );
        }

        return {
          ...plan,
          sentCount: plan.planned.length + plan.historicalBackfills.length,
        };
      }),
  );
}

export const ingestionTick = createIngestionTickFunction();
export const leagueIngest = createLeagueIngestFunction();
export const seasonRolloverCheck = createSeasonRolloverCheckFunction();
