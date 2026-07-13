// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canImportLeague } from "@/app/onboarding/onboarding-flow";
import { parseEnv } from "@/core/env/schema";
import { ok } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import {
  leagues,
  onboardingDiscoveredLeagues,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type {
  FantasyProvider,
  FantasyProviderSession,
} from "@/providers/model";
import { createCredentialCipher } from "./credential-crypto";
import {
  importDiscoveredLeague,
  listDiscoveredLeagueInventory,
  listDiscoveredLeagues,
  SHADOW_IMPORT_STALE_AFTER_MS,
} from "./provider-service";

const marker = `providerinventorytest-${randomUUID()}`;

let handle: DbHandle;
const cipher = createCredentialCipher(
  "fixture-provider-service-credential-key",
); // ubs:ignore — fake fixture value

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

function importProvider(providerLeagueId: string): {
  getLeagueCalls: number;
  provider: FantasyProvider<unknown, FantasyProviderSession>;
} {
  let getLeagueCalls = 0;
  return {
    get getLeagueCalls() {
      return getLeagueCalls;
    },
    provider: {
      id: "espn",
      name: "Fixture ESPN",
      capabilities: {
        authKind: "cookie",
        dataClasses: {
          divisions: "none",
          final_standings: "none",
          history: "partial",
          keeper_dynasty: "none",
          league: "full",
          matchups: "full",
          members: "full",
          rosters: "none",
          scoring_detail: "partial",
          teams: "full",
          transactions: "none",
        },
        requiresOAuth: false,
        supportsHistory: true,
        supportsRosters: false,
        supportsTransactions: false,
      },
      async authenticate() {
        return ok({ authKind: "cookie", provider: "espn" });
      },
      async discoverLeagues() {
        return ok([]);
      },
      async getHistory() {
        return ok([]);
      },
      async getLeague() {
        getLeagueCalls += 1;
        return ok({
          currentScoringPeriod: 1,
          name: `${marker} import league`,
          provider: "espn",
          providerId: providerLeagueId,
          scoringSettings: {},
          scoringType: "H2H_POINTS",
          season: 2026,
          size: 4,
          sport: "ffl",
          status: "in_season",
        });
      },
      async getMatchups() {
        return ok([]);
      },
      async getMembers() {
        return ok([]);
      },
      async getRosters() {
        return ok([]);
      },
      async getTeams() {
        return ok([]);
      },
      async getTransactions() {
        return ok([]);
      },
    },
  };
}

async function seedImportCandidate(tag: string) {
  const user = await seedUser(tag);
  const providerLeagueId = `${marker}-${tag}-league`;
  const observedAt = new Date("2026-07-13T19:00:00.000Z");
  const [credential] = await handle.db
    .insert(providerCredentials)
    .values({
      connectionFlow: "manual",
      encryptedPayload: cipher.encryptJson({
        espn_s2: "fixture-session",
        swid: "fixture-user",
      }),
      lastValidatedAt: observedAt,
      provider: "espn",
      subjectProviderId: `${marker}-${tag}-subject`,
      userId: user.id,
    })
    .returning();
  if (!credential) throw new Error("provider credential was not persisted");
  const [discovered] = await handle.db
    .insert(onboardingDiscoveredLeagues)
    .values({
      credentialId: credential.id,
      lastDiscoveredAt: observedAt,
      name: `${marker} ${tag} league`,
      provider: "espn",
      providerLeagueId,
      season: 2026,
      size: 4,
      sport: "ffl",
      userId: user.id,
    })
    .returning();
  if (!discovered) throw new Error("discovered league was not persisted");
  return { discovered, providerLeagueId, user };
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
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
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

  it("admits only one concurrent shadow-import attempt for a discovered league", async () => {
    const seeded = await seedImportCandidate("concurrent-import");
    const fixture = importProvider(seeded.providerLeagueId);
    const requestedAttempts: number[] = [];
    const deps = {
      cipher,
      db: handle.db,
      providers: { espn: fixture.provider },
      requestHistoricalImport: async (data: { shadowAttempt?: number }) => {
        if (data.shadowAttempt !== undefined) {
          requestedAttempts.push(data.shadowAttempt);
        }
      },
    };

    const results = await Promise.all([
      importDiscoveredLeague(deps, {
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        userId: seeded.user.id,
      }),
      importDiscoveredLeague(deps, {
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        userId: seeded.user.id,
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      error: { code: "ONBOARDING_IMPORT_ALREADY_RUNNING", status: 409 },
      ok: false,
    });
    expect(fixture.getLeagueCalls).toBe(1);
    expect(requestedAttempts).toEqual([1]);
    const [discovered] = await handle.db
      .select()
      .from(onboardingDiscoveredLeagues)
      .where(eq(onboardingDiscoveredLeagues.id, seeded.discovered.id));
    expect(discovered).toMatchObject({
      importAttempts: 1,
      importState: "shadow_running",
    });
    expect(discovered?.importedLeagueId).not.toBeNull();
  });

  it("fully rolls back a failed enqueue and removes its orphan pre-live league", async () => {
    const seeded = await seedImportCandidate("enqueue-rollback");
    const fixture = importProvider(seeded.providerLeagueId);
    const result = await importDiscoveredLeague(
      {
        cipher,
        db: handle.db,
        providers: { espn: fixture.provider },
        requestHistoricalImport: async () => {
          throw new Error("fixture enqueue failure");
        },
      },
      {
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        userId: seeded.user.id,
      },
    );

    expect(result).toMatchObject({
      error: { code: "ONBOARDING_IMPORT_JOB_ENQUEUE_FAILED", status: 500 },
      ok: false,
    });
    const [discovered] = await handle.db
      .select()
      .from(onboardingDiscoveredLeagues)
      .where(eq(onboardingDiscoveredLeagues.id, seeded.discovered.id));
    expect(discovered).toMatchObject({
      importAttempts: 0,
      importedLeagueId: null,
      importState: null,
      shadowStartedAt: null,
    });
    expect(
      await handle.db
        .select({ id: leagues.id })
        .from(leagues)
        .where(eq(leagues.providerLeagueId, seeded.providerLeagueId)),
    ).toHaveLength(0);
  });
});
