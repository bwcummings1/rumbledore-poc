// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import {
  nflPlayers,
  nflPlayerWeekStats,
  nflSchedule,
  nflTeamStats,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  enrichLeagueRosterFactWithGeneralStats,
  findGeneralStatsPlayerByFantasyProviderId,
  findGeneralStatsPlayerBySourceId,
  findGeneralStatsPlayersByName,
  getGeneralStatsPlayerStats,
  getGeneralStatsSchedule,
  getGeneralStatsTeamBoxScore,
  getLeagueRosterGeneralNflFacts,
  ingestMockGeneralStats,
  loadMockGeneralStatsFixture,
  runGeneralStatsIntegrityChecks,
} from ".";
import type { GeneralStatsFixture } from "./types";

const marker = `generalstatstest-${randomUUID()}`;
let handle: DbHandle;

function fixtureWithSource(source: string): GeneralStatsFixture {
  return { ...structuredClone(loadMockGeneralStatsFixture()), source };
}

async function countRows(source: string) {
  const [players] = await handle.db
    .select({ count: sql<number>`count(*)::int` })
    .from(nflPlayers)
    .where(eq(nflPlayers.source, source));
  const [schedule] = await handle.db
    .select({ count: sql<number>`count(*)::int` })
    .from(nflSchedule)
    .where(eq(nflSchedule.source, source));
  const [teamStats] = await handle.db
    .select({ count: sql<number>`count(*)::int` })
    .from(nflTeamStats)
    .where(eq(nflTeamStats.source, source));
  const [playerWeekStats] = await handle.db
    .select({ count: sql<number>`count(*)::int` })
    .from(nflPlayerWeekStats)
    .where(eq(nflPlayerWeekStats.source, source));

  return {
    playerWeekStats: playerWeekStats?.count ?? 0,
    players: players?.count ?? 0,
    schedule: schedule?.count ?? 0,
    teamStats: teamStats?.count ?? 0,
  };
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
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
    .delete(nflPlayerWeekStats)
    .where(sql`${nflPlayerWeekStats.source} like ${`${marker}-%`}`);
  await handle.db
    .delete(nflTeamStats)
    .where(sql`${nflTeamStats.source} like ${`${marker}-%`}`);
  await handle.db
    .delete(nflSchedule)
    .where(sql`${nflSchedule.source} like ${`${marker}-%`}`);
  await handle.db
    .delete(nflPlayers)
    .where(sql`${nflPlayers.source} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("general NFL stats substrate", () => {
  it("applies the schema migration", async () => {
    const result = await handle.pool.query<{
      player_table: string | null;
      schedule_table: string | null;
      team_stats_table: string | null;
      player_week_stats_table: string | null;
    }>(
      "select to_regclass('public.nfl_players')::text as player_table, to_regclass('public.nfl_schedule')::text as schedule_table, to_regclass('public.nfl_team_stats')::text as team_stats_table, to_regclass('public.nfl_player_week_stats')::text as player_week_stats_table",
    );
    expect(result.rows[0]).toEqual({
      player_table: "nfl_players",
      player_week_stats_table: "nfl_player_week_stats",
      schedule_table: "nfl_schedule",
      team_stats_table: "nfl_team_stats",
    });
  });

  it("passes integrity for the mock fixture and fails malformed coverage", () => {
    const valid = runGeneralStatsIntegrityChecks(
      fixtureWithSource(`${marker}-integrity-valid`),
    );
    expect(valid.ok).toBe(true);

    const malformed = fixtureWithSource(`${marker}-integrity-bad`);
    malformed.teamStats = malformed.teamStats.filter(
      (stat) => stat.sourceGameId !== malformed.schedule[0]?.sourceGameId,
    );

    const invalid = runGeneralStatsIntegrityChecks(malformed);
    expect(invalid.ok).toBe(false);
    expect(
      invalid.checks.find((check) => check.key === "team_box_coverage"),
    ).toMatchObject({ status: "fail" });
  });

  it("returns graceful empty results before substrate B is populated", async () => {
    const source = `${marker}-empty`;
    await expect(
      findGeneralStatsPlayerBySourceId(handle.db, {
        source,
        sourcePlayerId: "mock-patrick-mahomes",
      }),
    ).resolves.toBeNull();
    await expect(
      findGeneralStatsPlayersByName(handle.db, {
        name: "Patrick",
        source,
      }),
    ).resolves.toEqual([]);
    await expect(
      getGeneralStatsPlayerStats(handle.db, {
        season: 2026,
        source,
        sourcePlayerId: "mock-patrick-mahomes",
      }),
    ).resolves.toEqual([]);
    await expect(
      getGeneralStatsTeamBoxScore(handle.db, {
        season: 2026,
        source,
        team: "KC",
        week: 1,
      }),
    ).resolves.toBeNull();
    await expect(
      getGeneralStatsSchedule(handle.db, { season: 2026, source }),
    ).resolves.toEqual([]);
  });

  it("ingests the mock source idempotently with provenance", async () => {
    const source = `${marker}-ingest`;
    const fixture = fixtureWithSource(source);
    const fetchedAt = new Date("2026-06-23T10:00:00.000Z");

    const first = await ingestMockGeneralStats(handle.db, {
      fetchedAt,
      fixture,
    });
    expect(first.integrity.ok).toBe(true);
    expect(first.players).toEqual({ changed: 4, total: 4 });
    expect(first.schedule).toEqual({ changed: 4, total: 4 });
    expect(first.teamStats).toEqual({ changed: 8, total: 8 });
    expect(first.playerWeekStats).toEqual({ changed: 8, total: 8 });
    await expect(countRows(source)).resolves.toEqual({
      playerWeekStats: 8,
      players: 4,
      schedule: 4,
      teamStats: 8,
    });

    const [player] = await handle.db
      .select({
        contentHash: nflPlayers.contentHash,
        fetchedAt: nflPlayers.fetchedAt,
        source: nflPlayers.source,
      })
      .from(nflPlayers)
      .where(
        and(
          eq(nflPlayers.source, source),
          eq(nflPlayers.sourcePlayerId, "mock-patrick-mahomes"),
        ),
      )
      .limit(1);
    expect(player).toMatchObject({
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      fetchedAt,
      source,
    });

    const second = await ingestMockGeneralStats(handle.db, {
      fetchedAt: new Date("2026-06-23T11:00:00.000Z"),
      fixture,
    });
    expect(second.players.changed).toBe(0);
    expect(second.schedule.changed).toBe(0);
    expect(second.teamStats.changed).toBe(0);
    expect(second.playerWeekStats.changed).toBe(0);
    await expect(countRows(source)).resolves.toEqual({
      playerWeekStats: 8,
      players: 4,
      schedule: 4,
      teamStats: 8,
    });
  });

  it("serves typed player, team, schedule, and enrichment reads", async () => {
    const source = `${marker}-reads`;
    await ingestMockGeneralStats(handle.db, {
      fetchedAt: new Date("2026-06-23T10:30:00.000Z"),
      fixture: fixtureWithSource(source),
    });

    await expect(
      findGeneralStatsPlayerBySourceId(handle.db, {
        source,
        sourcePlayerId: "mock-patrick-mahomes",
      }),
    ).resolves.toMatchObject({
      fantasyProviderIds: { espn: "3139477", sleeper: "4046" },
      fullName: "Patrick Mahomes",
      position: "QB",
      team: "KC",
    });
    await expect(
      findGeneralStatsPlayerByFantasyProviderId(handle.db, {
        provider: "espn",
        providerPlayerId: "4241389",
        source,
      }),
    ).resolves.toMatchObject({ fullName: "CeeDee Lamb", position: "WR" });
    await expect(
      findGeneralStatsPlayersByName(handle.db, {
        name: "jefferson",
        source,
      }),
    ).resolves.toMatchObject([{ fullName: "Justin Jefferson" }]);

    const mahomesStats = await getGeneralStatsPlayerStats(handle.db, {
      season: 2026,
      source,
      sourcePlayerId: "mock-patrick-mahomes",
    });
    expect(mahomesStats).toHaveLength(2);
    expect(mahomesStats[1]).toMatchObject({
      fantasyPoints: 27.78,
      passingTouchdowns: 2,
      player: { fullName: "Patrick Mahomes", position: "QB" },
      rushingTouchdowns: 1,
      week: 2,
    });

    await expect(
      getGeneralStatsTeamBoxScore(handle.db, {
        season: 2026,
        source,
        team: "dal",
        week: 2,
      }),
    ).resolves.toMatchObject({
      opponentTeam: "KC",
      pointsFor: 30,
      team: "DAL",
    });
    await expect(
      getGeneralStatsSchedule(handle.db, {
        season: 2026,
        source,
        team: "KC",
      }),
    ).resolves.toHaveLength(2);

    await expect(
      enrichLeagueRosterFactWithGeneralStats(
        handle.db,
        {
          provider: "espn",
          providerPlayerId: "3139477",
          team: "KC",
        },
        { source },
      ),
    ).resolves.toMatchObject({
      confidence: "provider_id",
      player: { fullName: "Patrick Mahomes", position: "QB" },
    });
    await expect(
      enrichLeagueRosterFactWithGeneralStats(
        handle.db,
        {
          playerName: "Justin Jefferson",
          team: "MIN",
        },
        { source },
      ),
    ).resolves.toMatchObject({
      confidence: "name",
      player: { position: "WR", sourcePlayerId: "mock-justin-jefferson" },
    });
    await expect(
      enrichLeagueRosterFactWithGeneralStats(
        handle.db,
        { provider: "espn", providerPlayerId: "missing-player" },
        { source },
      ),
    ).resolves.toBeNull();

    await expect(
      getLeagueRosterGeneralNflFacts(handle.db, {
        rosterFacts: [
          {
            leagueTeamName: "Fixture Dallas",
            playerName: "CeeDee Lamb",
            provider: "espn",
            providerPlayerId: "4241389",
            providerTeamId: "1",
            rosterSlot: "WR",
            started: true,
            team: "DAL",
          },
        ],
        season: 2026,
        source,
        week: 2,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        confidence: "provider_id",
        latestWeek: expect.objectContaining({
          fantasyPoints: 34.2,
          opponentTeam: "KC",
          week: 2,
        }),
        original: expect.objectContaining({
          leagueTeamName: "Fixture Dallas",
          rosterSlot: "WR",
        }),
        player: expect.objectContaining({
          fullName: "CeeDee Lamb",
          position: "WR",
          team: "DAL",
        }),
        schedule: expect.arrayContaining([
          expect.objectContaining({
            awayTeam: "KC",
            homeTeam: "DAL",
            week: 2,
          }),
        ]),
        seasonTotals: expect.objectContaining({
          fantasyPoints: 57,
          games: 2,
          receivingTouchdowns: 3,
        }),
      }),
    ]);
  });
});
