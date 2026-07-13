// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canImportLeague } from "@/app/onboarding/onboarding-flow";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import {
  onboardingDiscoveredLeagues,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  listDiscoveredLeagueInventory,
  listDiscoveredLeagues,
  SHADOW_IMPORT_STALE_AFTER_MS,
} from "./provider-service";

const marker = `providerinventorytest-${randomUUID()}`;

let handle: DbHandle;

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `${marker} ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning();
  if (!user) throw new Error("user was not created");
  return user;
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable — start the local stack with `pnpm db:up` before running tests.",
      { cause },
    );
  }
  await migrateSerialized(handle);
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("provider discovery inventory", () => {
  it("aggregates discovered leagues across connected providers in one list", async () => {
    const user = await seedUser("multi");
    const now = new Date("2026-06-15T00:00:00.000Z");
    const [espnCredential, sleeperCredential, yahooCredential] = await handle.db
      .insert(providerCredentials)
      .values([
        {
          connectionFlow: "manual",
          encryptedPayload: "encrypted-espn-payload",
          lastValidatedAt: now,
          provider: "espn",
          subjectProviderId: `${marker}-espn-subject`,
          userId: user.id,
        },
        {
          connectionFlow: "public",
          encryptedPayload: "encrypted-sleeper-payload",
          lastValidatedAt: now,
          provider: "sleeper",
          subjectProviderId: `${marker}-sleeper-subject`,
          userId: user.id,
        },
        {
          connectionFlow: "oauth",
          encryptedPayload: "encrypted-yahoo-payload",
          lastValidatedAt: now,
          provider: "yahoo",
          subjectProviderId: `${marker}-yahoo-subject`,
          userId: user.id,
        },
      ])
      .returning();

    if (!espnCredential || !sleeperCredential || !yahooCredential) {
      throw new Error("provider credentials were not persisted");
    }

    await handle.db.insert(onboardingDiscoveredLeagues).values([
      {
        credentialId: espnCredential.id,
        lastDiscoveredAt: now,
        name: "Fixture ESPN League",
        provider: "espn",
        providerLeagueId: `${marker}-espn-league`,
        providerTeamId: `${marker}-espn-team`,
        season: 2026,
        size: 12,
        sport: "ffl",
        teamName: "ESPN Team",
        userId: user.id,
      },
      {
        credentialId: sleeperCredential.id,
        lastDiscoveredAt: now,
        name: "Fixture Sleeper League",
        provider: "sleeper",
        providerLeagueId: `${marker}-sleeper-league`,
        season: 2026,
        size: 10,
        sport: "ffl",
        userId: user.id,
      },
      {
        credentialId: yahooCredential.id,
        lastDiscoveredAt: now,
        name: "Fixture Yahoo League",
        provider: "yahoo",
        providerLeagueId: `${marker}-yahoo-league`,
        providerTeamId: `${marker}-yahoo-team`,
        season: 2026,
        size: 8,
        sport: "ffl",
        teamName: "Yahoo Team",
        userId: user.id,
      },
    ]);

    const inventory = await listDiscoveredLeagueInventory(
      { db: handle.db },
      { userId: user.id },
    );
    expect(inventory.ok).toBe(true);
    if (!inventory.ok) throw inventory.error;
    expect(inventory.value.map((league) => league.provider)).toEqual([
      "espn",
      "sleeper",
      "yahoo",
    ]);
    expect(inventory.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isRecommendedImport: true,
          name: "Fixture ESPN League",
          provider: "espn",
          providerId: `${marker}-espn-league`,
          providerTeamId: `${marker}-espn-team`,
          teamName: "ESPN Team",
        }),
        expect.objectContaining({
          isRecommendedImport: true,
          name: "Fixture Sleeper League",
          provider: "sleeper",
          providerId: `${marker}-sleeper-league`,
        }),
        expect.objectContaining({
          isRecommendedImport: true,
          name: "Fixture Yahoo League",
          provider: "yahoo",
          providerId: `${marker}-yahoo-league`,
          providerTeamId: `${marker}-yahoo-team`,
          teamName: "Yahoo Team",
        }),
      ]),
    );

    const espnOnly = await listDiscoveredLeagues(
      { db: handle.db },
      {
        provider: "espn",
        userId: user.id,
      },
    );
    expect(espnOnly.ok).toBe(true);
    if (!espnOnly.ok) throw espnOnly.error;
    expect(espnOnly.value).toHaveLength(1);
    expect(espnOnly.value[0]).toMatchObject({ provider: "espn" });
  });

  it("makes an expired shadow run importable while a fresh run stays blocked", async () => {
    const user = await seedUser("stale-shadow");
    const observedAt = new Date("2026-07-13T18:00:00.000Z");
    const [credential] = await handle.db
      .insert(providerCredentials)
      .values({
        connectionFlow: "manual",
        encryptedPayload: "encrypted-stale-shadow-payload",
        lastValidatedAt: observedAt,
        provider: "espn",
        subjectProviderId: `${marker}-stale-shadow-subject`,
        userId: user.id,
      })
      .returning();
    if (!credential) throw new Error("provider credential was not persisted");

    const [discovered] = await handle.db
      .insert(onboardingDiscoveredLeagues)
      .values({
        credentialId: credential.id,
        importAttempts: 1,
        importState: "shadow_running",
        lastDiscoveredAt: observedAt,
        name: "Stuck shadow league",
        provider: "espn",
        providerLeagueId: `${marker}-stale-shadow-league`,
        season: 2026,
        shadowStartedAt: new Date(
          observedAt.getTime() - SHADOW_IMPORT_STALE_AFTER_MS - 1,
        ),
        size: 12,
        sport: "ffl",
        userId: user.id,
      })
      .returning();
    if (!discovered) throw new Error("discovered league was not persisted");

    const staleInventory = await listDiscoveredLeagueInventory(
      { db: handle.db, now: () => observedAt },
      { userId: user.id },
    );
    expect(staleInventory.ok).toBe(true);
    if (!staleInventory.ok) throw staleInventory.error;
    expect(staleInventory.value).toHaveLength(1);
    expect(staleInventory.value[0]).toMatchObject({
      imported: false,
      isRecommendedImport: true,
    });
    expect(staleInventory.value[0]?.onboardingState).toBeUndefined();
    expect(canImportLeague(staleInventory.value[0] ?? { imported: true })).toBe(
      true,
    );

    await handle.db
      .update(onboardingDiscoveredLeagues)
      .set({
        shadowStartedAt: new Date(
          observedAt.getTime() - SHADOW_IMPORT_STALE_AFTER_MS + 1,
        ),
      })
      .where(eq(onboardingDiscoveredLeagues.id, discovered.id));

    const freshInventory = await listDiscoveredLeagueInventory(
      { db: handle.db, now: () => observedAt },
      { userId: user.id },
    );
    expect(freshInventory.ok).toBe(true);
    if (!freshInventory.ok) throw freshInventory.error;
    expect(freshInventory.value[0]).toMatchObject({
      imported: false,
      isRecommendedImport: false,
      onboardingState: "shadow_running",
    });
    expect(canImportLeague(freshInventory.value[0] ?? { imported: true })).toBe(
      false,
    );
  });
});
