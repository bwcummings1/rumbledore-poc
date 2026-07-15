// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { contentItems } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  type CentralNewsSource,
  type CentralNewsSourceItem,
  canonicalizeNewsUrl,
  refreshCentralNews,
} from "@/news";
import { CompositeCentralNewsSource } from "./composite";

const marker = `newstest-${randomUUID()}`;
let handle: DbHandle;

class StaticCentralNewsSource implements CentralNewsSource {
  constructor(private readonly items: CentralNewsSourceItem[]) {}

  async fetch(): Promise<CentralNewsSourceItem[]> {
    return this.items;
  }
}

async function violatedConstraint(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint ?? String(cause ?? error);
  }
  throw new Error("expected the query to be rejected, but it succeeded");
}

async function centralRows() {
  return handle.db
    .select()
    .from(contentItems)
    .where(
      and(
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
        sql`${contentItems.dedupKey} like ${`%${marker}%`}`,
      ),
    );
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
    .where(sql`${contentItems.dedupKey} like ${`%${marker}%`}`);
  await handle.pool.end();
});

describe("central news ingestion", () => {
  it("canonicalizes URLs by removing tracking noise", () => {
    expect(
      canonicalizeNewsUrl(
        `HTTPS://NEWS.EXAMPLE.COM/${marker}/story/?utm_source=x&b=2&a=1#frag`,
      ),
    ).toBe(`https://news.example.com/${marker}/story?a=1&b=2`);
  });

  it("deduplicates source items and persists central news idempotently", async () => {
    const storyUrl = `https://news.example.com/${marker}/qb-injury`;
    const roundupUrl = `https://news.example.com/${marker}/waiver-roundup`;
    const source = new CompositeCentralNewsSource([
      new StaticCentralNewsSource([
        {
          body: "The starting quarterback missed practice, changing the fantasy outlook for Sunday.",
          id: `${marker}-qb-primary`,
          publishedAt: new Date("2026-06-11T14:00:00.000Z"),
          source: "NFL Wire",
          sourceType: "web",
          sourceUrl: `${storyUrl}?utm_source=newsletter`,
          summary:
            "A quarterback injury update with central fantasy relevance.",
          title: "Quarterback injury changes Sunday fantasy outlook",
          topics: ["injury", "fantasy"],
        },
        {
          body: "A separate waiver roundup with broad fantasy relevance.",
          id: `${marker}-waivers`,
          publishedAt: new Date("2026-06-11T12:00:00.000Z"),
          source: "Waiver Wire",
          sourceType: "web",
          sourceUrl: roundupUrl,
          summary: "Waiver names to monitor before Sunday.",
          title: "Waiver wire names to monitor",
          topics: ["waivers"],
        },
        {
          body: "Missing title should be skipped.",
          id: `${marker}-bad`,
          publishedAt: new Date("2026-06-11T12:00:00.000Z"),
          source: "Broken Feed",
          sourceType: "web",
          sourceUrl: `https://news.example.com/${marker}/broken`,
          title: "   ",
        },
      ]),
      new StaticCentralNewsSource([
        {
          body: "Duplicate mirror item.",
          id: `${marker}-qb-mirror`,
          publishedAt: new Date("2026-06-11T13:00:00.000Z"),
          source: "Fantasy Mirror",
          sourceType: "rss",
          sourceUrl: `${storyUrl}/?utm_medium=rss`,
          summary: "A mirrored quarterback injury update.",
          title: "Quarterback injury changes Sunday fantasy outlook",
          topics: ["fantasy"],
        },
      ]),
    ]);

    const first = await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T15:00:00.000Z"),
        source,
      },
      input: { limit: 10, topic: "fantasy injuries" },
    });
    const second = await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T15:05:00.000Z"),
        source,
      },
      input: { limit: 10, topic: "fantasy injuries" },
    });

    expect(first).toMatchObject({
      deduped: 1,
      fetched: 4,
      inserted: 2,
      skipped: 1,
      unchanged: 0,
      updated: 0,
    });
    expect(second).toMatchObject({
      deduped: 1,
      fetched: 4,
      inserted: 0,
      skipped: 1,
      unchanged: 2,
      updated: 0,
    });

    const rows = await centralRows();
    expect(rows).toHaveLength(2);
    const injury = rows.find((row) => row.sourceUrl === storyUrl);
    expect(injury).toMatchObject({
      kind: "news",
      leagueId: null,
      source: "NFL Wire",
      sourceUrl: storyUrl,
      title: "Quarterback injury changes Sunday fantasy outlook",
    });
    expect(
      (injury?.metadata as { sources?: unknown[] } | undefined)?.sources,
    ).toHaveLength(2);
    expect(injury?.metadata).toMatchObject({
      centralSection: "wire",
      dek: "A quarterback injury update with central fantasy relevance.",
      editorialImportance: expect.any(Number),
      section: "wire",
      sourceTypes: ["rss", "web"],
      tags: expect.arrayContaining(["fantasy", "wire"]),
      topics: ["fantasy", "injury"],
    });
  });

  it("updates an existing central story when the canonical content changes", async () => {
    const storyUrl = `https://news.example.com/${marker}/late-update`;
    const initialSource = new StaticCentralNewsSource([
      {
        body: "Initial report body.",
        id: `${marker}-late-update`,
        publishedAt: new Date("2026-06-11T16:00:00.000Z"),
        source: "NFL Wire",
        sourceUrl: storyUrl,
        summary: "Initial report.",
        title: "Late practice report",
      },
    ]);
    const updatedSource = new StaticCentralNewsSource([
      {
        body: "Updated report body with materially different fantasy context.",
        id: `${marker}-late-update`,
        publishedAt: new Date("2026-06-11T16:30:00.000Z"),
        source: "NFL Wire",
        sourceUrl: `${storyUrl}?utm_campaign=update`,
        summary: "Updated report.",
        title: "Late practice report",
      },
    ]);

    await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T16:05:00.000Z"),
        source: initialSource,
      },
    });
    const updated = await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T16:35:00.000Z"),
        source: updatedSource,
      },
    });

    expect(updated).toMatchObject({
      inserted: 0,
      unchanged: 0,
      updated: 1,
    });
    const [row] = (await centralRows()).filter(
      (item) => item.sourceUrl === storyUrl,
    );
    expect(row).toMatchObject({
      body: "Updated report body with materially different fantasy context.",
      summary: "Updated report.",
    });
  });

  it("merges provenance when a later refresh sees an existing story from a new source", async () => {
    const storyUrl = `https://news.example.com/${marker}/cross-batch`;
    const initialSource = new StaticCentralNewsSource([
      {
        body: "Initial web report body.",
        id: `${marker}-cross-batch-web`,
        publishedAt: new Date("2026-06-11T19:00:00.000Z"),
        source: "Web Desk",
        sourceType: "web",
        sourceUrl: storyUrl,
        summary: "Initial web report.",
        title: "Cross batch report",
        topics: ["fantasy"],
      },
    ]);
    const rssSource = new StaticCentralNewsSource([
      {
        body: "RSS follow-up with materially more context for the same report.",
        id: `${marker}-cross-batch-rss`,
        publishedAt: new Date("2026-06-11T19:05:00.000Z"),
        source: "RSS Desk",
        sourceType: "rss",
        sourceUrl: `${storyUrl}?utm_medium=rss`,
        summary: "RSS follow-up report.",
        title: "Cross batch report",
        topics: ["rss", "fantasy"],
      },
    ]);

    await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T19:01:00.000Z"),
        source: initialSource,
      },
    });
    const updated = await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T19:06:00.000Z"),
        source: rssSource,
      },
    });

    expect(updated).toMatchObject({
      inserted: 0,
      unchanged: 0,
      updated: 1,
    });

    const [row] = (await centralRows()).filter(
      (item) => item.sourceUrl === storyUrl,
    );
    expect(row.metadata).toMatchObject({
      sourceIds: [`${marker}-cross-batch-rss`, `${marker}-cross-batch-web`],
      sourceTypes: ["rss", "web"],
    });
    expect((row.metadata as { sources?: unknown[] }).sources).toEqual(
      expect.arrayContaining([
        { source: "RSS Desk", url: storyUrl },
        { source: "Web Desk", url: storyUrl },
      ]),
    );
  });

  it("enforces central deduplication at the database level", async () => {
    const dedupKey = `${marker}-manual-central-dedup`;
    const row = {
      body: "Manual central body.",
      contentHash: `${marker}-manual-hash`,
      dedupKey,
      kind: "news" as const,
      leagueId: null,
      publishedAt: new Date("2026-06-11T17:00:00.000Z"),
      source: "Manual Feed",
      sourceUrl: `https://news.example.com/${marker}/manual`,
      summary: "Manual central summary.",
      title: "Manual central story",
    };

    await handle.db.insert(contentItems).values(row);

    await expect(
      violatedConstraint(
        handle.db.insert(contentItems).values({
          ...row,
          contentHash: `${marker}-manual-hash-2`,
          sourceUrl: `https://news.example.com/${marker}/manual-copy`,
        }),
      ),
    ).resolves.toBe("content_item_central_scope_dedup_unique");
  });
});
