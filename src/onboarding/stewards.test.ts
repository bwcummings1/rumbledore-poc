// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataIntegrityChecks,
  fantasyTeams,
  identityMappings,
  leagues,
  members,
  persons,
  teamSeasons,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { assignDataSteward, listDataStewardDoorway } from "./stewards";

const marker = `stewardtest-${randomUUID()}`;
let handle: DbHandle;

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `${marker} ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning();
  if (!user) throw new Error("user was not created");
  return user;
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: `${marker} ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 2,
      sport: "ffl",
      status: "in_season",
    })
    .returning();
  if (!league) throw new Error("league was not created");
  return league;
}

async function seedAmbiguousReview(league: {
  id: string;
  providerLeagueId: string;
}) {
  await withLeagueContext(handle.db, league.id, async (tx) => {
    const [fantasyTeam] = await tx
      .insert(fantasyTeams)
      .values({
        abbrev: "AMB",
        contentHash: `${marker}-ambiguous-team`,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        name: "Ambiguous Team",
        ownerMemberIds: [`${marker}-owner`],
        provider: "espn",
        providerTeamId: `${marker}-team-1`,
        season: 2026,
      })
      .returning();
    const [person] = await tx
      .insert(persons)
      .values({
        canonicalName: "Ambiguous Manager",
        leagueId: league.id,
      })
      .returning();
    if (!fantasyTeam || !person) {
      throw new Error("ambiguous review fixtures were not created");
    }
    const [teamSeason] = await tx
      .insert(teamSeasons)
      .values({
        fantasyTeamId: fantasyTeam.id,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        ownerMemberIds: [`${marker}-owner`],
        ownerNames: ["Ambiguous Manager"],
        provider: "espn",
        providerTeamId: fantasyTeam.providerTeamId,
        season: 2026,
        teamName: fantasyTeam.name,
      })
      .returning();
    if (!teamSeason) {
      throw new Error("team-season fixture was not created");
    }
    await tx.insert(identityMappings).values({
      confidence: 0.7,
      leagueId: league.id,
      leagueProviderId: league.providerLeagueId,
      method: "fuzzy",
      personId: person.id,
      provider: "espn",
      providerTeamId: fantasyTeam.providerTeamId,
      season: 2026,
      teamSeasonId: teamSeason.id,
    });
    await tx.insert(dataIntegrityChecks).values({
      checkKey: "identity_sanity",
      detail: { problem: "needs steward confirmation" },
      leagueId: league.id,
      season: 2026,
      status: "fail",
    });
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

describe("data steward doorway", () => {
  it("lets a commissioner designate a steward scoped to one league", async () => {
    const league = await seedLeague("assign-a");
    const otherLeague = await seedLeague("assign-b");
    const commissioner = await seedUser("assign-commissioner");
    const candidate = await seedUser("assign-candidate");
    const nonCommissioner = await seedUser("assign-member");

    const memberships = await handle.db
      .insert(members)
      .values([
        {
          organizationId: league.id,
          role: "commissioner",
          userId: commissioner.id,
        },
        {
          organizationId: league.id,
          role: "member",
          userId: candidate.id,
        },
        {
          organizationId: otherLeague.id,
          role: "member",
          userId: candidate.id,
        },
        {
          organizationId: league.id,
          role: "member",
          userId: nonCommissioner.id,
        },
      ])
      .returning();
    const candidateMembership = memberships.find(
      (membership) =>
        membership.organizationId === league.id &&
        membership.userId === candidate.id,
    );
    if (!candidateMembership) {
      throw new Error("candidate membership was not created");
    }

    const assigned = await assignDataSteward(handle.db, {
      actorUserId: commissioner.id,
      leagueId: league.id,
      targetMemberId: candidateMembership.id,
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) throw assigned.error;
    expect(assigned.value.steward).toMatchObject({
      isDataSteward: true,
      memberId: candidateMembership.id,
      role: "data_steward",
      userId: candidate.id,
    });

    const rows = await handle.db
      .select({
        organizationId: members.organizationId,
        role: members.role,
      })
      .from(members)
      .where(eq(members.userId, candidate.id));
    expect(rows).toEqual(
      expect.arrayContaining([
        { organizationId: league.id, role: "data_steward" },
        { organizationId: otherLeague.id, role: "member" },
      ]),
    );

    const denied = await assignDataSteward(handle.db, {
      actorUserId: nonCommissioner.id,
      leagueId: league.id,
      targetMemberId: candidateMembership.id,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error("non-commissioner assigned a steward");
    expect(denied.error.status).toBe(403);
  });

  it("summarizes review flags and hides steward controls by role", async () => {
    const league = await seedLeague("doorway");
    const commissioner = await seedUser("doorway-commissioner");
    const steward = await seedUser("doorway-steward");
    const member = await seedUser("doorway-member");
    await handle.db.insert(members).values([
      {
        organizationId: league.id,
        role: "commissioner",
        userId: commissioner.id,
      },
      {
        organizationId: league.id,
        role: "data_steward",
        userId: steward.id,
      },
      {
        organizationId: league.id,
        role: "member",
        userId: member.id,
      },
    ]);
    await seedAmbiguousReview(league);

    const commissionerDoorway = await listDataStewardDoorway(handle.db, {
      leagueId: league.id,
      userId: commissioner.id,
    });
    expect(commissionerDoorway.ok).toBe(true);
    if (!commissionerDoorway.ok) throw commissionerDoorway.error;
    expect(commissionerDoorway.value).toMatchObject({
      canAssignStewards: true,
      canOpenReview: true,
      review: {
        needsReview: true,
        suggestedIdentityLinks: 1,
        unresolvedIntegrityChecks: 1,
      },
    });
    expect(commissionerDoorway.value.review?.href).toBe(
      `/leagues/${league.id}/members/steward#identity-review`,
    );
    expect(
      commissionerDoorway.value.stewardCandidates.map(
        (candidate) => candidate.userId,
      ),
    ).toEqual([member.id, steward.id]);

    const stewardDoorway = await listDataStewardDoorway(handle.db, {
      leagueId: league.id,
      userId: steward.id,
    });
    expect(stewardDoorway.ok).toBe(true);
    if (!stewardDoorway.ok) throw stewardDoorway.error;
    expect(stewardDoorway.value.canOpenReview).toBe(true);
    expect(stewardDoorway.value.canAssignStewards).toBe(false);
    expect(stewardDoorway.value.stewardCandidates).toHaveLength(0);

    const memberDoorway = await listDataStewardDoorway(handle.db, {
      leagueId: league.id,
      userId: member.id,
    });
    expect(memberDoorway.ok).toBe(true);
    if (!memberDoorway.ok) throw memberDoorway.error;
    expect(memberDoorway.value).toMatchObject({
      canAssignStewards: false,
      canOpenReview: false,
      review: null,
      stewardCandidates: [],
    });
  });
});
