// @vitest-environment node
import { randomUUID } from "node:crypto";
import { like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { contentItems, leagues } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { centralGenerationKey } from "./central-generation-key";
import { buildCentralEditorialRecall } from "./editorial-recall";
import type { EmbeddingProvider } from "./interfaces";

const marker = `central-recall-${randomUUID()}`;
const now = new Date("2026-10-01T12:00:00.000Z");
let handle: DbHandle;

class TopicEmbeddingProvider implements EmbeddingProvider {
  readonly model = "test-topic-embedding-v1";

  async embed(text: string): Promise<number[]> {
    return text.includes("target-pressure-angle") ? [1, 0] : [0, 1];
  }
}

async function insertCentralCoverage(input: {
  body?: string;
  publishedAt: Date;
  status?: "published" | "retracted";
  summary: string;
  tag: string;
  title: string;
}) {
  const [item] = await handle.db
    .insert(contentItems)
    .values({
      body: input.body ?? `${marker} full article body`,
      contentHash: `${marker}:${input.tag}:hash`,
      dedupKey: `${marker}:${input.tag}`,
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
      publishedAt: input.publishedAt,
      source: "Avery Stone",
      status: input.status ?? "published",
      summary: input.summary,
      title: input.title,
    })
    .returning({ id: contentItems.id });
  if (!item) throw new Error("central recall fixture was not inserted");
  return item;
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
    .delete(contentItems)
    .where(sql`${contentItems.dedupKey} like ${`${marker}:%`}`);
  await handle.db
    .delete(leagues)
    .where(like(leagues.providerLeagueId, `${marker}-%`));
  await handle.pool.end();
});

describe("central editorial recall", () => {
  it("ranks recent central headlines by relevance without leaking league or non-published coverage", async () => {
    const relevant = await insertCentralCoverage({
      body: "FULL BODY MUST NOT ENTER THE RECALL DIGEST",
      publishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60_000),
      summary:
        "target-pressure-angle already framed the slate through protection mismatches.",
      tag: "relevant",
      title: "Pressure changes the matchup map",
    });
    const irrelevant = await insertCentralCoverage({
      publishedAt: new Date(now.getTime() - 5 * 60_000),
      summary: "A recent but unrelated special-teams notebook.",
      tag: "irrelevant",
      title: "Return units under review",
    });
    await insertCentralCoverage({
      publishedAt: new Date(now.getTime() - 20 * 24 * 60 * 60_000),
      summary: "target-pressure-angle outside the recall window.",
      tag: "stale",
      title: "An old protection notebook",
    });
    await insertCentralCoverage({
      publishedAt: new Date(now.getTime() - 60_000),
      status: "retracted",
      summary: "target-pressure-angle in retracted coverage.",
      tag: "retracted",
      title: "Retracted pressure note",
    });

    const [league] = await handle.db
      .insert(leagues)
      .values({
        currentScoringPeriod: 1,
        name: `${marker} League`,
        provider: "espn",
        providerLeagueId: `${marker}-league`,
        scoringType: "H2H_POINTS",
        season: 2026,
        size: 2,
        sport: "ffl",
        status: "in_season",
      })
      .returning({ id: leagues.id });
    if (!league) throw new Error("league recall fixture was not inserted");
    let leagueContentItemId = "";
    await withLeagueContext(handle.db, league.id, async (tx) => {
      const [item] = await tx
        .insert(contentItems)
        .values({
          body: `${marker} league-only body`,
          contentHash: `${marker}:league:hash`,
          dedupKey: `${marker}:league-post`,
          kind: "blog",
          leagueId: league.id,
          metadata: {},
          publishedAt: new Date(now.getTime() - 30_000),
          summary:
            "target-pressure-angle from another publication pool must stay isolated.",
          title: "League-only pressure angle",
        })
        .returning({ id: contentItems.id });
      if (!item) throw new Error("league content fixture was not inserted");
      leagueContentItemId = item.id;
    });

    const queuedKey = centralGenerationKey({
      columnId: "pre-waiver",
      triggerKey: `${marker}:queued`,
    });
    const recall = await buildCentralEditorialRecall({
      currentJournalistId: "fantasy-data-analyst",
      db: handle.db,
      digestLimit: 1,
      embeddings: new TopicEmbeddingProvider(),
      now,
      query: "target-pressure-angle for this matchup assignment",
      queuedGenerationKeys: [queuedKey, queuedKey, "  "],
    });

    expect(recall).toMatchObject({
      publicationPool: "central",
      publishedContentItemIds: [relevant.id],
      queuedGenerationKeys: [queuedKey],
    });
    expect(recall.publishedContentItemIds).not.toContain(irrelevant.id);
    expect(recall.publishedContentItemIds).not.toContain(leagueContentItemId);
    expect(recall.digest).toContain("Pressure changes the matchup map");
    expect(recall.digest).toContain("protection mismatches");
    expect(recall.digest).toContain("same journalist");
    expect(recall.digest).toContain("Pre-waiver");
    expect(recall.digest).not.toContain("League-only pressure angle");
    expect(recall.digest).not.toContain("FULL BODY MUST NOT ENTER");
  });
});
