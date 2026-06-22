// @vitest-environment node
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { err, ok } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataCoverage,
  dataIntegrityChecks,
  fantasyMatchups,
  fantasyMembers,
  fantasyRosterEntries,
  fantasyTeams,
  fantasyTransactions,
  leagueSeasonSettings,
  leagues,
  persons,
  statsCalculations,
  teamSeasons,
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
    async getTransactions() {
      return ok([]);
    },
  };
}

function transactionCapableProviderFor(
  providerLeagueId: string,
  type: "add" | "drop" | "trade" | "waiver" = "waiver",
) {
  const provider = rosterCapableProviderFor(providerLeagueId);
  return {
    ...provider,
    capabilities: {
      ...provider.capabilities,
      dataClasses: {
        ...provider.capabilities.dataClasses,
        transactions: "full" as const,
      },
      supportsTransactions: true,
    },
    async getTransactions() {
      return ok([
        {
          details: { priority: 3, source: "current-sync-fixture" },
          leagueProviderId: providerLeagueId,
          playerRefs: [{ provider: "espn" as const, providerId: "player-1" }],
          provider: "espn" as const,
          providerId: `${providerLeagueId}-transaction-1`,
          season: 2026,
          teamRefs: [
            { provider: "espn" as const, providerId: "1", season: 2026 },
          ],
          timestamp: new Date("2026-09-10T12:00:00.000Z"),
          type,
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
        {
          ...matchups.value[0],
          awayScore: 210,
          homeScore: 230,
          periodStart: 14,
          providerId: "two-week-final",
          scoringPeriod: 14,
          scoringPeriodSpan: 2,
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
    const personRows = await tx
      .select()
      .from(persons)
      .where(eq(persons.leagueId, leagueId))
      .orderBy(asc(persons.canonicalName));
    const teamSeasonRows = await tx
      .select()
      .from(teamSeasons)
      .where(eq(teamSeasons.leagueId, leagueId))
      .orderBy(asc(teamSeasons.season), asc(teamSeasons.providerTeamId));
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
    const transactions = await tx
      .select()
      .from(fantasyTransactions)
      .where(eq(fantasyTransactions.leagueId, leagueId))
      .orderBy(asc(fantasyTransactions.providerTransactionId));
    const [league] = await tx
      .select()
      .from(leagues)
      .where(eq(leagues.id, leagueId))
      .limit(1);
    const settings = await tx
      .select()
      .from(leagueSeasonSettings)
      .where(eq(leagueSeasonSettings.leagueId, leagueId));
    const integrityChecks = await tx
      .select()
      .from(dataIntegrityChecks)
      .where(eq(dataIntegrityChecks.leagueId, leagueId))
      .orderBy(asc(dataIntegrityChecks.createdAt));
    return {
      coverage,
      integrityChecks,
      league,
      matchups,
      members,
      persons: personRows,
      rosterEntries,
      settings,
      teams,
      teamSeasons: teamSeasonRows,
      transactions,
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
    const fixture = leagueFixtureFor(providerLeagueId);
    Object.assign(fixture.settings.scheduleSettings, {
      playoffMatchupPeriodLength: 1,
    });
    Object.assign(fixture.settings as Record<string, unknown>, {
      acquisitionSettings: {
        acquisitionBudget: 100,
        acquisitionType: "FREE_AGENT_BUDGET",
      },
      rosterSettings: {
        lineupSlotCounts: {
          "0": 1,
          "2": 2,
          "4": 2,
          "6": 1,
          "16": 1,
          "17": 1,
          "20": 7,
          "23": 1,
        },
      },
      scoringSettings: {
        scoringItems: [{ points: 0.1, statId: 3 }],
        scoringType: "H2H_POINTS",
      },
    });
    const displayNameMember = fixture.members.find(
      (member) => member.id === "member-12",
    );
    const fallbackNameMember = fixture.members.find(
      (member) => member.id === "member-01",
    );
    if (!displayNameMember || !fallbackNameMember) {
      throw new Error("expected current member fixtures were not found");
    }
    displayNameMember.displayName = "Real Display Manager";
    displayNameMember.firstName = "Ignored";
    displayNameMember.lastName = "Display";
    fallbackNameMember.displayName = " ";
    fallbackNameMember.firstName = "Fallback";
    fallbackNameMember.lastName = "Current Manager";
    const provider = providerFor(fixture);

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
    expect(firstRows.persons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalName: "Fallback Current Manager" }),
        expect.objectContaining({ canonicalName: "Real Display Manager" }),
      ]),
    );
    expect(firstRows.teamSeasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerNames: ["Real Display Manager"],
          providerTeamId: "1",
        }),
        expect.objectContaining({
          ownerNames: ["Fallback Current Manager"],
          providerTeamId: "8",
        }),
      ]),
    );
    expect(firstRows.rosterEntries).toHaveLength(0);
    expect(firstRows.settings).toHaveLength(1);
    expect(firstRows.settings[0]).toMatchObject({
      acquisitionBudget: 100,
      acquisitionSettings: {
        acquisitionBudget: 100,
        acquisitionType: "FREE_AGENT_BUDGET",
      },
      acquisitionType: "FREE_AGENT_BUDGET",
      lineupSlotCounts: {
        "0": 1,
        "2": 2,
        "4": 2,
        "6": 1,
        "16": 1,
        "17": 1,
        "20": 7,
        "23": 1,
      },
      leagueSize: 12,
      matchupPeriodCount: 14,
      playoffMatchupPeriodLength: 1,
      playoffTeamCount: 6,
      regularSeasonEndScoringPeriod: 14,
      scoringSettings: {
        scoringItems: [{ points: 0.1, statId: 3 }],
        scoringType: "H2H_POINTS",
      },
      scoringType: "H2H_POINTS",
      season: 2026,
    });
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
      displayName: "Fallback Current Manager",
      role: "member",
    });
    expect(firstRows.matchups[0]).toMatchObject({
      providerMatchupId: "1",
      periodStart: 1,
      scoringPeriod: 1,
      scoringPeriodSpan: 1,
      homeTeamProviderId: "7",
      awayTeamProviderId: "5",
      homeScore: 0,
      awayScore: 0,
      winner: "unknown",
      status: "scheduled",
    });
    expect(firstRows.teams[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    const firstTeamUpdatedAt = firstRows.teams[0].updatedAt.toISOString();
    const firstSettingsUpdatedAt =
      firstRows.settings[0].updatedAt.toISOString();

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
    expect(secondRows.settings[0].updatedAt.toISOString()).toBe(
      firstSettingsUpdatedAt,
    );
  });

  it("persists current transactions and no-ops on an identical re-ingest", async () => {
    const providerLeagueId = `${marker}-current-transactions`;
    const provider = transactionCapableProviderFor(providerLeagueId, "waiver");

    const first = await syncCurrentLeague({
      dataClasses: ["league", "teams", "members", "transactions"],
      db: handle.db,
      provider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;
    expect(first.value.transactions).toEqual({
      changed: 1,
      total: 1,
      unchanged: 0,
    });
    expect(first.value.changedTransactions).toEqual([
      { id: expect.any(String), type: "waiver" },
    ]);

    const firstRows = await selectIngestedRows(first.value.league.id);
    expect(firstRows.transactions).toHaveLength(1);
    expect(firstRows.transactions[0]).toMatchObject({
      details: { priority: 3, source: "current-sync-fixture" },
      providerTransactionId: `${providerLeagueId}-transaction-1`,
      type: "waiver",
    });
    expect(firstRows.transactions[0]?.id).toBe(
      first.value.changedTransactions[0]?.id,
    );
    const firstCoverage = new Map(
      firstRows.coverage.map((row) => [row.dataClass, row]),
    );
    expect(firstCoverage.get("transactions")).toMatchObject({
      capability: "full",
      itemCount: 1,
      status: "complete",
    });

    const second = await syncCurrentLeague({
      dataClasses: ["league", "teams", "members", "transactions"],
      db: handle.db,
      provider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.league.id).toBe(first.value.league.id);
    expect(second.value.transactions).toEqual({
      changed: 0,
      total: 1,
      unchanged: 1,
    });
    expect(second.value.changedTransactions).toEqual([]);
  });

  it("uses explicit data classes to avoid broad provider fetches", async () => {
    const providerLeagueId = `${marker}-narrow-current`;
    const fullProvider = rosterCapableProviderFor(providerLeagueId);
    const first = await syncCurrentLeague({
      db: handle.db,
      provider: fullProvider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;

    const beforeRows = await selectIngestedRows(first.value.league.id);
    const beforeCoverage = new Map(
      beforeRows.coverage.map((row) => [row.dataClass, row]),
    );
    const calls: string[] = [];
    const baseProvider = rosterCapableProviderFor(providerLeagueId);
    const narrowProvider = {
      capabilities: baseProvider.capabilities,
      async getLeague() {
        calls.push("league");
        return err(new ProviderBlockedError("espn"));
      },
      async getTeams() {
        calls.push("teams");
        return err(new ProviderBlockedError("espn"));
      },
      async getMembers() {
        calls.push("members");
        return err(new ProviderBlockedError("espn"));
      },
      async getRosters() {
        calls.push("rosters");
        return err(new ProviderBlockedError("espn"));
      },
      async getMatchups(
        _session: EspnSession,
        _ref: ProviderLeagueRef,
        scoringPeriod?: number,
      ) {
        calls.push(`matchups:${scoringPeriod ?? "all"}`);
        return baseProvider.getMatchups();
      },
      async getTransactions() {
        calls.push("transactions");
        return err(new ProviderBlockedError("espn"));
      },
    };

    const narrow = await syncCurrentLeague({
      currentScoringPeriod: 1,
      dataClasses: ["matchups"],
      db: handle.db,
      leagueId: first.value.league.id,
      provider: narrowProvider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(narrow.ok).toBe(true);
    if (!narrow.ok) throw narrow.error;
    expect(calls).toEqual(["matchups:1"]);
    expect(narrow.value).toMatchObject({
      league: { changed: 0, id: first.value.league.id, unchanged: 1 },
      matchups: { total: 1 },
      members: { total: 0 },
      rosters: { total: 0 },
      teams: { total: 0 },
    });

    const afterRows = await selectIngestedRows(first.value.league.id);
    const afterCoverage = new Map(
      afterRows.coverage.map((row) => [row.dataClass, row]),
    );
    expect(afterCoverage.get("teams")).toMatchObject({
      itemCount: beforeCoverage.get("teams")?.itemCount,
      status: "complete",
    });
    expect(afterCoverage.get("members")).toMatchObject({
      itemCount: beforeCoverage.get("members")?.itemCount,
      status: "complete",
    });
    expect(afterCoverage.get("rosters")).toMatchObject({
      itemCount: beforeCoverage.get("rosters")?.itemCount,
      status: "complete",
    });
    expect(afterCoverage.get("matchups")).toMatchObject({
      itemCount: 1,
      status: "complete",
    });
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
      matchupPeriodCount: 1,
      scoringSettings: {
        idp: true,
        rec: 0.5,
      },
    });
    expect(rows.teams.map((team) => team.division)).toEqual(["East", "West"]);
    expect(rows.matchups[0]).toMatchObject({
      kind: "median",
      periodStart: 1,
      providerMatchupId: "week-1-median",
      scoringPeriodSpan: 1,
    });
    expect(
      rows.matchups.find(
        (matchup) => matchup.providerMatchupId === "two-week-final",
      ),
    ).toMatchObject({
      homeScore: 230,
      periodStart: 14,
      scoringPeriod: 14,
      scoringPeriodSpan: 2,
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

  it("preserves finalized matchups when a provider rereads transient non-final data", async () => {
    const providerLeagueId = `${marker}-95050-finalized-preserve`;

    const first = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(leagueFixtureFor(providerLeagueId)),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;

    const finalizedFixture = leagueFixtureFor(providerLeagueId);
    finalizedFixture.schedule[0].winner = "HOME";
    finalizedFixture.schedule[0].home.totalPoints = 121;
    finalizedFixture.schedule[0].away.totalPoints = 99;

    const second = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(finalizedFixture),
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

    const staleFixture = leagueFixtureFor(providerLeagueId);
    staleFixture.schedule[0].home.totalPoints = 64;
    staleFixture.schedule[0].away.totalPoints = 59;

    const third = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(staleFixture),
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

    const rows = await selectIngestedRows(first.value.league.id);
    const matchup = rows.matchups.find(
      (row) => row.providerMatchupId === "1" && row.scoringPeriod === 1,
    );
    expect(matchup).toMatchObject({
      awayScore: 99,
      homeScore: 121,
      status: "final",
      winner: "home",
    });
    const finalizedRegressionChecks = rows.integrityChecks.filter(
      (row) => row.checkKey === "finalized_state_regression",
    );
    expect(finalizedRegressionChecks).toHaveLength(1);
    expect(finalizedRegressionChecks[0]).toMatchObject({
      season: 2026,
      status: "fail",
    });
    expect(finalizedRegressionChecks[0]?.detail).toMatchObject({
      entity: "fantasy_matchup",
      incoming: {
        awayScore: 59,
        homeScore: 64,
        status: "scheduled",
      },
      leagueProviderId: providerLeagueId,
      persisted: {
        awayScore: 99,
        homeScore: 121,
        status: "final",
      },
      provider: "espn",
      providerMatchupId: "1",
      reason: "provider attempted to downgrade a finalized matchup",
      scoringPeriod: 1,
    });

    const calculations = await withLeagueContext(
      handle.db,
      first.value.league.id,
      (tx) =>
        tx
          .select()
          .from(statsCalculations)
          .where(eq(statsCalculations.leagueId, first.value.league.id)),
    );
    expect(calculations.map((row) => row.calculationType).sort()).toEqual([
      "head_to_head",
      "records",
      "season",
    ]);

    const repeatedStale = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(staleFixture),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(repeatedStale.ok).toBe(true);
    if (!repeatedStale.ok) throw repeatedStale.error;
    expect(repeatedStale.value.matchups).toEqual({
      total: 84,
      changed: 0,
      unchanged: 84,
    });
    const repeatedRows = await selectIngestedRows(first.value.league.id);
    expect(
      repeatedRows.integrityChecks.filter(
        (row) => row.checkKey === "finalized_state_regression",
      ),
    ).toHaveLength(1);
  });

  it("allows finalized matchup score corrections to update and publish", async () => {
    const providerLeagueId = `${marker}-95050-finalized-correction`;

    const first = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(leagueFixtureFor(providerLeagueId)),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;

    const finalizedFixture = leagueFixtureFor(providerLeagueId);
    finalizedFixture.schedule[0].winner = "HOME";
    finalizedFixture.schedule[0].home.totalPoints = 121;
    finalizedFixture.schedule[0].away.totalPoints = 99;
    const finalized = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(finalizedFixture),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) throw finalized.error;
    expect(finalized.value.matchups).toEqual({
      total: 84,
      changed: 1,
      unchanged: 83,
    });

    const correctedFixture = leagueFixtureFor(providerLeagueId);
    correctedFixture.schedule[0].winner = "HOME";
    correctedFixture.schedule[0].home.totalPoints = 122.5;
    correctedFixture.schedule[0].away.totalPoints = 98.5;
    const realtime = new RecordingRealtimePublisher();
    const now = new Date("2026-06-12T12:02:00.000Z");
    const corrected = await syncCurrentLeague({
      db: handle.db,
      now: () => now,
      provider: providerFor(correctedFixture),
      realtime,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) throw corrected.error;
    expect(corrected.value.matchups).toEqual({
      total: 84,
      changed: 1,
      unchanged: 83,
    });
    expect(corrected.value.changedFinalMatchups).toEqual([
      {
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        id: expect.any(String),
      },
    ]);

    const rows = await selectIngestedRows(first.value.league.id);
    const matchup = rows.matchups.find(
      (row) => row.providerMatchupId === "1" && row.scoringPeriod === 1,
    );
    expect(matchup).toMatchObject({
      awayScore: 98.5,
      homeScore: 122.5,
      status: "final",
      winner: "home",
    });
    if (!matchup) throw new Error("expected corrected matchup row");
    expect(corrected.value.changedFinalMatchups[0]?.id).toBe(matchup.id);
    expect(corrected.value.changedFinalMatchups[0]?.contentHash).toBe(
      matchup.contentHash,
    );
    expect(
      rows.integrityChecks.filter(
        (row) => row.checkKey === "finalized_state_regression",
      ),
    ).toHaveLength(0);
    expect(realtime.scoresUpdated).toEqual([
      {
        at: now.toISOString(),
        leagueId: first.value.league.id,
        matchupIds: [matchup.id],
        scoringPeriod: 1,
        type: REALTIME_EVENTS.scoresUpdated,
        v: 1,
      },
    ]);
  });

  it("preserves completed league seasons when a provider rereads them as active", async () => {
    const providerLeagueId = `${marker}-95050-complete-preserve`;
    const completeFixture = leagueFixtureFor(providerLeagueId);
    completeFixture.status.isActive = false;
    completeFixture.status.isExpired = true;

    const first = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(completeFixture),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;
    expect(first.value.league).toMatchObject({ changed: 1, unchanged: 0 });

    const rereadFixture = leagueFixtureFor(providerLeagueId);
    const second = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(rereadFixture),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.league).toMatchObject({ changed: 0, unchanged: 1 });

    const rows = await selectIngestedRows(first.value.league.id);
    expect(rows.league).toMatchObject({
      providerLeagueId,
      status: "complete",
    });
    const finalizedRegressionChecks = rows.integrityChecks.filter(
      (row) => row.checkKey === "finalized_state_regression",
    );
    expect(finalizedRegressionChecks).toHaveLength(1);
    expect(finalizedRegressionChecks[0]).toMatchObject({
      season: 2026,
      status: "fail",
    });
    expect(finalizedRegressionChecks[0]?.detail).toMatchObject({
      entity: "league",
      incoming: {
        status: "preseason",
      },
      leagueProviderId: providerLeagueId,
      persisted: {
        status: "complete",
      },
      provider: "espn",
      reason: "provider attempted to downgrade a completed season",
    });
  });

  it("runs targeted stats recompute only when changed matchup rows are finalized", async () => {
    const providerLeagueId = `${marker}-95050-finalized-stats`;
    const firstProvider = providerFor(leagueFixtureFor(providerLeagueId));

    const first = await syncCurrentLeague({
      db: handle.db,
      provider: firstProvider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;

    const initialCalculations = await withLeagueContext(
      handle.db,
      first.value.league.id,
      (tx) =>
        tx
          .select()
          .from(statsCalculations)
          .where(eq(statsCalculations.leagueId, first.value.league.id)),
    );
    expect(initialCalculations).toHaveLength(0);

    const finalizedFixture = leagueFixtureFor(providerLeagueId);
    finalizedFixture.schedule[0].winner = "HOME";
    finalizedFixture.schedule[0].home.totalPoints = 121;
    finalizedFixture.schedule[0].away.totalPoints = 99;

    const second = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(finalizedFixture),
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

    const calculations = await withLeagueContext(
      handle.db,
      first.value.league.id,
      (tx) =>
        tx
          .select({
            calculationType: statsCalculations.calculationType,
            metadata: statsCalculations.metadata,
          })
          .from(statsCalculations)
          .where(eq(statsCalculations.leagueId, first.value.league.id))
          .orderBy(asc(statsCalculations.startedAt)),
    );
    expect(calculations.map((row) => row.calculationType).sort()).toEqual([
      "head_to_head",
      "records",
      "season",
    ]);
    const seasonCalculation = calculations.find(
      (row) => row.calculationType === "season",
    );
    expect(seasonCalculation?.metadata).toMatchObject({
      seasons: [2026],
      trigger: "changed_finalized_matchup",
    });

    const third = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(finalizedFixture),
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

    const afterNoopCalculations = await withLeagueContext(
      handle.db,
      first.value.league.id,
      (tx) =>
        tx
          .select()
          .from(statsCalculations)
          .where(eq(statsCalculations.leagueId, first.value.league.id)),
    );
    expect(
      afterNoopCalculations.map((row) => row.calculationType).sort(),
    ).toEqual(["head_to_head", "records", "season"]);
  });
});
