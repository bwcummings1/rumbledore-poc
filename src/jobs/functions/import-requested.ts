import { and, eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { leagues, members, providerCredentials } from "@/db/schema";
import { type HistoricalImportResult, importLeagueHistory } from "@/ingestion";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";
import {
  createEspnDiscoveryProvider,
  type EspnCookieCredentials,
  type EspnProvider,
} from "@/providers/espn/client";
import type { ProviderError, ProviderLeagueRef } from "@/providers/model";
import { recomputeLeagueStatistics } from "@/stats";
import { inngest } from "../client";
import { type ImportRequestedData, JOB_EVENTS } from "../events";

type ImportRequestedProvider = Pick<
  EspnProvider,
  "authenticate" | "getHistory"
>;

interface ImportRequestedDependencies {
  cipher: CredentialCipher;
  db: Db;
  provider: ImportRequestedProvider;
  recomputeStats?: typeof recomputeLeagueStatistics;
  now?: () => Date;
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

const importRequestedDataSchema = z.object({
  credentialId: z.uuid(),
  leagueId: z.uuid(),
  provider: z.literal("espn"),
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

async function loadCredentialsForImport({
  data,
  deps,
}: {
  data: ImportRequestedData;
  deps: ImportRequestedDependencies;
}): Promise<EspnCookieCredentials> {
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
    return storedEspnCredentialsSchema.parse(
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

function throwProviderError(error: ProviderError): never {
  if (shouldStopRetries(error)) {
    throw toNonRetriable(error);
  }

  throw error;
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
    provider: createEspnDiscoveryProvider(),
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
  const credentials = await loadCredentialsForImport({ data, deps });
  const session = await deps.provider.authenticate(credentials);

  if (!session.ok) {
    await markCredentialInvalid({ credentialId: data.credentialId, deps });
    throwProviderError(session.error);
  }

  const history = await importLeagueHistory({
    db: deps.db,
    maxSeasons: data.maxSeasons,
    provider: deps.provider,
    ref: toProviderRef(data),
    seasons: data.seasons,
    session: session.value,
  });

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
    async ({ event, step }): Promise<ImportRequestedResponse> => {
      const deps = await resolveDeps();
      return step.run("run-historical-import", () =>
        runImportRequested({ data: event.data, deps }),
      );
    },
  );
}

export const importRequested = createImportRequestedFunction();
