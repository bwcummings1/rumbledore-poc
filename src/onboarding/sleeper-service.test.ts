// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import {
  fantasyMatchups,
  leagues,
  members,
  onboardingDiscoveredLeagues,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  createSleeperProvider,
  type SleeperFetch,
  type SleeperProvider,
} from "@/providers/sleeper/client";
import league2025Fixture from "../../test/fixtures/sleeper/league-2025.json";
import leagues2026Fixture from "../../test/fixtures/sleeper/leagues-2026.json";
import matchupsWeek1Fixture from "../../test/fixtures/sleeper/matchups-2026-week1.json";
import matchupsWeek2Fixture from "../../test/fixtures/sleeper/matchups-2026-week2.json";
import rostersFixture from "../../test/fixtures/sleeper/rosters-2026.json";
import stateFixture from "../../test/fixtures/sleeper/state-2026.json";
import transactionsWeek1Fixture from "../../test/fixtures/sleeper/transactions-2026-week1.json";
import userFixture from "../../test/fixtures/sleeper/user-fixture.json";
import usersFixture from "../../test/fixtures/sleeper/users-2026.json";
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

type SleeperLeagueFixture = (typeof leagues2026Fixture)[number];
type FixtureRouteValue = Response | unknown;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function fixtureProvider({
  currentLeagueId,
  previousLeagueId,
}: {
  currentLeagueId: string;
  previousLeagueId: string;
}): SleeperProvider {
  providerLeagueIds.add(currentLeagueId);
  providerLeagueIds.add(previousLeagueId);

  const currentLeague = structuredClone(
    leagues2026Fixture[0],
  ) as SleeperLeagueFixture;
  currentLeague.league_id = currentLeagueId;
  currentLeague.previous_league_id = previousLeagueId;
  currentLeague.name = `${marker} Sleeper League`;

  const previousLeague = structuredClone(
    league2025Fixture,
  ) as unknown as SleeperLeagueFixture;
  previousLeague.league_id = previousLeagueId;
  previousLeague.name = `${marker} Sleeper League 2025`;

  const routes: Record<string, FixtureRouteValue> = {
    "https://api.sleeper.app/v1/state/nfl": stateFixture,
    "https://api.sleeper.app/v1/user/fixture_sleeper": userFixture,
    "https://api.sleeper.app/v1/user/user-123/leagues/nfl/2026": [
      currentLeague,
    ],
    "https://api.sleeper.app/v1/user/user-123/leagues/nfl/2025": [
      previousLeague,
    ],
    [`https://api.sleeper.app/v1/league/${currentLeagueId}`]: currentLeague,
    [`https://api.sleeper.app/v1/league/${previousLeagueId}`]: previousLeague,
    [`https://api.sleeper.app/v1/league/${currentLeagueId}/rosters`]:
      rostersFixture,
    [`https://api.sleeper.app/v1/league/${previousLeagueId}/rosters`]:
      rostersFixture,
    [`https://api.sleeper.app/v1/league/${currentLeagueId}/users`]:
      usersFixture,
    [`https://api.sleeper.app/v1/league/${previousLeagueId}/users`]:
      usersFixture,
    [`https://api.sleeper.app/v1/league/${currentLeagueId}/matchups/1`]:
      matchupsWeek1Fixture,
    [`https://api.sleeper.app/v1/league/${currentLeagueId}/matchups/2`]:
      matchupsWeek2Fixture,
    [`https://api.sleeper.app/v1/league/${previousLeagueId}/matchups/1`]:
      matchupsWeek1Fixture,
    [`https://api.sleeper.app/v1/league/${previousLeagueId}/matchups/2`]:
      matchupsWeek2Fixture,
    [`https://api.sleeper.app/v1/league/${currentLeagueId}/transactions/1`]:
      transactionsWeek1Fixture,
    [`https://api.sleeper.app/v1/league/${currentLeagueId}/transactions/2`]: [],
    [`https://api.sleeper.app/v1/league/${previousLeagueId}/transactions/1`]:
      transactionsWeek1Fixture,
    [`https://api.sleeper.app/v1/league/${previousLeagueId}/transactions/2`]:
      [],
  };

  const fetch: SleeperFetch = async (input) => {
    const url = input.toString();
    if (!(url in routes)) {
      return jsonResponse(
        { message: `missing fixture for ${url}` },
        {
          status: 404,
        },
      );
    }

    const route = routes[url];
    return route instanceof Response ? route : jsonResponse(route);
  };

  return createSleeperProvider({ fetch, retryDelayMs: 0 });
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
  it("discovers public Sleeper leagues and imports the selected league", async () => {
    const currentLeagueId = `${marker}-2026`;
    const previousLeagueId = `${marker}-2025`;
    const user = await seedUser("public");
    const requestedImports: unknown[] = [];
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
      total: 4,
      changed: 4,
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
        name: `${marker} Sleeper League`,
        provider: "sleeper",
        providerLeagueId: currentLeagueId,
        season: 2026,
        size: 4,
        sport: "ffl",
      },
    ]);

    const [membership] = await handle.db
      .select()
      .from(members)
      .where(eq(members.userId, user.id));
    expect(membership).toMatchObject({
      organizationId: imported.value.leagueId,
      role: "commissioner",
    });

    const matchupRows = await handle.db
      .select()
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.leagueId, imported.value.leagueId));
    expect(matchupRows).toHaveLength(4);

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
      imported: true,
      isRecommendedImport: false,
      leagueId: imported.value.leagueId,
    });
  });
});
