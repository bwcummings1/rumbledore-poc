import { NextResponse } from "next/server";
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

export interface ApiRateLimitGuardRule extends ApiRateLimitRule {
  /** User-facing 429 copy. Never include the subject or any request header. */
  message: string;
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

/**
 * Applies `rule` and returns a ready-to-send 429 when the caller is over budget,
 * or `null` when the request may proceed.
 *
 * Every rate-limited route wrote the same fifteen-line 429 by hand, which is how
 * a route ends up with a limit but no `Retry-After`, or with a 503 instead of a
 * 429. Returning the response — rather than a boolean the caller must remember to
 * act on — makes the guard impossible to check and then ignore.
 *
 * The bucket is keyed on `subject`, which callers must set to the authenticated
 * user id. It is never derived from a header, so no cookie or token can reach the
 * counter key or the log line.
 */
export async function enforceApiRateLimitOrReject(
  rule: ApiRateLimitGuardRule,
  store?: SpendCounterStore,
): Promise<NextResponse | null> {
  const limit = await enforceApiRateLimit(rule, store);
  if (limit.allowed) {
    return null;
  }

  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: rule.message } },
    {
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(limit.retryAfterSeconds),
      },
      status: 429,
    },
  );
}
