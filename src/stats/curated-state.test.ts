// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  identityMappings,
  leagueCurationCheckpoints,
  leagueCurationSeasonPushes,
  leagueDataEdits,
  leagueGroupingSeasons,
  leagueSeasonGroupings,
  leagueSeasonSettings,
  leagues,
  persons,
  teamSeasons,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  applyCuratedDataEdit,
  composeCanonicalSnapshot,
  createCurationCheckpoint,
  listCurationCheckpoints,
  pushAllCurationSeasons,
  pushCurationSeason,
  restoreCurationCheckpoint,
} from "./index";

const marker = `curated-${randomUUID()}`;
let handle: DbHandle;

interface SeededCuratedLeague {
  actorUserId: string;
  alicePersonId: string;
  aliceTeamSeasonBySeason: Map<number, string>;
  leagueId: string;
  providerLeagueId: string;
}

beforeAll(async () => {
  const env = parseEnv(process.env);
  handle = createDb(env.databaseUrl);
  await migrateSerialized(handle);
});

afterAll(async () => {
  await handle.pool.end();
});

async function seedActor(tag: string): Promise<string> {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `${marker} ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("actor was not created");
  }
  return user.id;
}

async function seedCuratedLeague(tag: string): Promise<SeededCuratedLeague> {
  const providerLeagueId = `${marker}-${tag}`;
  const actorUserId = await seedActor(`${tag}-actor`);
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 2,
      name: `${marker} ${tag}`,
      provider: "espn",
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2012,
      size: 2,
      sport: "ffl",
      status: "complete",
    })
    .returning({ id: leagues.id });
  if (!league) {
    throw new Error("league was not created");
  }

  const aliceTeamSeasonBySeason = new Map<number, string>();
  let alicePersonId = "";
  await withLeagueContext(handle.db, league.id, async (tx) => {
    const [alice] = await tx
      .insert(persons)
      .values({
        canonicalName: "Alice Real",
        leagueId: league.id,
      })
      .returning({ id: persons.id });
    const [bob] = await tx
      .insert(persons)
      .values({
        canonicalName: "Bob Real",
        leagueId: league.id,
      })
      .returning({ id: persons.id });
    if (!alice || !bob) {
      throw new Error("persons were not created");
    }
    alicePersonId = alice.id;

    for (const season of [2011, 2012]) {
      await tx.insert(leagueSeasonSettings).values({
        championshipScoringPeriod: 2,
        contentHash: `${marker}-${tag}-settings-${season}`,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        leagueSize: 2,
        matchupPeriodCount: 2,
        playoffStartScoringPeriod: 2,
        playoffTeamCount: 2,
        provider: "espn",
        regularSeasonEndScoringPeriod: 1,
        season,
      });

      for (const team of [
        {
          ownerId: "owner-alice",
          ownerName: "Alice Real",
          personId: alice.id,
          providerTeamId: "1",
          teamName: `Alice ${season}`,
        },
        {
          ownerId: "owner-bob",
          ownerName: "Bob Real",
          personId: bob.id,
          providerTeamId: "2",
          teamName: `Bob ${season}`,
        },
      ]) {
        await tx
          .insert(fantasyMembers)
          .values({
            contentHash: `${marker}-${tag}-${season}-${team.ownerId}`,
            displayName: team.ownerName,
            leagueId: league.id,
            leagueProviderId: providerLeagueId,
            provider: "espn",
            providerMemberId: team.ownerId,
            role: "member",
            season,
          })
          .onConflictDoNothing();
        const [fantasyTeam] = await tx
          .insert(fantasyTeams)
          .values({
            abbrev: `T${team.providerTeamId}`,
            contentHash: `${marker}-${tag}-team-${season}-${team.providerTeamId}`,
            leagueId: league.id,
            leagueProviderId: providerLeagueId,
            losses: 0,
            name: team.teamName,
            ownerMemberIds: [team.ownerId],
            pointsAgainst: 0,
            pointsFor: 0,
            provider: "espn",
            providerTeamId: team.providerTeamId,
            season,
            ties: 0,
            wins: 0,
          })
          .returning({ id: fantasyTeams.id });
        if (!fantasyTeam) {
          throw new Error("fantasy team was not created");
        }
        const [teamSeason] = await tx
          .insert(teamSeasons)
          .values({
            fantasyTeamId: fantasyTeam.id,
            leagueId: league.id,
            leagueProviderId: providerLeagueId,
            ownerMemberIds: [team.ownerId],
            ownerNames: [team.ownerName],
            provider: "espn",
            providerTeamId: team.providerTeamId,
            season,
            teamName: team.teamName,
          })
          .returning({ id: teamSeasons.id });
        if (!teamSeason) {
          throw new Error("team season was not created");
        }
        await tx.insert(identityMappings).values({
          leagueId: league.id,
          leagueProviderId: providerLeagueId,
          method: "manual",
          personId: team.personId,
          provider: "espn",
          providerTeamId: team.providerTeamId,
          resolvedBy: actorUserId,
          season,
          teamSeasonId: teamSeason.id,
        });
        if (team.providerTeamId === "1") {
          aliceTeamSeasonBySeason.set(season, teamSeason.id);
        }
      }

      await tx.insert(fantasyMatchups).values({
        awayScore: season === 2011 ? 90 : 95,
        awayTeamProviderId: "2",
        contentHash: `${marker}-${tag}-matchup-${season}`,
        homeScore: season === 2011 ? 110 : 120,
        homeTeamProviderId: "1",
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        provider: "espn",
        providerMatchupId: `${season}-week-1`,
        scoringPeriod: 1,
        season,
        status: "final",
        winner: "home",
      });
    }
  });

  return {
    actorUserId,
    alicePersonId,
    aliceTeamSeasonBySeason,
    leagueId: league.id,
    providerLeagueId,
  };
}

async function teamNamesBySeason(
  leagueId: string,
): Promise<Map<number, string>> {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const rows = await tx
      .select({
        season: teamSeasons.season,
        teamName: teamSeasons.teamName,
      })
      .from(teamSeasons)
      .where(
        and(
          eq(teamSeasons.leagueId, leagueId),
          eq(teamSeasons.providerTeamId, "1"),
        ),
      )
      .orderBy(asc(teamSeasons.season));
    return new Map(rows.map((row) => [row.season, row.teamName]));
  });
}

async function personMappingsBySeason(
  leagueId: string,
): Promise<Map<number, { canonicalName: string; personId: string }>> {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const rows = await tx
      .select({
        canonicalName: persons.canonicalName,
        personId: identityMappings.personId,
        season: identityMappings.season,
      })
      .from(identityMappings)
      .innerJoin(persons, eq(persons.id, identityMappings.personId))
      .where(
        and(
          eq(identityMappings.leagueId, leagueId),
          eq(identityMappings.providerTeamId, "1"),
        ),
      )
      .orderBy(asc(identityMappings.season));
    return new Map(
      rows.map((row) => [
        row.season,
        { canonicalName: row.canonicalName, personId: row.personId },
      ]),
    );
  });
}

async function groupingById(
  leagueId: string,
  groupingId: string,
): Promise<{ name: string; seasons: number[]; status: string } | null> {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const [grouping] = await tx
      .select({
        name: leagueSeasonGroupings.name,
        status: leagueSeasonGroupings.status,
      })
      .from(leagueSeasonGroupings)
      .where(eq(leagueSeasonGroupings.id, groupingId))
      .limit(1);
    if (!grouping) {
      return null;
    }
    const seasons = await tx
      .select({ season: leagueGroupingSeasons.season })
      .from(leagueGroupingSeasons)
      .where(eq(leagueGroupingSeasons.groupingId, groupingId))
      .orderBy(asc(leagueGroupingSeasons.season));
    return {
      name: grouping.name,
      seasons: seasons.map((row) => row.season),
      status: grouping.status,
    };
  });
}

async function dataEditRows(leagueId: string) {
  return withLeagueContext(handle.db, leagueId, (tx) =>
    tx
      .select()
      .from(leagueDataEdits)
      .where(eq(leagueDataEdits.leagueId, leagueId))
      .orderBy(asc(leagueDataEdits.createdAt), asc(leagueDataEdits.id)),
  );
}

function composedTeamName(
  snapshot: Awaited<ReturnType<typeof composeCanonicalSnapshot>>,
  season: number,
): string | undefined {
  return snapshot.teamSeasons.find(
    (row) => row.snapshotSeason === season && row.providerTeamId === "1",
  )?.teamName;
}

describe("curated-state service", () => {
  it("applies real-name scopes with smart all-years default and this-year override", async () => {
    const seeded = await seedCuratedLeague("scope-person");

    const allYears = await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "canonical_name",
      leagueId: seeded.leagueId,
      targetId: seeded.alicePersonId,
      targetKind: "person",
      value: "Alice Canon",
    });
    expect(allYears.scope).toBe("all_years");

    let mappings = await personMappingsBySeason(seeded.leagueId);
    expect(mappings.get(2011)).toMatchObject({
      canonicalName: "Alice Canon",
      personId: seeded.alicePersonId,
    });
    expect(mappings.get(2012)).toMatchObject({
      canonicalName: "Alice Canon",
      personId: seeded.alicePersonId,
    });

    const oneYear = await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "canonical_name",
      leagueId: seeded.leagueId,
      scope: "this_year_only",
      season: 2012,
      targetId: seeded.alicePersonId,
      targetKind: "person",
      value: "Alice 2012 Only",
    });
    expect(oneYear.scope).toBe("this_year_only");

    mappings = await personMappingsBySeason(seeded.leagueId);
    expect(mappings.get(2011)).toMatchObject({
      canonicalName: "Alice Canon",
      personId: seeded.alicePersonId,
    });
    expect(mappings.get(2012)?.canonicalName).toBe("Alice 2012 Only");
    expect(mappings.get(2012)?.personId).not.toBe(seeded.alicePersonId);

    const ledger = await dataEditRows(seeded.leagueId);
    expect(ledger).toContainEqual(
      expect.objectContaining({
        afterValue: "Alice Canon",
        beforeValue: "Alice Real",
        field: "canonical_name",
        scope: "all_years",
        targetId: seeded.alicePersonId,
        targetKind: "person",
      }),
    );
    expect(ledger).toContainEqual(
      expect.objectContaining({
        field: "canonical_name",
        scope: "this_year_only",
        targetId: mappings.get(2012)?.personId,
        targetKind: "person",
      }),
    );
  });

  it("applies team-name scopes with smart this-year default and all-years override", async () => {
    const seeded = await seedCuratedLeague("scope-team");
    const team2012 = seeded.aliceTeamSeasonBySeason.get(2012);
    if (!team2012) {
      throw new Error("expected 2012 team season");
    }

    const thisYear = await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "team_name",
      leagueId: seeded.leagueId,
      targetId: team2012,
      targetKind: "team_season",
      value: "Alice 2012 Brand",
    });
    expect(thisYear.scope).toBe("this_year_only");
    await expect(teamNamesBySeason(seeded.leagueId)).resolves.toEqual(
      new Map([
        [2011, "Alice 2011"],
        [2012, "Alice 2012 Brand"],
      ]),
    );

    const allYears = await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "team_name",
      leagueId: seeded.leagueId,
      scope: "all_years",
      targetId: team2012,
      targetKind: "team_season",
      value: "Alice Dynasty",
    });
    expect(allYears.scope).toBe("all_years");
    expect(allYears.editIds).toHaveLength(2);
    await expect(teamNamesBySeason(seeded.leagueId)).resolves.toEqual(
      new Map([
        [2011, "Alice Dynasty"],
        [2012, "Alice Dynasty"],
      ]),
    );

    const ledger = await dataEditRows(seeded.leagueId);
    const allYearTeamEdits = ledger.filter(
      (row) => row.field === "team_name" && row.scope === "all_years",
    );
    expect(allYearTeamEdits).toHaveLength(2);
    expect(allYearTeamEdits.map((row) => row.beforeValue).sort()).toEqual([
      "Alice 2011",
      "Alice 2012 Brand",
    ]);
  });

  it("saves restorable checkpoints and retains all checkpoint rows", async () => {
    const seeded = await seedCuratedLeague("checkpoint-restore");
    const team2012 = seeded.aliceTeamSeasonBySeason.get(2012);
    if (!team2012) {
      throw new Error("expected 2012 team season");
    }

    const initial = await createCurationCheckpoint(handle.db, {
      actorUserId: seeded.actorUserId,
      label: "original",
      leagueId: seeded.leagueId,
    });
    await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "team_name",
      leagueId: seeded.leagueId,
      scope: "this_year_only",
      targetId: team2012,
      targetKind: "team_season",
      value: "Saved 2012",
    });
    const groupingId = await withLeagueContext(
      handle.db,
      seeded.leagueId,
      async (tx) => {
        const [grouping] = await tx
          .insert(leagueSeasonGroupings)
          .values({
            config: { format_type: "keeper" },
            confirmedByUserId: seeded.actorUserId,
            derivedFrom: { source: "test" },
            kind: "era",
            leagueId: seeded.leagueId,
            name: "Saved Era",
            ordinal: 1,
            status: "confirmed",
          })
          .returning({ id: leagueSeasonGroupings.id });
        if (!grouping) {
          throw new Error("grouping was not created");
        }
        await tx.insert(leagueGroupingSeasons).values([
          {
            groupingId: grouping.id,
            leagueId: seeded.leagueId,
            season: 2011,
          },
          {
            groupingId: grouping.id,
            leagueId: seeded.leagueId,
            season: 2012,
          },
        ]);
        return grouping.id;
      },
    );
    const saved = await createCurationCheckpoint(handle.db, {
      actorUserId: seeded.actorUserId,
      label: "saved 2012",
      leagueId: seeded.leagueId,
    });
    await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "team_name",
      leagueId: seeded.leagueId,
      scope: "this_year_only",
      targetId: team2012,
      targetKind: "team_season",
      value: "Wrong 2012",
    });
    await withLeagueContext(handle.db, seeded.leagueId, async (tx) => {
      await tx
        .update(leagueSeasonGroupings)
        .set({ name: "Wrong Era", status: "proposed" })
        .where(eq(leagueSeasonGroupings.id, groupingId));
      await tx
        .delete(leagueGroupingSeasons)
        .where(eq(leagueGroupingSeasons.groupingId, groupingId));
      await tx.insert(leagueGroupingSeasons).values({
        groupingId,
        leagueId: seeded.leagueId,
        season: 2012,
      });
    });
    await expect(teamNamesBySeason(seeded.leagueId)).resolves.toEqual(
      new Map([
        [2011, "Alice 2011"],
        [2012, "Wrong 2012"],
      ]),
    );

    const restored = await restoreCurationCheckpoint(handle.db, {
      actorUserId: seeded.actorUserId,
      checkpointId: saved.id,
      leagueId: seeded.leagueId,
      reason: "restore saved checkpoint",
    });
    expect(restored.id).toBe(saved.id);
    await expect(teamNamesBySeason(seeded.leagueId)).resolves.toEqual(
      new Map([
        [2011, "Alice 2011"],
        [2012, "Saved 2012"],
      ]),
    );
    await expect(groupingById(seeded.leagueId, groupingId)).resolves.toEqual({
      name: "Saved Era",
      seasons: [2011, 2012],
      status: "confirmed",
    });

    const checkpoints = await listCurationCheckpoints(handle.db, {
      leagueId: seeded.leagueId,
    });
    expect(checkpoints.map((checkpoint) => checkpoint.id)).toEqual([
      saved.id,
      initial.id,
    ]);

    const rlsRows = await handle.pool.query<{
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity
         from pg_class
        where relname = any($1::text[])
        order by relname`,
      [["league_curation_checkpoints", "league_curation_season_pushes"]],
    );
    expect(rlsRows.rows).toEqual([
      {
        relforcerowsecurity: true,
        relname: "league_curation_checkpoints",
        relrowsecurity: true,
      },
      {
        relforcerowsecurity: true,
        relname: "league_curation_season_pushes",
        relrowsecurity: true,
      },
    ]);

    await expect(
      withLeagueContext(handle.db, seeded.leagueId, (tx) =>
        tx
          .delete(leagueCurationCheckpoints)
          .where(eq(leagueCurationCheckpoints.id, saved.id)),
      ),
    ).rejects.toThrow();
  });

  it("pushes one season without orphaning previously pushed seasons", async () => {
    const seeded = await seedCuratedLeague("push-invariant");
    const team2012 = seeded.aliceTeamSeasonBySeason.get(2012);
    if (!team2012) {
      throw new Error("expected 2012 team season");
    }

    const initial = await createCurationCheckpoint(handle.db, {
      actorUserId: seeded.actorUserId,
      label: "initial",
      leagueId: seeded.leagueId,
    });
    await pushCurationSeason(handle.db, {
      actorUserId: seeded.actorUserId,
      checkpointId: initial.id,
      leagueId: seeded.leagueId,
      season: 2011,
    });
    let composed = await composeCanonicalSnapshot(handle.db, {
      leagueId: seeded.leagueId,
    });
    expect(composed.seasons).toEqual([2011]);
    expect(composedTeamName(composed, 2011)).toBe("Alice 2011");
    expect(composedTeamName(composed, 2012)).toBeUndefined();

    await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "team_name",
      leagueId: seeded.leagueId,
      scope: "this_year_only",
      targetId: team2012,
      targetKind: "team_season",
      value: "Pushed 2012",
    });
    const saved2012 = await createCurationCheckpoint(handle.db, {
      actorUserId: seeded.actorUserId,
      label: "2012 ready",
      leagueId: seeded.leagueId,
    });
    composed = await composeCanonicalSnapshot(handle.db, {
      leagueId: seeded.leagueId,
    });
    expect(composed.seasons).toEqual([2011]);
    expect(composedTeamName(composed, 2012)).toBeUndefined();

    await pushCurationSeason(handle.db, {
      actorUserId: seeded.actorUserId,
      checkpointId: saved2012.id,
      leagueId: seeded.leagueId,
      season: 2012,
    });
    composed = await composeCanonicalSnapshot(handle.db, {
      leagueId: seeded.leagueId,
    });
    expect(composed.seasons).toEqual([2011, 2012]);
    expect(composedTeamName(composed, 2011)).toBe("Alice 2011");
    expect(composedTeamName(composed, 2012)).toBe("Pushed 2012");

    await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "team_name",
      leagueId: seeded.leagueId,
      scope: "this_year_only",
      targetId: team2012,
      targetKind: "team_season",
      value: "Saved But Unpushed 2012",
    });
    await createCurationCheckpoint(handle.db, {
      actorUserId: seeded.actorUserId,
      label: "not pushed",
      leagueId: seeded.leagueId,
    });
    composed = await composeCanonicalSnapshot(handle.db, {
      leagueId: seeded.leagueId,
    });
    expect(composed.seasons).toEqual([2011, 2012]);
    expect(composedTeamName(composed, 2011)).toBe("Alice 2011");
    expect(composedTeamName(composed, 2012)).toBe("Pushed 2012");
  });

  it("pushAll promotes every season in the saved checkpoint composition", async () => {
    const seeded = await seedCuratedLeague("push-all");
    const team2011 = seeded.aliceTeamSeasonBySeason.get(2011);
    const team2012 = seeded.aliceTeamSeasonBySeason.get(2012);
    if (!team2011 || !team2012) {
      throw new Error("expected team seasons");
    }

    await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "team_name",
      leagueId: seeded.leagueId,
      scope: "this_year_only",
      targetId: team2011,
      targetKind: "team_season",
      value: "All 2011",
    });
    await applyCuratedDataEdit(handle.db, {
      actorUserId: seeded.actorUserId,
      editClass: "cosmetic",
      field: "team_name",
      leagueId: seeded.leagueId,
      scope: "this_year_only",
      targetId: team2012,
      targetKind: "team_season",
      value: "All 2012",
    });
    const checkpoint = await createCurationCheckpoint(handle.db, {
      actorUserId: seeded.actorUserId,
      label: "all ready",
      leagueId: seeded.leagueId,
    });
    const pushes = await pushAllCurationSeasons(handle.db, {
      actorUserId: seeded.actorUserId,
      checkpointId: checkpoint.id,
      leagueId: seeded.leagueId,
      reason: "all seasons verified",
    });
    expect(pushes.map((push) => push.season)).toEqual([2011, 2012]);

    const composed = await composeCanonicalSnapshot(handle.db, {
      leagueId: seeded.leagueId,
    });
    expect(composed.seasons).toEqual([2011, 2012]);
    expect(composed.latestPushes).toHaveLength(2);
    expect(composedTeamName(composed, 2011)).toBe("All 2011");
    expect(composedTeamName(composed, 2012)).toBe("All 2012");

    const pushRows = await withLeagueContext(handle.db, seeded.leagueId, (tx) =>
      tx
        .select()
        .from(leagueCurationSeasonPushes)
        .where(eq(leagueCurationSeasonPushes.leagueId, seeded.leagueId)),
    );
    expect(pushRows).toHaveLength(2);
  });
});
