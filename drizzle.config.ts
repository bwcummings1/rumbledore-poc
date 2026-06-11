import { defineConfig } from "drizzle-kit";
// Tooling context (no Next env loading) — reuse the validated parser so
// DATABASE_URL semantics (defaults, empty-string-as-unset) match the app.
import { parseEnv } from "./src/core/env/schema";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: parseEnv(process.env).databaseUrl },
  strict: true,
  verbose: true,
});
