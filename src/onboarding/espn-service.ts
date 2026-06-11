import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import {
  members,
  onboardingBrowserSessions,
  onboardingDiscoveredLeagues,
  providerCredentials,
} from "@/db/schema";
import { type CurrentLeagueSyncResult, syncCurrentLeague } from "@/ingestion";
import type {
  EspnCookieCredentials,
  EspnProvider,
} from "@/providers/espn/client";
import type { ProviderError, ProviderLeagueRef } from "@/providers/model";
import type { BrowserSession } from "./browser-session";
import type { CredentialCipher } from "./credential-crypto";

const ESPN_PROVIDER_ID = "espn";
const BROWSER_SESSION_TTL_MS = 15 * 60 * 1000;

const storedEspnCredentialsSchema = z.object({
  espn_s2: z.string().min(1),
  swid: z.string().min(1),
});

export interface DiscoveredLeague {
  provider: "espn";
  providerId: string;
  season: number;
  sport: "ffl" | "unknown";
  name: string;
  teamName?: string;
  size?: number;
}

export interface EspnConnectResult {
  credentialId: string;
  discoveredLeagues: DiscoveredLeague[];
}

export interface BrowserConnectStartResult {
  sessionId: string;
  liveViewUrl: string;
  expiresAt: Date;
}

export interface EspnImportResult {
  credentialId: string;
  leagueId: string;
  sync: CurrentLeagueSyncResult;
}

export interface EspnOnboardingDependencies {
  browserSession: BrowserSession;
  cipher: CredentialCipher;
  db: Db;
  now?: () => Date;
  provider: EspnProvider;
}

type EspnOnboardingError = AppError | ProviderError;

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

function now(deps: Pick<EspnOnboardingDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function browserSessionExpired(expiresAt: Date, current: Date): boolean {
  return expiresAt.getTime() <= current.getTime();
}

function toDiscoveredLeague(ref: ProviderLeagueRef): DiscoveredLeague {
  return {
    provider: "espn",
    providerId: ref.providerId,
    season: ref.season,
    sport: ref.sport,
    name: ref.name,
    ...(ref.teamName ? { teamName: ref.teamName } : {}),
    ...(ref.size === undefined ? {} : { size: ref.size }),
  };
}

function toProviderRef(league: DiscoveredLeague): ProviderLeagueRef {
  return {
    provider: ESPN_PROVIDER_ID,
    providerId: league.providerId,
    season: league.season,
    sport: league.sport,
    name: league.name,
    ...(league.teamName ? { teamName: league.teamName } : {}),
    ...(league.size === undefined ? {} : { size: league.size }),
  };
}

async function persistConnectedCredential({
  credentials,
  deps,
  discoveredLeagues,
  flow,
  subjectProviderId,
  userId,
}: {
  credentials: EspnCookieCredentials;
  deps: EspnOnboardingDependencies;
  discoveredLeagues: readonly DiscoveredLeague[];
  flow: "browser" | "manual" | "extension";
  subjectProviderId: string;
  userId: string;
}): Promise<{ credentialId: string }> {
  const current = now(deps);
  const encryptedPayload = deps.cipher.encryptJson(credentials);

  return deps.db.transaction(async (tx) => {
    const [credential] = await tx
      .insert(providerCredentials)
      .values({
        connectionFlow: flow,
        encryptedPayload,
        invalidAt: null,
        lastValidatedAt: current,
        provider: ESPN_PROVIDER_ID,
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
          lastDiscoveredAt: current,
          name: league.name,
          provider: league.provider,
          providerLeagueId: league.providerId,
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

async function connectWithCredentials({
  credentials,
  deps,
  flow,
  userId,
}: {
  credentials: EspnCookieCredentials;
  deps: EspnOnboardingDependencies;
  flow: "browser" | "manual" | "extension";
  userId: string;
}): Promise<Result<EspnConnectResult, EspnOnboardingError>> {
  const session = await deps.provider.authenticate(credentials);
  if (!session.ok) {
    return session;
  }

  const discovered = await deps.provider.discoverLeagues(session.value);
  if (!discovered.ok) {
    return discovered;
  }

  const discoveredLeagues = discovered.value.map(toDiscoveredLeague);
  const persisted = await persistConnectedCredential({
    credentials: {
      espn_s2: session.value.espn_s2,
      swid: session.value.swid,
    },
    deps,
    discoveredLeagues,
    flow,
    subjectProviderId: session.value.subjectProviderId ?? session.value.swid,
    userId,
  });

  return ok({
    credentialId: persisted.credentialId,
    discoveredLeagues,
  });
}

export async function startEspnBrowserConnect(
  deps: EspnOnboardingDependencies,
  userId: string,
): Promise<Result<BrowserConnectStartResult, OnboardingError>> {
  const sessionId = randomUUID();
  const started = await deps.browserSession.start({ sessionId, userId });
  const expiresAt = new Date(now(deps).getTime() + BROWSER_SESSION_TTL_MS);

  const [session] = await deps.db
    .insert(onboardingBrowserSessions)
    .values({
      expiresAt,
      id: started.sessionId,
      liveViewUrl: started.liveViewUrl,
      provider: ESPN_PROVIDER_ID,
      status: "awaiting_login",
      userId,
    })
    .returning();

  if (!session) {
    return err(
      new OnboardingError({
        code: "ONBOARDING_BROWSER_SESSION_NOT_CREATED",
        message: "Browser login session could not be created",
        status: 500,
      }),
    );
  }

  return ok({
    expiresAt: session.expiresAt,
    liveViewUrl: session.liveViewUrl,
    sessionId: session.id,
  });
}

export async function completeEspnBrowserConnect(
  deps: EspnOnboardingDependencies,
  input: { sessionId: string; userId: string },
): Promise<Result<EspnConnectResult, EspnOnboardingError>> {
  const [session] = await deps.db
    .select()
    .from(onboardingBrowserSessions)
    .where(
      and(
        eq(onboardingBrowserSessions.id, input.sessionId),
        eq(onboardingBrowserSessions.userId, input.userId),
        eq(onboardingBrowserSessions.provider, ESPN_PROVIDER_ID),
      ),
    )
    .limit(1);

  if (!session) {
    return err(
      new OnboardingError({
        code: "ONBOARDING_BROWSER_SESSION_NOT_FOUND",
        message: "Browser login session is not active",
        status: 404,
      }),
    );
  }

  switch (session.status) {
    case "awaiting_login":
      break;
    default:
      return err(
        new OnboardingError({
          code: "ONBOARDING_BROWSER_SESSION_NOT_FOUND",
          message: "Browser login session is not active",
          status: 404,
        }),
      );
  }

  if (browserSessionExpired(session.expiresAt, now(deps))) {
    await deps.db
      .update(onboardingBrowserSessions)
      .set({
        errorCode: "ONBOARDING_BROWSER_SESSION_EXPIRED",
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(onboardingBrowserSessions.id, session.id));

    return err(
      new OnboardingError({
        code: "ONBOARDING_BROWSER_SESSION_EXPIRED",
        message: "Browser login session expired",
        status: 410,
      }),
    );
  }

  const credentials = await deps.browserSession.captureCredentials(session.id);
  const connected = await connectWithCredentials({
    credentials,
    deps,
    flow: "browser",
    userId: input.userId,
  });

  if (!connected.ok) {
    await deps.db
      .update(onboardingBrowserSessions)
      .set({
        errorCode: connected.error.code,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(onboardingBrowserSessions.id, session.id));
    return connected;
  }

  await deps.browserSession.end(session.id);
  await deps.db
    .update(onboardingBrowserSessions)
    .set({
      credentialId: connected.value.credentialId,
      endedAt: now(deps),
      errorCode: null,
      status: "connected",
      updatedAt: new Date(),
    })
    .where(eq(onboardingBrowserSessions.id, session.id));

  return connected;
}

export async function connectEspnManual(
  deps: EspnOnboardingDependencies,
  input: {
    credentials: EspnCookieCredentials;
    userId: string;
  },
): Promise<Result<EspnConnectResult, EspnOnboardingError>> {
  return connectWithCredentials({
    credentials: input.credentials,
    deps,
    flow: "manual",
    userId: input.userId,
  });
}

async function loadStoredCredentials(
  deps: EspnOnboardingDependencies,
  credentialId: string,
): Promise<EspnCookieCredentials> {
  const [credential] = await deps.db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.id, credentialId))
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
    default:
      throw new OnboardingError({
        code: "ONBOARDING_CREDENTIAL_NOT_FOUND",
        message: "Provider credential is not connected",
        status: 404,
      });
  }

  return storedEspnCredentialsSchema.parse(
    deps.cipher.decryptJson(credential.encryptedPayload),
  );
}

async function markCredentialInvalid(
  deps: EspnOnboardingDependencies,
  credentialId: string,
): Promise<void> {
  await deps.db
    .update(providerCredentials)
    .set({
      invalidAt: now(deps),
      status: "invalid",
      updatedAt: new Date(),
    })
    .where(eq(providerCredentials.id, credentialId));
}

export async function importEspnDiscoveredLeague(
  deps: EspnOnboardingDependencies,
  input: {
    providerLeagueId: string;
    season: number;
    userId: string;
  },
): Promise<Result<EspnImportResult, EspnOnboardingError>> {
  const [discovered] = await deps.db
    .select()
    .from(onboardingDiscoveredLeagues)
    .where(
      and(
        eq(onboardingDiscoveredLeagues.userId, input.userId),
        eq(onboardingDiscoveredLeagues.provider, ESPN_PROVIDER_ID),
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

  let credentials: EspnCookieCredentials;
  try {
    credentials = await loadStoredCredentials(deps, discovered.credentialId);
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

  const session = await deps.provider.authenticate(credentials);
  if (!session.ok) {
    await markCredentialInvalid(deps, discovered.credentialId);
    return session;
  }

  const ref = toProviderRef({
    name: discovered.name,
    provider: ESPN_PROVIDER_ID,
    providerId: discovered.providerLeagueId,
    season: discovered.season,
    sport: discovered.sport,
    ...(discovered.teamName ? { teamName: discovered.teamName } : {}),
    ...(discovered.size === null ? {} : { size: discovered.size }),
  });

  const sync = await syncCurrentLeague({
    db: deps.db,
    provider: deps.provider,
    ref,
    session: session.value,
  });
  if (!sync.ok) {
    return sync;
  }

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

  return ok({
    credentialId: discovered.credentialId,
    leagueId: sync.value.league.id,
    sync: sync.value,
  });
}
