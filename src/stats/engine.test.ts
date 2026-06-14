// @vitest-environment node
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  championshipRecords,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  headToHeadRecords,
  identityAuditLog,
  identityMappings,
  leagues,
  persons,
  providerFinalStandings,
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

interface MultiOwnerTeamFixture {
  name: string;
  owners: { id: string; name: string }[];
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

const coOwnerTeams: MultiOwnerTeamFixture[] = [
  {
    name: "Alpha Aces",
    owners: [
      { id: "owner-alpha", name: "Alpha Manager" },
      { id: "owner-shared", name: "Shared Manager" },
    ],
    providerTeamId: "1",
    season: 2024,
  },
  {
    name: "Beta Blasters",
    owners: [
      { id: "owner-beta", name: "Beta Manager" },
      { id: "owner-shared", name: "Shared Manager" },
    ],
    providerTeamId: "2",
    season: 2024,
  },
  {
    name: "Beta Blasters",
    owners: [
      { id: "owner-beta", name: "Beta Manager" },
      { id: "owner-shared", name: "Shared Manager" },
    ],
    providerTeamId: "2",
    season: 2025,
  },
  {
    name: "Gamma Guards",
    owners: [{ id: "owner-gamma", name: "Gamma Manager" }],
    providerTeamId: "3",
    season: 2025,
  },
];

const coOwnerMatchups: MatchupFixture[] = [
  {
    awayScore: 100,
    awayTeamProviderId: "2",
    homeScore: 110,
    homeTeamProviderId: "1",
    providerMatchupId: "2024-1-coowner",
    scoringPeriod: 1,
    season: 2024,
  },
  {
    awayScore: 95,
    awayTeamProviderId: "3",
    homeScore: 105,
    homeTeamProviderId: "2",
    providerMatchupId: "2025-1-coowner",
    scoringPeriod: 1,
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

async function seedCoOwnerLeague(tag: string): Promise<SeededStatsLeague> {
  const providerLeagueId = `${marker}-${tag}`;
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: `${marker} ${tag}`,
      provider: "sleeper",
      providerLeagueId,
      scoringType: "PPR",
      season: 2025,
      size: 3,
      sport: "ffl",
      status: "complete",
    })
    .returning();
  if (!league) {
    throw new Error("co-owner stats test league was not created");
  }

  await withLeagueContext(handle.db, league.id, async (tx) => {
    const teamRows = new Map<string, { fantasyTeamId: string }>();
    const [alphaPersonId, betaPersonId] = [randomUUID(), randomUUID()].sort(
      (left, right) => left.localeCompare(right),
    );
    for (const team of coOwnerTeams) {
      for (const owner of team.owners) {
        await tx
          .insert(fantasyMembers)
          .values({
            contentHash: `${marker}-${tag}-${team.season}-${owner.id}`,
            displayName: owner.name,
            leagueId: league.id,
            leagueProviderId: providerLeagueId,
            provider: "sleeper",
            providerMemberId: owner.id,
            role: "member",
            season: team.season,
          })
          .onConflictDoNothing();
      }

      const ownerMemberIds = team.owners
        .map((owner) => owner.id)
        .sort((left, right) => left.localeCompare(right));
      const [insertedTeam] = await tx
        .insert(fantasyTeams)
        .values({
          abbrev: team.name.slice(0, 3).toUpperCase(),
          contentHash: `${marker}-${tag}-${team.season}-${team.providerTeamId}`,
          leagueId: league.id,
          leagueProviderId: providerLeagueId,
          losses: 0,
          name: team.name,
          ownerMemberIds,
          pointsAgainst: 0,
          pointsFor: 0,
          provider: "sleeper",
          providerTeamId: team.providerTeamId,
          season: team.season,
          ties: 0,
          wins: 0,
        })
        .returning({ fantasyTeamId: fantasyTeams.id });
      if (!insertedTeam) {
        throw new Error("co-owner fantasy team was not created");
      }
      teamRows.set(`${team.season}:${team.providerTeamId}`, insertedTeam);
    }

    for (const matchup of coOwnerMatchups) {
      await tx.insert(fantasyMatchups).values({
        awayScore: matchup.awayScore,
        awayTeamProviderId: matchup.awayTeamProviderId,
        contentHash: `${marker}-${tag}-${matchup.providerMatchupId}`,
        homeScore: matchup.homeScore,
        homeTeamProviderId: matchup.homeTeamProviderId,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        provider: "sleeper",
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

    const seededIdentities = [
      {
        personId: alphaPersonId,
        team: coOwnerTeams[0],
      },
      {
        personId: betaPersonId,
        team: coOwnerTeams[1],
      },
    ];

    for (const seeded of seededIdentities) {
      const team = seeded.team;
      if (!team) {
        throw new Error("seeded co-owner team fixture was not found");
      }
      const fantasyTeam = teamRows.get(`${team.season}:${team.providerTeamId}`);
      if (!fantasyTeam) {
        throw new Error("seeded co-owner fantasy team row was not found");
      }
      const ownerMemberIds = team.owners
        .map((owner) => owner.id)
        .sort((left, right) => left.localeCompare(right));
      const ownerNames = team.owners
        .map((owner) => owner.name)
        .sort((left, right) => left.localeCompare(right));
      const [person] = await tx
        .insert(persons)
        .values({
          canonicalName: ownerNames[0] ?? team.name,
          id: seeded.personId,
          leagueId: league.id,
        })
        .returning({ id: persons.id });
      const [teamSeason] = await tx
        .insert(teamSeasons)
        .values({
          fantasyTeamId: fantasyTeam.fantasyTeamId,
          leagueId: league.id,
          leagueProviderId: providerLeagueId,
          ownerMemberIds,
          ownerNames,
          provider: "sleeper",
          providerTeamId: team.providerTeamId,
          season: team.season,
          teamName: team.name,
        })
        .returning({ id: teamSeasons.id });
      if (!person || !teamSeason) {
        throw new Error("seeded co-owner identity rows were not created");
      }
      await tx.insert(identityMappings).values({
        confidence: 1,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        method: "auto",
        personId: person.id,
        provider: "sleeper",
        providerTeamId: team.providerTeamId,
        season: team.season,
        teamSeasonId: teamSeason.id,
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
    const championshipRows = await tx
      .select()
      .from(championshipRecords)
      .where(eq(championshipRecords.leagueId, leagueId))
      .orderBy(asc(championshipRecords.season));
    const auditRows = await tx
      .select()
      .from(identityAuditLog)
      .where(eq(identityAuditLog.leagueId, leagueId));

    return {
      auditRows,
      championshipRows,
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

  it("uses provider final standings for postseason placement and championship records", async () => {
    const { leagueId, providerLeagueId } = await seedStatsLeague("official");

    await withLeagueContext(handle.db, leagueId, async (tx) => {
      await tx.insert(providerFinalStandings).values([
        {
          contentHash: `${marker}-official-2024-3`,
          finalRank: 1,
          leagueId,
          leagueProviderId: providerLeagueId,
          losses: 1,
          playoffSeed: 3,
          pointsAgainst: 110,
          pointsFor: 90,
          provider: "espn",
          providerTeamId: "3",
          season: 2024,
          ties: 0,
          wins: 0,
        },
        {
          contentHash: `${marker}-official-2024-1`,
          finalRank: 2,
          leagueId,
          leagueProviderId: providerLeagueId,
          losses: 0,
          playoffSeed: 1,
          pointsAgainst: 90,
          pointsFor: 110,
          provider: "espn",
          providerTeamId: "1",
          season: 2024,
          ties: 0,
          wins: 1,
        },
        {
          contentHash: `${marker}-official-2024-2`,
          finalRank: 3,
          leagueId,
          leagueProviderId: providerLeagueId,
          losses: 0,
          playoffSeed: 2,
          pointsAgainst: 80,
          pointsFor: 100,
          provider: "espn",
          providerTeamId: "2",
          season: 2024,
          ties: 0,
          wins: 1,
        },
        {
          contentHash: `${marker}-official-2024-4`,
          finalRank: 4,
          leagueId,
          leagueProviderId: providerLeagueId,
          losses: 1,
          playoffSeed: null,
          pointsAgainst: 100,
          pointsFor: 80,
          provider: "espn",
          providerTeamId: "4",
          season: 2024,
          ties: 0,
          wins: 0,
        },
      ]);
    });

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
    const blair2024 = mappingFor("2", 2024);
    const drew2024 = mappingFor("3", 2024);
    const drewSeason = rows.seasonRows.find(
      (row) => row.personId === drew2024.personId && row.season === 2024,
    );
    const alexSeason = rows.seasonRows.find(
      (row) => row.personId === alex2024.personId && row.season === 2024,
    );

    expect(drewSeason).toMatchObject({
      finalPlacement: "champ",
      finalRank: 1,
      losses: 1,
      madeChampionship: true,
      madePlayoffs: true,
    });
    expect(alexSeason).toMatchObject({
      finalPlacement: "runner_up",
      finalRank: 2,
      wins: 1,
    });
    expect(
      rows.championshipRows.find((row) => row.season === 2024),
    ).toMatchObject({
      championPersonId: drew2024.personId,
      regularSeasonWinnerPersonId: alex2024.personId,
      runnerUpPersonId: alex2024.personId,
      thirdPlacePersonId: blair2024.personId,
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

  it("keeps co-owner overlaps scoped to the team slot during identity resolution", async () => {
    const { leagueId } = await seedCoOwnerLeague("coowners");

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

    const alpha2024 = mappingFor("1", 2024);
    const beta2024 = mappingFor("2", 2024);
    const beta2025 = mappingFor("2", 2025);
    const betaTeamSeason2025 = rows.teamSeasonRows.find(
      (row) => row.providerTeamId === "2" && row.season === 2025,
    );
    if (!betaTeamSeason2025) {
      throw new Error("Beta 2025 team-season was not found");
    }

    expect(alpha2024.personId).not.toBe(beta2024.personId);
    expect(beta2025.personId).toBe(beta2024.personId);
    expect(beta2025.personId).not.toBe(alpha2024.personId);
    expect(
      rows.weeklyRows.filter(
        (row) => row.teamSeasonId === betaTeamSeason2025.id,
      ),
    ).toHaveLength(1);

    const betaPerson = rows.personRows.find(
      (row) => row.id === beta2024.personId,
    );
    expect(betaPerson?.ownerHistory).toEqual([
      {
        endSeason: 2025,
        ownerNames: ["Beta Manager", "Shared Manager"],
        providerMemberIds: ["owner-beta", "owner-shared"],
        startSeason: 2024,
      },
    ]);
  });
});
