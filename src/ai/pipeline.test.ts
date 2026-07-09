// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  BlogDraft,
  EmbeddingProvider,
  LlmClient,
  LlmGenerateRequest,
  LlmJudge,
  LlmJudgeRequest,
  LlmJudgeScore,
  WebGrounding,
} from "@/ai";
import {
  ConstantEmbeddingProvider,
  DEFAULT_LEAGUE_BLOG_PROMPT_TEMPLATE_ID,
  DEFAULT_LEAGUE_BLOG_PROMPT_TEMPLATE_VERSION,
  DEFAULT_TONE_PROFILES,
  DeterministicEmbeddingProvider,
  generateLeagueBlogPost,
  MockLlmClient,
  MockLlmJudge,
  MockWebGrounding,
} from "@/ai";
import { DEFAULT_ENTITLEMENT_CAPS, parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiGenerationRuns,
  aiMemory,
  aiPersonaCards,
  allTimeRecords,
  arenaSeasons,
  arenaStandings,
  contentItems,
  dataIntegrityChecks,
  fantasyMembers,
  fantasyTeams,
  headToHeadRecords,
  leagues,
  loreClaims,
  persons,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { EntitlementResolverEnv } from "@/entitlements";
import { NoopPushNotifier, RecordingPushNotifier } from "@/push";
import { RecordingRealtimePublisher } from "@/realtime";
import type { WebhookDeliverer } from "@/webhooks";
import { bodyBlocksToMarkdown } from "./article-draft";

const marker = `aipipeline-${randomUUID()}`;
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

class GenericLlmClient implements LlmClient {
  readonly requests: LlmGenerateRequest[] = [];

  async generate(request: LlmGenerateRequest): Promise<BlogDraft> {
    this.requests.push(request);
    const bodyBlocks: BlogDraft["bodyBlocks"] = [
      { text: "Weekly recap", type: "heading" },
      {
        text: "The board had wins, losses, a standings shuffle, and a familiar fantasy-football storyline.",
        type: "paragraph",
      },
    ];
    return {
      body: bodyBlocksToMarkdown(bodyBlocks),
      bodyBlocks,
      contentType: "weekly_recap",
      dek: "A generic recap with no league-owned names.",
      section: "recaps",
      structure: {
        kicker: "A generic kicker lands nowhere specific.",
        lead: "A generic lead avoids every concrete league entity.",
        standingsShift: "A generic standings shift happened.",
        topResult: "A generic team won a generic matchup.",
        type: "weekly_recap",
        upsetOrBlowout: "A generic margin decided the week.",
      },
      summary: "A generic summary.",
      tags: ["Generic"],
      title: "Generic weekly note",
    };
  }
}

function judgeBrokenWeeklyDraft(request: LlmGenerateRequest): BlogDraft {
  const team = request.context.teams[0];
  const teamName = team?.name ?? request.context.league.name;
  const managerName = team?.managerNames[0] ?? "the local manager";
  const bodyBlocks: BlogDraft["bodyBlocks"] = [
    { text: `${teamName} holds the board`, type: "heading" },
    {
      text: `${teamName} and ${managerName} sit at ${team?.wins ?? 0}-${team?.losses ?? 0}-${team?.ties ?? 0} with ${team?.pointsFor ?? 0} points for.`,
      type: "paragraph",
    },
  ];
  return {
    body: bodyBlocksToMarkdown(bodyBlocks),
    bodyBlocks,
    contentType: "weekly_recap",
    dek: `${teamName} gets a local but voiceless recap.`,
    section: "recaps",
    structure: {
      kicker: `${teamName} keeps the fixture grounded.`,
      lead: `${teamName} and ${managerName} lead the local board.`,
      standingsShift: `${teamName} owns the current standings note.`,
      topResult: `${teamName} is the named result.`,
      type: "weekly_recap",
      upsetOrBlowout: `${teamName} gives the recap a concrete margin.`,
    },
    summary: `${teamName} is the concrete local fact.`,
    tags: [teamName, managerName],
    title: `${teamName} local recap`,
  };
}

class JudgeRetryLlmClient implements LlmClient {
  readonly requests: LlmGenerateRequest[] = [];
  private readonly passing = new MockLlmClient();

  async generate(request: LlmGenerateRequest): Promise<BlogDraft> {
    this.requests.push(request);
    if (request.attempt === 1) {
      return judgeBrokenWeeklyDraft(request);
    }
    return this.passing.generate(request);
  }
}

class JudgeBrokenLlmClient implements LlmClient {
  readonly requests: LlmGenerateRequest[] = [];

  async generate(request: LlmGenerateRequest): Promise<BlogDraft> {
    this.requests.push(request);
    return judgeBrokenWeeklyDraft(request);
  }
}

class VectorDuplicateLlmClient implements LlmClient {
  readonly requests: LlmGenerateRequest[] = [];

  async generate(request: LlmGenerateRequest): Promise<BlogDraft> {
    this.requests.push(request);
    const team = request.context.teams[0];
    const teamName = team?.name ?? "Vector Team";
    const managerName = team?.managerNames[0] ?? "Vector Manager";
    const bodyBlocks: BlogDraft["bodyBlocks"] = [
      { text: "Vector duplicate recap", type: "heading" },
      {
        text: `${teamName} and ${managerName} are sitting on vector-near-duplicate-token again.`,
        type: "paragraph",
      },
    ];
    return {
      body: bodyBlocksToMarkdown(bodyBlocks),
      bodyBlocks,
      contentType: "weekly_recap",
      dek: `${teamName} repeats the vector lane.`,
      section: "recaps",
      structure: {
        kicker: `${teamName} keeps vector-near-duplicate-token in circulation.`,
        lead: `${teamName} gives the league a vector-near-duplicate-token lead.`,
        standingsShift: `${managerName} sees the same vector shape.`,
        topResult: `${teamName} is the top result.`,
        type: "weekly_recap",
        upsetOrBlowout: `${teamName} made the margin obvious.`,
      },
      summary: `${teamName} repeats the vector-near-duplicate-token angle.`,
      tags: [teamName, managerName],
      title: `${teamName} vector duplicate`,
    };
  }
}

class DirectionalEmbeddingProvider implements EmbeddingProvider {
  readonly model = "mock-directional-embedding-v1";

  async embed(text: string): Promise<number[]> {
    return text.includes("vector-near-duplicate-token") ? [1, 0] : [0, 1];
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

class RecordingWebGrounding implements WebGrounding {
  private readonly delegate = new MockWebGrounding();
  readonly requests: Parameters<WebGrounding["fetch"]>[0][] = [];

  async fetch(
    input: Parameters<WebGrounding["fetch"]>[0],
  ): Promise<Awaited<ReturnType<WebGrounding["fetch"]>>> {
    this.requests.push(input);
    return this.delegate.fetch();
  }
}

class RecordingEmbeddingProvider extends DeterministicEmbeddingProvider {
  calls = 0;

  override async embed(text: string): Promise<number[]> {
    this.calls += 1;
    return super.embed(text);
  }
}

class RecordingWebhookDeliverer implements WebhookDeliverer {
  readonly config = { mock: true } as const;
  readonly deliveries: Array<{ contentItemId: string; leagueId: string }> = [];

  async deliver(): Promise<{ status: "delivered" }> {
    return { status: "delivered" };
  }

  async deliverPublishedContent(input: {
    contentItemId: string;
    leagueId: string;
  }): Promise<{ delivered: number; failed: number; skipped: number }> {
    this.deliveries.push(input);
    return { delivered: 1, failed: 0, skipped: 0 };
  }
}

class PassingLlmJudge implements LlmJudge {
  readonly requests: LlmJudgeRequest[] = [];

  async score(request: LlmJudgeRequest): Promise<LlmJudgeScore> {
    this.requests.push(request);
    return {
      authenticity: 1,
      leakedTokens: [],
      leakage: false,
      matchedLeagueFacts: ["fixture league fact"],
      matchedPersonaMarkers: ["fixture persona marker"],
      notes: ["Test fixture judge passes."],
      personaMatch: 1,
      targetedOffLimits: [],
      targetingConsent: true,
    };
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
    .delete(arenaSeasons)
    .where(sql`${arenaSeasons.name} like ${`${marker}-%`}`);
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
    const judge = new MockLlmJudge();
    const push = new RecordingPushNotifier();
    const realtime = new RecordingRealtimePublisher();
    const webhooks = new RecordingWebhookDeliverer();
    const deps = {
      db: handle.db,
      duplicateThreshold: 1.1,
      embeddings: new DeterministicEmbeddingProvider(),
      entitlements: openEntitlementEnv,
      judge,
      llm,
      now: () => new Date("2026-06-11T12:00:00.000Z"),
      push,
      realtime,
      web: new MockWebGrounding(),
      webhooks,
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
    expect(judge.requests).toHaveLength(2);
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
    expect(webhooks.deliveries).toEqual([
      {
        contentItemId:
          first.status === "published"
            ? first.contentItemId
            : expect.any(String),
        leagueId: league.id,
      },
      {
        contentItemId:
          third.status === "published"
            ? third.contentItemId
            : expect.any(String),
        leagueId: league.id,
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

  it("blocks AI generation for free leagues before web, LLM, embedding, or publish work", async () => {
    const league = await seedLeague("free-gate");
    const llm = new MockLlmClient();
    const web = new RecordingWebGrounding();
    const embeddings = new RecordingEmbeddingProvider();
    const push = new RecordingPushNotifier();
    const realtime = new RecordingRealtimePublisher();

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings,
        entitlements: gatedEntitlementEnv,
        judge: new PassingLlmJudge(),
        llm,
        now: () => new Date("2026-06-11T12:00:00.000Z"),
        push,
        realtime,
        web,
      },
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "narrator",
        triggerKey: "weekly:premium-required",
      },
    });

    expect(result).toMatchObject({
      promptPrefixHash: null,
      reason: "TIER_REQUIRED",
      requiredTier: "premium",
      reused: false,
      status: "blocked",
      tier: "free",
    });
    expect(llm.requests).toHaveLength(0);
    expect(web.requests).toHaveLength(0);
    expect(embeddings.calls).toBe(0);
    expect(push.notifications).toHaveLength(0);
    expect(realtime.blogPublished).toHaveLength(0);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      posts: await tx
        .select()
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        ),
      runs: await tx
        .select()
        .from(aiGenerationRuns)
        .where(eq(aiGenerationRuns.leagueId, league.id)),
    }));
    expect(rows.posts).toHaveLength(0);
    expect(rows.runs).toHaveLength(1);
    expect(rows.runs[0]).toMatchObject({
      contentItemId: null,
      persona: "narrator",
      skipReason: "entitlement:ai.cast.generate:TIER_REQUIRED:requires_premium",
      status: "blocked_entitlement",
      triggerKey: "weekly_recap:weekly:premium-required",
    });
  });

  it("publishes separate structured artifacts for different content types on the same trigger", async () => {
    const league = await seedLeague("templates");
    const llm = new MockLlmClient();
    const deps = {
      db: handle.db,
      duplicateThreshold: 1.1,
      embeddings: new DeterministicEmbeddingProvider(),
      entitlements: openEntitlementEnv,
      judge: new MockLlmJudge(),
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
      article: {
        bodyBlocks: expect.arrayContaining([
          expect.objectContaining({
            embed: expect.objectContaining({ kind: "scoreboard_strip" }),
            type: "embed",
          }),
        ]),
      },
      content_type: "weekly_recap",
      structure: {
        lead: expect.stringContaining("templates Team"),
        type: "weekly_recap",
      },
    });
    expect(rankingMetadata).toMatchObject({
      article: {
        bodyBlocks: expect.arrayContaining([
          expect.objectContaining({
            embed: expect.objectContaining({ kind: "standings_movement" }),
            type: "embed",
          }),
        ]),
      },
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

  it("grounds arena recaps in aggregate arena standings and rival movement", async () => {
    const league = await seedLeague("arena-alpha");
    const rival = await seedLeague("arena-beta");
    const now = new Date();
    const offsetMs =
      Number.parseInt(league.id.replaceAll("-", "").slice(0, 8), 16) %
      (12 * 60 * 60 * 1000);
    const computedAt = new Date(now.getTime() + offsetMs);
    const [season] = await handle.db
      .insert(arenaSeasons)
      .values({
        endsAt: new Date(computedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        name: `${marker}-arena-recap`,
        startsAt: new Date(computedAt.getTime() - 24 * 60 * 60 * 1000),
      })
      .returning({ id: arenaSeasons.id });
    if (!season) throw new Error("arena season was not inserted");

    await handle.db.insert(arenaStandings).values([
      {
        computedAt,
        currentBalanceCents: 13_000,
        kind: "league",
        leagueId: rival.id,
        netPnlCents: 3_000,
        previousRank: 1,
        pushVoidSlipCount: 0,
        rank: 1,
        rankDelta: 0,
        roiBps: 2_500,
        seasonId: season.id,
        settledSlipCount: 3,
        subjectId: rival.id,
        totalReturnCents: 9_000,
        totalStakeCents: 6_000,
        userId: null,
        weeksPlayed: 1,
        weeksSurvived: 1,
        winRateBps: 6_667,
        wonSlipCount: 2,
      },
      {
        computedAt,
        currentBalanceCents: 11_500,
        kind: "league",
        leagueId: league.id,
        netPnlCents: 1_500,
        previousRank: 4,
        pushVoidSlipCount: 0,
        rank: 2,
        rankDelta: 2,
        roiBps: 1_500,
        seasonId: season.id,
        settledSlipCount: 2,
        subjectId: league.id,
        totalReturnCents: 5_500,
        totalStakeCents: 4_000,
        userId: null,
        weeksPlayed: 1,
        weeksSurvived: 1,
        winRateBps: 5_000,
        wonSlipCount: 1,
      },
    ]);

    const llm = new MockLlmClient();
    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        entitlements: openEntitlementEnv,
        judge: new MockLlmJudge(),
        llm,
        now: () => computedAt,
        push: new NoopPushNotifier(),
        realtime: new RecordingRealtimePublisher(),
        web: new MockWebGrounding(),
      },
      input: {
        contentType: "arena_recap",
        leagueId: league.id,
        persona: "narrator",
        triggerKey: `arena-swing:${season.id}:fixture`,
      },
    });

    expect(result).toMatchObject({ reused: false, status: "published" });
    expect(llm.requests[0]?.context.arena).toMatchObject({
      fieldLeader: {
        displayName: `${marker} arena-beta`,
        rank: 1,
      },
      headToHead: {
        comparison: "trailing",
        marginCents: 1_500,
        rival: {
          displayName: `${marker} arena-beta`,
          rank: 1,
        },
      },
      leagueStanding: {
        displayName: `${marker} arena-alpha`,
        rank: 2,
        rankDelta: 2,
      },
      movers: {
        risers: [
          expect.objectContaining({
            displayName: `${marker} arena-alpha`,
            previousRank: 4,
            rank: 2,
          }),
        ],
      },
    });

    const [post] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({ body: contentItems.body, metadata: contentItems.metadata })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
            eq(
              contentItems.dedupKey,
              `blog:narrator:arena_recap:arena-swing:${season.id}:fixture`,
            ),
          ),
        )
        .limit(1),
    );
    expect(post?.metadata).toMatchObject({
      content_type: "arena_recap",
      structure: {
        fieldLeader: expect.stringContaining(`${marker} arena-beta`),
        leaguePosition: expect.stringContaining(`${marker} arena-alpha`),
        type: "arena_recap",
      },
    });
    expect(post?.body).toContain(`${marker} arena-beta`);
    expect(post?.body).toContain("arena-alpha Team");
  });

  it("grounds the prompt in canon lore, rivalries, and canonical people only for the active league", async () => {
    const league = await seedLeague("authentic");
    const llm = new MockLlmClient();

    await withLeagueContext(handle.db, league.id, async (tx) => {
      const [alpha, beta] = await tx
        .insert(persons)
        .values([
          {
            canonicalName: "Canon Alpha",
            leagueId: league.id,
            ownerHistory: [
              {
                endSeason: null,
                ownerNames: ["Canon Alpha Manager"],
                providerMemberIds: ["alpha-manager"],
                startSeason: 2016,
              },
            ],
          },
          {
            canonicalName: "Canon Beta",
            leagueId: league.id,
            ownerHistory: [
              {
                endSeason: null,
                ownerNames: ["Canon Beta Manager"],
                providerMemberIds: ["beta-manager"],
                startSeason: 2016,
              },
            ],
          },
        ])
        .returning({ id: persons.id });
      if (!alpha || !beta) {
        throw new Error("canon people were not inserted");
      }
      await tx.insert(headToHeadRecords).values({
        currentStreakLength: 3,
        currentStreakPersonId: alpha.id,
        leagueId: league.id,
        longestStreakLength: 5,
        longestStreakPersonId: beta.id,
        meetings: 11,
        personAId: alpha.id,
        personAWins: 7,
        personBId: beta.id,
        personBWins: 4,
        season: 0,
        ties: 0,
      });
      await tx.insert(loreClaims).values([
        {
          authorPersona: "trash_talker",
          body: "Canon Alpha owns the Snow Bowl collapse",
          kind: "opinion",
          leagueId: league.id,
          origin: "ai",
          ratifiedAt: new Date("2026-06-10T12:00:00.000Z"),
          ratifiedBy: "vote",
          statement: "Canon Alpha owns the Snow Bowl collapse",
          status: "canon",
          title: "Snow Bowl Collapse",
        },
        {
          authorPersona: "trash_talker",
          body: "Unratified Beta dynasty rumor",
          kind: "opinion",
          leagueId: league.id,
          origin: "ai",
          statement: "Unratified Beta dynasty rumor",
          status: "vote",
          title: "Pending Dynasty Rumor",
        },
        {
          authorPersona: "narrator",
          body: "Canon Beta's Canal Bowl title is under challenge",
          kind: "opinion",
          leagueId: league.id,
          origin: "ai",
          ratifiedAt: new Date("2026-06-09T12:00:00.000Z"),
          ratifiedBy: "vote",
          statement: "Canon Beta's Canal Bowl title is under challenge",
          status: "disputed",
          title: "Canal Bowl Challenge",
        },
        {
          authorPersona: "analyst",
          body: "Canon Alpha scored 200 in Week 1",
          kind: "data_verifiable",
          leagueId: league.id,
          origin: "ai",
          statement: "Canon Alpha scored 200 in Week 1",
          status: "rejected",
          title: "Wrong Week 1 Score",
          verification: "refuted",
        },
      ]);
    });

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        entitlements: openEntitlementEnv,
        judge: new MockLlmJudge(),
        llm,
        now: () => new Date("2026-06-11T12:00:00.000Z"),
        push: new NoopPushNotifier(),
        realtime: new RecordingRealtimePublisher(),
        web: new MockWebGrounding(),
      },
      input: {
        contentType: "rivalry_piece",
        leagueId: league.id,
        persona: "trash_talker",
        triggerKey: "weekly:rivalry-authentic",
      },
    });

    expect(result).toMatchObject({ reused: false, status: "published" });
    expect(llm.requests[0]?.context.authenticity).toMatchObject({
      canonLore: [
        expect.objectContaining({
          statement: "Canon Alpha owns the Snow Bowl collapse",
        }),
      ],
      lore: {
        canon: [
          expect.objectContaining({
            provenance: "vote",
            statement: "Canon Alpha owns the Snow Bowl collapse",
            status: "canon",
          }),
        ],
        disputed: [
          expect.objectContaining({
            statement: "Canon Beta's Canal Bowl title is under challenge",
            status: "disputed",
          }),
        ],
        pending: [
          expect.objectContaining({
            statement: "Unratified Beta dynasty rumor",
            status: "vote",
          }),
        ],
        refuted: [
          expect.objectContaining({
            statement: "Canon Alpha scored 200 in Week 1",
            status: "rejected",
            verification: "refuted",
          }),
        ],
      },
      people: expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "Canon Alpha",
          ownerNames: ["Canon Alpha Manager"],
        }),
      ]),
      rivalries: [
        expect.objectContaining({
          meetings: 11,
          personAName: "Canon Alpha",
          personBName: "Canon Beta",
        }),
      ],
    });
    expect(llm.requests[0]?.context.authenticity.entityTokens).toEqual(
      expect.arrayContaining([
        "Canon Alpha",
        "Canon Beta",
        "Canon Alpha owns the Snow Bowl collapse",
      ]),
    );

    const stablePrefix = JSON.parse(
      llm.requests[0]?.prompt.systemPrefix ?? "{}",
    ) as {
      authenticity?: {
        canonLore?: { id?: string; statement?: string }[];
        lore?: {
          canon?: { id?: string; statement?: string }[];
          disputed?: { statement?: string }[];
          pending?: { statement?: string }[];
          refuted?: { statement?: string }[];
        };
        rivalries?: { personAName?: string; personBName?: string }[];
      };
    };
    expect(stablePrefix.authenticity?.canonLore).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        statement: "Canon Alpha owns the Snow Bowl collapse",
      }),
    ]);
    expect(stablePrefix.authenticity?.lore?.canon).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        statement: "Canon Alpha owns the Snow Bowl collapse",
      }),
    ]);
    expect(stablePrefix.authenticity?.lore?.pending).toEqual([
      expect.objectContaining({
        statement: "Unratified Beta dynasty rumor",
      }),
    ]);
    expect(stablePrefix.authenticity?.lore?.disputed).toEqual([
      expect.objectContaining({
        statement: "Canon Beta's Canal Bowl title is under challenge",
      }),
    ]);
    expect(stablePrefix.authenticity?.lore?.refuted).toEqual([
      expect.objectContaining({
        statement: "Canon Alpha scored 200 in Week 1",
      }),
    ]);
    expect(stablePrefix.authenticity?.rivalries).toEqual([
      expect.objectContaining({
        personAName: "Canon Alpha",
        personBName: "Canon Beta",
      }),
    ]);

    const [post] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({ body: contentItems.body, metadata: contentItems.metadata })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
          ),
        )
        .limit(1),
    );
    expect(post?.body).toContain("Canon Alpha owns the Snow Bowl collapse");
    expect(post?.metadata).toMatchObject({
      citedCanonClaimIds: [expect.any(String)],
      canonCitations: [
        expect.objectContaining({
          title: "Snow Bowl Collapse",
        }),
      ],
    });
    expect(post?.body).toContain(
      "Canon Alpha and Canon Beta have met 11 times",
    );
    expect(post?.body).toContain(
      "Live debate, not canon: Unratified Beta dynasty rumor",
    );
    expect(post?.body).toContain(
      "Contested canon under challenge: Canon Beta's Canal Bowl title is under challenge",
    );
    expect(post?.body).toContain(
      "Correction file: Canon Alpha scored 200 in Week 1 was refuted",
    );
    expect(post?.body).not.toContain(
      "Canon says: Unratified Beta dynasty rumor",
    );
  });

  it("regenerates once and skips drafts that name no concrete league entity", async () => {
    const league = await seedLeague("slop");
    const llm = new GenericLlmClient();

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        entitlements: openEntitlementEnv,
        judge: new PassingLlmJudge(),
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
        triggerKey: "weekly:generic",
      },
    });

    expect(result).toMatchObject({
      reused: false,
      skipReason: "generic_slop:missing_league_entity",
      status: "skipped",
    });
    expect(llm.requests.map((request) => request.attempt)).toEqual([1, 2]);
    expect(llm.requests[1]?.duplicateNudge).toContain("too generic");

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
            eq(aiGenerationRuns.triggerKey, "weekly_recap:weekly:generic"),
          ),
        );
      return { posts, run };
    });
    expect(rows.posts).toHaveLength(0);
    expect(rows.run).toMatchObject({
      skipReason: "generic_slop:missing_league_entity",
      status: "skipped",
    });
  });

  it("runs the LLM judge before publish and regenerates once on judge failure", async () => {
    const league = await seedLeague("judge-retry");
    const llm = new JudgeRetryLlmClient();
    const judge = new MockLlmJudge();

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        entitlements: openEntitlementEnv,
        judge,
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
        triggerKey: "weekly:judge-retry",
      },
    });

    expect(result).toMatchObject({ reused: false, status: "published" });
    expect(llm.requests.map((request) => request.attempt)).toEqual([1, 2]);
    expect(llm.requests[1]?.duplicateNudge).toContain("failed the AI judge");
    expect(judge.requests).toHaveLength(2);
    expect(judge.requests[0]?.piece.title).toBe("judge-retry Team local recap");
    expect(judge.requests[1]?.piece.title).toBe(
      `Narrator: ${marker} judge-retry snapshot`,
    );
  });

  it("skips a draft when the LLM judge rejects the retry", async () => {
    const league = await seedLeague("judge-skip");
    const llm = new JudgeBrokenLlmClient();
    const judge = new MockLlmJudge();

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        entitlements: openEntitlementEnv,
        judge,
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
        triggerKey: "weekly:judge-skip",
      },
    });

    expect(result).toMatchObject({ reused: false, status: "skipped" });
    expect(result.status === "skipped" ? result.skipReason : "").toMatch(
      /^llm_judge:persona:/,
    );
    expect(llm.requests.map((request) => request.attempt)).toEqual([1, 2]);
    expect(judge.requests).toHaveLength(2);

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
            eq(aiGenerationRuns.triggerKey, "weekly_recap:weekly:judge-skip"),
          ),
        );
      return { posts, run };
    });
    expect(rows.posts).toHaveLength(0);
    expect(rows.run).toMatchObject({
      skipReason: expect.stringMatching(/^llm_judge:persona:/),
      status: "skipped",
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
        entitlements: openEntitlementEnv,
        judge: new PassingLlmJudge(),
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

  it("ignores retracted blog memories when checking near duplicates", async () => {
    const league = await seedLeague("retracted-memory");
    const llm = new MockLlmClient();
    const embeddings = new ConstantEmbeddingProvider();
    const realtime = new RecordingRealtimePublisher();

    await withLeagueContext(handle.db, league.id, async (tx) => {
      const [prior] = await tx
        .insert(contentItems)
        .values({
          authorPersona: "analyst",
          body: "This duplicate body is intentionally unchanged.",
          contentHash: `${marker}-retracted-memory-content-hash`,
          dedupKey: `${marker}-retracted-memory-prior`,
          kind: "blog",
          leagueId: league.id,
          publishedAt: new Date("2026-06-10T12:00:00.000Z"),
          status: "retracted",
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
        entitlements: openEntitlementEnv,
        judge: new PassingLlmJudge(),
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
        triggerKey: "weekly:retracted-memory",
      },
    });

    expect(result).toMatchObject({
      reused: false,
      status: "published",
    });
    expect(realtime.blogPublished).toHaveLength(1);
  });

  it("orders near-duplicate memory by vector distance before applying the limit", async () => {
    const league = await seedLeague("vector");
    const llm = new VectorDuplicateLlmClient();
    const embeddings = new DirectionalEmbeddingProvider();

    await withLeagueContext(handle.db, league.id, async (tx) => {
      const contentRows = await tx
        .insert(contentItems)
        .values([
          {
            authorPersona: "analyst",
            body: "Vector duplicate old archive body.",
            contentHash: `${marker}-vector-old-content-hash`,
            dedupKey: `${marker}-vector-old-content`,
            kind: "blog",
            leagueId: league.id,
            publishedAt: new Date("2026-01-01T00:00:00.000Z"),
            summary: "Vector duplicate old archive summary.",
            title: "Vector duplicate old archive",
          },
          ...Array.from({ length: 20 }, (_, index) => ({
            authorPersona: "analyst" as const,
            body: `Orthogonal recent body ${index}.`,
            contentHash: `${marker}-vector-orthogonal-${index}-content-hash`,
            dedupKey: `${marker}-vector-orthogonal-${index}-content`,
            kind: "blog" as const,
            leagueId: league.id,
            publishedAt: new Date(
              `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
            ),
            summary: `Orthogonal recent summary ${index}.`,
            title: `Orthogonal recent memory ${index}`,
          })),
        ])
        .returning({ dedupKey: contentItems.dedupKey, id: contentItems.id });
      const contentIdByDedupKey = new Map(
        contentRows.map((row) => [row.dedupKey, row.id]),
      );
      const oldContentItemId = contentIdByDedupKey.get(
        `${marker}-vector-old-content`,
      );
      if (!oldContentItemId) {
        throw new Error("old vector content row was not inserted");
      }

      await tx.insert(aiMemory).values([
        {
          contentItemId: oldContentItemId,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          embedding: [1, 0],
          embeddingDimensions: 2,
          embeddingModel: embeddings.model,
          leagueId: league.id,
          metadata: { contentType: "weekly_recap" },
          source: "blog_post",
          textContent: "vector-near-duplicate-token from the old archive",
        },
        ...Array.from({ length: 20 }, (_, index) => {
          const contentItemId = contentIdByDedupKey.get(
            `${marker}-vector-orthogonal-${index}-content`,
          );
          if (!contentItemId) {
            throw new Error(`orthogonal content row ${index} was not inserted`);
          }
          return {
            contentItemId,
            createdAt: new Date(
              `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
            ),
            embedding: [0, 1],
            embeddingDimensions: 2,
            embeddingModel: embeddings.model,
            leagueId: league.id,
            metadata: { contentType: "weekly_recap" },
            source: "blog_post" as const,
            textContent: `orthogonal recent memory ${index}`,
          };
        }),
      ]);
    });

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        embeddings,
        entitlements: openEntitlementEnv,
        judge: new PassingLlmJudge(),
        llm,
        now: () => new Date("2026-06-11T12:00:00.000Z"),
        push: new NoopPushNotifier(),
        realtime: new RecordingRealtimePublisher(),
        web: new MockWebGrounding(),
      },
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "analyst",
        triggerKey: "weekly:vector",
      },
    });

    expect(result).toMatchObject({ reused: false, status: "skipped" });
    expect(result.status === "skipped" ? result.skipReason : "").toMatch(
      /^near_duplicate:/,
    );
    expect(llm.requests.map((request) => request.attempt)).toEqual([1, 2]);
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
        entitlements: openEntitlementEnv,
        judge: new MockLlmJudge(),
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

  it("loads the displaced prior holder for record-broken milestone generation", async () => {
    const league = await seedLeague("record-broken");
    const llm = new MockLlmClient();
    let currentRecordId = "";

    await withLeagueContext(handle.db, league.id, async (tx) => {
      const [previousHolder] = await tx
        .insert(persons)
        .values({
          canonicalName: "Prior Record Holder",
          leagueId: league.id,
        })
        .returning({ id: persons.id });
      const [newHolder] = await tx
        .insert(persons)
        .values({
          canonicalName: "New Record Holder",
          leagueId: league.id,
        })
        .returning({ id: persons.id });
      if (!previousHolder || !newHolder) {
        throw new Error("record holder people were not inserted");
      }
      const [previousRecord] = await tx
        .insert(allTimeRecords)
        .values({
          holderPersonId: previousHolder.id,
          isCurrent: false,
          leagueId: league.id,
          recordType: "highest_single_week_score",
          scoringPeriod: 2,
          season: 2025,
          value: 144.2,
        })
        .returning({ id: allTimeRecords.id });
      if (!previousRecord) {
        throw new Error("previous record was not inserted");
      }
      const [currentRecord] = await tx
        .insert(allTimeRecords)
        .values({
          holderPersonId: newHolder.id,
          isCurrent: true,
          leagueId: league.id,
          previousRecordId: previousRecord.id,
          recordType: "highest_single_week_score",
          scoringPeriod: 4,
          season: 2026,
          value: 188.4,
        })
        .returning({ id: allTimeRecords.id });
      if (!currentRecord) {
        throw new Error("current record was not inserted");
      }
      currentRecordId = currentRecord.id;
    });

    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        entitlements: openEntitlementEnv,
        judge: new MockLlmJudge(),
        llm,
        now: () => new Date("2026-06-11T12:00:00.000Z"),
        push: new NoopPushNotifier(),
        realtime: new RecordingRealtimePublisher(),
        web: new MockWebGrounding(),
      },
      input: {
        contentType: "milestone_record",
        leagueId: league.id,
        persona: "narrator",
        triggerKey: `record-broken:highest_single_week_score:${currentRecordId}`,
      },
    });

    expect(result).toMatchObject({ reused: false, status: "published" });
    expect(llm.requests[0]?.context.records[0]).toMatchObject({
      holderName: "New Record Holder",
      id: currentRecordId,
      label: "Highest weekly score",
      previousHolderName: "Prior Record Holder",
      previousRecordId: expect.any(String),
      previousValue: 144.2,
      recordType: "highest_single_week_score",
      scoringPeriod: 4,
      season: 2026,
      value: 188.4,
    });
  });

  it("continues league-only generation when web grounding fails", async () => {
    const league = await seedLeague("webfail");
    const result = await generateLeagueBlogPost({
      deps: {
        db: handle.db,
        duplicateThreshold: 1.1,
        embeddings: new DeterministicEmbeddingProvider(),
        entitlements: openEntitlementEnv,
        judge: new MockLlmJudge(),
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
          entitlements: openEntitlementEnv,
          judge: new PassingLlmJudge(),
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
        entitlements: openEntitlementEnv,
        judge: new MockLlmJudge(),
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

  it("renders versioned tone profile edits into the stable prompt and mock draft", async () => {
    const league = await seedLeague("tone-profile");
    const llm = new MockLlmClient();
    const deps = {
      db: handle.db,
      duplicateThreshold: 1.1,
      embeddings: new DeterministicEmbeddingProvider(),
      entitlements: openEntitlementEnv,
      judge: new MockLlmJudge(),
      llm,
      now: () => new Date("2026-06-11T12:00:00.000Z"),
      push: new NoopPushNotifier(),
      realtime: new RecordingRealtimePublisher(),
      web: new MockWebGrounding(),
    };

    const first = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "narrator",
        triggerKey: "tone-profile:default",
      },
    });

    const customProfile = {
      ...DEFAULT_TONE_PROFILES.narrator,
      beats: ["custom-tone-marker mythology desk"],
      diction: ["custom-tone-marker", "ledger mythology"],
      dosAndDonts: ["Do include the custom-tone-marker in mock output."],
      styleDirectives: ["custom-tone-marker directive"],
    };
    await withLeagueContext(handle.db, league.id, async (tx) => {
      await tx
        .update(aiPersonaCards)
        .set({
          toneProfile: customProfile,
          toneUpdatedAt: new Date("2026-06-11T13:00:00.000Z"),
          toneUpdatedBy: "test:tone-profile",
          toneVersion: 2,
        })
        .where(
          and(
            eq(aiPersonaCards.leagueId, league.id),
            eq(aiPersonaCards.persona, "narrator"),
          ),
        );
    });

    const second = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "narrator",
        triggerKey: "tone-profile:custom",
      },
    });

    expect(first).toMatchObject({ reused: false, status: "published" });
    expect(second).toMatchObject({ reused: false, status: "published" });
    expect(llm.requests).toHaveLength(2);
    expect(llm.requests[0]?.prompt.systemPrefix).not.toBe(
      llm.requests[1]?.prompt.systemPrefix,
    );
    expect(llm.requests[1]?.context.persona).toMatchObject({
      toneUpdatedBy: "test:tone-profile",
      toneVersion: 2,
    });

    const firstPrefix = JSON.parse(
      llm.requests[0]?.prompt.systemPrefix ?? "{}",
    ) as {
      persona?: {
        toneProfile?: { styleDirectives?: string[] };
        toneUpdatedAt?: string;
        toneUpdatedBy?: string;
        toneVersion?: number;
      };
    };
    const secondPrefix = JSON.parse(
      llm.requests[1]?.prompt.systemPrefix ?? "{}",
    ) as {
      persona?: {
        toneProfile?: { styleDirectives?: string[] };
        toneUpdatedAt?: string;
        toneUpdatedBy?: string;
        toneVersion?: number;
      };
    };
    expect(firstPrefix.persona).toMatchObject({ toneVersion: 1 });
    expect(firstPrefix.persona?.toneUpdatedAt).toBeUndefined();
    expect(firstPrefix.persona?.toneUpdatedBy).toBeUndefined();
    expect(secondPrefix.persona).toMatchObject({
      toneProfile: {
        styleDirectives: ["custom-tone-marker directive"],
      },
      toneVersion: 2,
    });
    expect(secondPrefix.persona?.toneUpdatedAt).toBeUndefined();
    expect(secondPrefix.persona?.toneUpdatedBy).toBeUndefined();

    const [defaultPost] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({ body: contentItems.body })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
            eq(
              contentItems.dedupKey,
              "blog:narrator:weekly_recap:tone-profile:default",
            ),
          ),
        )
        .limit(1),
    );
    const [customPost] = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({ body: contentItems.body })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.leagueId, league.id),
            eq(contentItems.kind, "blog"),
            eq(
              contentItems.dedupKey,
              "blog:narrator:weekly_recap:tone-profile:custom",
            ),
          ),
        )
        .limit(1),
    );

    expect(defaultPost?.body).not.toContain("custom-tone-marker");
    expect(customPost?.body).toContain("custom-tone-marker");

    const runs = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({
          modelProviderKey: aiGenerationRuns.modelProviderKey,
          promptTemplateId: aiGenerationRuns.promptTemplateId,
          promptTemplateVersion: aiGenerationRuns.promptTemplateVersion,
          toneVersion: aiGenerationRuns.toneVersion,
          triggerKey: aiGenerationRuns.triggerKey,
        })
        .from(aiGenerationRuns)
        .where(eq(aiGenerationRuns.leagueId, league.id)),
    );
    expect(runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelProviderKey: "mock",
          promptTemplateId: DEFAULT_LEAGUE_BLOG_PROMPT_TEMPLATE_ID,
          promptTemplateVersion: DEFAULT_LEAGUE_BLOG_PROMPT_TEMPLATE_VERSION,
          toneVersion: 1,
          triggerKey: "weekly_recap:tone-profile:default",
        }),
        expect.objectContaining({
          modelProviderKey: "mock",
          promptTemplateId: DEFAULT_LEAGUE_BLOG_PROMPT_TEMPLATE_ID,
          promptTemplateVersion: DEFAULT_LEAGUE_BLOG_PROMPT_TEMPLATE_VERSION,
          toneVersion: 2,
          triggerKey: "weekly_recap:tone-profile:custom",
        }),
      ]),
    );
  });
});
