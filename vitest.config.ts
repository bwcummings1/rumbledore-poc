import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    hookTimeout: 30_000,
    include: ["src/**/*.test.{ts,tsx}"],
    // REC-003: the DB-backed integration tests share one Postgres, so at full
    // core parallelism on a large local box under competing load the arena/
    // bankroll/tailoring recomputes contend on connections and queries and can
    // exceed the (deliberately generous) 30s budget. Cap worker concurrency
    // LOCALLY to curb that contention while keeping the fast unit/component suite
    // parallel. CI is left at its default: its smaller runners already limit
    // concurrency and its runs are not flaky, so a cap there would only slow them
    // (e.g. 50% of a 2-core runner is a single serial worker). Giving DB tests
    // their own per-worker database would remove the shared-DB contention
    // entirely and is the durable follow-up (it changes the test DB topology).
    maxWorkers: process.env.CI ? undefined : "66%",
    setupFiles: ["src/testing/vitest-setup.ts"],
    testTimeout: 30_000,
  },
});
