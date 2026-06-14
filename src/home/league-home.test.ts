// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  contentItems,
  dataIntegrityChecks,
  leagues,
  members,
  persons,
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
        id: expect.any(String),
        publishedAt: "2026-06-11T00:00:00.000Z",
        summary: "Only the requested league should see this summary.",
        title: "Commissioner: Home league storyline",
      },
    ]);
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
