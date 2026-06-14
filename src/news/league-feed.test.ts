// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { contentItems, leagues, members, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { getLeagueFeedData, upsertLeagueFeedReference } from "./league-feed";

const marker = `feedtest-${randomUUID()}`;
let handle: DbHandle;
let leagueAId: string;
let leagueBId: string;
let userId: string;
let outsiderUserId: string;
let centralRelevantId: string;
let leagueScopedContentId: string;

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
      displayName: "Feed Test Member",
      email: `${marker}-member@example.com`,
    })
    .returning({ id: users.id });
  const [outsider] = await handle.db
    .insert(users)
    .values({
      displayName: "Feed Test Outsider",
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
        name: "Feed League A",
        provider: "espn",
        providerLeagueId: `${marker}-league-a`,
        season: 2026,
        sport: "ffl",
      },
      {
        name: "Feed League B",
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

  const centralRows = await handle.db
    .insert(contentItems)
    .values([
      {
        body: "Central relevant body.",
        contentHash: `${marker}-central-relevant-hash`,
        dedupKey: `${marker}-central-relevant`,
        kind: "news",
        leagueId: null,
        publishedAt: new Date("2026-06-11T12:00:00.000Z"),
        source: "Central Wire",
        sourceUrl: `https://news.example.com/${marker}/relevant`,
        summary: "A central story that matters to league A.",
        title: "Central quarterback injury",
      },
      {
        body: "Central irrelevant body.",
        contentHash: `${marker}-central-irrelevant-hash`,
        dedupKey: `${marker}-central-irrelevant`,
        kind: "news",
        leagueId: null,
        publishedAt: new Date("2026-06-11T13:00:00.000Z"),
        source: "Central Wire",
        sourceUrl: `https://news.example.com/${marker}/irrelevant`,
        summary: "A central story with no league A match.",
        title: "Central unreferenced story",
      },
      {
        body: "Central league B body.",
        contentHash: `${marker}-central-b-hash`,
        dedupKey: `${marker}-central-b`,
        kind: "news",
        leagueId: null,
        publishedAt: new Date("2026-06-11T14:00:00.000Z"),
        source: "Central Wire",
        sourceUrl: `https://news.example.com/${marker}/league-b`,
        summary: "A central story that only matters to league B.",
        title: "Central league B story",
      },
    ])
    .returning({
      dedupKey: contentItems.dedupKey,
      id: contentItems.id,
    });
  centralRelevantId =
    centralRows.find((row) => row.dedupKey === `${marker}-central-relevant`)
      ?.id ?? "";
  const centralLeagueBId =
    centralRows.find((row) => row.dedupKey === `${marker}-central-b`)?.id ?? "";
  if (!centralRelevantId || !centralLeagueBId) {
    throw new Error("central content rows were not inserted");
  }

  await withLeagueContext(handle.db, leagueAId, async (tx) => {
    const [row] = await tx
      .insert(contentItems)
      .values({
        authorPersona: "commissioner",
        body: "League A blog body.",
        contentHash: `${marker}-league-a-blog-hash`,
        dedupKey: `${marker}-league-a-blog`,
        kind: "blog",
        leagueId: leagueAId,
        publishedAt: new Date("2026-06-11T11:00:00.000Z"),
        summary: "League A blog summary.",
        title: "Commissioner note for league A",
      })
      .returning({ id: contentItems.id });
    leagueScopedContentId = row?.id ?? "";
  });

  await withLeagueContext(handle.db, leagueBId, async (tx) => {
    await tx.insert(contentItems).values({
      authorPersona: "narrator",
      body: "League B blog body.",
      contentHash: `${marker}-league-b-blog-hash`,
      dedupKey: `${marker}-league-b-blog`,
      kind: "blog",
      leagueId: leagueBId,
      publishedAt: new Date("2026-06-11T15:00:00.000Z"),
      summary: "League B blog summary.",
      title: "Narrator note for league B",
    });
  });

  await upsertLeagueFeedReference(handle.db, {
    contentItemId: centralRelevantId,
    framingSummary: "Fixture Team 01 has a lineup decision now.",
    framingTitle: "A-specific quarterback fallout",
    leagueId: leagueAId,
    matchedEntities: [
      {
        label: "Fixture Team 01",
        provider: "espn",
        providerId: "1",
        type: "team",
      },
    ],
    reason: "Fixture Team 01 rosters the affected starter.",
    relevanceScore: 5,
  });
  await upsertLeagueFeedReference(handle.db, {
    contentItemId: centralLeagueBId,
    leagueId: leagueBId,
    reason: "League B-only relevance.",
    relevanceScore: 9,
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

describe("league-tailored feed", () => {
  it("returns this league's posts plus only referenced central news", async () => {
    const result = await getLeagueFeedData(handle.db, {
      leagueId: leagueAId,
      limit: 20,
      userId,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected feed result: ${result.status}`);
    }

    expect(result.data.league).toMatchObject({
      name: "Feed League A",
      providerLeagueId: `${marker}-league-a`,
      season: 2026,
    });
    expect(result.data.userRole).toBe("commissioner");
    expect(result.data.items.map((item) => item.title)).toEqual([
      "Commissioner note for league A",
      "A-specific quarterback fallout",
    ]);
    expect(result.data.items[1]).toMatchObject({
      contentItemId: centralRelevantId,
      kind: "news",
      matchedEntities: [
        {
          label: "Fixture Team 01",
          provider: "espn",
          providerId: "1",
          type: "team",
        },
      ],
      relevanceReason: "Fixture Team 01 rosters the affected starter.",
      scope: "central",
      sourceLabel: "Central Wire",
      sourceUrl: `https://news.example.com/${marker}/relevant`,
      summary: "Fixture Team 01 has a lineup decision now.",
    });
    expect(result.data.items.map((item) => item.title)).not.toContain(
      "Central unreferenced story",
    );
    expect(result.data.items.map((item) => item.title)).not.toContain(
      "Central league B story",
    );
    expect(result.data.items.map((item) => item.title)).not.toContain(
      "Narrator note for league B",
    );
    expect(result.data.items[0]?.section.label).toBe("Previews");
    expect(result.data.sections.map((section) => section.label)).toEqual([
      "Recaps",
      "Power Rankings",
      "Trash Talk",
      "Records",
      "Previews",
    ]);
  });

  it("filters league section fronts by the declared taxonomy", async () => {
    await withLeagueContext(handle.db, leagueAId, async (tx) => {
      await tx.insert(contentItems).values([
        {
          authorPersona: "trash_talker",
          body: "League A trash body.",
          contentHash: `${marker}-section-trash-hash`,
          dedupKey: `${marker}-section-trash`,
          kind: "blog",
          leagueId: leagueAId,
          metadata: { section: "trash-talk" },
          publishedAt: new Date("2026-06-11T17:00:00.000Z"),
          summary: "A league A roast belongs in Trash Talk.",
          title: "Trash-Talker opens the section front",
        },
        {
          authorPersona: "narrator",
          body: "League A recap body.",
          contentHash: `${marker}-section-recap-hash`,
          dedupKey: `${marker}-section-recap`,
          kind: "blog",
          leagueId: leagueAId,
          metadata: { section: "recaps" },
          publishedAt: new Date("2026-06-11T18:00:00.000Z"),
          summary: "A recap should stay out of Trash Talk.",
          title: "Narrator recap belongs elsewhere",
        },
      ]);
    });

    const result = await getLeagueFeedData(handle.db, {
      leagueId: leagueAId,
      limit: 100,
      sectionId: "trash-talk",
      userId,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected feed result: ${result.status}`);
    }

    const markedItems = result.data.items.filter((item) =>
      item.title.includes("section"),
    );
    expect(result.data.activeSection?.label).toBe("Trash Talk");
    expect(markedItems.map((item) => item.title)).toEqual([
      "Trash-Talker opens the section front",
    ]);
    expect(markedItems[0]?.section.label).toBe("Trash Talk");
  });

  it("rejects a feed reference that does not point to central news", async () => {
    await expect(
      upsertLeagueFeedReference(handle.db, {
        contentItemId: leagueScopedContentId,
        leagueId: leagueAId,
      }),
    ).rejects.toMatchObject({
      code: "LEAGUE_FEED_REFERENCE_NOT_CENTRAL_NEWS",
      status: 404,
    });
  });

  it("rejects a user who is not a league member", async () => {
    await expect(
      getLeagueFeedData(handle.db, {
        leagueId: leagueAId,
        userId: outsiderUserId,
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });
});
