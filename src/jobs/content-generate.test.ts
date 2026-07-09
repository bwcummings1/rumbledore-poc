// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { and, eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockAiDependencies, MockLlmJudge } from "@/ai";
import { DEFAULT_ENTITLEMENT_CAPS, parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiGenerationRuns,
  fantasyMembers,
  fantasyTeams,
  instigations,
  leagues,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { EntitlementResolverEnv } from "@/entitlements";
import { JOB_EVENTS } from "./events";
import {
  contentGenerate,
  createContentGenerateFunction,
  runContentGenerate,
} from "./functions/content-generate";
import { functions } from "./index";

const marker = `contentjob-${randomUUID()}`;
let handle: DbHandle;
let leagueId: string;

function gatedEntitlementEnv(): EntitlementResolverEnv {
  return {
    entitlements: {
      caps: DEFAULT_ENTITLEMENT_CAPS,
      devOverride: false,
      gateArenaAdvanced: false,
    },
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

  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: `${marker} league`,
      provider: "espn",
      providerLeagueId: `${marker}-95050`,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 2,
      sport: "ffl",
      status: "in_season",
    })
    .returning();
  if (!league) throw new Error("league was not inserted");
  leagueId = league.id;

  await withLeagueContext(handle.db, leagueId, async (tx) => {
    await tx.insert(fantasyMembers).values({
      contentHash: `${marker}-member-hash`,
      displayName: "Job Manager",
      leagueId,
      leagueProviderId: league.providerLeagueId,
      provider: "espn",
      providerMemberId: `${marker}-manager`,
      role: "member",
      season: 2026,
    });
    await tx.insert(fantasyTeams).values({
      contentHash: `${marker}-team-hash`,
      leagueId,
      leagueProviderId: league.providerLeagueId,
      name: "Job Team",
      ownerMemberIds: [`${marker}-manager`],
      pointsAgainst: 100,
      pointsFor: 120,
      provider: "espn",
      providerTeamId: `${marker}-team`,
      season: 2026,
      wins: 1,
    });
  });
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("content.generate Inngest function", () => {
  it("runs the generation pipeline through the Inngest test engine", async () => {
    const fn = createContentGenerateFunction(() => ({
      ...createMockAiDependencies(handle.db),
      now: () => new Date("2026-06-11T12:00:00.000Z"),
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        contentType: "matchup_preview",
        leagueId,
        persona: "commissioner",
        triggerKey: "job:weekly:1",
      },
      name: JOB_EVENTS.contentGenerate,
    };

    const { result } = await testEngine.execute({ events: [event] });

    expect(result).toMatchObject({
      eventName: JOB_EVENTS.contentGenerate,
      ok: true,
      reused: false,
      status: "published",
      title: `Commissioner: ${marker} league snapshot`,
    });
  });

  it("blocks replayed generation events for free leagues without throwing", async () => {
    const result = await runContentGenerate({
      data: {
        contentType: "weekly_recap",
        leagueId,
        persona: "narrator",
        triggerKey: "job:premium-required",
      },
      deps: {
        ...createMockAiDependencies(handle.db),
        entitlements: gatedEntitlementEnv(),
        now: () => new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    expect(result).toMatchObject({
      eventName: JOB_EVENTS.contentGenerate,
      ok: true,
      reason: "TIER_REQUIRED",
      requiredTier: "premium",
      status: "blocked",
      tier: "free",
    });

    const runs = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(aiGenerationRuns)
        .where(
          and(
            eq(aiGenerationRuns.leagueId, leagueId),
            eq(
              aiGenerationRuns.triggerKey,
              "weekly_recap:job:premium-required",
            ),
          ),
        ),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "blocked_entitlement",
    });
  });

  it("uses the judge-gated pipeline for cadence and reactive publish events", async () => {
    const judge = new MockLlmJudge();
    const result = await runContentGenerate({
      data: {
        contentType: "weekly_recap",
        leagueId,
        persona: "narrator",
        triggerKey: "job:judge-gated",
      },
      deps: {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        judge,
        now: () => new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    expect(result).toMatchObject({
      eventName: JOB_EVENTS.contentGenerate,
      ok: true,
      status: "published",
    });
    expect(judge.requests.length).toBeGreaterThanOrEqual(1);
  });

  it("blocks free-league instigation candidates before seeding polls or lore", async () => {
    const result = await runContentGenerate({
      data: {
        contentType: "instigation_column",
        leagueId,
        persona: "trash_talker",
        triggerKey: "job:free-instigation",
      },
      deps: {
        ...createMockAiDependencies(handle.db),
        entitlements: gatedEntitlementEnv(),
        now: () => new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      reason: "TIER_REQUIRED",
      status: "blocked",
    });

    const rows = await withLeagueContext(handle.db, leagueId, async (tx) => ({
      instigations: await tx
        .select()
        .from(instigations)
        .where(eq(instigations.leagueId, leagueId)),
      runs: await tx
        .select()
        .from(aiGenerationRuns)
        .where(
          and(
            eq(aiGenerationRuns.leagueId, leagueId),
            eq(
              aiGenerationRuns.triggerKey,
              "instigation_column:job:free-instigation",
            ),
          ),
        ),
    }));
    expect(rows.instigations).toHaveLength(0);
    expect(rows.runs).toHaveLength(1);
    expect(rows.runs[0]).toMatchObject({
      status: "blocked_entitlement",
    });
  });

  it("rejects invalid payloads without retrying", async () => {
    await expect(
      runContentGenerate({
        data: {
          contentType: "weekly_recap",
          leagueId,
          persona: "bogus",
          triggerKey: "bad",
        },
        deps: createMockAiDependencies(handle.db),
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(contentGenerate);
  });
});
