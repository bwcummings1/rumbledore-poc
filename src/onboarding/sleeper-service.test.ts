// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { err } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyDraftPicks,
  fantasyMatchups,
  fantasyPlayers,
  fantasyRosterEntries,
  identityMappings,
  leagues,
  members,
  onboardingDiscoveredLeagues,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { AuthExpiredError } from "@/providers/model";
import type { SleeperProvider } from "@/providers/sleeper/client";
import { createFixtureSleeperProvider } from "@/providers/sleeper/fixture-sleeper";
import { createCredentialCipher } from "./credential-crypto";
import {
  connectSleeperPublic,
  importSleeperDiscoveredLeague,
  listSleeperDiscoveredLeagues,
  type SleeperOnboardingDependencies,
} from "./sleeper-service";

const marker = `sleeperonboardingtest-${randomUUID()}`;
const masterKey = "test-sleeper-onboarding-master-key-32"; // ubs:ignore — fake fixture value

let handle: DbHandle;
const providerLeagueIds = new Set<string>();

function fixtureProvider({
  currentLeagueId,
  previousLeagueId,
}: {
  currentLeagueId: string;
  previousLeagueId: string;
}): SleeperProvider {
  providerLeagueIds.add(currentLeagueId);
  providerLeagueIds.add(previousLeagueId);
  return createFixtureSleeperProvider({
    currentLeagueId,
    currentLeagueName: `${marker} Sleeper League`,
    previousLeagueId,
    previousLeagueName: `${marker} Sleeper League 2025`,
  });
}

function fixtureProviderFor(tag: string): SleeperProvider {
  return fixtureProvider({
    currentLeagueId: `${marker}-${tag}-2026`,
    previousLeagueId: `${marker}-${tag}-2025`,
  });
}

function authExpiredProvider(provider: SleeperProvider): SleeperProvider {
  return {
    ...provider,
    authenticate: async () => err(new AuthExpiredError("sleeper")),
  };
}

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

function deps(provider: SleeperProvider): SleeperOnboardingDependencies {
  return {
    cipher: createCredentialCipher(masterKey),
    db: handle.db,
    provider,
  };
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
  if (providerLeagueIds.size > 0) {
    await handle.db
      .delete(leagues)
      .where(inArray(leagues.providerLeagueId, [...providerLeagueIds]));
  }
  await handle.pool.end();
});

describe("Sleeper onboarding service", () => {
  it("rejects blank public credentials before calling the provider", async () => {
    const user = await seedUser("blank");
    const result = await connectSleeperPublic(
      deps(fixtureProviderFor("blank")),
      {
        credentials: { usernameOrUserId: "   " },
        userId: user.id,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blank Sleeper connect to fail");
    expect(result.error).toMatchObject({
      code: "ONBOARDING_INVALID_PUBLIC_CREDENTIALS",
      status: 400,
    });
    const rows = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it("does not persist credentials when Sleeper rejects the public identity", async () => {
    const user = await seedUser("identity-rejected");
    const provider = fixtureProviderFor("identity-rejected");
    const result = await connectSleeperPublic(
      deps(authExpiredProvider(provider)),
      {
        credentials: { usernameOrUserId: "missing-sleeper-user" },
        userId: user.id,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejected Sleeper connect to fail");
    expect(result.error.code).toBe("PROVIDER_AUTH_EXPIRED");
    const rows = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it("reconnects idempotently without duplicating credentials or discovery rows", async () => {
    const user = await seedUser("reconnect");
    const provider = fixtureProviderFor("reconnect");
    const testDeps = deps(provider);
    const input = {
      credentials: {
        seasons: [2026, 2025],
        usernameOrUserId: "fixture_sleeper",
      },
      userId: user.id,
    };

    const first = await connectSleeperPublic(testDeps, input);
    const second = await connectSleeperPublic(testDeps, input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok) throw first.error;
    if (!second.ok) throw second.error;
    expect(second.value.credentialId).toBe(first.value.credentialId);

    const credentials = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.userId, user.id));
    expect(credentials).toHaveLength(1);
    const discovered = await handle.db
      .select()
      .from(onboardingDiscoveredLeagues)
      .where(eq(onboardingDiscoveredLeagues.userId, user.id));
    expect(discovered).toHaveLength(2);
  });

  it("surfaces stored invalid credentials with a Sleeper reconnect action", async () => {
    const user = await seedUser("stored-invalid");
    const provider = fixtureProviderFor("stored-invalid");
    const testDeps = deps(provider);
    const connected = await connectSleeperPublic(testDeps, {
      credentials: {
        seasons: [2026],
        usernameOrUserId: "fixture_sleeper",
      },
      userId: user.id,
    });
    expect(connected.ok).toBe(true);
    if (!connected.ok) throw connected.error;

    await handle.db
      .update(providerCredentials)
      .set({
        invalidAt: new Date("2026-07-13T00:00:00.000Z"),
        status: "invalid",
      })
      .where(eq(providerCredentials.id, connected.value.credentialId));
    const listed = await listSleeperDiscoveredLeagues(testDeps, {
      userId: user.id,
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw listed.error;
    expect(listed.value[0]).toMatchObject({
      connectionState: "invalid",
      isRecommendedImport: false,
      reconnect: {
        href: "/onboarding/sleeper",
        label: "Reconnect Sleeper",
        provider: "sleeper",
      },
    });
  });

  it("marks a connected credential invalid when import authentication expires", async () => {
    const currentLeagueId = `${marker}-expired-2026`;
    const previousLeagueId = `${marker}-expired-2025`;
    const user = await seedUser("import-expired");
    const provider = fixtureProvider({ currentLeagueId, previousLeagueId });
    const connected = await connectSleeperPublic(deps(provider), {
      credentials: {
        seasons: [2026],
        usernameOrUserId: "fixture_sleeper",
      },
      userId: user.id,
    });
    expect(connected.ok).toBe(true);
    if (!connected.ok) throw connected.error;

    const imported = await importSleeperDiscoveredLeague(
      deps(authExpiredProvider(provider)),
      {
        providerLeagueId: currentLeagueId,
        season: 2026,
        userId: user.id,
      },
    );
    expect(imported.ok).toBe(false);
    if (imported.ok) throw new Error("expected expired Sleeper import to fail");
    expect(imported.error).toMatchObject({
      code: "PROVIDER_AUTH_EXPIRED",
      details: {
        reconnect: {
          href: "/onboarding/sleeper",
          label: "Reconnect Sleeper",
        },
      },
      status: 401,
    });
    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, connected.value.credentialId));
    expect(credential).toMatchObject({ status: "invalid" });
  });

  it("discovers public Sleeper leagues and imports the selected league", async () => {
    const currentLeagueId = `${marker}-2026`;
    const previousLeagueId = `${marker}-2025`;
    const user = await seedUser("public");
    const requestedImports: unknown[] = [];
    const requestedLiveIngest: unknown[] = [];
    const testDeps: SleeperOnboardingDependencies = {
      ...deps(
        fixtureProvider({
          currentLeagueId,
          previousLeagueId,
        }),
      ),
      requestHistoricalImport: async (data) => {
        requestedImports.push(data);
      },
      requestLeagueConnected: async (data) => {
        requestedLiveIngest.push(data);
      },
    };

    const connected = await connectSleeperPublic(testDeps, {
      credentials: {
        seasons: [2026, 2025],
        usernameOrUserId: "fixture_sleeper",
      },
      userId: user.id,
    });

    expect(connected.ok).toBe(true);
    if (!connected.ok) throw connected.error;
    expect(connected.value.discoveredLeagues).toEqual([
      {
        provider: "sleeper",
        providerId: currentLeagueId,
        season: 2026,
        sport: "ffl",
        name: `${marker} Sleeper League`,
        size: 4,
      },
      {
        provider: "sleeper",
        providerId: previousLeagueId,
        season: 2025,
        sport: "ffl",
        name: `${marker} Sleeper League 2025`,
        size: 4,
      },
    ]);

    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, connected.value.credentialId));
    if (!credential) throw new Error("credential was not persisted");
    expect(credential).toMatchObject({
      connectionFlow: "public",
      provider: "sleeper",
      status: "connected",
      subjectProviderId: "user-123",
      userId: user.id,
    });
    expect(credential.encryptedPayload).not.toContain("fixture_sleeper");
    expect(testDeps.cipher.decryptJson(credential.encryptedPayload)).toEqual({
      seasons: [2026, 2025],
      usernameOrUserId: "fixture_sleeper",
    });

    const listedBeforeImport = await listSleeperDiscoveredLeagues(testDeps, {
      userId: user.id,
    });
    expect(listedBeforeImport.ok).toBe(true);
    if (!listedBeforeImport.ok) throw listedBeforeImport.error;
    expect(listedBeforeImport.value).toHaveLength(2);
    expect(listedBeforeImport.value[0]).toMatchObject({
      imported: false,
      isRecommendedImport: true,
      name: `${marker} Sleeper League`,
      provider: "sleeper",
      providerId: currentLeagueId,
      season: 2026,
      sport: "ffl",
    });

    const imported = await importSleeperDiscoveredLeague(testDeps, {
      providerLeagueId: currentLeagueId,
      season: 2026,
      userId: user.id,
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) throw imported.error;
    expect(imported.value.sync.teams).toEqual({
      total: 4,
      changed: 4,
      unchanged: 0,
    });
    expect(imported.value.sync.members).toEqual({
      total: 4,
      changed: 4,
      unchanged: 0,
    });
    expect(imported.value.sync.matchups).toEqual({
      total: 2,
      changed: 2,
      unchanged: 0,
    });
    expect(imported.value.sync.draftPicks).toEqual({
      total: 3,
      changed: 3,
      unchanged: 0,
    });
    expect(imported.value.leaguemateInvites).toMatchObject({
      importedMembers: 4,
      inviteTargets: 4,
    });
    expect(imported.value.leaguemateInvites.targets[0]).toMatchObject({
      displayName: "Alpha Manager",
      suggestedChannel: "share",
    });
    expect(requestedImports).toEqual([
      {
        credentialId: imported.value.credentialId,
        leagueId: imported.value.leagueId,
        maxSeasons: 25,
        name: `${marker} Sleeper League`,
        provider: "sleeper",
        providerLeagueId: currentLeagueId,
        season: 2026,
        shadowAttempt: 1,
        size: 4,
        sport: "ffl",
      },
    ]);
    expect(requestedLiveIngest).toEqual([]);
    expect(imported.value.onboardingState).toBe("shadow_running");

    const [membership] = await handle.db
      .select()
      .from(members)
      .where(eq(members.userId, user.id));
    expect(membership).toBeUndefined();

    const matchupRows = await handle.db
      .select()
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.leagueId, imported.value.leagueId));
    expect(matchupRows).toHaveLength(2);

    const playerRows = await handle.db
      .select()
      .from(fantasyPlayers)
      .where(eq(fantasyPlayers.leagueId, imported.value.leagueId));
    expect(playerRows).toHaveLength(15);
    expect(
      playerRows.find((player) => player.providerPlayerId === "QB1"),
    ).toMatchObject({
      fullName: "Quentin Banks",
      position: "QB",
      proTeam: "BUF",
    });

    const draftRows = await handle.db
      .select()
      .from(fantasyDraftPicks)
      .where(eq(fantasyDraftPicks.leagueId, imported.value.leagueId));
    expect(draftRows).toHaveLength(3);
    expect(
      draftRows.find(
        (pick) => pick.providerPickId === `draft-${currentLeagueId}:1`,
      ),
    ).toMatchObject({
      isKeeper: true,
      pickInRound: 1,
      pickOverall: 1,
      providerPlayerId: "QB1",
      providerTeamId: "1",
      round: 1,
    });

    const rosterEntryRows = await handle.db
      .select()
      .from(fantasyRosterEntries)
      .where(eq(fantasyRosterEntries.leagueId, imported.value.leagueId));
    expect(rosterEntryRows).toHaveLength(15);
    expect(
      rosterEntryRows.find((entry) => entry.providerPlayerId === "QB1"),
    ).toMatchObject({
      scoringPeriod: 1,
      slot: "QB",
      started: true,
    });

    const identityRows = await withLeagueContext(
      handle.db,
      imported.value.leagueId,
      (tx) =>
        tx
          .select()
          .from(identityMappings)
          .where(eq(identityMappings.leagueId, imported.value.leagueId)),
    );
    const sharedOwnerTeam = identityRows.find(
      (mapping) => mapping.providerTeamId === "1" && mapping.season === 2026,
    );
    const directOwnerTeam = identityRows.find(
      (mapping) => mapping.providerTeamId === "3" && mapping.season === 2026,
    );
    expect(sharedOwnerTeam).toBeDefined();
    expect(directOwnerTeam).toBeDefined();
    expect(sharedOwnerTeam?.personId).not.toBe(directOwnerTeam?.personId);

    const discoveredRows = await handle.db
      .select()
      .from(onboardingDiscoveredLeagues)
      .where(eq(onboardingDiscoveredLeagues.userId, user.id));
    expect(discoveredRows).toHaveLength(2);

    const listedAfterImport = await listSleeperDiscoveredLeagues(testDeps, {
      userId: user.id,
    });
    expect(listedAfterImport.ok).toBe(true);
    if (!listedAfterImport.ok) throw listedAfterImport.error;
    expect(listedAfterImport.value[0]).toMatchObject({
      imported: false,
      isRecommendedImport: false,
      leagueId: imported.value.leagueId,
      onboardingState: "shadow_running",
    });
  });
});
