// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  championshipRecords,
  dataCorrectionAuditLog,
  dataCoverage,
  dataIntegrityChecks,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  headToHeadRecords,
  identityAuditLog,
  identityMappings,
  leagueSeasonSettings,
  leagues,
  persons,
  providerFinalStandings,
  seasonStatistics,
  statsCalculations,
  teamSeasons,
  users,
  weeklyStatistics,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  mergePersons,
  recomputeChangedMatchupStatistics,
  recomputeLeagueStatistics,
  runDataIntegrityChecks,
  splitPerson,
} from "./engine";
import { getLeagueRecordsCatalog } from "./records-catalog";
import {
  markIntegrityCheckReviewed,
  reassignTeamSeason,
  renamePerson,
} from "./steward";

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

async function seedActor(tag: string): Promise<string> {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `${marker} ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("steward actor was not created");
  }
  return user.id;
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
    const integrityRows = await tx
      .select()
      .from(dataIntegrityChecks)
      .where(eq(dataIntegrityChecks.leagueId, leagueId));
    const calculationRows = await tx
      .select()
      .from(statsCalculations)
      .where(eq(statsCalculations.leagueId, leagueId))
      .orderBy(
        asc(statsCalculations.startedAt),
        sql`case ${statsCalculations.calculationType}
          when 'all' then 0
          when 'season' then 1
          when 'head_to_head' then 2
          else 4
        end`,
      );
    const dataCorrectionAuditRows = await tx
      .select()
      .from(dataCorrectionAuditLog)
      .where(eq(dataCorrectionAuditLog.leagueId, leagueId));

    return {
      auditRows,
      calculationRows,
      championshipRows,
      dataCorrectionAuditRows,
      h2hRows,
      integrityRows,
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
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
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

    const catalog = await getLeagueRecordsCatalog(handle.db, {
      leagueId,
      limit: 5,
    });
    expect(catalog.integrityBlocked).toBe(false);
    expect(catalog.allTimeStandings).toHaveLength(5);
    expect(catalog.allTimeStandings[0]).toMatchObject({
      careerLuck: 0.3333,
      losses: 0,
      personId: blair2024.personId,
      pointsFor: 100,
      rank: 1,
      winPercentage: 1,
      wins: 1,
    });
    expect(
      catalog.allTimeStandings.find(
        (row) => row.personId === alex2024.personId,
      ),
    ).toMatchObject({
      games: 3,
      losses: 1,
      pointsAgainst: 276,
      pointsFor: 305,
      winPercentage: 0.6667,
      wins: 2,
    });
    expect(catalog.highLow.highestScores[0]).toMatchObject({
      personId: casey2025.personId,
      recordType: "highest_single_week_score",
      scoringPeriod: 2,
      season: 2025,
      value: 120,
    });
    expect(catalog.highLow.lowestScores[0]).toMatchObject({
      recordType: "lowest_single_week_score",
      season: 2025,
      value: 70,
    });
    expect(catalog.highLow.bestScoresInLosses[0]).toMatchObject({
      opponentPersonId: casey2025.personId,
      recordType: "best_score_in_loss",
      value: 110,
    });
    expect(catalog.highLow.worstScoresInWins[0]).toMatchObject({
      recordType: "worst_score_in_win",
      value: 80,
    });
    expect(catalog.highLow.highestCombinedMatchups[0]).toMatchObject({
      recordType: "highest_combined_matchup",
      season: 2025,
      value: 230,
    });
    expect(catalog.blowouts.biggest[0]).toMatchObject({
      margin: 20,
      recordType: "biggest_blowout",
    });
    expect(catalog.blowouts.narrowestWins[0]).toMatchObject({
      margin: 1,
      recordType: "narrowest_win",
      season: 2025,
    });
    expect(catalog.streaks.longestLosses[0]).toMatchObject({
      length: 3,
      recordType: "longest_loss_streak",
    });
    expect(
      catalog.streaks.longestWins.some(
        (row) => row.personId === alex2024.personId && row.length === 2,
      ),
    ).toBe(true);

    const alexDrewPair = catalog.headToHead.allTimePairs.find(
      (row) =>
        [row.personA.personId, row.personB.personId].includes(
          alex2024.personId,
        ) &&
        [row.personA.personId, row.personB.personId].includes(
          drew2024.personId,
        ),
    );
    expect(alexDrewPair).toMatchObject({
      meetings: 2,
      ties: 0,
    });
    expect(
      (alexDrewPair?.personA.wins ?? 0) + (alexDrewPair?.personB.wins ?? 0),
    ).toBe(2);

    const alexDrewLedger = catalog.headToHead.managerLedgers.find(
      (row) =>
        row.season === 0 &&
        row.personId === alex2024.personId &&
        row.opponentPersonId === drew2024.personId,
    );
    const drewAlexLedger = catalog.headToHead.managerLedgers.find(
      (row) =>
        row.season === 0 &&
        row.personId === drew2024.personId &&
        row.opponentPersonId === alex2024.personId,
    );
    expect(alexDrewLedger).toMatchObject({
      avgPointsAgainst: 93,
      avgPointsFor: 102.5,
      highestScore: 110,
      losses: 1,
      meetings: 2,
      opponentHighestScore: 96,
      pointsAgainst: 186,
      pointsFor: 205,
      wins: 1,
    });
    expect(alexDrewLedger?.currentStreak).toMatchObject({
      isAgainst: true,
      length: 1,
      personId: drew2024.personId,
    });
    expect(drewAlexLedger).toMatchObject({
      avgPointsAgainst: 102.5,
      avgPointsFor: 93,
      highestScore: 96,
      losses: 1,
      meetings: 2,
      opponentHighestScore: 110,
      pointsAgainst: 205,
      pointsFor: 186,
      wins: 1,
    });
    expect(drewAlexLedger?.currentStreak).toMatchObject({
      isAgainst: false,
      length: 1,
      personId: drew2024.personId,
    });
  });

  it("recomputes only the affected season and H2H pair for changed finalized matchups", async () => {
    const { leagueId } = await seedStatsLeague("targeted");

    await recomputeLeagueStatistics(handle.db, { leagueId });
    const before = await selectStatsRows(leagueId);
    const mappingFor = (providerTeamId: string, season: number) => {
      const mapping = before.mappingRows.find(
        (row) => row.providerTeamId === providerTeamId && row.season === season,
      );
      if (!mapping) {
        throw new Error(`mapping ${providerTeamId}/${season} was not found`);
      }
      return mapping;
    };
    const alex2024 = mappingFor("1", 2024);
    const alex2025 = mappingFor("1", 2025);
    const casey2025 = mappingFor("2", 2025);
    const drew2025 = mappingFor("3", 2025);
    const evan2025 = mappingFor("4", 2025);
    const sortPersonIds = (ids: string[]) =>
      ids.sort((left, right) =>
        left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
    const targetPair = sortPersonIds([alex2025.personId, casey2025.personId]);
    const unrelatedPair = sortPersonIds([drew2025.personId, evan2025.personId]);
    const beforeTargetH2h = before.h2hRows.find(
      (row) =>
        row.season === 2025 &&
        row.personAId === targetPair[0] &&
        row.personBId === targetPair[1],
    );
    const beforeUnrelatedH2h = before.h2hRows.find(
      (row) =>
        row.season === 2025 &&
        row.personAId === unrelatedPair[0] &&
        row.personBId === unrelatedPair[1],
    );
    const beforeAlex2024Season = before.seasonRows.find(
      (row) => row.personId === alex2024.personId && row.season === 2024,
    );
    if (!beforeTargetH2h || !beforeUnrelatedH2h || !beforeAlex2024Season) {
      throw new Error("expected baseline rows for targeted recompute");
    }

    let changedMatchupId = "";
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      const [matchup] = await tx
        .select({ id: fantasyMatchups.id })
        .from(fantasyMatchups)
        .where(
          and(
            eq(fantasyMatchups.leagueId, leagueId),
            eq(fantasyMatchups.providerMatchupId, "2025-1-a"),
          ),
        )
        .limit(1);
      if (!matchup) {
        throw new Error("target matchup was not found");
      }
      changedMatchupId = matchup.id;
      await tx
        .update(fantasyMatchups)
        .set({
          contentHash: `${marker}-targeted-2025-1-a-updated`,
          homeScore: 130,
          updatedAt: new Date(),
          winner: "home",
        })
        .where(eq(fantasyMatchups.id, changedMatchupId));
    });

    const recomputed = await recomputeChangedMatchupStatistics(handle.db, {
      leagueId,
      matchupIds: [changedMatchupId],
    });
    expect(recomputed.seasons).toEqual([2025]);
    expect(recomputed.targetedPairs).toEqual([
      { personAId: targetPair[0], personBId: targetPair[1] },
    ]);

    const after = await selectStatsRows(leagueId);
    const afterAlex2025Season = after.seasonRows.find(
      (row) => row.personId === alex2025.personId && row.season === 2025,
    );
    expect(afterAlex2025Season).toMatchObject({
      losses: 1,
      pointsFor: 225,
      wins: 1,
    });
    expect(
      after.seasonRows.find(
        (row) => row.personId === alex2024.personId && row.season === 2024,
      )?.id,
    ).toBe(beforeAlex2024Season.id);
    expect(
      after.h2hRows.find(
        (row) =>
          row.season === 2025 &&
          row.personAId === unrelatedPair[0] &&
          row.personBId === unrelatedPair[1],
      )?.id,
    ).toBe(beforeUnrelatedH2h.id);
    const afterTargetH2h = after.h2hRows.find(
      (row) =>
        row.season === 2025 &&
        row.personAId === targetPair[0] &&
        row.personBId === targetPair[1],
    );
    if (!afterTargetH2h) {
      throw new Error("target H2H row was not recomputed");
    }
    expect(afterTargetH2h.id).not.toBe(beforeTargetH2h.id);
    expect(afterTargetH2h).toMatchObject({
      meetings: 1,
      personAPoints: afterTargetH2h.personAId === alex2025.personId ? 130 : 90,
      personBPoints: afterTargetH2h.personBId === casey2025.personId ? 90 : 130,
    });

    expect(after.calculationRows.map((row) => row.calculationType)).toEqual([
      "all",
      "season",
      "head_to_head",
    ]);
    expect(
      after.calculationRows.filter((row) => row.calculationType === "all"),
    ).toHaveLength(1);
    const seasonCalculation = after.calculationRows.find(
      (row) => row.calculationType === "season",
    );
    const h2hCalculation = after.calculationRows.find(
      (row) => row.calculationType === "head_to_head",
    );
    expect(seasonCalculation?.metadata).toMatchObject({
      matchupIds: [changedMatchupId],
      seasons: [2025],
      trigger: "changed_finalized_matchup",
    });
    expect(h2hCalculation?.metadata).toMatchObject({
      pairs: [{ personAId: targetPair[0], personBId: targetPair[1] }],
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
      await tx.insert(leagueSeasonSettings).values({
        championshipScoringPeriod: 3,
        contentHash: `${marker}-official-settings`,
        leagueId,
        leagueProviderId: providerLeagueId,
        playoffStartScoringPeriod: 2,
        playoffTeamCount: 4,
        provider: "espn",
        regularSeasonEndScoringPeriod: 1,
        season: 2024,
      });
      await tx.insert(fantasyMatchups).values([
        {
          awayScore: 120,
          awayTeamProviderId: "2",
          contentHash: `${marker}-official-2024-semi-a`,
          homeScore: 130,
          homeTeamProviderId: "3",
          leagueId,
          leagueProviderId: providerLeagueId,
          provider: "espn",
          providerMatchupId: "2024-2-semi-a",
          scoringPeriod: 2,
          season: 2024,
          status: "final",
          winner: "home",
        },
        {
          awayScore: 101,
          awayTeamProviderId: "4",
          contentHash: `${marker}-official-2024-semi-b`,
          homeScore: 118,
          homeTeamProviderId: "1",
          leagueId,
          leagueProviderId: providerLeagueId,
          provider: "espn",
          providerMatchupId: "2024-2-semi-b",
          scoringPeriod: 2,
          season: 2024,
          status: "final",
          winner: "home",
        },
        {
          awayScore: 125,
          awayTeamProviderId: "1",
          contentHash: `${marker}-official-2024-title`,
          homeScore: 130,
          homeTeamProviderId: "3",
          leagueId,
          leagueProviderId: providerLeagueId,
          provider: "espn",
          providerMatchupId: "2024-3-title",
          scoringPeriod: 3,
          season: 2024,
          status: "final",
          winner: "home",
        },
        {
          awayScore: 91,
          awayTeamProviderId: "4",
          contentHash: `${marker}-official-2024-third`,
          homeScore: 99,
          homeTeamProviderId: "2",
          leagueId,
          leagueProviderId: providerLeagueId,
          provider: "espn",
          providerMatchupId: "2024-3-third",
          scoringPeriod: 3,
          season: 2024,
          status: "final",
          winner: "home",
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
    });
    expect(
      rows.championshipRows.find((row) => row.season === 2024),
    ).toMatchObject({
      championPersonId: drew2024.personId,
      championshipScore: 130,
      regularSeasonWinnerPersonId: alex2024.personId,
      runnerUpPersonId: alex2024.personId,
      runnerUpScore: 125,
      thirdPlacePersonId: blair2024.personId,
    });

    const drewTitleWeek = rows.weeklyRows.find(
      (row) =>
        row.personId === drew2024.personId &&
        row.season === 2024 &&
        row.scoringPeriod === 3,
    );
    expect(drewTitleWeek).toMatchObject({
      isChampionship: true,
      isPlayoff: true,
      pointsFor: 130,
    });
    expect(
      rows.weeklyRows.filter(
        (row) =>
          row.season === 2024 && row.scoringPeriod === 1 && row.isPlayoff,
      ),
    ).toHaveLength(0);
    expect(
      rows.weeklyRows.filter(
        (row) =>
          row.season === 2024 && row.scoringPeriod === 2 && row.isPlayoff,
      ),
    ).toHaveLength(4);

    const alexDrewH2h = rows.h2hRows.find(
      (row) =>
        row.season === 2024 &&
        [row.personAId, row.personBId].includes(alex2024.personId) &&
        [row.personAId, row.personBId].includes(drew2024.personId),
    );
    expect(alexDrewH2h).toMatchObject({
      championshipMeetings: 1,
      meetings: 2,
      playoffMeetings: 1,
    });

    const catalog = await getLeagueRecordsCatalog(handle.db, {
      leagueId,
      limit: 20,
    });
    const title2024 = catalog.championships.seasons.find(
      (row) => row.season === 2024,
    );
    expect(title2024).toMatchObject({
      champion: { personId: drew2024.personId },
      championshipScore: 130,
      regularSeasonWinner: { personId: alex2024.personId },
      runnerUp: { personId: alex2024.personId },
      runnerUpScore: 125,
      thirdPlace: { personId: blair2024.personId },
    });

    const drewPostseasonRecord = catalog.championships.managerRecords.find(
      (row) => row.personId === drew2024.personId,
    );
    const alexPostseasonRecord = catalog.championships.managerRecords.find(
      (row) => row.personId === alex2024.personId,
    );
    expect(drewPostseasonRecord).toMatchObject({
      championshipGameLosses: 0,
      championshipGamePointsAgainst: 125,
      championshipGamePointsFor: 130,
      championshipGameWins: 1,
      playoffLosses: 0,
      playoffPointsAgainst: 245,
      playoffPointsFor: 260,
      playoffWins: 2,
    });
    expect(drewPostseasonRecord?.championships).toBeGreaterThanOrEqual(1);
    expect(alexPostseasonRecord).toMatchObject({
      championshipGameLosses: 1,
      championshipGamePointsAgainst: 130,
      championshipGamePointsFor: 125,
      championshipGameWins: 0,
      playoffLosses: 1,
      playoffPointsAgainst: 231,
      playoffPointsFor: 243,
      playoffWins: 1,
      regularSeasonTitles: 1,
      runnerUps: 1,
    });

    const alexDrewLedger2024 = catalog.headToHead.managerLedgers.find(
      (row) =>
        row.season === 2024 &&
        row.personId === alex2024.personId &&
        row.opponentPersonId === drew2024.personId,
    );
    const drewAlexLedger2024 = catalog.headToHead.managerLedgers.find(
      (row) =>
        row.season === 2024 &&
        row.personId === drew2024.personId &&
        row.opponentPersonId === alex2024.personId,
    );
    expect(alexDrewLedger2024).toMatchObject({
      championshipMeetings: 1,
      losses: 1,
      meetings: 2,
      playoffMeetings: 1,
      pointsAgainst: 220,
      pointsFor: 235,
      wins: 1,
    });
    expect(alexDrewLedger2024?.currentStreak).toMatchObject({
      isAgainst: true,
      length: 1,
      personId: drew2024.personId,
    });
    expect(drewAlexLedger2024).toMatchObject({
      championshipMeetings: 1,
      losses: 1,
      meetings: 2,
      playoffMeetings: 1,
      pointsAgainst: 235,
      pointsFor: 220,
      wins: 1,
    });
    expect(drewAlexLedger2024?.currentStreak).toMatchObject({
      isAgainst: false,
      length: 1,
      personId: drew2024.personId,
    });
  });

  it("persists division winners and keeps median rows out of H2H records", async () => {
    const { leagueId, providerLeagueId } = await seedStatsLeague("edge");

    await withLeagueContext(handle.db, leagueId, async (tx) => {
      await tx.insert(providerFinalStandings).values([
        {
          contentHash: `${marker}-edge-2025-east`,
          division: "East",
          divisionRank: 1,
          divisionWinner: true,
          finalRank: 2,
          leagueId,
          leagueProviderId: providerLeagueId,
          losses: 1,
          playoffSeed: 2,
          pointsAgainst: 186,
          pointsFor: 195,
          provider: "espn",
          providerTeamId: "1",
          season: 2025,
          ties: 0,
          wins: 1,
        },
        {
          contentHash: `${marker}-edge-2025-west`,
          division: "West",
          divisionRank: 1,
          divisionWinner: true,
          finalRank: 1,
          leagueId,
          leagueProviderId: providerLeagueId,
          losses: 0,
          playoffSeed: 1,
          pointsAgainst: 180,
          pointsFor: 216,
          provider: "espn",
          providerTeamId: "2",
          season: 2025,
          ties: 0,
          wins: 2,
        },
      ]);
      await tx.insert(fantasyMatchups).values({
        awayScore: 95,
        awayTeamProviderId: "2",
        contentHash: `${marker}-edge-2025-median`,
        homeScore: 100,
        homeTeamProviderId: "1",
        kind: "median",
        leagueId,
        leagueProviderId: providerLeagueId,
        provider: "espn",
        providerMatchupId: "2025-1-median",
        scoringPeriod: 1,
        season: 2025,
        status: "final",
        winner: "home",
      });
    });

    await recomputeLeagueStatistics(handle.db, { leagueId });

    const rows = await selectStatsRows(leagueId);
    const alex2025 = rows.mappingRows.find(
      (row) => row.providerTeamId === "1" && row.season === 2025,
    );
    const casey2025 = rows.mappingRows.find(
      (row) => row.providerTeamId === "2" && row.season === 2025,
    );
    if (!alex2025 || !casey2025) {
      throw new Error("expected 2025 mappings for median fixture");
    }

    expect(
      rows.weeklyRows.filter((row) => row.matchupKind === "median"),
    ).toHaveLength(2);
    const medianMatchupId = rows.weeklyRows.find(
      (row) => row.matchupKind === "median",
    )?.matchupId;
    if (!medianMatchupId) {
      throw new Error("median matchup row was not materialized");
    }
    const catalog = await getLeagueRecordsCatalog(handle.db, {
      leagueId,
      limit: 20,
    });
    expect(
      [
        ...catalog.blowouts.biggest,
        ...catalog.blowouts.narrowestWins,
        ...catalog.highLow.highestCombinedMatchups,
      ].some((entry) => entry.matchupId === medianMatchupId),
    ).toBe(false);
    expect(
      rows.seasonRows.find(
        (row) => row.personId === alex2025.personId && row.season === 2025,
      ),
    ).toMatchObject({
      divisionWinner: true,
      playoffSeed: 2,
      wins: 2,
    });
    expect(
      rows.h2hRows.find(
        (row) =>
          row.season === 2025 &&
          [row.personAId, row.personBId].includes(alex2025.personId) &&
          [row.personAId, row.personBId].includes(casey2025.personId),
      ),
    ).toMatchObject({
      meetings: 1,
    });
  });

  it("records integrity failures and lets a steward mark a flag reviewed", async () => {
    const { leagueId, providerLeagueId } = await seedStatsLeague("integrity");
    const actorUserId = await seedActor("integrity-steward");

    await recomputeLeagueStatistics(handle.db, { leagueId });
    let rows = await selectStatsRows(leagueId);
    expect(rows.integrityRows.some((row) => row.status === "pass")).toBe(true);
    expect(rows.integrityRows.some((row) => row.status === "fail")).toBe(false);

    const seasonRow = rows.seasonRows.find((row) => row.season === 2025);
    if (!seasonRow) {
      throw new Error("season row was not found for integrity test");
    }
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      await tx
        .update(seasonStatistics)
        .set({ wins: seasonRow.wins + 1 })
        .where(eq(seasonStatistics.id, seasonRow.id));
      await tx.insert(dataCoverage).values({
        capability: "full",
        dataClass: "rosters",
        itemCount: 0,
        leagueId,
        provider: "espn",
        providerLeagueId,
        season: 2025,
        status: "complete",
      });
    });

    const integrity = await runDataIntegrityChecks(handle.db, { leagueId });
    expect(integrity.failures).toBeGreaterThanOrEqual(2);

    rows = await selectStatsRows(leagueId);
    const quarantinedCatalog = await getLeagueRecordsCatalog(handle.db, {
      leagueId,
    });
    expect(quarantinedCatalog).toMatchObject({
      allTimeStandings: [],
      blowouts: { biggest: [], narrowestWins: [] },
      highLow: {
        bestScoresInLosses: [],
        highestCombinedMatchups: [],
        highestScores: [],
        lowestScores: [],
        worstScoresInWins: [],
      },
      integrityBlocked: true,
      streaks: { longestLosses: [], longestWins: [] },
    });
    const reconciliationFailure = rows.integrityRows.find(
      (row) =>
        row.checkKey === "reconciliation_totals" &&
        row.season === 2025 &&
        row.status === "fail",
    );
    const emptyFailure = rows.integrityRows.find(
      (row) =>
        row.checkKey === "no_silent_empty" &&
        row.season === 2025 &&
        row.status === "fail",
    );
    expect(reconciliationFailure?.detail).toMatchObject({
      mismatches: expect.arrayContaining([expect.any(Object)]),
    });
    expect(emptyFailure?.detail).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ dataClass: "rosters" }),
      ]),
    });
    if (!reconciliationFailure) {
      throw new Error("reconciliation failure was not recorded");
    }

    const reviewed = await markIntegrityCheckReviewed(handle.db, {
      actorUserId,
      checkId: reconciliationFailure.id,
      leagueId,
      reason: "provider record accepted after review",
    });
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) throw reviewed.error;
    expect(reviewed.value).toMatchObject({
      id: reconciliationFailure.id,
      reviewedByUserId: actorUserId,
      status: "reviewed",
    });

    rows = await selectStatsRows(leagueId);
    expect(
      rows.dataCorrectionAuditRows.some(
        (row) =>
          row.action === "mark_reviewed" &&
          row.integrityCheckId === reconciliationFailure.id,
      ),
    ).toBe(true);
    const correctionAudit = rows.dataCorrectionAuditRows[0];
    if (!correctionAudit) {
      throw new Error("data correction audit row was not written");
    }
    await expect(
      withLeagueContext(handle.db, leagueId, (tx) =>
        tx
          .update(dataCorrectionAuditLog)
          .set({ reason: "should not mutate" })
          .where(eq(dataCorrectionAuditLog.id, correctionAudit.id)),
      ),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "55000" }),
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

  it("applies steward reassign and rename corrections with manual audit", async () => {
    const { leagueId } = await seedStatsLeague("steward-reassign");
    const actorUserId = await seedActor("reassign-steward");

    await recomputeLeagueStatistics(handle.db, { leagueId });
    let rows = await selectStatsRows(leagueId);
    const caseyTeamSeason = rows.teamSeasonRows.find(
      (row) => row.providerTeamId === "2" && row.season === 2025,
    );
    if (!caseyTeamSeason) {
      throw new Error("Casey team season was not found for reassign test");
    }

    const reassigned = await reassignTeamSeason(handle.db, {
      actorUserId,
      leagueId,
      newCanonicalName: "Casey Reassigned",
      reason: "manual steward reassignment",
      teamSeasonId: caseyTeamSeason.id,
    });
    expect(reassigned.ok).toBe(true);
    if (!reassigned.ok) throw reassigned.error;

    rows = await selectStatsRows(leagueId);
    const reassignedMapping = rows.mappingRows.find(
      (row) => row.teamSeasonId === caseyTeamSeason.id,
    );
    expect(reassignedMapping).toMatchObject({
      method: "manual",
      personId: reassigned.value.personId,
      resolvedBy: actorUserId,
    });
    expect(rows.auditRows.some((row) => row.action === "remap")).toBe(true);

    const renamed = await renamePerson(handle.db, {
      actorUserId,
      canonicalName: "Casey Canon",
      leagueId,
      personId: reassigned.value.personId,
      reason: "manual canonical name cleanup",
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) throw renamed.error;

    rows = await selectStatsRows(leagueId);
    expect(
      rows.personRows.find((row) => row.id === reassigned.value.personId),
    ).toMatchObject({
      canonicalName: "Casey Canon",
    });
    expect(rows.auditRows.some((row) => row.action === "rename")).toBe(true);
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
