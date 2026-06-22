// UI/UX screenshot capture (not part of the normal e2e gate — gated behind SCREENSHOTS=1).
// Run: SCREENSHOTS=1 PATH=/usr/bin:$PATH pnpm exec playwright test e2e/screenshots.spec.ts
// Output: docs/screenshots/<viewport>/<screen>.png  (mobile / tablet / desktop)
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Page, type TestInfo, test } from "@playwright/test";

const runMarker = `shots-${randomUUID()}`;
const OUT = "docs/screenshots";
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
];

async function signUpAndIn(page: Page, testInfo: TestInfo) {
  const baseUrl = String(testInfo.project.use.baseURL ?? "");
  const password = `Rumbledore-${runMarker}-password`;
  const email = `${runMarker}@example.com`;
  const headers = { origin: baseUrl };
  await page.request.post("/api/auth/sign-up/email", {
    data: {
      email,
      name: "Screenshot Commissioner",
      password,
      rememberMe: true,
    },
    headers,
  });
  await page.request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: true },
    headers,
  });
}

async function shoot(page: Page, vp: string, name: string, route: string) {
  try {
    await page.goto(route, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    /* some pages keep a live connection open; screenshot anyway */
  }
  await page.waitForTimeout(900);
  const dir = path.join(OUT, vp);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({
      path: path.join(dir, `${name}.png`),
      fullPage: true,
    });
    console.log(`  ok ${vp}/${name}.png`);
  } catch (e) {
    console.log(`  FAIL ${vp}/${name}: ${(e as Error).message}`);
  }
}

async function shootDataBookScopePrompt(
  page: Page,
  vp: string,
  name: string,
  route: string,
) {
  try {
    await page.goto(route, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    /* some pages keep a live connection open; screenshot anyway */
  }
  await page.waitForTimeout(900);
  const editButton = page
    .locator('button[aria-label^="Edit real name"]:visible')
    .first();
  await editButton.waitFor({ timeout: 15_000 });
  const confirmButton = page
    .locator('button[aria-label^="Confirm real name"]:visible')
    .first();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await editButton.evaluate((button: HTMLElement) => button.click());
    try {
      await confirmButton.waitFor({ timeout: 2_000 });
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await confirmButton.waitFor({ timeout: 15_000 });
  const editForm = page
    .locator("form")
    .filter({
      has: page.locator('button[aria-label^="Confirm real name"]:visible'),
    })
    .first();
  await editForm
    .locator("input")
    .first()
    .fill("Screenshot Steward", { timeout: 15_000 });
  await confirmButton.evaluate((button: HTMLElement) => button.click());
  await page
    .getByRole("dialog", { name: "Apply data edit" })
    .waitFor({ timeout: 15_000 });

  const dir = path.join(OUT, vp);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({
      path: path.join(dir, `${name}.png`),
      fullPage: true,
    });
    console.log(`  ok ${vp}/${name}.png`);
  } catch (e) {
    console.log(`  FAIL ${vp}/${name}: ${(e as Error).message}`);
  }
}

async function seedEditLedgerActivity(page: Page, leagueId: string) {
  const dataRoute = `/leagues/${leagueId}/data`;
  try {
    await page.goto(dataRoute, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    /* live routes may keep realtime handles open; continue with visible UI */
  }
  await page.waitForTimeout(900);

  const editButton = page
    .locator('button[aria-label^="Edit real name"]:visible')
    .first();
  await editButton.waitFor({ timeout: 15_000 });
  const confirmButton = page
    .locator('button[aria-label^="Confirm real name"]:visible')
    .first();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await editButton.evaluate((button: HTMLElement) => button.click());
    try {
      await confirmButton.waitFor({ timeout: 2_000 });
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  const editForm = page
    .locator("form")
    .filter({
      has: page.locator('button[aria-label^="Confirm real name"]:visible'),
    })
    .first();
  await editForm
    .locator("input")
    .first()
    .fill("Screenshot Ledger Steward", { timeout: 15_000 });
  await confirmButton.evaluate((button: HTMLElement) => button.click());
  await page
    .getByRole("dialog", { name: "Apply data edit" })
    .waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Apply draft edit" }).click();
  await page.getByText("Draft change").waitFor({ timeout: 15_000 });

  const checkpoint = await page.request.post(
    `/api/leagues/${leagueId}/curation/checkpoints`,
    {
      data: {
        label: "Screenshot save",
        note: "Screenshot harness save",
      },
    },
  );
  if (!checkpoint.ok()) {
    throw new Error(`checkpoint seed failed: ${checkpoint.status()}`);
  }

  const push = await page.request.post(
    `/api/leagues/${leagueId}/curation/push`,
    {
      data: {
        action: "push",
        reason: "Screenshot harness push",
        season: 2026,
      },
    },
  );
  if (!push.ok()) {
    throw new Error(`push seed failed: ${push.status()}`);
  }
}

async function applyVisibleRealNameEdit(page: Page, value: string) {
  const editButton = page
    .locator('button[aria-label^="Edit real name"]:visible')
    .first();
  await editButton.waitFor({ timeout: 15_000 });
  const confirmButton = page
    .locator('button[aria-label^="Confirm real name"]:visible')
    .first();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await editButton.evaluate((button: HTMLElement) => button.click());
    try {
      await confirmButton.waitFor({ timeout: 2_000 });
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  const editForm = page
    .locator("form")
    .filter({
      has: page.locator('button[aria-label^="Confirm real name"]:visible'),
    })
    .first();
  await editForm.locator("input").first().fill(value, { timeout: 15_000 });
  await confirmButton.evaluate((button: HTMLElement) => button.click());
  await page
    .getByRole("dialog", { name: "Apply data edit" })
    .waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Apply draft edit" }).click();
  await page.getByText("Draft change").waitFor({ timeout: 15_000 });
}

async function seedDataBookSavePushState(page: Page, leagueId: string) {
  const dataRoute = `/leagues/${leagueId}/data`;
  try {
    await page.goto(dataRoute, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    /* live routes may keep realtime handles open; continue with visible UI */
  }
  await page.waitForTimeout(900);

  await applyVisibleRealNameEdit(page, "Screenshot Saved Steward");
  const saved = await page.request.post(
    `/api/leagues/${leagueId}/curation/checkpoints`,
    {
      data: {
        label: "Screenshot saved draft",
        note: "Screenshot harness saved state",
      },
    },
  );
  if (!saved.ok()) {
    throw new Error(`checkpoint state seed failed: ${saved.status()}`);
  }

  const mode = await page.request.post(
    `/api/leagues/${leagueId}/curation/seasons/2026/mode`,
    {
      data: {
        mode: "finalized",
        reason: "Screenshot harness finalized current season",
      },
    },
  );
  if (!mode.ok()) {
    throw new Error(`season mode seed failed: ${mode.status()}`);
  }

  const pushCurrent = await page.request.post(
    `/api/leagues/${leagueId}/curation/push`,
    {
      data: {
        action: "push",
        reason: "Screenshot harness pushed baseline",
        season: 2026,
      },
    },
  );
  if (!pushCurrent.ok()) {
    throw new Error(`current-season push seed failed: ${pushCurrent.status()}`);
  }

  await applyVisibleRealNameEdit(page, "Screenshot Saved Unpushed Steward");
  const savedUnpushed = await page.request.post(
    `/api/leagues/${leagueId}/curation/checkpoints`,
    {
      data: {
        label: "Screenshot unpushed draft",
        note: "Screenshot harness saved-unpushed state",
      },
    },
  );
  if (!savedUnpushed.ok()) {
    throw new Error(
      `saved-unpushed checkpoint seed failed: ${savedUnpushed.status()}`,
    );
  }

  await applyVisibleRealNameEdit(page, "Screenshot Unsaved Steward");
}

async function shootDataBookPushConfirm(
  page: Page,
  vp: string,
  name: string,
  route: string,
) {
  try {
    await page.goto(route, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    /* live routes may keep realtime handles open; screenshot anyway */
  }
  await page.waitForTimeout(900);
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await page.getByText("Checkpoint saved").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Push 2026" }).click();
  await page
    .getByRole("dialog", { name: "Push saved season" })
    .waitFor({ timeout: 15_000 });

  const dir = path.join(OUT, vp);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({
      path: path.join(dir, `${name}.png`),
      fullPage: true,
    });
    console.log(`  ok ${vp}/${name}.png`);
  } catch (e) {
    console.log(`  FAIL ${vp}/${name}: ${(e as Error).message}`);
  }
}

async function shootEditLedgerExpanded(
  page: Page,
  vp: string,
  name: string,
  route: string,
) {
  try {
    await page.goto(route, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    /* live routes may keep realtime handles open; screenshot anyway */
  }
  await page.waitForTimeout(900);
  const firstEntry = page
    .locator('[data-slot="edit-ledger-feed"] button[aria-expanded="false"]')
    .first();
  await firstEntry.waitFor({ timeout: 15_000 });
  await firstEntry.evaluate((button: HTMLElement) => button.click());
  await page
    .locator('[aria-label="Before value"]')
    .first()
    .waitFor({ timeout: 15_000 });

  const dir = path.join(OUT, vp);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({
      path: path.join(dir, `${name}.png`),
      fullPage: true,
    });
    console.log(`  ok ${vp}/${name}.png`);
  } catch (e) {
    console.log(`  FAIL ${vp}/${name}: ${(e as Error).message}`);
  }
}

test("capture UI screenshots at mobile/tablet/desktop", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.SCREENSHOTS,
    "set SCREENSHOTS=1 to capture screenshots",
  );
  test.setTimeout(600_000);

  await signUpAndIn(page, testInfo);

  // Pass A — fresh onboarding + central screens (no league needed yet).
  const preRoutes: Array<[string, string]> = [
    ["01-landing", "/"],
    ["02-onboarding-espn", "/onboarding/espn"],
    ["03-onboarding-sleeper", "/onboarding/sleeper"],
    ["04-onboarding-yahoo", "/onboarding/yahoo"],
    ["08-central-news", "/news"],
    ["09-arena-leaderboard", "/arena"],
    ["16-you-settings", "/you"],
  ];
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, route] of preRoutes)
      await shoot(page, vp.name, name, route);
  }

  // Seed — mock ESPN connect + import fixture league 95050 (mirrors espn-onboarding.spec.ts).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/onboarding/espn");
  await page.getByRole("button", { name: "Connect ESPN" }).click();
  await page
    .frameLocator('iframe[title="Hosted ESPN login"]')
    .getByText("NHS Alumni Annual · 2026 · ready")
    .waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Capture" }).click();
  await page
    .getByRole("checkbox", { name: /NHS Alumni Annual/ })
    .waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Import selected" }).click();
  const homeLink = page.getByRole("link", { name: "Open home" });
  await homeLink.waitFor({ timeout: 60_000 });
  const homeHref = (await homeLink.getAttribute("href")) ?? "";
  const leagueId = homeHref.split("/").pop() ?? "";
  console.log(`seeded league home: ${homeHref}`);
  await seedDataBookSavePushState(page, leagueId);

  // Pass B — populated league screens.
  const leagueRoutes: Array<[string, string]> = [
    ["05-league-home", homeHref],
    ["06-league-feed", `/leagues/${leagueId}/feed`],
    ["07-league-invite", `/leagues/${leagueId}/invite`],
    ["10-records", `/leagues/${leagueId}/records`],
    ["11-cast", `/leagues/${leagueId}/cast`],
    ["12-bet", `/leagues/${leagueId}/bet`],
    ["13-press", `/leagues/${leagueId}/press`],
    ["14-lore", `/leagues/${leagueId}/lore`],
    ["15-members", `/leagues/${leagueId}/members`],
    ["17-data-book", `/leagues/${leagueId}/data`],
  ];
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, route] of leagueRoutes)
      await shoot(page, vp.name, name, route);
    await shootDataBookScopePrompt(
      page,
      vp.name,
      "17-data-book-scope-prompt",
      `/leagues/${leagueId}/data`,
    );
    await shootDataBookPushConfirm(
      page,
      vp.name,
      "17-data-book-push-confirm",
      `/leagues/${leagueId}/data`,
    );
  }

  await seedEditLedgerActivity(page, leagueId);
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await shoot(page, vp.name, "18-edit-ledger", `/leagues/${leagueId}/ledger`);
    await shootEditLedgerExpanded(
      page,
      vp.name,
      "18-edit-ledger-expanded",
      `/leagues/${leagueId}/ledger`,
    );
  }
});
