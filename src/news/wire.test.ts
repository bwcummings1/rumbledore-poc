// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  fantasyRosterEntries,
  fantasyTeams,
  leagueMemberIdentityClaims,
  leagues,
  members,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { getNewsWireData } from "./wire";

const marker = `wiretest-${randomUUID()}`;
const playerAId = `${marker}-player-a`;
const playerBId = `${marker}-player-b`;
const playerCId = `${marker}-player-c`;
let handle: DbHandle;
let leagueId: string;
let userId: string;
let noRosterUserId: string;
let noMatchUserId: string;

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

  const insertedUsers = await handle.db
    .insert(users)
    .values([
      {
        displayName: "Wire Member",
        email: `${marker}-member@example.com`,
      },
      {
        displayName: "Wire No Roster",
        email: `${marker}-no-roster@example.com`,
      },
      {
        displayName: "Wire No Match",
        email: `${marker}-no-match@example.com`,
      },
    ])
    .returning({ id: users.id });
  const [memberUser, noRosterUser, noMatchUser] = insertedUsers;
  if (!memberUser || !noRosterUser || !noMatchUser) {
    throw new Error("wire test users were not inserted");
  }
  userId = memberUser.id;
  noRosterUserId = noRosterUser.id;
  noMatchUserId = noMatchUser.id;

  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: "Wire League",
      provider: "espn",
      providerLeagueId: `${marker}-league`,
      season: 2026,
      sport: "ffl",
    })
    .returning({
      id: leagues.id,
      providerLeagueId: leagues.providerLeagueId,
    });
  if (!league) {
    throw new Error("wire test league was not inserted");
  }
  leagueId = league.id;

  await handle.db.insert(members).values([
    { organizationId: leagueId, role: "member", userId },
    { organizationId: leagueId, role: "member", userId: noRosterUserId },
    { organizationId: leagueId, role: "member", userId: noMatchUserId },
  ]);

  await withLeagueContext(handle.db, leagueId, async (tx) => {
    await tx.insert(fantasyTeams).values([
      {
        abbrev: "WM",
        contentHash: `${marker}-team-a-hash`,
        leagueId,
        leagueProviderId: league.providerLeagueId,
        name: "Wire Member Team",
        ownerMemberIds: [`${marker}-owner-a`],
        provider: "espn",
        providerTeamId: "1",
        season: 2026,
      },
      {
        abbrev: "NM",
        contentHash: `${marker}-team-c-hash`,
        leagueId,
        leagueProviderId: league.providerLeagueId,
        name: "No Match Team",
        ownerMemberIds: [`${marker}-owner-c`],
        provider: "espn",
        providerTeamId: "3",
        season: 2026,
      },
    ]);
    await tx.insert(fantasyRosterEntries).values([
      {
        contentHash: `${marker}-roster-a-hash`,
        leagueId,
        leagueProviderId: league.providerLeagueId,
        metadata: { playerName: "Star Runner" },
        provider: "espn",
        providerPlayerId: playerAId,
        providerTeamId: "1",
        scoringPeriod: 4,
        season: 2026,
        slot: "RB",
        status: "active",
      },
      {
        contentHash: `${marker}-roster-c-hash`,
        leagueId,
        leagueProviderId: league.providerLeagueId,
        metadata: { playerName: "Quiet Tight End" },
        provider: "espn",
        providerPlayerId: playerCId,
        providerTeamId: "3",
        scoringPeriod: 4,
        season: 2026,
        slot: "TE",
        status: "active",
      },
    ]);
    await tx.insert(leagueMemberIdentityClaims).values([
      {
        leagueId,
        provider: "espn",
        providerMemberId: `${marker}-owner-a`,
        providerTeamIds: ["1"],
        userId,
      },
      {
        leagueId,
        provider: "espn",
        providerMemberId: `${marker}-owner-c`,
        providerTeamIds: ["3"],
        userId: noMatchUserId,
      },
    ]);
  });

  await handle.db.insert(contentItems).values([
    {
      body: "Star Runner missed practice and changes fantasy lineup decisions.",
      contentHash: `${marker}-star-runner-hash`,
      dedupKey: `${marker}-star-runner`,
      kind: "news",
      leagueId: null,
      metadata: {
        editorialImportance: 40,
        playerRefs: [
          {
            label: "Star Runner",
            provider: "espn",
            providerId: playerAId,
          },
        ],
        section: "injuries",
      },
      publishedAt: new Date("2026-06-11T14:00:00.000Z"),
      source: "Wire Desk",
      sourceUrl: `https://news.example.com/${marker}/star-runner`,
      summary: "Star Runner is the tagged personal story.",
      title: "Star Runner injury hits fantasy lineups",
    },
    {
      body: "Deep Threat moved in national rankings.",
      contentHash: `${marker}-deep-threat-hash`,
      dedupKey: `${marker}-deep-threat`,
      kind: "news",
      leagueId: null,
      metadata: {
        playerRefs: [
          {
            label: "Deep Threat",
            provider: "espn",
            providerId: playerBId,
          },
        ],
        section: "rankings",
      },
      publishedAt: new Date("2026-06-11T15:00:00.000Z"),
      source: "Wire Desk",
      sourceUrl: `https://news.example.com/${marker}/deep-threat`,
      summary: "A tagged story for a player outside the member roster.",
      title: "Deep Threat climbs weekly rankings",
    },
    {
      body: "General league-wide football context.",
      contentHash: `${marker}-general-hash`,
      dedupKey: `${marker}-general`,
      kind: "news",
      leagueId: null,
      metadata: { section: "headlines" },
      publishedAt: new Date("2026-06-11T13:00:00.000Z"),
      source: "Wire Desk",
      sourceUrl: `https://news.example.com/${marker}/general`,
      summary: "A general story without player tags.",
      title: "General NFL context updates the slate",
    },
  ]);
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(contentItems)
    .where(sql`${contentItems.dedupKey} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} = ${`${marker}-league`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("news wire data", () => {
  it("returns central stories for the general wire", async () => {
    const data = await getNewsWireData(handle.db, {
      limit: 10,
      mode: "general",
    });
    const markedItems = data.items.filter((item) =>
      item.sourceUrl.includes(marker),
    );

    expect(data.status).toBe("ready");
    expect(markedItems.map((item) => item.title)).toEqual([
      "Star Runner injury hits fantasy lineups",
      "Deep Threat climbs weekly rankings",
      "General NFL context updates the slate",
    ]);
  });

  it("filters the personal wire to players on the user's claimed rostered team", async () => {
    const data = await getNewsWireData(handle.db, {
      limit: 10,
      mode: "personal",
      userId,
    });

    expect(data).toMatchObject({
      mode: "personal",
      rosteredPlayerCount: 1,
      status: "ready",
    });
    expect(data.items.map((item) => item.title)).toEqual([
      "Star Runner injury hits fantasy lineups",
    ]);
    expect(data.items[0]?.matchedLabels).toEqual(["Star Runner"]);
  });

  it("returns designed personal-wire states for signed-out, unclaimed, and quiet rosters", async () => {
    await expect(
      getNewsWireData(handle.db, { mode: "personal" }),
    ).resolves.toMatchObject({
      items: [],
      mode: "personal",
      status: "signed_out",
    });
    await expect(
      getNewsWireData(handle.db, {
        mode: "personal",
        userId: noRosterUserId,
      }),
    ).resolves.toMatchObject({
      items: [],
      mode: "personal",
      rosteredPlayerCount: 0,
      status: "no_rosters",
    });
    await expect(
      getNewsWireData(handle.db, {
        mode: "personal",
        userId: noMatchUserId,
      }),
    ).resolves.toMatchObject({
      items: [],
      mode: "personal",
      rosteredPlayerCount: 1,
      status: "no_matches",
    });
  });
});
