// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { contentItems, leagues } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  getCentralNewsArticleShareMetadata,
  getLeaguePressArticleShareMetadata,
} from "./share-metadata";

const marker = `sharemeta-${randomUUID()}`;
let handle: DbHandle;
let centralArticleId: string;
let retractedCentralArticleId: string;
let leagueAId: string;
let leagueBId: string;
let leagueArticleId: string;

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

  const [leagueA, leagueB] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Share Metadata League A",
        provider: "espn",
        providerLeagueId: `${marker}-league-a`,
        season: 2026,
        sport: "ffl",
      },
      {
        name: "Share Metadata League B",
        provider: "espn",
        providerLeagueId: `${marker}-league-b`,
        season: 2026,
        sport: "ffl",
      },
    ])
    .returning({ id: leagues.id });
  if (!leagueA || !leagueB) {
    throw new Error("test leagues were not inserted");
  }
  leagueAId = leagueA.id;
  leagueBId = leagueB.id;

  const centralRows = await handle.db
    .insert(contentItems)
    .values([
      {
        body: "Central article body.",
        contentHash: `${marker}-central-hash`,
        dedupKey: `${marker}-central`,
        kind: "news",
        leagueId: null,
        metadata: { dek: "Central card summary.", section: "injuries" },
        publishedAt: new Date("2026-07-09T12:00:00.000Z"),
        source: "Central Wire",
        summary: "Central fallback summary.",
        title: "Central story gets a card",
      },
      {
        body: "Retracted central body.",
        contentHash: `${marker}-central-retracted-hash`,
        dedupKey: `${marker}-central-retracted`,
        kind: "news",
        leagueId: null,
        publishedAt: new Date("2026-07-09T13:00:00.000Z"),
        source: "Central Wire",
        status: "retracted",
        summary: "Retracted central summary.",
        title: "Retracted central story",
      },
    ])
    .returning({ dedupKey: contentItems.dedupKey, id: contentItems.id });
  centralArticleId =
    centralRows.find((row) => row.dedupKey === `${marker}-central`)?.id ?? "";
  retractedCentralArticleId =
    centralRows.find((row) => row.dedupKey === `${marker}-central-retracted`)
      ?.id ?? "";
  if (!centralArticleId || !retractedCentralArticleId) {
    throw new Error("central content rows were not inserted");
  }

  await withLeagueContext(handle.db, leagueAId, async (tx) => {
    const [article] = await tx
      .insert(contentItems)
      .values({
        authorPersona: "narrator",
        body: "PRIVATE LEAGUE BODY COPY SHOULD NOT LEAK",
        contentHash: `${marker}-league-a-article-hash`,
        dedupKey: `${marker}-league-a-article`,
        kind: "blog",
        leagueId: leagueAId,
        metadata: { section: "recaps" },
        publishedAt: new Date("2026-07-09T14:00:00.000Z"),
        summary: "PRIVATE LEAGUE SUMMARY SHOULD NOT LEAK",
        title: "Narrator files the league card",
      })
      .returning({ id: contentItems.id });
    leagueArticleId = article?.id ?? "";
  });

  if (!leagueArticleId) {
    throw new Error("league content row was not inserted");
  }
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(contentItems)
    .where(sql`${contentItems.dedupKey} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("share metadata loaders", () => {
  it("loads central article share fields and summary", async () => {
    const result = await getCentralNewsArticleShareMetadata(handle.db, {
      articleId: centralArticleId,
    });

    expect(result).toMatchObject({
      data: {
        byline: "Central Wire",
        contentHash: `${marker}-central-hash`,
        dek: "Central card summary.",
        section: { label: "Injuries" },
        status: "published",
        title: "Central story gets a card",
      },
      status: "ready",
    });
  });

  it("returns non-published central rows for neutral lifecycle cards", async () => {
    const result = await getCentralNewsArticleShareMetadata(handle.db, {
      articleId: retractedCentralArticleId,
    });

    expect(result).toMatchObject({
      data: {
        status: "retracted",
        title: "Retracted central story",
      },
      status: "ready",
    });
  });

  it("loads league article card fields without serializing body or summary text", async () => {
    const result = await getLeaguePressArticleShareMetadata(handle.db, {
      leagueId: leagueAId,
      postId: leagueArticleId,
    });

    expect(result).toMatchObject({
      data: {
        byline: "Narrator",
        contentHash: `${marker}-league-a-article-hash`,
        league: { id: leagueAId, name: "Share Metadata League A" },
        section: { label: "Recaps" },
        status: "published",
        title: "Narrator files the league card",
      },
      status: "ready",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PRIVATE LEAGUE BODY");
    expect(serialized).not.toContain("PRIVATE LEAGUE SUMMARY");
  });

  it("does not resolve a league article through another league context", async () => {
    await expect(
      getLeaguePressArticleShareMetadata(handle.db, {
        leagueId: leagueBId,
        postId: leagueArticleId,
      }),
    ).resolves.toEqual({ status: "not_found" });
  });
});
