// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { contentItems } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { CentralNewsSource, CentralNewsSourceItem } from "@/news";
import { JOB_EVENTS } from "./events";
import {
  createNewsRefreshFunction,
  newsRefresh,
  runNewsRefresh,
} from "./functions/news-refresh";
import { functions } from "./index";

const marker = `newsjob-${randomUUID()}`;
let handle: DbHandle;

class StaticCentralNewsSource implements CentralNewsSource {
  async fetch(): Promise<CentralNewsSourceItem[]> {
    return [
      {
        body: "News job body.",
        id: `${marker}-item`,
        publishedAt: new Date("2026-06-11T18:00:00.000Z"),
        source: "Job Feed",
        sourceUrl: `https://news.example.com/${marker}/job-story`,
        summary: "News job summary.",
        title: "News job story",
      },
    ];
  }
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

describe("news.refresh Inngest function", () => {
  it("runs central news ingestion through the Inngest test engine", async () => {
    const fn = createNewsRefreshFunction(() => ({
      db: handle.db,
      now: () => new Date("2026-06-11T18:05:00.000Z"),
      source: new StaticCentralNewsSource(),
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        limit: 5,
        topic: "job test",
      },
      id: `${marker}-event`,
      name: JOB_EVENTS.newsRefresh,
    };

    const { result } = await testEngine.execute({ events: [event] });

    expect(result).toMatchObject({
      eventName: JOB_EVENTS.newsRefresh,
      fetched: 1,
      inserted: 1,
      ok: true,
    });
  });

  it("rejects invalid payloads without retrying", async () => {
    await expect(
      runNewsRefresh({
        data: {
          limit: 0,
        },
        deps: {
          db: handle.db,
          source: new StaticCentralNewsSource(),
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(newsRefresh);
  });
});
