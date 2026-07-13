// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  fantasyRosterEntries,
  fantasyTeams,
  leagueFeedReferences,
  leagues,
  members,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { ingestMockGeneralStats } from "@/general-stats";
import {
  type CentralNewsSource,
  type CentralNewsSourceItem,
  getCentralNewsHubData,
  getLeagueFeedData,
  RosteredPlayerRefExtractor,
  refreshCentralNews,
  TavilyCentralNewsSource,
} from "@/news";

const marker = `tailortest-${randomUUID()}`;
const playerAId = `${marker}-player-a`;
const playerBId = `${marker}-player-b`;
let handle: DbHandle;
let leagueAId: string;
let leagueBId: string;
let userId: string;

function fakeKey() {
  return ["fixture", "key"].join("-");
}

class StaticCentralNewsSource implements CentralNewsSource {
  constructor(private readonly items: CentralNewsSourceItem[]) {}

  async fetch(): Promise<CentralNewsSourceItem[]> {
    return this.items;
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
  await ingestMockGeneralStats(handle.db, {
    fetchedAt: new Date("2026-06-11T16:45:00.000Z"),
  });

  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: "Tailor Test Member",
      email: `${marker}-member@example.com`,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test user was not inserted");
  }
  userId = user.id;

  const [leagueA, leagueB] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Tailor League A",
        provider: "espn",
        providerLeagueId: `${marker}-league-a`,
        season: 2026,
        sport: "ffl",
      },
      {
        name: "Tailor League B",
        provider: "espn",
        providerLeagueId: `${marker}-league-b`,
        season: 2026,
        sport: "ffl",
      },
    ])
    .returning({
      id: leagues.id,
      providerLeagueId: leagues.providerLeagueId,
    });
  if (!leagueA || !leagueB) {
    throw new Error("test leagues were not inserted");
  }
  leagueAId = leagueA.id;
  leagueBId = leagueB.id;

  await handle.db.insert(members).values([
    {
      organizationId: leagueAId,
      role: "commissioner",
      userId,
    },
    {
      organizationId: leagueBId,
      role: "commissioner",
      userId,
    },
  ]);

  await withLeagueContext(handle.db, leagueAId, async (tx) => {
    await tx.insert(fantasyTeams).values({
      abbrev: "TLA",
      contentHash: `${marker}-team-a-hash`,
      leagueId: leagueAId,
      leagueProviderId: leagueA.providerLeagueId,
      name: "Tailor Team A",
      provider: "espn",
      providerTeamId: "1",
      season: 2026,
    });
    await tx.insert(fantasyRosterEntries).values({
      contentHash: `${marker}-roster-a-hash`,
      leagueId: leagueAId,
      leagueProviderId: leagueA.providerLeagueId,
      metadata: { playerName: "Star Runner" },
      provider: "espn",
      providerPlayerId: playerAId,
      providerTeamId: "1",
      scoringPeriod: 2,
      season: 2026,
      slot: "RB",
      status: "active",
    });
    await tx.insert(fantasyRosterEntries).values({
      contentHash: `${marker}-roster-a-mahomes-hash`,
      leagueId: leagueAId,
      leagueProviderId: leagueA.providerLeagueId,
      metadata: { playerName: "Patrick Mahomes", proTeam: "KC" },
      provider: "espn",
      providerPlayerId: "3139477",
      providerTeamId: "1",
      scoringPeriod: 2,
      season: 2026,
      slot: "QB",
      started: true,
      status: "active",
    });
  });

  await withLeagueContext(handle.db, leagueBId, async (tx) => {
    await tx.insert(fantasyTeams).values({
      abbrev: "TLB",
      contentHash: `${marker}-team-b-hash`,
      leagueId: leagueBId,
      leagueProviderId: leagueB.providerLeagueId,
      name: "Tailor Team B",
      provider: "espn",
      providerTeamId: "2",
      season: 2026,
    });
    await tx.insert(fantasyRosterEntries).values({
      contentHash: `${marker}-roster-b-hash`,
      leagueId: leagueBId,
      leagueProviderId: leagueB.providerLeagueId,
      metadata: { playerName: "Deep Threat" },
      provider: "espn",
      providerPlayerId: playerBId,
      providerTeamId: "2",
      scoringPeriod: 2,
      season: 2026,
      slot: "WR",
      status: "active",
    });
  });
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(contentItems)
    .where(
      sql`${contentItems.sourceUrl} like ${`https://news.example.com/${marker}/%`}`,
    );
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("central news tailoring hand-off", () => {
  it("creates league feed references from ingested central player ids", async () => {
    const sourceUrl = `https://news.example.com/${marker}/star-runner`;
    const source = new StaticCentralNewsSource([
      {
        body: "A national injury report says Star Runner may miss Sunday's game.",
        id: `${marker}-star-runner`,
        playerRefs: [
          {
            label: "Star Runner",
            provider: "espn",
            providerId: playerAId,
          },
        ],
        publishedAt: new Date("2026-06-11T17:00:00.000Z"),
        source: "NFL Wire",
        sourceType: "web",
        sourceUrl,
        summary: "Star Runner's injury changes the fantasy outlook.",
        title: "Star Runner injury changes Sunday fantasy outlook",
        topics: ["fantasy", "injury"],
      },
    ]);

    const first = await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T17:05:00.000Z"),
        source,
      },
      input: { limit: 5, topic: "fantasy injuries" },
    });
    await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T17:10:00.000Z"),
        source,
      },
      input: { limit: 5, topic: "fantasy injuries" },
    });

    expect(first).toMatchObject({
      inserted: 1,
      tailoredReferences: 1,
    });

    const centralRows = await handle.db
      .select({
        id: contentItems.id,
        leagueId: contentItems.leagueId,
        metadata: contentItems.metadata,
        sourceUrl: contentItems.sourceUrl,
      })
      .from(contentItems)
      .where(eq(contentItems.sourceUrl, sourceUrl));
    expect(centralRows).toHaveLength(1);
    expect(centralRows[0]).toMatchObject({
      leagueId: null,
      sourceUrl,
    });
    expect(centralRows[0]?.metadata).toMatchObject({
      playerRefs: [
        {
          label: "Star Runner",
          provider: "espn",
          providerId: playerAId,
        },
      ],
    });

    const leagueAReferences = await withLeagueContext(
      handle.db,
      leagueAId,
      async (tx) =>
        tx
          .select({
            contentItemId: leagueFeedReferences.contentItemId,
            matchedEntities: leagueFeedReferences.matchedEntities,
            reason: leagueFeedReferences.reason,
          })
          .from(leagueFeedReferences)
          .where(eq(leagueFeedReferences.leagueId, leagueAId)),
    );
    expect(leagueAReferences).toHaveLength(1);
    expect(leagueAReferences[0]).toMatchObject({
      contentItemId: centralRows[0]?.id,
      reason: "Tailor Team A rosters Star Runner.",
    });
    expect(leagueAReferences[0]?.matchedEntities).toEqual(
      expect.arrayContaining([
        {
          label: "Star Runner",
          provider: "espn",
          providerId: playerAId,
          type: "player",
        },
        {
          label: "Tailor Team A",
          provider: "espn",
          providerId: "1",
          type: "team",
        },
      ]),
    );

    const leagueBReferences = await withLeagueContext(
      handle.db,
      leagueBId,
      async (tx) =>
        tx
          .select({ id: leagueFeedReferences.id })
          .from(leagueFeedReferences)
          .where(eq(leagueFeedReferences.leagueId, leagueBId)),
    );
    expect(leagueBReferences).toHaveLength(0);

    const hub = await getCentralNewsHubData(handle.db, {
      forLeagueId: leagueAId,
      limit: 10,
      userId,
    });
    expect(hub.forYourLeague?.items[0]).toMatchObject({
      contentItemId: centralRows[0]?.id,
      relevanceReason: "Tailor Team A rosters Star Runner.",
      summary: "Tailor Team A rosters Star Runner.",
      title: "Star Runner injury changes Sunday fantasy outlook",
    });

    const feed = await getLeagueFeedData(handle.db, {
      leagueId: leagueAId,
      limit: 10,
      userId,
    });
    expect(feed.status).toBe("ready");
    if (feed.status !== "ready") {
      throw new Error(`unexpected feed status: ${feed.status}`);
    }
    expect(feed.data.items[0]).toMatchObject({
      contentItemId: centralRows[0]?.id,
      kind: "news",
      relevanceReason: "Tailor Team A rosters Star Runner.",
      scope: "central",
      summary: "Tailor Team A rosters Star Runner.",
    });

    const unmatchedHub = await getCentralNewsHubData(handle.db, {
      forLeagueId: leagueBId,
      limit: 10,
      userId,
    });
    expect(unmatchedHub.forYourLeague).toBeNull();
  });

  it("tailors real-source articles by extracting rostered player names", async () => {
    const sourceUrl = `https://news.example.com/${marker}/real-source-star-runner`;
    const source = new TavilyCentralNewsSource({
      apiKey: fakeKey(),
      client: {
        search: async (query: string) => ({
          images: [],
          query,
          requestId: `${marker}-real-source-player`,
          responseTime: 0.1,
          results: [
            {
              content:
                "Star Runner missed practice and may alter the fantasy outlook.",
              publishedDate: "2026-06-11T18:00:00.000Z",
              rawContent:
                "Star Runner missed practice and may alter the fantasy outlook for Sunday's slate.",
              score: 0.91,
              title: "Star Runner practice report",
              url: sourceUrl,
            },
          ],
        }),
      },
      playerRefExtractor: new RosteredPlayerRefExtractor(handle.db),
    });

    const result = await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T18:05:00.000Z"),
        source,
      },
      input: { limit: 5, topic: "fantasy injuries" },
    });

    expect(result).toMatchObject({
      inserted: 1,
      tailoredReferences: 1,
    });

    const [centralRow] = await handle.db
      .select({
        id: contentItems.id,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(eq(contentItems.sourceUrl, sourceUrl));
    expect(centralRow?.metadata).toMatchObject({
      playerRefs: [
        {
          label: "Star Runner",
          provider: "espn",
          providerId: playerAId,
        },
      ],
    });
    if (!centralRow) {
      throw new Error("central row was not inserted");
    }

    const leagueAReferences = await withLeagueContext(
      handle.db,
      leagueAId,
      (tx) =>
        tx
          .select({
            contentItemId: leagueFeedReferences.contentItemId,
            matchedEntities: leagueFeedReferences.matchedEntities,
          })
          .from(leagueFeedReferences)
          .where(eq(leagueFeedReferences.contentItemId, centralRow.id)),
    );
    expect(leagueAReferences).toHaveLength(1);
    expect(leagueAReferences[0]?.matchedEntities).toEqual(
      expect.arrayContaining([
        {
          label: "Star Runner",
          provider: "espn",
          providerId: playerAId,
          type: "player",
        },
      ]),
    );
  });

  it("adds substrate-B general NFL context to league-specific central-news framing", async () => {
    const sourceUrl = `https://news.example.com/${marker}/mahomes-general-context`;
    const source = new StaticCentralNewsSource([
      {
        body: "A national report says Patrick Mahomes is steering the Week 2 slate.",
        id: `${marker}-mahomes-context`,
        playerRefs: [
          {
            label: "Patrick Mahomes",
            provider: "espn",
            providerId: "3139477",
          },
        ],
        publishedAt: new Date("2026-06-11T19:00:00.000Z"),
        source: "NFL Wire",
        sourceType: "web",
        sourceUrl,
        summary: "Patrick Mahomes shapes the national fantasy slate.",
        title: "Mahomes shapes the Week 2 fantasy slate",
        topics: ["fantasy", "quarterbacks"],
      },
    ]);

    const result = await refreshCentralNews({
      deps: {
        db: handle.db,
        now: () => new Date("2026-06-11T19:05:00.000Z"),
        source,
      },
      input: { limit: 5, topic: "fantasy quarterbacks" },
    });

    expect(result).toMatchObject({
      inserted: 1,
    });
    // The fan-out count is global across the shared parallel test DB, and
    // other test files (e.g. ai/pipeline.test.ts) legitimately roster the
    // same real substrate-B player id (3139477) transiently — assert
    // at-least-ours here; the scoped league-A reference assertions below
    // carry the exactness.
    expect(result.tailoredReferences).toBeGreaterThanOrEqual(1);

    const [centralRow] = await handle.db
      .select({
        id: contentItems.id,
        leagueId: contentItems.leagueId,
        metadata: contentItems.metadata,
        summary: contentItems.summary,
      })
      .from(contentItems)
      .where(eq(contentItems.sourceUrl, sourceUrl));
    expect(centralRow).toMatchObject({
      leagueId: null,
      summary: "Patrick Mahomes shapes the national fantasy slate.",
    });
    expect(centralRow?.metadata).toMatchObject({
      playerRefs: [
        {
          label: "Patrick Mahomes",
          provider: "espn",
          providerId: "3139477",
        },
      ],
    });
    if (!centralRow) {
      throw new Error("central row was not inserted");
    }

    const leagueAReferences = await withLeagueContext(
      handle.db,
      leagueAId,
      (tx) =>
        tx
          .select({
            contentItemId: leagueFeedReferences.contentItemId,
            reason: leagueFeedReferences.reason,
          })
          .from(leagueFeedReferences)
          .where(
            and(
              eq(leagueFeedReferences.leagueId, leagueAId),
              eq(leagueFeedReferences.contentItemId, centralRow.id),
            ),
          ),
    );
    expect(leagueAReferences).toEqual([
      expect.objectContaining({
        contentItemId: centralRow.id,
        reason: expect.stringContaining(
          "Tailor Team A rosters Patrick Mahomes. General NFL context: Patrick Mahomes (QB, KC) logged 27.78 fantasy points in Week 2 vs DAL; KC at DAL finished 28-30.",
        ),
      }),
    ]);

    const leagueBReferences = await withLeagueContext(
      handle.db,
      leagueBId,
      (tx) =>
        tx
          .select({ id: leagueFeedReferences.id })
          .from(leagueFeedReferences)
          .where(
            and(
              eq(leagueFeedReferences.leagueId, leagueBId),
              eq(leagueFeedReferences.contentItemId, centralRow.id),
            ),
          ),
    );
    expect(leagueBReferences).toHaveLength(0);
  });
});
