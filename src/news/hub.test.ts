// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { contentItems, leagues, members, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { getCentralNewsHubData } from "./hub";
import { upsertLeagueFeedReference } from "./league-feed";

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
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
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

  it("lets an older editorially important story lead over fresher minor news", async () => {
    await handle.db.insert(contentItems).values([
      {
        body: "Fresh minor central body.",
        contentHash: `${marker}-rank-fresh-hash`,
        dedupKey: `${marker}-rank-fresh`,
        kind: "news",
        leagueId: null,
        publishedAt: new Date("2026-06-11T16:00:00.000Z"),
        source: "Fresh Wire",
        sourceUrl: `https://news.example.com/${marker}/rank-fresh`,
        summary: "A fresher but minor central summary.",
        title: "Fresh minor central story",
      },
      {
        body: "Older lead central body.",
        contentHash: `${marker}-rank-older-lead-hash`,
        dedupKey: `${marker}-rank-older-lead`,
        kind: "news",
        leagueId: null,
        metadata: { editorialImportance: 3 },
        publishedAt: new Date("2026-06-11T10:00:00.000Z"),
        source: "Lead Wire",
        sourceUrl: `https://news.example.com/${marker}/rank-older-lead`,
        summary: "An older but more important central summary.",
        title: "Older important central story",
      },
    ]);

    const data = await getCentralNewsHubData(handle.db, { limit: 100 });
    const markedItems = data.items.filter((item) =>
      item.sourceUrl.includes(`${marker}/rank-`),
    );

    expect(markedItems.map((item) => item.title)).toEqual([
      "Older important central story",
      "Fresh minor central story",
    ]);
  });

  it("ranks the central front across older stories beyond the first recency page", async () => {
    await handle.db.insert(contentItems).values([
      {
        body: "Older corpus lead body.",
        contentHash: `${marker}-corpus-rank-lead-hash`,
        dedupKey: `${marker}-corpus-rank-lead`,
        kind: "news",
        leagueId: null,
        metadata: { editorialImportance: 100 },
        publishedAt: new Date("2026-06-01T12:00:00.000Z"),
        source: "Corpus Wire",
        sourceUrl: `https://news.example.com/${marker}/corpus-rank-lead`,
        summary: "An older story with enough importance to lead the front.",
        title: "Older important story survives the recency page",
      },
      ...Array.from({ length: 110 }, (_, index) => ({
        body: `Recent minor central body ${index}.`,
        contentHash: `${marker}-corpus-rank-minor-${index}-hash`,
        dedupKey: `${marker}-corpus-rank-minor-${index}`,
        kind: "news" as const,
        leagueId: null,
        publishedAt: new Date(Date.UTC(2026, 5, 12, 12, index)),
        source: "Recent Wire",
        sourceUrl: `https://news.example.com/${marker}/corpus-rank-minor-${index}`,
        summary: `Recent minor central summary ${index}.`,
        title: `Recent minor central story ${index}`,
      })),
    ]);

    const data = await getCentralNewsHubData(handle.db, { limit: 100 });
    const markedItems = data.items.filter((item) =>
      item.sourceUrl.includes(`${marker}/corpus-rank-`),
    );

    expect(markedItems[0]?.title).toBe(
      "Older important story survives the recency page",
    );
  });

  it("filters central section fronts by the declared taxonomy", async () => {
    await handle.db.insert(contentItems).values([
      {
        body: "Section injury body.",
        contentHash: `${marker}-section-injuries-hash`,
        dedupKey: `${marker}-section-injuries`,
        kind: "news",
        leagueId: null,
        metadata: { section: "injuries" },
        publishedAt: new Date("2026-06-11T18:00:00.000Z"),
        source: "Injury Desk",
        sourceUrl: `https://news.example.com/${marker}/section-injuries`,
        summary: "A section-specific injury summary.",
        title: "Starter injury anchors the section front",
      },
      {
        body: "Section ranking body.",
        contentHash: `${marker}-section-rankings-hash`,
        dedupKey: `${marker}-section-rankings`,
        kind: "news",
        leagueId: null,
        metadata: { section: "rankings" },
        publishedAt: new Date("2026-06-11T19:00:00.000Z"),
        source: "Rankings Desk",
        sourceUrl: `https://news.example.com/${marker}/section-rankings`,
        summary: "A section-specific rankings summary.",
        title: "Rankings story stays out of injuries",
      },
    ]);

    const data = await getCentralNewsHubData(handle.db, {
      limit: 100,
      sectionId: "injuries",
    });
    const markedItems = data.items.filter((item) =>
      item.sourceUrl.includes(`${marker}/section-`),
    );

    expect(data.activeSection?.label).toBe("Injuries");
    expect(data.sections.map((section) => section.label)).toEqual([
      "NFL",
      "Fantasy",
      "Injuries",
      "Rankings",
    ]);
    expect(markedItems.map((item) => item.title)).toEqual([
      "Starter injury anchors the section front",
    ]);
    expect(markedItems[0]?.section.label).toBe("Injuries");
  });

  it("keeps sparse section stories beyond the first candidate page", async () => {
    await handle.db.insert(contentItems).values([
      {
        body: "Deep archive injury body.",
        contentHash: `${marker}-deep-section-injury-hash`,
        dedupKey: `${marker}-deep-section-injury`,
        kind: "news",
        leagueId: null,
        metadata: { section: "injuries" },
        publishedAt: new Date("2026-06-10T12:00:00.000Z"),
        source: "Deep Injury Desk",
        sourceUrl: `https://news.example.com/${marker}/deep-section-injury`,
        summary: "An older injury item should not vanish from its section.",
        title: "Deep archive injury report",
      },
      ...Array.from({ length: 110 }, (_, index) => ({
        body: `Deep archive non-matching body ${index}.`,
        contentHash: `${marker}-deep-section-rankings-${index}-hash`,
        dedupKey: `${marker}-deep-section-rankings-${index}`,
        kind: "news" as const,
        leagueId: null,
        metadata: { section: "rankings" },
        publishedAt: new Date(Date.UTC(2026, 5, 12, 12, index)),
        source: "Deep Rankings Desk",
        sourceUrl: `https://news.example.com/${marker}/deep-section-rankings-${index}`,
        summary: `Newer non-matching rankings item ${index}.`,
        title: `Deep rankings noise ${index}`,
      })),
    ]);

    const data = await getCentralNewsHubData(handle.db, {
      limit: 10,
      sectionId: "injuries",
    });
    const markedItems = data.items.filter((item) =>
      item.sourceUrl.includes(`${marker}/deep-section-`),
    );

    expect(markedItems.map((item) => item.title)).toEqual([
      "Deep archive injury report",
    ]);
  });

  it("returns a for your league rail from matched central references only", async () => {
    const [memberUser] = await handle.db
      .insert(users)
      .values({
        displayName: "News Hub Member",
        email: `${marker}-rail-member@example.com`,
      })
      .returning({ id: users.id });
    const [outsiderUser] = await handle.db
      .insert(users)
      .values({
        displayName: "News Hub Outsider",
        email: `${marker}-rail-outsider@example.com`,
      })
      .returning({ id: users.id });
    if (!memberUser || !outsiderUser) {
      throw new Error("rail test users were not inserted");
    }

    const insertedLeagues = await handle.db
      .insert(leagues)
      .values([
        {
          name: "Rail League A",
          provider: "espn",
          providerLeagueId: `${marker}-rail-a`,
          season: 2026,
          sport: "ffl",
        },
        {
          name: "Rail League B",
          provider: "espn",
          providerLeagueId: `${marker}-rail-b`,
          season: 2026,
          sport: "ffl",
        },
      ])
      .returning({ id: leagues.id });
    const [leagueA, leagueB] = insertedLeagues;
    if (!leagueA || !leagueB) {
      throw new Error("rail test leagues were not inserted");
    }

    await handle.db.insert(members).values({
      organizationId: leagueA.id,
      role: "member",
      userId: memberUser.id,
    });

    const centralRows = await handle.db
      .insert(contentItems)
      .values([
        {
          body: "Rail A central body.",
          contentHash: `${marker}-rail-a-central-hash`,
          dedupKey: `${marker}-rail-a-central`,
          kind: "news",
          leagueId: null,
          metadata: { section: "injuries" },
          publishedAt: new Date("2026-06-13T21:00:00.000Z"),
          source: "Central Rail Wire",
          sourceUrl: `https://news.example.com/${marker}/rail-a`,
          summary: "Central story with league A relevance.",
          title: "Original central A headline",
        },
        {
          body: "Rail unrelated central body.",
          contentHash: `${marker}-rail-unrelated-hash`,
          dedupKey: `${marker}-rail-unrelated`,
          kind: "news",
          leagueId: null,
          publishedAt: new Date("2026-06-13T20:00:00.000Z"),
          source: "Central Rail Wire",
          sourceUrl: `https://news.example.com/${marker}/rail-unrelated`,
          summary: "Central story with no league intersection.",
          title: "Unreferenced central headline",
        },
        {
          body: "Rail B central body.",
          contentHash: `${marker}-rail-b-central-hash`,
          dedupKey: `${marker}-rail-b-central`,
          kind: "news",
          leagueId: null,
          publishedAt: new Date("2026-06-13T22:00:00.000Z"),
          source: "Central Rail Wire",
          sourceUrl: `https://news.example.com/${marker}/rail-b`,
          summary: "Central story with league B relevance.",
          title: "Original central B headline",
        },
      ])
      .returning({
        dedupKey: contentItems.dedupKey,
        id: contentItems.id,
      });
    const centralAId =
      centralRows.find((row) => row.dedupKey === `${marker}-rail-a-central`)
        ?.id ?? "";
    const centralBId =
      centralRows.find((row) => row.dedupKey === `${marker}-rail-b-central`)
        ?.id ?? "";
    if (!centralAId || !centralBId) {
      throw new Error("rail test central rows were not inserted");
    }

    await withLeagueContext(handle.db, leagueA.id, async (tx) => {
      await tx.insert(contentItems).values({
        body: "League-scoped rail body.",
        contentHash: `${marker}-rail-league-scoped-hash`,
        dedupKey: `${marker}-rail-league-scoped`,
        kind: "news",
        leagueId: leagueA.id,
        publishedAt: new Date("2026-06-11T23:00:00.000Z"),
        source: "Scoped Wire",
        sourceUrl: `https://news.example.com/${marker}/rail-scoped`,
        summary: "League-scoped news must stay out of central News.",
        title: "League-scoped rail headline",
      });
    });

    await upsertLeagueFeedReference(handle.db, {
      contentItemId: centralAId,
      framingSummary: "Fixture Team 01 has a lineup decision now.",
      framingTitle: "A-specific quarterback fallout",
      leagueId: leagueA.id,
      matchedEntities: [
        {
          label: "Fixture Team 01",
          provider: "espn",
          providerId: "1",
          type: "team",
        },
      ],
      reason: "Fixture Team 01 rosters the affected starter.",
      relevanceScore: 8,
    });
    await upsertLeagueFeedReference(handle.db, {
      contentItemId: centralBId,
      framingTitle: "B-specific quarterback fallout",
      leagueId: leagueB.id,
      matchedEntities: [
        {
          label: "Fixture Team 99",
          provider: "espn",
          providerId: "99",
          type: "team",
        },
      ],
      reason: "League B-only relevance.",
      relevanceScore: 10,
    });

    const data = await getCentralNewsHubData(handle.db, {
      forLeagueId: leagueA.id,
      limit: 100,
      userId: memberUser.id,
    });
    const markedCentralItems = data.items.filter((item) =>
      item.sourceUrl.includes(`${marker}/rail-`),
    );

    expect(markedCentralItems.map((item) => item.title)).toEqual([
      "Original central B headline",
      "Original central A headline",
      "Unreferenced central headline",
    ]);
    expect(markedCentralItems.map((item) => item.title)).not.toContain(
      "League-scoped rail headline",
    );
    expect(data.forYourLeague?.league).toEqual({
      id: leagueA.id,
      name: "Rail League A",
    });
    expect(data.forYourLeague?.items.map((item) => item.title)).toEqual([
      "A-specific quarterback fallout",
    ]);
    expect(data.forYourLeague?.items[0]).toMatchObject({
      contentItemId: centralAId,
      matchedEntities: [
        {
          label: "Fixture Team 01",
          provider: "espn",
          providerId: "1",
          type: "team",
        },
      ],
      relevanceReason: "Fixture Team 01 rosters the affected starter.",
      source: "Central Rail Wire",
      sourceUrl: `https://news.example.com/${marker}/rail-a`,
      summary: "Fixture Team 01 has a lineup decision now.",
    });

    const noContextData = await getCentralNewsHubData(handle.db, {
      forLeagueId: leagueA.id,
      limit: 100,
    });
    expect(noContextData.forYourLeague).toBeNull();

    const outsiderData = await getCentralNewsHubData(handle.db, {
      forLeagueId: leagueA.id,
      limit: 100,
      userId: outsiderUser.id,
    });
    expect(outsiderData.forYourLeague).toBeNull();
  });
});
