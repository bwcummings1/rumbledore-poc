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
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  fantasyTransactions,
  historicalImportCheckpoints,
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
      currentScoringPeriod: 14,
      scoringType: "H2H_POINTS",
      season,
      size: ref.size ?? 2,
      status: "complete",
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

function providerFor({ failOnSeason }: { failOnSeason?: number } = {}): {
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

        return ok([bundleFor(ref, season)]);
      },
    },
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
