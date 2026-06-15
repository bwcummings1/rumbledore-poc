import { and, asc, eq, inArray } from "drizzle-orm";
import { cron, NonRetriableError } from "inngest";
import { z } from "zod";
import { recordJobRun } from "@/core/metrics";
import { AppError, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import {
  leagues,
  members,
  onboardingDiscoveredLeagues,
  providerCredentials,
} from "@/db/schema";
import {
  type CurrentLeagueSyncError,
  type CurrentLeagueSyncInput,
  type CurrentLeagueSyncResult,
  syncCurrentLeague,
} from "@/ingestion";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";
import { storedSleeperCredentialsSchema } from "@/onboarding/provider-service";
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
import { inngest } from "../client";
import {
  type IngestionTickData,
  JOB_EVENTS,
  type LeagueIngestData,
} from "../events";

const DEFAULT_TICK_LIMIT = 500;
const MAX_TICK_LIMIT = 2000;

type LeagueIngestProvider = Pick<
  FantasyProvider<unknown, FantasyProviderSession>,
  | "authenticate"
  | "capabilities"
  | "getLeague"
  | "getMatchups"
  | "getMembers"
  | "getTeams"
> &
  Partial<Pick<FantasyProvider<unknown, FantasyProviderSession>, "getRosters">>;

type IngestableProviderId = Extract<
  FantasyProviderId,
  "espn" | "sleeper" | "yahoo"
>;

type LeagueIngestProviderRegistry = Partial<
  Record<IngestableProviderId, unknown>
>;

type SyncCurrentLeagueFn = (
  input: CurrentLeagueSyncInput<FantasyProviderSession>,
) => Promise<Result<CurrentLeagueSyncResult, CurrentLeagueSyncError>>;

export interface IngestionTickDependencies {
  db: Db;
  now?: () => Date;
}

export interface LeagueIngestDependencies {
  cipher: CredentialCipher;
  db: Db;
  now?: () => Date;
  providers: LeagueIngestProviderRegistry;
  realtime?: RealtimePublisher;
  syncCurrent?: SyncCurrentLeagueFn;
}

export interface PlannedLeagueIngestEvent {
  data: LeagueIngestData;
  id: string;
  name: typeof JOB_EVENTS.leagueIngest;
}

export interface IngestionTickResponse {
  connectedRows: number;
  eventName:
    | typeof JOB_EVENTS.ingestionTick
    | typeof JOB_EVENTS.leagueConnected;
  limit: number;
  ok: true;
  planned: PlannedLeagueIngestEvent[];
  plannedCount: number;
  sentCount: number;
  skippedDuplicateCredentials: number;
}

export interface LeagueIngestResponse extends CurrentLeagueSyncResult {
  dataClasses: ProviderDataClass[];
  eventName: typeof JOB_EVENTS.leagueIngest;
  ok: true;
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

const ingestionTickDataSchema = z.object({
  leagueId: z.uuid().optional(),
  leagueIds: z.array(z.uuid()).max(200).optional(),
  limit: z.number().int().min(1).max(MAX_TICK_LIMIT).optional(),
  now: z.iso.datetime().optional(),
});

const leagueIngestDataSchema = z.object({
  credentialId: z.uuid(),
  dataClasses: z.array(z.enum(PROVIDER_DATA_CLASSES)).optional(),
  leagueId: z.uuid(),
  name: z.string().trim().min(1),
  provider: z.enum(["espn", "sleeper", "yahoo"]),
  providerLeagueId: z.string().trim().min(1),
  season: z.number().int().min(2000).max(2100),
  size: z.number().int().positive().optional(),
  sport: z.enum(["ffl", "unknown"]),
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
  deps: LeagueIngestDependencies;
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

function shouldStopRetries(error: ProviderError): boolean {
  return error.code === "PROVIDER_AUTH_EXPIRED";
}

function throwProviderError(error: ProviderError): never {
  if (shouldStopRetries(error)) {
    throw toNonRetriable(error);
  }

  throw error;
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

interface ConnectedLeagueRow {
  credentialId: string;
  leagueId: string;
  name: string;
  provider: IngestableProviderId;
  providerLeagueId: string;
  season: number;
  size: number;
  sport: "ffl" | "unknown";
}

async function listConnectedLeagueTargets({
  db,
  leagueIds,
}: {
  db: Db;
  leagueIds?: readonly string[];
}): Promise<ConnectedLeagueRow[]> {
  if (leagueIds?.length === 0) {
    return [];
  }

  return db
    .select({
      credentialId: providerCredentials.id,
      leagueId: leagues.id,
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
    .where(
      and(
        eq(providerCredentials.status, "connected"),
        leagueIds ? inArray(leagues.id, [...leagueIds]) : undefined,
      ),
    )
    .orderBy(
      asc(leagues.id),
      asc(providerCredentials.provider),
      asc(providerCredentials.id),
    );
}

function plannedEventFor(row: ConnectedLeagueRow): PlannedLeagueIngestEvent {
  const data: LeagueIngestData = {
    credentialId: row.credentialId,
    dataClasses: ["league", "teams", "members", "rosters", "matchups"],
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
    ].join(":"),
    name: JOB_EVENTS.leagueIngest,
  };
}

async function getDefaultIngestionTickDependencies(): Promise<IngestionTickDependencies> {
  const { getDb } = await import("@/db");
  return { db: getDb() };
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
  const rows = await listConnectedLeagueTargets({
    db: deps.db,
    leagueIds: data.leagueIds,
  });
  const planned: PlannedLeagueIngestEvent[] = [];
  const seen = new Set<string>();
  let skippedDuplicateCredentials = 0;

  for (const row of rows) {
    const key = [
      row.leagueId,
      row.provider,
      row.providerLeagueId,
      row.season,
    ].join(":");
    if (seen.has(key)) {
      skippedDuplicateCredentials += 1;
      continue;
    }
    seen.add(key);
    planned.push(plannedEventFor(row));
    if (planned.length >= data.limit) {
      break;
    }
  }

  return {
    connectedRows: rows.length,
    eventName,
    limit: data.limit,
    ok: true,
    planned,
    plannedCount: planned.length,
    sentCount: 0,
    skippedDuplicateCredentials,
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
  const session = await provider.authenticate(credentials);

  if (!session.ok) {
    if (shouldStopRetries(session.error)) {
      await markCredentialInvalid({ credentialId: data.credentialId, deps });
    }
    throwProviderError(session.error);
  }

  const sync = await (deps.syncCurrent ?? syncCurrentLeague)({
    db: deps.db,
    now: deps.now,
    provider,
    realtime: deps.realtime,
    ref: toProviderRef(data),
    session: session.value,
  });

  if (!sync.ok) {
    if (shouldStopRetries(sync.error)) {
      await markCredentialInvalid({ credentialId: data.credentialId, deps });
    }
    throwProviderError(sync.error);
  }

  return {
    dataClasses: data.dataClasses ?? [...PROVIDER_DATA_CLASSES],
    eventName: JOB_EVENTS.leagueIngest,
    ok: true,
    ...sync.value,
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
            eventName:
              event.name === JOB_EVENTS.leagueConnected
                ? JOB_EVENTS.leagueConnected
                : JOB_EVENTS.ingestionTick,
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
        return step.run("sync-current-league", () =>
          runLeagueIngest({ data: event.data, deps }),
        );
      }),
  );
}

export const ingestionTick = createIngestionTickFunction();
export const leagueIngest = createLeagueIngestFunction();
