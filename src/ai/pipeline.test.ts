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
  contentItems,
  fantasyMembers,
  fantasyTeams,
  leagues,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";

const marker = `aipipeline-${randomUUID()}`;
let handle: DbHandle;

class DuplicateLlmClient implements LlmClient {
  readonly requests: LlmGenerateRequest[] = [];

  async generate(request: LlmGenerateRequest): Promise<BlogDraft> {
    this.requests.push(request);
    return {
      body: "This duplicate body is intentionally unchanged.",
      summary: "This duplicate summary is intentionally unchanged.",
      title: "Duplicate league note",
    };
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
    const deps = {
      db: handle.db,
      duplicateThreshold: 1.1,
      embeddings: new DeterministicEmbeddingProvider(),
      llm,
      now: () => new Date("2026-06-11T12:00:00.000Z"),
      web: new MockWebGrounding(),
    };

    const first = await generateLeagueBlogPost({
      deps,
      input: {
        leagueId: league.id,
        persona: "commissioner",
        triggerKey: "weekly:2026:1",
      },
    });
    const second = await generateLeagueBlogPost({
      deps,
      input: {
        leagueId: league.id,
        persona: "commissioner",
        triggerKey: "weekly:2026:1",
      },
    });
    const third = await generateLeagueBlogPost({
      deps,
      input: {
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
    expect(rows.posts[0]?.body).toContain("alpha Team");
    expect(rows.posts[0]?.body).toContain("alpha Manager");
    expect(rows.posts[0]?.body).not.toContain("beta Team");
    expect(rows.posts[0]?.body).not.toContain("Ignore previous instructions");
    expect(rows.posts[0]?.body).not.toContain("example.invalid");
  });

  it("regenerates once and skips near-duplicate drafts", async () => {
    const league = await seedLeague("duplicate");
    const llm = new DuplicateLlmClient();
    const embeddings = new ConstantEmbeddingProvider();

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
        web: new MockWebGrounding(),
      },
      input: {
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
            eq(aiGenerationRuns.triggerKey, "weekly:duplicate"),
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

  it("continues league-only generation when web grounding fails", async () => {
    const league = await seedLeague("webfail");
    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        llm: new MockLlmClient(),
        now: () => new Date("2026-06-11T12:00:00.000Z"),
        web: new FailingWebGrounding(),
      },
      input: {
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
});
