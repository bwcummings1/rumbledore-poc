// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { leagues } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { getAiUsageRollupData, recordAiUsageEvent } from "./usage-attribution";

const marker = `usage-${randomUUID()}`;
let handle: DbHandle;

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
  if (!league) {
    throw new Error("league was not inserted");
  }
  return league;
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

describe("AI usage attribution", () => {
  it("records per-call usage and loads weekly league rollups", async () => {
    const league = await seedLeague("rollup");

    await recordAiUsageEvent(handle.db, {
      contentType: "weekly_recap",
      createdAt: new Date("2026-07-09T12:00:00.000Z"),
      estimated: true,
      leagueId: league.id,
      model: "mock-rumbledore-llm-v1",
      persona: "narrator",
      provider: "mock",
      triggerKey: "weekly:2026:1",
      usage: {
        cacheCreationInputTokens: 4,
        cacheReadInputTokens: 10,
        inputTokens: 80,
        outputTokens: 30,
      },
    });
    await recordAiUsageEvent(handle.db, {
      contentType: "power_rankings",
      createdAt: new Date("2026-07-08T12:00:00.000Z"),
      estimated: true,
      leagueId: league.id,
      model: "mock-rumbledore-llm-v1",
      persona: "analyst",
      provider: "mock",
      triggerKey: "rankings:2026:1",
      usage: {
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        inputTokens: 50,
        outputTokens: 20,
      },
    });
    await recordAiUsageEvent(handle.db, {
      contentType: "weekly_recap",
      createdAt: new Date("2026-07-01T12:00:00.000Z"),
      estimated: false,
      leagueId: league.id,
      model: "claude-fixture",
      persona: "narrator",
      provider: "bulk",
      triggerKey: "weekly:2026:0",
      usage: {
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        inputTokens: 10,
        outputTokens: 5,
      },
    });

    const result = await getAiUsageRollupData(handle.db, {
      leagueId: league.id,
      now: new Date("2026-07-09T13:00:00.000Z"),
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("expected ready rollup");
    }
    expect(result.data.summary).toMatchObject({
      callCount: 3,
      estimatedCallCount: 2,
      totalCostMicrosUsd: 0,
      totalTokens: 209,
    });
    expect(result.data.weekly).toHaveLength(2);
    expect(result.data.weekly[0]).toMatchObject({
      callCount: 2,
      estimatedCallCount: 2,
      totalTokens: 194,
      weekStart: "2026-07-06T00:00:00.000Z",
    });
    expect(result.data.weeklyBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentTypeLabel: "Weekly Recap",
          model: "mock-rumbledore-llm-v1",
          persona: "narrator",
          provider: "mock",
          totalTokens: 124,
          weekStart: "2026-07-06T00:00:00.000Z",
        }),
        expect.objectContaining({
          contentTypeLabel: "Weekly Recap",
          model: "claude-fixture",
          persona: "narrator",
          provider: "bulk",
          totalTokens: 15,
          weekStart: "2026-06-29T00:00:00.000Z",
        }),
      ]),
    );
    expect(result.data.recentCalls[0]).toMatchObject({
      contentTypeLabel: "Weekly Recap",
      model: "mock-rumbledore-llm-v1",
      provider: "mock",
      totalTokens: 124,
    });
  });
});
