// @vitest-environment node
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { ok } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataCoverage,
  fantasyMatchups,
  fantasyMembers,
  fantasyRosterEntries,
  fantasyTeams,
  leagueSeasonSettings,
  leagues,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  createEspnDiscoveryProvider,
  type EspnFetch,
  type EspnSession,
} from "@/providers/espn/client";
import {
  type FantasyProviderCapabilities,
  ProviderBlockedError,
  type ProviderLeagueRef,
} from "@/providers/model";
import { REALTIME_EVENTS, RecordingRealtimePublisher } from "@/realtime";
import leagueFixture from "../../test/fixtures/espn/league-95050-2026.json";
import { syncCurrentLeague } from "./current-league";
import { stableContentHash } from "./hash";

const marker = `ingesttest-${randomUUID()}`;
const fixtureSwid = "{00000000-0000-4000-8000-000000000001}";
const fixtureEspnS2 = "fixture-session-value"; // ubs:ignore — fake ESPN cookie value for ingestion tests
let handle: DbHandle;

type MutableLeagueFixture = Omit<typeof leagueFixture, "id"> & {
  id: string | number;
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function fixtureSession(): EspnSession {
  return {
    provider: "espn",
    authKind: "cookie",
    subjectProviderId: fixtureSwid,
    swid: fixtureSwid,
    espn_s2: fixtureEspnS2,
  };
}

function fixtureRef(providerLeagueId: string): ProviderLeagueRef {
  return {
    provider: "espn",
    providerId: providerLeagueId,
    season: 2026,
    sport: "ffl",
    name: "NHS Alumni Annual",
  };
}

function leagueFixtureFor(providerLeagueId: string) {
  const fixture = structuredClone(leagueFixture) as MutableLeagueFixture;
  fixture.id = providerLeagueId;
  return fixture;
}

function providerFor(body: unknown) {
  const fetch: EspnFetch = async () => jsonResponse(body);
  return createEspnDiscoveryProvider({ fetch, retryDelayMs: 0 });
}

const rosterProviderCapabilities: FantasyProviderCapabilities = {
  authKind: "cookie",
  dataClasses: {
    league: "full",
    teams: "full",
    members: "full",
    rosters: "full",
    matchups: "full",
    final_standings: "none",
    transactions: "none",
    history: "none",
    divisions: "none",
    keeper_dynasty: "none",
    scoring_detail: "partial",
  },
  requiresOAuth: false,
  supportsHistory: false,
  supportsRosters: true,
  supportsTransactions: false,
};

function rosterCapableProviderFor(
  providerLeagueId: string,
  options: { failRosters?: boolean } = {},
) {
  const ref = fixtureRef(providerLeagueId);
  return {
    capabilities: rosterProviderCapabilities,
    async getLeague() {
      return ok({
        ...ref,
        currentScoringPeriod: 1,
        scoringType: "H2H_POINTS",
        size: 2,
        status: "in_season" as const,
      });
    },
    async getTeams() {
      return ok([
        {
          provider: "espn" as const,
          providerId: "1",
          leagueProviderId: providerLeagueId,
          season: 2026,
          name: "Roster One",
          abbrev: "ONE",
          ownerMemberIds: ["member-1"],
          record: {
            wins: 1,
            losses: 0,
            ties: 0,
            pointsFor: 101,
            pointsAgainst: 99,
          },
        },
        {
          provider: "espn" as const,
          providerId: "2",
          leagueProviderId: providerLeagueId,
          season: 2026,
          name: "Roster Two",
          abbrev: "TWO",
          ownerMemberIds: ["member-2"],
          record: {
            wins: 0,
            losses: 1,
            ties: 0,
            pointsFor: 99,
            pointsAgainst: 101,
          },
        },
      ]);
    },
    async getMembers() {
      return ok([
        {
          provider: "espn" as const,
          providerId: "member-1",
          leagueProviderId: providerLeagueId,
          season: 2026,
          displayName: "Roster Manager One",
          role: "member" as const,
        },
        {
          provider: "espn" as const,
          providerId: "member-2",
          leagueProviderId: providerLeagueId,
          season: 2026,
          displayName: "Roster Manager Two",
          role: "member" as const,
        },
      ]);
    },
    async getMatchups() {
      return ok([
        {
          provider: "espn" as const,
          providerId: "week-1",
          leagueProviderId: providerLeagueId,
          season: 2026,
          scoringPeriod: 1,
          homeTeamRef: {
            provider: "espn" as const,
            providerId: "1",
            season: 2026,
          },
          awayTeamRef: {
            provider: "espn" as const,
            providerId: "2",
            season: 2026,
          },
          homeScore: 101,
          awayScore: 99,
          winner: "home" as const,
          status: "final" as const,
        },
      ]);
    },
    async getRosters() {
      if (options.failRosters) {
        return {
          ok: false as const,
          error: new ProviderBlockedError("espn"),
        };
      }
      return ok([
        {
          teamRef: { provider: "espn" as const, providerId: "1", season: 2026 },
          season: 2026,
          scoringPeriod: 1,
          entries: [
            {
              playerRef: { provider: "espn" as const, providerId: "player-1" },
              slot: "QB",
              status: "active",
              points: 24.2,
            },
          ],
        },
      ]);
    },
  };
}

function edgeCaseProviderFor(providerLeagueId: string) {
  const provider = rosterCapableProviderFor(providerLeagueId);
  return {
    ...provider,
    capabilities: {
      ...provider.capabilities,
      dataClasses: {
        ...provider.capabilities.dataClasses,
        divisions: "full" as const,
        keeper_dynasty: "partial" as const,
      },
    },
    async getLeague() {
      return ok({
        ...fixtureRef(providerLeagueId),
        currentScoringPeriod: 1,
        keeperSettings: {
          isDynasty: false,
          isKeeper: true,
          keeperCount: 2,
          source: "fixture",
        },
        scoringSettings: {
          idp: true,
          rec: 0.5,
          rosterPositions: ["QB", "RB", "LB", "DB", "BN", "TAXI"],
        },
        scoringType: "CUSTOM",
        size: 2,
        status: "in_season" as const,
      });
    },
    async getTeams() {
      const teams = await provider.getTeams();
      if (!teams.ok) {
        return teams;
      }
      return ok(
        teams.value.map((team, index) => ({
          ...team,
          division: index === 0 ? "East" : "West",
        })),
      );
    },
    async getMatchups() {
      const matchups = await provider.getMatchups();
      if (!matchups.ok) {
        return matchups;
      }
      return ok([
        {
          ...matchups.value[0],
          kind: "median" as const,
          providerId: "week-1-median",
        },
      ]);
    },
    async getRosters() {
      const rosters = await provider.getRosters();
      if (!rosters.ok) {
        return rosters;
      }
      return ok([
        {
          ...rosters.value[0],
          entries: rosters.value[0].entries.map((entry) => ({
            ...entry,
            isKeeper: true,
            metadata: { keptSinceSeason: 2025 },
            slot: "LB",
            status: "taxi",
          })),
        },
      ]);
    },
  };
}

async function selectIngestedRows(leagueId: string) {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const coverage = await tx
      .select()
      .from(dataCoverage)
      .where(eq(dataCoverage.leagueId, leagueId))
      .orderBy(asc(dataCoverage.dataClass));
    const teams = await tx
      .select()
      .from(fantasyTeams)
      .where(eq(fantasyTeams.leagueId, leagueId))
      .orderBy(asc(fantasyTeams.providerTeamId));
    const members = await tx
      .select()
      .from(fantasyMembers)
      .where(eq(fantasyMembers.leagueId, leagueId))
      .orderBy(asc(fantasyMembers.providerMemberId));
    const matchups = await tx
      .select()
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.leagueId, leagueId))
      .orderBy(
        asc(fantasyMatchups.scoringPeriod),
        asc(fantasyMatchups.providerMatchupId),
      );
    const rosterEntries = await tx
      .select()
      .from(fantasyRosterEntries)
      .where(eq(fantasyRosterEntries.leagueId, leagueId))
      .orderBy(asc(fantasyRosterEntries.providerPlayerId));
    const [league] = await tx
      .select()
      .from(leagues)
      .where(eq(leagues.id, leagueId))
      .limit(1);
    const settings = await tx
      .select()
      .from(leagueSeasonSettings)
      .where(eq(leagueSeasonSettings.leagueId, leagueId));
    return {
      coverage,
      league,
      matchups,
      members,
      rosterEntries,
      settings,
      teams,
    };
  });
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
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("stableContentHash", () => {
  it("is stable across object key order and absent optional fields", () => {
    expect(
      stableContentHash({
        b: 2,
        optional: undefined,
        a: { z: true, y: "yes" },
      }),
    ).toBe(
      stableContentHash({
        a: { y: "yes", z: true },
        b: 2,
      }),
    );
  });
});

describe("syncCurrentLeague", () => {
  it("upserts the ESPN 95050 fixture and no-ops on a second identical sync", async () => {
    const providerLeagueId = `${marker}-95050-idempotent`;
    const provider = providerFor(leagueFixtureFor(providerLeagueId));

    const first = await syncCurrentLeague({
      db: handle.db,
      provider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;
    expect(first.value.league).toMatchObject({
      provider: "espn",
      providerLeagueId,
      season: 2026,
      changed: 1,
      unchanged: 0,
    });
    expect(first.value.teams).toEqual({ total: 12, changed: 12, unchanged: 0 });
    expect(first.value.members).toEqual({
      total: 16,
      changed: 16,
      unchanged: 0,
    });
    expect(first.value.matchups).toEqual({
      total: 84,
      changed: 84,
      unchanged: 0,
    });

    const firstRows = await selectIngestedRows(first.value.league.id);
    expect(firstRows.teams).toHaveLength(12);
    expect(firstRows.members).toHaveLength(16);
    expect(firstRows.matchups).toHaveLength(84);
    expect(firstRows.rosterEntries).toHaveLength(0);
    expect(
      Object.fromEntries(
        firstRows.coverage.map((row) => [
          row.dataClass,
          {
            capability: row.capability,
            itemCount: row.itemCount,
            status: row.status,
          },
        ]),
      ),
    ).toMatchObject({
      league: { capability: "full", itemCount: 1, status: "complete" },
      teams: { capability: "full", itemCount: 12, status: "complete" },
      members: { capability: "full", itemCount: 16, status: "complete" },
      matchups: { capability: "full", itemCount: 84, status: "complete" },
      rosters: { capability: "none", itemCount: 0, status: "unavailable" },
      transactions: { capability: "none", itemCount: 0, status: "unavailable" },
      history: { capability: "partial", itemCount: 0, status: "stale" },
      scoring_detail: {
        capability: "partial",
        itemCount: 1,
        status: "partial",
      },
    });
    expect(firstRows.teams[0]).toMatchObject({
      provider: "espn",
      providerTeamId: "1",
      leagueProviderId: providerLeagueId,
      season: 2026,
      name: "Fixture Team 01",
      abbrev: "T01",
      ownerMemberIds: ["member-12"],
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
    expect(firstRows.members[0]).toMatchObject({
      providerMemberId: "member-01",
      displayName: "Fixture Manager 01",
      role: "member",
    });
    expect(firstRows.matchups[0]).toMatchObject({
      providerMatchupId: "1",
      scoringPeriod: 1,
      homeTeamProviderId: "7",
      awayTeamProviderId: "5",
      homeScore: 0,
      awayScore: 0,
      winner: "unknown",
      status: "scheduled",
    });
    expect(firstRows.teams[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    const firstTeamUpdatedAt = firstRows.teams[0].updatedAt.toISOString();

    const second = await syncCurrentLeague({
      db: handle.db,
      provider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.league).toMatchObject({ changed: 0, unchanged: 1 });
    expect(second.value.teams).toEqual({
      total: 12,
      changed: 0,
      unchanged: 12,
    });
    expect(second.value.members).toEqual({
      total: 16,
      changed: 0,
      unchanged: 16,
    });
    expect(second.value.matchups).toEqual({
      total: 84,
      changed: 0,
      unchanged: 84,
    });
    expect(second.value.league.id).toBe(first.value.league.id);

    const secondRows = await selectIngestedRows(first.value.league.id);
    expect(secondRows.teams).toHaveLength(12);
    expect(secondRows.members).toHaveLength(16);
    expect(secondRows.matchups).toHaveLength(84);
    expect(secondRows.teams[0].updatedAt.toISOString()).toBe(
      firstTeamUpdatedAt,
    );
  });

  it("updates changed normalized fields without creating duplicates", async () => {
    const providerLeagueId = `${marker}-95050-update`;
    const firstProvider = providerFor(leagueFixtureFor(providerLeagueId));

    const first = await syncCurrentLeague({
      db: handle.db,
      provider: firstProvider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;

    const changedFixture = leagueFixtureFor(providerLeagueId);
    changedFixture.teams[0].name = "Fixture Team 01 Renamed";
    const second = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(changedFixture),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.league).toMatchObject({ changed: 0, unchanged: 1 });
    expect(second.value.teams).toEqual({
      total: 12,
      changed: 1,
      unchanged: 11,
    });
    expect(second.value.members).toEqual({
      total: 16,
      changed: 0,
      unchanged: 16,
    });
    expect(second.value.matchups).toEqual({
      total: 84,
      changed: 0,
      unchanged: 84,
    });

    const rows = await selectIngestedRows(first.value.league.id);
    expect(rows.teams).toHaveLength(12);
    expect(rows.teams[0]).toMatchObject({
      providerTeamId: "1",
      name: "Fixture Team 01 Renamed",
    });
  });

  it("persists supported roster entries and records complete coverage", async () => {
    const providerLeagueId = `${marker}-rosters`;
    const synced = await syncCurrentLeague({
      db: handle.db,
      provider: rosterCapableProviderFor(providerLeagueId),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(synced.ok).toBe(true);
    if (!synced.ok) throw synced.error;
    expect(synced.value.rosters).toEqual({
      total: 1,
      changed: 1,
      unchanged: 0,
    });

    const rows = await selectIngestedRows(synced.value.league.id);
    expect(rows.rosterEntries).toHaveLength(1);
    expect(rows.rosterEntries[0]).toMatchObject({
      leagueProviderId: providerLeagueId,
      providerTeamId: "1",
      providerPlayerId: "player-1",
      scoringPeriod: 1,
      slot: "QB",
      status: "active",
      points: 24.2,
    });
    const rosterCoverage = rows.coverage.find(
      (coverage) => coverage.dataClass === "rosters",
    );
    expect(rosterCoverage).toMatchObject({
      capability: "full",
      itemCount: 1,
      status: "complete",
    });
  });

  it("persists edge-case scoring, keeper, division, roster, and matchup metadata", async () => {
    const providerLeagueId = `${marker}-edge-cases`;
    const synced = await syncCurrentLeague({
      db: handle.db,
      provider: edgeCaseProviderFor(providerLeagueId),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(synced.ok).toBe(true);
    if (!synced.ok) throw synced.error;

    const rows = await selectIngestedRows(synced.value.league.id);
    expect(rows.league).toMatchObject({
      providerLeagueId,
      scoringSettings: {
        idp: true,
        rec: 0.5,
        rosterPositions: ["QB", "RB", "LB", "DB", "BN", "TAXI"],
      },
      scoringType: "CUSTOM",
    });
    expect(rows.settings[0]).toMatchObject({
      isDynastyLeague: false,
      isKeeperLeague: true,
      keeperSettings: {
        isKeeper: true,
        keeperCount: 2,
        source: "fixture",
      },
      scoringSettings: {
        idp: true,
        rec: 0.5,
      },
    });
    expect(rows.teams.map((team) => team.division)).toEqual(["East", "West"]);
    expect(rows.matchups[0]).toMatchObject({
      kind: "median",
      providerMatchupId: "week-1-median",
    });
    expect(rows.rosterEntries[0]).toMatchObject({
      isKeeper: true,
      metadata: { keptSinceSeason: 2025 },
      slot: "LB",
      status: "taxi",
    });
    expect(
      Object.fromEntries(
        rows.coverage.map((row) => [
          row.dataClass,
          {
            itemCount: row.itemCount,
            status: row.status,
          },
        ]),
      ),
    ).toMatchObject({
      divisions: { itemCount: 2, status: "complete" },
      keeper_dynasty: { itemCount: 2, status: "complete" },
      scoring_detail: { itemCount: 1, status: "partial" },
    });
  });

  it("keeps core sync data when an optional roster class fails", async () => {
    const providerLeagueId = `${marker}-rosters-error`;
    const synced = await syncCurrentLeague({
      db: handle.db,
      provider: rosterCapableProviderFor(providerLeagueId, {
        failRosters: true,
      }),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(synced.ok).toBe(true);
    if (!synced.ok) throw synced.error;
    expect(synced.value.teams).toEqual({ total: 2, changed: 2, unchanged: 0 });
    expect(synced.value.rosters).toEqual({
      total: 0,
      changed: 0,
      unchanged: 0,
    });

    const rows = await selectIngestedRows(synced.value.league.id);
    expect(rows.teams).toHaveLength(2);
    expect(rows.rosterEntries).toHaveLength(0);
    const rosterCoverage = rows.coverage.find(
      (coverage) => coverage.dataClass === "rosters",
    );
    expect(rosterCoverage).toMatchObject({
      capability: "full",
      errorCode: "PROVIDER_BLOCKED",
      itemCount: 0,
      status: "error",
    });
  });

  it("publishes scores.updated after changed matchup rows commit", async () => {
    const providerLeagueId = `${marker}-95050-scores`;
    const firstProvider = providerFor(leagueFixtureFor(providerLeagueId));

    const first = await syncCurrentLeague({
      db: handle.db,
      provider: firstProvider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;

    const changedFixture = leagueFixtureFor(providerLeagueId);
    changedFixture.schedule[0].home.totalPoints = 17.5;
    const realtime = new RecordingRealtimePublisher();
    const now = new Date("2026-06-12T12:00:00.000Z");
    const second = await syncCurrentLeague({
      db: handle.db,
      now: () => now,
      provider: providerFor(changedFixture),
      realtime,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.matchups).toEqual({
      total: 84,
      changed: 1,
      unchanged: 83,
    });

    const rows = await selectIngestedRows(first.value.league.id);
    const changedMatchup = rows.matchups.find(
      (matchup) =>
        matchup.providerMatchupId === "1" && matchup.scoringPeriod === 1,
    );
    expect(changedMatchup).toMatchObject({
      homeScore: 17.5,
    });
    if (!changedMatchup) throw new Error("expected changed matchup row");

    expect(realtime.scoresUpdated).toEqual([
      {
        at: now.toISOString(),
        leagueId: first.value.league.id,
        matchupIds: [changedMatchup.id],
        scoringPeriod: 1,
        type: REALTIME_EVENTS.scoresUpdated,
        v: 1,
      },
    ]);

    const third = await syncCurrentLeague({
      db: handle.db,
      now: () => new Date("2026-06-12T12:01:00.000Z"),
      provider: providerFor(changedFixture),
      realtime,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(third.ok).toBe(true);
    if (!third.ok) throw third.error;
    expect(third.value.matchups).toEqual({
      total: 84,
      changed: 0,
      unchanged: 84,
    });
    expect(realtime.scoresUpdated).toHaveLength(1);
  });
});
