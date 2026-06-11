// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { contentItems, leagues } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { getCentralNewsHubData } from "./hub";

const marker = `newshub-${randomUUID()}`;
let handle: DbHandle;

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
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("central news hub", () => {
  it("returns only central news rows in freshness order", async () => {
    const [league] = await handle.db
      .insert(leagues)
      .values({
        name: "Scoped news fixture",
        provider: "espn",
        providerLeagueId: `${marker}-95050`,
      })
      .returning({ id: leagues.id });

    await handle.db.insert(contentItems).values([
      {
        body: "Older central body.",
        contentHash: `${marker}-older-central-hash`,
        dedupKey: `${marker}-older-central`,
        kind: "news",
        leagueId: null,
        publishedAt: new Date("2026-06-11T12:00:00.000Z"),
        source: "Older Wire",
        sourceUrl: `https://news.example.com/${marker}/older-central`,
        summary: "Older central summary.",
        title: "Older central story",
      },
      {
        body: "Fresh central body.",
        contentHash: `${marker}-fresh-central-hash`,
        dedupKey: `${marker}-fresh-central`,
        kind: "news",
        leagueId: null,
        publishedAt: new Date("2026-06-11T14:00:00.000Z"),
        source: "Fresh Wire",
        sourceUrl: `https://news.example.com/${marker}/fresh-central`,
        summary: "Fresh central summary.",
        title: "Fresh central story",
      },
      {
        body: "League news body.",
        contentHash: `${marker}-league-news-hash`,
        dedupKey: `${marker}-league-news`,
        kind: "news",
        leagueId: league.id,
        publishedAt: new Date("2026-06-11T15:00:00.000Z"),
        source: "Scoped Wire",
        sourceUrl: `https://news.example.com/${marker}/league-news`,
        summary: "League-scoped summary.",
        title: "League-scoped news story",
      },
      {
        body: "Central blog body.",
        contentHash: `${marker}-central-blog-hash`,
        dedupKey: `${marker}-central-blog`,
        kind: "blog",
        leagueId: null,
        publishedAt: new Date("2026-06-11T16:00:00.000Z"),
        summary: "Central blog summary.",
        title: "Central blog story",
      },
    ]);

    const data = await getCentralNewsHubData(handle.db, { limit: 100 });
    const markedItems = data.items.filter((item) =>
      item.sourceUrl.includes(marker),
    );

    const titles = markedItems.map((item) => item.title);
    expect(titles).toEqual(["Fresh central story", "Older central story"]);
    expect(markedItems[0]).toMatchObject({
      publishedAt: "2026-06-11T14:00:00.000Z",
      source: "Fresh Wire",
      sourceUrl: `https://news.example.com/${marker}/fresh-central`,
      summary: "Fresh central summary.",
    });
    expect(titles).not.toContain("League-scoped news story");
    expect(titles).not.toContain("Central blog story");
  });
});
