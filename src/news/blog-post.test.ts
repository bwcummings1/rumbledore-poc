// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { contentItems, leagues, members, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { getLeagueBlogPostData } from "./blog-post";

const marker = `blogposttest-${randomUUID()}`;
let handle: DbHandle;
let leagueAId: string;
let leagueBId: string;
let userId: string;
let outsiderUserId: string;
let leagueABlogId: string;
let leagueBBlogId: string;
let centralNewsId: string;

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

  const [memberUser] = await handle.db
    .insert(users)
    .values({
      displayName: "Blog Post Test Member",
      email: `${marker}-member@example.com`,
    })
    .returning({ id: users.id });
  const [outsider] = await handle.db
    .insert(users)
    .values({
      displayName: "Blog Post Test Outsider",
      email: `${marker}-outsider@example.com`,
    })
    .returning({ id: users.id });
  if (!memberUser || !outsider) {
    throw new Error("test users were not inserted");
  }
  userId = memberUser.id;
  outsiderUserId = outsider.id;

  const insertedLeagues = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Blog League A",
        provider: "espn",
        providerLeagueId: `${marker}-league-a`,
        season: 2026,
        sport: "ffl",
      },
      {
        name: "Blog League B",
        provider: "espn",
        providerLeagueId: `${marker}-league-b`,
        season: 2026,
        sport: "ffl",
      },
    ])
    .returning({ id: leagues.id });
  const [leagueA, leagueB] = insertedLeagues;
  if (!leagueA || !leagueB) {
    throw new Error("test leagues were not inserted");
  }
  leagueAId = leagueA.id;
  leagueBId = leagueB.id;

  await handle.db.insert(members).values({
    organizationId: leagueAId,
    role: "commissioner",
    userId,
  });

  const [centralNews] = await handle.db
    .insert(contentItems)
    .values({
      body: "Central news body.",
      contentHash: `${marker}-central-news-hash`,
      dedupKey: `${marker}-central-news`,
      kind: "news",
      leagueId: null,
      publishedAt: new Date("2026-06-11T13:00:00.000Z"),
      source: "Central Wire",
      sourceUrl: `https://news.example.com/${marker}/central`,
      summary: "Central news summary.",
      title: "Central news story",
    })
    .returning({ id: contentItems.id });
  centralNewsId = centralNews?.id ?? "";

  await withLeagueContext(handle.db, leagueAId, async (tx) => {
    const [row] = await tx
      .insert(contentItems)
      .values({
        authorPersona: "analyst",
        body: "League A full post body.\n\nSecond paragraph with fixture details.",
        contentHash: `${marker}-league-a-blog-hash`,
        dedupKey: `${marker}-league-a-blog`,
        kind: "blog",
        leagueId: leagueAId,
        publishedAt: new Date("2026-06-11T14:00:00.000Z"),
        summary: "League A post summary.",
        title: "Analyst note for league A",
      })
      .returning({ id: contentItems.id });
    leagueABlogId = row?.id ?? "";
  });

  await withLeagueContext(handle.db, leagueBId, async (tx) => {
    const [row] = await tx
      .insert(contentItems)
      .values({
        authorPersona: "narrator",
        body: "League B full post body.",
        contentHash: `${marker}-league-b-blog-hash`,
        dedupKey: `${marker}-league-b-blog`,
        kind: "blog",
        leagueId: leagueBId,
        publishedAt: new Date("2026-06-11T15:00:00.000Z"),
        summary: "League B post summary.",
        title: "Narrator note for league B",
      })
      .returning({ id: contentItems.id });
    leagueBBlogId = row?.id ?? "";
  });
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(contentItems)
    .where(sql`${contentItems.dedupKey} like ${`${marker}-%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("league blog post details", () => {
  it("returns one league-scoped blog post for a league member", async () => {
    const result = await getLeagueBlogPostData(handle.db, {
      leagueId: leagueAId,
      postId: leagueABlogId,
      userId,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected blog result: ${result.status}`);
    }

    expect(result.data.league).toMatchObject({
      name: "Blog League A",
      providerLeagueId: `${marker}-league-a`,
      season: 2026,
    });
    expect(result.data.userRole).toBe("commissioner");
    expect(result.data.post).toMatchObject({
      authorPersona: "analyst",
      body: "League A full post body.\n\nSecond paragraph with fixture details.",
      id: leagueABlogId,
      summary: "League A post summary.",
      title: "Analyst note for league A",
    });
  });

  it("does not expose another league's blog post through this league", async () => {
    await expect(
      getLeagueBlogPostData(handle.db, {
        leagueId: leagueAId,
        postId: leagueBBlogId,
        userId,
      }),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("does not expose central or non-blog content as a league post", async () => {
    await expect(
      getLeagueBlogPostData(handle.db, {
        leagueId: leagueAId,
        postId: centralNewsId,
        userId,
      }),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("rejects a user who is not a league member", async () => {
    await expect(
      getLeagueBlogPostData(handle.db, {
        leagueId: leagueAId,
        postId: leagueABlogId,
        userId: outsiderUserId,
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });
});
