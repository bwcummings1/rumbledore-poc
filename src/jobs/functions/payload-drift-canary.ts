import { and, asc, eq, inArray } from "drizzle-orm";
import { cron, NonRetriableError } from "inngest";
import { z } from "zod";
import type { Env } from "@/core/env/schema";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import {
  leagues,
  onboardingDiscoveredLeagues,
  providerCredentials,
} from "@/db/schema";
import {
  createFixtureProviderPayloadCanaryProvider,
  type ProviderPayloadCanaryProvider,
  runProviderPayloadCanary,
} from "@/ingestion";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";
import { storedSleeperCredentialsSchema } from "@/onboarding/provider-service";
import { createEspnDiscoveryProvider } from "@/providers/espn/client";
import type { FantasyProviderId, ProviderLeagueRef } from "@/providers/model";
import { createSleeperProvider } from "@/providers/sleeper/client";
import {
  createYahooProvider,
  yahooCredentialsSchema,
} from "@/providers/yahoo/client";
import { inngest } from "../client";
import {
  JOB_EVENTS,
  type PayloadDriftCanaryData,
  type PayloadDriftCanaryLeagueData,
} from "../events";

const DEFAULT_CANARY_LIMIT = 500;
const MAX_CANARY_LIMIT = 2000;

type CanaryProviderId = Extract<
  FantasyProviderId,
  "espn" | "sleeper" | "yahoo"
>;

export interface PayloadDriftCanaryTarget
  extends Omit<PayloadDriftCanaryLeagueData, "observedAt"> {}

export interface PlannedPayloadDriftCanaryEvent {
  data: PayloadDriftCanaryLeagueData;
  id: string;
  name: typeof JOB_EVENTS.payloadDriftCanaryLeague;
}

export interface PayloadDriftCanaryTickResponse {
  eventName: typeof JOB_EVENTS.payloadDriftCanary;
  ok: true;
  planned: PlannedPayloadDriftCanaryEvent[];
  plannedCount: number;
  sentCount: number;
}

export interface PayloadDriftCanaryLeagueResponse {
  alertCount: number;
  eventName: typeof JOB_EVENTS.payloadDriftCanaryLeague;
  leagueId: string;
  observationCount: number;
  ok: true;
  scoreboardPeriod: number;
}

export interface PayloadDriftCanaryTickDependencies {
  db: Db;
  listTargets?: typeof listPayloadDriftCanaryTargets;
  now?: () => Date;
}

export interface PayloadDriftCanaryLeagueDependencies {
  cipher: CredentialCipher;
  db: Db;
  now?: () => Date;
  providerFor: (
    target: PayloadDriftCanaryTarget,
  ) => ProviderPayloadCanaryProvider;
}

const payloadDriftCanaryDataSchema = z.object({
  leagueIds: z.array(z.uuid()).max(200).optional(),
  limit: z.number().int().min(1).max(MAX_CANARY_LIMIT).optional(),
  observedAt: z.iso.datetime().optional(),
});

const payloadDriftCanaryLeagueDataSchema = z.object({
  credentialId: z.uuid(),
  leagueId: z.uuid(),
  name: z.string().trim().min(1),
  observedAt: z.iso.datetime(),
  provider: z.enum(["espn", "sleeper", "yahoo"]),
  providerLeagueId: z.string().trim().min(1),
  season: z.number().int().min(2000).max(2100),
  size: z.number().int().positive(),
  sport: z.enum(["ffl", "unknown"]),
});

const storedEspnCredentialsSchema = z.object({
  espn_s2: z.string().min(1),
  swid: z.string().min(1),
});

const storedCredentialSchemas = {
  espn: storedEspnCredentialsSchema,
  sleeper: storedSleeperCredentialsSchema,
  yahoo: yahooCredentialsSchema,
} satisfies Record<CanaryProviderId, z.ZodType<unknown>>;

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function canaryError({
  cause,
  code,
  message,
  status,
}: {
  cause?: unknown;
  code: string;
  message: string;
  status: number;
}) {
  return new AppError({ cause, code, message, status });
}

function parseTickData(data: unknown): PayloadDriftCanaryData & {
  limit: number;
} {
  const parsed = payloadDriftCanaryDataSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw toNonRetriable(
      canaryError({
        cause: parsed.error,
        code: "PAYLOAD_DRIFT_CANARY_INVALID",
        message: "Payload drift canary request is invalid",
        status: 400,
      }),
    );
  }
  return {
    ...parsed.data,
    limit: parsed.data.limit ?? DEFAULT_CANARY_LIMIT,
  };
}

function parseLeagueData(data: unknown): PayloadDriftCanaryLeagueData {
  const parsed = payloadDriftCanaryLeagueDataSchema.safeParse(data);
  if (!parsed.success) {
    throw toNonRetriable(
      canaryError({
        cause: parsed.error,
        code: "PAYLOAD_DRIFT_CANARY_LEAGUE_INVALID",
        message: "League payload drift canary request is invalid",
        status: 400,
      }),
    );
  }
  return parsed.data;
}

export async function listPayloadDriftCanaryTargets({
  db,
  leagueIds,
  limit,
}: {
  db: Db;
  leagueIds?: readonly string[];
  limit: number;
}): Promise<PayloadDriftCanaryTarget[]> {
  if (leagueIds?.length === 0) {
    return [];
  }

  const filters = [
    eq(providerCredentials.status, "connected"),
    eq(onboardingDiscoveredLeagues.importState, "live"),
    leagueIds ? inArray(leagues.id, [...leagueIds]) : null,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);
  const rows = await db
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
    .innerJoin(
      onboardingDiscoveredLeagues,
      and(
        eq(onboardingDiscoveredLeagues.importedLeagueId, leagues.id),
        eq(onboardingDiscoveredLeagues.provider, leagues.provider),
        eq(
          onboardingDiscoveredLeagues.providerLeagueId,
          leagues.providerLeagueId,
        ),
        eq(onboardingDiscoveredLeagues.season, leagues.season),
      ),
    )
    .innerJoin(
      providerCredentials,
      and(
        eq(providerCredentials.id, onboardingDiscoveredLeagues.credentialId),
        eq(providerCredentials.provider, leagues.provider),
      ),
    )
    .where(and(...filters))
    .orderBy(asc(leagues.id), asc(providerCredentials.id))
    .limit(Math.min(MAX_CANARY_LIMIT * 4, limit * 4));

  const targets = new Map<string, PayloadDriftCanaryTarget>();
  for (const row of rows) {
    if (targets.has(row.leagueId)) {
      continue;
    }
    targets.set(row.leagueId, row);
    if (targets.size >= limit) {
      break;
    }
  }
  return [...targets.values()];
}

export async function runPayloadDriftCanaryTick({
  data: rawData,
  deps,
  eventId,
}: {
  data: unknown;
  deps: PayloadDriftCanaryTickDependencies;
  eventId: string;
}): Promise<PayloadDriftCanaryTickResponse> {
  const data = parseTickData(rawData);
  const observedAt = new Date(data.observedAt ?? deps.now?.() ?? new Date());
  const listTargets = deps.listTargets ?? listPayloadDriftCanaryTargets;
  const targets = await listTargets({
    db: deps.db,
    leagueIds: data.leagueIds,
    limit: data.limit,
  });
  const planned = targets.map((target) => ({
    data: { ...target, observedAt: observedAt.toISOString() },
    id: `payload-drift-canary:${eventId}:${target.leagueId}`,
    name: JOB_EVENTS.payloadDriftCanaryLeague,
  }));
  return {
    eventName: JOB_EVENTS.payloadDriftCanary,
    ok: true,
    planned,
    plannedCount: planned.length,
    sentCount: 0,
  };
}

async function loadCanaryCredential({
  data,
  deps,
}: {
  data: PayloadDriftCanaryLeagueData;
  deps: Pick<PayloadDriftCanaryLeagueDependencies, "cipher" | "db">;
}): Promise<unknown> {
  const [row] = await deps.db
    .select({ encryptedPayload: providerCredentials.encryptedPayload })
    .from(providerCredentials)
    .innerJoin(
      onboardingDiscoveredLeagues,
      and(
        eq(onboardingDiscoveredLeagues.credentialId, providerCredentials.id),
        eq(onboardingDiscoveredLeagues.importedLeagueId, data.leagueId),
        eq(onboardingDiscoveredLeagues.importState, "live"),
        eq(onboardingDiscoveredLeagues.provider, data.provider),
        eq(onboardingDiscoveredLeagues.providerLeagueId, data.providerLeagueId),
        eq(onboardingDiscoveredLeagues.season, data.season),
      ),
    )
    .where(
      and(
        eq(providerCredentials.id, data.credentialId),
        eq(providerCredentials.provider, data.provider),
        eq(providerCredentials.status, "connected"),
      ),
    )
    .limit(1);
  if (!row) {
    throw toNonRetriable(
      canaryError({
        code: "PAYLOAD_DRIFT_CANARY_NOT_CONNECTED",
        message: "League is not connected for payload drift canaries",
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
      canaryError({
        cause,
        code: "PAYLOAD_DRIFT_CANARY_CREDENTIAL_INVALID",
        message: "Payload drift canary credential could not be read",
        status: 500,
      }),
    );
  }
}

function providerRef(data: PayloadDriftCanaryLeagueData): ProviderLeagueRef {
  return {
    name: data.name,
    provider: data.provider,
    providerId: data.providerLeagueId,
    season: data.season,
    size: data.size,
    sport: data.sport,
  };
}

export async function runPayloadDriftCanaryLeague({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: PayloadDriftCanaryLeagueDependencies;
}): Promise<PayloadDriftCanaryLeagueResponse> {
  const data = parseLeagueData(rawData);
  const credentials = await loadCanaryCredential({ data, deps });
  const provider = deps.providerFor(data);
  const auth = await provider.authenticate(credentials);
  if (!auth.ok) {
    throw auth.error;
  }
  const result = await runProviderPayloadCanary({
    db: deps.db,
    leagueId: data.leagueId,
    observedAt: new Date(data.observedAt),
    provider,
    providerId: data.provider,
    providerLeagueId: data.providerLeagueId,
    ref: providerRef(data),
    session: auth.value,
  });
  return {
    alertCount: result.alerts,
    eventName: JOB_EVENTS.payloadDriftCanaryLeague,
    leagueId: data.leagueId,
    observationCount: result.observations.length,
    ok: true,
    scoreboardPeriod: result.scoreboardPeriod,
  };
}

function useFixtureCanaries(env: Pick<Env, "jobs" | "nodeEnv">): boolean {
  return env.nodeEnv !== "production" || env.jobs.inngest.mode !== "cloud";
}

function realProviderFor(
  target: PayloadDriftCanaryTarget,
): ProviderPayloadCanaryProvider {
  switch (target.provider) {
    case "espn":
      return createEspnDiscoveryProvider();
    case "sleeper":
      return createSleeperProvider();
    case "yahoo":
      return createYahooProvider();
  }
}

async function getDefaultTickDependencies(): Promise<PayloadDriftCanaryTickDependencies> {
  const { getDb } = await import("@/db");
  return { db: getDb() };
}

async function getDefaultLeagueDependencies(): Promise<PayloadDriftCanaryLeagueDependencies> {
  const [{ getEnv }, { getDb }] = await Promise.all([
    import("@/core/env"),
    import("@/db"),
  ]);
  const env = getEnv();
  return {
    cipher: createCredentialCipher(env.credentials.encryptionKey),
    db: getDb(),
    providerFor: useFixtureCanaries(env)
      ? createFixtureProviderPayloadCanaryProvider
      : realProviderFor,
  };
}

export function createPayloadDriftCanaryTickFunction(
  resolveDeps: () =>
    | PayloadDriftCanaryTickDependencies
    | Promise<PayloadDriftCanaryTickDependencies> = getDefaultTickDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Plans normalized provider settings and scoreboard drift probes for live leagues.",
      id: "payload-drift-canary",
      idempotency: "event.id",
      name: "Provider payload drift canary",
      triggers: [
        { event: JOB_EVENTS.payloadDriftCanary },
        cron("TZ=UTC 37 10 * * *"),
      ],
    },
    async ({ event, step }): Promise<PayloadDriftCanaryTickResponse> =>
      recordJobRun("payload-drift-canary", async () => {
        const deps = await resolveDeps();
        const plan = await step.run("plan-payload-drift-canaries", () =>
          runPayloadDriftCanaryTick({
            data: event.data,
            deps,
            eventId: event.id,
          }),
        );
        if (plan.planned.length > 0) {
          await step.sendEvent("send-payload-drift-canaries", plan.planned);
        }
        return { ...plan, sentCount: plan.planned.length };
      }),
  );
}

export function createPayloadDriftCanaryLeagueFunction(
  resolveDeps: () =>
    | PayloadDriftCanaryLeagueDependencies
    | Promise<PayloadDriftCanaryLeagueDependencies> = getDefaultLeagueDependencies,
) {
  return inngest.createFunction(
    {
      concurrency: { key: "event.data.provider", limit: 3 },
      description:
        "Captures and compares normalized provider settings and one stable scoreboard week.",
      id: "payload-drift-canary-league",
      idempotency: "event.id",
      name: "League provider payload drift canary",
      triggers: [{ event: JOB_EVENTS.payloadDriftCanaryLeague }],
    },
    async ({ event, step }): Promise<PayloadDriftCanaryLeagueResponse> =>
      recordJobRun("payload-drift-canary-league", async () => {
        const deps = await resolveDeps();
        return step.run("capture-provider-payload-canary", () =>
          runPayloadDriftCanaryLeague({ data: event.data, deps }),
        );
      }),
  );
}

export const payloadDriftCanary = createPayloadDriftCanaryTickFunction();
export const payloadDriftCanaryLeague =
  createPayloadDriftCanaryLeagueFunction();
