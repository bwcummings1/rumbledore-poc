// T9 screenshot capture for the real imported league after
// scripts/verify-records-pushed-snapshot.ts has pushed canonical data.
// Run: T9_SCREENSHOTS=1 PATH=/usr/bin:$PATH pnpm exec playwright test e2e/t9-records-snapshot.spec.ts
// Output: docs/screenshots/<viewport>/10-records-t9-pushed.png
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { and, desc, eq, sql } from "drizzle-orm";
import { parseEnv } from "../src/core/env/schema";
import { createDb } from "../src/db/client";
import { leagues, members, sessions, users } from "../src/db/schema";

const runMarker = `t9-shot-${randomUUID()}`;
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
      name: "T9 Screenshot Member",
      password,
      rememberMe: true,
    },
    headers,
  });
  await page.request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: true },
    headers,
  });
  return email;
}

async function grantRealLeagueAccess(email: string) {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    const [league] = await handle.db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(
        and(
          eq(leagues.provider, "espn"),
          eq(leagues.providerLeagueId, "95050"),
        ),
      )
      .orderBy(desc(leagues.updatedAt))
      .limit(1);
    if (!league) {
      throw new Error(
        "ESPN 95050 league is missing. Run scripts/verify-records-pushed-snapshot.ts first.",
      );
    }

    const [user] = await handle.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) {
      throw new Error("screenshot user was not created");
    }

    await handle.db
      .insert(members)
      .values({
        organizationId: league.id,
        role: "member",
        userId: user.id,
      })
      .onConflictDoNothing({
        target: [members.organizationId, members.userId],
      });
    await handle.db
      .update(sessions)
      .set({ activeOrganizationId: league.id })
      .where(eq(sessions.userId, user.id));

    return league;
  } finally {
    await handle.pool.end();
  }
}

async function shoot(page: Page, vp: string, name: string, route: string) {
  try {
    await page.goto(route, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    /* realtime connections can keep the route warm; screenshot visible UI */
  }
  await expect(
    page.getByRole("heading", { name: /record book/i }),
  ).toBeVisible();
  await expect(page.getByText("No pushed data yet")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Single-week records" }),
  ).toBeVisible();
  await page.waitForTimeout(900);

  const dir = path.join(OUT, vp);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${name}.png`),
    fullPage: true,
  });
  console.log(`  ok ${vp}/${name}.png`);
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

test("capture T9 record book reading pushed data", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.T9_SCREENSHOTS,
    "set T9_SCREENSHOTS=1 after running the T9 verifier",
  );
  test.setTimeout(180_000);

  const email = await signUpAndIn(page, testInfo);
  const league = await grantRealLeagueAccess(email);
  const route = `/leagues/${league.id}/records`;

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await shoot(page, vp.name, "10-records-t9-pushed", route);
  }
});
