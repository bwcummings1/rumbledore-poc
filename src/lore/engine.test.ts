// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  fantasyTeams,
  leagues,
  loreClaims,
  loreEvents,
  loreSubjects,
  loreVerifications,
  loreVotes,
  members,
  persons,
  teamSeasons,
  users,
  weeklyStatistics,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { REALTIME_EVENTS, RecordingRealtimePublisher } from "@/realtime";
import {
  castLoreVote,
  closeLoreVote,
  openOpinionClaim,
  stewardLoreClaim,
  submitLoreClaim,
} from ".";

const marker = `lore-${randomUUID()}`;
const baseNow = new Date("2026-06-14T12:00:00.000Z");

let handle: DbHandle;

type SeedRole = "commissioner" | "data_steward" | "member";

interface SeededMember {
  id: string;
  role: SeedRole;
  userId: string;
}

interface SeededLeague {
  id: string;
  members: SeededMember[];
  providerLeagueId: string;
}

function deps(now = baseNow) {
  return {
    db: handle.db,
    now: () => now,
  };
}

class FailingLoreRealtimePublisher extends RecordingRealtimePublisher {
  override async publishLeagueLoreVoteOpened(): Promise<void> {
    throw new Error("lore realtime unavailable");
  }
}

async function seedLeague(
  tag: string,
  roles: SeedRole[],
): Promise<SeededLeague> {
  const insertedUsers = await handle.db
    .insert(users)
    .values(
      roles.map((role, index) => ({
        displayName: `${tag} ${role} ${index}`,
        email: `${marker}-${tag}-${index}@example.test`,
      })),
    )
    .returning({ id: users.id });
  expect(insertedUsers).toHaveLength(roles.length);

  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 4,
      name: `${marker} ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: roles.length,
      sport: "ffl",
      status: "in_season",
    })
    .returning({
      id: leagues.id,
      providerLeagueId: leagues.providerLeagueId,
    });
  if (!league) throw new Error("league was not inserted");

  const insertedMembers = await handle.db
    .insert(members)
    .values(
      roles.map((role, index) => ({
        organizationId: league.id,
        role,
        userId: insertedUsers[index]?.id ?? "",
      })),
    )
    .returning({
      id: members.id,
      role: members.role,
      userId: members.userId,
    });
  expect(insertedMembers).toHaveLength(roles.length);

  return {
    id: league.id,
    members: insertedMembers.map((member) => ({
      id: member.id,
      role: member.role as SeedRole,
      userId: member.userId,
    })),
    providerLeagueId: league.providerLeagueId,
  };
}

function memberWithRole(league: SeededLeague, role: SeedRole): SeededMember {
  const member = league.members.find((row) => row.role === role);
  if (!member) throw new Error(`missing ${role}`);
  return member;
}

async function openClaim(
  league: SeededLeague,
  tag: string,
  voteClosesAt = baseNow,
) {
  return openOpinionClaim({
    deps: deps(),
    input: {
      authorMemberId: league.members[0]?.id,
      body: `${tag} is now league lore`,
      leagueId: league.id,
      title: `${tag} lore claim`,
      voteClosesAt,
    },
  });
}

async function affirmClaim(league: SeededLeague, claimId: string, count = 3) {
  for (const member of league.members.slice(0, count)) {
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "affirm",
        claimId,
        leagueId: league.id,
        voterMemberId: member.id,
      },
    });
  }
}

async function canonizeClaim(league: SeededLeague, tag: string) {
  const claim = await openClaim(league, tag);
  await affirmClaim(league, claim.claimId);
  await closeLoreVote({
    deps: deps(),
    input: { claimId: claim.claimId, leagueId: league.id },
  });
  return claim;
}

async function seedWeeklyScore({
  league,
  pointsFor = 200.4,
  scoringPeriod = 5,
  season = 2017,
  tag,
}: {
  league: SeededLeague;
  pointsFor?: number;
  scoringPeriod?: number;
  season?: number;
  tag: string;
}) {
  return withLeagueContext(handle.db, league.id, async (tx) => {
    const [person] = await tx
      .insert(persons)
      .values({
        canonicalName: `${tag} Manager`,
        leagueId: league.id,
      })
      .returning({ id: persons.id });
    if (!person) throw new Error("person was not inserted");

    const providerTeamId = `${tag}-team`;
    const [team] = await tx
      .insert(fantasyTeams)
      .values({
        abbrev: tag.slice(0, 4).toUpperCase(),
        contentHash: `${marker}-${tag}-team`,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        name: `${tag} Team`,
        ownerMemberIds: [league.members[0]?.id ?? ""],
        provider: "espn",
        providerTeamId,
        season,
      })
      .returning({ id: fantasyTeams.id });
    if (!team) throw new Error("fantasy team was not inserted");

    const [teamSeason] = await tx
      .insert(teamSeasons)
      .values({
        fantasyTeamId: team.id,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        ownerMemberIds: [league.members[0]?.id ?? ""],
        ownerNames: [`${tag} Owner`],
        provider: "espn",
        providerTeamId,
        season,
        teamName: `${tag} Team`,
      })
      .returning({ id: teamSeasons.id });
    if (!teamSeason) throw new Error("team season was not inserted");

    const pointsAgainst = 123.45;
    const [matchup] = await tx
      .insert(fantasyMatchups)
      .values({
        awayScore: pointsAgainst,
        awayTeamProviderId: `${tag}-opponent`,
        contentHash: `${marker}-${tag}-matchup`,
        homeScore: pointsFor,
        homeTeamProviderId: providerTeamId,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        provider: "espn",
        providerMatchupId: `${tag}-${season}-${scoringPeriod}`,
        scoringPeriod,
        season,
        status: "final",
        winner: "home",
      })
      .returning({ id: fantasyMatchups.id });
    if (!matchup) throw new Error("matchup was not inserted");

    const [weekly] = await tx
      .insert(weeklyStatistics)
      .values({
        leagueId: league.id,
        margin: pointsFor - pointsAgainst,
        matchupId: matchup.id,
        personId: person.id,
        pointsAgainst,
        pointsFor,
        result: "win",
        scoringPeriod,
        season,
        teamSeasonId: teamSeason.id,
        weeklyRank: 1,
      })
      .returning({ id: weeklyStatistics.id });
    if (!weekly) throw new Error("weekly statistic was not inserted");

    return {
      personId: person.id,
      pointsFor,
      scoringPeriod,
      season,
      weeklyStatisticId: weekly.id,
    };
  });
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
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("lore claim voting lifecycle", () => {
  it("opens an opinion claim, records mutable member votes, and canonizes when quorum clears", async () => {
    const league = await seedLeague("canon", [
      "commissioner",
      "member",
      "member",
      "member",
    ]);
    const claim = await openClaim(league, "The 2024 collapse");

    await castLoreVote({
      deps: deps(),
      input: {
        choice: "reject",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[0]?.id ?? "",
      },
    });
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "affirm",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[0]?.id ?? "",
      },
    });
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "affirm",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[1]?.id ?? "",
      },
    });
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "affirm",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[2]?.id ?? "",
      },
    });
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "reject",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[3]?.id ?? "",
      },
    });

    const closed = await closeLoreVote({
      deps: deps(),
      input: { claimId: claim.claimId, leagueId: league.id },
    });
    const closedAgain = await closeLoreVote({
      deps: deps(),
      input: { claimId: claim.claimId, leagueId: league.id },
    });

    expect(closed).toMatchObject({
      claimId: claim.claimId,
      ratifiedBy: "vote",
      reused: false,
      status: "canonized",
      tally: {
        activeMembers: 4,
        affirm: 3,
        quorum: 3,
        reject: 1,
        totalVotes: 4,
      },
    });
    expect(closedAgain).toMatchObject({
      claimId: claim.claimId,
      ratifiedBy: "vote",
      reused: true,
      status: "canonized",
    });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claim: (
        await tx
          .select()
          .from(loreClaims)
          .where(eq(loreClaims.id, claim.claimId))
      )[0],
      events: await tx
        .select()
        .from(loreEvents)
        .where(eq(loreEvents.claimId, claim.claimId)),
      votes: await tx
        .select()
        .from(loreVotes)
        .where(eq(loreVotes.claimId, claim.claimId)),
    }));

    expect(rows.claim).toMatchObject({
      id: claim.claimId,
      kind: "opinion",
      ratifiedBy: "vote",
      status: "canon",
      threadRootId: claim.claimId,
      verification: "n_a",
    });
    expect(rows.claim?.ratifiedAt?.toISOString()).toBe(baseNow.toISOString());
    expect(rows.votes).toHaveLength(4);
    expect(
      rows.votes.find((vote) => vote.voterMemberId === league.members[0]?.id)
        ?.choice,
    ).toBe("affirm");
    expect(rows.events.map((event) => event.kind).sort()).toEqual([
      "created",
      "ratified",
      "vote_opened",
      "voted",
      "voted",
      "voted",
      "voted",
      "voted",
    ]);
  });

  it("publishes realtime lore events when votes open and canonize", async () => {
    const league = await seedLeague("realtime-lore", [
      "commissioner",
      "member",
      "member",
      "member",
    ]);
    const realtime = new RecordingRealtimePublisher();

    const claim = await openOpinionClaim({
      deps: { ...deps(), realtime },
      input: {
        authorMemberId: league.members[0]?.id,
        body: "Realtime lore should wake up the league.",
        leagueId: league.id,
        title: "The live lore vote",
        voteClosesAt: baseNow,
      },
    });
    await affirmClaim(league, claim.claimId);
    const closed = await closeLoreVote({
      deps: { ...deps(), realtime },
      input: { claimId: claim.claimId, leagueId: league.id },
    });
    await closeLoreVote({
      deps: { ...deps(), realtime },
      input: { claimId: claim.claimId, leagueId: league.id },
    });

    expect(closed.status).toBe("canonized");
    expect(realtime.loreVoteOpened).toEqual([
      {
        at: baseNow.toISOString(),
        claimId: claim.claimId,
        leagueId: league.id,
        type: REALTIME_EVENTS.loreVoteOpened,
        v: 1,
        voteClosesAt: baseNow.toISOString(),
      },
    ]);
    expect(realtime.loreCanonized).toEqual([
      {
        at: baseNow.toISOString(),
        claimId: claim.claimId,
        leagueId: league.id,
        ratifiedBy: "vote",
        type: REALTIME_EVENTS.loreCanonized,
        v: 1,
      },
    ]);
  });

  it("keeps lore writes durable when realtime vote-opened publish fails", async () => {
    const league = await seedLeague("realtime-failure", [
      "commissioner",
      "member",
      "member",
    ]);
    const claim = await openOpinionClaim({
      deps: { ...deps(), realtime: new FailingLoreRealtimePublisher() },
      input: {
        authorMemberId: league.members[0]?.id,
        body: "The claim should survive a realtime outage.",
        leagueId: league.id,
        title: "The resilient lore vote",
        voteClosesAt: baseNow,
      },
    });

    const [row] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({ id: loreClaims.id, status: loreClaims.status })
        .from(loreClaims)
        .where(eq(loreClaims.id, claim.claimId)),
    );

    expect(row).toEqual({ id: claim.claimId, status: "vote" });
  });

  it("does not close an open vote before its voting window ends", async () => {
    const league = await seedLeague("early-close", [
      "commissioner",
      "member",
      "member",
    ]);
    const voteClosesAt = new Date("2026-06-21T12:00:00.000Z");
    const claim = await openOpinionClaim({
      deps: deps(),
      input: {
        authorMemberId: league.members[0]?.id,
        body: "This vote should stay open until the announced deadline.",
        leagueId: league.id,
        title: "The premature close",
        voteClosesAt,
      },
    });

    for (const member of league.members) {
      await castLoreVote({
        deps: deps(),
        input: {
          choice: "affirm",
          claimId: claim.claimId,
          leagueId: league.id,
          voterMemberId: member.id,
        },
      });
    }

    await expect(
      closeLoreVote({
        deps: deps(),
        input: { claimId: claim.claimId, leagueId: league.id },
      }),
    ).rejects.toMatchObject({ code: "LORE_VOTE_STILL_OPEN" });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claim: (
        await tx
          .select()
          .from(loreClaims)
          .where(eq(loreClaims.id, claim.claimId))
      )[0],
      events: await tx
        .select()
        .from(loreEvents)
        .where(eq(loreEvents.claimId, claim.claimId)),
    }));
    expect(rows.claim).toMatchObject({
      ratifiedAt: null,
      ratifiedBy: null,
      status: "vote",
    });
    expect(rows.events.map((event) => event.kind)).not.toContain("ratified");

    const closed = await closeLoreVote({
      deps: deps(voteClosesAt),
      input: { claimId: claim.claimId, leagueId: league.id },
    });
    expect(closed).toMatchObject({
      claimId: claim.claimId,
      ratifiedBy: "vote",
      reused: false,
      status: "canonized",
    });
  });

  it("opens a dispute branch and supersedes original canon when the challenge succeeds", async () => {
    const league = await seedLeague("dispute-succeeds", [
      "commissioner",
      "member",
      "member",
      "member",
    ]);
    const original = await canonizeClaim(league, "The cursed trade");

    const dispute = await openOpinionClaim({
      deps: deps(),
      input: {
        authorMemberId: league.members[1]?.id,
        body: "New evidence says the cursed trade was actually worse.",
        branchOf: original.claimId,
        leagueId: league.id,
        relation: "dispute",
        title: "The cursed trade deserves a retrial",
        voteClosesAt: baseNow,
      },
    });

    expect(dispute.threadRootId).toBe(original.claimId);

    const opened = await withLeagueContext(
      handle.db,
      league.id,
      async (tx) => ({
        dispute: (
          await tx
            .select()
            .from(loreClaims)
            .where(eq(loreClaims.id, dispute.claimId))
        )[0],
        original: (
          await tx
            .select()
            .from(loreClaims)
            .where(eq(loreClaims.id, original.claimId))
        )[0],
        originalEvents: await tx
          .select()
          .from(loreEvents)
          .where(eq(loreEvents.claimId, original.claimId)),
      }),
    );

    expect(opened.dispute).toMatchObject({
      branchOf: original.claimId,
      relation: "dispute",
      status: "vote",
      threadRootId: original.claimId,
    });
    expect(opened.original).toMatchObject({ status: "disputed" });
    expect(opened.originalEvents.map((event) => event.reason)).toContain(
      "dispute_opened",
    );

    await affirmClaim(league, dispute.claimId);
    const closed = await closeLoreVote({
      deps: deps(),
      input: { claimId: dispute.claimId, leagueId: league.id },
    });

    expect(closed).toMatchObject({
      claimId: dispute.claimId,
      ratifiedBy: "vote",
      status: "canonized",
    });

    const resolved = await withLeagueContext(
      handle.db,
      league.id,
      async (tx) => ({
        dispute: (
          await tx
            .select()
            .from(loreClaims)
            .where(eq(loreClaims.id, dispute.claimId))
        )[0],
        original: (
          await tx
            .select()
            .from(loreClaims)
            .where(eq(loreClaims.id, original.claimId))
        )[0],
        originalEvents: await tx
          .select()
          .from(loreEvents)
          .where(eq(loreEvents.claimId, original.claimId)),
      }),
    );

    expect(resolved.dispute).toMatchObject({
      branchOf: original.claimId,
      ratifiedBy: "vote",
      relation: "dispute",
      status: "canon",
      threadRootId: original.claimId,
    });
    expect(resolved.original).toMatchObject({ status: "superseded" });
    expect(resolved.originalEvents.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["disputed", "superseded"]),
    );
    expect(resolved.originalEvents.map((event) => event.reason)).toContain(
      "vote_threshold_met:superseded",
    );
  });

  it("keeps original canon when a relitigation branch fails", async () => {
    const league = await seedLeague("dispute-fails", [
      "commissioner",
      "member",
      "member",
    ]);
    const original = await canonizeClaim(league, "The title asterisk");

    const dispute = await openOpinionClaim({
      deps: deps(),
      input: {
        authorMemberId: league.members[1]?.id,
        body: "The title asterisk should be struck from the record.",
        branchOf: original.claimId,
        leagueId: league.id,
        relation: "relitigation",
        title: "Strike the asterisk",
        voteClosesAt: baseNow,
      },
    });

    for (const member of league.members) {
      await castLoreVote({
        deps: deps(),
        input: {
          choice: "reject",
          claimId: dispute.claimId,
          leagueId: league.id,
          voterMemberId: member.id,
        },
      });
    }

    const closed = await closeLoreVote({
      deps: deps(),
      input: { claimId: dispute.claimId, leagueId: league.id },
    });

    expect(closed).toMatchObject({
      claimId: dispute.claimId,
      status: "rejected",
    });

    const resolved = await withLeagueContext(
      handle.db,
      league.id,
      async (tx) => ({
        dispute: (
          await tx
            .select()
            .from(loreClaims)
            .where(eq(loreClaims.id, dispute.claimId))
        )[0],
        original: (
          await tx
            .select()
            .from(loreClaims)
            .where(eq(loreClaims.id, original.claimId))
        )[0],
        originalEvents: await tx
          .select()
          .from(loreEvents)
          .where(eq(loreEvents.claimId, original.claimId)),
      }),
    );

    expect(resolved.dispute).toMatchObject({
      branchOf: original.claimId,
      relation: "relitigation",
      status: "rejected",
      threadRootId: original.claimId,
    });
    expect(resolved.original).toMatchObject({ status: "canon" });
    expect(resolved.originalEvents.map((event) => event.reason)).toEqual(
      expect.arrayContaining([
        "dispute_opened",
        "vote_threshold_failed:upheld",
      ]),
    );
  });

  it("rejects dispute branches against claims that are not canon", async () => {
    const league = await seedLeague("dispute-non-canon", [
      "commissioner",
      "member",
      "member",
    ]);
    const pending = await openClaim(league, "The unsettled rumor");

    await expect(
      openOpinionClaim({
        deps: deps(),
        input: {
          authorMemberId: league.members[1]?.id,
          body: "This rumor cannot be challenged before it is canon.",
          branchOf: pending.claimId,
          leagueId: league.id,
          relation: "dispute",
          title: "Premature challenge",
        },
      }),
    ).rejects.toMatchObject({ code: "LORE_PARENT_NOT_CANON" });
  });

  it("auto-confirms a data-verifiable weekly score claim without opening a vote", async () => {
    const league = await seedLeague("verified", [
      "commissioner",
      "member",
      "member",
    ]);
    const weekly = await seedWeeklyScore({ league, tag: "verified-score" });
    const realtime = new RecordingRealtimePublisher();

    const submitted = await submitLoreClaim({
      deps: { ...deps(), realtime },
      input: {
        assertions: [
          {
            assertedValue: 200.4,
            metric: "points_for",
            personId: weekly.personId,
            scoringPeriod: weekly.scoringPeriod,
            season: weekly.season,
            source: "weekly_statistics",
          },
        ],
        authorMemberId: league.members[0]?.id,
        body: "I scored 200.4 in Week 5, 2017.",
        leagueId: league.id,
        title: "The 200-point game",
      },
    });

    expect(submitted).toMatchObject({
      kind: "data_verifiable",
      ratifiedBy: "verified",
      status: "canonized",
      verification: "verified",
    });
    expect(realtime.loreCanonized).toEqual([
      {
        at: baseNow.toISOString(),
        claimId: submitted.claimId,
        leagueId: league.id,
        ratifiedBy: "verified",
        type: REALTIME_EVENTS.loreCanonized,
        v: 1,
      },
    ]);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claim: (
        await tx
          .select()
          .from(loreClaims)
          .where(eq(loreClaims.id, submitted.claimId))
      )[0],
      events: await tx
        .select()
        .from(loreEvents)
        .where(eq(loreEvents.claimId, submitted.claimId)),
      subjects: await tx
        .select()
        .from(loreSubjects)
        .where(eq(loreSubjects.claimId, submitted.claimId)),
      verifications: await tx
        .select()
        .from(loreVerifications)
        .where(eq(loreVerifications.claimId, submitted.claimId)),
      votes: await tx
        .select()
        .from(loreVotes)
        .where(eq(loreVotes.claimId, submitted.claimId)),
    }));

    expect(rows.claim).toMatchObject({
      kind: "data_verifiable",
      ratifiedBy: "verified",
      status: "canon",
      verification: "verified",
      voteClosesAt: null,
      voteOpensAt: null,
    });
    expect(rows.claim?.ratifiedAt?.toISOString()).toBe(baseNow.toISOString());
    expect(rows.votes).toHaveLength(0);
    expect(rows.verifications).toHaveLength(1);
    expect(rows.verifications[0]).toMatchObject({
      actualValue: "200.4",
      assertedValue: "200.4",
      result: "match",
      weeklyStatisticId: weekly.weeklyStatisticId,
    });
    expect(rows.subjects).toEqual([
      expect.objectContaining({
        personId: weekly.personId,
        season: 2017,
        subjectType: "week",
        week: 5,
      }),
    ]);
    expect([...rows.events.map((event) => event.kind)].sort()).toEqual([
      "created",
      "ratified",
    ]);
  });

  it("auto-refutes a contradicted data-verifiable claim with the true value attached", async () => {
    const league = await seedLeague("refuted", [
      "commissioner",
      "member",
      "member",
    ]);
    const weekly = await seedWeeklyScore({ league, tag: "refuted-score" });

    const submitted = await submitLoreClaim({
      deps: deps(),
      input: {
        assertions: [
          {
            assertedValue: 188.2,
            metric: "points_for",
            personId: weekly.personId,
            scoringPeriod: weekly.scoringPeriod,
            season: weekly.season,
            source: "weekly_statistics",
          },
        ],
        authorMemberId: league.members[0]?.id,
        body: "I scored 188.2 in Week 5, 2017.",
        leagueId: league.id,
        title: "The wrong score",
      },
    });

    expect(submitted).toMatchObject({
      kind: "data_verifiable",
      status: "rejected",
      verification: "refuted",
    });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claim: (
        await tx
          .select()
          .from(loreClaims)
          .where(eq(loreClaims.id, submitted.claimId))
      )[0],
      events: await tx
        .select()
        .from(loreEvents)
        .where(eq(loreEvents.claimId, submitted.claimId)),
      verifications: await tx
        .select()
        .from(loreVerifications)
        .where(eq(loreVerifications.claimId, submitted.claimId)),
      votes: await tx
        .select()
        .from(loreVotes)
        .where(eq(loreVotes.claimId, submitted.claimId)),
    }));

    expect(rows.claim).toMatchObject({
      kind: "data_verifiable",
      ratifiedAt: null,
      ratifiedBy: null,
      status: "rejected",
      verification: "refuted",
      voteClosesAt: null,
      voteOpensAt: null,
    });
    expect(rows.votes).toHaveLength(0);
    expect(rows.verifications).toHaveLength(1);
    expect(rows.verifications[0]).toMatchObject({
      actualValue: "200.4",
      assertedValue: "188.2",
      result: "contradiction",
      weeklyStatisticId: weekly.weeklyStatisticId,
    });
    expect(rows.events.map((event) => event.kind).sort()).toEqual([
      "created",
      "rejected",
    ]);
  });

  it("falls uncheckable data-verifiable claims through to the vote path", async () => {
    const league = await seedLeague("uncheckable", [
      "commissioner",
      "member",
      "member",
    ]);
    const weekly = await seedWeeklyScore({
      league,
      scoringPeriod: 4,
      tag: "uncheckable-score",
    });

    const submitted = await submitLoreClaim({
      deps: deps(),
      input: {
        assertions: [
          {
            assertedValue: 200.4,
            metric: "points_for",
            personId: weekly.personId,
            scoringPeriod: 5,
            season: weekly.season,
            source: "weekly_statistics",
          },
        ],
        authorMemberId: league.members[0]?.id,
        body: "I scored 200.4 in the week we never imported.",
        leagueId: league.id,
        title: "The missing box score",
      },
    });

    expect(submitted).toMatchObject({
      kind: "data_verifiable",
      status: "vote",
      verification: "unverifiable",
    });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claim: (
        await tx
          .select()
          .from(loreClaims)
          .where(eq(loreClaims.id, submitted.claimId))
      )[0],
      events: await tx
        .select()
        .from(loreEvents)
        .where(eq(loreEvents.claimId, submitted.claimId)),
      verifications: await tx
        .select()
        .from(loreVerifications)
        .where(eq(loreVerifications.claimId, submitted.claimId)),
      votes: await tx
        .select()
        .from(loreVotes)
        .where(eq(loreVotes.claimId, submitted.claimId)),
    }));

    expect(rows.claim).toMatchObject({
      kind: "data_verifiable",
      ratifiedAt: null,
      ratifiedBy: null,
      status: "vote",
      verification: "unverifiable",
    });
    expect(rows.claim?.voteOpensAt?.toISOString()).toBe(baseNow.toISOString());
    expect(rows.claim?.voteClosesAt?.toISOString()).toBe(
      new Date(baseNow.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(rows.votes).toHaveLength(0);
    expect(rows.verifications).toHaveLength(1);
    expect(rows.verifications[0]).toMatchObject({
      actualValue: null,
      assertedValue: "200.4",
      result: "uncheckable",
      weeklyStatisticId: null,
    });
    expect(rows.events.map((event) => event.kind).sort()).toEqual([
      "created",
      "vote_opened",
    ]);
  });

  it("routes pure opinion claims to a vote without auto-verification", async () => {
    const league = await seedLeague("submitted-opinion", [
      "commissioner",
      "member",
      "member",
    ]);

    const submitted = await submitLoreClaim({
      deps: deps(),
      input: {
        authorMemberId: league.members[0]?.id,
        body: "The 2021 title was cursed by hubris.",
        leagueId: league.id,
        title: "The cursed title",
      },
    });

    expect(submitted).toMatchObject({
      kind: "opinion",
      status: "vote",
      verification: "n_a",
    });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claim: (
        await tx
          .select()
          .from(loreClaims)
          .where(eq(loreClaims.id, submitted.claimId))
      )[0],
      verifications: await tx
        .select()
        .from(loreVerifications)
        .where(eq(loreVerifications.claimId, submitted.claimId)),
    }));

    expect(rows.claim).toMatchObject({
      kind: "opinion",
      status: "vote",
      verification: "n_a",
    });
    expect(rows.verifications).toHaveLength(0);
  });

  it("rejects a quorum-short claim without counting abstains or non-voters as reject", async () => {
    const league = await seedLeague("reject", [
      "commissioner",
      "data_steward",
      "member",
      "member",
      "member",
    ]);
    const claim = await openClaim(league, "The disputed dynasty");

    await castLoreVote({
      deps: deps(),
      input: {
        choice: "affirm",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[0]?.id ?? "",
      },
    });
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "affirm",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[1]?.id ?? "",
      },
    });
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "abstain",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[2]?.id ?? "",
      },
    });

    const closed = await closeLoreVote({
      deps: deps(),
      input: { claimId: claim.claimId, leagueId: league.id },
    });

    expect(closed).toMatchObject({
      claimId: claim.claimId,
      reused: false,
      status: "rejected",
      tally: {
        abstain: 1,
        activeMembers: 5,
        affirm: 2,
        quorum: 3,
        reject: 0,
        totalVotes: 3,
      },
    });

    const [claimRow] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx.select().from(loreClaims).where(eq(loreClaims.id, claim.claimId)),
    );
    expect(claimRow).toMatchObject({
      ratifiedAt: null,
      ratifiedBy: null,
      status: "rejected",
    });
  });

  it("role-gates steward adjudication and lets a steward ratify quorum-short majority", async () => {
    const league = await seedLeague("steward", [
      "commissioner",
      "data_steward",
      "member",
      "member",
      "member",
    ]);
    const steward = memberWithRole(league, "data_steward");
    const ordinaryMember = league.members[2];
    const claim = await openClaim(league, "The cursed trade");

    await castLoreVote({
      deps: deps(),
      input: {
        choice: "affirm",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[2]?.id ?? "",
      },
    });
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "affirm",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[3]?.id ?? "",
      },
    });
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "reject",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[4]?.id ?? "",
      },
    });

    await expect(
      stewardLoreClaim({
        deps: deps(),
        input: {
          action: "ratify",
          actorMemberId: ordinaryMember?.id ?? "",
          claimId: claim.claimId,
          leagueId: league.id,
          reason: "Nice try from the peanut gallery",
        },
      }),
    ).rejects.toMatchObject({ code: "LORE_STEWARD_REQUIRED" });

    const adjudicated = await stewardLoreClaim({
      deps: deps(),
      input: {
        action: "ratify",
        actorMemberId: steward.id,
        claimId: claim.claimId,
        leagueId: league.id,
        reason: "Affirm had a clear majority but missed quorum by one.",
      },
    });
    const closedAgain = await closeLoreVote({
      deps: deps(),
      input: { claimId: claim.claimId, leagueId: league.id },
    });

    expect(adjudicated).toEqual({
      claimId: claim.claimId,
      ratifiedBy: "steward",
      status: "canonized",
    });
    expect(closedAgain).toMatchObject({
      claimId: claim.claimId,
      ratifiedBy: "steward",
      reused: true,
      status: "canonized",
    });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claim: (
        await tx
          .select()
          .from(loreClaims)
          .where(eq(loreClaims.id, claim.claimId))
      )[0],
      events: await tx
        .select()
        .from(loreEvents)
        .where(eq(loreEvents.claimId, claim.claimId)),
    }));

    expect(rows.claim).toMatchObject({
      ratifiedBy: "steward",
      status: "canon",
    });
    expect(rows.events.map((event) => event.kind)).toContain("steward_action");
    expect(rows.events.map((event) => event.reason)).toContain(
      "steward:ratify",
    );
  });

  it("rejects a steward tiebreak on a clear-majority open vote", async () => {
    const league = await seedLeague("steward-clear-open", [
      "commissioner",
      "data_steward",
      "member",
      "member",
      "member",
    ]);
    const steward = memberWithRole(league, "data_steward");
    const claim = await openClaim(
      league,
      "The runaway majority",
      new Date("2026-06-21T12:00:00.000Z"),
    );

    for (const member of league.members.slice(0, 3)) {
      await castLoreVote({
        deps: deps(),
        input: {
          choice: "affirm",
          claimId: claim.claimId,
          leagueId: league.id,
          voterMemberId: member.id,
        },
      });
    }
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "reject",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[3]?.id ?? "",
      },
    });

    await expect(
      stewardLoreClaim({
        deps: deps(),
        input: {
          action: "reject",
          actorMemberId: steward.id,
          claimId: claim.claimId,
          leagueId: league.id,
          reason: "Trying to stop a clear open majority.",
        },
      }),
    ).rejects.toMatchObject({ code: "LORE_TIEBREAK_NOT_ELIGIBLE" });
  });

  it("lets a steward break a tied open vote", async () => {
    const league = await seedLeague("steward-tie", [
      "commissioner",
      "data_steward",
      "member",
      "member",
    ]);
    const steward = memberWithRole(league, "data_steward");
    const claim = await openClaim(
      league,
      "The tied debate",
      new Date("2026-06-21T12:00:00.000Z"),
    );

    await castLoreVote({
      deps: deps(),
      input: {
        choice: "affirm",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[0]?.id ?? "",
      },
    });
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "reject",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[2]?.id ?? "",
      },
    });

    const adjudicated = await stewardLoreClaim({
      deps: deps(),
      input: {
        action: "reject",
        actorMemberId: steward.id,
        claimId: claim.claimId,
        leagueId: league.id,
        reason: "Tie broken against canon.",
      },
    });

    expect(adjudicated).toEqual({
      claimId: claim.claimId,
      status: "rejected",
    });
    const rows = await withLeagueContext(handle.db, league.id, (tx) =>
      tx.select().from(loreEvents).where(eq(loreEvents.claimId, claim.claimId)),
    );
    expect(rows.map((event) => event.reason)).toContain("steward:reject");
    expect(JSON.stringify(rows)).toContain('"adjudication":"tie"');
  });

  it("lets a steward adjudicate an expired open vote", async () => {
    const league = await seedLeague("steward-expired", [
      "commissioner",
      "data_steward",
      "member",
      "member",
      "member",
    ]);
    const steward = memberWithRole(league, "data_steward");
    const claim = await openClaim(league, "The expired majority");

    for (const member of league.members.slice(0, 3)) {
      await castLoreVote({
        deps: deps(),
        input: {
          choice: "affirm",
          claimId: claim.claimId,
          leagueId: league.id,
          voterMemberId: member.id,
        },
      });
    }
    await castLoreVote({
      deps: deps(),
      input: {
        choice: "reject",
        claimId: claim.claimId,
        leagueId: league.id,
        voterMemberId: league.members[3]?.id ?? "",
      },
    });

    const adjudicated = await stewardLoreClaim({
      deps: deps(),
      input: {
        action: "ratify",
        actorMemberId: steward.id,
        claimId: claim.claimId,
        leagueId: league.id,
        reason: "The window expired before the job closed it.",
      },
    });

    expect(adjudicated).toEqual({
      claimId: claim.claimId,
      ratifiedBy: "steward",
      status: "canonized",
    });
    const rows = await withLeagueContext(handle.db, league.id, (tx) =>
      tx.select().from(loreEvents).where(eq(loreEvents.claimId, claim.claimId)),
    );
    expect(JSON.stringify(rows)).toContain('"adjudication":"expired"');
  });

  it("requires a commissioner for explicit open-vote overrides and audits them separately", async () => {
    const league = await seedLeague("steward-override", [
      "commissioner",
      "data_steward",
      "member",
      "member",
      "member",
    ]);
    const commissioner = memberWithRole(league, "commissioner");
    const steward = memberWithRole(league, "data_steward");
    const claim = await openClaim(
      league,
      "The commissioner override",
      new Date("2026-06-21T12:00:00.000Z"),
    );

    await affirmClaim(league, claim.claimId);
    await expect(
      stewardLoreClaim({
        deps: deps(),
        input: {
          action: "override",
          actorMemberId: steward.id,
          claimId: claim.claimId,
          leagueId: league.id,
          overrideDecision: "reject",
          reason: "Data stewards cannot override clear majorities.",
        },
      }),
    ).rejects.toMatchObject({ code: "LORE_OVERRIDE_REQUIRES_COMMISSIONER" });

    const overridden = await stewardLoreClaim({
      deps: deps(),
      input: {
        action: "override",
        actorMemberId: commissioner.id,
        claimId: claim.claimId,
        leagueId: league.id,
        overrideDecision: "reject",
        reason: "Commissioner override for a league-rules violation.",
      },
    });

    expect(overridden).toEqual({
      claimId: claim.claimId,
      status: "rejected",
    });
    const rows = await withLeagueContext(handle.db, league.id, (tx) =>
      tx.select().from(loreEvents).where(eq(loreEvents.claimId, claim.claimId)),
    );
    expect(rows.map((event) => event.reason)).toContain("steward:override");
    expect(rows.map((event) => event.reason)).toContain(
      "steward:override:reject",
    );
    expect(JSON.stringify(rows)).toContain('"overrideDecision":"reject"');
  });

  it("allows a commissioner to extend an open vote once", async () => {
    const league = await seedLeague("extend", [
      "commissioner",
      "member",
      "member",
    ]);
    const commissioner = memberWithRole(league, "commissioner");
    const claim = await openClaim(league, "The rivalry addendum");
    const extendUntil = new Date("2026-06-25T12:00:00.000Z");

    const extended = await stewardLoreClaim({
      deps: deps(),
      input: {
        action: "extend",
        actorMemberId: commissioner.id,
        claimId: claim.claimId,
        extendUntil,
        leagueId: league.id,
        reason: "The league needs one more week to fight about this.",
      },
    });

    expect(extended).toEqual({
      claimId: claim.claimId,
      status: "extended",
      voteClosesAt: extendUntil,
    });
    await expect(
      stewardLoreClaim({
        deps: deps(),
        input: {
          action: "extend",
          actorMemberId: commissioner.id,
          claimId: claim.claimId,
          extendUntil: new Date("2026-07-01T12:00:00.000Z"),
          leagueId: league.id,
          reason: "One more one more week.",
        },
      }),
    ).rejects.toMatchObject({ code: "LORE_VOTE_ALREADY_EXTENDED" });

    const [claimRow] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx.select().from(loreClaims).where(eq(loreClaims.id, claim.claimId)),
    );
    expect(claimRow?.voteClosesAt?.toISOString()).toBe(
      extendUntil.toISOString(),
    );
  });

  it("allows a commissioner to veto ratified canon with an audit trail", async () => {
    const league = await seedLeague("veto", [
      "commissioner",
      "member",
      "member",
    ]);
    const commissioner = memberWithRole(league, "commissioner");
    const claim = await openClaim(league, "The forbidden nickname");

    for (const member of league.members) {
      await castLoreVote({
        deps: deps(),
        input: {
          choice: "affirm",
          claimId: claim.claimId,
          leagueId: league.id,
          voterMemberId: member.id,
        },
      });
    }
    await closeLoreVote({
      deps: deps(),
      input: { claimId: claim.claimId, leagueId: league.id },
    });

    const vetoed = await stewardLoreClaim({
      deps: deps(),
      input: {
        action: "veto",
        actorMemberId: commissioner.id,
        claimId: claim.claimId,
        leagueId: league.id,
        reason: "League rules violation.",
      },
    });

    expect(vetoed).toEqual({
      claimId: claim.claimId,
      status: "rejected",
    });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claim: (
        await tx
          .select()
          .from(loreClaims)
          .where(eq(loreClaims.id, claim.claimId))
      )[0],
      events: await tx
        .select()
        .from(loreEvents)
        .where(eq(loreEvents.claimId, claim.claimId)),
    }));

    expect(rows.claim).toMatchObject({
      ratifiedAt: null,
      ratifiedBy: null,
      status: "rejected",
    });
    expect(rows.events.map((event) => event.reason)).toContain("steward:veto");
  });
});
