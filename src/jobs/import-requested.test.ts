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
import { AuthExpiredError, type NormalizedSeasonBundle } from "@/providers";
import type {
  EspnCookieCredentials,
  EspnSession,
} from "@/providers/espn/client";
import type {
  SleeperCredentials,
  SleeperSession,
} from "@/providers/sleeper/client";
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

let handle: DbHandle;
let cipher: CredentialCipher;

interface SeededImport {
  credentialId: string;
  leagueId: string;
  provider: "espn" | "sleeper";
  providerLeagueId: string;
  userId: string;
}

function connectionFlowFor(provider: SeededImport["provider"]) {
  switch (provider) {
    case "espn":
      return "manual";
    case "sleeper":
      return "public";
  }
}

interface ImportProvider {
  calls: number[];
  credentials: EspnCookieCredentials[];
  provider: {
    authenticate(
      credentials: EspnCookieCredentials,
    ): Promise<
      { ok: true; value: EspnSession } | { ok: false; error: AuthExpiredError }
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

function historyProvider({
  authExpired = false,
}: {
  authExpired?: boolean;
} = {}): ImportProvider {
  const calls: number[] = [];
  const credentials: EspnCookieCredentials[] = [];
  return {
    calls,
    credentials,
    provider: {
      async authenticate(input) {
        credentials.push(input);
        if (authExpired) {
          return err(new AuthExpiredError("espn"));
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
    provider?: "espn" | "sleeper";
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

    return { checkpoint, matchups, members: membersRows, teams };
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
    expect(rows.checkpoint).toMatchObject({
      status: "completed",
      seasonsCompleted: 2,
      seasonsTotal: 2,
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

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(importRequested);
  });
});
