import { sendRedisCommand } from "@/core/redis";

const AUTH_STORAGE_PREFIX = "rumbledore:better-auth:v1:";

interface SecondaryStorage {
  delete: (key: string) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  getAndDelete?: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
}

function storageKey(key: string): string {
  return `${AUTH_STORAGE_PREFIX}${key}`;
}

export function createRedisSecondaryStorage(
  redisUrl: string,
): SecondaryStorage {
  return {
    async delete(key) {
      await sendRedisCommand(redisUrl, ["DEL", storageKey(key)]);
    },
    async get(key) {
      const value = await sendRedisCommand(redisUrl, ["GET", storageKey(key)]);
      return typeof value === "string" ? value : null;
    },
    async getAndDelete(key) {
      const value = await sendRedisCommand(redisUrl, [
        "GETDEL",
        storageKey(key),
      ]);
      return typeof value === "string" ? value : null;
    },
    async set(key, value, ttl) {
      const command =
        ttl && ttl > 0
          ? ["SET", storageKey(key), value, "EX", String(Math.ceil(ttl))]
          : ["SET", storageKey(key), value];
      await sendRedisCommand(redisUrl, command);
    },
  };
}
