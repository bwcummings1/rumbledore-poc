// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { and, eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockAiDependencies } from "@/ai";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  leagues,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { planCronContent, planGameFinalContent } from "./content-planning";
import { JOB_EVENTS } from "./events";
import { runContentGenerate } from "./functions/content-generate";
import {
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
import { functions } from "./index";

const marker = `contentplan-${randomUUID()}`;
let handle: DbHandle;

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
    });
    const second = await runContentPlanCron({
      cadence: "weekly-preview",
      deps: { db: handle.db },
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
  });

  it("plans game.final recaps and publishes them idempotently through content.generate", async () => {
    const league = await seedLeague("game-final");
    const gameId = await seedFinalMatchup({ league, tag: "game-final" });

    const first = await planGameFinalContent({
      data: { gameId, leagueId: league.id },
      db: handle.db,
    });
    const second = await planGameFinalContent({
      data: { gameId, leagueId: league.id },
      db: handle.db,
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
    const fn = createContentPlanGameFinalFunction(() => ({ db: handle.db }));
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

  it("rejects invalid game.final payloads without retrying", async () => {
    await expect(
      runContentPlanGameFinal({
        data: {
          gameId: "not-a-uuid",
          leagueId: randomUUID(),
        },
        deps: { db: handle.db },
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
    expect(functions).toContain(contentPlanPostOddsRefresh);
    expect(functions).toContain(contentPlanGameFinal);
  });
});
