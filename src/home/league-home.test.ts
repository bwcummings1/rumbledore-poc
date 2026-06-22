// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AiPersona, DEFAULT_PERSONA_CARDS } from "@/ai/personas";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  allTimeRecords,
  contentItems,
  dataIntegrityChecks,
  fantasyMembers,
  fantasyTeams,
  identityMappings,
  leagueMemberIdentityClaims,
  leagues,
  members,
  persons,
  seasonStatistics,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { syncCurrentLeague } from "@/ingestion";
import {
  createEspnDiscoveryProvider,
  type EspnFetch,
  type EspnSession,
} from "@/providers/espn/client";
import type { ProviderLeagueRef } from "@/providers/model";
import leagueFixture from "../../test/fixtures/espn/league-95050-2026.json";
import { getLeagueHomeData } from "./league-home";

const marker = `hometest-${randomUUID()}`;
const fixtureSwid = "{00000000-0000-4000-8000-000000000001}";
const fixtureEspnS2 = "fixture-session-value"; // ubs:ignore — fake ESPN cookie value for home tests
let handle: DbHandle;
let leagueId: string;
let userId: string;
let outsiderUserId: string;

type MutableLeagueFixture = Omit<typeof leagueFixture, "id"> & {
  id: string | number;
};

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

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function fixtureSession(): EspnSession {
  return {
    provider: "espn",
    authKind: "cookie",
    subjectProviderId: fixtureSwid,
    swid: fixtureSwid,
    espn_s2: fixtureEspnS2,
  };
}

function fixtureRef(providerLeagueId: string): ProviderLeagueRef {
  return {
    provider: "espn",
    providerId: providerLeagueId,
    season: 2026,
    sport: "ffl",
    name: "NHS Alumni Annual",
  };
}

function providerFor(providerLeagueId: string) {
  const fixture = structuredClone(leagueFixture) as MutableLeagueFixture;
  fixture.id = providerLeagueId;
  const fetch: EspnFetch = async () => jsonResponse(fixture);
  return createEspnDiscoveryProvider({ fetch, retryDelayMs: 0 });
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable — start the local stack with `pnpm db:up` before running tests.",
      { cause },
    );
  }
  await migrateSerialized(handle);

  const [memberUser] = await handle.db
    .insert(users)
    .values({
      displayName: "Home Test Member",
      email: `${marker}-member@example.com`,
    })
    .returning({ id: users.id });
  const [outsider] = await handle.db
    .insert(users)
    .values({
      displayName: "Home Test Outsider",
      email: `${marker}-outsider@example.com`,
    })
    .returning({ id: users.id });
  if (!memberUser || !outsider) {
    throw new Error("test users were not inserted");
  }
  userId = memberUser.id;
  outsiderUserId = outsider.id;

  const providerLeagueId = `${marker}-95050`;
  const synced = await syncCurrentLeague({
    db: handle.db,
    provider: providerFor(providerLeagueId),
    ref: fixtureRef(providerLeagueId),
    session: fixtureSession(),
  });
  if (!synced.ok) {
    throw synced.error;
  }
  leagueId = synced.value.league.id;

  await handle.db.insert(members).values({
    organizationId: leagueId,
    role: "commissioner",
    userId,
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

describe("getLeagueHomeData", () => {
  it("loads the ingested 95050 fixture standings for a league member", async () => {
    const result = await getLeagueHomeData(handle.db, { leagueId, userId });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected home result: ${result.status}`);
    }
    expect(result.data.league).toMatchObject({
      name: "NHS Alumni Annual",
      provider: "espn",
      season: 2026,
      scoringType: "H2H_POINTS",
      size: 12,
      status: "preseason",
    });
    expect(result.data.totals).toEqual({
      matchups: 84,
      members: 16,
      teams: 12,
    });
    expect(result.data.currentScoringPeriod).toBe(1);
    expect(result.data.currentMatchups).toHaveLength(6);
    expect(result.data.records).toHaveLength(0);
    expect(result.data.standings).toHaveLength(12);
    expect(result.data.standings[0]).toMatchObject({
      managerNames: ["Fixture Manager 12"],
      name: "Fixture Team 01",
      pointsAgainst: 0,
      pointsFor: 0,
      rank: 1,
      wins: 0,
      losses: 0,
      ties: 0,
    });
  });

  it("loads only this league's published AI blog storylines", async () => {
    const [otherLeague] = await handle.db
      .insert(leagues)
      .values({
        name: `${marker} other league`,
        provider: "espn",
        providerLeagueId: `${marker}-other`,
        season: 2026,
        sport: "ffl",
      })
      .returning({ id: leagues.id });
    if (!otherLeague) throw new Error("other league was not inserted");

    await withLeagueContext(handle.db, leagueId, async (tx) => {
      await tx.insert(aiPersonaCards).values(
        personaCardValue({
          leagueId,
          name: "Commissioner's Desk",
          persona: "commissioner",
          purpose: "Custom commissioner voice.",
        }),
      );

      await tx.insert(contentItems).values({
        authorPersona: "commissioner",
        body: "Only the requested league should see this body.",
        contentHash: `${marker}-storyline-hash`,
        dedupKey: `${marker}-storyline`,
        kind: "blog",
        leagueId,
        publishedAt: new Date("2026-06-11T00:00:00.000Z"),
        summary: "Only the requested league should see this summary.",
        title: "Commissioner: Home league storyline",
      });
    });

    await withLeagueContext(handle.db, otherLeague.id, async (tx) => {
      await tx.insert(contentItems).values({
        authorPersona: "narrator",
        body: "Other league body",
        contentHash: `${marker}-other-storyline-hash`,
        dedupKey: `${marker}-other-storyline`,
        kind: "blog",
        leagueId: otherLeague.id,
        publishedAt: new Date("2026-06-12T00:00:00.000Z"),
        summary: "Other league summary",
        title: "Narrator: Other league storyline",
      });
    });

    const result = await getLeagueHomeData(handle.db, { leagueId, userId });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected home result: ${result.status}`);
    }
    expect(result.data.storylines).toEqual([
      {
        authorPersona: "commissioner",
        byline: "Commissioner's Desk",
        dek: "Only the requested league should see this summary.",
        id: expect.any(String),
        publishedAt: "2026-06-11T00:00:00.000Z",
        section: {
          id: "previews",
          label: "Previews",
          slug: "previews",
        },
        summary: "Only the requested league should see this summary.",
        thumbnailUrl: "",
        title: "Commissioner: Home league storyline",
      },
    ]);
  });

  it("builds the claimed-team activation hook from records and existing cast coverage", async () => {
    let recordId = "";
    let matchedStoryId = "";
    let claimedTeamName = "";
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      const [team] = await tx
        .select({
          id: fantasyTeams.id,
          leagueProviderId: fantasyTeams.leagueProviderId,
          name: fantasyTeams.name,
          ownerMemberIds: fantasyTeams.ownerMemberIds,
          provider: fantasyTeams.provider,
          providerTeamId: fantasyTeams.providerTeamId,
          season: fantasyTeams.season,
        })
        .from(fantasyTeams)
        .where(eq(fantasyTeams.leagueId, leagueId))
        .orderBy(asc(fantasyTeams.name))
        .limit(1);
      if (!team) {
        throw new Error("fixture team was not found");
      }
      const providerMemberId = team.ownerMemberIds[0];
      if (!providerMemberId) {
        throw new Error("fixture team has no owner");
      }
      const [fantasyMember] = await tx
        .select({
          displayName: fantasyMembers.displayName,
          id: fantasyMembers.id,
        })
        .from(fantasyMembers)
        .where(
          and(
            eq(fantasyMembers.leagueId, leagueId),
            eq(fantasyMembers.providerMemberId, providerMemberId),
          ),
        )
        .limit(1);
      if (!fantasyMember) {
        throw new Error("fixture member was not found");
      }
      const [mapping] = await tx
        .select({ personId: identityMappings.personId })
        .from(identityMappings)
        .where(
          and(
            eq(identityMappings.leagueId, leagueId),
            eq(identityMappings.provider, team.provider),
            eq(identityMappings.providerTeamId, team.providerTeamId),
            eq(identityMappings.season, team.season),
          ),
        )
        .limit(1);
      if (!mapping) {
        throw new Error("activation identity mapping was not found");
      }
      const [person] = await tx
        .select({ id: persons.id })
        .from(persons)
        .where(
          and(eq(persons.leagueId, leagueId), eq(persons.id, mapping.personId)),
        )
        .limit(1);
      if (!person) {
        throw new Error("activation person was not found");
      }
      await tx.insert(seasonStatistics).values([
        {
          leagueId,
          losses: 3,
          personId: person.id,
          pointsAgainst: 910.75,
          pointsFor: 1010.25,
          season: 2025,
          ties: 0,
          wins: 7,
        },
        {
          leagueId,
          losses: 1,
          personId: person.id,
          pointsAgainst: 500,
          pointsFor: 600,
          season: team.season,
          ties: 1,
          wins: 3,
        },
      ]);
      await tx.insert(leagueMemberIdentityClaims).values({
        fantasyMemberId: fantasyMember.id,
        leagueId,
        provider: team.provider,
        providerMemberId,
        providerTeamIds: [team.providerTeamId],
        userId,
      });
      const [record] = await tx
        .insert(allTimeRecords)
        .values({
          holderPersonId: person.id,
          isCurrent: true,
          leagueId,
          recordType: "highest_single_week_score",
          scoringPeriod: 7,
          season: 2025,
          value: 188.2,
        })
        .returning({ id: allTimeRecords.id });
      if (!record) {
        throw new Error("activation record was not inserted");
      }
      const [matchedStory] = await tx
        .insert(contentItems)
        .values({
          authorPersona: "beat_reporter",
          body: `${team.name} is already in the copy.`,
          contentHash: `${marker}-activation-team-story-hash`,
          dedupKey: `${marker}-activation-team-story`,
          kind: "blog",
          leagueId,
          publishedAt: new Date("2026-06-12T00:00:00.000Z"),
          summary: `${team.name} has the room watching.`,
          title: `Beat Reporter: ${team.name} has arrived`,
        })
        .returning({ id: contentItems.id });
      await tx.insert(contentItems).values({
        authorPersona: "commissioner",
        body: "Latest generic league note.",
        contentHash: `${marker}-activation-latest-story-hash`,
        dedupKey: `${marker}-activation-latest-story`,
        kind: "blog",
        leagueId,
        publishedAt: new Date("2026-06-13T00:00:00.000Z"),
        summary: "Latest generic league note.",
        title: "Commissioner: Generic league bulletin",
      });
      if (!matchedStory) {
        throw new Error("activation story was not inserted");
      }
      recordId = record.id;
      matchedStoryId = matchedStory.id;
      claimedTeamName = team.name;
    });

    const result = await getLeagueHomeData(handle.db, { leagueId, userId });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected home result: ${result.status}`);
    }
    expect(result.data.activation).toMatchObject({
      allTime: {
        losses: 4,
        pointsAgainst: 1410.75,
        pointsFor: 1610.25,
        seasons: 2,
        ties: 1,
        wins: 10,
      },
      castTeaser: {
        mode: "team_reference",
        storyline: {
          id: matchedStoryId,
          title: `Beat Reporter: ${claimedTeamName} has arrived`,
        },
      },
      records: [expect.objectContaining({ id: recordId })],
      team: expect.objectContaining({
        isClaimedByUser: true,
        name: claimedTeamName,
        wins: 0,
      }),
    });
    expect(result.data.activation?.currentMatchup).not.toBeNull();
    expect(
      result.data.standings.find((row) => row.name === claimedTeamName)
        ?.isClaimedByUser,
    ).toBe(true);
  });

  it("falls back to the latest league cast headline when the claimed team has no direct coverage", async () => {
    const [fallbackUser] = await handle.db
      .insert(users)
      .values({
        displayName: "Activation Fallback Member",
        email: `${marker}-activation-fallback@example.com`,
      })
      .returning({ id: users.id });
    if (!fallbackUser) {
      throw new Error("activation fallback user was not inserted");
    }
    await handle.db.insert(members).values({
      organizationId: leagueId,
      role: "member",
      userId: fallbackUser.id,
    });

    let fallbackStoryId = "";
    let claimedTeamName = "";
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      const teams = await tx
        .select({
          id: fantasyTeams.id,
          name: fantasyTeams.name,
          ownerMemberIds: fantasyTeams.ownerMemberIds,
          provider: fantasyTeams.provider,
          providerTeamId: fantasyTeams.providerTeamId,
        })
        .from(fantasyTeams)
        .where(eq(fantasyTeams.leagueId, leagueId))
        .orderBy(asc(fantasyTeams.name))
        .limit(2);
      const team = teams[1];
      if (!team) {
        throw new Error("activation fallback fixture team was not found");
      }
      const providerMemberId = team.ownerMemberIds[0];
      if (!providerMemberId) {
        throw new Error("activation fallback fixture team has no owner");
      }
      const [fantasyMember] = await tx
        .select({ id: fantasyMembers.id })
        .from(fantasyMembers)
        .where(
          and(
            eq(fantasyMembers.leagueId, leagueId),
            eq(fantasyMembers.providerMemberId, providerMemberId),
          ),
        )
        .limit(1);
      if (!fantasyMember) {
        throw new Error("activation fallback member was not found");
      }
      await tx.insert(leagueMemberIdentityClaims).values({
        fantasyMemberId: fantasyMember.id,
        leagueId,
        provider: team.provider,
        providerMemberId,
        providerTeamIds: [team.providerTeamId],
        userId: fallbackUser.id,
      });
      const [story] = await tx
        .insert(contentItems)
        .values({
          authorPersona: "commissioner",
          body: "A league-wide bulletin without a named team.",
          contentHash: `${marker}-activation-fallback-story-hash`,
          dedupKey: `${marker}-activation-fallback-story`,
          kind: "blog",
          leagueId,
          publishedAt: new Date("2026-06-14T00:00:00.000Z"),
          summary: "A league-wide bulletin without a named team.",
          title: "Commissioner: Latest league bulletin",
        })
        .returning({ id: contentItems.id });
      if (!story) {
        throw new Error("activation fallback story was not inserted");
      }
      fallbackStoryId = story.id;
      claimedTeamName = team.name;
    });

    const result = await getLeagueHomeData(handle.db, {
      leagueId,
      userId: fallbackUser.id,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(`unexpected home result: ${result.status}`);
    }
    expect(result.data.activation).toMatchObject({
      allTime: null,
      castTeaser: {
        mode: "latest",
        storyline: {
          id: fallbackStoryId,
          title: "Commissioner: Latest league bulletin",
        },
      },
      records: [],
      team: expect.objectContaining({
        isClaimedByUser: true,
        name: claimedTeamName,
      }),
    });
  });

  it("suppresses record-book reads while integrity failures are unresolved", async () => {
    let recordId = "";
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      const [person] = await tx
        .insert(persons)
        .values({
          canonicalName: "Record Holder",
          leagueId,
        })
        .returning({ id: persons.id });
      if (!person) {
        throw new Error("record holder was not inserted");
      }
      const [record] = await tx
        .insert(allTimeRecords)
        .values({
          holderPersonId: person.id,
          isCurrent: true,
          leagueId,
          recordType: "highest_single_week_score",
          scoringPeriod: 1,
          season: 2026,
          value: 199.9,
        })
        .returning({ id: allTimeRecords.id });
      if (!record) {
        throw new Error("record row was not inserted");
      }
      recordId = record.id;
    });

    const trusted = await getLeagueHomeData(handle.db, { leagueId, userId });
    expect(trusted.status).toBe("ready");
    if (trusted.status !== "ready") {
      throw new Error(`unexpected home result: ${trusted.status}`);
    }
    expect(trusted.data.records.map((record) => record.id)).toContain(recordId);

    let checkId = "";
    await withLeagueContext(handle.db, leagueId, async (tx) => {
      const [check] = await tx
        .insert(dataIntegrityChecks)
        .values({
          checkKey: "identity_sanity",
          detail: { reason: "fixture unresolved" },
          leagueId,
          season: 2026,
          status: "fail",
        })
        .returning({ id: dataIntegrityChecks.id });
      if (!check) {
        throw new Error("integrity check was not inserted");
      }
      checkId = check.id;
    });

    const quarantined = await getLeagueHomeData(handle.db, {
      leagueId,
      userId,
    });
    expect(quarantined.status).toBe("ready");
    if (quarantined.status !== "ready") {
      throw new Error(`unexpected home result: ${quarantined.status}`);
    }
    expect(quarantined.data.records).toEqual([]);

    await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .update(dataIntegrityChecks)
        .set({ status: "reviewed" })
        .where(eq(dataIntegrityChecks.id, checkId)),
    );

    const reviewed = await getLeagueHomeData(handle.db, { leagueId, userId });
    expect(reviewed.status).toBe("ready");
    if (reviewed.status !== "ready") {
      throw new Error(`unexpected home result: ${reviewed.status}`);
    }
    expect(reviewed.data.records.map((record) => record.id)).toContain(
      recordId,
    );
  });

  it("rejects a user who is not a member of the league", async () => {
    await expect(
      getLeagueHomeData(handle.db, {
        leagueId,
        userId: outsiderUserId,
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });
});
