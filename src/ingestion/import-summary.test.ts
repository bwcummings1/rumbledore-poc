// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyTeams,
  identityMappings,
  leagues,
  persons,
  teamSeasons,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { loadImportSummaryData } from "./import-summary";

const marker = `summarytest-${randomUUID()}`;
let handle: DbHandle;

async function seedLeague(providerLeagueId: string, name: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name,
      provider: "espn",
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 1,
      sport: "ffl",
      status: "in_season",
    })
    .returning();
  if (!league) {
    throw new Error("summary test league was not created");
  }
  return league;
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
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("loadImportSummaryData", () => {
  it("scopes the persons listing to the target league", async () => {
    const target = await seedLeague(`${marker}-target`, "Target League");
    const fixture = await seedLeague(`${marker}-fixture`, "Fixture League");

    await withLeagueContext(handle.db, target.id, async (tx) => {
      const [person] = await tx
        .insert(persons)
        .values({
          canonicalName: "Real Manager",
          leagueId: target.id,
        })
        .returning({ id: persons.id });
      const [team] = await tx
        .insert(fantasyTeams)
        .values({
          abbrev: "RLM",
          contentHash: `${marker}-target-team`,
          leagueId: target.id,
          leagueProviderId: target.providerLeagueId,
          losses: 0,
          name: "Real Team",
          ownerMemberIds: ["real-member"],
          pointsAgainst: 0,
          pointsFor: 0,
          provider: "espn",
          providerTeamId: "1",
          season: 2026,
          ties: 0,
          wins: 0,
        })
        .returning({ id: fantasyTeams.id });
      if (!person || !team) {
        throw new Error("summary target rows were not created");
      }
      const [teamSeason] = await tx
        .insert(teamSeasons)
        .values({
          fantasyTeamId: team.id,
          leagueId: target.id,
          leagueProviderId: target.providerLeagueId,
          ownerMemberIds: ["real-member"],
          ownerNames: ["Real Manager"],
          provider: "espn",
          providerTeamId: "1",
          season: 2026,
          teamName: "Real Team",
        })
        .returning({ id: teamSeasons.id });
      if (!teamSeason) {
        throw new Error("summary target team season was not created");
      }
      await tx.insert(identityMappings).values({
        confidence: 1,
        leagueId: target.id,
        leagueProviderId: target.providerLeagueId,
        method: "auto",
        personId: person.id,
        provider: "espn",
        providerTeamId: "1",
        season: 2026,
        teamSeasonId: teamSeason.id,
      });
    });

    await withLeagueContext(handle.db, fixture.id, async (tx) => {
      await tx.insert(persons).values({
        canonicalName: "Fixture Manager 01",
        leagueId: fixture.id,
      });
    });

    const summary = await loadImportSummaryData(handle.db, target.id);

    expect(summary.persons.map((person) => person.canonicalName)).toEqual([
      "Real Manager",
    ]);
    expect(summary.persons[0]).toMatchObject({
      mappedSeasons: [2026],
      ownerNames: ["Real Manager"],
      teamNames: ["Real Team"],
    });
    expect(summary.identityMappings).toBe(1);
    expect(summary.integrityChecks).toEqual([]);
    expect(summary.recordCounts).toEqual({
      allTimeRecords: 0,
      recordBookAllTimeStandings: 0,
      recordBookMilestones: 0,
    });
    expect(summary.singleWeekRecord).toBeNull();
    expect(summary.spanRows).toEqual([
      { count: 0, maxScore: 0, season: 2011 },
      { count: 0, maxScore: 0, season: 2012 },
    ]);
    expect(summary.teamSeasons).toBe(1);

    const fixtureSummary = await loadImportSummaryData(handle.db, fixture.id);
    expect(
      fixtureSummary.persons.map((person) => person.canonicalName),
    ).toEqual(["Fixture Manager 01"]);
  });
});
