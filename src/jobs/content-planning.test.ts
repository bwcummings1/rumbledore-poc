// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { and, eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockAiDependencies } from "@/ai";
import { DEFAULT_ENTITLEMENT_CAPS, parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  headToHeadRecords,
  instigations,
  leagueEntitlements,
  leagues,
  loreClaims,
  persons,
  polls,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { EntitlementResolverEnv } from "@/entitlements";
import {
  planCronContent,
  planGameFinalContent,
  planTriggeredContent,
} from "./content-planning";
import { JOB_EVENTS } from "./events";
import { runContentGenerate } from "./functions/content-generate";
import {
  contentPlanMidWeek,
  contentPlanPostOddsRefresh,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
  createContentPlanCronFunction,
  runContentPlanCron,
} from "./functions/content-plan-cron";
import {
  contentPlanGameFinal,
  createContentPlanGameFinalFunction,
  runContentPlanGameFinal,
} from "./functions/content-plan-game-final";
import {
  contentPlanArenaStandingsSwing,
  contentPlanBetSettled,
  contentPlanLoreCanonized,
  contentPlanPollClosed,
  contentPlanRecordBroken,
  contentPlanTransaction,
  contentPlanWaiver,
  createContentPlanTriggerFunction,
  runContentPlanTrigger,
} from "./functions/content-plan-trigger";
import { functions } from "./index";

const marker = `contentplan-${randomUUID()}`;
let handle: DbHandle;

function entitlementEnv(devOverride: boolean): EntitlementResolverEnv {
  return {
    entitlements: {
      caps: DEFAULT_ENTITLEMENT_CAPS,
      devOverride,
      gateArenaAdvanced: false,
    },
  };
}

const openEntitlementEnv = entitlementEnv(true);
const gatedEntitlementEnv = entitlementEnv(false);

function plannerDeps() {
  return { db: handle.db, env: openEntitlementEnv };
}

async function grantPremiumLeague(leagueId: string) {
  await handle.db.insert(leagueEntitlements).values({
    leagueId,
    tier: "premium",
  });
}

interface SeededLeague {
  id: string;
  providerLeagueId: string;
}

async function seedLeague(
  tag: string,
  status: "preseason" | "in_season" | "complete" = "in_season",
): Promise<SeededLeague> {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 3,
      name: `${marker} ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 2,
      sport: "ffl",
      status,
    })
    .returning({
      id: leagues.id,
      providerLeagueId: leagues.providerLeagueId,
    });
  if (!league) throw new Error("league was not inserted");

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
        losses: 4,
        name: `${tag} Home Team`,
        ownerMemberIds: [`${tag}-home-manager`],
        pointsAgainst: 420,
        pointsFor: 410,
        provider: "espn",
        providerTeamId: `${tag}-home-team`,
        season: 2026,
        wins: 1,
      },
      {
        contentHash: `${marker}-${tag}-away-team-hash`,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        losses: 1,
        name: `${tag} Away Team`,
        ownerMemberIds: [`${tag}-away-manager`],
        pointsAgainst: 360,
        pointsFor: 520,
        provider: "espn",
        providerTeamId: `${tag}-away-team`,
        season: 2026,
        wins: 4,
      },
    ]);
  });

  return league;
}

async function seedFinalMatchup({
  league,
  tag,
}: {
  league: SeededLeague;
  tag: string;
}): Promise<string> {
  const [matchup] = await withLeagueContext(handle.db, league.id, (tx) =>
    tx
      .insert(fantasyMatchups)
      .values({
        awayScore: 91,
        awayTeamProviderId: `${tag}-away-team`,
        contentHash: `${marker}-${tag}-matchup-hash`,
        homeScore: 134,
        homeTeamProviderId: `${tag}-home-team`,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        provider: "espn",
        providerMatchupId: `${tag}-game-1`,
        scoringPeriod: 3,
        season: 2026,
        status: "final",
        winner: "home",
      })
      .returning({ id: fantasyMatchups.id }),
  );
  if (!matchup) throw new Error("matchup was not inserted");
  return matchup.id;
}

async function leagueBlogPosts(leagueId: string) {
  return withLeagueContext(handle.db, leagueId, (tx) =>
    tx
      .select({
        authorPersona: contentItems.authorPersona,
        dedupKey: contentItems.dedupKey,
        id: contentItems.id,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(eq(contentItems.leagueId, leagueId), eq(contentItems.kind, "blog")),
      ),
  );
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
  await handle.pool.end();
});

describe("content planning", () => {
  it("plans weekly cron personas for active leagues with stable natural keys", async () => {
    const active = await seedLeague("cron-active");
    const complete = await seedLeague("cron-complete", "complete");

    const first = await planCronContent({
      cadence: "weekly-preview",
      db: handle.db,
      env: openEntitlementEnv,
    });
    const second = await runContentPlanCron({
      cadence: "weekly-preview",
      deps: plannerDeps(),
    });
    const firstForActive = first.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    const secondForActive = second.planned.filter(
      (event) => event.data.leagueId === active.id,
    );

    expect(firstForActive.map((event) => event.data.persona).sort()).toEqual([
      "analyst",
      "commissioner",
    ]);
    expect(
      firstForActive.map((event) => event.data.contentType).sort(),
    ).toEqual(["matchup_preview", "matchup_preview"]);
    expect(firstForActive.map((event) => event.data.triggerKey)).toStrictEqual([
      "cron:weekly-preview:2026:3",
      "cron:weekly-preview:2026:3",
    ]);
    expect(firstForActive.map((event) => event.id)).toEqual(
      secondForActive.map((event) => event.id),
    );
    expect(
      firstForActive.every((event) => event.name === "content.generate"),
    ).toBe(true);
    expect(
      first.planned.some((event) => event.data.leagueId === complete.id),
    ).toBe(false);
    expect(second.sentCount).toBe(0);

    const wrap = await planCronContent({
      cadence: "weekly-wrap",
      db: handle.db,
      env: openEntitlementEnv,
    });
    const wrapForActive = wrap.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    expect(wrapForActive.map((event) => event.data.contentType).sort()).toEqual(
      ["awards_superlatives", "power_rankings", "season_arc", "weekly_recap"],
    );
    expect(wrapForActive.map((event) => event.data.persona).sort()).toEqual([
      "analyst",
      "beat_reporter",
      "narrator",
      "narrator",
    ]);

    const midWeek = await planCronContent({
      cadence: "mid-week",
      db: handle.db,
      env: openEntitlementEnv,
    });
    const midWeekForActive = midWeek.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    expect(
      midWeekForActive.map((event) => event.data.contentType).sort(),
    ).toEqual(["instigation_column", "transaction_reaction"]);
    expect(midWeekForActive.map((event) => event.data.persona).sort()).toEqual([
      "beat_reporter",
      "trash_talker",
    ]);

    await withLeagueContext(handle.db, active.id, async (tx) => {
      const [personA] = await tx
        .insert(persons)
        .values({ canonicalName: "Rival A", leagueId: active.id })
        .returning({ id: persons.id });
      const [personB] = await tx
        .insert(persons)
        .values({ canonicalName: "Rival B", leagueId: active.id })
        .returning({ id: persons.id });
      if (!personA || !personB) {
        throw new Error("rivalry people were not inserted");
      }
      await tx.insert(headToHeadRecords).values({
        leagueId: active.id,
        meetings: 5,
        personAId: personA.id,
        personBId: personB.id,
        season: 2026,
      });
    });

    const rivalryPreview = await planCronContent({
      cadence: "weekly-preview",
      db: handle.db,
      env: openEntitlementEnv,
    });
    const rivalryForActive = rivalryPreview.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    expect(
      rivalryForActive.map((event) => event.data.contentType).sort(),
    ).toEqual(["matchup_preview", "matchup_preview", "rivalry_piece"]);

    const postOdds = await planCronContent({
      cadence: "post-odds-refresh",
      db: handle.db,
      env: openEntitlementEnv,
    });
    const postOddsForActive = postOdds.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    expect(
      postOddsForActive.map((event) => event.data.contentType).sort(),
    ).toEqual(["arena_recap", "matchup_preview"]);
    expect(postOddsForActive.map((event) => event.data.persona).sort()).toEqual(
      ["betting_advisor", "betting_advisor"],
    );
  });

  it("runs mid-week instigation candidates as poll-backed lore claims", async () => {
    const league = await seedLeague("midweek-instigation");
    const midWeek = await planCronContent({
      cadence: "mid-week",
      db: handle.db,
      env: openEntitlementEnv,
    });
    const event = midWeek.planned.find(
      (candidate) =>
        candidate.data.leagueId === league.id &&
        candidate.data.contentType === "instigation_column",
    );
    if (!event) {
      throw new Error("mid-week instigation candidate was not planned");
    }

    const first = await runContentGenerate({
      data: event.data,
      deps: {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        now: () => new Date("2026-06-14T12:00:00.000Z"),
      },
    });
    const second = await runContentGenerate({
      data: event.data,
      deps: {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        now: () => new Date("2026-06-14T12:00:00.000Z"),
      },
    });

    expect(first).toMatchObject({ reused: false, status: "published" });
    expect(second).toMatchObject({
      contentItemId:
        first.status === "published" ? first.contentItemId : undefined,
      reused: true,
      status: "published",
    });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      claims: await tx
        .select()
        .from(loreClaims)
        .where(eq(loreClaims.leagueId, league.id)),
      instigations: await tx
        .select()
        .from(instigations)
        .where(eq(instigations.leagueId, league.id)),
      polls: await tx.select().from(polls).where(eq(polls.leagueId, league.id)),
      posts: await tx
        .select({ metadata: contentItems.metadata })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        ),
    }));

    expect(rows.instigations).toHaveLength(1);
    expect(rows.instigations[0]).toMatchObject({
      kind: "settle_it_poll",
      persona: "trash_talker",
      status: "polling",
    });
    expect(rows.polls).toHaveLength(1);
    expect(rows.polls[0]).toMatchObject({
      instigationId: rows.instigations[0]?.id,
      status: "open",
    });
    expect(rows.claims).toHaveLength(1);
    expect(rows.claims[0]).toMatchObject({
      authorPersona: "trash_talker",
      origin: "ai",
      sourceInstigationId: rows.instigations[0]?.id,
      sourcePollId: rows.polls[0]?.id,
      status: "vote",
    });
    expect(rows.posts).toHaveLength(1);
    expect(rows.posts[0]?.metadata).toMatchObject({
      contentType: "instigation_column",
      triggerKey: `instigation:${rows.instigations[0]?.id}`,
    });
  });

  it("plans game.final recaps and publishes them idempotently through content.generate", async () => {
    const league = await seedLeague("game-final");
    const gameId = await seedFinalMatchup({ league, tag: "game-final" });

    const first = await planGameFinalContent({
      data: { gameId, leagueId: league.id },
      db: handle.db,
      env: openEntitlementEnv,
    });
    const second = await planGameFinalContent({
      data: { gameId, leagueId: league.id },
      db: handle.db,
      env: openEntitlementEnv,
    });

    expect(first.game).toMatchObject({
      gameId,
      scoringPeriod: 3,
      season: 2026,
      triggerReasons: ["blowout", "upset"],
    });
    expect(first.planned.map((event) => event.data.persona).sort()).toEqual([
      "analyst",
      "narrator",
      "trash_talker",
    ]);
    expect(first.planned.map((event) => event.data.contentType).sort()).toEqual(
      ["awards_superlatives", "power_rankings", "weekly_recap"],
    );
    expect(first.planned.map((event) => event.id)).toEqual(
      second.planned.map((event) => event.id),
    );
    expect(first.planned.map((event) => event.data.triggerKey)).toEqual([
      `game-final:2026:3:${gameId}`,
      `game-final:2026:3:${gameId}`,
      `game-final:2026:3:${gameId}`,
    ]);

    const milestone = await planGameFinalContent({
      data: {
        gameId,
        leagueId: league.id,
        milestoneKeys: ["highest_single_week_score"],
      },
      db: handle.db,
      env: openEntitlementEnv,
    });
    expect(
      milestone.planned
        .filter((event) => event.data.contentType === "milestone_record")
        .map((event) => ({
          persona: event.data.persona,
          triggerKey: event.data.triggerKey,
        }))
        .sort((left, right) => left.persona.localeCompare(right.persona)),
    ).toEqual([
      {
        persona: "analyst",
        triggerKey: "record-broken:highest_single_week_score",
      },
      {
        persona: "narrator",
        triggerKey: "record-broken:highest_single_week_score",
      },
    ]);

    const deps = {
      ...createMockAiDependencies(handle.db),
      duplicateThreshold: 1.1,
      now: () => new Date("2026-06-11T19:00:00.000Z"),
    };
    for (const event of first.planned) {
      await runContentGenerate({ data: event.data, deps });
    }
    for (const event of first.planned) {
      await runContentGenerate({ data: event.data, deps });
    }

    const posts = await leagueBlogPosts(league.id);
    expect(posts).toHaveLength(first.planned.length);
    expect(posts.map((post) => post.authorPersona).sort()).toEqual([
      "analyst",
      "narrator",
      "trash_talker",
    ]);
  });

  it("plans game.final content through the Inngest step API", async () => {
    const league = await seedLeague("job-game-final");
    const gameId = await seedFinalMatchup({ league, tag: "job-game-final" });
    const fn = createContentPlanGameFinalFunction(() => plannerDeps());
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        gameId,
        leagueId: league.id,
      },
      name: JOB_EVENTS.gameFinal,
    };

    const stepRun = await testEngine.executeStep("plan-content-generation", {
      events: [event],
    });

    expect(stepRun.result).toMatchObject({
      eventName: JOB_EVENTS.gameFinal,
      ok: true,
      sentCount: 0,
      skippedReason: null,
    });
    expect(stepRun.result).toMatchObject({
      planned: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            contentType: "weekly_recap",
            leagueId: league.id,
            persona: "narrator",
            triggerKey: `game-final:2026:3:${gameId}`,
          }),
          name: JOB_EVENTS.contentGenerate,
        }),
      ]),
    });
  });

  it("plans every event-driven content trigger with stable natural keys", async () => {
    const leagueId = randomUUID();
    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: { leagueId, transactionId: "tx-1" },
          eventName: JOB_EVENTS.transaction,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "transaction_reaction",
        leagueId,
        persona: "beat_reporter",
        triggerKey: "transaction:tx-1",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: { leagueId, waiverId: "waiver-1" },
          eventName: JOB_EVENTS.waiver,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "transaction_reaction",
        leagueId,
        persona: "beat_reporter",
        triggerKey: "waiver:waiver-1",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: { leagueId, recordKey: "all_time_score" },
          eventName: JOB_EVENTS.recordBroken,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "milestone_record",
        leagueId,
        persona: "analyst",
        triggerKey: "record-broken:all_time_score",
      },
      {
        contentType: "milestone_record",
        leagueId,
        persona: "narrator",
        triggerKey: "record-broken:all_time_score",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: { claimId: "claim-1", leagueId },
          eventName: JOB_EVENTS.loreCanonized,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "verdict_column",
        leagueId,
        persona: "commissioner",
        triggerKey: "lore-canonized:claim-1",
      },
      {
        contentType: "milestone_record",
        leagueId,
        persona: "narrator",
        triggerKey: "lore-canonized:claim-1",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: { claimId: "claim-1", leagueId, sourcePollId: "poll-1" },
          eventName: JOB_EVENTS.loreCanonized,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "verdict_column",
        leagueId,
        persona: "commissioner",
        triggerKey: "poll-closed:poll-1",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: { leagueId, pollId: "poll-1" },
          eventName: JOB_EVENTS.pollClosed,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "verdict_column",
        leagueId,
        persona: "commissioner",
        triggerKey: "poll-closed:poll-1",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: {
            leagueId,
            seasonId: "season-1",
            swingKey: "settlement:settle-1:league-1",
          },
          eventName: JOB_EVENTS.arenaStandingsSwing,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "arena_recap",
        leagueId,
        persona: "narrator",
        triggerKey: "arena-swing:season-1:settlement:settle-1:league-1",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: {
            bettingEventId: "event-1",
            leagueId,
            settlementId: "settle-1",
          },
          eventName: JOB_EVENTS.betSettled,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "awards_superlatives",
        leagueId,
        persona: "trash_talker",
        triggerKey: "bet-settled:settle-1",
      },
      {
        contentType: "matchup_preview",
        leagueId,
        persona: "betting_advisor",
        triggerKey: "bet-settled:settle-1",
      },
    ]);
  });

  it("skips cadence planning for free leagues and still plans for premium leagues", async () => {
    const free = await seedLeague("cadence-free");
    const premium = await seedLeague("cadence-premium");
    await grantPremiumLeague(premium.id);

    const cron = await planCronContent({
      cadence: "weekly-preview",
      db: handle.db,
      env: gatedEntitlementEnv,
    });

    expect(cron.planned.some((event) => event.data.leagueId === free.id)).toBe(
      false,
    );
    expect(cron.skipped).toContainEqual(
      expect.objectContaining({
        leagueId: free.id,
        reason: "TIER_REQUIRED",
        requiredTier: "premium",
      }),
    );
    expect(
      cron.planned.filter((event) => event.data.leagueId === premium.id),
    ).toHaveLength(2);

    const gameId = await seedFinalMatchup({
      league: free,
      tag: "cadence-free",
    });
    await expect(
      planGameFinalContent({
        data: { gameId, leagueId: free.id },
        db: handle.db,
        env: gatedEntitlementEnv,
      }),
    ).resolves.toMatchObject({
      planned: [],
      skippedEntitlement: {
        leagueId: free.id,
        reason: "TIER_REQUIRED",
        requiredTier: "premium",
      },
      skippedReason: "entitlement:TIER_REQUIRED:requires_premium",
    });

    await expect(
      planTriggeredContent({
        data: { leagueId: free.id, transactionId: "tx-free" },
        db: handle.db,
        env: gatedEntitlementEnv,
        eventName: JOB_EVENTS.transaction,
      }),
    ).resolves.toMatchObject({
      planned: [],
      skippedEntitlement: {
        leagueId: free.id,
        reason: "TIER_REQUIRED",
        requiredTier: "premium",
      },
      skippedReason: "entitlement:TIER_REQUIRED:requires_premium",
    });
  });

  it("plans event-driven content through the Inngest step API", async () => {
    const leagueId = randomUUID();
    const fn = createContentPlanTriggerFunction(
      {
        eventName: JOB_EVENTS.betSettled,
        functionId: `${marker}-bet-settled-trigger`,
        name: "Bet settled trigger smoke",
      },
      () => plannerDeps(),
    );
    const testEngine = new InngestTestEngine({ function: fn });
    const stepRun = await testEngine.executeStep("plan-content-generation", {
      events: [
        {
          data: {
            bettingEventId: randomUUID(),
            leagueId,
            settlementId: randomUUID(),
          },
          name: JOB_EVENTS.betSettled,
        },
      ],
    });

    expect(stepRun.result).toMatchObject({
      eventName: JOB_EVENTS.betSettled,
      ok: true,
      planned: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            contentType: "awards_superlatives",
            leagueId,
            persona: "trash_talker",
          }),
          name: JOB_EVENTS.contentGenerate,
        }),
      ]),
      sentCount: 0,
      skippedReason: null,
    });
  });

  it("rejects invalid game.final payloads without retrying", async () => {
    await expect(
      runContentPlanGameFinal({
        data: {
          gameId: "not-a-uuid",
          leagueId: randomUUID(),
        },
        deps: plannerDeps(),
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("rejects invalid event-trigger payloads without retrying", async () => {
    await expect(
      runContentPlanTrigger({
        data: {
          leagueId: "not-a-uuid",
          transactionId: "tx-1",
        },
        deps: plannerDeps(),
        eventName: JOB_EVENTS.transaction,
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("is exported through the shared function registry", () => {
    const cronFn = createContentPlanCronFunction({
      cadence: "weekly-wrap",
      functionId: `${marker}-registry-smoke`,
      name: "Registry smoke",
      schedule: "0 12 * * 2",
    });

    expect(cronFn).toBeDefined();
    expect(functions).toContain(contentPlanWeeklyPreview);
    expect(functions).toContain(contentPlanWeeklyWrap);
    expect(functions).toContain(contentPlanMidWeek);
    expect(functions).toContain(contentPlanPostOddsRefresh);
    expect(functions).toContain(contentPlanGameFinal);
    expect(functions).toContain(contentPlanTransaction);
    expect(functions).toContain(contentPlanWaiver);
    expect(functions).toContain(contentPlanRecordBroken);
    expect(functions).toContain(contentPlanLoreCanonized);
    expect(functions).toContain(contentPlanPollClosed);
    expect(functions).toContain(contentPlanBetSettled);
    expect(functions).toContain(contentPlanArenaStandingsSwing);
  });
});
