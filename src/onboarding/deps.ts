import "server-only";
import { getEnv } from "@/core/env";
import { getDb } from "@/db";
import { inngest } from "@/jobs/client";
import { type ImportRequestedData, JOB_EVENTS } from "@/jobs/events";
import { createEspnDiscoveryProvider } from "@/providers/espn";
import { createSleeperProvider } from "@/providers/sleeper";
import { type BrowserSession, MockBrowserSession } from "./browser-session";
import { createCredentialCipher } from "./credential-crypto";
import type { EspnOnboardingDependencies } from "./espn-service";
import { createFixtureEspnProvider } from "./fixture-espn";
import type { SleeperOnboardingDependencies } from "./sleeper-service";

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
