import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    hookTimeout: 30_000,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/testing/vitest-setup.ts"],
    testTimeout: 30_000,
  },
});
