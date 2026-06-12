import "server-only";
import { getEnv } from "@/core/env";
import { getDb } from "@/db";
import { inngest } from "@/jobs/client";
import { type ImportRequestedData, JOB_EVENTS } from "@/jobs/events";
import { createEspnDiscoveryProvider } from "@/providers/espn";
import { createSleeperProvider } from "@/providers/sleeper";
import { createYahooProvider } from "@/providers/yahoo";
import { type BrowserSession, MockBrowserSession } from "./browser-session";
import { createCredentialCipher } from "./credential-crypto";
import type { EspnOnboardingDependencies } from "./espn-service";
import { createFixtureEspnProvider } from "./fixture-espn";
import { createFixtureYahooProvider } from "./fixture-yahoo";
import type { LeagueInviteDependencies } from "./invites";
import { RecordingInviteNotifier } from "./notifier";
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
    return;
  }

  await inngest.send({
    id: `import.requested:${data.leagueId}:${data.provider}:${data.providerLeagueId}`,
    name: JOB_EVENTS.importRequested,
    data,
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
    requestHistoricalImport,
  };
}

export function getSleeperOnboardingDependencies(): SleeperOnboardingDependencies {
  const env = getEnv();
  return {
    cipher: createCredentialCipher(env.credentials.encryptionKey),
    db: getDb(),
    provider: createSleeperProvider(),
    requestHistoricalImport,
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
    requestHistoricalImport,
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
