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
  dataCoverage,
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
import type { PollPolicy } from "@/ingestion/poll-policy";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";
import {
  AuthExpiredError,
  type FantasyProviderCapabilities,
  type FantasyProviderSession,
  ProviderBlockedError,
  type ProviderDataClass,
} from "@/providers";
import { JOB_EVENTS } from "./events";
import {
  createIngestionTickFunction,
  createLeagueIngestFunction,
  type IngestionGameStateProvider,
  runIngestionTick,
  runLeagueIngest,
} from "./functions/ingestion-live";
import { functions, ingestionTick, leagueIngest } from "./index";

const marker = `liveingesttest-${randomUUID()}`;
const masterKey = "test-live-ingest-master-key-minimum-32"; // ubs:ignore - fake fixture value
const fixtureSwid = "{00000000-0000-4000-8000-000000000002}";
const fixtureEspnS2 = "fixture-live-ingest-session"; // ubs:ignore - fake ESPN cookie value for job tests
const primaryLiveDataClasses = [
  "league",
  "teams",
  "members",
  "rosters",
  "matchups",
] as const satisfies readonly ProviderDataClass[];

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

async function seedDataCoverage(
  seed: SeededLiveLeague,
  observedAtByClass: Partial<Record<ProviderDataClass, Date>>,
) {
  await handle.db.insert(dataCoverage).values(
    primaryLiveDataClasses.map((dataClass) => ({
      capability: "full" as const,
      dataClass,
      details: { test: marker },
      itemCount: 1,
      leagueId: seed.leagueId,
      observedAt:
        observedAtByClass[dataClass] ?? new Date("2026-09-13T18:00:00Z"),
      provider: seed.provider,
      providerLeagueId: seed.providerLeagueId,
      season: 2026,
      status: "complete" as const,
    })),
  );
}

function successfulSyncResult(seed: SeededLiveLeague): CurrentLeagueSyncResult {
  return {
    changedFinalMatchups: [],
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
      pausedCount: 1,
      plannedCount: 2,
      sentCount: 0,
      skippedDuplicateCredentials: 1,
    });
    expect(result.paused).toEqual([
      expect.objectContaining({
        connectionState: "invalid",
        credentialId: invalid.credentialId,
        leagueId: invalid.leagueId,
        provider: "espn",
        reconnect: expect.objectContaining({
          href: "/onboarding/espn",
          label: "Reconnect ESPN",
          provider: "espn",
        }),
      }),
    ]);
    expect(result.planned.map((event) => event.name)).toEqual([
      JOB_EVENTS.leagueIngest,
      JOB_EVENTS.leagueIngest,
    ]);
    expect(result.planned.map((event) => event.data.leagueId).sort()).toEqual(
      [espn.leagueId, sleeper.leagueId].sort(),
    );
    expect(result.planned.map((event) => event.data.leagueId)).not.toContain(
      invalid.leagueId,
    );
  });

  it("pauses auth-invalid targets with a reconnect action and resumes after reconnect", async () => {
    const seeded = await seedLiveLeague("tick-paused", { status: "invalid" });

    const paused = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
      },
      deps: { db: handle.db },
    });

    expect(paused).toMatchObject({
      connectedRows: 0,
      ok: true,
      pausedCount: 1,
      plannedCount: 0,
    });
    expect(paused.paused).toEqual([
      expect.objectContaining({
        connectionInvalidAt: "2026-06-12T00:00:00.000Z",
        connectionState: "invalid",
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        reconnect: expect.objectContaining({
          href: "/onboarding/espn",
          label: "Reconnect ESPN",
          provider: "espn",
        }),
      }),
    ]);

    await handle.db
      .update(providerCredentials)
      .set({
        invalidAt: null,
        status: "connected",
      })
      .where(eq(providerCredentials.id, seeded.credentialId));

    const resumed = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
      },
      deps: { db: handle.db },
    });

    expect(resumed).toMatchObject({
      connectedRows: 1,
      ok: true,
      pausedCount: 0,
      plannedCount: 1,
    });
    expect(resumed.paused).toEqual([]);
    expect(resumed.planned[0]?.data).toMatchObject({
      credentialId: seeded.credentialId,
      leagueId: seeded.leagueId,
      provider: "espn",
    });
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

  it("uses injected live game state to poll matchups faster than off-hours", async () => {
    const seeded = await seedLiveLeague("cadence-live");
    const now = new Date("2026-09-13T18:02:00Z");
    await seedDataCoverage(seeded, {
      matchups: new Date("2026-09-13T18:00:00Z"),
      rosters: new Date("2026-09-13T18:00:00Z"),
    });
    const calls: Parameters<IngestionGameStateProvider["stateForLeague"]>[0][] =
      [];
    const liveWindowProvider: IngestionGameStateProvider = {
      stateForLeague(input) {
        calls.push(input);
        return "live_window";
      },
    };
    const offHoursProvider: IngestionGameStateProvider = {
      stateForLeague: () => "in_season_off_hours",
    };

    const live = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
        now: now.toISOString(),
      },
      deps: {
        db: handle.db,
        gameStateProvider: liveWindowProvider,
      },
    });
    const offHours = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
        now: now.toISOString(),
      },
      deps: {
        db: handle.db,
        gameStateProvider: offHoursProvider,
      },
    });

    expect(live).toMatchObject({
      ok: true,
      plannedCount: 1,
      skippedNotDue: 0,
    });
    expect(live.planned[0]?.data.dataClasses).toEqual(["matchups"]);
    expect(live.planned[0]?.id).toContain("matchups:live_window:");
    expect(calls[0]).toMatchObject({
      currentScoringPeriod: 1,
      leagueId: seeded.leagueId,
      provider: "espn",
      providerLeagueId: seeded.providerLeagueId,
      season: 2026,
    });
    expect(offHours).toMatchObject({
      ok: true,
      plannedCount: 0,
      skippedNotDue: 1,
    });
  });

  it("uses off-hours cadence once the hourly matchup window is due", async () => {
    const seeded = await seedLiveLeague("cadence-offhours");
    const now = new Date("2026-09-13T19:01:00Z");
    await seedDataCoverage(seeded, {
      matchups: new Date("2026-09-13T18:00:00Z"),
      rosters: new Date("2026-09-13T18:00:00Z"),
    });

    const result = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
        now: now.toISOString(),
      },
      deps: {
        db: handle.db,
        gameStateProvider: {
          stateForLeague: () => "in_season_off_hours",
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      plannedCount: 1,
    });
    expect(result.planned[0]?.data.dataClasses).toEqual([
      "rosters",
      "matchups",
    ]);
    expect(result.planned[0]?.id).toContain(
      "rosters,matchups:in_season_off_hours:",
    );
  });

  it("uses explicit poll policy config without changing scheduler code", async () => {
    const seeded = await seedLiveLeague("cadence-config");
    const now = new Date("2026-09-13T18:00:06Z");
    await seedDataCoverage(seeded, {
      matchups: new Date("2026-09-13T18:00:00Z"),
      rosters: new Date("2026-09-13T18:00:00Z"),
    });

    const defaultPolicy = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
        now: now.toISOString(),
      },
      deps: {
        db: handle.db,
        gameStateProvider: {
          stateForLeague: () => "live_window",
        },
      },
    });
    const configuredPolicy = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
        now: now.toISOString(),
      },
      deps: {
        db: handle.db,
        gameStateProvider: {
          stateForLeague: () => "live_window",
        },
        pollPolicyConfigOverride: {
          intervalsMs: {
            live_window: { matchups: 5_000 },
          },
        },
      },
    });

    expect(defaultPolicy).toMatchObject({
      ok: true,
      plannedCount: 0,
      skippedNotDue: 1,
    });
    expect(configuredPolicy).toMatchObject({
      ok: true,
      plannedCount: 1,
    });
    expect(configuredPolicy.planned[0]?.data.dataClasses).toEqual(["matchups"]);
  });

  it("lets explicit poll config beat env/global poll config", async () => {
    const seeded = await seedLiveLeague("cadence-order");
    const now = new Date("2026-09-13T18:00:06Z");
    await seedDataCoverage(seeded, {
      matchups: new Date("2026-09-13T18:00:00Z"),
    });
    const commonDeps = {
      db: handle.db,
      gameStateProvider: {
        stateForLeague: () => "live_window" as const,
      },
      globalPollPolicyConfig: {
        intervalsMs: {
          live_window: { matchups: 5_000 },
        },
      },
    };

    const globalDue = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
        now: now.toISOString(),
      },
      deps: commonDeps,
    });
    const explicitOverride = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
        now: now.toISOString(),
      },
      deps: {
        ...commonDeps,
        pollPolicyConfigOverride: {
          intervalsMs: {
            live_window: { matchups: 20_000 },
          },
        },
      },
    });

    expect(globalDue).toMatchObject({ ok: true, plannedCount: 1 });
    expect(globalDue.planned[0]?.data.dataClasses).toEqual(["matchups"]);
    expect(explicitOverride).toMatchObject({
      ok: true,
      plannedCount: 0,
      skippedNotDue: 1,
    });
  });

  it("accepts an alternate poll policy implementation", async () => {
    const seeded = await seedLiveLeague("cadence-policy");
    const now = new Date("2026-09-13T18:00:01Z");
    await seedDataCoverage(seeded, {
      matchups: new Date("2026-09-13T18:00:00Z"),
      rosters: new Date("2026-09-13T18:00:00Z"),
    });
    const policy: PollPolicy = {
      due(input) {
        return {
          due: input.dataClass === "rosters",
          intervalMs: 1_234,
          nextDueAt: input.now,
        };
      },
    };

    const result = await runIngestionTick({
      data: {
        leagueIds: [seeded.leagueId],
        now: now.toISOString(),
      },
      deps: {
        db: handle.db,
        gameStateProvider: {
          stateForLeague: () => "live_window",
        },
        pollPolicy: policy,
      },
    });

    expect(result).toMatchObject({ ok: true, plannedCount: 1 });
    expect(result.planned[0]?.data.dataClasses).toEqual(["rosters"]);
    expect(result.planned[0]?.id).toContain("rosters:live_window:");
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
    expect(response).toMatchObject({
      gameFinalEvents: [],
      sentGameFinalCount: 0,
    });
  });

  it("plans game.final events for changed finalized matchups through the worker step", async () => {
    const seeded = await seedLiveLeague("worker-game-final");
    const fixtureProvider = currentSyncProvider();
    const changedMatchupId = randomUUID();
    const sourceContentHash = "a".repeat(64);
    const fn = createLeagueIngestFunction(() => ({
      cipher,
      db: handle.db,
      providers: { espn: fixtureProvider.provider },
      syncCurrent: async () =>
        ok({
          ...successfulSyncResult(seeded),
          changedFinalMatchups: [
            {
              contentHash: sourceContentHash,
              id: changedMatchupId,
            },
          ],
        }),
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        name: `${marker} league worker-game-final`,
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        sport: "ffl",
      },
      name: JOB_EVENTS.leagueIngest,
    };

    const stepRun = await testEngine.executeStep("sync-current-league", {
      events: [event],
    });

    const expectedGameFinalEvent = {
      data: {
        gameId: changedMatchupId,
        leagueId: seeded.leagueId,
        sourceContentHash,
      },
      id: `${JOB_EVENTS.gameFinal}:${seeded.leagueId}:${changedMatchupId}:${sourceContentHash}`,
      name: JOB_EVENTS.gameFinal,
    };
    expect(stepRun.result).toMatchObject({
      gameFinalEvents: [expectedGameFinalEvent],
      ok: true,
      sentGameFinalCount: 0,
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

  it("marks credentials invalid when current sync reports auth expiry", async () => {
    const seeded = await seedLiveLeague("worker-sync-expired");
    const fixtureProvider = currentSyncProvider();

    await expect(
      runLeagueIngest({
        data: {
          credentialId: seeded.credentialId,
          leagueId: seeded.leagueId,
          name: `${marker} league worker-sync-expired`,
          provider: "espn",
          providerLeagueId: seeded.providerLeagueId,
          season: 2026,
          sport: "ffl",
        },
        deps: {
          cipher,
          db: handle.db,
          providers: { espn: fixtureProvider.provider },
          syncCurrent: async () => err(new AuthExpiredError("espn")),
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
