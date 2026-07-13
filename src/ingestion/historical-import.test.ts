// @vitest-environment node
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { err, ok } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataCapabilityObservations,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  fantasyTransactions,
  historicalImportCheckpoints,
  leagueSeasonSettings,
  leagues,
  providerFinalStandings,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  type FantasyProviderCapabilities,
  type FantasyProviderSession,
  type NormalizedSeasonBundle,
  ProviderBlockedError,
  type ProviderLeagueRef,
} from "@/providers";
import { REALTIME_EVENTS, RecordingRealtimePublisher } from "@/realtime";
import {
  type HistoricalImportProvider,
  importLeagueHistory,
} from "./historical-import";

const marker = `historytest-${randomUUID()}`;
let handle: DbHandle;

interface FixtureSession extends FantasyProviderSession {
  provider: "espn";
  authKind: "cookie";
  subjectProviderId: "history-fixture-user";
}

const fixtureSession: FixtureSession = {
  provider: "espn",
  authKind: "cookie",
  subjectProviderId: "history-fixture-user",
};

const fixtureCapabilities: FantasyProviderCapabilities = {
  authKind: "cookie",
  dataClasses: {
    league: "full",
    teams: "full",
    members: "full",
    rosters: "none",
    matchups: "full",
    final_standings: "full",
    transactions: "full",
    history: "full",
    divisions: "none",
    keeper_dynasty: "none",
    scoring_detail: "partial",
  },
  requiresOAuth: false,
  supportsHistory: true,
  supportsRosters: false,
  supportsTransactions: true,
};

function fixtureRef(tag: string): ProviderLeagueRef {
  return {
    provider: "espn",
    providerId: `${marker}-${tag}`,
    season: 2026,
    sport: "ffl",
    name: `${marker} ${tag}`,
    size: 2,
  };
}

function bundleFor(
  ref: ProviderLeagueRef,
  season: number,
): NormalizedSeasonBundle {
  return {
    league: {
      ...ref,
      acquisitionSettings: {
        acquisitionBudget: 100,
        acquisitionType:
          season <= 2012 ? "WAIVERS_TRADITIONAL" : "FREE_AGENT_BUDGET",
        source: "fixture",
      },
      currentScoringPeriod: 14,
      rosterSettings: {
        lineupSlotCounts:
          season <= 2012
            ? {
                "0": 1,
                "2": 2,
                "4": 2,
                "6": 1,
                "7": 1,
                "16": 1,
                "17": 1,
                "20": 6,
              }
            : {
                "0": 1,
                "2": 2,
                "4": 2,
                "6": 1,
                "16": 1,
                "17": 1,
                "20": 7,
                "23": 1,
              },
        source: "fixture",
      },
      scoringSettings: {
        scoringItems: [{ points: 0.1, statId: 3 }],
        scoringType: "H2H_POINTS",
      },
      scoringType: "H2H_POINTS",
      season,
      size: ref.size ?? 2,
      status: "complete",
      postseason: {
        championshipScoringPeriod: 3,
        matchupPeriodCount: 1,
        playoffMatchupPeriodLength: season <= 2012 ? 2 : 1,
        playoffStartScoringPeriod: 2,
        playoffTeamCount: 2,
        regularSeasonEndScoringPeriod: 1,
      },
    },
    teams: [
      {
        provider: "espn",
        providerId: "1",
        leagueProviderId: ref.providerId,
        season,
        name: `Fixture One ${season}`,
        abbrev: "ONE",
        ownerMemberIds: [`owner-one-${season}`],
        record: {
          wins: 1,
          losses: 0,
          ties: 0,
          pointsFor: 110 + (2026 - season),
          pointsAgainst: 95,
        },
      },
      {
        provider: "espn",
        providerId: "2",
        leagueProviderId: ref.providerId,
        season,
        name: `Fixture Two ${season}`,
        abbrev: "TWO",
        ownerMemberIds: [`owner-two-${season}`],
        record: {
          wins: 0,
          losses: 1,
          ties: 0,
          pointsFor: 95,
          pointsAgainst: 110 + (2026 - season),
        },
      },
    ],
    members: [
      {
        provider: "espn",
        providerId: `owner-one-${season}`,
        leagueProviderId: ref.providerId,
        season,
        displayName: `Owner One ${season}`,
        role: "member",
      },
      {
        provider: "espn",
        providerId: `owner-two-${season}`,
        leagueProviderId: ref.providerId,
        season,
        displayName: `Owner Two ${season}`,
        role: "member",
      },
    ],
    matchups: [
      {
        provider: "espn",
        providerId: "matchup-1",
        leagueProviderId: ref.providerId,
        season,
        scoringPeriod: 1,
        homeTeamRef: { provider: "espn", providerId: "1", season },
        awayTeamRef: { provider: "espn", providerId: "2", season },
        homeScore: 110 + (2026 - season),
        awayScore: 95,
        winner: "home",
        status: "final",
      },
    ],
    finalStandings: [
      {
        leagueProviderId: ref.providerId,
        teamRef: { provider: "espn", providerId: "2", season },
        rank: 1,
        playoffSeed: 2,
        wins: 0,
        losses: 1,
        ties: 0,
        pointsFor: 95,
        pointsAgainst: 110 + (2026 - season),
      },
      {
        leagueProviderId: ref.providerId,
        teamRef: { provider: "espn", providerId: "1", season },
        rank: 2,
        playoffSeed: 1,
        wins: 1,
        losses: 0,
        ties: 0,
        pointsFor: 110 + (2026 - season),
        pointsAgainst: 95,
      },
    ],
    transactions: [
      {
        provider: "espn",
        providerId: `transaction-${season}`,
        leagueProviderId: ref.providerId,
        season,
        type: "waiver",
        teamRefs: [{ provider: "espn", providerId: "1", season }],
        playerRefs: [{ provider: "espn", providerId: `player-${season}` }],
        timestamp: new Date(`${season}-09-10T12:00:00.000Z`),
        details: { budgetCents: 1200 },
      },
    ],
  };
}

function providerFor({
  emptyOnSeason,
  failOnSeason,
}: {
  emptyOnSeason?: number;
  failOnSeason?: number;
} = {}): {
  calls: number[];
  provider: HistoricalImportProvider<FixtureSession>;
} {
  const calls: number[] = [];
  return {
    calls,
    provider: {
      capabilities: fixtureCapabilities,
      async getHistory(_session, ref, options) {
        const season = options.seasons[0];
        if (season === undefined) {
          return ok([]);
        }

        calls.push(season);
        if (season === failOnSeason) {
          return err(new ProviderBlockedError("espn"));
        }
        if (season === emptyOnSeason) {
          return ok([]);
        }

        return ok([bundleFor(ref, season)]);
      },
    },
  };
}

async function selectHistoricalRows(leagueId: string) {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const coverage = await tx
      .select({
        capability: dataCapabilityObservations.availability,
        dataClass: dataCapabilityObservations.dataClass,
        details: dataCapabilityObservations.details,
        itemCount: dataCapabilityObservations.rowCount,
        providerSupport: dataCapabilityObservations.providerSupport,
        providerVerdict: dataCapabilityObservations.providerVerdict,
        season: dataCapabilityObservations.season,
        status: dataCapabilityObservations.status,
      })
      .from(dataCapabilityObservations)
      .where(eq(dataCapabilityObservations.leagueId, leagueId))
      .orderBy(
        asc(dataCapabilityObservations.season),
        asc(dataCapabilityObservations.dataClass),
        asc(dataCapabilityObservations.probedAt),
      );
    const teams = await tx
      .select()
      .from(fantasyTeams)
      .where(eq(fantasyTeams.leagueId, leagueId))
      .orderBy(asc(fantasyTeams.season), asc(fantasyTeams.providerTeamId));
    const members = await tx
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
    const finalStandings = await tx
      .select()
      .from(providerFinalStandings)
      .where(eq(providerFinalStandings.leagueId, leagueId))
      .orderBy(
        asc(providerFinalStandings.season),
        asc(providerFinalStandings.finalRank),
      );
    const transactions = await tx
      .select()
      .from(fantasyTransactions)
      .where(eq(fantasyTransactions.leagueId, leagueId))
      .orderBy(asc(fantasyTransactions.season));
    const seasonSettings = await tx
      .select()
      .from(leagueSeasonSettings)
      .where(eq(leagueSeasonSettings.leagueId, leagueId))
      .orderBy(asc(leagueSeasonSettings.season));
    const [checkpoint] = await tx
      .select()
      .from(historicalImportCheckpoints)
      .where(eq(historicalImportCheckpoints.leagueId, leagueId))
      .limit(1);

    return {
      checkpoint,
      coverage,
      finalStandings,
      matchups,
      members,
      seasonSettings,
      teams,
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

describe("importLeagueHistory", () => {
  it("persists historical seasons idempotently and skips completed checkpoints", async () => {
    const ref = fixtureRef("idempotent");
    const firstProvider = providerFor();

    const first = await importLeagueHistory({
      db: handle.db,
      provider: firstProvider.provider,
      ref,
      seasons: [2025, 2024],
      session: fixtureSession,
    });

    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;
    expect(firstProvider.calls).toEqual([2025, 2024]);
    expect(first.value.seasons).toEqual({
      requested: [2025, 2024],
      imported: [2025, 2024],
      skipped: [],
    });
    expect(first.value.teams).toEqual({ total: 4, changed: 4, unchanged: 0 });
    expect(first.value.members).toEqual({
      total: 4,
      changed: 4,
      unchanged: 0,
    });
    expect(first.value.matchups).toEqual({
      total: 2,
      changed: 2,
      unchanged: 0,
    });
    expect(first.value.finalStandings).toEqual({
      total: 4,
      changed: 4,
      unchanged: 0,
    });
    expect(first.value.transactions).toEqual({
      total: 2,
      changed: 2,
      unchanged: 0,
    });
    expect(first.value.checkpoint).toMatchObject({
      status: "completed",
      lastCompletedSeason: 2024,
      nextSeason: null,
      seasonsCompleted: 2,
      seasonsTotal: 2,
    });

    const rows = await selectHistoricalRows(first.value.league.id);
    expect(rows.teams).toHaveLength(4);
    expect(rows.members).toHaveLength(4);
    expect(rows.matchups).toHaveLength(2);
    expect(rows.finalStandings).toHaveLength(4);
    expect(rows.seasonSettings).toHaveLength(2);
    expect(rows.seasonSettings[0]).toMatchObject({
      acquisitionBudget: 100,
      acquisitionSettings: {
        acquisitionBudget: 100,
        acquisitionType: "FREE_AGENT_BUDGET",
      },
      acquisitionType: "FREE_AGENT_BUDGET",
      championshipScoringPeriod: 3,
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
      leagueSize: 2,
      matchupPeriodCount: 1,
      playoffMatchupPeriodLength: 1,
      playoffStartScoringPeriod: 2,
      playoffTeamCount: 2,
      regularSeasonEndScoringPeriod: 1,
      scoringSettings: {
        scoringItems: [{ points: 0.1, statId: 3 }],
        scoringType: "H2H_POINTS",
      },
      scoringType: "H2H_POINTS",
      season: 2024,
    });
    expect(rows.transactions).toHaveLength(2);
    expect(rows.transactions[0]).toMatchObject({
      season: 2024,
      providerTransactionId: "transaction-2024",
      type: "waiver",
      teamProviderIds: ["1"],
      playerProviderIds: ["player-2024"],
      details: { budgetCents: 1200 },
    });
    expect(
      rows.coverage.find(
        (coverage) =>
          coverage.season === 2024 && coverage.dataClass === "transactions",
      ),
    ).toMatchObject({
      capability: "full",
      itemCount: 1,
      status: "complete",
    });
    expect(
      rows.coverage.find(
        (coverage) =>
          coverage.season === 2024 && coverage.dataClass === "rosters",
      ),
    ).toMatchObject({
      capability: "none",
      itemCount: 0,
      status: "unavailable",
    });
    expect(rows.finalStandings[0]).toMatchObject({
      season: 2024,
      providerTeamId: "2",
      finalRank: 1,
      playoffSeed: 2,
    });
    expect(rows.checkpoint).toMatchObject({
      status: "completed",
      lastCompletedSeason: 2024,
      nextSeason: null,
    });

    const secondProvider = providerFor();
    const second = await importLeagueHistory({
      db: handle.db,
      provider: secondProvider.provider,
      ref,
      seasons: [2025, 2024],
      session: fixtureSession,
    });

    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(secondProvider.calls).toEqual([]);
    expect(second.value.seasons).toEqual({
      requested: [2025, 2024],
      imported: [],
      skipped: [2025, 2024],
    });
    expect(second.value.teams).toEqual({ total: 0, changed: 0, unchanged: 0 });
    expect(second.value.members).toEqual({
      total: 0,
      changed: 0,
      unchanged: 0,
    });
    expect(second.value.matchups).toEqual({
      total: 0,
      changed: 0,
      unchanged: 0,
    });
    expect(second.value.finalStandings).toEqual({
      total: 0,
      changed: 0,
      unchanged: 0,
    });
    expect(second.value.transactions).toEqual({
      total: 0,
      changed: 0,
      unchanged: 0,
    });
  });

  it("publishes realtime progress as historical checkpoints advance", async () => {
    const ref = fixtureRef("realtime-progress");
    const fixtureProvider = providerFor();
    const realtime = new RecordingRealtimePublisher();
    const emittedAt = new Date("2026-06-15T12:00:00.000Z");

    const result = await importLeagueHistory({
      db: handle.db,
      now: () => emittedAt,
      provider: fixtureProvider.provider,
      realtime,
      ref,
      seasons: [2025, 2024],
      session: fixtureSession,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    const leagueId = result.value.league.id;
    expect(realtime.historyImportProgress).toEqual([
      {
        at: emittedAt.toISOString(),
        currentSeason: 2026,
        importedSeasons: [],
        lastCompletedSeason: null,
        leagueId,
        nextSeason: 2025,
        provider: "espn",
        providerLeagueId: ref.providerId,
        requestedSeasons: [2025, 2024],
        seasonsCompleted: 0,
        seasonsTotal: 2,
        skippedSeasons: [],
        status: "running",
        type: REALTIME_EVENTS.historyImportProgress,
        v: 1,
      },
      {
        at: emittedAt.toISOString(),
        currentSeason: 2026,
        importedSeasons: [2025],
        lastCompletedSeason: 2025,
        leagueId,
        nextSeason: 2024,
        provider: "espn",
        providerLeagueId: ref.providerId,
        requestedSeasons: [2025, 2024],
        seasonsCompleted: 1,
        seasonsTotal: 2,
        skippedSeasons: [],
        status: "running",
        type: REALTIME_EVENTS.historyImportProgress,
        v: 1,
      },
      {
        at: emittedAt.toISOString(),
        currentSeason: 2026,
        importedSeasons: [2025, 2024],
        lastCompletedSeason: 2024,
        leagueId,
        nextSeason: null,
        provider: "espn",
        providerLeagueId: ref.providerId,
        requestedSeasons: [2025, 2024],
        seasonsCompleted: 2,
        seasonsTotal: 2,
        skippedSeasons: [],
        status: "completed",
        type: REALTIME_EVENTS.historyImportProgress,
        v: 1,
      },
    ]);
  });

  it("extends a completed short checkpoint toward full depth without reprocessing completed seasons", async () => {
    const ref = fixtureRef("extend");
    const shallowProvider = providerFor();

    const shallow = await importLeagueHistory({
      db: handle.db,
      provider: shallowProvider.provider,
      ref,
      seasons: [2025, 2024],
      session: fixtureSession,
    });

    expect(shallow.ok).toBe(true);
    if (!shallow.ok) throw shallow.error;
    expect(shallowProvider.calls).toEqual([2025, 2024]);

    const deeperProvider = providerFor();
    const deeper = await importLeagueHistory({
      db: handle.db,
      provider: deeperProvider.provider,
      ref,
      seasons: [2025, 2024, 2023, 2022],
      session: fixtureSession,
    });

    expect(deeper.ok).toBe(true);
    if (!deeper.ok) throw deeper.error;
    expect(deeperProvider.calls).toEqual([2023, 2022]);
    expect(deeper.value.seasons).toEqual({
      requested: [2025, 2024, 2023, 2022],
      imported: [2023, 2022],
      skipped: [2025, 2024],
    });
    expect(deeper.value.teams).toEqual({ total: 4, changed: 4, unchanged: 0 });
    expect(deeper.value.checkpoint).toMatchObject({
      status: "completed",
      lastCompletedSeason: 2022,
      nextSeason: null,
      seasonsCompleted: 4,
      seasonsTotal: 4,
    });

    const rows = await selectHistoricalRows(deeper.value.league.id);
    expect(rows.teams).toHaveLength(8);
    expect(rows.matchups).toHaveLength(4);
    expect(rows.checkpoint?.cursor).toMatchObject({
      completedSeasons: [2025, 2024, 2023, 2022],
      requestedSeasons: [2025, 2024, 2023, 2022],
    });
  });

  it("imports the default ten-season history depth when no explicit season list is supplied", async () => {
    const ref = fixtureRef("default-depth");
    const provider = providerFor();

    const result = await importLeagueHistory({
      db: handle.db,
      provider: provider.provider,
      ref,
      session: fixtureSession,
    });

    const expectedSeasons = [
      2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016,
    ];
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(provider.calls).toEqual(expectedSeasons);
    expect(result.value.seasons).toEqual({
      requested: expectedSeasons,
      imported: expectedSeasons,
      skipped: [],
    });
    expect(result.value.teams).toEqual({
      total: 20,
      changed: 20,
      unchanged: 0,
    });
    expect(result.value.transactions).toEqual({
      total: 10,
      changed: 10,
      unchanged: 0,
    });
    expect(result.value.checkpoint).toMatchObject({
      status: "completed",
      lastCompletedSeason: 2016,
      nextSeason: null,
      seasonsCompleted: 10,
      seasonsTotal: 10,
    });
  });

  it("imports a 16-season explicit history request in one run", async () => {
    const ref = fixtureRef("sixteen-seasons");
    const provider = providerFor();
    const requestedSeasons = Array.from(
      { length: 16 },
      (_, index) => 2025 - index,
    );

    const result = await importLeagueHistory({
      db: handle.db,
      provider: provider.provider,
      ref,
      seasons: requestedSeasons,
      session: fixtureSession,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(provider.calls).toEqual(requestedSeasons);
    expect(result.value.seasons).toEqual({
      requested: requestedSeasons,
      imported: requestedSeasons,
      skipped: [],
    });
    expect(result.value.checkpoint).toMatchObject({
      status: "completed",
      lastCompletedSeason: 2010,
      nextSeason: null,
      seasonsCompleted: 16,
      seasonsTotal: 16,
    });

    const rows = await selectHistoricalRows(result.value.league.id);
    expect(rows.seasonSettings).toHaveLength(16);
    expect(rows.seasonSettings.map((row) => row.season)).toEqual(
      [...requestedSeasons].reverse(),
    );
    expect(
      rows.seasonSettings.find((row) => row.season === 2011),
    ).toMatchObject({
      acquisitionType: "WAIVERS_TRADITIONAL",
      lineupSlotCounts: {
        "0": 1,
        "7": 1,
        "20": 6,
      },
      playoffMatchupPeriodLength: 2,
      scoringType: "H2H_POINTS",
    });
  });

  it("stops at provider history exhaustion and remembers not to poll older seasons again", async () => {
    const ref = fixtureRef("exhausted");
    const limitedProvider = providerFor({ emptyOnSeason: 2024 });

    const limited = await importLeagueHistory({
      db: handle.db,
      provider: limitedProvider.provider,
      ref,
      seasons: [2025, 2024, 2023],
      session: fixtureSession,
    });

    expect(limited.ok).toBe(true);
    if (!limited.ok) throw limited.error;
    expect(limitedProvider.calls).toEqual([2025, 2024]);
    expect(limited.value.seasons).toEqual({
      requested: [2025, 2024, 2023],
      imported: [2025],
      skipped: [],
    });
    expect(limited.value.checkpoint).toMatchObject({
      status: "completed",
      lastCompletedSeason: 2025,
      nextSeason: null,
      seasonsCompleted: 1,
      seasonsTotal: 1,
    });

    const rows = await selectHistoricalRows(limited.value.league.id);
    expect(rows.teams).toHaveLength(2);
    expect(rows.coverage.map((coverage) => coverage.season)).toEqual(
      expect.arrayContaining([2025]),
    );
    expect(rows.coverage.some((coverage) => coverage.season === 2024)).toBe(
      false,
    );
    expect(rows.checkpoint?.cursor).toMatchObject({
      completedSeasons: [2025],
      exhaustedBeforeSeason: 2024,
      exhaustionReason: "provider_empty",
      requestedSeasons: [2025, 2024, 2023],
    });

    const rerunProvider = providerFor();
    const rerun = await importLeagueHistory({
      db: handle.db,
      provider: rerunProvider.provider,
      ref,
      seasons: [2025, 2024, 2023],
      session: fixtureSession,
    });

    expect(rerun.ok).toBe(true);
    if (!rerun.ok) throw rerun.error;
    expect(rerunProvider.calls).toEqual([]);
    expect(rerun.value.seasons).toEqual({
      requested: [2025, 2024, 2023],
      imported: [],
      skipped: [2025, 2024, 2023],
    });
  });

  it("keeps a failed checkpoint and resumes at the next unfinished season", async () => {
    const ref = fixtureRef("resume");
    const failingProvider = providerFor({ failOnSeason: 2024 });

    const failed = await importLeagueHistory({
      db: handle.db,
      provider: failingProvider.provider,
      ref,
      seasons: [2025, 2024],
      session: fixtureSession,
    });

    expect(failed.ok).toBe(false);
    expect(failingProvider.calls).toEqual([2025, 2024]);

    const leagueId = (
      await handle.db
        .select({ id: leagues.id })
        .from(leagues)
        .where(eq(leagues.providerLeagueId, ref.providerId))
        .limit(1)
    )[0]?.id;
    if (!leagueId) throw new Error("league was not created");

    const afterFailure = await selectHistoricalRows(leagueId);
    expect(afterFailure.teams).toHaveLength(2);
    expect(afterFailure.matchups).toHaveLength(1);
    expect(afterFailure.finalStandings).toHaveLength(2);
    expect(afterFailure.transactions).toHaveLength(1);
    expect(afterFailure.checkpoint).toMatchObject({
      status: "failed",
      lastCompletedSeason: 2025,
      nextSeason: 2024,
      seasonsCompleted: 1,
      seasonsTotal: 2,
      errorCode: "PROVIDER_BLOCKED",
    });

    const resumedProvider = providerFor();
    const resumed = await importLeagueHistory({
      db: handle.db,
      provider: resumedProvider.provider,
      ref,
      seasons: [2025, 2024],
      session: fixtureSession,
    });

    expect(resumed.ok).toBe(true);
    if (!resumed.ok) throw resumed.error;
    expect(resumedProvider.calls).toEqual([2024]);
    expect(resumed.value.seasons).toEqual({
      requested: [2025, 2024],
      imported: [2024],
      skipped: [2025],
    });
    expect(resumed.value.teams).toEqual({ total: 2, changed: 2, unchanged: 0 });
    expect(resumed.value.matchups).toEqual({
      total: 1,
      changed: 1,
      unchanged: 0,
    });
    expect(resumed.value.finalStandings).toEqual({
      total: 2,
      changed: 2,
      unchanged: 0,
    });
    expect(resumed.value.transactions).toEqual({
      total: 1,
      changed: 1,
      unchanged: 0,
    });
    expect(resumed.value.checkpoint).toMatchObject({
      status: "completed",
      lastCompletedSeason: 2024,
      nextSeason: null,
      seasonsCompleted: 2,
      seasonsTotal: 2,
    });

    const afterResume = await selectHistoricalRows(leagueId);
    expect(afterResume.teams).toHaveLength(4);
    expect(afterResume.matchups).toHaveLength(2);
    expect(afterResume.finalStandings).toHaveLength(4);
    expect(afterResume.transactions).toHaveLength(2);
  });
});
