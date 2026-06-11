// @vitest-environment node
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  leagues,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  createEspnDiscoveryProvider,
  type EspnFetch,
  type EspnSession,
} from "@/providers/espn/client";
import type { ProviderLeagueRef } from "@/providers/model";
import leagueFixture from "../../test/fixtures/espn/league-95050-2026.json";
import { syncCurrentLeague } from "./current-league";
import { stableContentHash } from "./hash";

const marker = `ingesttest-${randomUUID()}`;
const fixtureSwid = "{00000000-0000-4000-8000-000000000001}";
const fixtureEspnS2 = "fixture-session-value"; // ubs:ignore — fake ESPN cookie value for ingestion tests
let handle: DbHandle;

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

function leagueFixtureFor(providerLeagueId: string) {
  const fixture = structuredClone(leagueFixture) as MutableLeagueFixture;
  fixture.id = providerLeagueId;
  return fixture;
}

function providerFor(body: unknown) {
  const fetch: EspnFetch = async () => jsonResponse(body);
  return createEspnDiscoveryProvider({ fetch, retryDelayMs: 0 });
}

async function selectIngestedRows(leagueId: string) {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const teams = await tx
      .select()
      .from(fantasyTeams)
      .where(eq(fantasyTeams.leagueId, leagueId))
      .orderBy(asc(fantasyTeams.providerTeamId));
    const members = await tx
      .select()
      .from(fantasyMembers)
      .where(eq(fantasyMembers.leagueId, leagueId))
      .orderBy(asc(fantasyMembers.providerMemberId));
    const matchups = await tx
      .select()
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.leagueId, leagueId))
      .orderBy(
        asc(fantasyMatchups.scoringPeriod),
        asc(fantasyMatchups.providerMatchupId),
      );
    return { matchups, members, teams };
  });
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
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("stableContentHash", () => {
  it("is stable across object key order and absent optional fields", () => {
    expect(
      stableContentHash({
        b: 2,
        optional: undefined,
        a: { z: true, y: "yes" },
      }),
    ).toBe(
      stableContentHash({
        a: { y: "yes", z: true },
        b: 2,
      }),
    );
  });
});

describe("syncCurrentLeague", () => {
  it("upserts the ESPN 95050 fixture and no-ops on a second identical sync", async () => {
    const providerLeagueId = `${marker}-95050-idempotent`;
    const provider = providerFor(leagueFixtureFor(providerLeagueId));

    const first = await syncCurrentLeague({
      db: handle.db,
      provider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;
    expect(first.value.league).toMatchObject({
      provider: "espn",
      providerLeagueId,
      season: 2026,
      changed: 1,
      unchanged: 0,
    });
    expect(first.value.teams).toEqual({ total: 12, changed: 12, unchanged: 0 });
    expect(first.value.members).toEqual({
      total: 16,
      changed: 16,
      unchanged: 0,
    });
    expect(first.value.matchups).toEqual({
      total: 84,
      changed: 84,
      unchanged: 0,
    });

    const firstRows = await selectIngestedRows(first.value.league.id);
    expect(firstRows.teams).toHaveLength(12);
    expect(firstRows.members).toHaveLength(16);
    expect(firstRows.matchups).toHaveLength(84);
    expect(firstRows.teams[0]).toMatchObject({
      provider: "espn",
      providerTeamId: "1",
      leagueProviderId: providerLeagueId,
      season: 2026,
      name: "Fixture Team 01",
      abbrev: "T01",
      ownerMemberIds: ["member-12"],
    });
    expect(firstRows.members[0]).toMatchObject({
      providerMemberId: "member-01",
      displayName: "Fixture Manager 01",
      role: "member",
    });
    expect(firstRows.matchups[0]).toMatchObject({
      providerMatchupId: "1",
      scoringPeriod: 1,
      homeTeamProviderId: "7",
      awayTeamProviderId: "5",
      homeScore: 0,
      awayScore: 0,
      winner: "unknown",
      status: "scheduled",
    });
    expect(firstRows.teams[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    const firstTeamUpdatedAt = firstRows.teams[0].updatedAt.toISOString();

    const second = await syncCurrentLeague({
      db: handle.db,
      provider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.league).toMatchObject({ changed: 0, unchanged: 1 });
    expect(second.value.teams).toEqual({
      total: 12,
      changed: 0,
      unchanged: 12,
    });
    expect(second.value.members).toEqual({
      total: 16,
      changed: 0,
      unchanged: 16,
    });
    expect(second.value.matchups).toEqual({
      total: 84,
      changed: 0,
      unchanged: 84,
    });
    expect(second.value.league.id).toBe(first.value.league.id);

    const secondRows = await selectIngestedRows(first.value.league.id);
    expect(secondRows.teams).toHaveLength(12);
    expect(secondRows.members).toHaveLength(16);
    expect(secondRows.matchups).toHaveLength(84);
    expect(secondRows.teams[0].updatedAt.toISOString()).toBe(
      firstTeamUpdatedAt,
    );
  });

  it("updates changed normalized fields without creating duplicates", async () => {
    const providerLeagueId = `${marker}-95050-update`;
    const firstProvider = providerFor(leagueFixtureFor(providerLeagueId));

    const first = await syncCurrentLeague({
      db: handle.db,
      provider: firstProvider,
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;

    const changedFixture = leagueFixtureFor(providerLeagueId);
    changedFixture.teams[0].name = "Fixture Team 01 Renamed";
    const second = await syncCurrentLeague({
      db: handle.db,
      provider: providerFor(changedFixture),
      ref: fixtureRef(providerLeagueId),
      session: fixtureSession(),
    });

    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.league).toMatchObject({ changed: 0, unchanged: 1 });
    expect(second.value.teams).toEqual({
      total: 12,
      changed: 1,
      unchanged: 11,
    });
    expect(second.value.members).toEqual({
      total: 16,
      changed: 0,
      unchanged: 16,
    });
    expect(second.value.matchups).toEqual({
      total: 84,
      changed: 0,
      unchanged: 84,
    });

    const rows = await selectIngestedRows(first.value.league.id);
    expect(rows.teams).toHaveLength(12);
    expect(rows.teams[0]).toMatchObject({
      providerTeamId: "1",
      name: "Fixture Team 01 Renamed",
    });
  });
});
