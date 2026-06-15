// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockAiDependencies } from "@/ai";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  fantasyMembers,
  fantasyTeams,
  instigations,
  leagues,
  loreClaims,
  loreEvents,
  members,
  polls,
  pollVotes,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { REALTIME_EVENTS, RecordingRealtimePublisher } from "@/realtime";
import { castPollVote, closePoll, seedInstigation } from ".";

const marker = `instigator-${randomUUID()}`;

let handle: DbHandle;

interface SeededLeague {
  awayTeamName: string;
  homeTeamName: string;
  id: string;
  memberAId: string;
  memberBId: string;
  providerLeagueId: string;
}

async function seedLeague(tag: string): Promise<SeededLeague> {
  const [userA, userB] = await handle.db
    .insert(users)
    .values([
      {
        displayName: `${tag} User A`,
        email: `${marker}-${tag}-a@example.test`,
      },
      {
        displayName: `${tag} User B`,
        email: `${marker}-${tag}-b@example.test`,
      },
    ])
    .returning();
  if (!userA || !userB) throw new Error("users were not inserted");

  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 4,
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
  if (!league) throw new Error("league was not inserted");

  const [memberA, memberB] = await handle.db
    .insert(members)
    .values([
      {
        organizationId: league.id,
        role: "member",
        userId: userA.id,
      },
      {
        organizationId: league.id,
        role: "member",
        userId: userB.id,
      },
    ])
    .returning();
  if (!memberA || !memberB) throw new Error("members were not inserted");

  const homeTeamName = `${tag} Home Plotters`;
  const awayTeamName = `${tag} Away Antagonists`;
  await withLeagueContext(handle.db, league.id, async (tx) => {
    await tx.insert(fantasyMembers).values([
      {
        contentHash: `${marker}-${tag}-home-member-hash`,
        displayName: `${tag} Home Manager`,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        provider: "espn",
        providerMemberId: `${tag}-home-manager`,
        role: "member",
        season: 2026,
      },
      {
        contentHash: `${marker}-${tag}-away-member-hash`,
        displayName: `${tag} Away Manager`,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        provider: "espn",
        providerMemberId: `${tag}-away-manager`,
        role: "member",
        season: 2026,
      },
    ]);
    await tx.insert(fantasyTeams).values([
      {
        contentHash: `${marker}-${tag}-home-team-hash`,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        losses: 1,
        name: homeTeamName,
        ownerMemberIds: [`${tag}-home-manager`],
        pointsAgainst: 360,
        pointsFor: 540,
        provider: "espn",
        providerTeamId: `${tag}-home-team`,
        season: 2026,
        wins: 4,
      },
      {
        contentHash: `${marker}-${tag}-away-team-hash`,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        losses: 4,
        name: awayTeamName,
        ownerMemberIds: [`${tag}-away-manager`],
        pointsAgainst: 510,
        pointsFor: 390,
        provider: "espn",
        providerTeamId: `${tag}-away-team`,
        season: 2026,
        wins: 1,
      },
    ]);
  });

  return {
    awayTeamName,
    homeTeamName,
    id: league.id,
    memberAId: memberA.id,
    memberBId: memberB.id,
    providerLeagueId: league.providerLeagueId,
  };
}

function aiDeps(
  overrides: Partial<ReturnType<typeof createMockAiDependencies>> = {},
) {
  return {
    ...createMockAiDependencies(handle.db),
    duplicateThreshold: 1.1,
    now: () => new Date("2026-06-14T12:00:00.000Z"),
    ...overrides,
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
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("instigator engine", () => {
  it("seeds a grounded settle-it poll and writes one instigation column idempotently", async () => {
    const league = await seedLeague("seed");
    const realtime = new RecordingRealtimePublisher();
    const input = {
      dedupKey: "week-4-main-instigation",
      groundingRefs: [
        {
          id: `${league.id}:team:home`,
          label: league.homeTeamName,
          type: "team" as const,
        },
      ],
      kind: "settle_it_poll" as const,
      leagueId: league.id,
      options: [league.homeTeamName, league.awayTeamName],
      persona: "trash_talker" as const,
      promptText: `Settle it: is ${league.homeTeamName} the league's main character?`,
    };

    const first = await seedInstigation({ deps: aiDeps({ realtime }), input });
    const second = await seedInstigation({
      deps: aiDeps({ realtime }),
      input,
    });

    expect(first).toMatchObject({
      pollId: expect.any(String),
      reused: false,
      status: "polling",
    });
    expect(second).toMatchObject({
      contentItemId: first.contentItemId,
      instigationId: first.instigationId,
      pollId: first.pollId,
      reused: true,
      status: "polling",
    });
    expect(realtime.loreVoteOpened).toEqual([
      {
        at: "2026-06-14T12:00:00.000Z",
        claimId: expect.any(String),
        leagueId: league.id,
        type: REALTIME_EVENTS.loreVoteOpened,
        v: 1,
        voteClosesAt: "2026-06-21T12:00:00.000Z",
      },
    ]);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      instigations: await tx
        .select()
        .from(instigations)
        .where(eq(instigations.leagueId, league.id)),
      claims: await tx
        .select()
        .from(loreClaims)
        .where(eq(loreClaims.leagueId, league.id)),
      events: await tx
        .select()
        .from(loreEvents)
        .where(eq(loreEvents.leagueId, league.id)),
      polls: await tx.select().from(polls).where(eq(polls.leagueId, league.id)),
      posts: await tx
        .select({
          metadata: contentItems.metadata,
        })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        ),
    }));

    expect(rows.instigations).toHaveLength(1);
    expect(rows.polls).toHaveLength(1);
    expect(rows.claims).toHaveLength(1);
    expect(rows.claims[0]).toMatchObject({
      authorPersona: "trash_talker",
      kind: "opinion",
      origin: "ai",
      sourceInstigationId: first.instigationId,
      sourcePollId: first.pollId,
      status: "vote",
      title: input.promptText,
    });
    expect(rows.events.map((event) => event.kind).sort()).toEqual([
      "created",
      "vote_opened",
    ]);
    expect(rows.posts).toHaveLength(1);
    expect(rows.posts[0]?.metadata).toMatchObject({
      contentType: "instigation_column",
      triggerKey: `instigation:${first.instigationId}`,
    });
  });

  it("rejects ungrounded instigations", async () => {
    const league = await seedLeague("ungrounded");

    await expect(
      seedInstigation({
        deps: aiDeps(),
        input: {
          dedupKey: "ungrounded",
          groundingRefs: [],
          kind: "settle_it_poll",
          leagueId: league.id,
          options: [league.homeTeamName, league.awayTeamName],
          persona: "trash_talker",
          promptText: "Settle it from nowhere?",
        },
      }),
    ).rejects.toMatchObject({
      code: "INSTIGATION_UNGROUNDED",
    });
  });

  it("records one vote per member, canonizes the poll result, and writes one verdict", async () => {
    const league = await seedLeague("close");
    const realtime = new RecordingRealtimePublisher();
    const seed = await seedInstigation({
      deps: aiDeps({ realtime }),
      input: {
        dedupKey: "week-4-verdict",
        groundingRefs: [
          {
            id: `${league.id}:team:home`,
            label: league.homeTeamName,
            type: "team",
          },
        ],
        kind: "settle_it_poll",
        leagueId: league.id,
        options: [league.homeTeamName, league.awayTeamName],
        persona: "trash_talker",
        promptText: `Settle it: does ${league.homeTeamName} own the villain edit?`,
      },
    });
    const pollId = seed.pollId;
    if (!pollId) throw new Error("poll was not created");

    await castPollVote({
      deps: aiDeps({ realtime }),
      input: {
        leagueId: league.id,
        memberId: league.memberAId,
        optionIdx: 0,
        pollId,
      },
    });
    await castPollVote({
      deps: aiDeps({ realtime }),
      input: {
        leagueId: league.id,
        memberId: league.memberBId,
        optionIdx: 1,
        pollId,
      },
    });
    await castPollVote({
      deps: aiDeps({ realtime }),
      input: {
        leagueId: league.id,
        memberId: league.memberBId,
        optionIdx: 0,
        pollId,
      },
    });

    const closed = await closePoll({
      deps: aiDeps({ realtime }),
      input: { leagueId: league.id, pollId },
    });
    const closedAgain = await closePoll({
      deps: aiDeps({ realtime }),
      input: { leagueId: league.id, pollId },
    });

    expect(closed).toMatchObject({
      status: "canonized",
      totalVotes: 2,
      winningOption: league.homeTeamName,
      winningOptionIdx: 0,
    });
    if (closed.status !== "canonized") {
      throw new Error("poll did not canonize");
    }
    expect(closedAgain).toMatchObject({
      loreClaimId: closed.loreClaimId,
      reused: true,
      status: "canonized",
    });
    expect(realtime.loreCanonized).toEqual([
      {
        at: "2026-06-14T12:00:00.000Z",
        claimId: closed.loreClaimId,
        leagueId: league.id,
        ratifiedBy: "vote",
        type: REALTIME_EVENTS.loreCanonized,
        v: 1,
      },
    ]);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claims: await tx
        .select()
        .from(loreClaims)
        .where(eq(loreClaims.leagueId, league.id)),
      events: await tx
        .select()
        .from(loreEvents)
        .where(eq(loreEvents.leagueId, league.id)),
      polls: await tx.select().from(polls).where(eq(polls.id, pollId)),
      posts: await tx
        .select({
          metadata: contentItems.metadata,
        })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        ),
      votes: await tx
        .select()
        .from(pollVotes)
        .where(eq(pollVotes.pollId, pollId)),
    }));

    expect(rows.votes).toHaveLength(2);
    expect(rows.votes.every((vote) => vote.optionIdx === 0)).toBe(true);
    expect(rows.polls[0]).toMatchObject({
      status: "closed",
      winningOptionIdx: 0,
    });
    expect(rows.claims).toHaveLength(1);
    expect(rows.claims[0]).toMatchObject({
      kind: "opinion",
      origin: "ai",
      ratifiedBy: "vote",
      sourcePollId: pollId,
      status: "canon",
    });
    expect(rows.claims[0]?.statement).toContain(league.homeTeamName);
    expect(rows.events.map((event) => event.kind).sort()).toEqual([
      "created",
      "ratified",
      "vote_opened",
    ]);

    const verdicts = rows.posts.filter(
      (post) =>
        (post.metadata as Record<string, unknown>).contentType ===
        "verdict_column",
    );
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.metadata).toMatchObject({
      structure: {
        newCanon: rows.claims[0]?.statement,
        type: "verdict_column",
      },
      triggerKey: `poll-closed:${pollId}`,
    });
  });
});
