import { randomUUID } from "node:crypto";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { parseEnv } from "../src/core/env/schema";
import { createDb, type Db } from "../src/db/client";
import { leagues, members, users } from "../src/db/schema";

const runMarker = `pwa-cache-${randomUUID()}`;
const password = `Rumbledore-${runMarker}-password`;
const userAEmail = `${runMarker}-a@example.com`;
const userBEmail = `${runMarker}-b@example.com`;

async function signUpAndIn(
  page: Page,
  testInfo: TestInfo,
  input: {
    email: string;
    name: string;
  },
) {
  const baseUrl = String(testInfo.project.use.baseURL ?? "");
  if (!baseUrl.startsWith("http")) {
    throw new Error("Playwright baseURL must be configured for auth helpers");
  }

  const authHeaders = { origin: baseUrl };
  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: {
      email: input.email,
      name: input.name,
      password,
      rememberMe: true,
    },
    headers: authHeaders,
  });
  expect(signup.ok()).toBe(true);

  const signin = await page.request.post("/api/auth/sign-in/email", {
    data: {
      email: input.email,
      password,
      rememberMe: true,
    },
    headers: authHeaders,
  });
  expect(signin.ok()).toBe(true);
}

async function userIdByEmail(db: Db, email: string): Promise<string> {
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

async function seedLeagueForUser(input: {
  email: string;
  leagueName: string;
  providerLeagueId: string;
}): Promise<string> {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    const userId = await userIdByEmail(handle.db, input.email);
    const [league] = await handle.db
      .insert(leagues)
      .values({
        currentScoringPeriod: 1,
        name: input.leagueName,
        provider: "espn",
        providerLeagueId: input.providerLeagueId,
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
    return league.id;
  } finally {
    await handle.pool.end();
  }
}

test.afterAll(async () => {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.db
      .delete(leagues)
      .where(sql`${leagues.providerLeagueId} like ${`${runMarker}:%`}`);
    await handle.db
      .delete(users)
      .where(sql`${users.email} in (${userAEmail}, ${userBEmail})`);
  } finally {
    await handle.pool.end();
  }
});

test("league pages are no-store and do not leak across login sessions", async ({
  page,
}, testInfo) => {
  const leagueName = `${runMarker} A Private League`;
  await signUpAndIn(page, testInfo, {
    email: userAEmail,
    name: "Cache Test User A",
  });
  const leagueId = await seedLeagueForUser({
    email: userAEmail,
    leagueName,
    providerLeagueId: `${runMarker}:a`,
  });
  const leaguePath = `/leagues/${leagueId}`;

  await page.goto(leaguePath);
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();

  const seededCache = await page.evaluate(
    async ({ body, path: pagePath }) => {
      const cache = await caches.open("rumbledore-pages-v2");
      const url = new URL(pagePath, window.location.origin).href;
      await cache.put(
        url,
        new Response(`<html><body>${body}</body></html>`, {
          headers: { "Content-Type": "text/html" },
        }),
      );
      return Boolean(await cache.match(url));
    },
    { body: leagueName, path: leaguePath },
  );
  expect(seededCache).toBe(true);

  await page.goto("/you");
  const signOut = page.getByRole("button", { name: "Sign out" });
  await expect(signOut).toBeEnabled();
  await signOut.click();
  await expect(page).toHaveURL("/");

  const pagesCacheStillExists = await page.evaluate(async () => {
    const keys = await caches.keys();
    return keys.some((key) => key.startsWith("rumbledore-pages-"));
  });
  expect(pagesCacheStillExists).toBe(false);

  await signUpAndIn(page, testInfo, {
    email: userBEmail,
    name: "Cache Test User B",
  });
  await page.goto(leaguePath);

  await expect(
    page.getByRole("heading", { name: "No league access" }),
  ).toBeVisible();
  await expect(
    page.getByText("This account is not a member of that league."),
  ).toBeVisible();
  await expect(page.getByText(leagueName)).toHaveCount(0);
});
