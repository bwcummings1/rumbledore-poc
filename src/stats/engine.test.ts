// @vitest-environment node
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  headToHeadRecords,
  identityAuditLog,
  identityMappings,
  leagues,
  persons,
  seasonStatistics,
  teamSeasons,
  weeklyStatistics,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { mergePersons, recomputeLeagueStatistics, splitPerson } from "./engine";

const marker = `statstest-${randomUUID()}`;
let handle: DbHandle;

interface SeededStatsLeague {
  leagueId: string;
  providerLeagueId: string;
}

interface TeamFixture {
  name: string;
  ownerId: string;
  ownerName: string;
  providerTeamId: string;
  season: number;
}

interface MatchupFixture {
  awayScore: number;
  awayTeamProviderId: string;
  homeScore: number;
  homeTeamProviderId: string;
  providerMatchupId: string;
  scoringPeriod: number;
  season: number;
}

const teams: TeamFixture[] = [
  {
    name: "Team Alex",
    ownerId: "owner-alex",
    ownerName: "Alex Manager",
    providerTeamId: "1",
    season: 2024,
  },
  {
    name: "Team Blair",
    ownerId: "owner-blair",
    ownerName: "Blair Manager",
    providerTeamId: "2",
    season: 2024,
  },
  {
    name: "Drew Crew",
    ownerId: "owner-drew",
    ownerName: "Drew Manager",
    providerTeamId: "3",
    season: 2024,
  },
  {
    name: "Evan Eleven",
    ownerId: "owner-evan",
    ownerName: "Evan Manager",
    providerTeamId: "4",
    season: 2024,
  },
  {
    name: "Alex Bombers",
    ownerId: "owner-alex",
    ownerName: "Alex Manager",
    providerTeamId: "1",
    season: 2025,
  },
  {
    name: "Casey Crushers",
    ownerId: "owner-casey",
    ownerName: "Casey Manager",
    providerTeamId: "2",
    season: 2025,
  },
  {
    name: "Drew Crew",
    ownerId: "owner-drew",
    ownerName: "Drew Manager",
    providerTeamId: "3",
    season: 2025,
  },
  {
    name: "Evan Eleven",
    ownerId: "owner-evan",
    ownerName: "Evan Manager",
    providerTeamId: "4",
    season: 2025,
  },
];

const matchups: MatchupFixture[] = [
  {
    awayScore: 90,
    awayTeamProviderId: "3",
    homeScore: 110,
    homeTeamProviderId: "1",
    providerMatchupId: "2024-1-a",
    scoringPeriod: 1,
    season: 2024,
  },
  {
    awayScore: 80,
    awayTeamProviderId: "4",
    homeScore: 100,
    homeTeamProviderId: "2",
    providerMatchupId: "2024-1-b",
    scoringPeriod: 1,
    season: 2024,
  },
  {
    awayScore: 90,
    awayTeamProviderId: "2",
    homeScore: 100,
    homeTeamProviderId: "1",
    providerMatchupId: "2025-1-a",
    scoringPeriod: 1,
    season: 2025,
  },
  {
    awayScore: 70,
    awayTeamProviderId: "4",
    homeScore: 80,
    homeTeamProviderId: "3",
    providerMatchupId: "2025-1-b",
    scoringPeriod: 1,
    season: 2025,
  },
  {
    awayScore: 96,
    awayTeamProviderId: "3",
    homeScore: 95,
    homeTeamProviderId: "1",
    providerMatchupId: "2025-2-a",
    scoringPeriod: 2,
    season: 2025,
  },
  {
    awayScore: 110,
    awayTeamProviderId: "4",
    homeScore: 120,
    homeTeamProviderId: "2",
    providerMatchupId: "2025-2-b",
    scoringPeriod: 2,
    season: 2025,
  },
];

async function seedStatsLeague(tag: string): Promise<SeededStatsLeague> {
  const providerLeagueId = `${marker}-${tag}`;
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 2,
      name: `${marker} ${tag}`,
      provider: "espn",
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2025,
      size: 4,
      sport: "ffl",
      status: "complete",
    })
    .returning();
  if (!league) {
    throw new Error("stats test league was not created");
  }

  await withLeagueContext(handle.db, league.id, async (tx) => {
    for (const team of teams) {
      await tx
        .insert(fantasyMembers)
        .values({
          contentHash: `${marker}-${tag}-${team.season}-${team.ownerId}`,
          displayName: team.ownerName,
          leagueId: league.id,
          leagueProviderId: providerLeagueId,
          provider: "espn",
          providerMemberId: team.ownerId,
          role: "member",
          season: team.season,
        })
        .onConflictDoNothing();
      await tx.insert(fantasyTeams).values({
        abbrev: `T${team.providerTeamId}`,
        contentHash: `${marker}-${tag}-${team.season}-${team.providerTeamId}`,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        losses: 0,
        name: team.name,
        ownerMemberIds: [team.ownerId],
        pointsAgainst: 0,
        pointsFor: 0,
        provider: "espn",
        providerTeamId: team.providerTeamId,
        season: team.season,
        ties: 0,
        wins: 0,
      });
    }

    for (const matchup of matchups) {
      await tx.insert(fantasyMatchups).values({
        awayScore: matchup.awayScore,
        awayTeamProviderId: matchup.awayTeamProviderId,
        contentHash: `${marker}-${tag}-${matchup.providerMatchupId}`,
        homeScore: matchup.homeScore,
        homeTeamProviderId: matchup.homeTeamProviderId,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        provider: "espn",
        providerMatchupId: matchup.providerMatchupId,
        scoringPeriod: matchup.scoringPeriod,
        season: matchup.season,
        status: "final",
        winner:
          matchup.homeScore > matchup.awayScore
            ? "home"
            : matchup.awayScore > matchup.homeScore
              ? "away"
              : "tie",
      });
    }
  });

  return { leagueId: league.id, providerLeagueId };
}

async function selectStatsRows(leagueId: string) {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const mappingRows = await tx
      .select()
      .from(identityMappings)
      .where(eq(identityMappings.leagueId, leagueId))
      .orderBy(
        asc(identityMappings.season),
        asc(identityMappings.providerTeamId),
      );
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
    const weeklyRows = await tx
      .select()
      .from(weeklyStatistics)
      .where(eq(weeklyStatistics.leagueId, leagueId))
      .orderBy(
        asc(weeklyStatistics.season),
        asc(weeklyStatistics.scoringPeriod),
      );
    const seasonRows = await tx
      .select()
      .from(seasonStatistics)
      .where(eq(seasonStatistics.leagueId, leagueId))
      .orderBy(asc(seasonStatistics.season), asc(seasonStatistics.finalRank));
    const h2hRows = await tx
      .select()
      .from(headToHeadRecords)
      .where(eq(headToHeadRecords.leagueId, leagueId));
    const recordRows = await tx
      .select()
      .from(allTimeRecords)
      .where(eq(allTimeRecords.leagueId, leagueId));
    const auditRows = await tx
      .select()
      .from(identityAuditLog)
      .where(eq(identityAuditLog.leagueId, leagueId));

    return {
      auditRows,
      h2hRows,
      mappingRows,
      personRows,
      recordRows,
      seasonRows,
      teamSeasonRows,
      weeklyRows,
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

describe("recomputeLeagueStatistics", () => {
  it("resolves canonical people and materializes weekly, season, H2H, luck, and record rows", async () => {
    const { leagueId } = await seedStatsLeague("engine");

    await recomputeLeagueStatistics(handle.db, { leagueId });
    await recomputeLeagueStatistics(handle.db, { leagueId });

    const rows = await selectStatsRows(leagueId);
    const mappingFor = (providerTeamId: string, season: number) => {
      const mapping = rows.mappingRows.find(
        (row) => row.providerTeamId === providerTeamId && row.season === season,
      );
      if (!mapping) {
        throw new Error(`mapping ${providerTeamId}/${season} was not found`);
      }
      return mapping;
    };

    const alex2024 = mappingFor("1", 2024);
    const alex2025 = mappingFor("1", 2025);
    const blair2024 = mappingFor("2", 2024);
    const casey2025 = mappingFor("2", 2025);
    const drew2024 = mappingFor("3", 2024);
    const drew2025 = mappingFor("3", 2025);

    expect(rows.personRows).toHaveLength(5);
    expect(rows.teamSeasonRows).toHaveLength(8);
    expect(rows.mappingRows).toHaveLength(8);
    expect(rows.weeklyRows).toHaveLength(12);
    expect(alex2025.personId).toBe(alex2024.personId);
    expect(drew2025.personId).toBe(drew2024.personId);
    expect(casey2025.personId).not.toBe(blair2024.personId);

    const alex2025Season = rows.seasonRows.find(
      (row) => row.personId === alex2025.personId && row.season === 2025,
    );
    expect(alex2025Season).toMatchObject({
      wins: 1,
      losses: 1,
      pointsFor: 195,
      expectedWins: 1,
      luck: 0,
    });

    const casey2025Season = rows.seasonRows.find(
      (row) => row.personId === casey2025.personId && row.season === 2025,
    );
    expect(casey2025Season?.expectedWins).toBeCloseTo(1.6667, 4);
    expect(casey2025Season?.luck).toBeCloseTo(-0.6667, 4);

    const alexDrewAllTime = rows.h2hRows.find(
      (row) =>
        row.season === 0 &&
        [row.personAId, row.personBId].includes(alex2024.personId) &&
        [row.personAId, row.personBId].includes(drew2024.personId),
    );
    expect(alexDrewAllTime).toMatchObject({
      meetings: 2,
      ties: 0,
    });
    expect(
      (alexDrewAllTime?.personAWins ?? 0) + (alexDrewAllTime?.personBWins ?? 0),
    ).toBe(2);

    const currentHighScore = rows.recordRows.find(
      (row) => row.recordType === "highest_single_week_score" && row.isCurrent,
    );
    expect(currentHighScore).toMatchObject({
      holderPersonId: casey2025.personId,
      season: 2025,
      scoringPeriod: 2,
      value: 120,
    });
    expect(currentHighScore?.previousRecordId).toBeTruthy();
    const previousHighScore = rows.recordRows.find(
      (row) => row.id === currentHighScore?.previousRecordId,
    );
    expect(previousHighScore).toMatchObject({
      holderPersonId: alex2024.personId,
      value: 110,
    });
  });

  it("applies steward merge and split corrections as sticky manual mappings", async () => {
    const { leagueId } = await seedStatsLeague("steward");
    await recomputeLeagueStatistics(handle.db, { leagueId });
    let rows = await selectStatsRows(leagueId);
    const providerTwo = rows.mappingRows.filter(
      (row) => row.providerTeamId === "2",
    );
    const blair2024 = providerTwo.find((row) => row.season === 2024);
    const casey2025 = providerTwo.find((row) => row.season === 2025);
    if (!blair2024 || !casey2025) {
      throw new Error("provider team 2 mappings were not found");
    }

    await mergePersons(handle.db, {
      leagueId,
      primaryPersonId: blair2024.personId,
      reason: "same franchise in steward review",
      secondaryPersonId: casey2025.personId,
    });

    rows = await selectStatsRows(leagueId);
    const mergedProviderTwo = rows.mappingRows.filter(
      (row) => row.providerTeamId === "2",
    );
    expect(new Set(mergedProviderTwo.map((row) => row.personId)).size).toBe(1);
    expect(mergedProviderTwo.every((row) => row.method === "manual")).toBe(
      true,
    );
    expect(rows.auditRows.some((row) => row.action === "merge")).toBe(true);

    const caseyTeamSeason = rows.teamSeasonRows.find(
      (row) => row.providerTeamId === "2" && row.season === 2025,
    );
    if (!caseyTeamSeason) {
      throw new Error("Casey team season was not found");
    }

    const split = await splitPerson(handle.db, {
      leagueId,
      newCanonicalName: "Casey Manager",
      personId: blair2024.personId,
      reason: "slot was inherited by Casey",
      teamSeasonIds: [caseyTeamSeason.id],
    });

    rows = await selectStatsRows(leagueId);
    const splitCasey = rows.mappingRows.find(
      (row) => row.providerTeamId === "2" && row.season === 2025,
    );
    expect(splitCasey).toMatchObject({
      method: "manual",
      personId: split.personId,
    });
    expect(rows.auditRows.some((row) => row.action === "split")).toBe(true);
    expect(rows.seasonRows.some((row) => row.personId === split.personId)).toBe(
      true,
    );
  });
});
