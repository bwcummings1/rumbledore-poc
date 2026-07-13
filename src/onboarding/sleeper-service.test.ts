// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
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
import {
  createSleeperProvider,
  type SleeperFetch,
  type SleeperProvider,
} from "@/providers/sleeper/client";
import type {
  SleeperCatalogPlayer,
  SleeperPlayerCatalog,
} from "@/providers/sleeper/player-catalog";
import draftPicks2026Fixture from "../../test/fixtures/sleeper/draft-picks-2026.json";
import drafts2026Fixture from "../../test/fixtures/sleeper/drafts-2026.json";
import league2025Fixture from "../../test/fixtures/sleeper/league-2025.json";
import leagues2026Fixture from "../../test/fixtures/sleeper/leagues-2026.json";
import matchupsWeek1Fixture from "../../test/fixtures/sleeper/matchups-2026-week1.json";
import matchupsWeek2Fixture from "../../test/fixtures/sleeper/matchups-2026-week2.json";
import playersFixture from "../../test/fixtures/sleeper/players-nfl.json";
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
const fixtureCatalogPlayers = new Map<string, SleeperCatalogPlayer>(
  Object.entries(playersFixture).map(([id, player]) => [
    id,
    {
      active: player.active,
      fantasyPositions: player.fantasy_positions,
      fullName: player.full_name,
      playerId: player.player_id,
      position: player.position,
      proTeam: player.team,
      status: player.status,
    },
  ]),
);
const fixturePlayerCatalog: SleeperPlayerCatalog = {
  load: async () => ({ ok: true, value: fixtureCatalogPlayers }),
};

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
    "https://api.sleeper.app/v1/players/nfl": playersFixture,
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
    [`https://api.sleeper.app/v1/league/${currentLeagueId}/drafts`]:
      drafts2026Fixture,
    "https://api.sleeper.app/v1/draft/draft-sleeper-2026/picks":
      draftPicks2026Fixture,
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

  return createSleeperProvider({
    fetch,
    playerCatalog: fixturePlayerCatalog,
    retryDelayMs: 0,
  });
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
      total: 4,
      changed: 4,
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
    expect(matchupRows).toHaveLength(4);

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
      draftRows.find((pick) => pick.providerPickId === "draft-sleeper-2026:1"),
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
      scoringPeriod: 2,
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
