import { randomUUID } from "node:crypto";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { parseEnv } from "../src/core/env/schema";
import { createDb } from "../src/db/client";
import { users } from "../src/db/schema";

const runMarker = `e2e-${randomUUID()}`;

async function signUpAndIn(page: Page, testInfo: TestInfo) {
  const baseUrl = String(testInfo.project.use.baseURL ?? "");
  if (!baseUrl.startsWith("http")) {
    throw new Error("Playwright baseURL must be configured for auth helpers");
  }

  const password = `Rumbledore-${runMarker}-password`;
  const email = `${runMarker}@example.com`;
  const authHeaders = { origin: baseUrl };

  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: {
      email,
      name: "E2E Commissioner",
      password,
      rememberMe: true,
    },
    headers: authHeaders,
  });
  expect(signup.ok()).toBe(true);

  const signin = await page.request.post("/api/auth/sign-in/email", {
    data: {
      email,
      password,
      rememberMe: true,
    },
    headers: authHeaders,
  });
  expect(signin.ok()).toBe(true);
}

test.afterAll(async () => {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.db
      .delete(users)
      .where(sql`${users.email} = ${`${runMarker}@example.com`}`);
  } finally {
    await handle.pool.end();
  }
});

test("mock ESPN connect imports the fixture league and opens standings", async ({
  page,
}, testInfo) => {
  await signUpAndIn(page, testInfo);

  await page.goto("/onboarding/espn");
  await expect(
    page.getByRole("heading", { name: "Bring your league into Rumbledore" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Connect ESPN" }).click();
  await expect(
    page
      .frameLocator('iframe[title="Hosted ESPN login"]')
      .getByText("NHS Alumni Annual · 2026 · ready"),
  ).toBeVisible();

  const capture = page.getByRole("button", { name: "Capture" });
  await expect(capture).toBeEnabled();
  await capture.click();

  await expect(
    page.getByRole("checkbox", { name: /NHS Alumni Annual/ }),
  ).toBeVisible();
  await expect(page.getByText("Selected by default")).toBeVisible();

  await page.getByRole("button", { name: "Import selected" }).click();

  await expect(page.getByText("We found your 15 leaguemates.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("link", { name: "Invite roster" }),
  ).toHaveAttribute("href", /\/leagues\/[0-9a-f-]+\/members$/);

  const homeLink = page.getByRole("link", { name: "Open home" });
  await expect(homeLink).toBeVisible({ timeout: 30_000 });
  const homeHref = await homeLink.getAttribute("href");
  if (!homeHref) {
    throw new Error("Imported league did not render a home link");
  }
  expect(homeHref).toMatch(/^\/leagues\/[0-9a-f-]+$/);

  await page.goto(homeHref);
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "NHS Alumni Annual" }),
  ).toBeVisible();
  await expect(
    page.getByText("2026 ESPN fantasy football · Preseason"),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Press" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Standings" }).click();
  await expect(page.getByRole("heading", { name: "Standings" })).toBeVisible();
  await expect(page.getByText("H2H_POINTS standings")).toBeVisible();
  await expect(page.getByText("Fixture Team 01").first()).toBeVisible();
  await expect(page.getByText("Fixture Manager 12").first()).toBeVisible();
  await page.getByRole("tab", { name: "This Week" }).click();
  await expect(
    page.getByRole("heading", { name: "Week 1 matchups" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Teams" }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
});
