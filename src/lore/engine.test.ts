// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  leagues,
  loreClaims,
  loreEvents,
  loreVotes,
  members,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  castLoreVote,
  closeLoreVote,
  openOpinionClaim,
  stewardLoreClaim,
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

async function openClaim(league: SeededLeague, tag: string) {
  return openOpinionClaim({
    deps: deps(),
    input: {
      authorMemberId: league.members[0]?.id,
      body: `${tag} is now league lore`,
      leagueId: league.id,
      title: `${tag} lore claim`,
    },
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
    expect(rows.events.map((event) => event.kind)).toEqual([
      "created",
      "vote_opened",
      "voted",
      "voted",
      "voted",
      "voted",
      "voted",
      "ratified",
    ]);
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
