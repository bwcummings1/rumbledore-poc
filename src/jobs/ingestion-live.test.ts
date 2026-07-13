// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { and, eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { err, ok } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import {
  dataCapabilityObservations,
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
  type ProviderLeagueRef,
} from "@/providers";
import type { YahooCredentials } from "@/providers/yahoo/client";
import espnWeekWindowFixture from "@/sports/__fixtures__/espn-nfl-scoreboard-2025-week2-window.json";
import {
  EspnScoreboardNflScheduleSource,
  type NflScheduleFetch,
  ScheduleBackedNflCalendar,
} from "@/sports/nfl-calendar";
import { JOB_EVENTS } from "./events";
import {
  createIngestionTickFunction,
  createLeagueIngestFunction,
  createNflCalendarGameStateProvider,
  createSeasonRolloverCheckFunction,
  type IngestionGameStateProvider,
  runIngestionTick,
  runLeagueIngest,
  runSeasonRolloverCheck,
} from "./functions/ingestion-live";
import {
  functions,
  ingestionTick,
  leagueIngest,
  seasonRolloverCheck,
} from "./index";

const marker = `liveingesttest-${randomUUID()}`;
const masterKey = "test-live-ingest-master-key-minimum-32"; // ubs:ignore - fake fixture value
const fixtureSwid = "{00000000-0000-4000-8000-000000000002}";
const fixtureEspnS2 = "fixture-live-ingest-session"; // ubs:ignore - fake ESPN cookie value for job tests
const fixtureYahooAccessToken = "fixture-yahoo-live-access-token"; // ubs:ignore - fake OAuth token for job tests
const fixtureYahooRefreshToken = "fixture-yahoo-live-refresh-token"; // ubs:ignore - fake OAuth token for job tests
const refreshedYahooAccessToken = "fixture-yahoo-live-access-token-refreshed"; // ubs:ignore - fake OAuth token for job tests
const refreshedYahooRefreshToken = "fixture-yahoo-live-refresh-token-refreshed"; // ubs:ignore - fake OAuth token for job tests
const primaryLiveDataClasses = [
  "league",
  "teams",
  "members",
  "rosters",
  "matchups",
  "transactions",
] as const satisfies readonly ProviderDataClass[];

let handle: DbHandle;

function jsonScheduleFetch(body: unknown): NflScheduleFetch {
  return async () =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status: 200,
      statusText: "OK",
    });
}
let cipher: CredentialCipher;

interface SeededLiveLeague {
  credentialId: string;
  leagueId: string;
  provider: "espn" | "sleeper" | "yahoo";
  providerLeagueId: string;
  season: number;
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
  const credentialPayload = (() => {
    switch (provider) {
      case "sleeper":
        return { seasons: [2026], usernameOrUserId: `fixture-${tag}` };
      case "yahoo":
        return {
          accessToken: `fixture-yahoo-access-${tag}`, // ubs:ignore - fake OAuth token for job tests
          expiresAt: "2030-01-01T00:00:00.000Z",
          tokenType: "bearer",
        };
      case "espn":
        return {
          espn_s2: fixtureEspnS2,
          swid: fixtureSwid,
        };
    }
  })();

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
  season = 2026,
  userId,
}: {
  credentialId: string;
  name: string;
  provider: SeededLiveLeague["provider"];
  providerLeagueId: string;
  season?: number;
  userId: string;
}) {
  await handle.db.insert(onboardingDiscoveredLeagues).values({
    credentialId,
    lastDiscoveredAt: new Date("2026-06-11T00:00:00.000Z"),
    name,
    provider,
    providerLeagueId,
    season,
    size: 2,
    sport: "ffl",
    userId,
  });
}

async function seedLiveLeague(
  tag: string,
  {
    provider = "espn",
    providerLeagueId: explicitProviderLeagueId,
    leagueStatus = "in_season",
    season = 2026,
    status = "connected",
  }: {
    provider?: SeededLiveLeague["provider"];
    providerLeagueId?: string;
    leagueStatus?: "preseason" | "in_season" | "complete" | "unknown";
    season?: number;
    status?: "connected" | "invalid";
  } = {},
): Promise<SeededLiveLeague> {
  const user = await addUser(tag);
  const providerLeagueId = explicitProviderLeagueId ?? `${marker}-${tag}`;
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: `${marker} league ${tag}`,
      provider,
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season,
      size: 2,
      sport: "ffl",
      status: leagueStatus,
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
    season,
    userId: user.id,
  });

  return {
    credentialId: credential.id,
    leagueId: league.id,
    provider,
    providerLeagueId,
    season,
    userId: user.id,
  };
}

async function seedDataCoverage(
  seed: SeededLiveLeague,
  observedAtByClass: Partial<Record<ProviderDataClass, Date>>,
) {
  await handle.db.insert(dataCapabilityObservations).values(
    primaryLiveDataClasses.map((dataClass) => ({
      availability: "full" as const,
      dataClass,
      details: { test: marker },
      leagueId: seed.leagueId,
      probedAt:
        observedAtByClass[dataClass] ?? new Date("2026-09-13T18:00:00Z"),
      provider: seed.provider,
      providerLeagueId: seed.providerLeagueId,
      providerSupport: "full" as const,
      providerVerdict: "returned_data" as const,
      rowCount: 1,
      season: 2026,
      status: "complete" as const,
    })),
  );
}

async function dataCoverageRowsFor(leagueId: string) {
  return handle.db
    .select({
      dataClass: dataCapabilityObservations.dataClass,
      details: dataCapabilityObservations.details,
      errorCode: dataCapabilityObservations.errorCode,
      itemCount: dataCapabilityObservations.rowCount,
      providerVerdict: dataCapabilityObservations.providerVerdict,
      status: dataCapabilityObservations.status,
    })
    .from(dataCapabilityObservations)
    .where(eq(dataCapabilityObservations.leagueId, leagueId));
}

function successfulSyncResult(seed: SeededLiveLeague): CurrentLeagueSyncResult {
  return {
    changedFinalMatchups: [],
    changedTransactions: [],
    contentCorrectionsNeeded: [],
    league: {
      changed: 0,
      id: seed.leagueId,
      provider: seed.provider,
      providerLeagueId: seed.providerLeagueId,
      season: seed.season,
      unchanged: 1,
    },
    matchups: emptySyncStats,
    members: emptySyncStats,
    recordBrokenHooks: [],
    recordLoreClaims: [],
    rosters: emptySyncStats,
    teams: emptySyncStats,
    transactions: emptySyncStats,
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
      getTransactions: async () => err(new ProviderBlockedError("espn")),
    },
  };
}

function authKindFor(provider: SeededLiveLeague["provider"]) {
  switch (provider) {
    case "espn":
      return "cookie" as const;
    case "sleeper":
      return "none" as const;
    case "yahoo":
      return "oauth2" as const;
  }
}

function rolloverDiscoveryProvider({
  authExpired = false,
  blockedDiscovery = false,
  provider = "espn",
  refs,
}: {
  authExpired?: boolean;
  blockedDiscovery?: boolean;
  provider?: SeededLiveLeague["provider"];
  refs: ProviderLeagueRef[];
}) {
  const credentials: unknown[] = [];
  const session: FantasyProviderSession = {
    authKind: authKindFor(provider),
    provider,
    subjectProviderId: `${provider}-rollover-user`,
  };

  return {
    credentials,
    provider: {
      authenticate: async (input: unknown) => {
        credentials.push(input);
        if (authExpired) {
          return err(new AuthExpiredError(provider));
        }
        return ok(session);
      },
      discoverLeagues: async () => {
        if (blockedDiscovery) {
          return err(new ProviderBlockedError(provider));
        }
        return ok(refs);
      },
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

  it("fans out multiple imported leagues authorized by the same credential", async () => {
    const first = await seedLiveLeague("fanout-shared-a");
    const secondProviderLeagueId = `${marker}-fanout-shared-b`;
    const [secondLeague] = await handle.db
      .insert(leagues)
      .values({
        currentScoringPeriod: 1,
        name: `${marker} league fanout-shared-b`,
        provider: "espn",
        providerLeagueId: secondProviderLeagueId,
        scoringType: "H2H_POINTS",
        season: 2026,
        size: 2,
        sport: "ffl",
        status: "in_season",
      })
      .returning();
    if (!secondLeague) throw new Error("second league was not created");
    await handle.db.insert(members).values({
      organizationId: secondLeague.id,
      role: "commissioner",
      userId: first.userId,
    });
    await addDiscoveredLeague({
      credentialId: first.credentialId,
      name: secondLeague.name,
      provider: "espn",
      providerLeagueId: secondProviderLeagueId,
      userId: first.userId,
    });

    const result = await runIngestionTick({
      data: {
        leagueIds: [first.leagueId, secondLeague.id],
      },
      deps: { db: handle.db },
    });

    expect(result).toMatchObject({
      connectedRows: 2,
      ok: true,
      plannedCount: 2,
      skippedDuplicateCredentials: 0,
    });
    expect(result.planned.map((event) => event.data.credentialId)).toEqual([
      first.credentialId,
      first.credentialId,
    ]);
    expect(
      result.planned.map((event) => event.data.providerLeagueId).sort(),
    ).toEqual([first.providerLeagueId, secondProviderLeagueId].sort());
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

  it("forces current ingest when league.connected is the trigger", async () => {
    const seeded = await seedLiveLeague("connected-fanout");
    const now = new Date("2026-09-13T18:01:00Z");
    await seedDataCoverage(seeded, {
      league: now,
      matchups: now,
      members: now,
      rosters: now,
      teams: now,
    });

    const normalTick = await runIngestionTick({
      data: {
        leagueId: seeded.leagueId,
        now: now.toISOString(),
      },
      deps: {
        db: handle.db,
        gameStateProvider: {
          stateForLeague: () => "live_window",
        },
      },
    });
    const connectedTick = await runIngestionTick({
      data: {
        leagueId: seeded.leagueId,
        now: now.toISOString(),
      },
      deps: {
        db: handle.db,
        gameStateProvider: {
          stateForLeague: () => "live_window",
        },
      },
      eventName: JOB_EVENTS.leagueConnected,
    });

    expect(normalTick).toMatchObject({
      ok: true,
      plannedCount: 0,
      skippedNotDue: 1,
    });
    expect(connectedTick).toMatchObject({
      eventName: JOB_EVENTS.leagueConnected,
      ok: true,
      plannedCount: 1,
    });
    expect(connectedTick.planned[0]?.data).toMatchObject({
      leagueId: seeded.leagueId,
      provider: seeded.provider,
      providerLeagueId: seeded.providerLeagueId,
    });
    expect(connectedTick.planned[0]?.data.dataClasses).toEqual([
      ...primaryLiveDataClasses,
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
    expect(live.planned[0]?.data.currentScoringPeriod).toBe(1);
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

  it("uses the schedule-backed NFL calendar to select live-window cadence during games", async () => {
    const liveSeed = await seedLiveLeague("calendar-live");
    const offHoursSeed = await seedLiveLeague("calendar-offhours-default");
    const liveObservedAt = new Date("2025-09-16T03:00:00Z");
    const offHoursObservedAt = new Date("2025-09-16T18:00:00Z");
    const scheduleCalendar = new ScheduleBackedNflCalendar({
      source: new EspnScoreboardNflScheduleSource({
        fetcher: jsonScheduleFetch(espnWeekWindowFixture),
      }),
    });
    const gameStateProvider =
      createNflCalendarGameStateProvider(scheduleCalendar);
    await seedDataCoverage(liveSeed, {
      league: liveObservedAt,
      matchups: liveObservedAt,
      members: liveObservedAt,
      rosters: liveObservedAt,
      teams: liveObservedAt,
    });
    await seedDataCoverage(offHoursSeed, {
      league: offHoursObservedAt,
      matchups: offHoursObservedAt,
      members: offHoursObservedAt,
      rosters: offHoursObservedAt,
      teams: offHoursObservedAt,
    });

    const live = await runIngestionTick({
      data: {
        leagueIds: [liveSeed.leagueId],
        now: "2025-09-16T03:02:00.000Z",
      },
      deps: { db: handle.db, gameStateProvider },
    });
    const offHours = await runIngestionTick({
      data: {
        leagueIds: [offHoursSeed.leagueId],
        now: "2025-09-16T18:02:00.000Z",
      },
      deps: { db: handle.db, gameStateProvider },
    });

    expect(live).toMatchObject({
      ok: true,
      plannedCount: 1,
      skippedNotDue: 0,
    });
    expect(live.planned[0]?.data.dataClasses).toEqual(["matchups"]);
    expect(live.planned[0]?.id).toContain("matchups:live_window:");
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
      "transactions",
    ]);
    expect(result.planned[0]?.id).toContain(
      "rosters,matchups,transactions:in_season_off_hours:",
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
        currentScoringPeriod: 4,
        dataClasses: ["matchups"],
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
    expect(syncCalls[0]?.currentScoringPeriod).toBe(4);
    expect(syncCalls[0]?.dataClasses).toEqual(["matchups"]);
    expect(syncCalls[0]?.leagueId).toBe(seeded.leagueId);
    expect(response).toMatchObject({
      dataClasses: ["matchups"],
      gameFinalEvents: [],
      sentGameFinalCount: 0,
    });
  });

  it("refreshes stored Yahoo credentials before marking live ingest invalid", async () => {
    const seeded = await seedLiveLeague("worker-yahoo-refresh", {
      provider: "yahoo",
      providerLeagueId: `461.l.${marker}-worker-yahoo-refresh`,
    });
    await handle.db
      .update(providerCredentials)
      .set({
        encryptedPayload: cipher.encryptJson({
          accessToken: fixtureYahooAccessToken,
          expiresAt: "2020-01-01T00:00:00.000Z",
          refreshToken: fixtureYahooRefreshToken,
          tokenType: "Bearer",
        }),
      })
      .where(eq(providerCredentials.id, seeded.credentialId));

    const credentials: YahooCredentials[] = [];
    const refreshCalls: YahooCredentials[] = [];
    const syncCalls: CurrentLeagueSyncInput<FantasyProviderSession>[] = [];
    const provider = {
      authenticate: async (input: YahooCredentials) => {
        credentials.push(input);
        const tokenIsCurrent = new Set([refreshedYahooAccessToken]).has(
          input.accessToken,
        );
        if (!tokenIsCurrent) {
          return err(new AuthExpiredError("yahoo"));
        }
        return ok({
          provider: "yahoo" as const,
          authKind: "oauth2" as const,
          subjectProviderId: "YAHOO-LIVE-REFRESH",
          accessToken: input.accessToken,
          discoveryGameKeys: ["nfl"],
          discoverySeasons: [],
          historicalLeagueKeysByLeagueKey: {},
          leagueKeys: [],
          tokenType: input.tokenType ?? "Bearer",
        });
      },
      capabilities: {
        ...currentSyncCapabilities,
        authKind: "oauth2" as const,
        requiresOAuth: true,
      },
      getLeague: async () => err(new ProviderBlockedError("yahoo")),
      getMatchups: async () => err(new ProviderBlockedError("yahoo")),
      getMembers: async () => err(new ProviderBlockedError("yahoo")),
      getTeams: async () => err(new ProviderBlockedError("yahoo")),
      getTransactions: async () => err(new ProviderBlockedError("yahoo")),
    };

    const response = await runLeagueIngest({
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        name: `${marker} league worker-yahoo-refresh`,
        provider: "yahoo",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        sport: "ffl",
      },
      deps: {
        cipher,
        db: handle.db,
        providers: { yahoo: provider },
        syncCurrent: async (input) => {
          syncCalls.push(input);
          return ok(successfulSyncResult(seeded));
        },
        yahooOAuthClient: {
          async refreshCredentials({ credentials }) {
            refreshCalls.push(credentials);
            return ok({
              ...credentials,
              accessToken: refreshedYahooAccessToken,
              expiresAt: "2030-01-01T00:00:00.000Z",
              refreshToken: refreshedYahooRefreshToken,
            });
          },
        },
      },
    });

    expect(response).toMatchObject({
      eventName: JOB_EVENTS.leagueIngest,
      ok: true,
      league: {
        id: seeded.leagueId,
        provider: "yahoo",
      },
    });
    expect(refreshCalls).toEqual([
      expect.objectContaining({
        accessToken: fixtureYahooAccessToken,
        refreshToken: fixtureYahooRefreshToken,
      }),
    ]);
    expect(credentials).toEqual([
      expect.objectContaining({ accessToken: fixtureYahooAccessToken }),
      expect.objectContaining({ accessToken: refreshedYahooAccessToken }),
    ]);
    expect(syncCalls).toHaveLength(1);
    expect(syncCalls[0]?.session).toMatchObject({
      accessToken: refreshedYahooAccessToken,
    });

    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, seeded.credentialId))
      .limit(1);
    expect(credential).toMatchObject({
      invalidAt: null,
      status: "connected",
    });
    expect(
      cipher.decryptJson<YahooCredentials>(credential?.encryptedPayload ?? ""),
    ).toMatchObject({
      accessToken: refreshedYahooAccessToken,
      refreshToken: refreshedYahooRefreshToken,
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

  it("plans content.correction.needed events for affected published posts through the worker step", async () => {
    const seeded = await seedLiveLeague("worker-content-correction");
    const fixtureProvider = currentSyncProvider();
    const contentItemId = randomUUID();
    const matchupId = randomUUID();
    const correctionHash = "b".repeat(64);
    const sourceContentHash = "c".repeat(64);
    const fn = createLeagueIngestFunction(() => ({
      cipher,
      db: handle.db,
      providers: { espn: fixtureProvider.provider },
      syncCurrent: async () =>
        ok({
          ...successfulSyncResult(seeded),
          contentCorrectionsNeeded: [
            {
              affectedWeeks: [{ scoringPeriod: 3, season: 2026 }],
              changedMatchups: [
                {
                  contentHash: sourceContentHash,
                  id: matchupId,
                  scoringPeriod: 3,
                  season: 2026,
                },
              ],
              contentItemId,
              correctionHash,
              leagueId: seeded.leagueId,
              reason:
                "Score correction changed a published post's referenced week.",
            },
          ],
        }),
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        name: `${marker} league worker-content-correction`,
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

    const expectedCorrectionEvent = {
      data: {
        affectedWeeks: [{ scoringPeriod: 3, season: 2026 }],
        changedMatchups: [
          {
            contentHash: sourceContentHash,
            id: matchupId,
            scoringPeriod: 3,
            season: 2026,
          },
        ],
        contentItemId,
        correctionHash,
        leagueId: seeded.leagueId,
        reason: "Score correction changed a published post's referenced week.",
      },
      id: `${JOB_EVENTS.contentCorrectionNeeded}:${seeded.leagueId}:${contentItemId}:${correctionHash}`,
      name: JOB_EVENTS.contentCorrectionNeeded,
    };
    expect(stepRun.result).toMatchObject({
      contentCorrectionEvents: [expectedCorrectionEvent],
      ok: true,
      sentContentCorrectionCount: 0,
    });
  });

  it("plans record.broken events for materialized record displacements through the worker step", async () => {
    const seeded = await seedLiveLeague("worker-record-broken");
    const fixtureProvider = currentSyncProvider();
    const allTimeRecordId = randomUUID();
    const previousRecordId = randomUUID();
    const holderPersonId = randomUUID();
    const recordKey = `highest_single_week_score:${allTimeRecordId}`;
    const fn = createLeagueIngestFunction(() => ({
      cipher,
      db: handle.db,
      providers: { espn: fixtureProvider.provider },
      syncCurrent: async () =>
        ok({
          ...successfulSyncResult(seeded),
          recordBrokenHooks: [
            {
              allTimeRecordId,
              holderPersonId,
              previousRecordId,
              recordKey,
              recordType: "highest_single_week_score",
              scoringPeriod: 4,
              season: 2026,
              value: 188.4,
            },
          ],
        }),
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        name: `${marker} league worker-record-broken`,
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

    expect(stepRun.result).toMatchObject({
      ok: true,
      recordBrokenEvents: [
        {
          data: {
            leagueId: seeded.leagueId,
            recordKey,
          },
          id: `${JOB_EVENTS.recordBroken}:${seeded.leagueId}:${recordKey}`,
          name: JOB_EVENTS.recordBroken,
        },
      ],
      sentRecordBrokenCount: 0,
    });
  });

  it("plans transaction and waiver content triggers through the worker step", async () => {
    const seeded = await seedLiveLeague("worker-transaction-triggers");
    const fixtureProvider = currentSyncProvider();
    const transactionId = randomUUID();
    const waiverId = randomUUID();
    const fn = createLeagueIngestFunction(() => ({
      cipher,
      db: handle.db,
      providers: { espn: fixtureProvider.provider },
      syncCurrent: async () =>
        ok({
          ...successfulSyncResult(seeded),
          changedTransactions: [
            {
              id: transactionId,
              type: "add",
            },
            {
              id: waiverId,
              type: "waiver",
            },
          ],
        }),
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        name: `${marker} league worker-transaction-triggers`,
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

    expect(stepRun.result).toMatchObject({
      ok: true,
      sentTransactionCount: 0,
      sentWaiverCount: 0,
      transactionEvents: [
        {
          data: {
            leagueId: seeded.leagueId,
            transactionId,
          },
          id: `${JOB_EVENTS.transaction}:${seeded.leagueId}:${transactionId}`,
          name: JOB_EVENTS.transaction,
        },
      ],
      waiverEvents: [
        {
          data: {
            leagueId: seeded.leagueId,
            waiverId,
          },
          id: `${JOB_EVENTS.waiver}:${seeded.leagueId}:${waiverId}`,
          name: JOB_EVENTS.waiver,
        },
      ],
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

    const coverageRows = await dataCoverageRowsFor(seeded.leagueId);
    expect(
      coverageRows
        .flatMap((row) => {
          switch (row.errorCode) {
            case "PROVIDER_AUTH_EXPIRED":
              return [row.dataClass];
            default:
              return [];
          }
        })
        .sort(),
    ).toEqual([
      "final_standings",
      "league",
      "matchups",
      "members",
      "rosters",
      "scoring_detail",
      "teams",
    ]);
    expect(
      coverageRows.find((row) => row.dataClass === "league"),
    ).toMatchObject({
      details: { stage: "authenticate", sync: "current" },
      errorCode: "PROVIDER_AUTH_EXPIRED",
      itemCount: 0,
      status: "error",
    });
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

    const coverageRows = await dataCoverageRowsFor(seeded.leagueId);
    expect(
      coverageRows.find((row) => row.dataClass === "league"),
    ).toMatchObject({
      details: { stage: "sync", sync: "current" },
      errorCode: "PROVIDER_AUTH_EXPIRED",
      itemCount: 0,
      status: "error",
    });
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

  it("rediscovers a higher ESPN season and enqueues live ingest on the same credential", async () => {
    const seeded = await seedLiveLeague("rollover-espn", {
      leagueStatus: "complete",
      season: 2025,
    });
    const nextSeasonRef: ProviderLeagueRef = {
      provider: "espn",
      providerId: seeded.providerLeagueId,
      season: 2027,
      sport: "ffl",
      name: `${marker} league rollover-espn 2027`,
      size: 2,
    };
    const discovery = rolloverDiscoveryProvider({
      refs: [nextSeasonRef],
    });

    const result = await runSeasonRolloverCheck({
      data: {
        credentialIds: [seeded.credentialId],
        now: "2026-08-01T12:00:00.000Z",
      },
      deps: {
        cipher,
        db: handle.db,
        providers: { espn: discovery.provider },
      },
    });

    expect(result).toMatchObject({
      advancedLeagueCount: 1,
      checkedCredentialCount: 1,
      discoveredLeagueCount: 1,
      eventName: JOB_EVENTS.seasonRolloverCheck,
      failures: [],
      historicalBackfillCount: 1,
      ok: true,
      plannedCount: 1,
      sentCount: 0,
    });
    expect(result.planned[0]).toMatchObject({
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        name: nextSeasonRef.name,
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        season: 2027,
      },
      name: JOB_EVENTS.leagueIngest,
    });
    expect(result.historicalBackfills[0]).toMatchObject({
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        name: nextSeasonRef.name,
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        season: 2027,
        seasons: [2026, 2025],
      },
      name: JOB_EVENTS.importRequested,
    });
    expect(discovery.credentials).toEqual([
      {
        espn_s2: fixtureEspnS2,
        swid: fixtureSwid,
      },
    ]);

    const [league] = await handle.db
      .select()
      .from(leagues)
      .where(eq(leagues.id, seeded.leagueId))
      .limit(1);
    expect(league).toMatchObject({
      id: seeded.leagueId,
      name: nextSeasonRef.name,
      providerLeagueId: seeded.providerLeagueId,
      season: 2027,
      status: "unknown",
    });

    const [discovered] = await handle.db
      .select()
      .from(onboardingDiscoveredLeagues)
      .where(
        and(
          eq(onboardingDiscoveredLeagues.credentialId, seeded.credentialId),
          eq(onboardingDiscoveredLeagues.provider, "espn"),
          eq(
            onboardingDiscoveredLeagues.providerLeagueId,
            seeded.providerLeagueId,
          ),
          eq(onboardingDiscoveredLeagues.season, 2027),
        ),
      )
      .limit(1);
    expect(discovered).toMatchObject({
      credentialId: seeded.credentialId,
      lastDiscoveredAt: new Date("2026-08-01T12:00:00.000Z"),
      season: 2027,
    });

    const syncCalls: CurrentLeagueSyncInput<FantasyProviderSession>[] = [];
    const workerProvider = currentSyncProvider();
    await expect(
      runLeagueIngest({
        data: result.planned[0]?.data,
        deps: {
          cipher,
          db: handle.db,
          providers: { espn: workerProvider.provider },
          syncCurrent: async (input) => {
            syncCalls.push(input);
            return ok(
              successfulSyncResult({
                ...seeded,
                season: 2027,
              }),
            );
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      league: {
        id: seeded.leagueId,
        providerLeagueId: seeded.providerLeagueId,
        season: 2027,
      },
    });
    expect(syncCalls[0]?.ref).toMatchObject({
      provider: "espn",
      providerId: seeded.providerLeagueId,
      season: 2027,
    });

    const repeated = await runSeasonRolloverCheck({
      data: {
        credentialIds: [seeded.credentialId],
        now: "2026-08-01T12:01:00.000Z",
      },
      deps: {
        cipher,
        db: handle.db,
        providers: { espn: discovery.provider },
      },
    });
    expect(repeated).toMatchObject({
      advancedLeagueCount: 0,
      historicalBackfillCount: 0,
      ok: true,
      plannedCount: 0,
    });
  });

  it("advances Yahoo leagues when the new season uses a linked league key", async () => {
    const oldYahooKey = `449.l.${marker}-rollover-yahoo`;
    const newYahooKey = `461.l.${marker}-rollover-yahoo`;
    const seeded = await seedLiveLeague("rollover-yahoo", {
      leagueStatus: "complete",
      provider: "yahoo",
      providerLeagueId: oldYahooKey,
      season: 2025,
    });
    const discovery = rolloverDiscoveryProvider({
      provider: "yahoo",
      refs: [
        {
          provider: "yahoo",
          providerId: newYahooKey,
          season: 2026,
          sport: "ffl",
          name: `${marker} Yahoo rollover`,
          size: 12,
        },
      ],
    });

    const result = await runSeasonRolloverCheck({
      data: {
        credentialIds: [seeded.credentialId],
        now: "2026-08-02T12:00:00.000Z",
      },
      deps: {
        cipher,
        db: handle.db,
        providers: { yahoo: discovery.provider },
      },
    });

    expect(result).toMatchObject({
      advancedLeagueCount: 1,
      ok: true,
      plannedCount: 1,
    });
    expect(result.planned[0]?.data).toMatchObject({
      credentialId: seeded.credentialId,
      leagueId: seeded.leagueId,
      provider: "yahoo",
      providerLeagueId: newYahooKey,
      season: 2026,
    });

    const [league] = await handle.db
      .select()
      .from(leagues)
      .where(eq(leagues.id, seeded.leagueId))
      .limit(1);
    expect(league).toMatchObject({
      providerLeagueId: newYahooKey,
      season: 2026,
      status: "unknown",
    });
  });

  it("plans season rollover events through the Inngest step API", async () => {
    const seeded = await seedLiveLeague("rollover-job", {
      leagueStatus: "complete",
      season: 2026,
    });
    const discovery = rolloverDiscoveryProvider({
      refs: [
        {
          provider: "espn",
          providerId: seeded.providerLeagueId,
          season: 2027,
          sport: "ffl",
          name: `${marker} league rollover-job 2027`,
          size: 2,
        },
      ],
    });
    const fn = createSeasonRolloverCheckFunction(() => ({
      cipher,
      db: handle.db,
      providers: { espn: discovery.provider },
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        credentialIds: [seeded.credentialId],
        now: "2026-08-03T12:00:00.000Z",
      },
      name: JOB_EVENTS.seasonRolloverCheck,
    };

    const stepRun = await testEngine.executeStep(
      "plan-season-rollover-ingest",
      {
        events: [event],
      },
    );
    const plan = stepRun.result as Awaited<
      ReturnType<typeof runSeasonRolloverCheck>
    >;

    expect(plan).toMatchObject({
      historicalBackfillCount: 1,
      ok: true,
      plannedCount: 1,
      sentCount: 0,
    });
    expect(plan.planned[0]?.data).toMatchObject({
      credentialId: seeded.credentialId,
      leagueId: seeded.leagueId,
      provider: "espn",
      season: 2027,
    });
    expect(plan.historicalBackfills[0]?.data).toMatchObject({
      credentialId: seeded.credentialId,
      leagueId: seeded.leagueId,
      provider: "espn",
      season: 2027,
      seasons: [2026],
    });
  });

  it("registers live ingestion functions", () => {
    const fn = createLeagueIngestFunction(() => ({
      cipher,
      db: handle.db,
      providers: {},
    }));
    expect(fn).toBeDefined();
    expect(functions).toContain(ingestionTick);
    expect(functions).toContain(leagueIngest);
    expect(functions).toContain(seasonRolloverCheck);
  });
});
