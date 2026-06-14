// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  BlogDraft,
  LlmClient,
  LlmGenerateRequest,
  WebGrounding,
} from "@/ai";
import {
  ConstantEmbeddingProvider,
  DeterministicEmbeddingProvider,
  generateLeagueBlogPost,
  MockLlmClient,
  MockWebGrounding,
} from "@/ai";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiGenerationRuns,
  aiMemory,
  aiPersonaCards,
  allTimeRecords,
  contentItems,
  dataIntegrityChecks,
  fantasyMembers,
  fantasyTeams,
  leagues,
  persons,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { NoopPushNotifier, RecordingPushNotifier } from "@/push";
import { RecordingRealtimePublisher } from "@/realtime";
import { bodyBlocksToMarkdown } from "./article-draft";

const marker = `aipipeline-${randomUUID()}`;
let handle: DbHandle;

class DuplicateLlmClient implements LlmClient {
  readonly requests: LlmGenerateRequest[] = [];

  async generate(request: LlmGenerateRequest): Promise<BlogDraft> {
    this.requests.push(request);
    const bodyBlocks: BlogDraft["bodyBlocks"] = [
      { text: "Duplicate heading", type: "heading" },
      {
        text: "This duplicate body is intentionally unchanged.",
        type: "paragraph",
      },
    ];
    return {
      body: bodyBlocksToMarkdown(bodyBlocks),
      bodyBlocks,
      contentType: "weekly_recap",
      dek: "This duplicate dek is intentionally unchanged.",
      section: "recaps",
      structure: {
        kicker: "duplicate Team stays in the same place.",
        lead: "duplicate Team and duplicate Manager repeat the same lead.",
        standingsShift: "duplicate Team repeats the same standings note.",
        topResult: "duplicate Team repeats the same top result.",
        type: "weekly_recap",
        upsetOrBlowout: "duplicate Team repeats the same margin note.",
      },
      summary: "This duplicate summary is intentionally unchanged.",
      tags: ["Duplicate"],
      title: "Duplicate league note",
    };
  }
}

class BlobLlmClient implements LlmClient {
  async generate(): Promise<BlogDraft> {
    return {
      body: "This old blob body has no article shape.",
      summary: "This old blob summary has no article shape.",
      title: "Old blob draft",
    } as BlogDraft;
  }
}

class FailingWebGrounding implements WebGrounding {
  async fetch(): Promise<never> {
    // ubs:ignore — interface test double named fetch; it performs no network request.
    throw new Error("web grounding unavailable");
  }
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
  if (!league) throw new Error("league was not inserted");

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
      losses: tag === "alpha" ? 0 : 1,
      name: `${tag} Team`,
      ownerMemberIds: [`${tag}-manager`],
      pointsAgainst: 95,
      pointsFor: tag === "alpha" ? 130 : 80,
      provider: "espn",
      providerTeamId: `${tag}-team`,
      season: 2026,
      ties: 0,
      wins: tag === "alpha" ? 2 : 0,
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
  await handle.pool.end();
});

describe("generateLeagueBlogPost", () => {
  it("publishes deterministic league-owned content and reuses the idempotent run", async () => {
    const league = await seedLeague("alpha");
    await seedLeague("beta");
    const llm = new MockLlmClient();
    const push = new RecordingPushNotifier();
    const realtime = new RecordingRealtimePublisher();
    const deps = {
      db: handle.db,
      duplicateThreshold: 1.1,
      embeddings: new DeterministicEmbeddingProvider(),
      llm,
      now: () => new Date("2026-06-11T12:00:00.000Z"),
      push,
      realtime,
      web: new MockWebGrounding(),
    };

    const first = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "matchup_preview",
        leagueId: league.id,
        persona: "commissioner",
        triggerKey: "weekly:2026:1",
      },
    });
    const second = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "matchup_preview",
        leagueId: league.id,
        persona: "commissioner",
        triggerKey: "weekly:2026:1",
      },
    });
    const third = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "matchup_preview",
        leagueId: league.id,
        persona: "commissioner",
        triggerKey: "weekly:2026:2",
      },
    });

    expect(first).toMatchObject({
      reused: false,
      status: "published",
      title: `Commissioner: ${marker} alpha snapshot`,
    });
    expect(second).toMatchObject({
      contentItemId:
        first.status === "published" ? first.contentItemId : expect.any(String),
      reused: true,
      status: "published",
    });
    expect(third).toMatchObject({ reused: false, status: "published" });
    expect(llm.requests).toHaveLength(2);
    expect(llm.requests[0]?.prompt.systemPrefix).toBe(
      llm.requests[1]?.prompt.systemPrefix,
    );
    expect(llm.requests[0]?.prompt.volatileContext).not.toBe(
      llm.requests[1]?.prompt.volatileContext,
    );
    expect(realtime.blogPublished).toEqual([
      {
        at: "2026-06-11T12:00:00.000Z",
        contentItemId:
          first.status === "published"
            ? first.contentItemId
            : expect.any(String),
        leagueId: league.id,
        persona: "commissioner",
        publishedAt: "2026-06-11T12:00:00.000Z",
        title: `Commissioner: ${marker} alpha snapshot`,
        triggerKey: "weekly:2026:1",
        type: "blog.published",
        v: 1,
      },
      {
        at: "2026-06-11T12:00:00.000Z",
        contentItemId:
          third.status === "published"
            ? third.contentItemId
            : expect.any(String),
        leagueId: league.id,
        persona: "commissioner",
        publishedAt: "2026-06-11T12:00:00.000Z",
        title: `Commissioner: ${marker} alpha snapshot`,
        triggerKey: "weekly:2026:2",
        type: "blog.published",
        v: 1,
      },
    ]);
    expect(push.notifications).toEqual([
      {
        at: new Date("2026-06-11T12:00:00.000Z"),
        body: `Commissioner: ${marker} alpha snapshot`,
        leagueId: league.id,
        tag: `league:${league.id}:blog:${
          first.status === "published"
            ? first.contentItemId
            : expect.any(String)
        }`,
        title: "New league post",
        type: "league.blog.published",
        url: `/leagues/${league.id}/press/${
          first.status === "published"
            ? first.contentItemId
            : expect.any(String)
        }`,
      },
      {
        at: new Date("2026-06-11T12:00:00.000Z"),
        body: `Commissioner: ${marker} alpha snapshot`,
        leagueId: league.id,
        tag: `league:${league.id}:blog:${
          third.status === "published"
            ? third.contentItemId
            : expect.any(String)
        }`,
        title: "New league post",
        type: "league.blog.published",
        url: `/leagues/${league.id}/press/${
          third.status === "published"
            ? third.contentItemId
            : expect.any(String)
        }`,
      },
    ]);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => {
      const posts = await tx
        .select()
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        );
      const memory = await tx
        .select()
        .from(aiMemory)
        .where(eq(aiMemory.leagueId, league.id));
      const runs = await tx
        .select()
        .from(aiGenerationRuns)
        .where(eq(aiGenerationRuns.leagueId, league.id));
      return { memory, posts, runs };
    });

    expect(rows.posts).toHaveLength(2);
    expect(rows.memory).toHaveLength(2);
    expect(rows.runs.map((run) => run.status).sort()).toEqual([
      "published",
      "published",
    ]);
    const firstPost = rows.posts.find(
      (post) =>
        post.dedupKey === "blog:commissioner:matchup_preview:weekly:2026:1",
    );
    expect(firstPost?.body).toContain("alpha Team");
    expect(firstPost?.body).toContain("alpha Manager");
    expect(firstPost?.body).toContain("## Commissioner's matchup preview");
    expect(firstPost?.body).toContain("No current record-book event");
    expect(firstPost?.body).not.toContain("beta Team");
    expect(firstPost?.body).not.toContain("Ignore previous instructions");
    expect(firstPost?.body).not.toContain("example.invalid");
    expect(firstPost?.metadata).toMatchObject({
      article: {
        bylinePersona: "commissioner",
        contentType: "matchup_preview",
        format: "rumbledore.article.v1",
        headline: `Commissioner: ${marker} alpha snapshot`,
        structure: { type: "matchup_preview" },
      },
      byline: "commissioner",
      content_type: "matchup_preview",
      contentType: "matchup_preview",
      dek: expect.stringContaining("previews piece"),
      leagueSection: "previews",
      section: "previews",
      structure: { type: "matchup_preview" },
      tags: expect.arrayContaining(["alpha Team", "alpha Manager"]),
      triggerKey: "weekly:2026:1",
    });
    expect(
      (
        (firstPost?.metadata as Record<string, unknown> | undefined)
          ?.bodyBlocks as unknown[] | undefined
      )?.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("publishes separate structured artifacts for different content types on the same trigger", async () => {
    const league = await seedLeague("templates");
    const llm = new MockLlmClient();
    const deps = {
      db: handle.db,
      duplicateThreshold: 1.1,
      embeddings: new DeterministicEmbeddingProvider(),
      llm,
      now: () => new Date("2026-06-11T12:00:00.000Z"),
      push: new NoopPushNotifier(),
      realtime: new RecordingRealtimePublisher(),
      web: new MockWebGrounding(),
    };

    const recap = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "analyst",
        triggerKey: "weekly:shared",
      },
    });
    const ranking = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "power_rankings",
        leagueId: league.id,
        persona: "analyst",
        triggerKey: "weekly:shared",
      },
    });
    const reusedRecap = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "analyst",
        triggerKey: "weekly:shared",
      },
    });

    expect(recap).toMatchObject({ reused: false, status: "published" });
    expect(ranking).toMatchObject({ reused: false, status: "published" });
    expect(reusedRecap).toMatchObject({ reused: true, status: "published" });
    expect(llm.requests.map((request) => request.contentType)).toEqual([
      "weekly_recap",
      "power_rankings",
    ]);

    const posts = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({
          dedupKey: contentItems.dedupKey,
          metadata: contentItems.metadata,
        })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        ),
    );

    expect(posts.map((post) => post.dedupKey).sort()).toEqual([
      "blog:analyst:power_rankings:weekly:shared",
      "blog:analyst:weekly_recap:weekly:shared",
    ]);
    const recapMetadata = posts.find((post) =>
      post.dedupKey.includes("weekly_recap"),
    )?.metadata;
    const rankingMetadata = posts.find((post) =>
      post.dedupKey.includes("power_rankings"),
    )?.metadata;

    expect(recapMetadata).toMatchObject({
      content_type: "weekly_recap",
      structure: {
        lead: expect.stringContaining("templates Team"),
        type: "weekly_recap",
      },
    });
    expect(rankingMetadata).toMatchObject({
      content_type: "power_rankings",
      structure: {
        rankings: [
          expect.objectContaining({
            record: "0-1-0",
            team: "templates Team",
          }),
        ],
        type: "power_rankings",
      },
    });
  });

  it("regenerates once and skips near-duplicate drafts", async () => {
    const league = await seedLeague("duplicate");
    const llm = new DuplicateLlmClient();
    const embeddings = new ConstantEmbeddingProvider();
    const realtime = new RecordingRealtimePublisher();

    await withLeagueContext(handle.db, league.id, async (tx) => {
      const [prior] = await tx
        .insert(contentItems)
        .values({
          authorPersona: "analyst",
          body: "This duplicate body is intentionally unchanged.",
          contentHash: `${marker}-duplicate-content-hash`,
          dedupKey: `${marker}-duplicate-prior`,
          kind: "blog",
          leagueId: league.id,
          publishedAt: new Date("2026-06-10T12:00:00.000Z"),
          summary: "This duplicate summary is intentionally unchanged.",
          title: "Duplicate league note",
        })
        .returning({ id: contentItems.id });
      if (!prior) throw new Error("prior content was not inserted");
      await tx.insert(aiMemory).values({
        contentItemId: prior.id,
        embedding: await embeddings.embed("duplicate"),
        embeddingDimensions: 8,
        embeddingModel: embeddings.model,
        leagueId: league.id,
        metadata: { contentType: "weekly_recap" },
        source: "blog_post",
        textContent: "duplicate",
      });
    });

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        embeddings,
        llm,
        now: () => new Date("2026-06-11T12:00:00.000Z"),
        push: new NoopPushNotifier(),
        realtime,
        web: new MockWebGrounding(),
      },
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "analyst",
        triggerKey: "weekly:duplicate",
      },
    });

    expect(result).toMatchObject({
      reused: false,
      status: "skipped",
    });
    expect(result.status === "skipped" ? result.skipReason : "").toMatch(
      /^near_duplicate:/,
    );
    expect(llm.requests.map((request) => request.attempt)).toEqual([1, 2]);
    expect(realtime.blogPublished).toHaveLength(0);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => {
      const posts = await tx
        .select()
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        );
      const [run] = await tx
        .select()
        .from(aiGenerationRuns)
        .where(
          and(
            eq(aiGenerationRuns.leagueId, league.id),
            eq(aiGenerationRuns.triggerKey, "weekly_recap:weekly:duplicate"),
          ),
        );
      return { posts, run };
    });

    expect(rows.posts).toHaveLength(1);
    expect(rows.run).toMatchObject({
      skipReason: expect.stringMatching(/^near_duplicate:/),
      status: "skipped",
    });
  });

  it("omits record-book context while integrity failures are unresolved", async () => {
    const league = await seedLeague("quarantine");
    const llm = new MockLlmClient();

    await withLeagueContext(handle.db, league.id, async (tx) => {
      const [person] = await tx
        .insert(persons)
        .values({
          canonicalName: "Quarantined Record Holder",
          leagueId: league.id,
        })
        .returning({ id: persons.id });
      if (!person) {
        throw new Error("record person was not inserted");
      }
      await tx.insert(allTimeRecords).values({
        holderPersonId: person.id,
        isCurrent: true,
        leagueId: league.id,
        recordType: "highest_single_week_score",
        scoringPeriod: 1,
        season: 2026,
        value: 222.2,
      });
      await tx.insert(dataIntegrityChecks).values({
        checkKey: "identity_sanity",
        detail: { reason: "fixture unresolved" },
        leagueId: league.id,
        season: 2026,
        status: "fail",
      });
    });

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        llm,
        now: () => new Date("2026-06-11T12:00:00.000Z"),
        push: new NoopPushNotifier(),
        realtime: new RecordingRealtimePublisher(),
        web: new MockWebGrounding(),
      },
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "narrator",
        triggerKey: "weekly:quarantine",
      },
    });

    expect(result).toMatchObject({ reused: false, status: "published" });
    expect(llm.requests[0]?.context.records).toEqual([]);
    const [post] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({ body: contentItems.body })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        )
        .limit(1),
    );
    expect(post?.body).toContain(
      "No current record-book event is being forced into the story.",
    );
  });

  it("continues league-only generation when web grounding fails", async () => {
    const league = await seedLeague("webfail");
    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        llm: new MockLlmClient(),
        now: () => new Date("2026-06-11T12:00:00.000Z"),
        push: new NoopPushNotifier(),
        realtime: new RecordingRealtimePublisher(),
        web: new FailingWebGrounding(),
      },
      input: {
        contentType: "matchup_preview",
        leagueId: league.id,
        persona: "commissioner",
        triggerKey: "weekly:webfail",
      },
    });

    expect(result).toMatchObject({
      reused: false,
      status: "published",
      title: `Commissioner: ${marker} webfail snapshot`,
    });
  });

  it("rejects old blob-style drafts before publishing", async () => {
    const league = await seedLeague("blob");

    await expect(
      generateLeagueBlogPost({
        deps: {
          db: handle.db,
          duplicateThreshold: 1.1,
          embeddings: new DeterministicEmbeddingProvider(),
          llm: new BlobLlmClient(),
          now: () => new Date("2026-06-11T12:00:00.000Z"),
          push: new NoopPushNotifier(),
          realtime: new RecordingRealtimePublisher(),
          web: new MockWebGrounding(),
        },
        input: {
          contentType: "weekly_recap",
          leagueId: league.id,
          persona: "narrator",
          triggerKey: "weekly:blob",
        },
      }),
    ).rejects.toMatchObject({
      code: "AI_DRAFT_EMPTY",
    });

    const posts = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select()
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        ),
    );
    expect(posts).toHaveLength(0);
  });

  it("seeds the Beat Reporter card and includes the cast contract in the prompt prefix", async () => {
    const league = await seedLeague("beat-reporter");
    const llm = new MockLlmClient();

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        llm,
        now: () => new Date("2026-06-11T12:00:00.000Z"),
        push: new NoopPushNotifier(),
        realtime: new RecordingRealtimePublisher(),
        web: new MockWebGrounding(),
      },
      input: {
        contentType: "transaction_reaction",
        leagueId: league.id,
        persona: "beat_reporter",
        triggerKey: "transaction:fixture",
      },
    });

    expect(result).toMatchObject({
      reused: false,
      status: "published",
      title: `Beat Reporter: ${marker} beat-reporter snapshot`,
    });
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]?.context.persona).toMatchObject({
      beat: expect.stringContaining("Transactions"),
      name: "Beat Reporter",
      performsWhen: expect.arrayContaining(["transaction events"]),
      pointOfView: expect.stringContaining("Scoopy"),
    });

    const stablePrefix = JSON.parse(
      llm.requests[0]?.prompt.systemPrefix ?? "{}",
    ) as {
      persona?: {
        beat?: string;
        performsWhen?: string[];
        pointOfView?: string;
      };
    };
    expect(stablePrefix.persona).toMatchObject({
      beat: expect.stringContaining("Transactions"),
      performsWhen: expect.arrayContaining(["transaction events"]),
      pointOfView: expect.stringContaining("Scoopy"),
    });

    const [card] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({
          beat: aiPersonaCards.beat,
          performsWhen: aiPersonaCards.performsWhen,
          pointOfView: aiPersonaCards.pointOfView,
        })
        .from(aiPersonaCards)
        .where(
          and(
            eq(aiPersonaCards.leagueId, league.id),
            eq(aiPersonaCards.persona, "beat_reporter"),
          ),
        )
        .limit(1),
    );

    expect(card).toMatchObject({
      beat: expect.stringContaining("Transactions"),
      performsWhen: expect.arrayContaining(["transaction events"]),
      pointOfView: expect.stringContaining("Scoopy"),
    });
  });
});
