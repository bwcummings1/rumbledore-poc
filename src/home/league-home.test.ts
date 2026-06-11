// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { leagues, members, users } from "@/db/schema";
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

  it("rejects a user who is not a member of the league", async () => {
    await expect(
      getLeagueHomeData(handle.db, {
        leagueId,
        userId: outsiderUserId,
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });
});
