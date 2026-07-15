// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { aiMemory, contentItems } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { ingestMockGeneralStats } from "@/general-stats";
import { getCentralNewsArticleData, MockCentralNewsSource } from "@/news";
import { centralGenerationKey } from "./central-generation-key";
import {
  createMockCentralAiDependencies,
  generateCentralColumn,
} from "./central-pipeline";
import { DeterministicEmbeddingProvider, MockLlmClient } from "./mocks";

const marker = `central-engine-${randomUUID()}`;
let handle: DbHandle;
let injuryContentItemId: string;

function testCentralAiDependencies() {
  const deps = createMockCentralAiDependencies(handle.db);
  return {
    ...deps,
    duplicateThreshold: 1.1,
    freshness: {
      async ensureFresh(
        input: Parameters<typeof deps.freshness.ensureFresh>[0],
      ) {
        return input.dataSources.map((dataSource) => ({
          dataSource,
          evidenceAt: input.now.toISOString(),
          maxAgeMs: 60_000,
          observedAt: input.now.toISOString(),
          refreshedAt: null,
          status: "fresh" as const,
        }));
      },
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
  await ingestMockGeneralStats(handle.db, {
    fetchedAt: new Date("2026-09-15T12:00:00.000Z"),
  });
  const mockItems = await new MockCentralNewsSource().fetch({
    limit: 25,
    now: new Date("2026-09-15T12:00:00.000Z"),
    topic: "nfl fantasy football",
  });
  const injuryItem = mockItems.find((item) => /injur/i.test(item.title));
  if (!injuryItem) throw new Error("mock news source has no injury fixture");
  const [inserted] = await handle.db
    .insert(contentItems)
    .values({
      body: injuryItem.body ?? "",
      contentHash: marker,
      dedupKey: `${marker}:mock-injury-source`,
      kind: "news",
      leagueId: null,
      metadata: {
        centralSection: "wire",
        playerRefs: injuryItem.playerRefs ?? [],
        publicationSection: "wire",
        section: "wire",
      },
      publishedAt: injuryItem.publishedAt,
      source: injuryItem.source,
      sourceUrl: injuryItem.sourceUrl,
      summary: injuryItem.summary ?? "",
      title: injuryItem.title,
    })
    .returning({ id: contentItems.id });
  if (!inserted) throw new Error("mock injury item was not persisted");
  injuryContentItemId = inserted.id;
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(contentItems)
    .where(sql`${contentItems.dedupKey} like ${`%${marker}%`}`);
  await handle.pool.end();
});

describe("central journalist generation pipeline", () => {
  it("rejects pre-generation context from outside the central pool", async () => {
    await expect(
      generateCentralColumn({
        deps: testCentralAiDependencies(),
        input: {
          columnId: "start-sit",
          preGenerationContext: {
            digest: "This must never cross publication pools.",
            publicationPool: "league" as "central",
            publishedContentItemIds: [],
            queuedGenerationKeys: [],
          },
          season: 2026,
          triggerKey: `${marker}:cross-pool`,
          week: 1,
        },
      }),
    ).rejects.toMatchObject({
      code: "CENTRAL_AI_PRE_GENERATION_CONTEXT_INVALID",
    });
  });

  it("publishes one shared structured article and exposes the recall injection seam", async () => {
    const llm = new MockLlmClient();
    const deps = {
      ...testCentralAiDependencies(),
      llm,
      now: () => new Date("2026-09-15T14:00:00.000Z"),
    };
    const input = {
      columnId: "rankings-projections" as const,
      preGenerationContext: {
        digest:
          "Continue the supplied central rankings throughline without repeating the prior lead.",
        publicationPool: "central" as const,
        publishedContentItemIds: ["published-central-fixture"],
        queuedGenerationKeys: ["queued-central-fixture"],
      },
      season: 2026,
      triggerKey: `${marker}:rankings`,
      week: 1,
    };

    const first = await generateCentralColumn({ deps, input });
    const second = await generateCentralColumn({ deps, input });
    expect(first).toMatchObject({ reused: false, status: "published" });
    if (first.status !== "published" || second.status !== "published") {
      throw new Error("central generation fixture was not published");
    }
    expect(second).toMatchObject({
      contentItemId: first.contentItemId,
      reused: true,
      status: "published",
    });
    expect(llm.centralRequests).toHaveLength(1);
    expect(llm.centralRequests[0]?.context).toMatchObject({
      column: {
        branch: "fantasy",
        contentType: "central_rankings_projections",
        section: "rankings-projections",
      },
      evidence: {
        games: expect.arrayContaining([
          expect.objectContaining({ sourceGameId: "mock-2026-w01-kc-min" }),
        ]),
        players: expect.arrayContaining([
          expect.objectContaining({ fullName: "Patrick Mahomes" }),
        ]),
        source: "mock-nfl-general-stats",
        sourceFreshness: [
          expect.objectContaining({ dataSource: "general-stats" }),
        ],
      },
      preGenerationContext: input.preGenerationContext,
    });
    expect(llm.centralRequests[0]?.prompt.volatileContext).toContain(
      input.preGenerationContext.digest,
    );

    const [row] = await handle.db
      .select({
        authorPersona: contentItems.authorPersona,
        id: contentItems.id,
        kind: contentItems.kind,
        leagueId: contentItems.leagueId,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(eq(contentItems.id, first.contentItemId));
    expect(row).toMatchObject({
      authorPersona: "analyst",
      id: first.contentItemId,
      kind: "news",
      leagueId: null,
      metadata: {
        centralBranch: "fantasy",
        centralColumnId: "rankings-projections",
        centralSection: "rankings-projections",
        contentType: "central_rankings_projections",
        generatedBy: "central-journalist-engine",
        generation: {
          sourceFreshness: [
            expect.objectContaining({ dataSource: "general-stats" }),
          ],
        },
        preGenerationContext: {
          injected: true,
          publicationPool: "central",
        },
        section: "rankings-projections",
        structure: {
          outputLabel: "computed",
          type: "central_rankings_projections",
        },
      },
    });
  });

  it("skips a different-trigger central draft that stays near-identical after the retry nudge", async () => {
    const llm = new MockLlmClient();
    const deps = {
      ...testCentralAiDependencies(),
      duplicateThreshold: 0.92,
      embeddings: new DeterministicEmbeddingProvider(17),
      llm,
      now: () => new Date("2026-09-15T15:00:00.000Z"),
    };
    const firstInput = {
      columnId: "mnf-recap" as const,
      newsContentItemIds: [],
      season: 2199,
      triggerKey: `${marker}:near-duplicate:first`,
      week: 25,
    };
    const secondInput = {
      ...firstInput,
      triggerKey: `${marker}:near-duplicate:second`,
    };

    const first = await generateCentralColumn({ deps, input: firstInput });
    expect(first).toMatchObject({ reused: false, status: "published" });
    if (first.status !== "published") {
      throw new Error("near-duplicate regression seed was not published");
    }

    const second = await generateCentralColumn({ deps, input: secondInput });
    expect(second).toEqual({
      reused: false,
      skipReason: "near_duplicate:1.0000",
      status: "skipped",
    });
    expect(llm.centralRequests.map((request) => request.attempt)).toEqual([
      1, 1, 2,
    ]);
    expect(llm.centralRequests[2]?.duplicateNudge).toContain(
      "recent central article",
    );

    const memories = await handle.db
      .select({
        contentItemId: aiMemory.contentItemId,
        embeddingDimensions: aiMemory.embeddingDimensions,
        leagueId: aiMemory.leagueId,
        source: aiMemory.source,
      })
      .from(aiMemory)
      .where(eq(aiMemory.contentItemId, first.contentItemId));
    expect(memories).toEqual([
      {
        contentItemId: first.contentItemId,
        embeddingDimensions: 17,
        leagueId: null,
        source: "central_article",
      },
    ]);

    const skippedRows = await handle.db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(
        and(
          isNull(contentItems.leagueId),
          eq(contentItems.dedupKey, centralGenerationKey(secondInput)),
        ),
      );
    expect(skippedRows).toEqual([]);
  });

  it("automatically gives the writer recent central angles and queued sibling assignments", async () => {
    const priorSummary = `${marker} already used pressure mismatches as the matchup lead.`;
    const [prior] = await handle.db
      .insert(contentItems)
      .values({
        body: "FULL PRIOR ARTICLE BODY MUST STAY OUT OF RECALL",
        contentHash: `${marker}:prior-angle:hash`,
        dedupKey: `${marker}:prior-angle`,
        kind: "news",
        leagueId: null,
        metadata: {
          centralSection: "matchups",
          journalist: {
            id: "fantasy-data-analyst",
            name: "Avery Stone",
          },
          tags: ["pressure", "matchups"],
        },
        publishedAt: new Date("2026-09-15T13:59:00.000Z"),
        source: "Avery Stone",
        summary: priorSummary,
        title: `${marker} Protection pressure shaped the early slate`,
      })
      .returning({ id: contentItems.id });
    if (!prior) throw new Error("prior central angle was not inserted");

    const llm = new MockLlmClient();
    const queuedGenerationKey = centralGenerationKey({
      columnId: "rankings-projections",
      triggerKey: `${marker}:queued-ranking-sibling`,
    });
    const result = await generateCentralColumn({
      deps: {
        ...testCentralAiDependencies(),
        llm,
        now: () => new Date("2026-09-15T14:00:00.000Z"),
      },
      input: {
        columnId: "matchups",
        queuedGenerationKeys: [queuedGenerationKey],
        season: 2026,
        triggerKey: `${marker}:automatic-recall`,
        week: 1,
      },
    });
    if (result.status !== "published") {
      throw new Error("automatic-recall central fixture was not published");
    }

    const request = llm.centralRequests[0];
    expect(request?.context.preGenerationContext).toMatchObject({
      publicationPool: "central",
      publishedContentItemIds: expect.arrayContaining([prior.id]),
      queuedGenerationKeys: [queuedGenerationKey],
    });
    expect(request?.context.preGenerationContext?.digest).toContain(
      priorSummary,
    );
    expect(request?.context.preGenerationContext?.digest).toContain(
      "Rankings & Projections",
    );
    expect(request?.context.preGenerationContext?.digest).not.toContain(
      "FULL PRIOR ARTICLE BODY",
    );
    expect(request?.prompt.volatileContext).toContain(priorSummary);
    expect(request?.prompt.systemPrefix).not.toContain(priorSummary);
    expect(JSON.stringify(request?.context.evidence)).not.toContain(
      priorSummary,
    );

    const [row] = await handle.db
      .select({ metadata: contentItems.metadata })
      .from(contentItems)
      .where(eq(contentItems.id, result.contentItemId));
    expect(row?.metadata).toMatchObject({
      preGenerationContext: {
        injected: true,
        publicationPool: "central",
        publishedContentItemIds: expect.arrayContaining([prior.id]),
        queuedGenerationKeys: [queuedGenerationKey],
      },
    });
    expect(JSON.stringify(row?.metadata)).not.toContain(priorSummary);
  });

  it("files a mock injury event to The Wire without a fantasy implication", async () => {
    const result = await generateCentralColumn({
      deps: {
        ...testCentralAiDependencies(),
        now: () => new Date("2026-09-15T14:05:00.000Z"),
      },
      input: {
        columnId: "the-wire",
        newsContentItemIds: [injuryContentItemId],
        season: 2026,
        triggerKey: `${marker}:wire-injury`,
        week: 1,
      },
    });
    if (result.status !== "published") {
      throw new Error("Wire central fixture was not published");
    }
    const [row] = await handle.db
      .select({ metadata: contentItems.metadata })
      .from(contentItems)
      .where(eq(contentItems.id, result.contentItemId));
    expect(row?.metadata).toMatchObject({
      centralBranch: "news",
      centralSection: "wire",
      structure: {
        event: {
          category: "injury",
          sourceItemId: injuryContentItemId,
        },
        fantasyImplicationIncluded: false,
        type: "central_wire_blurb",
      },
    });
  });

  it("publishes a valid unavailable structure when mock evidence is absent", async () => {
    const result = await generateCentralColumn({
      deps: testCentralAiDependencies(),
      input: {
        columnId: "injuries",
        newsContentItemIds: [],
        season: 2099,
        triggerKey: `${marker}:empty-injuries`,
        week: 1,
      },
    });
    if (result.status !== "published") {
      throw new Error("unavailable central fixture was not published");
    }
    const [row] = await handle.db
      .select({ metadata: contentItems.metadata })
      .from(contentItems)
      .where(eq(contentItems.id, result.contentItemId));
    expect(row?.metadata.structure).toEqual({
      dataStatus: "unavailable",
      type: "central_injuries",
      updates: [],
    });
  });

  it("publishes reader body blocks from validated structure, not fabricated model prose", async () => {
    const model = new MockLlmClient();
    const fabricatedClaims = [
      "KC beat BUF 99-0.",
      "Patrick Mahomes tore his ACL.",
      "A $95 FAB bid was processed.",
      "The recalled digest confirms every claim.",
    ];
    const result = await generateCentralColumn({
      deps: {
        ...testCentralAiDependencies(),
        llm: {
          async generateCentral(request) {
            const draft = await model.generateCentral(request);
            return {
              ...draft,
              body: fabricatedClaims.join(" "),
              bodyBlocks: [
                { text: fabricatedClaims[0] ?? "", type: "heading" },
                {
                  text: fabricatedClaims.slice(1).join(" "),
                  type: "paragraph",
                },
              ],
            };
          },
        },
        now: () => new Date("2026-09-15T14:10:00.000Z"),
      },
      input: {
        columnId: "mnf-recap",
        preGenerationContext: {
          digest: "The recalled digest confirms every claim.",
          publicationPool: "central",
          publishedContentItemIds: ["recall-only-fixture"],
          queuedGenerationKeys: [],
        },
        season: 2099,
        triggerKey: `${marker}:fabricated-reader-body`,
        week: 1,
      },
    });
    if (result.status !== "published") {
      throw new Error("fabricated-body central fixture was not published");
    }

    const article = await getCentralNewsArticleData(handle.db, {
      articleId: result.contentItemId,
    });
    expect(article.status).toBe("ready");
    if (article.status !== "ready") {
      throw new Error("fabricated-body regression article was not ready");
    }
    const readerBody = [
      article.data.article.body,
      JSON.stringify(article.data.article.bodyBlocks),
    ].join("\n");
    expect(readerBody).toContain(
      "No supplied Monday-night final was available.",
    );
    for (const claim of fabricatedClaims) {
      expect(readerBody).not.toContain(claim);
    }
  });
});
