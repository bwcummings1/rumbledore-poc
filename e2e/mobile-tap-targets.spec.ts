// Runs only in the `mobile` Playwright project (see playwright.config.ts).
// Rumbledore is a mobile-first PWA whose budget declares a 44px minimum tap
// target, but every e2e project ran at desktop width — so the one viewport the
// product is designed for was the one nothing measured.
import { createHash, randomUUID } from "node:crypto";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { parseEnv } from "../src/core/env/schema";
import { createDb, type Db } from "../src/db/client";
import { withLeagueContext } from "../src/db/rls";
import { contentItems, leagues, members, users } from "../src/db/schema";
import budget from "../src/pwa/mobile-performance-budget.json";

// Read from the budget rather than hard-coded, so the number the script gates on
// and the number the browser measures cannot drift apart.
const MINIMUM_TAP_TARGET_PX = budget.thresholds.minimumTapTargetPx;

const runMarker = `taps-${randomUUID()}`;
const password = `Rumbledore-${runMarker}-password`;
const email = `${runMarker}@example.com`;

/**
 * Controls only. WCAG 2.5.8 exempts links inline in a sentence, and this suite
 * follows that: a bare `<a>` in body copy is not a tap target failure, a button
 * or a control-styled link is.
 */
const CONTROL_SELECTOR = [
  "button",
  "a.btn",
  '[role="tab"]',
  '[role="switch"]',
  '[role="button"]',
  "select",
  'input:not([type="hidden"])',
].join(", ");

interface UndersizedControl {
  readonly height: number;
  readonly label: string;
  readonly selector: string;
  readonly width: number;
}

async function signUpAndIn(page: Page, testInfo: TestInfo) {
  const baseUrl = String(testInfo.project.use.baseURL ?? "");
  if (!baseUrl.startsWith("http")) {
    throw new Error("Playwright baseURL must be configured for auth helpers");
  }
  const headers = { origin: baseUrl };

  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: { email, name: "Tap Target Auditor", password, rememberMe: true },
    headers,
  });
  expect(signup.ok()).toBe(true);

  const signin = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: true },
    headers,
  });
  expect(signin.ok()).toBe(true);
}

async function userIdByEmail(db: Db): Promise<string> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    throw new Error(`Missing seeded user ${email}`);
  }
  return user.id;
}

/**
 * Seeds the minimum a press feed needs to render a story card, which is what
 * puts a reaction strip on screen. `loadLeagueFeed` selects league-scoped
 * `content_item` rows by `kind in ("blog", "ingest_event")` and published
 * status; the reaction summary is synthesised blank when no reactions exist, so
 * the strip renders with every emoji at zero.
 */
async function seedLeagueWithPress(): Promise<string> {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    const userId = await userIdByEmail(handle.db);
    const [league] = await handle.db
      .insert(leagues)
      .values({
        currentScoringPeriod: 1,
        name: `${runMarker} Tap Target League`,
        provider: "espn",
        providerLeagueId: `${runMarker}:league`,
        scoringType: "H2H_POINTS",
        season: 2026,
        size: 0,
        sport: "ffl",
        status: "preseason",
      })
      .returning({ id: leagues.id });
    if (!league) {
      throw new Error("Failed to seed league");
    }

    await handle.db.insert(members).values({
      organizationId: league.id,
      role: "commissioner",
      userId,
    });

    const dedupKey = `${runMarker}:story`;
    // `content_item` is FORCE ROW LEVEL SECURITY with a
    // `league_id = current_league_id()` check, so a bare insert only survives
    // because the local role happens to be a superuser. Set the context the
    // policy expects instead of relying on that.
    await withLeagueContext(handle.db, league.id, (tx) =>
      tx.insert(contentItems).values({
        body: "The bench outscored the starters again. Nobody wants to discuss it.",
        contentHash: createHash("sha256").update(dedupKey).digest("hex"),
        dedupKey,
        kind: "blog",
        leagueId: league.id,
        publishedAt: new Date(),
        status: "published",
        summary: "A short dispatch seeded for the tap-target audit.",
        title: `${runMarker} Bench Report`,
      }),
    );

    return league.id;
  } finally {
    await handle.pool.end();
  }
}

/**
 * `next dev` injects its own toolbar into a `<nextjs-portal>` shadow root, and
 * Playwright's CSS engine pierces shadow DOM — so its 32px dev-tools button
 * lands in the audit. It ships in no production build, so measuring it would
 * only teach the next person to weaken the threshold.
 */
function isDevOverlayControl(node: Element): boolean {
  let current: Node | null = node;
  while (current) {
    const root = current.getRootNode();
    if (!(root instanceof ShadowRoot)) {
      return false;
    }
    if (root.host.tagName.toLowerCase().startsWith("nextjs-")) {
      return true;
    }
    current = root.host;
  }
  return false;
}

async function undersizedControls(page: Page): Promise<UndersizedControl[]> {
  const controls = page.locator(CONTROL_SELECTOR);
  const count = await controls.count();
  const undersized: UndersizedControl[] = [];

  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) {
      continue;
    }
    if ((await control.getAttribute("aria-hidden")) === "true") {
      continue;
    }
    if (await control.evaluate(isDevOverlayControl)) {
      continue;
    }
    const box = await control.boundingBox();
    if (!box) {
      continue;
    }
    if (
      box.height >= MINIMUM_TAP_TARGET_PX &&
      box.width >= MINIMUM_TAP_TARGET_PX
    ) {
      continue;
    }

    const label =
      (await control.getAttribute("aria-label")) ??
      (await control.getAttribute("title")) ??
      ((await control.textContent()) ?? "").trim().slice(0, 60) ??
      "";
    undersized.push({
      height: Math.round(box.height),
      label: label || "(no accessible name)",
      selector: await control.evaluate((node) => {
        const element = node as HTMLElement;
        const slot = element.closest("[data-slot]")?.getAttribute("data-slot");
        return `${element.tagName.toLowerCase()}${slot ? ` in [data-slot="${slot}"]` : ""}`;
      }),
      width: Math.round(box.width),
    });
  }

  return undersized;
}

function describeFailures(controls: UndersizedControl[]): string[] {
  return controls.map(
    (control) =>
      `${control.selector} "${control.label}" is ${control.width}x${control.height}px`,
  );
}

test.afterAll(async () => {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.db
      .delete(leagues)
      .where(sql`${leagues.providerLeagueId} like ${`${runMarker}:%`}`);
    await handle.db.delete(users).where(eq(users.email, email));
  } finally {
    await handle.pool.end();
  }
});

test("mobile shell meets the 44px minimum tap target", async ({
  page,
}, testInfo) => {
  await signUpAndIn(page, testInfo);
  const leagueId = await seedLeagueWithPress();

  await page.goto(`/leagues/${leagueId}/press`);

  // The reaction strip is the control this test exists to measure, so its
  // absence must fail loudly rather than let the audit pass over an empty page.
  await expect(
    page.locator('[data-slot="content-reactions"]').first(),
  ).toBeVisible({ timeout: 30_000 });

  expect(describeFailures(await undersizedControls(page))).toEqual([]);

  await page.goto(`/leagues/${leagueId}`);
  await expect(page.getByRole("tab", { name: "Press" })).toBeVisible({
    timeout: 30_000,
  });

  expect(describeFailures(await undersizedControls(page))).toEqual([]);
});
