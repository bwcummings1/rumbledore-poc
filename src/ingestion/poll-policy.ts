import { z } from "zod";
import type { ProviderDataClass } from "@/providers/model";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export const LIVE_INGESTION_DATA_CLASSES = [
  "league",
  "teams",
  "members",
  "rosters",
  "matchups",
  "transactions",
] as const satisfies readonly ProviderDataClass[];

export type LiveIngestionDataClass =
  (typeof LIVE_INGESTION_DATA_CLASSES)[number];

export type IngestionGameState =
  | "live_window"
  | "in_season_off_hours"
  | "off_season";

const intervalOverrideSchema = z
  .object({
    league: z.number().int().positive().optional(),
    teams: z.number().int().positive().optional(),
    members: z.number().int().positive().optional(),
    rosters: z.number().int().positive().optional(),
    matchups: z.number().int().positive().optional(),
    transactions: z.number().int().positive().optional(),
  })
  .strict();

export const pollPolicyConfigOverrideSchema = z
  .object({
    intervalsMs: z
      .object({
        live_window: intervalOverrideSchema.optional(),
        in_season_off_hours: intervalOverrideSchema.optional(),
        off_season: intervalOverrideSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type PollPolicyConfigOverride = z.infer<
  typeof pollPolicyConfigOverrideSchema
>;

export interface PollPolicyConfig {
  intervalsMs: Record<
    IngestionGameState,
    Record<LiveIngestionDataClass, number>
  >;
}

export interface PollPolicyDueInput {
  dataClass: LiveIngestionDataClass;
  gameState: IngestionGameState;
  lastSyncedAt: Date | undefined;
  leagueConfig?: PollPolicyConfigOverride;
  now: Date;
}

export interface PollPolicyDueResult {
  due: boolean;
  intervalMs: number;
  nextDueAt: Date;
}

export interface PollPolicy {
  due(input: PollPolicyDueInput): PollPolicyDueResult;
}

export const DEFAULT_POLL_POLICY_CONFIG = {
  intervalsMs: {
    live_window: {
      league: HOUR_MS,
      teams: DAY_MS,
      members: DAY_MS,
      rosters: 5 * MINUTE_MS,
      matchups: MINUTE_MS,
      transactions: 15 * MINUTE_MS,
    },
    in_season_off_hours: {
      league: DAY_MS,
      teams: DAY_MS,
      members: DAY_MS,
      rosters: HOUR_MS,
      matchups: HOUR_MS,
      transactions: HOUR_MS,
    },
    off_season: {
      league: WEEK_MS,
      teams: WEEK_MS,
      members: WEEK_MS,
      rosters: WEEK_MS,
      matchups: DAY_MS,
      transactions: DAY_MS,
    },
  },
} as const satisfies PollPolicyConfig;

function cloneDefaultPollPolicyConfig(): PollPolicyConfig {
  return {
    intervalsMs: {
      live_window: { ...DEFAULT_POLL_POLICY_CONFIG.intervalsMs.live_window },
      in_season_off_hours: {
        ...DEFAULT_POLL_POLICY_CONFIG.intervalsMs.in_season_off_hours,
      },
      off_season: { ...DEFAULT_POLL_POLICY_CONFIG.intervalsMs.off_season },
    },
  };
}

function applyOverride(
  config: PollPolicyConfig,
  override: PollPolicyConfigOverride | undefined,
): PollPolicyConfig {
  if (!override) {
    return config;
  }

  const parsed = pollPolicyConfigOverrideSchema.parse(override);
  for (const gameState of Object.keys(parsed.intervalsMs ?? {}) as Array<
    keyof NonNullable<PollPolicyConfigOverride["intervalsMs"]>
  >) {
    Object.assign(
      config.intervalsMs[gameState],
      parsed.intervalsMs?.[gameState] ?? {},
    );
  }

  return config;
}

export function parsePollPolicyConfigJson(
  raw: string | undefined,
): PollPolicyConfigOverride | undefined {
  if (raw === undefined) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error("Invalid ingestion poll policy JSON", { cause });
  }

  return pollPolicyConfigOverrideSchema.parse(parsed);
}

export function resolvePollPolicyConfig({
  callSiteConfig,
  globalConfig,
  leagueConfig,
}: {
  callSiteConfig?: PollPolicyConfigOverride;
  globalConfig?: PollPolicyConfigOverride;
  leagueConfig?: PollPolicyConfigOverride;
} = {}): PollPolicyConfig {
  return applyOverride(
    applyOverride(
      applyOverride(cloneDefaultPollPolicyConfig(), globalConfig),
      leagueConfig,
    ),
    callSiteConfig,
  );
}

export function createConfiguredPollPolicy({
  callSiteConfig,
  globalConfig,
}: {
  callSiteConfig?: PollPolicyConfigOverride;
  globalConfig?: PollPolicyConfigOverride;
} = {}): PollPolicy {
  return {
    due(input) {
      const config = resolvePollPolicyConfig({
        callSiteConfig,
        globalConfig,
        leagueConfig: input.leagueConfig,
      });
      const intervalMs = config.intervalsMs[input.gameState][input.dataClass];
      const nextDueAt = input.lastSyncedAt
        ? new Date(input.lastSyncedAt.getTime() + intervalMs)
        : input.now;

      return {
        due: !input.lastSyncedAt || input.now.getTime() >= nextDueAt.getTime(),
        intervalMs,
        nextDueAt,
      };
    },
  };
}
