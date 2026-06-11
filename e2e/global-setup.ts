import { parseEnv } from "../src/core/env/schema";
import { createDb } from "../src/db/client";
import { migrateSerialized } from "../src/db/test-support";

export default async function globalSetup() {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable; start the local stack with `pnpm db:up` before running Playwright e2e tests.",
      { cause },
    );
  }

  try {
    await migrateSerialized(handle);
  } finally {
    await handle.pool.end();
  }
}
