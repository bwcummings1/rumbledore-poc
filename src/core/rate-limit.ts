import { getEnv } from "@/core/env";
import { logger } from "@/core/logging";
import {
  MemorySpendCounterStore,
  RedisSpendCounterStore,
  type SpendCounterStore,
} from "@/core/spend-guard";

export interface ApiRateLimitRule {
  max: number;
  scope: string;
  subject: string;
  windowSeconds: number;
}

export interface ApiRateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

const RATE_LIMIT_PREFIX = "rumbledore:api-rate-limit:v1";

const fallbackStore = new MemorySpendCounterStore();
let usingFallback = false;
let warnedFallback = false;

function keyFor(rule: ApiRateLimitRule): string {
  return `${RATE_LIMIT_PREFIX}:${encodeURIComponent(rule.scope)}:${encodeURIComponent(rule.subject)}`;
}

function storeForCurrentEnv(): SpendCounterStore {
  if (usingFallback) {
    return fallbackStore;
  }
  return new RedisSpendCounterStore(getEnv().redisUrl);
}

async function increment(
  rule: ApiRateLimitRule,
  injectedStore?: SpendCounterStore,
): Promise<number> {
  if (injectedStore) {
    return injectedStore.incrementBy(keyFor(rule), 1, {
      ttlSeconds: rule.windowSeconds,
    });
  }

  try {
    return await storeForCurrentEnv().incrementBy(keyFor(rule), 1, {
      ttlSeconds: rule.windowSeconds,
    });
  } catch (error) {
    usingFallback = true;
    if (!warnedFallback) {
      warnedFallback = true;
      logger.warn("api_rate_limit_store_fallback", { error, mode: "memory" });
    }
    return fallbackStore.incrementBy(keyFor(rule), 1, {
      ttlSeconds: rule.windowSeconds,
    });
  }
}

export async function enforceApiRateLimit(
  rule: ApiRateLimitRule,
  store?: SpendCounterStore,
): Promise<ApiRateLimitResult> {
  const count = await increment(rule, store);
  return {
    allowed: count <= rule.max,
    count,
    retryAfterSeconds: rule.windowSeconds,
  };
}
