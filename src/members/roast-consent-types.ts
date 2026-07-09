export const ROAST_LEVELS = ["full_send", "light", "off_limits"] as const;

export type RoastLevel = (typeof ROAST_LEVELS)[number];

export const ROAST_LEVEL_DISPLAY: Record<
  RoastLevel,
  { description: string; label: string }
> = {
  full_send: {
    description: "Sharper jokes are allowed, still inside league rules.",
    label: "Full send",
  },
  light: {
    description: "Default: playful mentions, no hard targeting.",
    label: "Light",
  },
  off_limits: {
    description: "Never make this member the butt of trash-talk content.",
    label: "Off limits",
  },
};

export interface LeagueRoastConsentSelf {
  displayName: string;
  memberId: string;
  roastLevel: RoastLevel;
}

export interface LeagueRoastConsentUnclaimedTarget {
  displayName: string;
  fantasyMemberId: string;
  providerMemberId: string;
  roastLevel: RoastLevel;
  teamNames: string[];
}

export interface LeagueRoastConsentData {
  apiUrl: string;
  canManageUnclaimed: boolean;
  self: LeagueRoastConsentSelf;
  unclaimedTargets: LeagueRoastConsentUnclaimedTarget[];
}

export type LeagueRoastConsentMutationTarget =
  | { kind: "self" }
  | { fantasyMemberId: string; kind: "fantasy_member" };

export interface LeagueRoastConsentMutationResult {
  roastLevel: RoastLevel;
  status: "already_current" | "changed";
  target: LeagueRoastConsentMutationTarget;
}

export function isRoastLevel(value: string): value is RoastLevel {
  return (ROAST_LEVELS as readonly string[]).includes(value);
}

export function mostRestrictiveRoastLevel(
  levels: readonly RoastLevel[],
): RoastLevel {
  if (levels.includes("off_limits")) {
    return "off_limits";
  }
  if (levels.includes("light")) {
    return "light";
  }
  return "full_send";
}
