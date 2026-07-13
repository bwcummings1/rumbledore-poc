import { randomUUID } from "node:crypto";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { parseEnv } from "../src/core/env/schema";
import { createDb } from "../src/db/client";
import { leagues, users } from "../src/db/schema";
import {
  FIXTURE_SLEEPER_PROVIDER_LEAGUE_ID,
  FIXTURE_SLEEPER_USERNAME,
} from "../src/providers/sleeper/fixture-values";
import {
  createCurationCheckpoint,
  pushCurationSeason,
  setCurationSeasonMode,
} from "../src/stats";

const runMarker = `sleeper-e2e-${randomUUID()}`;
const email = `${runMarker}@example.com`;

async function cleanFixtureRows(): Promise<void> {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.db
      .delete(leagues)
      .where(
        and(
          eq(leagues.provider, "sleeper"),
          eq(leagues.providerLeagueId, FIXTURE_SLEEPER_PROVIDER_LEAGUE_ID),
        ),
      );
    await handle.db.delete(users).where(sql`${users.email} = ${email}`);
  } finally {
    await handle.pool.end();
  }
}

async function signUpAndIn(page: Page, testInfo: TestInfo): Promise<void> {
  const baseUrl = String(testInfo.project.use.baseURL ?? "");
  if (!baseUrl.startsWith("http")) {
    throw new Error("Playwright baseURL must be configured for auth helpers");
  }

  const password = `Rumbledore-${runMarker}-password`;
  const authHeaders = { origin: baseUrl };
  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: {
      email,
      name: "Sleeper E2E Commissioner",
      password,
      rememberMe: true,
    },
    headers: authHeaders,
  });
  expect(signup.ok()).toBe(true);
  const signin = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: true },
    headers: authHeaders,
  });
  expect(signin.ok()).toBe(true);
}

async function saveAndPushSeason(
  leagueId: string,
  season: number,
): Promise<void> {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    const [actor] = await handle.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (!actor) throw new Error("Sleeper e2e actor was not persisted");
    await createCurationCheckpoint(handle.db, {
      actorUserId: actor.id,
      label: "Sleeper fixture baseline",
      leagueId,
      note: "Sleeper onboarding e2e canonical baseline",
    });
    await setCurationSeasonMode(handle.db, {
      actorUserId: actor.id,
      leagueId,
      mode: "finalized",
      reason: `Sleeper onboarding e2e finalized fixture season ${season}`,
      season,
    });
    await pushCurationSeason(handle.db, {
      actorUserId: actor.id,
      leagueId,
      reason: "Sleeper onboarding e2e pushed named player canon",
      season,
    });
  } finally {
    await handle.pool.end();
  }
}

test.beforeAll(cleanFixtureRows);
test.afterAll(cleanFixtureRows);

test("fixture Sleeper connect renders named Data Book rosters and player records", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await signUpAndIn(page, testInfo);

  await page.goto("/onboarding/sleeper");
  await expect(
    page.getByRole("heading", {
      name: "Bring your Sleeper league into Rumbledore",
    }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Username or user ID" })
    .fill(FIXTURE_SLEEPER_USERNAME);
  await page.getByRole("button", { name: "Find leagues" }).click();

  await expect(
    page.getByRole("checkbox", { name: /Sleeper Fixture League.*2026/ }),
  ).toBeVisible();
  await expect(page.getByText("Selected by default")).toBeVisible();
  await page.getByRole("button", { name: "Import selected" }).click();

  await expect(page.getByText("We found your 4 leaguemates.")).toBeVisible({
    timeout: 60_000,
  });
  const homeLink = page.getByRole("link", { name: "Open home" });
  await expect(homeLink).toBeVisible({ timeout: 60_000 });
  const homeHref = await homeLink.getAttribute("href");
  if (!homeHref) throw new Error("Sleeper import did not render a home link");
  const leagueId = homeHref.split("/").at(-1);
  if (!leagueId)
    throw new Error("Sleeper home link did not contain a league ID");
  await page.goto(`/leagues/${leagueId}/data?season=2025`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Sleeper Fixture League League Data",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Data Book season")).toHaveValue("2025");
  await page.getByRole("radio", { name: "Weeks" }).click();
  await expect(
    page.getByRole("table", { name: "2025 Data Book weeks" }),
  ).toBeVisible();
  const roster = page.getByRole("region", {
    name: "Alpha Manager week 1 roster",
  });
  await expect(roster).toBeVisible();
  await expect(roster.getByText("Quentin Banks")).toBeVisible();
  await expect(roster.getByText("QB", { exact: true }).first()).toBeVisible();
  await expect(roster.getByText("QB / BUF / Active")).toBeVisible();
  await expect(roster).not.toContainText(/unknown/i);

  await saveAndPushSeason(leagueId, 2025);
  await page.goto(`/leagues/${leagueId}/records`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Sleeper Fixture League record book",
    }),
  ).toBeVisible();
  const players = page.locator("section#players");
  await expect(players.getByRole("heading", { name: "Players" })).toBeVisible();
  await expect(players.getByText("Best player weeks")).toBeVisible();
  await expect(players.getByText("Quentin Banks").first()).toBeVisible();
  await expect(players).toContainText("QB - BUF");
  await expect(players).not.toContainText(/unknown/i);
});
