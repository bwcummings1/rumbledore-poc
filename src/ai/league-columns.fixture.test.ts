// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ENTITLEMENT_CAPS, parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  bettingEvents,
  bettingMarkets,
  contentItems,
  fantasyMatchups,
  fantasyMembers,
  fantasyPlayers,
  fantasyRosterEntries,
  fantasyTeams,
  fantasyTransactions,
  headToHeadRecords,
  leagueSeasonSettings,
  leagues,
  members,
  oddsSnapshots,
  persons,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { EntitlementResolverEnv } from "@/entitlements";
import { ingestMockGeneralStats } from "@/general-stats";
import {
  type ContentPlanCronCadence,
  planCronContent,
} from "@/jobs/content-planning";
import {
  buildPublicationFront,
  LEAGUE_EDITORIAL_IMPORTANCE_BASELINE,
  LEAGUE_EDITORIAL_IMPORTANCE_LEAD,
} from "@/news/front";
import { getLeagueFeedData } from "@/news/league-feed";
import type { NflWeekState } from "@/sports/nfl-calendar";
import leagueFixture from "../../test/fixtures/espn/league-95050-2026.json";
import { MockLlmClient } from "./mocks";
import { createMockAiDependencies, generateLeagueBlogPost } from "./pipeline";

const marker = `league-columns-fixture-${randomUUID()}`;
const providerLeagueId = `${marker}-fixture-espn-95050`;
let handle: DbHandle;

const openEntitlementEnv = {
  entitlements: {
    caps: DEFAULT_ENTITLEMENT_CAPS,
    devOverride: true,
    gateArenaAdvanced: false,
  },
} satisfies EntitlementResolverEnv;

const postGamesState = {
  gamePhase: "post_games",
  phase: "regular",
  seasonWeek: 1,
} as const satisfies NflWeekState;

const quietState = {
  gamePhase: "quiet",
  phase: "regular",
  seasonWeek: 1,
} as const satisfies NflWeekState;

const preKickoffState = {
  gamePhase: "pre_kickoff",
  phase: "regular",
  seasonWeek: 1,
} as const satisfies NflWeekState;

interface SimulatedColumnSlot {
  at: Date;
  cadence: ContentPlanCronCadence;
  columnId: string;
  state: NflWeekState;
}

const simulatedWeek: readonly SimulatedColumnSlot[] = [
  {
    at: new Date("2026-09-07T14:00:00.000Z"),
    cadence: "weekly-wrap",
    columnId: "the-wrap",
    state: postGamesState,
  },
  {
    at: new Date("2026-09-08T14:00:00.000Z"),
    cadence: "mid-week",
    columnId: "power-rankings-summary",
    state: postGamesState,
  },
  {
    at: new Date("2026-09-09T14:00:00.000Z"),
    cadence: "mid-week",
    columnId: "waiver-summary",
    state: quietState,
  },
  {
    at: new Date("2026-09-10T14:00:00.000Z"),
    cadence: "weekly-preview",
    columnId: "tale-of-the-tape",
    state: preKickoffState,
  },
  {
    at: new Date("2026-09-11T14:00:00.000Z"),
    cadence: "post-odds-refresh",
    columnId: "fantasy-friday",
    state: preKickoffState,
  },
  {
    at: new Date("2026-09-13T14:00:00.000Z"),
    cadence: "weekly-preview",
    columnId: "predictions",
    state: preKickoffState,
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function seedFixtureLeague(): Promise<{
  leagueId: string;
  teamNames: string[];
  userId: string;
}> {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: "League Column Fixture Reader",
      email: `${marker}@example.com`,
    })
    .returning({ id: users.id });
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: leagueFixture.settings.name,
      provider: "espn",
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season: leagueFixture.seasonId,
      size: leagueFixture.teams.length,
      sport: "ffl",
      status: "in_season",
    })
    .returning({ id: leagues.id });
  if (!user || !league) {
    throw new Error("fixture league reader or league was not inserted");
  }

  await handle.db.insert(members).values({
    organizationId: league.id,
    role: "member",
    userId: user.id,
  });

  await withLeagueContext(handle.db, league.id, async (tx) => {
    await tx.insert(fantasyMembers).values(
      leagueFixture.members.map((member) => ({
        contentHash: `${marker}-member-${member.id}`,
        displayName: member.displayName,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        provider: "espn" as const,
        providerMemberId: member.id,
        role: "member" as const,
        season: leagueFixture.seasonId,
      })),
    );
    await tx.insert(fantasyTeams).values(
      leagueFixture.teams.map((team) => ({
        abbrev: team.abbrev,
        contentHash: `${marker}-team-${team.id}`,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        losses: team.record.overall.losses,
        name: team.name,
        ownerMemberIds: team.owners,
        pointsAgainst: team.record.overall.pointsAgainst,
        pointsFor: team.record.overall.pointsFor,
        provider: "espn" as const,
        providerTeamId: String(team.id),
        season: leagueFixture.seasonId,
        ties: team.record.overall.ties,
        wins: team.record.overall.wins,
      })),
    );
    await tx.insert(fantasyMatchups).values(
      leagueFixture.schedule
        .filter(
          (matchup) =>
            matchup.matchupPeriodId === 1 &&
            matchup.home !== undefined &&
            matchup.away !== undefined,
        )
        .map((matchup) => ({
          awayScore: matchup.away?.totalPoints ?? 0,
          awayTeamProviderId: String(matchup.away?.teamId),
          contentHash: `${marker}-matchup-${matchup.id}`,
          homeScore: matchup.home?.totalPoints ?? 0,
          homeTeamProviderId: String(matchup.home?.teamId),
          leagueId: league.id,
          leagueProviderId: providerLeagueId,
          provider: "espn" as const,
          providerMatchupId: `${marker}-${matchup.id}`,
          scoringPeriod: 1,
          season: leagueFixture.seasonId,
          status: "in_progress" as const,
          winner: "unknown" as const,
        })),
    );
  });

  return {
    leagueId: league.id,
    teamNames: leagueFixture.teams.map((team) => team.name),
    userId: user.id,
  };
}

async function seedSimulatedWeekFacts(input: {
  leagueId: string;
}): Promise<void> {
  const [firstTeam, secondTeam] = leagueFixture.teams;
  if (!firstTeam || !secondTeam) {
    throw new Error("the ESPN fixture needs at least two teams");
  }

  await ingestMockGeneralStats(handle.db, {
    fetchedAt: new Date("2026-09-07T10:00:00.000Z"),
  });

  await withLeagueContext(handle.db, input.leagueId, async (tx) => {
    await tx.insert(leagueSeasonSettings).values({
      acquisitionBudget: 100,
      acquisitionType: "FREE_AGENT_BUDGET",
      contentHash: `${marker}-settings`,
      leagueId: input.leagueId,
      leagueProviderId: providerLeagueId,
      leagueSize: leagueFixture.teams.length,
      provider: "espn",
      season: leagueFixture.seasonId,
    });
    await tx.insert(fantasyPlayers).values([
      {
        contentHash: `${marker}-patrick-mahomes`,
        fullName: "Patrick Mahomes",
        leagueId: input.leagueId,
        leagueProviderId: providerLeagueId,
        position: "QB",
        proTeam: "KC",
        provider: "espn",
        providerPlayerId: "3139477",
      },
      {
        contentHash: `${marker}-justin-jefferson`,
        fullName: "Justin Jefferson",
        leagueId: input.leagueId,
        leagueProviderId: providerLeagueId,
        position: "WR",
        proTeam: "MIN",
        provider: "espn",
        providerPlayerId: "4262921",
      },
      {
        contentHash: `${marker}-waiver-player`,
        fullName: "Fixture Waiver Runner",
        leagueId: input.leagueId,
        leagueProviderId: providerLeagueId,
        position: "RB",
        proTeam: "KC",
        provider: "espn",
        providerPlayerId: `${marker}-waiver-player`,
      },
    ]);
    await tx.insert(fantasyRosterEntries).values([
      {
        contentHash: `${marker}-mahomes-projection`,
        leagueId: input.leagueId,
        leagueProviderId: providerLeagueId,
        metadata: { playerName: "Patrick Mahomes", proTeam: "KC" },
        projectedPoints: 24.5,
        provider: "espn",
        providerPlayerId: "3139477",
        providerTeamId: String(firstTeam.id),
        scoringPeriod: 1,
        season: leagueFixture.seasonId,
        slot: "QB",
        started: true,
        status: "active",
      },
      {
        contentHash: `${marker}-jefferson-projection`,
        leagueId: input.leagueId,
        leagueProviderId: providerLeagueId,
        metadata: { playerName: "Justin Jefferson", proTeam: "MIN" },
        projectedPoints: 19.75,
        provider: "espn",
        providerPlayerId: "4262921",
        providerTeamId: String(secondTeam.id),
        scoringPeriod: 1,
        season: leagueFixture.seasonId,
        slot: "WR",
        started: true,
        status: "active",
      },
    ]);
    await tx.insert(fantasyTransactions).values({
      contentHash: `${marker}-waiver`,
      details: { bidAmount: 17, status: "EXECUTED" },
      leagueId: input.leagueId,
      leagueProviderId: providerLeagueId,
      occurredAt: new Date("2026-09-09T08:00:00.000Z"),
      playerProviderIds: [`${marker}-waiver-player`],
      provider: "espn",
      providerTransactionId: `${marker}-waiver`,
      scoringPeriod: 1,
      season: leagueFixture.seasonId,
      teamProviderIds: [String(firstTeam.id)],
      type: "waiver",
    });

    const insertedPeople = await tx
      .insert(persons)
      .values([
        {
          canonicalName: "Fixture History Holder",
          leagueId: input.leagueId,
        },
        {
          canonicalName: "Fixture Rival",
          leagueId: input.leagueId,
        },
      ])
      .returning({ id: persons.id });
    const [recordHolder, rival] = insertedPeople;
    if (!recordHolder || !rival) {
      throw new Error("fixture history people were not inserted");
    }
    await tx.insert(allTimeRecords).values({
      holderPersonId: recordHolder.id,
      isCurrent: true,
      leagueId: input.leagueId,
      recordType: "highest_single_week_score",
      scoringPeriod: 9,
      season: 2024,
      value: 188.4,
    });
    await tx.insert(headToHeadRecords).values({
      leagueId: input.leagueId,
      meetings: 6,
      personAId: recordHolder.id,
      personBId: rival.id,
      season: leagueFixture.seasonId,
    });
  });

  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: "KC",
      contentHash: `${marker}-central-event`,
      homeTeam: "MIN",
      provider: marker,
      providerEventId: `${marker}-kc-min`,
      sport: "nfl",
      startTime: new Date("2026-09-10T00:20:00.000Z"),
      status: "final",
    })
    .returning({ id: bettingEvents.id });
  if (!event) {
    throw new Error("fixture central betting event was not inserted");
  }
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${marker}-central-market`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId: `${marker}-kc-min-moneyline`,
      status: "open",
      subject: "game",
      type: "moneyline",
    })
    .returning({ id: bettingMarkets.id });
  if (!market) {
    throw new Error("fixture central betting market was not inserted");
  }
  await handle.db.insert(oddsSnapshots).values([
    {
      capturedAt: new Date("2026-09-09T12:00:00.000Z"),
      homePrice: -140,
      marketId: market.id,
      provider: marker,
      sourcePayloadHash: `${marker}-opening-odds`,
    },
    {
      capturedAt: new Date("2026-09-10T12:00:00.000Z"),
      homePrice: -160,
      marketId: market.id,
      provider: marker,
      sourcePayloadHash: `${marker}-current-odds`,
    },
  ]);
}

function publishedEvidence(metadata: Record<string, unknown>) {
  const cadenceFrame = asRecord(metadata.cadenceFrame);
  return {
    columnFormat:
      typeof cadenceFrame.columnFormat === "string"
        ? cadenceFrame.columnFormat
        : null,
    contentType:
      typeof metadata.content_type === "string" ? metadata.content_type : null,
    editorialImportance:
      typeof metadata.editorialImportance === "number"
        ? metadata.editorialImportance
        : null,
    structure: asRecord(metadata.structure),
  };
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
    .delete(bettingEvents)
    .where(eq(bettingEvents.provider, marker));
  await handle.db
    .delete(leagues)
    .where(eq(leagues.providerLeagueId, providerLeagueId));
  await handle.db.delete(users).where(sql`${users.email} like ${`${marker}%`}`);
  await handle.pool.end();
});

describe("league column fixture week", () => {
  it("plans and publishes the six-column lineup from the committed ESPN fixture, then leads the Press with the rivalry signal", async () => {
    const fixture = await seedFixtureLeague();
    await seedSimulatedWeekFacts(fixture);
    const llm = new MockLlmClient();
    const baseDeps = {
      ...createMockAiDependencies(handle.db),
      duplicateThreshold: 1.1,
      llm,
    };

    const plannedColumnIds: string[] = [];
    for (const slot of simulatedWeek) {
      const plan = await planCronContent({
        cadence: slot.cadence,
        db: handle.db,
        env: openEntitlementEnv,
        nflWeekState: slot.state,
        now: () => slot.at,
      });
      expect(plan.column?.id).toBe(slot.columnId);
      if (plan.column) {
        plannedColumnIds.push(plan.column.id);
      }

      const fixtureEvents = plan.planned.filter(
        (event) => event.data.leagueId === fixture.leagueId,
      );
      expect(fixtureEvents.length).toBeGreaterThan(0);
      for (const event of fixtureEvents) {
        await expect(
          generateLeagueBlogPost({
            deps: { ...baseDeps, now: () => slot.at },
            input: event.data,
          }),
        ).resolves.toMatchObject({ reused: false, status: "published" });
      }
    }

    expect(plannedColumnIds).toEqual(
      simulatedWeek.map((slot) => slot.columnId),
    );

    const rows = await withLeagueContext(handle.db, fixture.leagueId, (tx) =>
      tx
        .select({
          id: contentItems.id,
          metadata: contentItems.metadata,
          publishedAt: contentItems.publishedAt,
          title: contentItems.title,
        })
        .from(contentItems)
        .where(eq(contentItems.leagueId, fixture.leagueId)),
    );
    const evidence = rows.map((row) => ({
      ...row,
      ...publishedEvidence(row.metadata),
    }));
    const requirePiece = (columnFormat: string, contentType: string) => {
      const piece = evidence.find(
        (candidate) =>
          candidate.columnFormat === columnFormat &&
          candidate.contentType === contentType,
      );
      if (!piece) {
        throw new Error(`missing ${columnFormat}/${contentType} fixture piece`);
      }
      return piece;
    };

    expect(new Set(evidence.map((piece) => piece.columnFormat))).toEqual(
      new Set(simulatedWeek.map((slot) => slot.columnId)),
    );
    expect(evidence).toHaveLength(8);

    const wrap = requirePiece("the-wrap", "weekly_recap");
    expect(asRecord(wrap.structure.mondayNightOutlook).matchups).toHaveLength(
      leagueFixture.schedule.filter((matchup) => matchup.matchupPeriodId === 1)
        .length,
    );

    const rankings = requirePiece("power-rankings-summary", "power_rankings");
    expect(rankings.structure.rankings).toHaveLength(
      leagueFixture.teams.length,
    );
    expect(
      requirePiece("power-rankings-summary", "weekly_recap").structure.type,
    ).toBe("weekly_recap");

    const waiver = requirePiece("waiver-summary", "transaction_reaction");
    expect(waiver.structure.waiverSummary).toMatchObject({
      fabBudget: 100,
      moves: [
        expect.objectContaining({
          fabRemaining: 83,
          fabSpent: 17,
          rosterChanges: ["Fixture Waiver Runner"],
          team: leagueFixture.teams[0]?.name,
        }),
      ],
    });

    const tale = requirePiece("tale-of-the-tape", "matchup_preview");
    expect(tale.structure.matchups).toHaveLength(
      leagueFixture.schedule.filter((matchup) => matchup.matchupPeriodId === 1)
        .length,
    );
    expect(tale.structure.matchups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyNumber: expect.stringContaining("Central"),
        }),
      ]),
    );

    const friday = requirePiece("fantasy-friday", "matchup_preview");
    expect(friday.structure.fantasyFriday).toMatchObject({
      flashback: {
        available: true,
        fact: expect.stringContaining("Fixture History Holder"),
        season: 2024,
      },
      oddsOrPercentageChanges: expect.arrayContaining([
        expect.objectContaining({
          matchup: "KC at MIN",
          unit: "implied_percentage",
        }),
      ]),
      thursdayNightSummaries: expect.arrayContaining([
        expect.objectContaining({ awayTeam: "KC", homeTeam: "MIN" }),
      ]),
    });

    const predictions = requirePiece("predictions", "matchup_preview");
    const predictionMatchups = predictions.structure.predictions;
    expect(asRecord(predictionMatchups).matchups).toHaveLength(
      leagueFixture.schedule.filter((matchup) => matchup.matchupPeriodId === 1)
        .length,
    );
    expect(asRecord(predictionMatchups).matchups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerPerformances: expect.arrayContaining([
            expect.objectContaining({
              player: "Patrick Mahomes",
              projectedPoints: 24.5,
            }),
          ]),
        }),
      ]),
    );

    const rivalry = requirePiece("tale-of-the-tape", "rivalry_piece");
    expect(rivalry.editorialImportance).toBe(LEAGUE_EDITORIAL_IMPORTANCE_LEAD);
    expect(predictions.editorialImportance).toBe(
      LEAGUE_EDITORIAL_IMPORTANCE_BASELINE,
    );
    expect(rivalry.publishedAt.getTime()).toBeLessThan(
      predictions.publishedAt.getTime(),
    );

    const feed = await getLeagueFeedData(handle.db, {
      leagueId: fixture.leagueId,
      limit: 20,
      userId: fixture.userId,
    });
    if (feed.status !== "ready") {
      throw new Error(`fixture Press feed was ${feed.status}`);
    }
    expect(buildPublicationFront(feed.data.items).lead?.contentItemId).toBe(
      rivalry.id,
    );
    expect(llm.requests).toHaveLength(8);
    expect(
      llm.requests.every(
        (request) =>
          request.context.league.id === fixture.leagueId &&
          request.context.league.name === leagueFixture.settings.name,
      ),
    ).toBe(true);
  });
});
