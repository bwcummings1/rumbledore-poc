// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
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
import { createCredentialCipher } from "./credential-crypto";
import {
  createFixtureYahooProvider,
  FIXTURE_YAHOO_ACCESS_TOKEN,
  FIXTURE_YAHOO_REFRESH_TOKEN,
} from "./fixture-yahoo";
import {
  connectYahooOAuth,
  createMockYahooOAuthClient,
  createYahooOAuthClient,
  importYahooDiscoveredLeague,
  listYahooDiscoveredLeagues,
  type YahooOnboardingDependencies,
} from "./yahoo-service";

const marker = `yahooonboardingtest-${randomUUID()}`;
const masterKey = "test-yahoo-onboarding-master-key-32"; // ubs:ignore — fake fixture value

let handle: DbHandle;
const providerLeagueIds = new Set<string>();

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
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

function deps({
  currentLeagueKey,
  previousLeagueKey,
  requestedImports,
}: {
  currentLeagueKey: string;
  previousLeagueKey: string;
  requestedImports: unknown[];
}): YahooOnboardingDependencies {
  providerLeagueIds.add(currentLeagueKey);
  providerLeagueIds.add(previousLeagueKey);
  return {
    cipher: createCredentialCipher(masterKey),
    db: handle.db,
    oauthClient: createMockYahooOAuthClient({
      currentLeagueKey,
      previousLeagueKey,
      redirectUri: "http://localhost:3000/api/onboarding/yahoo/callback",
    }),
    provider: createFixtureYahooProvider({
      currentLeagueKey,
      previousLeagueKey,
    }),
    requestHistoricalImport: async (data) => {
      requestedImports.push(data);
    },
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
      .where(
        and(
          eq(leagues.provider, "yahoo"),
          inArray(leagues.providerLeagueId, [...providerLeagueIds]),
        ),
      );
  }
  await handle.pool.end();
});

describe("Yahoo onboarding service", () => {
  it("builds Yahoo authorization URLs and exchanges OAuth codes", async () => {
    const fetchCalls: { init: RequestInit | undefined; url: string }[] = [];
    const oauth = createYahooOAuthClient({
      clientId: "fixture-yahoo-client-id",
      clientSecret: "fixture-yahoo-client-secret", // ubs:ignore — fake fixture value
      fetch: async (input, init) => {
        fetchCalls.push({ init, url: input.toString() });
        return jsonResponse({
          access_token: FIXTURE_YAHOO_ACCESS_TOKEN,
          expires_in: 3600,
          refresh_token: FIXTURE_YAHOO_REFRESH_TOKEN,
          scope: "fspt-r",
          token_type: "Bearer",
        });
      },
      now: () => new Date("2026-06-12T00:00:00.000Z"),
      redirectUri: "https://app.example.com/api/onboarding/yahoo/callback",
      scope: "fspt-r",
    });

    const authorizationUrl = new URL(
      oauth.authorizationUrl({ state: "state-123" }),
    );
    expect(authorizationUrl.origin).toBe("https://api.login.yahoo.com");
    expect(authorizationUrl.pathname).toBe("/oauth2/request_auth");
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "fixture-yahoo-client-id",
    );
    expect(authorizationUrl.searchParams.get("scope")).toBe("fspt-r");
    expect(authorizationUrl.searchParams.get("state")).toBe("state-123");

    const credentials = await oauth.exchangeCode({ code: "code-123" });

    expect(credentials).toEqual({
      accessToken: FIXTURE_YAHOO_ACCESS_TOKEN,
      expiresAt: "2026-06-12T00:59:00.000Z",
      refreshToken: FIXTURE_YAHOO_REFRESH_TOKEN,
      scope: "fspt-r",
      tokenType: "Bearer",
    });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toBe(
      "https://api.login.yahoo.com/oauth2/get_token",
    );
    expect(fetchCalls[0]?.init?.method).toBe("POST");
    const body = fetchCalls[0]?.init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-123");
  });

  it("discovers Yahoo leagues and imports the selected league", async () => {
    const currentLeagueKey = `461.l.${marker}`;
    const previousLeagueKey = `449.l.${marker}`;
    const user = await seedUser("oauth");
    const requestedImports: unknown[] = [];
    const testDeps = deps({
      currentLeagueKey,
      previousLeagueKey,
      requestedImports,
    });

    const connected = await connectYahooOAuth(testDeps, {
      code: "mock-yahoo-code",
      userId: user.id,
    });

    expect(connected.ok).toBe(true);
    if (!connected.ok) throw connected.error;
    expect(connected.value.discoveredLeagues).toEqual([
      {
        provider: "yahoo",
        providerId: currentLeagueKey,
        season: 2026,
        sport: "ffl",
        name: "Yahoo Fixture League",
        teamName: "Yahoo Alpha",
        size: 4,
      },
      {
        provider: "yahoo",
        providerId: previousLeagueKey,
        season: 2025,
        sport: "ffl",
        name: "Yahoo Fixture League 2025",
        teamName: "Yahoo Alpha 2025",
        size: 4,
      },
    ]);

    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, connected.value.credentialId));
    if (!credential) throw new Error("credential was not persisted");
    expect(credential).toMatchObject({
      connectionFlow: "oauth",
      provider: "yahoo",
      status: "connected",
      subjectProviderId: "YAHOO-GUID-123",
      userId: user.id,
    });
    expect(credential.encryptedPayload).not.toContain(
      FIXTURE_YAHOO_ACCESS_TOKEN,
    );
    expect(testDeps.cipher.decryptJson(credential.encryptedPayload)).toEqual({
      accessToken: FIXTURE_YAHOO_ACCESS_TOKEN,
      expiresAt: "2030-01-01T00:00:00.000Z",
      historicalLeagueKeysByLeagueKey: {
        [currentLeagueKey]: [previousLeagueKey],
      },
      leagueKeys: [previousLeagueKey],
      refreshToken: FIXTURE_YAHOO_REFRESH_TOKEN,
      tokenType: "Bearer",
    });

    const listedBeforeImport = await listYahooDiscoveredLeagues(testDeps, {
      userId: user.id,
    });
    expect(listedBeforeImport.ok).toBe(true);
    if (!listedBeforeImport.ok) throw listedBeforeImport.error;
    expect(listedBeforeImport.value).toHaveLength(2);
    expect(listedBeforeImport.value[0]).toMatchObject({
      imported: false,
      isRecommendedImport: true,
      name: "Yahoo Fixture League",
      provider: "yahoo",
      providerId: currentLeagueKey,
      season: 2026,
      sport: "ffl",
    });

    const imported = await importYahooDiscoveredLeague(testDeps, {
      providerLeagueId: currentLeagueKey,
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
    expect(requestedImports).toEqual([
      {
        credentialId: imported.value.credentialId,
        leagueId: imported.value.leagueId,
        name: "Yahoo Fixture League",
        provider: "yahoo",
        providerLeagueId: currentLeagueKey,
        season: 2026,
        size: 4,
        sport: "ffl",
        teamName: "Yahoo Alpha",
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
    expect(matchupRows).toHaveLength(2);

    const discoveredRows = await handle.db
      .select()
      .from(onboardingDiscoveredLeagues)
      .where(eq(onboardingDiscoveredLeagues.userId, user.id));
    expect(discoveredRows).toHaveLength(2);

    const listedAfterImport = await listYahooDiscoveredLeagues(testDeps, {
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
