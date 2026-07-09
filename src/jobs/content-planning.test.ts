// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { and, eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockAiDependencies, MockLlmClient, MockLlmJudge } from "@/ai";
import { DEFAULT_ENTITLEMENT_CAPS, parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiGenerationRuns,
  allTimeRecords,
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
import { MockNflCalendar, type NflWeekState } from "@/sports/nfl-calendar";
import {
  planCronContent,
  planGameFinalContent,
  planLaunchEditionContent,
  planTriggeredContent,
} from "./content-planning";
import { JOB_EVENTS } from "./events";
import { runContentGenerate } from "./functions/content-generate";
import {
  contentPlanMidWeek,
  contentPlanOffseasonBeat,
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
  contentPlanLaunchEdition,
  createContentPlanLaunchEditionFunction,
  runContentPlanLaunchEdition,
} from "./functions/content-plan-launch-edition";
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

const regularPreKickoffState = {
  gamePhase: "pre_kickoff",
  phase: "regular",
  seasonWeek: 7,
} as const satisfies NflWeekState;

const regularPostGamesState = {
  gamePhase: "post_games",
  phase: "regular",
  seasonWeek: 7,
} as const satisfies NflWeekState;

const regularQuietState = {
  gamePhase: "quiet",
  phase: "regular",
  seasonWeek: 7,
} as const satisfies NflWeekState;

const regularByeQuietState = {
  gamePhase: "quiet",
  isQuietWeek: true,
  phase: "regular",
  seasonWeek: 12,
} as const satisfies NflWeekState;

const playoffPostGamesState = {
  gamePhase: "post_games",
  phase: "playoffs",
  seasonWeek: 17,
} as const satisfies NflWeekState;

const offseasonState = {
  gamePhase: "quiet",
  phase: "offseason",
  seasonWeek: null,
} as const satisfies NflWeekState;

const preseasonQuietState = {
  gamePhase: "quiet",
  phase: "preseason",
  seasonWeek: null,
} as const satisfies NflWeekState;

function entitlementEnv(
  devOverride: boolean,
  caps: EntitlementResolverEnv["entitlements"]["caps"] = DEFAULT_ENTITLEMENT_CAPS,
): EntitlementResolverEnv {
  return {
    entitlements: {
      caps,
      devOverride,
      gateArenaAdvanced: false,
    },
  };
}

const openEntitlementEnv = entitlementEnv(true);
const gatedEntitlementEnv = entitlementEnv(false);

function mockNflCalendar(state: NflWeekState): MockNflCalendar {
  return new MockNflCalendar(state);
}

function plannerDeps(state: NflWeekState = regularPreKickoffState) {
  return {
    db: handle.db,
    env: openEntitlementEnv,
    nflCalendar: mockNflCalendar(state),
  };
}

async function grantPremiumLeague(leagueId: string) {
  await handle.db.insert(leagueEntitlements).values({
    leagueId,
    tier: "premium",
  });
}

async function seedAiGenerationRuns({
  count,
  createdAt,
  leagueId,
  tag,
}: {
  count: number;
  createdAt: Date;
  leagueId: string;
  tag: string;
}) {
  await withLeagueContext(handle.db, leagueId, async (tx) => {
    for (let index = 0; index < count; index += 1) {
      await tx.insert(aiGenerationRuns).values({
        createdAt,
        leagueId,
        persona: "narrator",
        status: "published",
        triggerKey: `${tag}:${index}`,
        updatedAt: createdAt,
      });
    }
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

async function seedLaunchEditionFacts({
  league,
  tag,
}: {
  league: SeededLeague;
  tag: string;
}) {
  await withLeagueContext(handle.db, league.id, async (tx) => {
    const [homePerson, awayPerson] = await tx
      .insert(persons)
      .values([
        {
          canonicalName: `${tag} Home Manager`,
          leagueId: league.id,
        },
        {
          canonicalName: `${tag} Away Manager`,
          leagueId: league.id,
        },
      ])
      .returning({ id: persons.id });
    if (!homePerson || !awayPerson) {
      throw new Error("launch people were not inserted");
    }

    await tx.insert(headToHeadRecords).values({
      currentStreakLength: 2,
      currentStreakPersonId: homePerson.id,
      leagueId: league.id,
      longestStreakLength: 3,
      longestStreakPersonId: awayPerson.id,
      meetings: 9,
      personAId: homePerson.id,
      personAWins: 5,
      personBId: awayPerson.id,
      personBWins: 4,
      season: 2026,
      ties: 0,
    });

    const [previousRecord] = await tx
      .insert(allTimeRecords)
      .values({
        holderPersonId: awayPerson.id,
        isCurrent: false,
        leagueId: league.id,
        recordType: "highest_single_week_score",
        scoringPeriod: 2,
        season: 2025,
        value: 147.6,
      })
      .returning({ id: allTimeRecords.id });
    if (!previousRecord) {
      throw new Error("launch previous record was not inserted");
    }

    await tx.insert(allTimeRecords).values({
      holderPersonId: homePerson.id,
      isCurrent: true,
      leagueId: league.id,
      previousRecordId: previousRecord.id,
      recordType: "highest_single_week_score",
      scoringPeriod: 4,
      season: 2026,
      value: 188.4,
    });
  });
}

async function leagueBlogPosts(leagueId: string) {
  return withLeagueContext(handle.db, leagueId, (tx) =>
    tx
      .select({
        authorPersona: contentItems.authorPersona,
        dedupKey: contentItems.dedupKey,
        id: contentItems.id,
        metadata: contentItems.metadata,
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
      nflCalendar: mockNflCalendar(regularPreKickoffState),
    });
    const second = await runContentPlanCron({
      cadence: "weekly-preview",
      deps: plannerDeps(regularPreKickoffState),
    });
    const firstForActive = first.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    const secondForActive = second.planned.filter(
      (event) => event.data.leagueId === active.id,
    );

    expect(
      firstForActive.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
      })),
    ).toEqual([
      { contentType: "matchup_preview", persona: "commissioner" },
      { contentType: "matchup_preview", persona: "analyst" },
    ]);
    expect(firstForActive.map((event) => event.data.triggerKey)).toStrictEqual([
      "cron:weekly-preview:regular:7",
      "cron:weekly-preview:regular:7",
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
      nflCalendar: mockNflCalendar(regularPostGamesState),
    });
    const wrapForActive = wrap.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    expect(
      wrapForActive.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
      })),
    ).toEqual([
      { contentType: "weekly_recap", persona: "narrator" },
      { contentType: "power_rankings", persona: "analyst" },
      { contentType: "awards_superlatives", persona: "trash_talker" },
    ]);

    const midWeek = await planCronContent({
      cadence: "mid-week",
      db: handle.db,
      env: openEntitlementEnv,
      nflCalendar: mockNflCalendar(regularQuietState),
    });
    const midWeekForActive = midWeek.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    expect(
      midWeekForActive.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
      })),
    ).toEqual([
      { contentType: "power_rankings", persona: "analyst" },
      { contentType: "awards_superlatives", persona: "beat_reporter" },
      { contentType: "instigation_column", persona: "trash_talker" },
      { contentType: "season_arc", persona: "narrator" },
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
      nflCalendar: mockNflCalendar(regularPreKickoffState),
    });
    const rivalryForActive = rivalryPreview.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    expect(
      rivalryForActive.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
      })),
    ).toEqual([
      { contentType: "matchup_preview", persona: "commissioner" },
      { contentType: "matchup_preview", persona: "analyst" },
      { contentType: "rivalry_piece", persona: "trash_talker" },
    ]);

    const postOdds = await planCronContent({
      cadence: "post-odds-refresh",
      db: handle.db,
      env: openEntitlementEnv,
      nflCalendar: mockNflCalendar(regularPreKickoffState),
    });
    const postOddsForActive = postOdds.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    expect(
      postOddsForActive.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
      })),
    ).toEqual([
      { contentType: "matchup_preview", persona: "betting_advisor" },
      { contentType: "arena_recap", persona: "betting_advisor" },
    ]);

    const offseasonPostOdds = await planCronContent({
      cadence: "post-odds-refresh",
      db: handle.db,
      env: openEntitlementEnv,
      nflCalendar: mockNflCalendar(offseasonState),
      now: () => new Date("2026-06-15T12:00:00.000Z"),
    });
    expect(offseasonPostOdds.nflWeekState).toEqual(offseasonState);
    expect(
      offseasonPostOdds.planned.some(
        (event) => event.data.leagueId === active.id,
      ),
    ).toBe(false);
  });

  it("plans missed in-season weeks with distinct backfill keys", async () => {
    const league = await seedLeague("cadence-backfill");
    const missedWeekState = {
      ...regularPostGamesState,
      seasonWeek: 6,
    } as const satisfies NflWeekState;
    const currentWeek = await planCronContent({
      cadence: "weekly-wrap",
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: regularPostGamesState,
      now: () => new Date("2026-10-13T12:00:00.000Z"),
    });
    const missedWeekFirst = await planCronContent({
      cadence: "weekly-wrap",
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: missedWeekState,
      now: () => new Date("2026-10-06T12:00:00.000Z"),
    });
    const missedWeekSecond = await runContentPlanCron({
      cadence: "weekly-wrap",
      deps: {
        ...plannerDeps(),
        nflWeekState: missedWeekState,
        now: () => new Date("2026-10-07T12:00:00.000Z"),
      },
    });

    const currentForLeague = currentWeek.planned.filter(
      (event) => event.data.leagueId === league.id,
    );
    const missedFirstForLeague = missedWeekFirst.planned.filter(
      (event) => event.data.leagueId === league.id,
    );
    const missedSecondForLeague = missedWeekSecond.planned.filter(
      (event) => event.data.leagueId === league.id,
    );

    expect(
      missedFirstForLeague.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
      })),
    ).toEqual([
      { contentType: "weekly_recap", persona: "narrator" },
      { contentType: "power_rankings", persona: "analyst" },
      { contentType: "awards_superlatives", persona: "trash_talker" },
    ]);
    expect(
      missedFirstForLeague.map((event) => event.data.triggerKey),
    ).toStrictEqual([
      "cron:weekly-wrap:regular:6",
      "cron:weekly-wrap:regular:6",
      "cron:weekly-wrap:regular:6",
    ]);
    expect(
      currentForLeague.map((event) => event.data.triggerKey),
    ).toStrictEqual([
      "cron:weekly-wrap:regular:7",
      "cron:weekly-wrap:regular:7",
      "cron:weekly-wrap:regular:7",
    ]);
    expect(missedFirstForLeague.map((event) => event.id)).toEqual(
      missedSecondForLeague.map((event) => event.id),
    );
    expect(missedFirstForLeague.map((event) => event.id)).not.toEqual(
      currentForLeague.map((event) => event.id),
    );
  });

  it("plans a distinct offseason and preseason quiet-week cadence", async () => {
    const active = await seedLeague("offseason-active");
    const complete = await seedLeague("offseason-complete", "complete");
    const offseasonNow = new Date("2026-06-15T12:00:00.000Z");
    const preseasonNow = new Date("2026-08-10T12:00:00.000Z");

    const offseasonFirst = await planCronContent({
      cadence: "offseason-beat",
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: offseasonState,
      now: () => offseasonNow,
    });
    const offseasonSecond = await runContentPlanCron({
      cadence: "offseason-beat",
      deps: {
        ...plannerDeps(),
        nflWeekState: offseasonState,
        now: () => offseasonNow,
      },
    });

    const offseasonForComplete = offseasonFirst.planned.filter(
      (event) => event.data.leagueId === complete.id,
    );
    const offseasonSecondForComplete = offseasonSecond.planned.filter(
      (event) => event.data.leagueId === complete.id,
    );
    expect(
      offseasonFirst.planned.some((event) => event.data.leagueId === active.id),
    ).toBe(true);
    expect(
      offseasonForComplete.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
      })),
    ).toEqual([
      { contentType: "season_arc", persona: "narrator" },
      { contentType: "awards_superlatives", persona: "beat_reporter" },
      { contentType: "instigation_column", persona: "trash_talker" },
    ]);
    expect(
      offseasonForComplete.map((event) => event.data.triggerKey),
    ).toStrictEqual([
      "cron:offseason-beat:offseason:2026-w25",
      "cron:offseason-beat:offseason:2026-w25",
      "cron:offseason-beat:offseason:2026-w25",
    ]);
    expect(
      offseasonForComplete.some((event) =>
        ["weekly_recap", "matchup_preview", "arena_recap"].includes(
          event.data.contentType,
        ),
      ),
    ).toBe(false);
    expect(offseasonForComplete.map((event) => event.id)).toEqual(
      offseasonSecondForComplete.map((event) => event.id),
    );

    const preseason = await planCronContent({
      cadence: "offseason-beat",
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: preseasonQuietState,
      now: () => preseasonNow,
    });
    const preseasonForComplete = preseason.planned.filter(
      (event) => event.data.leagueId === complete.id,
    );
    expect(
      preseasonForComplete.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
        triggerKey: event.data.triggerKey,
      })),
    ).toEqual([
      {
        contentType: "season_arc",
        persona: "commissioner",
        triggerKey: "cron:offseason-beat:preseason:2026-w33",
      },
      {
        contentType: "power_rankings",
        persona: "analyst",
        triggerKey: "cron:offseason-beat:preseason:2026-w33",
      },
    ]);

    const regularQuietWithoutSignal = await planCronContent({
      cadence: "offseason-beat",
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: regularQuietState,
      now: () => new Date("2026-10-14T12:00:00.000Z"),
    });
    expect(
      regularQuietWithoutSignal.planned.some(
        (event) =>
          event.data.leagueId === active.id ||
          event.data.leagueId === complete.id,
      ),
    ).toBe(false);

    const regularQuietBeat = await planCronContent({
      cadence: "offseason-beat",
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: regularByeQuietState,
      now: () => new Date("2026-11-18T12:00:00.000Z"),
    });
    const regularQuietForActive = regularQuietBeat.planned.filter(
      (event) => event.data.leagueId === active.id,
    );
    expect(
      regularQuietForActive.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
        triggerKey: event.data.triggerKey,
      })),
    ).toEqual([
      {
        contentType: "season_arc",
        persona: "narrator",
        triggerKey: "cron:offseason-beat:regular:12",
      },
      {
        contentType: "awards_superlatives",
        persona: "beat_reporter",
        triggerKey: "cron:offseason-beat:regular:12",
      },
      {
        contentType: "instigation_column",
        persona: "trash_talker",
        triggerKey: "cron:offseason-beat:regular:12",
      },
    ]);
    expect(
      regularQuietBeat.planned.some(
        (event) => event.data.leagueId === complete.id,
      ),
    ).toBe(false);
  });

  it("plans scheduled cron content through the Inngest step API", async () => {
    const league = await seedLeague("job-cron-wrap");
    const fn = createContentPlanCronFunction(
      {
        cadence: "weekly-wrap",
        functionId: `${marker}-weekly-wrap-cron`,
        name: "Weekly wrap cron smoke",
        schedule: "0 12 * * 2",
      },
      () => ({
        ...plannerDeps(),
        nflWeekState: regularPostGamesState,
      }),
    );
    const testEngine = new InngestTestEngine({ function: fn });

    const stepRun = await testEngine.executeStep("plan-content-generation", {
      events: [{ data: {}, name: "inngest/scheduled.timer" }],
    });

    expect(stepRun.result).toMatchObject({
      cadence: "weekly-wrap",
      nflWeekState: regularPostGamesState,
      ok: true,
      sentCount: 0,
    });
    expect(stepRun.result).toMatchObject({
      planned: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            contentType: "weekly_recap",
            leagueId: league.id,
            persona: "narrator",
            triggerKey: "cron:weekly-wrap:regular:7",
          }),
          name: JOB_EVENTS.contentGenerate,
        }),
      ]),
    });
  });

  it("runs mid-week instigation candidates as poll-backed lore claims", async () => {
    const league = await seedLeague("midweek-instigation");
    const midWeek = await planCronContent({
      cadence: "mid-week",
      db: handle.db,
      env: openEntitlementEnv,
      nflCalendar: mockNflCalendar(regularQuietState),
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
      nflWeekState: regularPostGamesState,
    });
    const second = await planGameFinalContent({
      data: { gameId, leagueId: league.id },
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: regularPostGamesState,
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
      "cron:weekly-wrap:regular:7",
      "cron:weekly-wrap:regular:7",
      "cron:weekly-wrap:regular:7",
    ]);

    const milestone = await planGameFinalContent({
      data: {
        gameId,
        leagueId: league.id,
        milestoneKeys: ["highest_single_week_score"],
      },
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: regularPostGamesState,
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

    const playoff = await planGameFinalContent({
      data: { gameId, leagueId: league.id },
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: playoffPostGamesState,
    });
    expect(playoff.game?.triggerReasons).toContain("stakes:playoffs");
    expect(playoff.planned.map((event) => event.data.triggerKey)).toEqual([
      "cron:weekly-wrap:playoffs:17",
      "cron:weekly-wrap:playoffs:17",
      "cron:weekly-wrap:playoffs:17",
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
    const fn = createContentPlanGameFinalFunction(() => ({
      ...plannerDeps(),
      nflWeekState: regularPostGamesState,
    }));
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
            triggerKey: "cron:weekly-wrap:regular:7",
          }),
          name: JOB_EVENTS.contentGenerate,
        }),
      ]),
    });
  });

  it("plans a cold-start launch edition with stable natural keys", async () => {
    const league = await seedLeague("launch-plan");
    await seedLaunchEditionFacts({ league, tag: "launch-plan" });

    const first = await planLaunchEditionContent({
      data: { leagueId: league.id },
      db: handle.db,
      env: openEntitlementEnv,
    });
    const second = await runContentPlanLaunchEdition({
      data: { leagueId: league.id },
      deps: {
        db: handle.db,
        env: openEntitlementEnv,
      },
    });

    expect(first).toMatchObject({
      eventName: JOB_EVENTS.leagueConnected,
      league: {
        id: league.id,
        status: "in_season",
      },
      skippedReason: null,
    });
    expect(
      first.planned.map((event) => ({
        contentType: event.data.contentType,
        persona: event.data.persona,
        triggerKey: event.data.triggerKey,
      })),
    ).toEqual([
      {
        contentType: "season_arc",
        persona: "narrator",
        triggerKey: "launch-edition:v1",
      },
      {
        contentType: "rivalry_piece",
        persona: "trash_talker",
        triggerKey: "launch-edition:v1",
      },
      {
        contentType: "milestone_record",
        persona: "analyst",
        triggerKey: "launch-edition:v1",
      },
    ]);
    expect(first.planned.map((event) => event.id)).toEqual(
      second.planned.map((event) => event.id),
    );
    expect(second.sentCount).toBe(0);
  });

  it("publishes the launch edition through the judged pipeline and reuses it on replay", async () => {
    const league = await seedLeague("launch-publish");
    await seedLaunchEditionFacts({ league, tag: "launch-publish" });
    const plan = await planLaunchEditionContent({
      data: { leagueId: league.id },
      db: handle.db,
      env: openEntitlementEnv,
    });
    const judge = new MockLlmJudge();
    const llm = new MockLlmClient();
    const deps = {
      ...createMockAiDependencies(handle.db),
      duplicateThreshold: 1.1,
      judge,
      llm,
      now: () => new Date("2026-06-11T12:00:00.000Z"),
    };

    for (const event of plan.planned) {
      await runContentGenerate({ data: event.data, deps });
    }
    for (const event of plan.planned) {
      await runContentGenerate({ data: event.data, deps });
    }

    const posts = await leagueBlogPosts(league.id);
    expect(posts).toHaveLength(3);
    expect(posts.map((post) => post.dedupKey).sort()).toEqual([
      "blog:analyst:milestone_record:launch-edition:v1",
      "blog:narrator:season_arc:launch-edition:v1",
      "blog:trash_talker:rivalry_piece:launch-edition:v1",
    ]);
    expect(
      posts
        .map((post) => post.metadata.contentType)
        .sort((left, right) => String(left).localeCompare(String(right))),
    ).toEqual(["milestone_record", "rivalry_piece", "season_arc"]);
    expect(judge.requests).toHaveLength(3);
    expect(
      llm.requests.every(
        (request) =>
          request.context.trigger.cadence?.event === "league.connected" &&
          request.context.trigger.cadence?.stakes.includes(
            "cold_start_launch",
          ) &&
          request.prompt.userTask?.includes("cold-start issue"),
      ),
    ).toBe(true);
  });

  it("plans launch edition content through the Inngest step API", async () => {
    const league = await seedLeague("job-launch");
    const fn = createContentPlanLaunchEditionFunction(() => ({
      db: handle.db,
      env: openEntitlementEnv,
    }));
    const testEngine = new InngestTestEngine({ function: fn });

    const stepRun = await testEngine.executeStep("plan-launch-edition", {
      events: [
        {
          data: {
            leagueId: league.id,
          },
          name: JOB_EVENTS.leagueConnected,
        },
      ],
    });

    expect(stepRun.result).toMatchObject({
      eventName: JOB_EVENTS.leagueConnected,
      ok: true,
      planned: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            contentType: "season_arc",
            leagueId: league.id,
            persona: "narrator",
            triggerKey: "launch-edition:v1",
          }),
          name: JOB_EVENTS.contentGenerate,
        }),
      ]),
      sentCount: 0,
      skippedReason: null,
    });
  });

  it("keeps launch edition entitlement-aware and capped", async () => {
    const free = await seedLeague("launch-free");
    await expect(
      planLaunchEditionContent({
        data: { leagueId: free.id },
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

    const now = new Date("2026-06-18T12:00:00.000Z");
    const capped = await seedLeague("launch-cap");
    await grantPremiumLeague(capped.id);
    await seedAiGenerationRuns({
      count: 1,
      createdAt: now,
      leagueId: capped.id,
      tag: "launch-cap",
    });
    const env = entitlementEnv(false, {
      ...DEFAULT_ENTITLEMENT_CAPS,
      aiPostsPerWeek: 2,
    });

    await expect(
      planLaunchEditionContent({
        data: { leagueId: capped.id },
        db: handle.db,
        env,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      planned: [
        expect.objectContaining({
          data: expect.objectContaining({
            contentType: "season_arc",
            triggerKey: "launch-edition:v1",
          }),
        }),
      ],
      skippedEntitlement: null,
      skippedReason: "launch_edition_capped",
    });
  });

  it("carries reactive playoff framing into the generated content task", async () => {
    const league = await seedLeague("game-final-playoff-context");
    const gameId = await seedFinalMatchup({
      league,
      tag: "game-final-playoff-context",
    });
    const plan = await planGameFinalContent({
      data: { gameId, leagueId: league.id },
      db: handle.db,
      env: openEntitlementEnv,
      nflWeekState: playoffPostGamesState,
    });
    const recap = plan.planned.find(
      (event) => event.data.contentType === "weekly_recap",
    );
    if (!recap) {
      throw new Error("playoff recap was not planned");
    }

    const llm = new MockLlmClient();
    const deps = {
      ...createMockAiDependencies(handle.db),
      duplicateThreshold: 1.1,
      llm,
      now: () => new Date("2026-01-12T12:00:00.000Z"),
    };
    await runContentGenerate({ data: recap.data, deps });

    expect(llm.requests[0]?.context.trigger.cadence).toMatchObject({
      cadence: "weekly-wrap",
      event: "game.final",
      gamePhase: "post_games",
      phase: "playoffs",
      seasonWeek: 17,
      stakes: ["playoff_stakes"],
      weekToken: "17",
    });
    expect(llm.requests[0]?.prompt.volatileContext).toContain(
      '"phase":"playoffs"',
    );
    expect(llm.requests[0]?.prompt.volatileContext).toContain(
      '"playoff_stakes"',
    );
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
          nflWeekState: regularQuietState,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "verdict_column",
        leagueId,
        persona: "commissioner",
        triggerKey: "lore-canonized:regular:7:claim-1",
      },
      {
        contentType: "milestone_record",
        leagueId,
        persona: "narrator",
        triggerKey: "lore-canonized:regular:7:claim-1",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: { claimId: "claim-1", leagueId, sourcePollId: "poll-1" },
          eventName: JOB_EVENTS.loreCanonized,
          nflWeekState: regularQuietState,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "verdict_column",
        leagueId,
        persona: "commissioner",
        triggerKey: "poll-closed:regular:7:poll-1",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: { leagueId, pollId: "poll-1" },
          eventName: JOB_EVENTS.pollClosed,
          nflWeekState: regularQuietState,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "verdict_column",
        leagueId,
        persona: "commissioner",
        triggerKey: "poll-closed:regular:7:poll-1",
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
          nflWeekState: regularQuietState,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "arena_recap",
        leagueId,
        persona: "narrator",
        triggerKey:
          "arena-swing:regular:7:season-1:settlement:settle-1:league-1",
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
          nflWeekState: regularQuietState,
        })
      ).planned.map((event) => event.data),
    ).toEqual([
      {
        contentType: "awards_superlatives",
        leagueId,
        persona: "trash_talker",
        triggerKey: "bet-settled:regular:7:settle-1",
      },
      {
        contentType: "matchup_preview",
        leagueId,
        persona: "betting_advisor",
        triggerKey: "bet-settled:regular:7:settle-1",
      },
    ]);

    expect(
      (
        await planTriggeredContent({
          db: handle.db,
          env: openEntitlementEnv,
          data: { claimId: "claim-1", leagueId },
          eventName: JOB_EVENTS.loreCanonized,
          nflWeekState: offseasonState,
          now: () => new Date("2026-06-15T12:00:00.000Z"),
        })
      ).planned.map((event) => event.data.triggerKey),
    ).toEqual([
      "lore-canonized:offseason:2026-w25:claim-1",
      "lore-canonized:offseason:2026-w25:claim-1",
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
      nflCalendar: mockNflCalendar(regularPreKickoffState),
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

    const offseasonCron = await planCronContent({
      cadence: "offseason-beat",
      db: handle.db,
      env: gatedEntitlementEnv,
      nflWeekState: offseasonState,
      now: () => new Date("2026-06-15T12:00:00.000Z"),
    });
    expect(
      offseasonCron.planned.some((event) => event.data.leagueId === free.id),
    ).toBe(false);
    expect(offseasonCron.skipped).toContainEqual(
      expect.objectContaining({
        leagueId: free.id,
        reason: "TIER_REQUIRED",
        requiredTier: "premium",
      }),
    );
    expect(
      offseasonCron.planned.filter(
        (event) => event.data.leagueId === premium.id,
      ),
    ).toHaveLength(3);

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

  it("skips premium cadence planning when the weekly AI post cap is reached", async () => {
    const now = new Date("2026-06-17T12:00:00.000Z");
    const capped = await seedLeague("cadence-cap");
    await grantPremiumLeague(capped.id);
    await seedAiGenerationRuns({
      count: 1,
      createdAt: now,
      leagueId: capped.id,
      tag: "cadence-cap",
    });

    const env = entitlementEnv(false, {
      ...DEFAULT_ENTITLEMENT_CAPS,
      aiPostsPerWeek: 1,
    });

    const cron = await planCronContent({
      cadence: "weekly-preview",
      db: handle.db,
      env,
      nflCalendar: mockNflCalendar(regularPreKickoffState),
      now: () => now,
    });
    expect(
      cron.planned.some((event) => event.data.leagueId === capped.id),
    ).toBe(false);
    expect(cron.skipped).toContainEqual(
      expect.objectContaining({
        leagueId: capped.id,
        reason: "CAP_EXCEEDED",
        requiredTier: "premium",
        tier: "premium",
      }),
    );

    await expect(
      planTriggeredContent({
        data: { leagueId: capped.id, transactionId: "tx-capped" },
        db: handle.db,
        env,
        eventName: JOB_EVENTS.transaction,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      planned: [],
      skippedEntitlement: {
        leagueId: capped.id,
        reason: "CAP_EXCEEDED",
        requiredTier: "premium",
        tier: "premium",
      },
      skippedReason: "entitlement:CAP_EXCEEDED:requires_premium",
    });
  });

  it("uses league cap overrides before skipping cadence planning", async () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const overridden = await seedLeague("cadence-cap-override");
    await handle.db.insert(leagueEntitlements).values({
      capsOverride: { aiPostsPerWeek: 2 },
      leagueId: overridden.id,
      tier: "premium",
    });
    await seedAiGenerationRuns({
      count: 1,
      createdAt: now,
      leagueId: overridden.id,
      tag: "cadence-cap-override",
    });

    const env = entitlementEnv(false, {
      ...DEFAULT_ENTITLEMENT_CAPS,
      aiPostsPerWeek: 1,
    });
    const cron = await planCronContent({
      cadence: "weekly-preview",
      db: handle.db,
      env,
      nflCalendar: mockNflCalendar(regularPreKickoffState),
      now: () => now,
    });

    expect(
      cron.planned.filter((event) => event.data.leagueId === overridden.id),
    ).toHaveLength(2);
    expect(
      cron.skipped.some(
        (skipped) =>
          skipped.leagueId === overridden.id &&
          skipped.reason === "CAP_EXCEEDED",
      ),
    ).toBe(false);
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

  it("rejects invalid launch-edition payloads without retrying", async () => {
    await expect(
      runContentPlanLaunchEdition({
        data: {
          leagueId: "not-a-uuid",
        },
        deps: {
          db: handle.db,
          env: openEntitlementEnv,
        },
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
    expect(functions).toContain(contentPlanOffseasonBeat);
    expect(functions).toContain(contentPlanGameFinal);
    expect(functions).toContain(contentPlanLaunchEdition);
    expect(functions).toContain(contentPlanTransaction);
    expect(functions).toContain(contentPlanWaiver);
    expect(functions).toContain(contentPlanRecordBroken);
    expect(functions).toContain(contentPlanLoreCanonized);
    expect(functions).toContain(contentPlanPollClosed);
    expect(functions).toContain(contentPlanBetSettled);
    expect(functions).toContain(contentPlanArenaStandingsSwing);
  });
});
