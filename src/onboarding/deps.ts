import "server-only";
import { getEnv } from "@/core/env";
import { getDb } from "@/db";
import { inngest } from "@/jobs/client";
import {
  type ImportRequestedData,
  JOB_EVENTS,
  type LeagueConnectedData,
} from "@/jobs/events";
import { createEspnDiscoveryProvider } from "@/providers/espn";
import { createSleeperProvider } from "@/providers/sleeper";
import { createYahooProvider } from "@/providers/yahoo";
import { createRealtimePublisher } from "@/realtime";
import { type BrowserSession, MockBrowserSession } from "./browser-session";
import { createCredentialCipher } from "./credential-crypto";
import type { EspnOnboardingDependencies } from "./espn-service";
import { createFixtureEspnProvider } from "./fixture-espn";
import { createFixtureYahooProvider } from "./fixture-yahoo";
import type { LeagueInviteDependencies } from "./invites";
import { RecordingInviteNotifier } from "./notifier";
import type { ProviderOnboardingDependencies } from "./provider-service";
import type { SleeperOnboardingDependencies } from "./sleeper-service";
import {
  createMockYahooOAuthClient,
  createYahooOAuthClient,
  type YahooOnboardingDependencies,
} from "./yahoo-service";

class BrowserbaseSessionNotConfigured implements BrowserSession {
  async start(): Promise<never> {
    throw new Error("Real Browserbase sessions are not wired yet");
  }

  async captureCredentials(): Promise<never> {
    throw new Error("Real Browserbase sessions are not wired yet");
  }

  async end(): Promise<void> {
    return;
  }
}

const inviteNotifier = new RecordingInviteNotifier();

async function requestHistoricalImport(
  data: ImportRequestedData,
): Promise<void> {
  if (getEnv().jobs.inngest.mode === "mock") {
    const { runImportRequestedWithDefaultDependencies } = await import(
      "@/jobs/functions/import-requested"
    );
    await runImportRequestedWithDefaultDependencies(data);
    return;
  }

  await inngest.send({
    id: `import.requested:${data.leagueId}:${data.provider}:${data.providerLeagueId}:${data.shadowAttempt ?? "legacy"}`,
    name: JOB_EVENTS.importRequested,
    data,
  });
}

async function requestLeagueConnected(
  data: LeagueConnectedData,
): Promise<void> {
  if (getEnv().jobs.inngest.mode === "mock") {
    return;
  }

  await inngest.send({
    data,
    id: `league.connected:${data.leagueId}`,
    name: JOB_EVENTS.leagueConnected,
  });
}

export function getEspnOnboardingDependencies(): EspnOnboardingDependencies {
  const env = getEnv();
  const browserbase = env.services.browserbase;
  return {
    browserSession: browserbase.mock
      ? new MockBrowserSession()
      : new BrowserbaseSessionNotConfigured(),
    cipher: createCredentialCipher(env.credentials.encryptionKey),
    db: getDb(),
    provider: browserbase.mock
      ? createFixtureEspnProvider()
      : createEspnDiscoveryProvider(),
    realtime: createRealtimePublisher(env),
    requestHistoricalImport,
    requestLeagueConnected,
  };
}

export function getSleeperOnboardingDependencies(): SleeperOnboardingDependencies {
  const env = getEnv();
  return {
    cipher: createCredentialCipher(env.credentials.encryptionKey),
    db: getDb(),
    provider: createSleeperProvider(),
    realtime: createRealtimePublisher(env),
    requestHistoricalImport,
    requestLeagueConnected,
  };
}

export function getYahooOnboardingDependencies(): YahooOnboardingDependencies {
  const env = getEnv();
  const redirectUri = env.auth.yahoo.mock
    ? new URL("/api/onboarding/yahoo/callback", env.auth.url).toString()
    : env.auth.yahoo.redirectUri;
  return {
    cipher: createCredentialCipher(env.credentials.encryptionKey),
    db: getDb(),
    oauthClient: env.auth.yahoo.mock
      ? createMockYahooOAuthClient({ redirectUri })
      : createYahooOAuthClient({
          clientId: env.auth.yahoo.clientId,
          clientSecret: env.auth.yahoo.clientSecret,
          redirectUri,
          scope: env.auth.yahoo.scope,
        }),
    provider: env.auth.yahoo.mock
      ? createFixtureYahooProvider()
      : createYahooProvider(),
    realtime: createRealtimePublisher(env),
    requestHistoricalImport,
    requestLeagueConnected,
  };
}

export function getProviderOnboardingDependencies(): ProviderOnboardingDependencies {
  const env = getEnv();
  const browserbase = env.services.browserbase;
  const yahooRedirectUri = env.auth.yahoo.mock
    ? new URL("/api/onboarding/yahoo/callback", env.auth.url).toString()
    : env.auth.yahoo.redirectUri;
  return {
    cipher: createCredentialCipher(env.credentials.encryptionKey),
    db: getDb(),
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
    requestHistoricalImport,
    requestLeagueConnected,
    yahooOAuthClient: env.auth.yahoo.mock
      ? createMockYahooOAuthClient({ redirectUri: yahooRedirectUri })
      : createYahooOAuthClient({
          clientId: env.auth.yahoo.clientId,
          clientSecret: env.auth.yahoo.clientSecret,
          redirectUri: yahooRedirectUri,
          scope: env.auth.yahoo.scope,
        }),
  };
}

export function getLeagueInviteDependencies(): LeagueInviteDependencies {
  return {
    db: getDb(),
    notifier: inviteNotifier,
  };
}

export function getRecordedInviteNotifier(): RecordingInviteNotifier {
  return inviteNotifier;
}
