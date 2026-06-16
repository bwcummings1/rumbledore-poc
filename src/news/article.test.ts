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
  leagues,
  loreClaims,
  members,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  getCentralNewsArticleData,
  getLeaguePressArticleData,
} from "./article";
import { upsertLeagueFeedReference } from "./league-feed";

const marker = `articletest-${randomUUID()}`;
let handle: DbHandle;
let leagueAId: string;
let leagueBId: string;
let userId: string;
let outsiderUserId: string;
let centralArticleId: string;
let centralRelatedId: string;
let leagueArticleId: string;
let leagueBArticleId: string;
let canonCitationId: string;
let pendingCitationId: string;

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
      displayName: "Article Test Member",
      email: `${marker}-member@example.com`,
    })
    .returning({ id: users.id });
  const [outsider] = await handle.db
    .insert(users)
    .values({
      displayName: "Article Test Outsider",
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
        name: "Article League A",
        provider: "espn",
        providerLeagueId: `${marker}-league-a`,
        season: 2026,
        sport: "ffl",
      },
      {
        name: "Article League B",
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

  await withLeagueContext(handle.db, leagueAId, async (tx) => {
    const citationRows = await tx
      .insert(loreClaims)
      .values([
        {
          authorPersona: "commissioner",
          body: "The league voted the Snow Bowl collapse into canon.",
          kind: "opinion",
          leagueId: leagueAId,
          origin: "ai",
          ratifiedAt: new Date("2026-06-10T12:00:00.000Z"),
          ratifiedBy: "vote",
          statement: "The league voted the Snow Bowl collapse into canon.",
          status: "canon",
          title: "Snow Bowl Collapse",
        },
        {
          authorPersona: "trash_talker",
          body: "This pending claim must not render as settled canon.",
          kind: "opinion",
          leagueId: leagueAId,
          origin: "ai",
          statement: "This pending claim must not render as settled canon.",
          status: "vote",
          title: "Pending Choker Debate",
        },
      ])
      .returning({ status: loreClaims.status, id: loreClaims.id });

    canonCitationId =
      citationRows.find((row) => row.status === "canon")?.id ?? "";
    pendingCitationId =
      citationRows.find((row) => row.status === "vote")?.id ?? "";
  });

  if (!canonCitationId || !pendingCitationId) {
    throw new Error("lore citation claims were not inserted");
  }

  const centralRows = await handle.db
    .insert(contentItems)
    .values([
      {
        body: "## Injury note\n\nCentral article body.",
        contentHash: `${marker}-central-article-hash`,
        dedupKey: `${marker}-central-article`,
        kind: "news",
        leagueId: null,
        metadata: {
          dek: "A central injury dek.",
          section: "injuries",
          tags: ["Fixture QB", "Injuries"],
        },
        publishedAt: new Date("2099-06-11T16:00:00.000Z"),
        source: "Central Wire",
        sourceUrl: `https://news.example.com/${marker}/central-article`,
        summary: "Central article summary.",
        title: "Quarterback injury changes Sunday",
      },
      {
        body: "Related central body.",
        contentHash: `${marker}-central-related-hash`,
        dedupKey: `${marker}-central-related`,
        kind: "news",
        leagueId: null,
        metadata: {
          section: "injuries",
          tags: ["Fixture QB"],
        },
        publishedAt: new Date("2099-06-11T15:00:00.000Z"),
        source: "Injury Desk",
        sourceUrl: `https://news.example.com/${marker}/central-related`,
        summary: "Related central summary.",
        title: "Practice report follows the quarterback",
      },
    ])
    .returning({ dedupKey: contentItems.dedupKey, id: contentItems.id });

  centralArticleId =
    centralRows.find((row) => row.dedupKey === `${marker}-central-article`)
      ?.id ?? "";
  centralRelatedId =
    centralRows.find((row) => row.dedupKey === `${marker}-central-related`)
      ?.id ?? "";
  if (!centralArticleId || !centralRelatedId) {
    throw new Error("central content rows were not inserted");
  }

  await withLeagueContext(handle.db, leagueAId, async (tx) => {
    await tx.insert(aiPersonaCards).values([
      personaCardValue({
        leagueId: leagueAId,
        name: "Rivalry Desk",
        persona: "narrator",
        purpose: "Custom rivalry voice for this league.",
      }),
      personaCardValue({
        leagueId: leagueAId,
        name: "Numbers Desk",
        persona: "analyst",
        purpose: "Custom analysis voice for this league.",
      }),
    ]);

    const rows = await tx
      .insert(contentItems)
      .values([
        {
          authorPersona: "narrator",
          body: "## Rivalry turn\n\nLeague A article body.",
          contentHash: `${marker}-league-article-hash`,
          dedupKey: `${marker}-league-article`,
          kind: "blog",
          leagueId: leagueAId,
          metadata: {
            canonCitations: [
              { claimId: canonCitationId },
              { claimId: pendingCitationId },
            ],
            dek: "A league-specific rivalry dek.",
            section: "recaps",
            tags: ["Fixture Team 01", "Rivalry Week"],
          },
          publishedAt: new Date("2026-06-11T14:00:00.000Z"),
          summary: "League article summary.",
          title: "Narrator files the rivalry column",
        },
        {
          authorPersona: "analyst",
          body: "League A related body.",
          contentHash: `${marker}-league-related-hash`,
          dedupKey: `${marker}-league-related`,
          kind: "blog",
          leagueId: leagueAId,
          metadata: {
            section: "recaps",
            tags: ["Fixture Team 01"],
          },
          publishedAt: new Date("2026-06-11T13:00:00.000Z"),
          summary: "League related summary.",
          title: "Analyst checks the rivalry math",
        },
      ])
      .returning({ dedupKey: contentItems.dedupKey, id: contentItems.id });

    leagueArticleId =
      rows.find((row) => row.dedupKey === `${marker}-league-article`)?.id ?? "";
  });

  await withLeagueContext(handle.db, leagueBId, async (tx) => {
    const [row] = await tx
      .insert(contentItems)
      .values({
        authorPersona: "trash_talker",
        body: "League B body.",
        contentHash: `${marker}-league-b-hash`,
        dedupKey: `${marker}-league-b`,
        kind: "blog",
        leagueId: leagueBId,
        metadata: { section: "recaps", tags: ["Fixture Team 01"] },
        publishedAt: new Date("2026-06-11T17:00:00.000Z"),
        summary: "League B summary.",
        title: "League B should not leak",
      })
      .returning({ id: contentItems.id });
    leagueBArticleId = row?.id ?? "";
  });

  await upsertLeagueFeedReference(handle.db, {
    contentItemId: centralRelatedId,
    framingSummary: "Fixture Team 01 has a Sunday injury angle.",
    framingTitle: "A-specific injury fallout",
    leagueId: leagueAId,
    matchedEntities: [
      {
        label: "Fixture Team 01",
        provider: "espn",
        providerId: "1",
        type: "team",
      },
    ],
    reason: "Fixture Team 01 rosters the injured quarterback.",
    relevanceScore: 8,
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

describe("publication articles", () => {
  it("returns a central news article with source byline and related stories", async () => {
    const result = await getCentralNewsArticleData(handle.db, {
      articleId: centralArticleId,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected central article result: ${result.status}`);
    }

    expect(result.data.article).toMatchObject({
      byline: "Central Wire",
      dek: "A central injury dek.",
      headline: "Quarterback injury changes Sunday",
      section: { label: "Injuries" },
      sourceUrl: `https://news.example.com/${marker}/central-article`,
      tags: ["Fixture QB", "Injuries"],
    });
    expect(result.data.relatedStories.map((story) => story.headline)).toContain(
      "Practice report follows the quarterback",
    );
  });

  it("returns a league-scoped article with persona byline and scoped related stories", async () => {
    const result = await getLeaguePressArticleData(handle.db, {
      leagueId: leagueAId,
      postId: leagueArticleId,
      userId,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected league article result: ${result.status}`);
    }

    expect(result.data.article).toMatchObject({
      byline: "Rivalry Desk",
      bylineDetail: "Custom rivalry voice for this league.",
      dek: "A league-specific rivalry dek.",
      headline: "Narrator files the rivalry column",
      section: { label: "Recaps" },
      tags: ["Fixture Team 01", "Rivalry Week"],
    });
    expect(result.data.article.canonCitations).toEqual([
      {
        claimId: canonCitationId,
        href: `/leagues/${leagueAId}/lore/${canonCitationId}`,
        provenance: "vote",
        ratifiedAt: "2026-06-10T12:00:00.000Z",
        title: "Snow Bowl Collapse",
      },
    ]);
    expect(
      result.data.article.canonCitations.map((citation) => citation.claimId),
    ).not.toContain(pendingCitationId);
    expect(result.data.relatedStories.map((story) => story.headline)).toContain(
      "Analyst checks the rivalry math",
    );
    expect(result.data.relatedStories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          byline: "Numbers Desk",
          headline: "Analyst checks the rivalry math",
        }),
      ]),
    );
    expect(result.data.relatedStories.map((story) => story.headline)).toContain(
      "A-specific injury fallout",
    );
    expect(
      result.data.relatedStories.map((story) => story.headline),
    ).not.toContain("League B should not leak");
  });

  it("does not expose league articles to non-members", async () => {
    await expect(
      getLeaguePressArticleData(handle.db, {
        leagueId: leagueAId,
        postId: leagueArticleId,
        userId: outsiderUserId,
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("does not expose central news as a league article", async () => {
    await expect(
      getLeaguePressArticleData(handle.db, {
        leagueId: leagueAId,
        postId: centralArticleId,
        userId,
      }),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("keeps another league's article out of this league", async () => {
    await expect(
      getLeaguePressArticleData(handle.db, {
        leagueId: leagueAId,
        postId: leagueBArticleId,
        userId,
      }),
    ).resolves.toEqual({ status: "not_found" });
  });
});
