export const FIXTURE_SLEEPER_USERNAME = "fixture_sleeper";
export const FIXTURE_SLEEPER_USER_ID = "user-123";
export const FIXTURE_SLEEPER_PROVIDER_LEAGUE_ID = "fixture-sleeper-2026";
export const FIXTURE_SLEEPER_PREVIOUS_PROVIDER_LEAGUE_ID =
  "fixture-sleeper-2025";

export function isFixtureSleeperCredential(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized === FIXTURE_SLEEPER_USERNAME ||
    normalized === FIXTURE_SLEEPER_USER_ID
  );
}

export function isFixtureSleeperSession(input: {
  subjectProviderId?: string;
  username?: string;
}): boolean {
  return (
    input.subjectProviderId === FIXTURE_SLEEPER_USER_ID &&
    input.username === FIXTURE_SLEEPER_USERNAME
  );
}
