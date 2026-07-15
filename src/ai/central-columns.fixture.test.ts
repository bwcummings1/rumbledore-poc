// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import {
  bettingEvents,
  bettingMarkets,
  contentItems,
  oddsSnapshots,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { ingestMockGeneralStats } from "@/general-stats";
import { planCentralScheduledContent } from "@/jobs/central-content-planning";
import {
  getCentralNewsArticleData,
  getCentralNewsHubData,
  MockCentralNewsSource,
} from "@/news";
import type { NflWeekState } from "@/sports/nfl-calendar";
import {
  CENTRAL_COLUMN_KEYS,
  CENTRAL_COLUMN_LINEUP,
  centralColumnForId,
} from "./central-columns";
import { validateCentralContentStructure } from "./central-content-types";
import type { CentralDataFreshnessService } from "./central-freshness";
import type { GenerateCentralColumnInput } from "./central-pipeline";
import {
  createMockCentralAiDependencies,
  generateCentralColumn,
} from "./central-pipeline";
import { MockLlmClient } from "./mocks";

const marker = `central-columns-fixture-${randomUUID()}`;
const regularWeek: NflWeekState = {
  gamePhase: "quiet",
  phase: "regular",
  seasonWeek: 1,
};
const simulatedWeek = [
  new Date("2026-09-14T14:00:00.000Z"),
  new Date("2026-09-15T14:00:00.000Z"),
  new Date("2026-09-16T11:00:00.000Z"),
  new Date("2026-09-16T14:00:00.000Z"),
  new Date("2026-09-17T14:00:00.000Z"),
  new Date("2026-09-18T14:00:00.000Z"),
  new Date("2026-09-19T14:00:00.000Z"),
  new Date("2026-09-20T14:00:00.000Z"),
] as const;

let handle: DbHandle;
let injuryContentItemId: string;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fixtureFreshness(): CentralDataFreshnessService {
  return {
    async ensureFresh(input) {
      return [...new Set(input.dataSources)].map((dataSource) => ({
        dataSource,
        evidenceAt: input.now.toISOString(),
        maxAgeMs: 60_000,
        observedAt: input.now.toISOString(),
        refreshedAt: null,
        status: "fresh" as const,
      }));
    },
  };
}

async function seedMockCentralInputs(): Promise<void> {
  await ingestMockGeneralStats(handle.db, {
    fetchedAt: new Date("2026-09-14T13:55:00.000Z"),
  });

  const sourceItems = await new MockCentralNewsSource().fetch({
    limit: 25,
    now: new Date("2026-09-14T13:55:00.000Z"),
    topic: "nfl fantasy football",
  });
  const injury = sourceItems.find((item) => /injur/i.test(item.title));
  if (!injury) {
    throw new Error("mock central news source has no injury fixture");
  }
  const [insertedNews] = await handle.db
    .insert(contentItems)
    .values({
      body: injury.body ?? "",
      contentHash: `${marker}:injury-source`,
      dedupKey: `${marker}:injury-source`,
      kind: "news",
      leagueId: null,
      metadata: {
        centralSection: "wire",
        playerRefs: injury.playerRefs ?? [],
        publicationSection: "wire",
        section: "wire",
      },
      publishedAt: injury.publishedAt,
      source: injury.source,
      sourceUrl: injury.sourceUrl,
      summary: injury.summary ?? "",
      title: injury.title,
    })
    .returning({ id: contentItems.id });
  if (!insertedNews) {
    throw new Error("mock central injury source was not persisted");
  }
  injuryContentItemId = insertedNews.id;

  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: "KC",
      contentHash: `${marker}:event`,
      homeTeam: "MIN",
      provider: marker,
      providerEventId: `${marker}:kc-min`,
      sport: "nfl",
      startTime: new Date("2026-09-10T00:20:00.000Z"),
      status: "final",
    })
    .returning({ id: bettingEvents.id });
  if (!event) {
    throw new Error("mock central betting event was not persisted");
  }
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${marker}:market`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId: `${marker}:kc-min-spread`,
      status: "open",
      subject: "game",
      type: "spread",
    })
    .returning({ id: bettingMarkets.id });
  if (!market) {
    throw new Error("mock central betting market was not persisted");
  }
  await handle.db.insert(oddsSnapshots).values({
    capturedAt: new Date("2026-09-14T13:55:00.000Z"),
    homePrice: -110,
    line: -2.5,
    marketId: market.id,
    provider: marker,
    sourcePayloadHash: `${marker}:odds`,
  });
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
  await seedMockCentralInputs();
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(contentItems)
    .where(sql`${contentItems.dedupKey} like ${`%${marker}%`}`);
  await handle.db
    .delete(bettingEvents)
    .where(eq(bettingEvents.provider, marker));
  await handle.pool.end();
});

describe("central column fixture week", () => {
  it("publishes the complete shared lineup once, files it on the hub, and reuses every retry", async () => {
    const llm = new MockLlmClient();
    let generationNow = simulatedWeek[0];
    const deps = {
      ...createMockCentralAiDependencies(handle.db),
      freshness: fixtureFreshness(),
      llm,
      now: () => generationNow,
    };
    const generatedIds = new Set<string>();
    const scheduledColumnIds: string[] = [];

    for (const at of simulatedWeek) {
      generationNow = at;
      const plan = await planCentralScheduledContent({
        nflWeekState: regularWeek,
        now: () => at,
      });
      expect(plan.skippedReason).toBeNull();
      scheduledColumnIds.push(
        ...plan.planned.map((event) => event.data.columnId),
      );

      for (const event of plan.planned) {
        const input = {
          ...event.data,
          triggerKey: `${event.data.triggerKey}:${marker}`,
        };
        const first = await generateCentralColumn({
          deps,
          input,
        });
        const retry = await generateCentralColumn({
          deps,
          input,
        });
        expect(first).toMatchObject({ reused: false, status: "published" });
        expect(retry).toMatchObject({
          contentItemId: first.contentItemId,
          reused: true,
          status: "published",
        });
        generatedIds.add(first.contentItemId);
      }
    }

    expect(scheduledColumnIds).toEqual([
      "weekend-recap-mnf-projection",
      "mnf-recap",
      "pre-waiver",
      "rankings-projections",
      "post-waiver",
      "matchups",
      "rankings-projections",
      "matchups",
      "start-sit",
      "start-sit",
      "start-sit",
      "start-sit",
    ]);

    const queuedAndReactive: GenerateCentralColumnInput[] = [
      {
        columnId: "the-wire",
        newsContentItemIds: [injuryContentItemId],
        season: 2026,
        triggerKey: `${marker}:wire`,
        week: 1,
      },
      {
        columnId: "the-rundown",
        newsContentItemIds: [injuryContentItemId],
        reportRequest: {
          brief: "Explain the supplied fixture week's most useful NFL facts.",
          category: "Fixture week report",
        },
        season: 2026,
        triggerKey: `${marker}:rundown`,
        week: 1,
      },
      {
        columnId: "injuries",
        newsContentItemIds: [injuryContentItemId],
        season: 2026,
        triggerKey: `${marker}:injuries`,
        week: 1,
      },
    ];
    generationNow = new Date("2026-09-20T14:05:00.000Z");
    for (const input of queuedAndReactive) {
      const first = await generateCentralColumn({ deps, input });
      const retry = await generateCentralColumn({ deps, input });
      expect(first.reused).toBe(false);
      expect(retry).toMatchObject({
        contentItemId: first.contentItemId,
        reused: true,
      });
      generatedIds.add(first.contentItemId);
    }

    const rows = await handle.db
      .select({
        authorPersona: contentItems.authorPersona,
        body: contentItems.body,
        dedupKey: contentItems.dedupKey,
        id: contentItems.id,
        kind: contentItems.kind,
        leagueId: contentItems.leagueId,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(
        and(
          isNull(contentItems.leagueId),
          eq(contentItems.kind, "news"),
          sql`${contentItems.dedupKey} like ${`%${marker}%`}`,
          sql`${contentItems.metadata}->>'generatedBy' = 'central-journalist-engine'`,
        ),
      );

    expect(rows).toHaveLength(15);
    expect(generatedIds.size).toBe(15);
    expect(new Set(rows.map((row) => row.id))).toEqual(generatedIds);
    expect(new Set(rows.map((row) => row.dedupKey)).size).toBe(rows.length);
    expect(llm.centralRequests).toHaveLength(rows.length);

    const configuredColumnIds = CENTRAL_COLUMN_KEYS.map(
      (key) => CENTRAL_COLUMN_LINEUP[key].id,
    );
    expect(
      new Set(rows.map((row) => String(row.metadata.centralColumnId ?? ""))),
    ).toEqual(new Set(configuredColumnIds));

    for (const row of rows) {
      const columnId = String(row.metadata.centralColumnId ?? "");
      const column = centralColumnForId(columnId);
      if (!column) {
        throw new Error(`fixture row used unknown central column ${columnId}`);
      }
      const request = llm.centralRequests.find(
        (candidate) =>
          candidate.context.triggerKey ===
          asRecord(row.metadata.generation).triggerKey,
      );
      if (!request) {
        throw new Error(`fixture row ${row.id} has no matching LLM request`);
      }

      expect(row).toMatchObject({
        authorPersona: request.context.journalist.persona,
        kind: "news",
        leagueId: null,
      });
      expect(row.body.trim()).not.toBe("");
      expect(row.metadata).toMatchObject({
        centralBranch: column.branch,
        centralColumnId: column.id,
        centralSection: column.section,
        contentType: column.contentType,
        section: column.section,
        structure: { type: column.contentType },
      });
      expect(() =>
        validateCentralContentStructure({
          contentType: column.contentType,
          context: request.context,
          structure: row.metadata.structure,
        }),
      ).not.toThrow();
    }

    const hub = await getCentralNewsHubData(handle.db, { limit: 100 });
    const generatedHubItems = hub.items.filter((item) =>
      generatedIds.has(item.id),
    );
    expect(generatedHubItems).toHaveLength(rows.length);
    for (const item of generatedHubItems) {
      const row = rows.find((candidate) => candidate.id === item.id);
      const column = centralColumnForId(
        String(row?.metadata.centralColumnId ?? ""),
      );
      if (!column) {
        throw new Error(`hub item ${item.id} has no configured column`);
      }
      expect(item).toMatchObject({
        origin: "cast",
        section: { branch: column.branch, id: column.section },
        source: expect.any(String),
      });
    }

    const representativeByColumn = new Map(
      rows.map((row) => [String(row.metadata.centralColumnId), row.id]),
    );
    expect(representativeByColumn.size).toBe(configuredColumnIds.length);
    for (const articleId of representativeByColumn.values()) {
      const article = await getCentralNewsArticleData(handle.db, { articleId });
      expect(article.status).toBe("ready");
      if (article.status !== "ready") {
        throw new Error(`central fixture article ${articleId} was not ready`);
      }
      expect(article.data.article.bodyBlocks.length).toBeGreaterThanOrEqual(2);
      expect(article.data.article.byline).not.toBe("Unknown source");
    }
  });
});
