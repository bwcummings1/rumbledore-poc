export const FANTASY_PROVIDER_IDS = ["espn", "sleeper", "yahoo"] as const;
export type FantasyProviderId = (typeof FANTASY_PROVIDER_IDS)[number];
