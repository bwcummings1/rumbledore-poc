import { err, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import type {
  SleeperCredentials,
  SleeperProvider,
} from "@/providers/sleeper/client";
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
  storedSleeperCredentialsSchema,
} from "./provider-service";

const SLEEPER_PROVIDER_ID = "sleeper";

export type SleeperDiscoveredLeague = DiscoveredLeague & {
  provider: "sleeper";
};
export type SleeperConnectResult = ProviderConnectResult;
export type SleeperDiscoveredLeagueImportCandidate =
  DiscoveredLeagueImportCandidate & { provider: "sleeper" };
export type SleeperImportResult = ProviderImportResult;

export interface SleeperOnboardingDependencies {
  cipher: CredentialCipher;
  db: Db;
  now?: () => Date;
  provider: SleeperProvider;
  requestHistoricalImport?: RequestHistoricalImport;
}

function providerDeps(
  deps: SleeperOnboardingDependencies,
): ProviderOnboardingDependencies {
  return {
    cipher: deps.cipher,
    db: deps.db,
    now: deps.now,
    providers: { sleeper: deps.provider },
    requestHistoricalImport: deps.requestHistoricalImport,
  };
}

export async function connectSleeperPublic(
  deps: SleeperOnboardingDependencies,
  input: {
    credentials: SleeperCredentials;
    userId: string;
  },
): Promise<Result<SleeperConnectResult, ProviderOnboardingError>> {
  const parsed = storedSleeperCredentialsSchema.safeParse(input.credentials);
  if (!parsed.success) {
    return err(
      new OnboardingError({
        cause: parsed.error,
        code: "ONBOARDING_INVALID_PUBLIC_CREDENTIALS",
        message: "A valid Sleeper username or user ID is required",
        status: 400,
      }),
    );
  }

  return connectProviderWithCredentials({
    credentials: parsed.data,
    deps: providerDeps(deps),
    flow: "public",
    provider: SLEEPER_PROVIDER_ID,
    userId: input.userId,
  });
}

export async function listSleeperDiscoveredLeagues(
  deps: Pick<SleeperOnboardingDependencies, "db">,
  input: { userId: string },
): Promise<Result<SleeperDiscoveredLeagueImportCandidate[], OnboardingError>> {
  const result = await listDiscoveredLeagues(deps, {
    provider: SLEEPER_PROVIDER_ID,
    userId: input.userId,
  });

  return result as Result<
    SleeperDiscoveredLeagueImportCandidate[],
    OnboardingError
  >;
}

export async function importSleeperDiscoveredLeague(
  deps: SleeperOnboardingDependencies,
  input: {
    providerLeagueId: string;
    season: number;
    userId: string;
  },
): Promise<Result<SleeperImportResult, ProviderOnboardingError>> {
  return importDiscoveredLeague(providerDeps(deps), {
    provider: SLEEPER_PROVIDER_ID,
    providerLeagueId: input.providerLeagueId,
    season: input.season,
    userId: input.userId,
  });
}
