// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BlogDraft, LlmClient } from "@/ai";
import {
  createMockAiDependencies,
  getGenerationFailureQueueData,
  MockLlmJudge,
  retryGenerationFailureRun,
} from "@/ai";
import { bodyBlocksToMarkdown } from "@/ai/article-draft";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiGenerationRuns,
  contentItems,
  editorialActions,
  fantasyMembers,
  fantasyTeams,
  leagues,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { LEAGUE_EDITORIAL_IMPORTANCE_LEAD } from "@/news/front";

const marker = `failurequeue-${randomUUID()}`;
let handle: DbHandle;

class BlobLlmClient implements LlmClient {
  async generate(): Promise<BlogDraft> {
    return {
      body: "This old blob body has no structured article shape.",
      summary: "This old blob summary has no structured article shape.",
      title: "Old blob draft",
    } as BlogDraft;
  }
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 7,
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

  await withLeagueContext(handle.db, league.id, async (tx) => {
    await tx.insert(fantasyMembers).values({
      contentHash: `${marker}-${tag}-member-hash`,
      displayName: `${tag} Manager`,
      leagueId: league.id,
      leagueProviderId: league.providerLeagueId,
      provider: "espn",
      providerMemberId: `${tag}-manager`,
      role: "member",
      season: 2026,
    });
    await tx.insert(fantasyTeams).values({
      abbrev: tag.slice(0, 3).toUpperCase(),
      contentHash: `${marker}-${tag}-team-hash`,
      leagueId: league.id,
      leagueProviderId: league.providerLeagueId,
      losses: 1,
      name: `${tag} Team`,
      ownerMemberIds: [`${tag}-manager`],
      pointsAgainst: 95,
      pointsFor: 130,
      provider: "espn",
      providerTeamId: `${tag}-team`,
      season: 2026,
      ties: 0,
      wins: 2,
    });
  });

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
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("generation failure queue", () => {
  it("lists judge-skipped, failed, and stale pending runs with reasons", async () => {
    const league = await seedLeague("list");
    const now = new Date("2026-07-09T12:00:00.000Z");
    const stale = new Date("2026-07-09T11:20:00.000Z");
    const fresh = new Date("2026-07-09T11:50:00.000Z");
    const postBody = bodyBlocksToMarkdown([
      { text: "Linked post", type: "heading" },
      { text: "A published post for queue context.", type: "paragraph" },
    ]);

    await withLeagueContext(handle.db, league.id, async (tx) => {
      const [post] = await tx
        .insert(contentItems)
        .values({
          authorPersona: "narrator",
          body: postBody,
          contentHash: `${marker}-list-post-hash`,
          dedupKey: `${marker}-list-post`,
          kind: "blog",
          leagueId: league.id,
          metadata: { contentType: "weekly_recap" },
          publishedAt: stale,
          summary: "Linked post summary.",
          title: "Linked post title",
        })
        .returning({ id: contentItems.id });
      if (!post) {
        throw new Error("post was not inserted");
      }

      await tx.insert(aiGenerationRuns).values([
        {
          contentItemId: post.id,
          createdAt: stale,
          leagueId: league.id,
          persona: "narrator",
          promptPrefixHash: "a".repeat(64),
          skipReason: "llm_judge:persona:0.20",
          status: "skipped",
          triggerKey: "weekly_recap:cron:weekly-wrap:regular:7",
          updatedAt: stale,
        },
        {
          createdAt: stale,
          errorMessage: "Provider timeout",
          leagueId: league.id,
          persona: "analyst",
          status: "failed",
          triggerKey: "power_rankings:cron:weekly-wrap:regular:7",
          updatedAt: stale,
        },
        {
          createdAt: stale,
          leagueId: league.id,
          persona: "commissioner",
          status: "running",
          triggerKey: "matchup_preview:cron:weekly-preview:regular:7",
          updatedAt: stale,
        },
        {
          createdAt: fresh,
          leagueId: league.id,
          persona: "beat_reporter",
          status: "running",
          triggerKey: "transaction_reaction:transaction:tx-1",
          updatedAt: fresh,
        },
        {
          createdAt: stale,
          leagueId: league.id,
          persona: "trash_talker",
          status: "published",
          triggerKey: "awards_superlatives:cron:weekly-wrap:regular:7",
          updatedAt: stale,
        },
      ]);
    });

    const result = await getGenerationFailureQueueData(handle.db, {
      leagueId: league.id,
      now,
      staleAfterMs: 30 * 60 * 1000,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.data.summary).toMatchObject({
      failed: 1,
      judgeSkipped: 1,
      skipped: 1,
      stalePending: 1,
      total: 3,
    });
    expect(result.data.items.map((item) => item.status).sort()).toEqual([
      "failed",
      "skipped",
      "stale_pending",
    ]);
    const judgeSkip = result.data.items.find((item) => item.isJudgeSkip);
    expect(judgeSkip).toBeDefined();
    if (!judgeSkip) return;
    expect(judgeSkip).toMatchObject({
      contentTypeLabel: "Weekly Recap",
      reason: "llm_judge:persona:0.20",
      status: "skipped",
    });
    expect(judgeSkip?.contentItem).toMatchObject({
      href: `/leagues/${league.id}/press/${judgeSkip.contentItem?.id}`,
      status: "published",
      title: "Linked post title",
    });
    expect(judgeSkip?.retryApiUrl).toBe(
      `/api/leagues/${league.id}/press/failures/${judgeSkip.id}/retry`,
    );
    expect(
      result.data.items.find((item) => item.status === "stale_pending")?.reason,
    ).toContain("stale threshold is 30 minutes");
  });

  it("retries a judge-skipped run through the generation pipeline", async () => {
    const league = await seedLeague("retry");
    const now = new Date("2026-07-09T12:15:00.000Z");
    const judge = new MockLlmJudge();
    const [run] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .insert(aiGenerationRuns)
        .values({
          createdAt: now,
          leagueId: league.id,
          metadata: {
            editorialImportance: LEAGUE_EDITORIAL_IMPORTANCE_LEAD,
          },
          persona: "narrator",
          skipReason: "llm_judge:persona:0.20",
          status: "skipped",
          triggerKey: "weekly_recap:manual:retry",
          updatedAt: now,
        })
        .returning({ id: aiGenerationRuns.id }),
    );
    if (!run) {
      throw new Error("run was not inserted");
    }

    const result = await retryGenerationFailureRun(
      {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        judge,
        now: () => now,
      },
      { leagueId: league.id, now, runId: run.id },
    );

    expect(result).toMatchObject({
      runId: run.id,
      status: "published",
    });
    expect(judge.requests.length).toBeGreaterThanOrEqual(1);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      posts: await tx
        .select()
        .from(contentItems)
        .where(eq(contentItems.leagueId, league.id)),
      runs: await tx
        .select()
        .from(aiGenerationRuns)
        .where(
          and(
            eq(aiGenerationRuns.leagueId, league.id),
            eq(aiGenerationRuns.id, run.id),
          ),
        ),
    }));
    expect(rows.posts).toHaveLength(1);
    expect(rows.posts[0]?.metadata.editorialImportance).toBe(
      LEAGUE_EDITORIAL_IMPORTANCE_LEAD,
    );
    expect(rows.runs).toHaveLength(1);
    expect(rows.runs[0]).toMatchObject({
      contentItemId:
        result.status === "published"
          ? result.generation.contentItemId
          : expect.any(String),
      skipReason: null,
      status: "published",
    });
  });

  it("marks a retried run failed when the pipeline throws", async () => {
    const league = await seedLeague("retry-failed");
    const now = new Date("2026-07-09T12:30:00.000Z");
    const [run] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .insert(aiGenerationRuns)
        .values({
          createdAt: now,
          leagueId: league.id,
          persona: "narrator",
          skipReason: "llm_judge:persona:0.20",
          status: "skipped",
          triggerKey: "weekly_recap:manual:failed",
          updatedAt: now,
        })
        .returning({ id: aiGenerationRuns.id }),
    );
    if (!run) {
      throw new Error("run was not inserted");
    }

    const result = await retryGenerationFailureRun(
      {
        ...createMockAiDependencies(handle.db),
        llm: new BlobLlmClient(),
        now: () => now,
      },
      { leagueId: league.id, now, runId: run.id },
    );

    expect(result).toMatchObject({
      errorMessage: expect.stringContaining("AI draft"),
      runId: run.id,
      status: "failed",
    });

    const [row] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({
          errorMessage: aiGenerationRuns.errorMessage,
          status: aiGenerationRuns.status,
        })
        .from(aiGenerationRuns)
        .where(eq(aiGenerationRuns.id, run.id)),
    );
    expect(row).toMatchObject({
      errorMessage: expect.stringContaining("AI draft"),
      status: "failed",
    });
  });

  it("retries an editorial regenerate run with supersede context and ledger", async () => {
    const league = await seedLeague("retry-editorial-regenerate");
    const now = new Date("2026-07-09T13:00:00.000Z");
    const [actor] = await handle.db
      .insert(users)
      .values({
        displayName: "Failure Queue Actor",
        email: `${marker}-retry-editorial-regenerate@example.test`,
      })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("actor user was not inserted");
    }

    const [post] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .insert(contentItems)
        .values({
          authorPersona: "narrator",
          body: "Original regenerate retry body.",
          contentHash: `${marker}-retry-editorial-regenerate-post-hash`,
          dedupKey: `${marker}-retry-editorial-regenerate-post`,
          kind: "blog",
          leagueId: league.id,
          metadata: { contentType: "weekly_recap", section: "recaps" },
          publishedAt: now,
          summary: "Original regenerate retry summary.",
          title: "Original regenerate retry",
        })
        .returning({ id: contentItems.id }),
    );
    if (!post) {
      throw new Error("post was not inserted");
    }

    const [run] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .insert(aiGenerationRuns)
        .values({
          createdAt: now,
          leagueId: league.id,
          metadata: {
            editorial: {
              actorUserId: actor.id,
              kind: "regenerate",
              originalContentItemId: post.id,
              reason: "Retry with full context.",
            },
          },
          persona: "narrator",
          skipReason: "llm_judge:persona:0.20",
          status: "skipped",
          triggerKey: `weekly_recap:editorial-regenerate:${post.id}:retry`,
          updatedAt: now,
        })
        .returning({ id: aiGenerationRuns.id }),
    );
    if (!run) {
      throw new Error("run was not inserted");
    }

    const result = await retryGenerationFailureRun(
      {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        judge: new MockLlmJudge(),
        now: () => now,
      },
      { actorUserId: actor.id, leagueId: league.id, now, runId: run.id },
    );

    expect(result.status).toBe("published");
    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      actions: await tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
      posts: await tx
        .select({
          id: contentItems.id,
          status: contentItems.status,
          supersedesContentItemId: contentItems.supersedesContentItemId,
        })
        .from(contentItems)
        .where(eq(contentItems.leagueId, league.id)),
    }));
    expect(rows.posts.find((row) => row.id === post.id)).toMatchObject({
      status: "superseded",
    });
    expect(
      rows.posts.find((row) => row.supersedesContentItemId === post.id),
    ).toMatchObject({ status: "published" });
    expect(rows.actions).toHaveLength(1);
    expect(rows.actions[0]).toMatchObject({
      action: "regenerate",
      actorUserId: actor.id,
      reason: "Retry with full context.",
    });
  });

  it("retries an editorial correction run with correction context and ledger", async () => {
    const league = await seedLeague("retry-editorial-correction");
    const now = new Date("2026-07-09T13:30:00.000Z");
    const correctionHash = "e".repeat(64);
    const [post] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .insert(contentItems)
        .values({
          authorPersona: "analyst",
          body: "Original correction retry body.",
          contentHash: `${marker}-retry-editorial-correction-post-hash`,
          dedupKey: `${marker}-retry-editorial-correction-post`,
          kind: "blog",
          leagueId: league.id,
          metadata: { contentType: "weekly_recap", section: "recaps" },
          publishedAt: now,
          summary: "Original correction retry summary.",
          title: "Original correction retry",
        })
        .returning({ id: contentItems.id }),
    );
    if (!post) {
      throw new Error("post was not inserted");
    }

    const [run] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .insert(aiGenerationRuns)
        .values({
          createdAt: now,
          errorMessage: "Provider timeout",
          leagueId: league.id,
          metadata: {
            editorial: {
              actorUserId: null,
              affectedWeeks: [{ scoringPeriod: 5, season: 2026 }],
              changedMatchups: [
                {
                  contentHash: "f".repeat(64),
                  id: randomUUID(),
                  scoringPeriod: 5,
                  season: 2026,
                },
              ],
              correctionHash,
              kind: "correction",
              originalContentItemId: post.id,
              reason: "Retry correction with full context.",
            },
          },
          persona: "analyst",
          status: "failed",
          triggerKey: `weekly_recap:correction:${post.id}:${correctionHash}:retry`,
          updatedAt: now,
        })
        .returning({ id: aiGenerationRuns.id }),
    );
    if (!run) {
      throw new Error("run was not inserted");
    }

    const result = await retryGenerationFailureRun(
      {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        judge: new MockLlmJudge(),
        now: () => now,
      },
      { leagueId: league.id, now, runId: run.id },
    );

    expect(result.status).toBe("published");
    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      actions: await tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
      posts: await tx
        .select({
          id: contentItems.id,
          metadata: contentItems.metadata,
          status: contentItems.status,
          supersedesContentItemId: contentItems.supersedesContentItemId,
        })
        .from(contentItems)
        .where(eq(contentItems.leagueId, league.id)),
    }));
    expect(rows.posts.find((row) => row.id === post.id)).toMatchObject({
      status: "superseded",
    });
    const replacement = rows.posts.find(
      (row) => row.supersedesContentItemId === post.id,
    );
    expect(replacement).toMatchObject({ status: "published" });
    expect(replacement?.metadata).toMatchObject({
      editorial: {
        correctionHash,
        kind: "correction",
        originalContentItemId: post.id,
      },
    });
    expect(rows.actions).toHaveLength(1);
    expect(rows.actions[0]).toMatchObject({
      action: "correct",
      reason: "Retry correction with full context.",
    });
  });
});
