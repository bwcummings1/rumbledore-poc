// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { asc, eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { err, ok } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataCoverage,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  historicalImportCheckpoints,
  leagues,
  members,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";
import {
  AuthExpiredError,
  type FantasyProviderCapabilities,
  type NormalizedSeasonBundle,
  ProviderBlockedError,
  type ProviderError,
} from "@/providers";
import type {
  EspnCookieCredentials,
  EspnSession,
} from "@/providers/espn/client";
import type {
  SleeperCredentials,
  SleeperSession,
} from "@/providers/sleeper/client";
import type { YahooCredentials, YahooSession } from "@/providers/yahoo/client";
import { RecordingRealtimePublisher } from "@/realtime";
import { JOB_EVENTS } from "./events";
import {
  createImportRequestedFunction,
  importRequested,
  runImportRequested,
} from "./functions/import-requested";
import { functions } from "./index";

const marker = `importjobtest-${randomUUID()}`;
const masterKey = "test-import-job-master-key-minimum-32"; // ubs:ignore — fake fixture value
const fixtureSwid = "{00000000-0000-4000-8000-000000000001}";
const fixtureEspnS2 = "fixture-session-value"; // ubs:ignore — fake ESPN cookie value for job tests
const fixtureYahooAccessToken = "fixture-yahoo-access-token"; // ubs:ignore — fake OAuth token for job tests
const fixtureYahooRefreshToken = "fixture-yahoo-refresh-token"; // ubs:ignore — fake OAuth token for job tests
const refreshedYahooAccessToken = "fixture-yahoo-access-token-refreshed"; // ubs:ignore — fake OAuth token for job tests
const refreshedYahooRefreshToken = "fixture-yahoo-refresh-token-refreshed"; // ubs:ignore — fake OAuth token for job tests

let handle: DbHandle;
let cipher: CredentialCipher;

interface SeededImport {
  credentialId: string;
  leagueId: string;
  provider: "espn" | "sleeper" | "yahoo";
  providerLeagueId: string;
  userId: string;
}

function connectionFlowFor(provider: SeededImport["provider"]) {
  switch (provider) {
    case "espn":
      return "manual";
    case "sleeper":
      return "public";
    case "yahoo":
      return "manual";
  }
}

interface ImportProvider {
  calls: number[];
  credentials: EspnCookieCredentials[];
  provider: {
    capabilities: FantasyProviderCapabilities;
    authenticate(
      credentials: EspnCookieCredentials,
    ): Promise<
      | { ok: true; value: EspnSession }
      | { ok: false; error: AuthExpiredError | ProviderBlockedError }
    >;
    getHistory(
      session: EspnSession,
      ref: {
        provider: "espn";
        providerId: string;
        season: number;
        sport: "ffl" | "unknown";
        name: string;
        size?: number;
      },
      options: { seasons: number[] },
    ): Promise<{ ok: true; value: NormalizedSeasonBundle[] }>;
  };
}

interface SleeperImportProvider {
  calls: number[];
  credentials: SleeperCredentials[];
  provider: {
    capabilities: FantasyProviderCapabilities;
    authenticate(
      credentials: SleeperCredentials,
    ): Promise<{ ok: true; value: SleeperSession }>;
    getHistory(
      session: SleeperSession,
      ref: {
        provider: "sleeper";
        providerId: string;
        season: number;
        sport: "ffl" | "unknown";
        name: string;
        size?: number;
      },
      options: { seasons: number[] },
    ): Promise<{ ok: true; value: NormalizedSeasonBundle[] }>;
  };
}

interface YahooImportProvider {
  calls: number[];
  credentials: YahooCredentials[];
  provider: {
    capabilities: FantasyProviderCapabilities;
    authenticate(
      credentials: YahooCredentials,
    ): Promise<
      { ok: true; value: YahooSession } | { ok: false; error: ProviderError }
    >;
    getHistory(
      session: YahooSession,
      ref: {
        provider: "yahoo";
        providerId: string;
        season: number;
        sport: "ffl" | "unknown";
        name: string;
        size?: number;
      },
      options: { seasons: number[] },
    ): Promise<{ ok: true; value: NormalizedSeasonBundle[] }>;
  };
}

const espnImportCapabilities: FantasyProviderCapabilities = {
  authKind: "cookie",
  dataClasses: {
    league: "full",
    teams: "full",
    members: "full",
    rosters: "none",
    matchups: "full",
    final_standings: "partial",
    transactions: "none",
    history: "partial",
    divisions: "none",
    keeper_dynasty: "none",
    scoring_detail: "partial",
  },
  requiresOAuth: false,
  supportsHistory: true,
  supportsRosters: false,
  supportsTransactions: false,
};

const sleeperImportCapabilities: FantasyProviderCapabilities = {
  authKind: "none",
  dataClasses: {
    league: "full",
    teams: "full",
    members: "full",
    rosters: "full",
    matchups: "full",
    final_standings: "partial",
    transactions: "full",
    history: "partial",
    divisions: "none",
    keeper_dynasty: "partial",
    scoring_detail: "partial",
  },
  requiresOAuth: false,
  supportsHistory: true,
  supportsRosters: true,
  supportsTransactions: true,
};

const yahooImportCapabilities: FantasyProviderCapabilities = {
  authKind: "oauth2",
  dataClasses: {
    league: "full",
    teams: "full",
    members: "full",
    rosters: "full",
    matchups: "full",
    final_standings: "partial",
    transactions: "partial",
    history: "partial",
    divisions: "none",
    keeper_dynasty: "none",
    scoring_detail: "partial",
  },
  requiresOAuth: true,
  supportsHistory: true,
  supportsRosters: true,
  supportsTransactions: true,
};

function bundleFor({
  providerLeagueId,
  season,
}: {
  providerLeagueId: string;
  season: number;
}): NormalizedSeasonBundle {
  return {
    league: {
      provider: "espn",
      providerId: providerLeagueId,
      season,
      sport: "ffl",
      name: `${marker} ${season}`,
      size: 2,
      currentScoringPeriod: 14,
      scoringType: "H2H_POINTS",
      status: "complete",
    },
    teams: [
      {
        provider: "espn",
        providerId: "1",
        leagueProviderId: providerLeagueId,
        season,
        name: `Job One ${season}`,
        abbrev: "ONE",
        ownerMemberIds: [`owner-one-${season}`],
        record: {
          wins: 1,
          losses: 0,
          ties: 0,
          pointsFor: 120,
          pointsAgainst: 100,
        },
      },
      {
        provider: "espn",
        providerId: "2",
        leagueProviderId: providerLeagueId,
        season,
        name: `Job Two ${season}`,
        abbrev: "TWO",
        ownerMemberIds: [`owner-two-${season}`],
        record: {
          wins: 0,
          losses: 1,
          ties: 0,
          pointsFor: 100,
          pointsAgainst: 120,
        },
      },
    ],
    members: [
      {
        provider: "espn",
        providerId: `owner-one-${season}`,
        leagueProviderId: providerLeagueId,
        season,
        displayName: `Owner One ${season}`,
        role: "member",
      },
      {
        provider: "espn",
        providerId: `owner-two-${season}`,
        leagueProviderId: providerLeagueId,
        season,
        displayName: `Owner Two ${season}`,
        role: "member",
      },
    ],
    matchups: [
      {
        provider: "espn",
        providerId: "matchup-1",
        leagueProviderId: providerLeagueId,
        season,
        scoringPeriod: 1,
        homeTeamRef: { provider: "espn", providerId: "1", season },
        awayTeamRef: { provider: "espn", providerId: "2", season },
        homeScore: 120,
        awayScore: 100,
        winner: "home",
        status: "final",
      },
    ],
    finalStandings: [],
    transactions: [],
  };
}

function sleeperBundleFor({
  providerLeagueId,
  season,
}: {
  providerLeagueId: string;
  season: number;
}): NormalizedSeasonBundle {
  return {
    league: {
      provider: "sleeper",
      providerId: providerLeagueId,
      season,
      sport: "ffl",
      name: `${marker} sleeper ${season}`,
      size: 2,
      currentScoringPeriod: 14,
      scoringType: "PPR",
      status: "complete",
    },
    teams: [
      {
        provider: "sleeper",
        providerId: "1",
        leagueProviderId: providerLeagueId,
        season,
        name: `Sleeper One ${season}`,
        abbrev: "SON",
        ownerMemberIds: [`sleeper-owner-one-${season}`],
        record: {
          wins: 1,
          losses: 0,
          ties: 0,
          pointsFor: 120,
          pointsAgainst: 100,
        },
      },
      {
        provider: "sleeper",
        providerId: "2",
        leagueProviderId: providerLeagueId,
        season,
        name: `Sleeper Two ${season}`,
        abbrev: "STW",
        ownerMemberIds: [`sleeper-owner-two-${season}`],
        record: {
          wins: 0,
          losses: 1,
          ties: 0,
          pointsFor: 100,
          pointsAgainst: 120,
        },
      },
    ],
    members: [
      {
        provider: "sleeper",
        providerId: `sleeper-owner-one-${season}`,
        leagueProviderId: providerLeagueId,
        season,
        displayName: `Sleeper Owner One ${season}`,
        role: "member",
      },
      {
        provider: "sleeper",
        providerId: `sleeper-owner-two-${season}`,
        leagueProviderId: providerLeagueId,
        season,
        displayName: `Sleeper Owner Two ${season}`,
        role: "member",
      },
    ],
    matchups: [
      {
        provider: "sleeper",
        providerId: "matchup-1",
        leagueProviderId: providerLeagueId,
        season,
        scoringPeriod: 1,
        homeTeamRef: { provider: "sleeper", providerId: "1", season },
        awayTeamRef: { provider: "sleeper", providerId: "2", season },
        homeScore: 120,
        awayScore: 100,
        winner: "home",
        status: "final",
      },
    ],
    finalStandings: [],
    transactions: [],
  };
}

function yahooBundleFor({
  providerLeagueId,
  season,
}: {
  providerLeagueId: string;
  season: number;
}): NormalizedSeasonBundle {
  return {
    league: {
      provider: "yahoo",
      providerId: providerLeagueId,
      season,
      sport: "ffl",
      name: `${marker} yahoo ${season}`,
      size: 2,
      currentScoringPeriod: 14,
      scoringType: "H2H",
      status: "complete",
    },
    teams: [
      {
        provider: "yahoo",
        providerId: "1",
        leagueProviderId: providerLeagueId,
        season,
        name: `Yahoo One ${season}`,
        abbrev: "YON",
        ownerMemberIds: [`yahoo-owner-one-${season}`],
        record: {
          wins: 1,
          losses: 0,
          ties: 0,
          pointsFor: 120,
          pointsAgainst: 100,
        },
      },
      {
        provider: "yahoo",
        providerId: "2",
        leagueProviderId: providerLeagueId,
        season,
        name: `Yahoo Two ${season}`,
        abbrev: "YTW",
        ownerMemberIds: [`yahoo-owner-two-${season}`],
        record: {
          wins: 0,
          losses: 1,
          ties: 0,
          pointsFor: 100,
          pointsAgainst: 120,
        },
      },
    ],
    members: [
      {
        provider: "yahoo",
        providerId: `yahoo-owner-one-${season}`,
        leagueProviderId: providerLeagueId,
        season,
        displayName: `Yahoo Owner One ${season}`,
        role: "member",
      },
      {
        provider: "yahoo",
        providerId: `yahoo-owner-two-${season}`,
        leagueProviderId: providerLeagueId,
        season,
        displayName: `Yahoo Owner Two ${season}`,
        role: "member",
      },
    ],
    matchups: [
      {
        provider: "yahoo",
        providerId: "matchup-1",
        leagueProviderId: providerLeagueId,
        season,
        scoringPeriod: 1,
        homeTeamRef: { provider: "yahoo", providerId: "1", season },
        awayTeamRef: { provider: "yahoo", providerId: "2", season },
        homeScore: 120,
        awayScore: 100,
        winner: "home",
        status: "final",
      },
    ],
    finalStandings: [],
    transactions: [],
  };
}

function historyProvider({
  authExpired = false,
  blocked = false,
}: {
  authExpired?: boolean;
  blocked?: boolean;
} = {}): ImportProvider {
  const calls: number[] = [];
  const credentials: EspnCookieCredentials[] = [];
  return {
    calls,
    credentials,
    provider: {
      capabilities: espnImportCapabilities,
      async authenticate(input) {
        credentials.push(input);
        if (authExpired) {
          return err(new AuthExpiredError("espn"));
        }
        if (blocked) {
          return err(new ProviderBlockedError("espn"));
        }

        return ok({
          provider: "espn",
          authKind: "cookie",
          subjectProviderId: "job-fixture-user",
          swid: input.swid,
          espn_s2: input.espn_s2,
        });
      },
      async getHistory(_session, ref, options) {
        const season = options.seasons[0];
        if (season === undefined) {
          return ok([]);
        }

        calls.push(season);
        return ok([bundleFor({ providerLeagueId: ref.providerId, season })]);
      },
    },
  };
}

function sleeperHistoryProvider(): SleeperImportProvider {
  const calls: number[] = [];
  const credentials: SleeperCredentials[] = [];
  return {
    calls,
    credentials,
    provider: {
      capabilities: sleeperImportCapabilities,
      async authenticate(input) {
        credentials.push(input);
        return ok({
          provider: "sleeper",
          authKind: "none",
          subjectProviderId: "user-123",
          username: input.usernameOrUserId,
          currentLeagueSeason: 2026,
          discoverySeasons: input.seasons ?? [2026, 2025],
        });
      },
      async getHistory(_session, ref, options) {
        const season = options.seasons[0];
        if (season === undefined) {
          return ok([]);
        }

        calls.push(season);
        return ok([
          sleeperBundleFor({ providerLeagueId: ref.providerId, season }),
        ]);
      },
    },
  };
}

function yahooHistoryProvider({
  validAccessToken,
}: {
  validAccessToken?: string;
} = {}): YahooImportProvider {
  const calls: number[] = [];
  const credentials: YahooCredentials[] = [];
  return {
    calls,
    credentials,
    provider: {
      capabilities: yahooImportCapabilities,
      async authenticate(input) {
        credentials.push(input);
        if (validAccessToken) {
          const tokenIsCurrent = new Set([validAccessToken]).has(
            input.accessToken,
          );
          if (!tokenIsCurrent) {
            return err(new AuthExpiredError("yahoo"));
          }
        }
        return ok({
          provider: "yahoo",
          authKind: "oauth2",
          subjectProviderId: "YAHOO-GUID-123",
          accessToken: input.accessToken,
          discoveryGameKeys: input.discoveryGameKeys ?? ["nfl"],
          discoverySeasons: input.discoverySeasons ?? [],
          historicalLeagueKeysByLeagueKey:
            input.historicalLeagueKeysByLeagueKey ?? {},
          leagueKeys: input.leagueKeys ?? [],
          tokenType: input.tokenType ?? "Bearer",
        });
      },
      async getHistory(_session, ref, options) {
        const season = options.seasons[0];
        if (season === undefined) {
          return ok([]);
        }

        calls.push(season);
        return ok([
          yahooBundleFor({ providerLeagueId: ref.providerId, season }),
        ]);
      },
    },
  };
}

async function seedImport(
  tag: string,
  {
    credentialPayload = {
      espn_s2: fixtureEspnS2,
      swid: fixtureSwid,
    },
    provider = "espn",
    subjectProviderId = fixtureSwid,
  }: {
    credentialPayload?: unknown;
    provider?: "espn" | "sleeper" | "yahoo";
    subjectProviderId?: string;
  } = {},
): Promise<SeededImport> {
  const providerLeagueId = `${marker}-${tag}`;
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `${marker} ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning();
  if (!user) throw new Error("user was not created");

  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 0,
      name: `${marker} league ${tag}`,
      provider,
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 2,
      sport: "ffl",
      status: "preseason",
    })
    .returning();
  if (!league) throw new Error("league was not created");

  await handle.db.insert(members).values({
    organizationId: league.id,
    role: "commissioner",
    userId: user.id,
  });

  const [credential] = await handle.db
    .insert(providerCredentials)
    .values({
      connectionFlow: connectionFlowFor(provider),
      encryptedPayload: cipher.encryptJson(credentialPayload),
      invalidAt: null,
      lastValidatedAt: new Date("2026-06-11T00:00:00.000Z"),
      provider,
      status: "connected",
      subjectProviderId,
      userId: user.id,
    })
    .returning();
  if (!credential) throw new Error("credential was not created");

  return {
    credentialId: credential.id,
    leagueId: league.id,
    provider,
    providerLeagueId,
    userId: user.id,
  };
}

async function selectHistoricalRows(leagueId: string) {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const coverage = await tx
      .select()
      .from(dataCoverage)
      .where(eq(dataCoverage.leagueId, leagueId))
      .orderBy(asc(dataCoverage.season), asc(dataCoverage.dataClass));
    const teams = await tx
      .select()
      .from(fantasyTeams)
      .where(eq(fantasyTeams.leagueId, leagueId))
      .orderBy(asc(fantasyTeams.season), asc(fantasyTeams.providerTeamId));
    const membersRows = await tx
      .select()
      .from(fantasyMembers)
      .where(eq(fantasyMembers.leagueId, leagueId))
      .orderBy(
        asc(fantasyMembers.season),
        asc(fantasyMembers.providerMemberId),
      );
    const matchups = await tx
      .select()
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.leagueId, leagueId))
      .orderBy(asc(fantasyMatchups.season));
    const [checkpoint] = await tx
      .select()
      .from(historicalImportCheckpoints)
      .where(eq(historicalImportCheckpoints.leagueId, leagueId))
      .limit(1);

    return { checkpoint, coverage, matchups, members: membersRows, teams };
  });
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  cipher = createCredentialCipher(masterKey);
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

describe("import.requested Inngest function", () => {
  it("loads stored credentials and persists checkpointed historical seasons", async () => {
    const seeded = await seedImport("success");
    const fixtureProvider = historyProvider();
    const fn = createImportRequestedFunction(() => ({
      cipher,
      db: handle.db,
      providers: { espn: fixtureProvider.provider },
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      name: JOB_EVENTS.importRequested,
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        sport: "ffl",
        name: `${marker} league success`,
        size: 2,
        seasons: [2025, 2024],
      },
    };

    const { result } = await testEngine.execute({ events: [event] });

    expect(result).toMatchObject({
      ok: true,
      eventName: JOB_EVENTS.importRequested,
      seasons: {
        requested: [2025, 2024],
        imported: [2025, 2024],
        skipped: [],
      },
      checkpoint: {
        status: "completed",
        lastCompletedSeason: 2024,
        nextSeason: null,
      },
    });
    expect(fixtureProvider.credentials).toEqual([
      {
        espn_s2: fixtureEspnS2,
        swid: fixtureSwid,
      },
    ]);
    expect(fixtureProvider.calls).toEqual([2025, 2024]);

    const rows = await selectHistoricalRows(seeded.leagueId);
    expect(rows.teams).toHaveLength(4);
    expect(rows.members).toHaveLength(4);
    expect(rows.matchups).toHaveLength(2);
    expect(
      rows.coverage.find(
        (coverage) =>
          coverage.season === 2024 && coverage.dataClass === "transactions",
      ),
    ).toMatchObject({
      capability: "none",
      itemCount: 0,
      status: "unavailable",
    });
    expect(rows.checkpoint).toMatchObject({
      status: "completed",
      seasonsCompleted: 2,
      seasonsTotal: 2,
    });
  });

  it("publishes realtime historical progress from the job dependency", async () => {
    const seeded = await seedImport("realtime-progress");
    const fixtureProvider = historyProvider();
    const realtime = new RecordingRealtimePublisher();
    const emittedAt = new Date("2026-06-15T12:00:00.000Z");

    const response = await runImportRequested({
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        provider: "espn",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        sport: "ffl",
        name: `${marker} league realtime`,
        size: 2,
        seasons: [2025],
      },
      deps: {
        cipher,
        db: handle.db,
        now: () => emittedAt,
        providers: { espn: fixtureProvider.provider },
        realtime,
      },
    });

    expect(response.ok).toBe(true);
    expect(
      realtime.historyImportProgress.map((payload) => payload.status),
    ).toEqual(["running", "completed"]);
    expect(realtime.historyImportProgress.at(-1)).toMatchObject({
      at: emittedAt.toISOString(),
      importedSeasons: [2025],
      leagueId: seeded.leagueId,
      nextSeason: null,
      provider: "espn",
      providerLeagueId: seeded.providerLeagueId,
      seasonsCompleted: 1,
      seasonsTotal: 1,
      status: "completed",
    });
  });

  it("marks expired credentials invalid without retrying the job", async () => {
    const seeded = await seedImport("expired");
    const fixtureProvider = historyProvider({ authExpired: true });

    await expect(
      runImportRequested({
        data: {
          credentialId: seeded.credentialId,
          leagueId: seeded.leagueId,
          provider: "espn",
          providerLeagueId: seeded.providerLeagueId,
          season: 2026,
          sport: "ffl",
          name: `${marker} league expired`,
          size: 2,
          seasons: [2025],
        },
        deps: {
          cipher,
          db: handle.db,
          providers: { espn: fixtureProvider.provider },
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);

    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, seeded.credentialId))
      .limit(1);
    expect(credential).toMatchObject({
      status: "invalid",
    });
  });

  it("keeps credentials connected when provider auth is temporarily blocked", async () => {
    const seeded = await seedImport("blocked-auth");
    const fixtureProvider = historyProvider({ blocked: true });

    await expect(
      runImportRequested({
        data: {
          credentialId: seeded.credentialId,
          leagueId: seeded.leagueId,
          provider: "espn",
          providerLeagueId: seeded.providerLeagueId,
          season: 2026,
          sport: "ffl",
          name: `${marker} league blocked`,
          size: 2,
          seasons: [2025],
        },
        deps: {
          cipher,
          db: handle.db,
          providers: { espn: fixtureProvider.provider },
        },
      }),
    ).rejects.toBeInstanceOf(ProviderBlockedError);

    const [credential] = await handle.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, seeded.credentialId))
      .limit(1);
    expect(credential).toMatchObject({
      status: "connected",
    });
  });

  it("dispatches Sleeper imports with public no-auth credentials", async () => {
    const seeded = await seedImport("sleeper", {
      credentialPayload: {
        seasons: [2026, 2025],
        usernameOrUserId: "fixture_sleeper",
      },
      provider: "sleeper",
      subjectProviderId: "user-123",
    });
    const fixtureProvider = sleeperHistoryProvider();
    const response = await runImportRequested({
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        provider: "sleeper",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        sport: "ffl",
        name: `${marker} sleeper league`,
        size: 2,
        seasons: [2025],
      },
      deps: {
        cipher,
        db: handle.db,
        providers: { sleeper: fixtureProvider.provider },
      },
    });

    expect(response).toMatchObject({
      ok: true,
      eventName: JOB_EVENTS.importRequested,
      seasons: {
        requested: [2025],
        imported: [2025],
        skipped: [],
      },
    });
    expect(fixtureProvider.credentials).toEqual([
      {
        seasons: [2026, 2025],
        usernameOrUserId: "fixture_sleeper",
      },
    ]);
    expect(fixtureProvider.calls).toEqual([2025]);

    const rows = await selectHistoricalRows(seeded.leagueId);
    expect(rows.teams).toHaveLength(2);
    expect(rows.members).toHaveLength(2);
    expect(rows.matchups).toHaveLength(1);
  });

  it("dispatches Yahoo imports with OAuth credentials", async () => {
    const seeded = await seedImport("yahoo", {
      credentialPayload: {
        accessToken: fixtureYahooAccessToken,
        expiresAt: "2030-01-01T00:00:00.000Z",
        historicalLeagueKeysByLeagueKey: {
          "461.l.95050": ["449.l.95050"],
        },
        leagueKeys: ["449.l.95050"],
      },
      provider: "yahoo",
      subjectProviderId: "YAHOO-GUID-123",
    });
    const fixtureProvider = yahooHistoryProvider();
    const response = await runImportRequested({
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        provider: "yahoo",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        sport: "ffl",
        name: `${marker} yahoo league`,
        size: 2,
        seasons: [2025],
      },
      deps: {
        cipher,
        db: handle.db,
        providers: { yahoo: fixtureProvider.provider },
      },
    });

    expect(response).toMatchObject({
      ok: true,
      eventName: JOB_EVENTS.importRequested,
      seasons: {
        requested: [2025],
        imported: [2025],
        skipped: [],
      },
    });
    expect(fixtureProvider.credentials).toEqual([
      {
        accessToken: fixtureYahooAccessToken,
        expiresAt: "2030-01-01T00:00:00.000Z",
        historicalLeagueKeysByLeagueKey: {
          "461.l.95050": ["449.l.95050"],
        },
        leagueKeys: ["449.l.95050"],
        tokenType: "Bearer",
      },
    ]);
    expect(fixtureProvider.calls).toEqual([2025]);

    const rows = await selectHistoricalRows(seeded.leagueId);
    expect(rows.teams).toHaveLength(2);
    expect(rows.members).toHaveLength(2);
    expect(rows.matchups).toHaveLength(1);
  });

  it("refreshes stored Yahoo credentials before marking historical imports invalid", async () => {
    const seeded = await seedImport("yahoo-refresh", {
      credentialPayload: {
        accessToken: fixtureYahooAccessToken,
        expiresAt: "2020-01-01T00:00:00.000Z",
        historicalLeagueKeysByLeagueKey: {
          "461.l.95050": ["449.l.95050"],
        },
        leagueKeys: ["449.l.95050"],
        refreshToken: fixtureYahooRefreshToken,
        tokenType: "Bearer",
      },
      provider: "yahoo",
      subjectProviderId: "YAHOO-GUID-REFRESH",
    });
    const fixtureProvider = yahooHistoryProvider({
      validAccessToken: refreshedYahooAccessToken,
    });
    const refreshCalls: YahooCredentials[] = [];

    const response = await runImportRequested({
      data: {
        credentialId: seeded.credentialId,
        leagueId: seeded.leagueId,
        provider: "yahoo",
        providerLeagueId: seeded.providerLeagueId,
        season: 2026,
        sport: "ffl",
        name: `${marker} yahoo refresh league`,
        size: 2,
        seasons: [2025],
      },
      deps: {
        cipher,
        db: handle.db,
        providers: { yahoo: fixtureProvider.provider },
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
      ok: true,
      eventName: JOB_EVENTS.importRequested,
    });
    expect(refreshCalls).toEqual([
      expect.objectContaining({
        accessToken: fixtureYahooAccessToken,
        refreshToken: fixtureYahooRefreshToken,
      }),
    ]);
    expect(fixtureProvider.credentials).toEqual([
      expect.objectContaining({ accessToken: fixtureYahooAccessToken }),
      expect.objectContaining({ accessToken: refreshedYahooAccessToken }),
    ]);

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

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(importRequested);
  });
});
