import { sql } from "drizzle-orm";
import type { Db } from "./client";

/**
 * The drizzle transaction handle passed to `withLeagueContext` callbacks.
 * League-scoped data access should accept this type so it can only run
 * inside an RLS-scoped transaction.
 */
export type LeagueScopedTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction with `app.current_league_id` set for its
 * duration (spec 02 §6). RLS policies on league-scoped tables compare
 * `league_id` against this setting via `current_league_id()`, so inside the
 * callback only the given league's rows are visible/writable — and outside
 * any league context, league-scoped tables match nothing.
 *
 * `set_config(..., is_local => true)` is transaction-local: the setting
 * resets on commit/rollback and never leaks to other pooled connections.
 */
export async function withLeagueContext<T>(
  db: Db,
  leagueId: string,
  fn: (tx: LeagueScopedTx) => Promise<T>,
): Promise<T> {
  // The setting is read with `::uuid` in policies; reject bad input here so a
  // malformed id surfaces as a clear error instead of a cast failure mid-query.
  if (!UUID_RE.test(leagueId)) {
    throw new Error("withLeagueContext: leagueId must be a UUID");
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_league_id', ${leagueId}, true)`,
    );
    return fn(tx);
  });
}
