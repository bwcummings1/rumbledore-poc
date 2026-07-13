// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataIntegrityChecks,
  fantasyMatchups,
  leagues,
  members,
  onboardingBrowserSessions,
  onboardingDiscoveredLeagues,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  createEspnDiscoveryProvider,
  type EspnFetch,
  type EspnProvider,
} from "@/providers/espn/client";
import fanApiFixture from "../../test/fixtures/espn/fan-api-95050.json";
import leagueFixture from "../../test/fixtures/espn/league-95050-2026.json";
import { MockBrowserSession } from "./browser-session";
import { createCredentialCipher } from "./credential-crypto";
import {
  completeEspnBrowserConnect,
  connectEspnManual,
  type EspnOnboardingDependencies,
  importEspnDiscoveredLeague,
  listEspnDiscoveredLeagues,
  startEspnBrowserConnect,
} from "./espn-service";
import { reviewQuarantinedIntegrityCheck } from "./provider-service";

const marker = `onboardingtest-${randomUUID()}`;
const masterKey = "test-onboarding-master-key-minimum-32"; // ubs:ignore — fake fixture value
const fixtureSwid = "{00000000-0000-4000-8000-000000000001}";
const fixtureEspnS2 = "fixture-session-value"; // ubs:ignore — fake ESPN cookie value for onboarding tests

let handle: DbHandle;
const providerLeagueIds = new Set<string>();

type MutableFanFixture = typeof fanApiFixture;
type MutableLeagueFixture = Omit<typeof leagueFixture, "id"> & {
  id: number;
};

function numericProviderLeagueId(): string {
  const value = Number.parseInt(
    randomUUID().replaceAll("-", "").slice(0, 8),
    16,
  );
  return String(100_000 + (value % 900_000));
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function providerFor(providerLeagueId: string): EspnProvider {
  providerLeagueIds.add(providerLeagueId);
  const fan = structuredClone(fanApiFixture) as MutableFanFixture;
  const entry = fan.preferences[0].metaData.entry;
  entry.groups[0].groupId = Number(providerLeagueId);
  entry.groups[0].groupName = `${marker} league ${providerLeagueId}`;

  const league = structuredClone(leagueFixture) as MutableLeagueFixture;
  league.id = Number(providerLeagueId);
  league.settings.name = `${marker} league ${providerLeagueId}`;

  const fetch: EspnFetch = async (input) => {
    const url = new URL(input.toString());
    if (url.hostname === "fan.api.espn.com") {
      return jsonResponse(fan);
    }
    if (url.hostname === "lm-api-reads.fantasy.espn.com") {
      return jsonResponse(league);
    }
    return jsonResponse({}, { status: 404 });
  };

  return createEspnDiscoveryProvider({ fetch, retryDelayMs: 0 });
}

function authExpiredProvider(): EspnProvider {
  const fetch: EspnFetch = async () => jsonResponse({}, { status: 401 });
  return createEspnDiscoveryProvider({ fetch, retryDelayMs: 0 });
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

function deps(provider: EspnProvider): EspnOnboardingDependencies {
  return {
    browserSession: new MockBrowserSession(),
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

describe("ESPN onboarding service", () => {
  it("completes the mocked browser flow without returning or storing plaintext credentials", async () => {
    const providerLeagueId = numericProviderLeagueId();
    const user = await seedUser("browser");
    const testDeps = deps(providerFor(providerLeagueId));

    const started = await startEspnBrowserConnect(testDeps, user.id);
    expect(started.ok).toBe(true);
    if (!started.ok) throw started.error;
    expect(started.value.liveViewUrl).toContain(started.value.sessionId);

    const connected = await completeEspnBrowserConnect(testDeps, {
      sessionId: started.value.sessionId,
      userId: user.id,
    });

    expect(connected.ok).toBe(true);
    if (!connected.ok) throw connected.error;
    expect(JSON.stringify(connected.value)).not.toContain(fixtureEspnS2);
    expect(JSON.stringify(connected.value)).not.toContain(fixtureSwid);
    expect(connected.value.discoveredLeagues).toEqual([
      {
        provider: "espn",
        providerId: providerLeagueId,
        providerTeamId: "9",
        season: 2026,
        sport: "ffl",
        name: `${marker} league ${providerLeagueId}`,
        size: 12,
        teamName: "Fixture Team",
      },
    ]);

    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, connected.value.credentialId));
    if (!credential) throw new Error("credential was not persisted");
    expect(credential.encryptedPayload).not.toContain(fixtureEspnS2);
    expect(credential.encryptedPayload).not.toContain(fixtureSwid);
    expect(
      testDeps.cipher.decryptJson(credential.encryptedPayload),
    ).toMatchObject({
      espn_s2: fixtureEspnS2,
      swid: fixtureSwid,
    });

    const [session] = await handle.db
      .select()
      .from(onboardingBrowserSessions)
      .where(eq(onboardingBrowserSessions.id, started.value.sessionId));
    if (!session) throw new Error("browser session was not persisted");
    expect(session).toMatchObject({
      credentialId: credential.id,
      status: "connected",
    });

    const [discovered] = await handle.db
      .select()
      .from(onboardingDiscoveredLeagues)
      .where(
        eq(onboardingDiscoveredLeagues.providerLeagueId, providerLeagueId),
      );
    if (!discovered) throw new Error("discovered league was not persisted");
    expect(discovered).toMatchObject({
      credentialId: credential.id,
      userId: user.id,
    });
  });

  it("does not persist a credential after invalid manual cookies", async () => {
    const user = await seedUser("manual-invalid");
    const result = await connectEspnManual(deps(authExpiredProvider()), {
      credentials: {
        espn_s2: fixtureEspnS2,
        swid: fixtureSwid,
      },
      userId: user.id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected invalid manual connect to fail");
    expect(result.error.code).toBe("PROVIDER_AUTH_EXPIRED");

    const rows = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it("starts a discovered league in shadow state without granting membership", async () => {
    const providerLeagueId = numericProviderLeagueId();
    const user = await seedUser("import");
    const provider = providerFor(providerLeagueId);
    const requestedImports: unknown[] = [];
    const requestedLiveIngest: unknown[] = [];
    const testDeps: EspnOnboardingDependencies = {
      ...deps(provider),
      requestHistoricalImport: async (data) => {
        requestedImports.push(data);
      },
      requestLeagueConnected: async (data) => {
        requestedLiveIngest.push(data);
      },
    };

    const connected = await connectEspnManual(testDeps, {
      credentials: {
        espn_s2: fixtureEspnS2,
        swid: fixtureSwid,
      },
      userId: user.id,
    });
    expect(connected.ok).toBe(true);
    if (!connected.ok) throw connected.error;

    const listedBeforeImport = await listEspnDiscoveredLeagues(testDeps, {
      userId: user.id,
    });
    expect(listedBeforeImport.ok).toBe(true);
    if (!listedBeforeImport.ok) throw listedBeforeImport.error;
    expect(listedBeforeImport.value).toHaveLength(1);
    expect(listedBeforeImport.value[0]).toMatchObject({
      imported: false,
      isRecommendedImport: true,
      name: `${marker} league ${providerLeagueId}`,
      provider: "espn",
      providerId: providerLeagueId,
      season: 2026,
      sport: "ffl",
    });
    expect(listedBeforeImport.value[0]?.lastDiscoveredAt).toBeInstanceOf(Date);

    const imported = await importEspnDiscoveredLeague(testDeps, {
      providerLeagueId,
      season: 2026,
      userId: user.id,
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) throw imported.error;
    expect(requestedImports).toEqual([
      {
        credentialId: imported.value.credentialId,
        leagueId: imported.value.leagueId,
        maxSeasons: 25,
        name: `${marker} league ${providerLeagueId}`,
        provider: "espn",
        providerLeagueId,
        season: 2026,
        shadowAttempt: 1,
        size: 12,
        sport: "ffl",
        teamName: "Fixture Team",
      },
    ]);
    expect(requestedLiveIngest).toEqual([]);
    expect(imported.value.onboardingState).toBe("shadow_running");
    expect(imported.value.sync.teams).toEqual({
      total: 12,
      changed: 12,
      unchanged: 0,
    });
    expect(imported.value.sync.members).toEqual({
      total: 16,
      changed: 16,
      unchanged: 0,
    });
    expect(imported.value.sync.matchups).toEqual({
      total: 84,
      changed: 84,
      unchanged: 0,
    });
    expect(imported.value.leaguemateInvites).toMatchObject({
      importedMembers: 16,
      inviteTargets: 15,
    });
    expect(imported.value.leaguemateInvites.targets[0]).toMatchObject({
      displayName: "Fixture Manager 01",
      suggestedChannel: "share",
    });

    const [membership] = await handle.db
      .select()
      .from(members)
      .where(eq(members.userId, user.id));
    expect(membership).toBeUndefined();

    const matchupRows = await handle.db
      .select()
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.leagueId, imported.value.leagueId));
    expect(matchupRows).toHaveLength(84);

    const listedAfterImport = await listEspnDiscoveredLeagues(testDeps, {
      userId: user.id,
    });
    expect(listedAfterImport.ok).toBe(true);
    if (!listedAfterImport.ok) throw listedAfterImport.error;
    expect(listedAfterImport.value[0]).toMatchObject({
      connectionState: "connected",
      imported: false,
      isRecommendedImport: false,
      leagueId: imported.value.leagueId,
      onboardingState: "shadow_running",
    });

    await handle.db
      .update(onboardingDiscoveredLeagues)
      .set({
        importState: "quarantined",
        integrityFailureCount: 1,
        quarantinedAt: new Date("2026-07-13T12:00:00.000Z"),
      })
      .where(eq(onboardingDiscoveredLeagues.userId, user.id));
    const checkId = await withLeagueContext(
      handle.db,
      imported.value.leagueId,
      async (tx) => {
        await tx
          .delete(dataIntegrityChecks)
          .where(eq(dataIntegrityChecks.leagueId, imported.value.leagueId));
        const [check] = await tx
          .insert(dataIntegrityChecks)
          .values({
            checkKey: "schedule_coverage",
            detail: { issues: [{ reason: "fixture_gap" }] },
            leagueId: imported.value.leagueId,
            season: 2026,
            status: "fail",
          })
          .returning({ id: dataIntegrityChecks.id });
        if (!check) throw new Error("integrity check was not created");
        return check.id;
      },
    );
    const reviewed = await reviewQuarantinedIntegrityCheck(testDeps, {
      checkId,
      leagueId: imported.value.leagueId,
      userId: user.id,
    });
    expect(reviewed).toMatchObject({
      ok: true,
      value: {
        becameLive: true,
        remainingFailures: 0,
        state: "live",
      },
    });
    expect(requestedLiveIngest).toEqual([
      { leagueId: imported.value.leagueId },
    ]);
    const [reviewedMembership] = await handle.db
      .select()
      .from(members)
      .where(eq(members.userId, user.id));
    expect(reviewedMembership).toMatchObject({
      organizationId: imported.value.leagueId,
      role: "commissioner",
    });
  });

  it("surfaces stored invalid credentials with an ESPN reconnect action", async () => {
    const providerLeagueId = numericProviderLeagueId();
    const user = await seedUser("stored-invalid");
    const testDeps = deps(providerFor(providerLeagueId));

    const connected = await connectEspnManual(testDeps, {
      credentials: {
        espn_s2: fixtureEspnS2,
        swid: fixtureSwid,
      },
      userId: user.id,
    });
    expect(connected.ok).toBe(true);
    if (!connected.ok) throw connected.error;

    await handle.db
      .update(providerCredentials)
      .set({
        invalidAt: new Date("2026-06-12T00:00:00.000Z"),
        status: "invalid",
      })
      .where(eq(providerCredentials.id, connected.value.credentialId));

    const listed = await listEspnDiscoveredLeagues(testDeps, {
      userId: user.id,
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw listed.error;
    expect(listed.value[0]).toMatchObject({
      credentialId: connected.value.credentialId,
      connectionInvalidAt: new Date("2026-06-12T00:00:00.000Z"),
      connectionState: "invalid",
      imported: false,
      isRecommendedImport: false,
      reconnect: {
        href: "/onboarding/espn",
        label: "Reconnect ESPN",
        provider: "espn",
      },
    });

    const imported = await importEspnDiscoveredLeague(testDeps, {
      providerLeagueId,
      season: 2026,
      userId: user.id,
    });
    expect(imported.ok).toBe(false);
    if (imported.ok) throw new Error("expected stored invalid import to fail");
    expect(imported.error).toMatchObject({
      code: "ONBOARDING_CREDENTIAL_INVALID",
      details: {
        reconnect: {
          href: "/onboarding/espn",
          label: "Reconnect ESPN",
        },
      },
      status: 409,
    });
  });

  it("marks credentials invalid when an import finds expired provider auth", async () => {
    const providerLeagueId = numericProviderLeagueId();
    const user = await seedUser("import-expired");
    const connected = await connectEspnManual(
      deps(providerFor(providerLeagueId)),
      {
        credentials: {
          espn_s2: fixtureEspnS2,
          swid: fixtureSwid,
        },
        userId: user.id,
      },
    );
    expect(connected.ok).toBe(true);
    if (!connected.ok) throw connected.error;

    const imported = await importEspnDiscoveredLeague(
      deps(authExpiredProvider()),
      {
        providerLeagueId,
        season: 2026,
        userId: user.id,
      },
    );
    expect(imported.ok).toBe(false);
    if (imported.ok) throw new Error("expected expired import to fail");
    expect(imported.error).toMatchObject({
      code: "PROVIDER_AUTH_EXPIRED",
      details: {
        reconnect: {
          href: "/onboarding/espn",
          label: "Reconnect ESPN",
        },
      },
      status: 401,
    });

    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, connected.value.credentialId));
    expect(credential).toMatchObject({
      status: "invalid",
    });
  });
});
