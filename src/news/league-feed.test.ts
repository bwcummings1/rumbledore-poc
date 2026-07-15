// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AiPersona, DEFAULT_PERSONA_CARDS } from "@/ai/personas";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  contentItems,
  leagueFeedReferences,
  leagues,
  members,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  buildPublicationFront,
  LEAGUE_EDITORIAL_IMPORTANCE_BASELINE,
  LEAGUE_EDITORIAL_IMPORTANCE_LEAD,
} from "./front";
import { getLeagueFeedData, upsertLeagueFeedReference } from "./league-feed";

const marker = `feedtest-${randomUUID()}`;
let handle: DbHandle;
let leagueAId: string;
let leagueBId: string;
let userId: string;
let outsiderUserId: string;
let centralRelevantId: string;
let leagueScopedContentId: string;

function personaCardValue(input: {
  leagueId: string;
  name: string;
  persona: AiPersona;
  purpose: string;
}) {
  const defaults = DEFAULT_PERSONA_CARDS[input.persona];
  return {
    beat: defaults.beat,
    enabled: defaults.enabled,
    leagueId: input.leagueId,
    maxWords: defaults.maxWords,
    minWords: defaults.minWords,
    name: input.name,
    performsWhen: defaults.performsWhen,
    persona: input.persona,
    pointOfView: defaults.pointOfView,
    promptTemplate: defaults.promptTemplate,
    purpose: input.purpose,
    tone: defaults.tone,
    toneProfile: defaults.toneProfile,
    toneVersion: defaults.toneVersion + 1,
    triggerConfig: defaults.triggerConfig,
  };
}

async function seedPressRankingLeague(
  tag: string,
  stories: readonly {
    editorialImportance: number;
    publishedAt: Date;
    title: string;
  }[],
): Promise<string> {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: `Press Ranking ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-ranking-${tag}`,
      season: 2026,
      sport: "ffl",
    })
    .returning({ id: leagues.id });
  if (!league) {
    throw new Error("ranking test league was not inserted");
  }

  await handle.db.insert(members).values({
    organizationId: league.id,
    role: "member",
    userId,
  });
  await withLeagueContext(handle.db, league.id, (tx) =>
    tx.insert(contentItems).values(
      stories.map((story, index) => ({
        authorPersona: "narrator" as const,
        body: `${story.title} body.`,
        contentHash: `${marker}-ranking-${tag}-${index}-hash`,
        dedupKey: `${marker}-ranking-${tag}-${index}`,
        kind: "blog" as const,
        leagueId: league.id,
        metadata: {
          editorialImportance: story.editorialImportance,
          section: "recaps",
        },
        publishedAt: story.publishedAt,
        summary: `${story.title} summary.`,
        title: story.title,
      })),
    ),
  );

  return league.id;
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
    await tx.insert(aiPersonaCards).values(
      personaCardValue({
        leagueId: leagueAId,
        name: "League Office",
        persona: "commissioner",
        purpose: "Custom league office voice.",
      }),
    );

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
  it("holds a lead-worthy league story over a newer routine column", async () => {
    const leagueId = await seedPressRankingLeague("lead", [
      {
        editorialImportance: LEAGUE_EDITORIAL_IMPORTANCE_LEAD,
        publishedAt: new Date("2026-09-01T12:00:00.000Z"),
        title: "The upset that changed the week",
      },
      {
        editorialImportance: LEAGUE_EDITORIAL_IMPORTANCE_BASELINE,
        publishedAt: new Date("2026-09-05T12:00:00.000Z"),
        title: "The newer routine column",
      },
    ]);

    const result = await getLeagueFeedData(handle.db, {
      leagueId,
      limit: 20,
      userId,
    });
    if (result.status !== "ready") {
      throw new Error(`unexpected feed result: ${result.status}`);
    }

    expect(buildPublicationFront(result.data.items).lead?.title).toBe(
      "The upset that changed the week",
    );
  });

  it("uses freshness to lead a routine league week", async () => {
    const leagueId = await seedPressRankingLeague("routine", [
      {
        editorialImportance: LEAGUE_EDITORIAL_IMPORTANCE_BASELINE,
        publishedAt: new Date("2026-09-01T12:00:00.000Z"),
        title: "Monday's routine column",
      },
      {
        editorialImportance: LEAGUE_EDITORIAL_IMPORTANCE_BASELINE,
        publishedAt: new Date("2026-09-03T12:00:00.000Z"),
        title: "Wednesday's reasonable lead",
      },
    ]);

    const result = await getLeagueFeedData(handle.db, {
      leagueId,
      limit: 20,
      userId,
    });
    if (result.status !== "ready") {
      throw new Error(`unexpected feed result: ${result.status}`);
    }

    expect(buildPublicationFront(result.data.items).lead?.title).toBe(
      "Wednesday's reasonable lead",
    );
  });

  it("returns this league's posts plus only referenced central news", async () => {
    const [hiddenCentral] = await handle.db
      .insert(contentItems)
      .values({
        body: "Hidden central body.",
        contentHash: `${marker}-central-hidden-hash`,
        dedupKey: `${marker}-central-hidden`,
        kind: "news",
        leagueId: null,
        publishedAt: new Date("2026-06-11T16:00:00.000Z"),
        source: "Hidden Central Wire",
        sourceUrl: `https://news.example.com/${marker}/hidden`,
        status: "retracted",
        summary: "A hidden central story with a stale league reference.",
        title: "Hidden central story",
      })
      .returning({ id: contentItems.id });
    if (!hiddenCentral) {
      throw new Error("hidden central row was not inserted");
    }

    await withLeagueContext(handle.db, leagueAId, async (tx) => {
      await tx.insert(contentItems).values({
        authorPersona: "narrator",
        body: "Hidden league body.",
        contentHash: `${marker}-league-hidden-hash`,
        dedupKey: `${marker}-league-hidden`,
        kind: "blog",
        leagueId: leagueAId,
        publishedAt: new Date("2026-06-11T16:30:00.000Z"),
        status: "superseded",
        summary: "A hidden league story.",
        title: "Hidden league post",
      });
      await tx.insert(leagueFeedReferences).values({
        contentItemId: hiddenCentral.id,
        leagueId: leagueAId,
        matchedEntities: [
          {
            label: "Fixture Team 01",
            provider: "espn",
            providerId: "1",
            type: "team",
          },
        ],
        reason: "Stale hidden central reference.",
        relevanceScore: 99,
      });
    });

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
    expect(result.data.items[0]).toMatchObject({
      kind: "blog",
      scope: "league",
      sourceLabel: "League Office",
    });
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
    expect(result.data.items.map((item) => item.title)).not.toContain(
      "Hidden central story",
    );
    expect(result.data.items.map((item) => item.title)).not.toContain(
      "Hidden league post",
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

  it("keeps sparse section stories beyond the first candidate page", async () => {
    await withLeagueContext(handle.db, leagueAId, async (tx) => {
      await tx.insert(contentItems).values([
        {
          authorPersona: "trash_talker",
          body: "Deep league trash body.",
          contentHash: `${marker}-deep-section-trash-hash`,
          dedupKey: `${marker}-deep-section-trash`,
          kind: "blog",
          leagueId: leagueAId,
          metadata: { section: "trash-talk" },
          publishedAt: new Date("2026-06-10T12:00:00.000Z"),
          summary: "An older Trash Talk post should stay in the section.",
          title: "Deep section trash talk",
        },
        ...Array.from({ length: 110 }, (_, index) => ({
          authorPersona: "narrator" as const,
          body: `Deep league non-matching body ${index}.`,
          contentHash: `${marker}-deep-section-recap-${index}-hash`,
          dedupKey: `${marker}-deep-section-recap-${index}`,
          kind: "blog" as const,
          leagueId: leagueAId,
          metadata: { section: "recaps" },
          publishedAt: new Date(Date.UTC(2026, 5, 12, 12, index)),
          summary: `Newer non-matching recap item ${index}.`,
          title: `Deep section recap noise ${index}`,
        })),
      ]);
    });

    const result = await getLeagueFeedData(handle.db, {
      leagueId: leagueAId,
      limit: 10,
      sectionId: "trash-talk",
      userId,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected feed result: ${result.status}`);
    }

    const markedItems = result.data.items.filter((item) =>
      item.title.includes("Deep section"),
    );
    expect(markedItems.map((item) => item.title)).toEqual([
      "Deep section trash talk",
    ]);
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
