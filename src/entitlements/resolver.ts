import { eq } from "drizzle-orm";
import type { EntitlementCapsConfig, Env } from "@/core/env/schema";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import {
  type LeagueEntitlement,
  leagueEntitlements,
  type UserEntitlement,
  userEntitlements,
} from "@/db/schema";

export const ENTITLEMENT_CAPABILITIES = [
  "ai.cast.generate",
  "ai.cadence.schedule",
  "ai.instigator",
  "ai.lore.canonize",
  "ai.individual.agent",
  "arena.advanced",
] as const;

export type EntitlementCapability = (typeof ENTITLEMENT_CAPABILITIES)[number];

export type EntitlementScope = "league" | "user";
export type EntitlementRequiredTier = "premium" | "individual";
export type EntitlementTier = "free" | "premium" | "individual" | "none";

export type EntitlementReason =
  | "ENTITLED"
  | "TIER_REQUIRED"
  | "EXPIRED"
  | "CAP_EXCEEDED"
  | "SUSPENDED"
  | "DEV_OVERRIDE";

export interface EntitlementCapabilityRequirement {
  requiredTier: EntitlementRequiredTier;
  scope: EntitlementScope;
}

export type EntitlementResolverEnv = Pick<Env, "entitlements">;

export interface EntitlementResolution {
  allowed: boolean;
  capability: EntitlementCapability;
  caps: EntitlementCapsConfig;
  reason: EntitlementReason;
  requiredTier: EntitlementRequiredTier;
  scope: EntitlementScope;
  tier: EntitlementTier;
}

type LeagueCapability = Exclude<EntitlementCapability, "ai.individual.agent">;
type UserCapability = Extract<EntitlementCapability, "ai.individual.agent">;

type ResolveLeagueEntitlementInput = {
  capability: LeagueCapability;
  db: Db;
  env: EntitlementResolverEnv;
  leagueId: string;
  now?: () => Date;
};

type ResolveUserEntitlementInput = {
  capability: UserCapability;
  db: Db;
  env: EntitlementResolverEnv;
  now?: () => Date;
  userId: string;
};

export type ResolveEntitlementInput =
  | ResolveLeagueEntitlementInput
  | ResolveUserEntitlementInput;

export const ENTITLEMENT_CAPABILITY_REQUIREMENTS = {
  "ai.cast.generate": { requiredTier: "premium", scope: "league" },
  "ai.cadence.schedule": { requiredTier: "premium", scope: "league" },
  "ai.instigator": { requiredTier: "premium", scope: "league" },
  "ai.lore.canonize": { requiredTier: "premium", scope: "league" },
  "ai.individual.agent": { requiredTier: "individual", scope: "user" },
  "arena.advanced": { requiredTier: "premium", scope: "league" },
} as const satisfies Record<
  EntitlementCapability,
  EntitlementCapabilityRequirement
>;

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

export function mergeEntitlementCaps(
  defaults: EntitlementCapsConfig,
  override: Record<string, unknown> | null | undefined,
): EntitlementCapsConfig {
  if (!override) {
    return defaults;
  }

  return {
    aiPostsPerWeek:
      positiveInteger(override.aiPostsPerWeek) ?? defaults.aiPostsPerWeek,
    individualLeaguesCovered:
      positiveInteger(override.individualLeaguesCovered) ??
      defaults.individualLeaguesCovered,
    maxPremiumLeaguesPerUser:
      override.maxPremiumLeaguesPerUser === null
        ? null
        : (positiveInteger(override.maxPremiumLeaguesPerUser) ??
          defaults.maxPremiumLeaguesPerUser),
  };
}

function currentTime(input: ResolveEntitlementInput): Date {
  return input.now?.() ?? new Date();
}

function baseResolution({
  allowed,
  capability,
  caps,
  reason,
  tier,
}: {
  allowed: boolean;
  capability: EntitlementCapability;
  caps: EntitlementCapsConfig;
  reason: EntitlementReason;
  tier: EntitlementTier;
}): EntitlementResolution {
  const requirement = ENTITLEMENT_CAPABILITY_REQUIREMENTS[capability];
  return {
    allowed,
    capability,
    caps,
    reason,
    requiredTier: requirement.requiredTier,
    scope: requirement.scope,
    tier,
  };
}

function deniedDefault(
  capability: EntitlementCapability,
  caps: EntitlementCapsConfig,
): EntitlementResolution {
  const requirement = ENTITLEMENT_CAPABILITY_REQUIREMENTS[capability];
  return baseResolution({
    allowed: false,
    capability,
    caps,
    reason: "TIER_REQUIRED",
    tier: requirement.scope === "league" ? "free" : "none",
  });
}

function resolveLeagueRow({
  capability,
  caps,
  now,
  row,
}: {
  capability: LeagueCapability;
  caps: EntitlementCapsConfig;
  now: Date;
  row: LeagueEntitlement | undefined;
}): EntitlementResolution {
  const effectiveCaps = mergeEntitlementCaps(caps, row?.capsOverride);
  if (!row) {
    return deniedDefault(capability, effectiveCaps);
  }

  if (row.status === "suspended") {
    return baseResolution({
      allowed: false,
      capability,
      caps: effectiveCaps,
      reason: "SUSPENDED",
      tier: "free",
    });
  }

  if (
    row.status === "expired" ||
    (row.expiresAt !== null && row.expiresAt <= now)
  ) {
    return baseResolution({
      allowed: false,
      capability,
      caps: effectiveCaps,
      reason: "EXPIRED",
      tier: "free",
    });
  }

  if (row.tier === "premium") {
    return baseResolution({
      allowed: true,
      capability,
      caps: effectiveCaps,
      reason: "ENTITLED",
      tier: "premium",
    });
  }

  return deniedDefault(capability, effectiveCaps);
}

function resolveUserRow({
  capability,
  caps,
  now,
  row,
}: {
  capability: UserCapability;
  caps: EntitlementCapsConfig;
  now: Date;
  row: UserEntitlement | undefined;
}): EntitlementResolution {
  if (!row) {
    return deniedDefault(capability, caps);
  }

  if (row.status === "suspended") {
    return baseResolution({
      allowed: false,
      capability,
      caps,
      reason: "SUSPENDED",
      tier: "none",
    });
  }

  if (
    row.status === "expired" ||
    (row.expiresAt !== null && row.expiresAt <= now)
  ) {
    return baseResolution({
      allowed: false,
      capability,
      caps,
      reason: "EXPIRED",
      tier: "none",
    });
  }

  return baseResolution({
    allowed: true,
    capability,
    caps,
    reason: "ENTITLED",
    tier: "individual",
  });
}

function invalidScopeInput(capability: EntitlementCapability): AppError {
  return new AppError({
    code: "ENTITLEMENT_SCOPE_INPUT_INVALID",
    details: {
      capability,
      scope: ENTITLEMENT_CAPABILITY_REQUIREMENTS[capability].scope,
    },
    message: "Entitlement resolution requires the capability scope identifier",
    status: 400,
  });
}

export async function resolveEntitlement(
  input: ResolveEntitlementInput,
): Promise<EntitlementResolution> {
  const requirement = ENTITLEMENT_CAPABILITY_REQUIREMENTS[input.capability];
  const caps = input.env.entitlements.caps;

  if (input.env.entitlements.devOverride) {
    return baseResolution({
      allowed: true,
      capability: input.capability,
      caps,
      reason: "DEV_OVERRIDE",
      tier: requirement.requiredTier,
    });
  }

  if (
    input.capability === "arena.advanced" &&
    input.env.entitlements.gateArenaAdvanced !== true
  ) {
    return baseResolution({
      allowed: true,
      capability: input.capability,
      caps,
      reason: "ENTITLED",
      tier: "free",
    });
  }

  if (requirement.scope === "league") {
    const leagueId =
      "leagueId" in input && input.leagueId ? input.leagueId : undefined;
    if (!leagueId) {
      throw invalidScopeInput(input.capability);
    }

    const [row] = await input.db
      .select()
      .from(leagueEntitlements)
      .where(eq(leagueEntitlements.leagueId, leagueId))
      .limit(1);

    return resolveLeagueRow({
      capability: input.capability as LeagueCapability,
      caps,
      now: currentTime(input),
      row,
    });
  }

  const userId = "userId" in input && input.userId ? input.userId : undefined;
  if (!userId) {
    throw invalidScopeInput(input.capability);
  }

  const [row] = await input.db
    .select()
    .from(userEntitlements)
    .where(eq(userEntitlements.userId, userId))
    .limit(1);

  return resolveUserRow({
    capability: input.capability as UserCapability,
    caps,
    now: currentTime(input),
    row,
  });
}
