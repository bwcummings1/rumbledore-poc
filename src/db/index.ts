import "server-only";
import { getEnv } from "@/core/env";
import { createDb, type Db, type DbHandle } from "./client";

// Memoized on globalThis so dev-server HMR doesn't leak connection pools.
const globalForDb = globalThis as { __rumbledoreDb?: DbHandle };

/** Lazily-initialized Drizzle client bound to the validated DATABASE_URL. */
export function getDb(): Db {
  globalForDb.__rumbledoreDb ??= createDb(getEnv().databaseUrl);
  return globalForDb.__rumbledoreDb.db;
}

export type { Db } from "./client";
export * from "./schema";
