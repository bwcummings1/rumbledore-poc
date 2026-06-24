// Real ESPN 95050 screenshot capture for Task T16.
// Run after scripts/verify-t16-real-league-population.ts:
//   T16_REAL_SCREENSHOTS=1 PATH=/usr/bin:$PATH pnpm exec playwright test e2e/real-95050-screenshots.spec.ts
// Output: docs/screenshots/real-95050/<viewport>/<screen>.png
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { and, desc, eq, sql } from "drizzle-orm";
import { parseEnv } from "../src/core/env/schema";
import { createDb } from "../src/db/client";
import {
  fantasyPlayers,
  fantasyRosterEntries,
  identityMappings,
  leagues,
  members,
  persons,
  sessions,
  teamSeasons,
  users,
} from "../src/db/schema";

const runMarker = `t16-real-shot-${randomUUID()}`;
const OUT = "docs/screenshots/real-95050";
const PROVIDER_LEAGUE_ID = "95050";
const SAMPLE_SEASON = 2012;
const SAMPLE_WEEK = 8;
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
];

interface RealLeagueTarget {
  league: { id: string; name: string };
  roster: {
    managerName: string;
    playerName: string;
    position: string;
    proTeam: string | null;
    slot: string;
    teamName: string;
    week: number;
  };
}

async function signUpAndIn(page: Page, testInfo: TestInfo) {
  const baseUrl = String(testInfo.project.use.baseURL ?? "");
  const password = `Rumbledore-${runMarker}-password`;
  const email = `${runMarker}@example.com`;
  const headers = { origin: baseUrl };
  await page.request.post("/api/auth/sign-up/email", {
    data: {
      email,
      name: "T16 Real League Viewer",
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

async function grantRealLeagueAccess(email: string): Promise<RealLeagueTarget> {
  const handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    const [league] = await handle.db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(
        and(
          eq(leagues.provider, "espn"),
          eq(leagues.providerLeagueId, PROVIDER_LEAGUE_ID),
        ),
      )
      .orderBy(desc(leagues.updatedAt))
      .limit(1);
    if (!league) {
      throw new Error(
        "ESPN 95050 is missing. Run scripts/verify-t16-real-league-population.ts first.",
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
        role: "data_steward",
        userId: user.id,
      })
      .onConflictDoNothing({
        target: [members.organizationId, members.userId],
      });
    await handle.db
      .update(sessions)
      .set({ activeOrganizationId: league.id })
      .where(eq(sessions.userId, user.id));

    const [roster] = await handle.db
      .select({
        managerName: persons.canonicalName,
        playerName: fantasyPlayers.fullName,
        position: fantasyPlayers.position,
        proTeam: fantasyPlayers.proTeam,
        slot: fantasyRosterEntries.slot,
        teamName: teamSeasons.teamName,
        week: fantasyRosterEntries.scoringPeriod,
      })
      .from(fantasyRosterEntries)
      .innerJoin(
        fantasyPlayers,
        and(
          eq(fantasyPlayers.leagueId, fantasyRosterEntries.leagueId),
          eq(fantasyPlayers.provider, fantasyRosterEntries.provider),
          eq(
            fantasyPlayers.leagueProviderId,
            fantasyRosterEntries.leagueProviderId,
          ),
          eq(
            fantasyPlayers.providerPlayerId,
            fantasyRosterEntries.providerPlayerId,
          ),
        ),
      )
      .innerJoin(
        teamSeasons,
        and(
          eq(teamSeasons.leagueId, fantasyRosterEntries.leagueId),
          eq(teamSeasons.season, fantasyRosterEntries.season),
          eq(teamSeasons.providerTeamId, fantasyRosterEntries.providerTeamId),
        ),
      )
      .innerJoin(
        identityMappings,
        and(
          eq(identityMappings.leagueId, teamSeasons.leagueId),
          eq(identityMappings.teamSeasonId, teamSeasons.id),
        ),
      )
      .innerJoin(
        persons,
        and(
          eq(persons.leagueId, identityMappings.leagueId),
          eq(persons.id, identityMappings.personId),
        ),
      )
      .where(
        and(
          eq(fantasyRosterEntries.leagueId, league.id),
          eq(fantasyRosterEntries.season, SAMPLE_SEASON),
          eq(fantasyRosterEntries.scoringPeriod, SAMPLE_WEEK),
          eq(fantasyPlayers.fullName, "Luke Kuechly"),
        ),
      )
      .orderBy(fantasyRosterEntries.providerTeamId)
      .limit(1);
    if (!roster) {
      throw new Error("Luke Kuechly 2012 week 8 roster target was not found");
    }
    if (roster.position === "unknown" || roster.slot === "unknown") {
      throw new Error("Luke Kuechly roster target is still undecoded");
    }

    return { league, roster };
  } finally {
    await handle.pool.end();
  }
}

async function shoot(
  page: Page,
  vp: string,
  name: string,
  route: string,
  assertReady: (page: Page, route: string) => Promise<void>,
) {
  await assertReady(page, route);
  await page.waitForTimeout(900);

  const dir = path.join(OUT, vp);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${name}.png`),
    fullPage: true,
  });
  console.log(`  ok ${vp}/${name}.png`);
}

async function expectSomeTextVisible(page: Page, text: string | RegExp) {
  const matches = page.getByText(text);
  await expect
    .poll(
      async () => {
        const count = await matches.count();
        for (let index = 0; index < count; index += 1) {
          if (await matches.nth(index).isVisible()) {
            return true;
          }
        }
        return false;
      },
      {
        message: `expected visible text match for ${String(text)}`,
        timeout: 10_000,
      },
    )
    .toBe(true);
}

async function openDataBookPeople(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /NHS Alumni Annual League Data/i }),
  ).toBeVisible();
  for (const name of ["bradwcummings", "truman1109", "w hardy"]) {
    await expectSomeTextVisible(page, name);
  }
  await expect(page.getByText("Fixture Manager")).toHaveCount(0);
}

async function openDataBookSettings(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: "Settings" }).click();
  await expectSomeTextVisible(page, "Lineup slots");
  await expectSomeTextVisible(page, "QB: 1");
}

async function openDataBookWeeks(
  page: Page,
  route: string,
  target: RealLeagueTarget["roster"],
) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: "Weeks" }).click();
  await page.getByLabel("Data Book season").selectOption(String(SAMPLE_SEASON));
  const rosterButtonName = `Show ${target.managerName} week ${target.week} roster`;
  await page.getByRole("button", { name: rosterButtonName }).last().click();
  const roster = page.getByRole("region", {
    name: `${target.managerName} week ${target.week} roster`,
  });
  await expect(roster).toBeVisible();
  await expect(roster.getByText(target.playerName)).toBeVisible();
  await expect(
    roster.getByText(`${target.position} / ${target.proTeam}`).first(),
  ).toBeVisible();
  await expect(roster.getByText(target.slot).first()).toBeVisible();
  await expect(roster.getByText("unknown")).toHaveCount(0);
}

async function openEditLedger(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /NHS Alumni Annual League Data/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { exact: true, name: "Latest first" }),
  ).toBeVisible();
  const firstEntry = page
    .locator('[data-slot="edit-ledger-feed"] button[aria-expanded="false"]')
    .first();
  await firstEntry.waitFor({ timeout: 15_000 });
  await firstEntry.click();
  await page
    .locator('[aria-label="Before value"]')
    .first()
    .waitFor({ timeout: 15_000 });
}

async function openRecords(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /Record Book/i }),
  ).toBeVisible();
  for (const heading of [
    "All-time",
    "Regular season",
    "Playoff",
    "Head-to-head",
    "Achievements",
    "Lowlights",
  ]) {
    await expect(
      page.getByRole("heading", { exact: true, name: heading }),
    ).toBeVisible();
  }
  await expect(page.getByText("No pushed data yet")).toHaveCount(0);
  await expectSomeTextVisible(page, /w hardy|truman1109|bradwcummings/);
}

async function openLeagueHome(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /NHS Alumni Annual/i }),
  ).toBeVisible();
  await expect(page.getByText("2026 ESPN fantasy football")).toBeVisible();
  await expect(page.getByText("16 managers")).toBeVisible();
}

async function openPressFront(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /The NHS Alumni Annual Press/i }),
  ).toBeVisible();
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

test("capture real ESPN 95050 league screenshots", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.T16_REAL_SCREENSHOTS,
    "set T16_REAL_SCREENSHOTS=1 after running the T16 population verifier",
  );
  test.setTimeout(240_000);

  const email = await signUpAndIn(page, testInfo);
  const target = await grantRealLeagueAccess(email);
  const leagueRoute = `/leagues/${target.league.id}`;
  const dataRoute = `${leagueRoute}/data`;

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await shoot(page, vp.name, "01-league-home", leagueRoute, openLeagueHome);
    await shoot(
      page,
      vp.name,
      "02-press-front",
      `${leagueRoute}/press`,
      openPressFront,
    );
    await shoot(
      page,
      vp.name,
      "03-data-book-people",
      dataRoute,
      openDataBookPeople,
    );
    await shoot(
      page,
      vp.name,
      "04-data-book-settings",
      dataRoute,
      openDataBookSettings,
    );
    await shoot(
      page,
      vp.name,
      "05-data-book-weeks-roster-2012-wk8",
      dataRoute,
      async (readyPage, route) =>
        openDataBookWeeks(readyPage, route, target.roster),
    );
    await shoot(
      page,
      vp.name,
      "06-edit-ledger",
      `${leagueRoute}/ledger`,
      openEditLedger,
    );
    await shoot(
      page,
      vp.name,
      "07-records",
      `${leagueRoute}/records`,
      openRecords,
    );
  }
});
