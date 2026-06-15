// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { err, ok } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import {
  leagues,
  members,
  onboardingDiscoveredLeagues,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type {
  CurrentLeagueSyncInput,
  CurrentLeagueSyncResult,
} from "@/ingestion";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";
import {
  AuthExpiredError,
  type FantasyProviderCapabilities,
  type FantasyProviderSession,
  ProviderBlockedError,
} from "@/providers";
import { JOB_EVENTS } from "./events";
import {
  createIngestionTickFunction,
  createLeagueIngestFunction,
  runIngestionTick,
  runLeagueIngest,
} from "./functions/ingestion-live";
import { functions, ingestionTick, leagueIngest } from "./index";

const marker = `liveingesttest-${randomUUID()}`;
const masterKey = "test-live-ingest-master-key-minimum-32"; // ubs:ignore - fake fixture value
const fixtureSwid = "{00000000-0000-4000-8000-000000000002}";
const fixtureEspnS2 = "fixture-live-ingest-session"; // ubs:ignore - fake ESPN cookie value for job tests

let handle: DbHandle;
let cipher: CredentialCipher;

interface SeededLiveLeague {
  credentialId: string;
  leagueId: string;
  provider: "espn" | "sleeper" | "yahoo";
  providerLeagueId: string;
  userId: string;
}

const currentSyncCapabilities: FantasyProviderCapabilities = {
  authKind: "cookie",
  dataClasses: {
    divisions: "none",
    final_standings: "partial",
    history: "none",
    keeper_dynasty: "none",
    league: "full",
    matchups: "full",
    members: "full",
    rosters: "partial",
    scoring_detail: "partial",
    teams: "full",
    transactions: "none",
  },
  requiresOAuth: false,
  supportsHistory: false,
  supportsRosters: true,
  supportsTransactions: false,
};

const emptySyncStats = {
  changed: 0,
  total: 0,
  unchanged: 0,
};

function connectionFlowFor(provider: SeededLiveLeague["provider"]) {
  switch (provider) {
    case "espn":
      return "manual";
    case "sleeper":
      return "public";
    case "yahoo":
      return "manual";
  }
}

async function addUser(tag: string) {
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

async function addCredential({
  provider,
  status = "connected",
  tag,
  userId,
}: {
  provider: SeededLiveLeague["provider"];
  status?: "connected" | "invalid";
  tag: string;
  userId: string;
}) {
  const credentialPayload =
    provider === "sleeper"
      ? { seasons: [2026], usernameOrUserId: `fixture-${tag}` }
      : provider === "yahoo"
        ? {
            accessToken: `fixture-yahoo-access-${tag}`, // ubs:ignore - fake OAuth token for job tests
            expiresAt: "2030-01-01T00:00:00.000Z",
            tokenType: "bearer",
          }
        : {
            espn_s2: fixtureEspnS2,
            swid: fixtureSwid,
          };

  const [credential] = await handle.db
    .insert(providerCredentials)
    .values({
      connectionFlow: connectionFlowFor(provider),
      encryptedPayload: cipher.encryptJson(credentialPayload),
      invalidAt: status === "invalid" ? new Date("2026-06-12T00:00:00Z") : null,
      lastValidatedAt: new Date("2026-06-11T00:00:00.000Z"),
      provider,
      status,
      subjectProviderId: `${provider}-${tag}`,
      userId,
    })
    .returning();
  if (!credential) throw new Error("credential was not created");
  return credential;
}

async function addDiscoveredLeague({
  credentialId,
  name,
  provider,
  providerLeagueId,
  userId,
}: {
  credentialId: string;
  name: string;
  provider: SeededLiveLeague["provider"];
  providerLeagueId: string;
  userId: string;
}) {
  await handle.db.insert(onboardingDiscoveredLeagues).values({
    credentialId,
    lastDiscoveredAt: new Date("2026-06-11T00:00:00.000Z"),
    name,
    provider,
    providerLeagueId,
    season: 2026,
    size: 2,
    sport: "ffl",
    userId,
  });
}

async function seedLiveLeague(
  tag: string,
  {
    provider = "espn",
    status = "connected",
  }: {
    provider?: SeededLiveLeague["provider"];
    status?: "connected" | "invalid";
  } = {},
): Promise<SeededLiveLeague> {
  const user = await addUser(tag);
  const providerLeagueId = `${marker}-${tag}`;
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: `${marker} league ${tag}`,
      provider,
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 2,
      sport: "ffl",
      status: "in_season",
    })
    .returning();
  if (!league) throw new Error("league was not created");

  await handle.db.insert(members).values({
    organizationId: league.id,
    role: "commissioner",
    userId: user.id,
  });
  const credential = await addCredential({
    provider,
    status,
    tag,
    userId: user.id,
  });
  await addDiscoveredLeague({
    credentialId: credential.id,
    name: league.name,
    provider,
    providerLeagueId,
    userId: user.id,
  });

  return {
    credentialId: credential.id,
    leagueId: league.id,
    provider,
    providerLeagueId,
    userId: user.id,
  };
}

function successfulSyncResult(seed: SeededLiveLeague): CurrentLeagueSyncResult {
  return {
    league: {
      changed: 0,
      id: seed.leagueId,
      provider: seed.provider,
      providerLeagueId: seed.providerLeagueId,
      season: 2026,
      unchanged: 1,
    },
    matchups: emptySyncStats,
    members: emptySyncStats,
    rosters: emptySyncStats,
    teams: emptySyncStats,
  };
}

function currentSyncProvider({
  authExpired = false,
  blocked = false,
}: {
  authExpired?: boolean;
  blocked?: boolean;
} = {}) {
  const credentials: unknown[] = [];
  const session: FantasyProviderSession = {
    authKind: "cookie",
    provider: "espn",
    subjectProviderId: "espn-live-ingest-user",
  };

  return {
    credentials,
    provider: {
      authenticate: async (input: unknown) => {
        credentials.push(input);
        if (authExpired) {
          return err(new AuthExpiredError("espn"));
        }
        if (blocked) {
          return err(new ProviderBlockedError("espn"));
        }
        return ok(session);
      },
      capabilities: currentSyncCapabilities,
      getLeague: async () => err(new ProviderBlockedError("espn")),
      getMatchups: async () => err(new ProviderBlockedError("espn")),
      getMembers: async () => err(new ProviderBlockedError("espn")),
      getTeams: async () => err(new ProviderBlockedError("espn")),
    },
  };
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  cipher = createCredentialCipher(masterKey);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable - start the local stack with `pnpm db:up` before running tests.",
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

describe("live ingestion jobs", () => {
  it("plans one league.ingest event per connected league and deduplicates credentials", async () => {
    const espn = await seedLiveLeague("fanout-espn");
    const sleeper = await seedLiveLeague("fanout-sleeper", {
      provider: "sleeper",
    });
    const invalid = await seedLiveLeague("fanout-invalid", {
      status: "invalid",
    });
    const duplicateUser = await addUser("fanout-duplicate");
    await handle.db.insert(members).values({
      organizationId: espn.leagueId,
      role: "member",
      userId: duplicateUser.id,
    });
    const duplicateCredential = await addCredential({
      provider: "espn",
      tag: "fanout-duplicate",
      userId: duplicateUser.id,
    });
    await addDiscoveredLeague({
      credentialId: duplicateCredential.id,
      name: `${marker} league fanout-espn`,
      provider: "espn",
      providerLeagueId: espn.providerLeagueId,
      userId: duplicateUser.id,
    });

    const result = await runIngestionTick({
      data: {
        leagueIds: [espn.leagueId, sleeper.leagueId, invalid.leagueId],
      },
      deps: { db: handle.db },
    });

    expect(result).toMatchObject({
      connectedRows: 3,
      eventName: JOB_EVENTS.ingestionTick,
      ok: true,
      plannedCount: 2,
      sentCount: 0,
      skippedDuplicateCredentials: 1,
    });
    expect(result.planned.map((event) => event.name)).toEqual([
      JOB_EVENTS.leagueIngest,
      JOB_EVENTS.leagueIngest,
    ]);
    expect(result.planned.map((event) => event.data.leagueId).sort()).toEqual(
      [espn.leagueId, sleeper.leagueId].sort(),
    );
    expect(
      result.planned.find((event) => event.data.leagueId === invalid.leagueId),
    ).toBeUndefined();
  });

  it("plans league.ingest events through the Inngest step API", async () => {
    const seeded = await seedLiveLeague("job-fanout");
    const fn = createIngestionTickFunction(() => ({ db: handle.db }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        leagueIds: [seeded.leagueId],
      },
      name: JOB_EVENTS.ingestionTick,
    };

    const stepRun = await testEngine.executeStep("plan-league-ingest-events", {
      events: [event],
    });
    const plan = stepRun.result as Awaited<ReturnType<typeof runIngestionTick>>;

    expect(plan).toMatchObject({
      ok: true,
      plannedCount: 1,
      sentCount: 0,
    });
    expect(plan.planned).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          leagueId: seeded.leagueId,
          provider: seeded.provider,
          providerLeagueId: seeded.providerLeagueId,
        }),
        name: JOB_EVENTS.leagueIngest,
      }),
    ]);
  });

  it("does not send fan-out events when no connected league is due", async () => {
    const fn = createIngestionTickFunction(() => ({ db: handle.db }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        leagueIds: [],
      },
      name: JOB_EVENTS.ingestionTick,
    };

    const { ctx, result } = await testEngine.execute({ events: [event] });

    expect(result).toMatchObject({
      ok: true,
      plannedCount: 0,
      sentCount: 0,
    });
    expect(ctx.step.sendEvent).not.toHaveBeenCalled();
  });

  it("loads credentials and runs current sync for one league", async () => {
    const seeded = await seedLiveLeague("worker-success");
    const fixtureProvider = currentSyncProvider();
    const syncCalls: CurrentLeagueSyncInput<FantasyProviderSession>[] = [];
    const response = await runLeagueIngest({
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        name: `${marker} league worker-success`,
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        size: 2,
        sport: "ffl",
      },
      deps: {
        cipher,
        db: handle.db,
        providers: { espn: fixtureProvider.provider },
        syncCurrent: async (input) => {
          syncCalls.push(input);
          return ok(successfulSyncResult(seeded));
        },
      },
    });

    expect(response).toMatchObject({
      eventName: JOB_EVENTS.leagueIngest,
      ok: true,
      league: {
        id: seeded.leagueId,
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
      },
    });
    expect(fixtureProvider.credentials).toEqual([
      {
        espn_s2: fixtureEspnS2,
        swid: fixtureSwid,
      },
    ]);
    expect(syncCalls).toHaveLength(1);
    expect(syncCalls[0]?.ref).toMatchObject({
      provider: "espn",
      providerId: seeded.providerLeagueId,
      season: 2026,
    });
  });

  it("marks auth-expired credentials invalid and stops retries", async () => {
    const seeded = await seedLiveLeague("worker-expired");
    const fixtureProvider = currentSyncProvider({ authExpired: true });

    await expect(
      runLeagueIngest({
        data: {
          credentialId: seeded.credentialId,
          leagueId: seeded.leagueId,
          name: `${marker} league worker-expired`,
          provider: "espn",
          providerLeagueId: seeded.providerLeagueId,
          season: 2026,
          sport: "ffl",
        },
        deps: {
          cipher,
          db: handle.db,
          providers: { espn: fixtureProvider.provider },
          syncCurrent: async () => ok(successfulSyncResult(seeded)),
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);

    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, seeded.credentialId))
      .limit(1);
    expect(credential).toMatchObject({ status: "invalid" });
  });

  it("keeps credentials connected for retryable provider blocks", async () => {
    const seeded = await seedLiveLeague("worker-blocked");
    const fixtureProvider = currentSyncProvider({ blocked: true });

    await expect(
      runLeagueIngest({
        data: {
          credentialId: seeded.credentialId,
          leagueId: seeded.leagueId,
          name: `${marker} league worker-blocked`,
          provider: "espn",
          providerLeagueId: seeded.providerLeagueId,
          season: 2026,
          sport: "ffl",
        },
        deps: {
          cipher,
          db: handle.db,
          providers: { espn: fixtureProvider.provider },
          syncCurrent: async () => ok(successfulSyncResult(seeded)),
        },
      }),
    ).rejects.toBeInstanceOf(ProviderBlockedError);

    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, seeded.credentialId))
      .limit(1);
    expect(credential).toMatchObject({ status: "connected" });
  });

  it("registers both live ingestion functions", () => {
    const fn = createLeagueIngestFunction(() => ({
      cipher,
      db: handle.db,
      providers: {},
    }));
    expect(fn).toBeDefined();
    expect(functions).toContain(ingestionTick);
    expect(functions).toContain(leagueIngest);
  });
});
