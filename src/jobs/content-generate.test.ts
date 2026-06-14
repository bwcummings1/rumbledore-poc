// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockAiDependencies } from "@/ai";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { fantasyMembers, fantasyTeams, leagues } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
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
