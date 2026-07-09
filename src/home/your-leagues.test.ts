// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  fantasyMatchups,
  fantasyTeams,
  leagueMemberIdentityClaims,
  leagues,
  members,
  onboardingDiscoveredLeagues,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { getYourLeaguesLandingData } from "./your-leagues";

const marker = `yourleagues-${randomUUID()}`;
const now = new Date("2026-06-14T12:00:00.000Z");

let handle: DbHandle;
let userId: string;
let emptyUserId: string;
let alphaLeagueId: string;
let sleeperLeagueId: string;

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `Your Leagues ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning({ id: users.id });
  if (!user) throw new Error(`failed to seed ${tag} user`);
  return user.id;
}

async function seedLeague(values: {
  currentScoringPeriod: number;
  name: string;
  provider: "espn" | "sleeper";
  providerLeagueId: string;
}) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: values.currentScoringPeriod,
      name: values.name,
      provider: values.provider,
      providerLeagueId: values.providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 4,
      sport: "ffl",
      status: "in_season",
    })
    .returning({ id: leagues.id });
  if (!league) throw new Error(`failed to seed ${values.name}`);
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

  userId = await seedUser("member");
  emptyUserId = await seedUser("empty");
  alphaLeagueId = await seedLeague({
    currentScoringPeriod: 2,
    name: "Alpha After Dark",
    provider: "espn",
    providerLeagueId: `${marker}-alpha`,
  });
  sleeperLeagueId = await seedLeague({
    currentScoringPeriod: 1,
    name: "Sleeper Chaos",
    provider: "sleeper",
    providerLeagueId: `${marker}-sleeper`,
  });

  await handle.db.insert(members).values([
    {
      lastOpenedAt: new Date("2026-06-14T09:00:00.000Z"),
      organizationId: alphaLeagueId,
      role: "member",
      userId,
    },
    {
      lastOpenedAt: new Date("2026-06-14T10:00:00.000Z"),
      organizationId: sleeperLeagueId,
      role: "commissioner",
      userId,
    },
  ]);

  const [espnCredential] = await handle.db
    .insert(providerCredentials)
    .values({
      connectionFlow: "manual",
      encryptedPayload: `${marker}-encrypted-payload`,
      lastValidatedAt: now,
      provider: "espn",
      subjectProviderId: `${marker}-espn-owner-1`,
      userId,
    })
    .returning({ id: providerCredentials.id });
  if (!espnCredential) throw new Error("ESPN credential was not inserted");

  const [sleeperCredential] = await handle.db
    .insert(providerCredentials)
    .values({
      connectionFlow: "public",
      encryptedPayload: `${marker}-sleeper-encrypted-payload`,
      lastValidatedAt: now,
      provider: "sleeper",
      subjectProviderId: `${marker}-sleeper-subject`,
      userId,
    })
    .returning({ id: providerCredentials.id });
  if (!sleeperCredential) {
    throw new Error("Sleeper credential was not inserted");
  }

  await handle.db.insert(onboardingDiscoveredLeagues).values({
    credentialId: sleeperCredential.id,
    lastDiscoveredAt: now,
    name: "Sleeper Chaos",
    provider: "sleeper",
    providerLeagueId: `${marker}-sleeper`,
    season: 2026,
    size: 4,
    sport: "ffl",
    teamName: "Moon Crew",
    userId,
  });

  await withLeagueContext(handle.db, alphaLeagueId, async (tx) => {
    await tx.insert(fantasyTeams).values([
      {
        abbrev: "ALP",
        contentHash: `${marker}-alpha-team-1`,
        leagueId: alphaLeagueId,
        leagueProviderId: `${marker}-alpha`,
        name: "Alpha Aces",
        ownerMemberIds: [`${marker}-espn-owner-1`],
        provider: "espn",
        providerTeamId: "1",
        season: 2026,
      },
      {
        abbrev: "BET",
        contentHash: `${marker}-alpha-team-2`,
        leagueId: alphaLeagueId,
        leagueProviderId: `${marker}-alpha`,
        name: "Beta Brigade",
        ownerMemberIds: [`${marker}-espn-owner-2`],
        provider: "espn",
        providerTeamId: "2",
        season: 2026,
      },
    ]);
    await tx.insert(fantasyMatchups).values([
      {
        awayScore: 91.25,
        awayTeamProviderId: "2",
        contentHash: `${marker}-alpha-matchup-1`,
        homeScore: 104.5,
        homeTeamProviderId: "1",
        leagueId: alphaLeagueId,
        leagueProviderId: `${marker}-alpha`,
        provider: "espn",
        providerMatchupId: "1",
        scoringPeriod: 2,
        season: 2026,
        status: "in_progress",
      },
    ]);
    await tx.insert(leagueMemberIdentityClaims).values({
      leagueId: alphaLeagueId,
      provider: "espn",
      providerMemberId: `${marker}-espn-owner-2`,
      providerTeamIds: ["2"],
      userId,
    });
    await tx.insert(contentItems).values([
      {
        authorPersona: "analyst",
        body: "Old alpha body",
        contentHash: `${marker}-alpha-old-hash`,
        dedupKey: `${marker}-alpha-old`,
        kind: "blog",
        leagueId: alphaLeagueId,
        publishedAt: new Date("2026-06-12T00:00:00.000Z"),
        summary: "Old alpha summary",
        title: "Old Alpha Press",
      },
      {
        authorPersona: "trash_talker",
        body: "Latest alpha body",
        contentHash: `${marker}-alpha-latest-hash`,
        dedupKey: `${marker}-alpha-latest`,
        kind: "blog",
        leagueId: alphaLeagueId,
        publishedAt: new Date("2026-06-13T00:00:00.000Z"),
        summary: "Latest alpha summary",
        title: "Beta Gets Dragged Into Prime Time",
      },
      {
        authorPersona: "commissioner",
        body: "Hidden alpha body",
        contentHash: `${marker}-alpha-hidden-hash`,
        dedupKey: `${marker}-alpha-hidden`,
        kind: "blog",
        leagueId: alphaLeagueId,
        publishedAt: new Date("2026-06-14T00:00:00.000Z"),
        status: "retracted",
        summary: "Hidden alpha summary",
        title: "Hidden Alpha Press",
      },
    ]);
  });

  await withLeagueContext(handle.db, sleeperLeagueId, async (tx) => {
    await tx.insert(fantasyTeams).values([
      {
        abbrev: "MOON",
        contentHash: `${marker}-sleeper-team-10`,
        leagueId: sleeperLeagueId,
        leagueProviderId: `${marker}-sleeper`,
        name: "Moon Crew",
        ownerMemberIds: [`${marker}-sleeper-owner-10`],
        provider: "sleeper",
        providerTeamId: "10",
        season: 2026,
      },
      {
        abbrev: "STAR",
        contentHash: `${marker}-sleeper-team-11`,
        leagueId: sleeperLeagueId,
        leagueProviderId: `${marker}-sleeper`,
        name: "Star Squad",
        ownerMemberIds: [`${marker}-sleeper-owner-11`],
        provider: "sleeper",
        providerTeamId: "11",
        season: 2026,
      },
    ]);
    await tx.insert(fantasyMatchups).values({
      awayScore: 77,
      awayTeamProviderId: "11",
      contentHash: `${marker}-sleeper-matchup-1`,
      homeScore: 82.5,
      homeTeamProviderId: "10",
      leagueId: sleeperLeagueId,
      leagueProviderId: `${marker}-sleeper`,
      provider: "sleeper",
      providerMatchupId: "1",
      scoringPeriod: 1,
      season: 2026,
      status: "scheduled",
    });
    await tx.insert(contentItems).values({
      authorPersona: "narrator",
      body: "Sleeper latest body",
      contentHash: `${marker}-sleeper-latest-hash`,
      dedupKey: `${marker}-sleeper-latest`,
      kind: "blog",
      leagueId: sleeperLeagueId,
      publishedAt: new Date("2026-06-14T00:00:00.000Z"),
      summary: "Sleeper latest summary",
      title: "Moon Crew Opens the Trap Door",
    });
  });
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("getYourLeaguesLandingData", () => {
  it("returns MRU-ordered league cards with matchup and latest Press data", async () => {
    const data = await getYourLeaguesLandingData(handle.db, { userId });

    expect(data.leagues.map((league) => league.name)).toEqual([
      "Sleeper Chaos",
      "Alpha After Dark",
    ]);

    const sleeper = data.leagues[0];
    expect(sleeper?.providerLabel).toBe("Sleeper");
    expect(sleeper?.matchup).toMatchObject({
      isUserMatchup: true,
      opponentTeamName: "Star Squad",
      scoringPeriod: 1,
      status: "scheduled",
      userTeamName: "Moon Crew",
    });
    expect(sleeper?.latestPress).toMatchObject({
      authorPersona: "narrator",
      summary: "Sleeper latest summary",
      title: "Moon Crew Opens the Trap Door",
    });

    const alpha = data.leagues[1];
    expect(alpha?.providerLabel).toBe("ESPN");
    expect(alpha?.href).toBe(`/leagues/${alphaLeagueId}`);
    expect(alpha?.matchup).toMatchObject({
      isUserMatchup: true,
      opponentTeamName: "Alpha Aces",
      scoringPeriod: 2,
      status: "in_progress",
      userTeamName: "Beta Brigade",
    });
    expect(alpha?.matchup?.away).toMatchObject({
      isUserTeam: true,
      name: "Beta Brigade",
      score: 91.25,
    });
    expect(alpha?.latestPress).toMatchObject({
      authorPersona: "trash_talker",
      summary: "Latest alpha summary",
      title: "Beta Gets Dragged Into Prime Time",
    });
  });

  it("returns an empty card list for an authenticated user with no leagues", async () => {
    await expect(
      getYourLeaguesLandingData(handle.db, { userId: emptyUserId }),
    ).resolves.toEqual({ leagues: [] });
  });
});
