import "server-only";
import { getEnv } from "@/core/env";
import { getDb } from "@/db";
import { createEspnDiscoveryProvider } from "@/providers/espn";
import { type BrowserSession, MockBrowserSession } from "./browser-session";
import { createCredentialCipher } from "./credential-crypto";
import type { EspnOnboardingDependencies } from "./espn-service";
import { createFixtureEspnProvider } from "./fixture-espn";

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
  };
}
