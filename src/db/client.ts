import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Pure client factory — no env access, no server-only guard — so tests and
 * tooling can build a client against any connection string. App code should
 * use `getDb()` from `src/db` instead.
 */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type DbHandle = ReturnType<typeof createDb>;
export type Db = DbHandle["db"];
