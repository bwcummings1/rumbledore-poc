// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "./client";
import { withLeagueContext } from "./rls";
import {
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  leagues,
} from "./schema";
import { migrateSerialized } from "./test-support";

const marker = `domaintest-${randomUUID()}`;
let handle: DbHandle;

async function violatedConstraint(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint ?? String(cause ?? error);
  }
  throw new Error("expected the query to be rejected, but it succeeded");
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

describe("normalized fantasy domain schema", () => {
  it("stores league metadata plus normalized team, member, and matchup rows", async () => {
    const [league] = await handle.db
      .insert(leagues)
      .values({
        provider: "espn",
        providerLeagueId: `${marker}-95050`,
        name: "NHS Alumni Annual",
        season: 2026,
        sport: "ffl",
        scoringType: "H2H_POINTS",
        size: 12,
        currentScoringPeriod: 1,
        status: "in_season",
      })
      .returning();

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => {
      const [member] = await tx
        .insert(fantasyMembers)
        .values({
          leagueId: league.id,
          provider: "espn",
          providerMemberId: `${marker}-member-1`,
          leagueProviderId: league.providerLeagueId,
          season: 2026,
          displayName: "Fixture Manager",
          role: "commissioner",
          contentHash: `${marker}-member-hash`,
        })
        .returning();
      const [team] = await tx
        .insert(fantasyTeams)
        .values({
          leagueId: league.id,
          provider: "espn",
          providerTeamId: `${marker}-team-1`,
          leagueProviderId: league.providerLeagueId,
          season: 2026,
          name: "Fixture Team",
          abbrev: "FIX",
          ownerMemberIds: [member.providerMemberId],
          contentHash: `${marker}-team-hash`,
        })
        .returning();
      const [matchup] = await tx
        .insert(fantasyMatchups)
        .values({
          leagueId: league.id,
          provider: "espn",
          providerMatchupId: `${marker}-week-1-team-1-team-2`,
          leagueProviderId: league.providerLeagueId,
          season: 2026,
          scoringPeriod: 1,
          homeTeamProviderId: team.providerTeamId,
          awayTeamProviderId: `${marker}-team-2`,
          homeScore: 101.5,
          awayScore: 97.25,
          winner: "home",
          status: "final",
          contentHash: `${marker}-matchup-hash`,
        })
        .returning();
      return { matchup, member, team };
    });

    expect(league.sport).toBe("ffl");
    expect(league.scoringType).toBe("H2H_POINTS");
    expect(rows.team.ownerMemberIds).toEqual([rows.member.providerMemberId]);
    expect(rows.matchup.homeScore).toBe(101.5);
    expect(rows.matchup.winner).toBe("home");
  });

  it("enforces stable provider identities within a league season", async () => {
    const [league] = await handle.db
      .insert(leagues)
      .values({
        provider: "espn",
        providerLeagueId: `${marker}-dups`,
        name: "Duplicate identity test",
        season: 2026,
        sport: "ffl",
      })
      .returning();

    await withLeagueContext(handle.db, league.id, async (tx) => {
      await tx.insert(fantasyTeams).values({
        leagueId: league.id,
        provider: "espn",
        providerTeamId: "1",
        leagueProviderId: league.providerLeagueId,
        season: 2026,
        name: "One",
        contentHash: `${marker}-team-one`,
      });
    });

    expect(
      await violatedConstraint(
        withLeagueContext(handle.db, league.id, (tx) =>
          tx.insert(fantasyTeams).values({
            leagueId: league.id,
            provider: "espn",
            providerTeamId: "1",
            leagueProviderId: league.providerLeagueId,
            season: 2026,
            name: "Duplicate",
            contentHash: `${marker}-team-dup`,
          }),
        ),
      ),
    ).toBe("fantasy_teams_provider_identity_unique");

    await withLeagueContext(handle.db, league.id, async (tx) => {
      await tx.insert(fantasyTeams).values({
        leagueId: league.id,
        provider: "espn",
        providerTeamId: "1",
        leagueProviderId: league.providerLeagueId,
        season: 2025,
        name: "Prior Season",
        contentHash: `${marker}-team-prior`,
      });
    });
  });

  it("cascades tenant deletion to normalized domain rows", async () => {
    const [league] = await handle.db
      .insert(leagues)
      .values({
        provider: "espn",
        providerLeagueId: `${marker}-cascade`,
        name: "Cascade domain rows",
        season: 2026,
        sport: "ffl",
      })
      .returning();

    await withLeagueContext(handle.db, league.id, (tx) =>
      tx.insert(fantasyMembers).values({
        leagueId: league.id,
        provider: "espn",
        providerMemberId: `${marker}-cascade-member`,
        leagueProviderId: league.providerLeagueId,
        season: 2026,
        displayName: "Cascade Member",
        contentHash: `${marker}-cascade-hash`,
      }),
    );

    await handle.db.delete(leagues).where(eq(leagues.id, league.id));

    const survivors = await handle.db
      .select()
      .from(fantasyMembers)
      .where(eq(fantasyMembers.leagueId, league.id));
    expect(survivors).toHaveLength(0);
  });
});
