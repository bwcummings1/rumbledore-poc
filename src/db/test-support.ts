import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { DbHandle } from "./client";

// Arbitrary app-wide advisory lock key for migrations ("RUMB" in hex).
const MIGRATE_LOCK_KEY = 0x52554d42;

/**
 * Test-only migrate: vitest runs test files in parallel processes, and
 * concurrent `migrate()` calls race on unapplied migrations (duplicate
 * CREATE TYPE/TABLE). A session-level advisory lock serializes them; the
 * losers then see the migrations as applied and no-op.
 */
export async function migrateSerialized(handle: DbHandle): Promise<void> {
  const client = await handle.pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATE_LOCK_KEY]);
    await migrate(handle.db, { migrationsFolder: "src/db/migrations" });
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [MIGRATE_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}
