import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    {
      name: "chromium",
      testIgnore: /mobile-.*\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      // Rumbledore is a mobile-first PWA, but every e2e project ran at desktop
      // width — so the viewport the product is designed for was the one nothing
      // asserted against. `mobile-*.spec.ts` runs here and only here; a touch
      // viewport is what makes a tap-target assertion mean anything.
      name: "mobile",
      testMatch: /mobile-.*\.spec\.ts$/,
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `next dev --hostname 127.0.0.1 --port ${PORT}`,
    env: {
      BETTER_AUTH_URL: BASE_URL,
      MOCK_BROWSERBASE: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: BASE_URL,
  },
  workers: 1,
});
