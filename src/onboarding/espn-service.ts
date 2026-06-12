import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { err, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { onboardingBrowserSessions } from "@/db/schema";
import type {
  EspnCookieCredentials,
  EspnProvider,
} from "@/providers/espn/client";
import type { BrowserSession } from "./browser-session";
import type { CredentialCipher } from "./credential-crypto";
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

const ESPN_PROVIDER_ID = "espn";
const BROWSER_SESSION_TTL_MS = 15 * 60 * 1000;

export type EspnDiscoveredLeague = DiscoveredLeague & { provider: "espn" };
export type EspnConnectResult = ProviderConnectResult;
export type EspnDiscoveredLeagueImportCandidate =
  DiscoveredLeagueImportCandidate & { provider: "espn" };

export interface BrowserConnectStartResult {
  sessionId: string;
  liveViewUrl: string;
  expiresAt: Date;
}

export type EspnImportResult = ProviderImportResult;
export type { RequestHistoricalImport };

export interface EspnOnboardingDependencies {
  browserSession: BrowserSession;
  cipher: CredentialCipher;
  db: Db;
  now?: () => Date;
  provider: EspnProvider;
  requestHistoricalImport?: RequestHistoricalImport;
}

function now(deps: Pick<EspnOnboardingDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function browserSessionExpired(expiresAt: Date, current: Date): boolean {
  return expiresAt.getTime() <= current.getTime();
}

function providerDeps(
  deps: EspnOnboardingDependencies,
): ProviderOnboardingDependencies {
  return {
    cipher: deps.cipher,
    db: deps.db,
    now: deps.now,
    providers: { espn: deps.provider },
    requestHistoricalImport: deps.requestHistoricalImport,
  };
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
}): Promise<Result<EspnConnectResult, ProviderOnboardingError>> {
  return connectProviderWithCredentials({
    credentials,
    deps: providerDeps(deps),
    flow,
    provider: ESPN_PROVIDER_ID,
    userId,
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

  return {
    ok: true,
    value: {
      expiresAt: session.expiresAt,
      liveViewUrl: session.liveViewUrl,
      sessionId: session.id,
    },
  };
}

export async function completeEspnBrowserConnect(
  deps: EspnOnboardingDependencies,
  input: { sessionId: string; userId: string },
): Promise<Result<EspnConnectResult, ProviderOnboardingError>> {
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
): Promise<Result<EspnConnectResult, ProviderOnboardingError>> {
  return connectWithCredentials({
    credentials: input.credentials,
    deps,
    flow: "manual",
    userId: input.userId,
  });
}

export async function listEspnDiscoveredLeagues(
  deps: Pick<EspnOnboardingDependencies, "db">,
  input: { userId: string },
): Promise<Result<EspnDiscoveredLeagueImportCandidate[], OnboardingError>> {
  const result = await listDiscoveredLeagues(deps, {
    provider: ESPN_PROVIDER_ID,
    userId: input.userId,
  });

  return result as Result<
    EspnDiscoveredLeagueImportCandidate[],
    OnboardingError
  >;
}

export async function importEspnDiscoveredLeague(
  deps: EspnOnboardingDependencies,
  input: {
    providerLeagueId: string;
    season: number;
    userId: string;
  },
): Promise<Result<EspnImportResult, ProviderOnboardingError>> {
  return importDiscoveredLeague(providerDeps(deps), {
    provider: ESPN_PROVIDER_ID,
    providerLeagueId: input.providerLeagueId,
    season: input.season,
    userId: input.userId,
  });
}
