// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  fantasyTeams,
  identityMappings,
  leagueGroupingSeasons,
  leagueSeasonGroupings,
  leagueSeasonSettings,
  leagues,
  persons,
  teamSeasons,
  users,
  weeklyStatistics,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  applyCuratedDataEdit,
  confirmLeagueSeasonGrouping,
  createCurationCheckpoint,
  proposeLeagueSeasonGroupings,
  pushAllCurationSeasons,
  pushCurationSeason,
} from "@/stats";
import {
  getLeagueRecordsPageData,
  type RecordsPageData,
} from "./records-page-data";

const marker = `records-pushed-${randomUUID()}`;
let handle: DbHandle;

interface SeededRecordsLeague {
  actorUserId: string;
  alicePersonId: string;
  bobPersonId: string;
  groupingId: string | null;
  leagueId: string;
  matchup2012Id: string;
  providerLeagueId: string;
}

beforeAll(async () => {
  const env = parseEnv(process.env);
  handle = createDb(env.databaseUrl);
  await migrateSerialized(handle);
});

afterAll(async () => {
  await handle.pool.end();
});

async function seedActor(tag: string): Promise<string> {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `${marker} ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("actor was not created");
  }
  return user.id;
}

function resultFor(pointsFor: number, pointsAgainst: number) {
  if (pointsFor > pointsAgainst) {
    return "win" as const;
  }
  if (pointsFor < pointsAgainst) {
    return "loss" as const;
  }
  return "tie" as const;
}

async function seedRecordsLeague(
  tag: string,
  input: { withGrouping?: boolean } = {},
): Promise<SeededRecordsLeague> {
  const actorUserId = await seedActor(`${tag}-actor`);
  const providerLeagueId = `${marker}-${tag}`;
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 2,
      name: `${marker} ${tag}`,
      provider: "espn",
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2012,
      size: 2,
      sport: "ffl",
      status: "complete",
    })
    .returning({ id: leagues.id });
  if (!league) {
    throw new Error("league was not created");
  }

  let alicePersonId = "";
  let bobPersonId = "";
  let matchup2012Id = "";
  let groupingId: string | null = null;

  await withLeagueContext(handle.db, league.id, async (tx) => {
    const [alice] = await tx
      .insert(persons)
      .values({
        canonicalName: "Alice Real",
        leagueId: league.id,
        ownerHistory: [
          {
            endSeason: null,
            ownerNames: ["Alice Owner"],
            providerMemberIds: ["owner-alice"],
            startSeason: 2011,
          },
        ],
      })
      .returning({ id: persons.id });
    const [bob] = await tx
      .insert(persons)
      .values({
        canonicalName: "Bob Real",
        leagueId: league.id,
        ownerHistory: [
          {
            endSeason: null,
            ownerNames: ["Bob Owner"],
            providerMemberIds: ["owner-bob"],
            startSeason: 2011,
          },
        ],
      })
      .returning({ id: persons.id });
    if (!alice || !bob) {
      throw new Error("persons were not created");
    }
    alicePersonId = alice.id;
    bobPersonId = bob.id;

    const teamSeasonIdsByPersonSeason = new Map<string, string>();

    for (const season of [2011, 2012]) {
      await tx.insert(leagueSeasonSettings).values({
        championshipScoringPeriod: 2,
        contentHash: `${marker}-${tag}-settings-${season}`,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        leagueSize: 2,
        matchupPeriodCount: 2,
        playoffStartScoringPeriod: 2,
        playoffTeamCount: 2,
        provider: "espn",
        regularSeasonEndScoringPeriod: 1,
        season,
      });

      for (const team of [
        {
          ownerId: "owner-alice",
          ownerName: "Alice Owner",
          personId: alice.id,
          providerTeamId: "1",
          score: season === 2011 ? 110 : 120,
          teamName: season === 2011 ? "Alice 2011 Brand" : "Alice 2012 Brand",
        },
        {
          ownerId: "owner-bob",
          ownerName: "Bob Owner",
          personId: bob.id,
          providerTeamId: "2",
          score: season === 2011 ? 90 : 95,
          teamName: season === 2011 ? "Bob 2011 Brand" : "Bob 2012 Brand",
        },
      ]) {
        const [fantasyTeam] = await tx
          .insert(fantasyTeams)
          .values({
            abbrev: `T${team.providerTeamId}`,
            contentHash: `${marker}-${tag}-team-${season}-${team.providerTeamId}`,
            leagueId: league.id,
            leagueProviderId: providerLeagueId,
            losses: team.providerTeamId === "1" ? 0 : 1,
            name: team.teamName,
            ownerMemberIds: [team.ownerId],
            pointsAgainst: team.providerTeamId === "1" ? 95 : 120,
            pointsFor: team.score,
            provider: "espn",
            providerTeamId: team.providerTeamId,
            season,
            ties: 0,
            wins: team.providerTeamId === "1" ? 1 : 0,
          })
          .returning({ id: fantasyTeams.id });
        if (!fantasyTeam) {
          throw new Error("fantasy team was not created");
        }
        const [teamSeason] = await tx
          .insert(teamSeasons)
          .values({
            fantasyTeamId: fantasyTeam.id,
            leagueId: league.id,
            leagueProviderId: providerLeagueId,
            ownerMemberIds: [team.ownerId],
            ownerNames: [team.ownerName],
            provider: "espn",
            providerTeamId: team.providerTeamId,
            season,
            teamName: team.teamName,
          })
          .returning({ id: teamSeasons.id });
        if (!teamSeason) {
          throw new Error("team season was not created");
        }
        await tx.insert(identityMappings).values({
          leagueId: league.id,
          leagueProviderId: providerLeagueId,
          method: "manual",
          personId: team.personId,
          provider: "espn",
          providerTeamId: team.providerTeamId,
          resolvedBy: actorUserId,
          season,
          teamSeasonId: teamSeason.id,
        });
        teamSeasonIdsByPersonSeason.set(
          `${team.personId}:${season}`,
          teamSeason.id,
        );
      }

      const aliceScore = season === 2011 ? 110 : 120;
      const bobScore = season === 2011 ? 90 : 95;
      const [matchup] = await tx
        .insert(fantasyMatchups)
        .values({
          awayScore: bobScore,
          awayTeamProviderId: "2",
          contentHash: `${marker}-${tag}-matchup-${season}`,
          homeScore: aliceScore,
          homeTeamProviderId: "1",
          leagueId: league.id,
          leagueProviderId: providerLeagueId,
          provider: "espn",
          providerMatchupId: `${season}-week-1`,
          scoringPeriod: 1,
          season,
          status: "final",
          winner: "home",
        })
        .returning({ id: fantasyMatchups.id });
      if (!matchup) {
        throw new Error("matchup was not created");
      }
      if (season === 2012) {
        matchup2012Id = matchup.id;
      }

      await tx.insert(weeklyStatistics).values([
        {
          isTopScorer: true,
          leagueId: league.id,
          margin: aliceScore - bobScore,
          matchupId: matchup.id,
          opponentPersonId: bob.id,
          personId: alice.id,
          pointsAgainst: bobScore,
          pointsFor: aliceScore,
          result: resultFor(aliceScore, bobScore),
          scoringPeriod: 1,
          season,
          teamSeasonId:
            teamSeasonIdsByPersonSeason.get(`${alice.id}:${season}`) ?? "",
          weeklyRank: 1,
        },
        {
          isBottomScorer: true,
          leagueId: league.id,
          margin: bobScore - aliceScore,
          matchupId: matchup.id,
          opponentPersonId: alice.id,
          personId: bob.id,
          pointsAgainst: aliceScore,
          pointsFor: bobScore,
          result: resultFor(bobScore, aliceScore),
          scoringPeriod: 1,
          season,
          teamSeasonId:
            teamSeasonIdsByPersonSeason.get(`${bob.id}:${season}`) ?? "",
          weeklyRank: 2,
        },
      ]);
    }

    if (input.withGrouping) {
      const [grouping] = await tx
        .insert(leagueSeasonGroupings)
        .values({
          config: { format_type: "traditional" },
          confirmedByUserId: actorUserId,
          derivedFrom: { source: "records-page-data-test" },
          kind: "era",
          leagueId: league.id,
          name: "Early Era",
          ordinal: 1,
          status: "confirmed",
        })
        .returning({ id: leagueSeasonGroupings.id });
      if (!grouping) {
        throw new Error("grouping was not created");
      }
      groupingId = grouping.id;
      await tx.insert(leagueGroupingSeasons).values({
        groupingId: grouping.id,
        leagueId: league.id,
        season: 2011,
      });
    }
  });

  return {
    actorUserId,
    alicePersonId,
    bobPersonId,
    groupingId,
    leagueId: league.id,
    matchup2012Id,
    providerLeagueId,
  };
}

function highestScoreRecord(data: RecordsPageData) {
  return data.currentRecords.find(
    (record) => record.recordType === "highest_single_week_score",
  );
}

async function pushBaseline(seeded: SeededRecordsLeague) {
  const checkpoint = await createCurationCheckpoint(handle.db, {
    actorUserId: seeded.actorUserId,
    label: "baseline",
    leagueId: seeded.leagueId,
  });
  await pushAllCurationSeasons(handle.db, {
    actorUserId: seeded.actorUserId,
    checkpointId: checkpoint.id,
    leagueId: seeded.leagueId,
  });
  return checkpoint;
}

describe("records page pushed snapshot read model", () => {
  it("shows a pushed-data empty state instead of live facts when nothing has been pushed", async () => {
    const seeded = await seedRecordsLeague("empty");

    const result = await getLeagueRecordsPageData(handle.db, {
      leagueId: seeded.leagueId,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.data.currentRecords).toHaveLength(0);
    expect(result.data.catalog.allTimeStandings).toHaveLength(0);
    expect(result.data.managers).toHaveLength(0);
  });

  it("keeps saved-but-unpushed edits invisible, then reflects a pushed 2012 without dropping 2011", async () => {
    const seeded = await seedRecordsLeague("push-boundary");
    await pushBaseline(seeded);

    let result = await getLeagueRecordsPageData(handle.db, {
      leagueId: seeded.leagueId,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(highestScoreRecord(result.data)).toMatchObject({
      holderName: "Alice 2012 Brand (Alice Real)",
      season: 2012,
      value: 120,
    });

    await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "substantive",
      field: "home_score",
      leagueId: seeded.leagueId,
      reason: "records pushed-boundary test",
      targetId: seeded.matchup2012Id,
      targetKind: "matchup",
      value: 240,
    });
    const saved2012 = await createCurationCheckpoint(handle.db, {
      actorUserId: seeded.actorUserId,
      label: "saved 2012 score edit",
      leagueId: seeded.leagueId,
    });

    result = await getLeagueRecordsPageData(handle.db, {
      leagueId: seeded.leagueId,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(highestScoreRecord(result.data)).toMatchObject({
      season: 2012,
      value: 120,
    });

    await pushCurationSeason(handle.db, {
      actorUserId: seeded.actorUserId,
      checkpointId: saved2012.id,
      leagueId: seeded.leagueId,
      season: 2012,
    });

    result = await getLeagueRecordsPageData(handle.db, {
      leagueId: seeded.leagueId,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(highestScoreRecord(result.data)).toMatchObject({
      holderName: "Alice 2012 Brand (Alice Real)",
      season: 2012,
      value: 240,
    });
    expect(result.data.catalog.highLow.highestScores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ season: 2011, value: 110 }),
        expect.objectContaining({ season: 2012, value: 240 }),
      ]),
    );
    const aliceStanding = result.data.catalog.allTimeStandings.find(
      (row) => row.personId === seeded.alicePersonId,
    );
    expect(aliceStanding).toMatchObject({
      personName: "Alice 2012 Brand (Alice Real)",
      pointsFor: 350,
      seasons: 2,
    });
  });

  it("collapses a serial renamer to the latest pushed team name plus real name", async () => {
    const seeded = await seedRecordsLeague("display-rule");
    await pushBaseline(seeded);

    const result = await getLeagueRecordsPageData(handle.db, {
      leagueId: seeded.leagueId,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(
      result.data.managers.filter((manager) => manager.name.includes("Alice")),
    ).toEqual([
      expect.objectContaining({
        id: seeded.alicePersonId,
        name: "Alice 2012 Brand (Alice Real)",
        seasonSpan: "2011-2012",
      }),
    ]);
    expect(
      result.data.catalog.allTimeStandings.map((row) => row.personName),
    ).toContain("Alice 2012 Brand (Alice Real)");
    expect(
      result.data.catalog.allTimeStandings.map((row) => row.personName),
    ).not.toContain("Alice 2011 Brand");
  });

  it("uses pushed data-defined eras as a read-only lens", async () => {
    const seeded = await seedRecordsLeague("era-lens", { withGrouping: true });
    if (!seeded.groupingId) {
      throw new Error("expected grouping id");
    }
    await pushBaseline(seeded);

    let result = await getLeagueRecordsPageData(handle.db, {
      leagueId: seeded.leagueId,
      lens: { groupingId: seeded.groupingId, segment: "both" },
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.data.lens.groupings).toEqual([
      expect.objectContaining({ name: "Early Era", seasons: [2011] }),
    ]);
    expect(result.data.lens.seasonSet).toEqual([2011]);
    expect(highestScoreRecord(result.data)).toMatchObject({
      season: 2011,
      value: 110,
    });

    await withLeagueContext(handle.db, seeded.leagueId, async (tx) => {
      await tx.insert(leagueGroupingSeasons).values({
        groupingId: seeded.groupingId ?? "",
        leagueId: seeded.leagueId,
        season: 2012,
      });
    });

    result = await getLeagueRecordsPageData(handle.db, {
      leagueId: seeded.leagueId,
      lens: { groupingId: seeded.groupingId, segment: "both" },
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.data.lens.seasonSet).toEqual([2011]);
    expect(highestScoreRecord(result.data)).toMatchObject({
      season: 2011,
      value: 110,
    });
  });

  it("surfaces confirmed detector proposals as pushed Record Book era pills", async () => {
    const seeded = await seedRecordsLeague("confirmed-proposal-lens");

    await withLeagueContext(handle.db, seeded.leagueId, async (tx) => {
      await tx
        .update(leagueSeasonSettings)
        .set({ leagueSize: 4 })
        .where(
          and(
            eq(leagueSeasonSettings.leagueId, seeded.leagueId),
            eq(leagueSeasonSettings.season, 2012),
          ),
        );
    });

    const proposals = await proposeLeagueSeasonGroupings(handle.db, {
      leagueId: seeded.leagueId,
    });
    const proposal = proposals.find((candidate) =>
      candidate.seasons.includes(2012),
    );
    if (!proposal) {
      throw new Error("expected detector proposal for 2012");
    }
    const confirmed = await confirmLeagueSeasonGrouping(handle.db, {
      actorUserId: seeded.actorUserId,
      groupingId: proposal.id,
      leagueId: seeded.leagueId,
      name: "Expanded era",
      reason: "records page integration",
      seasons: proposal.seasons,
    });
    await pushBaseline(seeded);

    const result = await getLeagueRecordsPageData(handle.db, {
      leagueId: seeded.leagueId,
      lens: { groupingId: confirmed.id, segment: "both" },
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.data.lens.groupings).toEqual([
      expect.objectContaining({ name: "Expanded era", seasons: [2012] }),
    ]);
    expect(result.data.lens.groupingId).toBe(confirmed.id);
    expect(highestScoreRecord(result.data)).toMatchObject({
      season: 2012,
      value: 120,
    });
  });
});
