// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLeagueRecordsPageData } from "@/app/leagues/[leagueId]/records/records-page-data";
import { type EntitlementsConfig, parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  leagueGroupingSeasons,
  leagueSeasonGroupings,
  leagueSeasonSettings,
  leagues,
  loreClaims,
  members,
  userEntitlements,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  applyCuratedDataEdit,
  createCurationCheckpoint,
  getLeagueCanonRecordsContext,
  pushAllCurationSeasons,
  type RecordsCatalog,
  recomputeLeagueStatistics,
} from "@/stats";
import { forgeCanonCatalogForTest } from "@/testing/canon";
import {
  getPersonalAgentAnswer,
  getPersonalAgentBriefing,
  type PersonalAgentBriefingInput,
} from "./personal-agent";

const marker = `personal-agent-${randomUUID()}`;
const now = new Date("2026-06-15T12:00:00.000Z");
const DEFAULT_CAPS = {
  aiPostsPerWeek: 25,
  individualLeaguesCovered: 10,
  maxPremiumLeaguesPerUser: null,
} satisfies EntitlementsConfig["caps"];

let handle: DbHandle;

function entitlementEnv(
  overrides: Omit<Partial<EntitlementsConfig>, "caps"> & {
    caps?: Partial<EntitlementsConfig["caps"]>;
  } = {},
): PersonalAgentBriefingInput["env"] {
  return {
    entitlements: {
      caps: { ...DEFAULT_CAPS, ...overrides.caps },
      devOverride: overrides.devOverride ?? false,
      gateArenaAdvanced: overrides.gateArenaAdvanced ?? false,
    },
  };
}

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `Personal Agent ${tag}`,
      email: `${marker}-${tag}@example.test`,
    })
    .returning({ id: users.id });
  if (!user) throw new Error(`failed to seed ${tag} user`);
  return user;
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: `Personal Agent ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
      season: 2026,
    })
    .returning({ id: leagues.id });
  if (!league) throw new Error(`failed to seed ${tag} league`);
  return league;
}

async function seedEngineBackedAnswerLeague(tag: string) {
  const providerLeagueId = `${marker}-${tag}`;
  const leagueName = `Personal Agent Records ${tag}`;
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 2,
      name: leagueName,
      provider: "espn",
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2025,
      size: 2,
      sport: "ffl",
      status: "complete",
    })
    .returning({ id: leagues.id });
  if (!league) {
    throw new Error(`failed to seed ${tag} records league`);
  }

  const seeded = await withLeagueContext(handle.db, league.id, async (tx) => {
    await tx.insert(leagueSeasonSettings).values({
      contentHash: `${marker}-${tag}-settings-2025`,
      leagueId: league.id,
      leagueProviderId: providerLeagueId,
      playoffStartScoringPeriod: 15,
      provider: "espn",
      regularSeasonEndScoringPeriod: 14,
      scoringSettings: {
        format_type: "traditional",
        scoring_type: "H2H_POINTS",
      },
      season: 2025,
    });

    const teams = [
      {
        abbrev: "RLY",
        name: "Riley Rockets",
        ownerId: "owner-riley",
        ownerName: "Riley Rocket",
        providerTeamId: "1",
      },
      {
        abbrev: "MOR",
        name: "Morgan Meteors",
        ownerId: "owner-morgan",
        ownerName: "Morgan Meteor",
        providerTeamId: "2",
      },
    ];

    for (const team of teams) {
      await tx.insert(fantasyMembers).values({
        contentHash: `${marker}-${tag}-member-${team.ownerId}`,
        displayName: team.ownerName,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        provider: "espn",
        providerMemberId: team.ownerId,
        role: "member",
        season: 2025,
      });
      await tx.insert(fantasyTeams).values({
        abbrev: team.abbrev,
        contentHash: `${marker}-${tag}-team-${team.providerTeamId}`,
        leagueId: league.id,
        leagueProviderId: providerLeagueId,
        losses: 1,
        name: team.name,
        ownerMemberIds: [team.ownerId],
        pointsAgainst: team.providerTeamId === "1" ? 273 : 329.5,
        pointsFor: team.providerTeamId === "1" ? 328.5 : 274,
        provider: "espn",
        providerTeamId: team.providerTeamId,
        season: 2025,
        ties: 0,
        wins: 1,
      });
    }

    const insertedMatchups = await tx
      .insert(fantasyMatchups)
      .values([
        {
          awayScore: 122,
          awayTeamProviderId: "2",
          contentHash: `${marker}-${tag}-matchup-1`,
          homeScore: 188.5,
          homeTeamProviderId: "1",
          leagueId: league.id,
          leagueProviderId: providerLeagueId,
          provider: "espn",
          providerMatchupId: `${tag}-2025-1`,
          scoringPeriod: 1,
          season: 2025,
          status: "final",
          winner: "home",
        },
        {
          awayScore: 140,
          awayTeamProviderId: "1",
          contentHash: `${marker}-${tag}-matchup-2`,
          homeScore: 152,
          homeTeamProviderId: "2",
          leagueId: league.id,
          leagueProviderId: providerLeagueId,
          provider: "espn",
          providerMatchupId: `${tag}-2025-2`,
          scoringPeriod: 2,
          season: 2025,
          status: "final",
          winner: "home",
        },
      ])
      .returning({
        id: fantasyMatchups.id,
        scoringPeriod: fantasyMatchups.scoringPeriod,
      });
    const weekOneMatchup = insertedMatchups.find(
      (matchup) => matchup.scoringPeriod === 1,
    );
    if (!weekOneMatchup) {
      throw new Error("agent answer Week 1 matchup was not created");
    }

    const [era] = await tx
      .insert(leagueSeasonGroupings)
      .values({
        config: {
          format_type: "traditional",
          scoring_format: "H2H_POINTS",
        },
        kind: "era",
        leagueId: league.id,
        name: "Era 2",
        ordinal: 2,
        status: "confirmed",
      })
      .returning({ id: leagueSeasonGroupings.id });
    if (!era) {
      throw new Error("agent answer era grouping was not created");
    }
    await tx.insert(leagueGroupingSeasons).values({
      groupingId: era.id,
      leagueId: league.id,
      season: 2025,
    });

    await tx.insert(loreClaims).values({
      body: "Riley's Week 1 outburst is ratified as the clean-room scoring reference.",
      kind: "data_verifiable",
      leagueId: league.id,
      origin: "member",
      ratifiedAt: now,
      ratifiedBy: "verified",
      statement:
        "Riley's 2025 Week 1 score is the benchmark for this era's regular-season records.",
      status: "canon",
      title: "Riley Benchmark",
      verification: "verified",
    });

    return {
      groupingId: era.id,
      matchupId: weekOneMatchup.id,
    };
  });

  await recomputeLeagueStatistics(handle.db, { leagueId: league.id });
  const actor = await seedUser(`${tag}-curation-actor`);
  const checkpoint = await createCurationCheckpoint(handle.db, {
    actorUserId: actor.id,
    label: "agent answer pushed baseline",
    leagueId: league.id,
  });
  await pushAllCurationSeasons(handle.db, {
    actorUserId: actor.id,
    checkpointId: checkpoint.id,
    leagueId: league.id,
  });

  return {
    actorUserId: actor.id,
    groupingId: seeded.groupingId,
    leagueId: league.id,
    leagueName,
    matchupId: seeded.matchupId,
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
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("getPersonalAgentBriefing", () => {
  it("blocks users without individual entitlement before loading cross-league briefing data", async () => {
    const user = await seedUser("blocked");

    const result = await getPersonalAgentBriefing({
      db: handle.db,
      env: entitlementEnv(),
      loadLandingData: async () => {
        throw new Error("cross-league briefing data should not load");
      },
      now: () => now,
      userId: user.id,
    });

    expect(result).toMatchObject({
      entitlement: {
        allowed: false,
        reason: "TIER_REQUIRED",
        requiredTier: "individual",
        tier: "none",
      },
      status: "blocked",
    });
  });

  it("returns a capped cross-league briefing for individual users", async () => {
    const user = await seedUser("ready");
    const olderLeague = await seedLeague("older");
    const newerLeague = await seedLeague("newer");

    await handle.db.insert(members).values([
      {
        lastOpenedAt: new Date("2026-06-14T09:00:00.000Z"),
        organizationId: olderLeague.id,
        role: "member",
        userId: user.id,
      },
      {
        lastOpenedAt: new Date("2026-06-14T10:00:00.000Z"),
        organizationId: newerLeague.id,
        role: "member",
        userId: user.id,
      },
    ]);
    await handle.db.insert(userEntitlements).values({ userId: user.id });

    const result = await getPersonalAgentBriefing({
      db: handle.db,
      env: entitlementEnv({
        caps: { individualLeaguesCovered: 1 },
      }),
      now: () => now,
      userId: user.id,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("expected personal agent briefing to be ready");
    }
    expect(result.entitlement).toMatchObject({
      allowed: true,
      reason: "ENTITLED",
      requiredTier: "individual",
      tier: "individual",
    });
    expect(result.briefing).toMatchObject({
      capped: true,
      coveredLeagueCount: 1,
      generatedAt: now.toISOString(),
      leagueLimit: 1,
      totalLeagueCount: 2,
    });
    expect(result.briefing.leagues).toHaveLength(1);
    expect(result.briefing.leagues[0]).toMatchObject({
      latestPressTitle: null,
      leagueId: newerLeague.id,
      matchup: null,
      name: "Personal Agent newer",
      providerLabel: "ESPN",
    });
  });
});

function emptyCatalog(overrides: Partial<RecordsCatalog> = {}): RecordsCatalog {
  return {
    achievements: {
      highestScoringSeasons: [],
      longestWinStreaks: [],
      mostRegularSeasonTitles: [],
      mostRunnerUps: [],
      mostTitles: [],
      mostTopScoringWeeks: [],
    },
    allTimeStandings: [],
    blowouts: {
      biggest: [],
      biggestLosses: [],
      narrowestLosses: [],
      narrowestWins: [],
    },
    championships: {
      managerRecords: [],
      seasons: [],
    },
    headToHead: {
      allTimePairs: [],
      longestStreaks: [],
      managerLedgers: [],
      seasonPairs: [],
    },
    highLow: {
      bestScoresInLosses: [],
      highestCombinedMatchups: [],
      highestScores: [],
      lowestScores: [],
      worstScoresInWins: [],
    },
    integrityBlocked: false,
    lowlights: {
      biggestLosses: [],
      lowestScoringSeasons: [],
      mostBottomScoringWeeks: [],
      mostLastPlaceFinishes: [],
      narrowestLosses: [],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    milestones: {
      keeper: {
        entries: [],
        status: "unavailable",
        summary: null,
      },
    },
    playoff: {
      highestScoringAverages: [],
      highestScoringSeasons: [],
      lowestScoringSeasons: [],
      mostPointsAgainstSeasons: [],
      standings: [],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    regularSeason: {
      highestScoringAverages: [],
      highestScoringSeasons: [],
      lowestScoringSeasons: [],
      mostPointsAgainstSeasons: [],
      standings: [],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    streaks: {
      longestLosses: [],
      longestWins: [],
    },
    ...overrides,
  };
}

describe("getPersonalAgentAnswer", () => {
  it("blocks before loading curated league context when the individual gate is closed", async () => {
    const user = await seedUser("answer-blocked");

    const result = await getPersonalAgentAnswer({
      context: {
        leagueId: "00000000-0000-4000-8000-000000000041",
        pathname: "/leagues/00000000-0000-4000-8000-000000000041/records",
        scope: "league",
        sectionId: "records",
      },
      db: handle.db,
      env: entitlementEnv(),
      loadLeagueQuestionContext: async () => {
        throw new Error("curated context should not load");
      },
      now: () => now,
      question: "Who has the most playoff points in era 2?",
      userId: user.id,
    });

    expect(result).toMatchObject({
      entitlement: {
        allowed: false,
        reason: "TIER_REQUIRED",
      },
      status: "blocked",
    });
  });

  it("answers era and segment aware record questions from curated context", async () => {
    const user = await seedUser("answer-ready");
    const leagueId = "00000000-0000-4000-8000-000000000041";

    const result = await getPersonalAgentAnswer({
      context: {
        leagueId,
        pathname: `/leagues/${leagueId}/records`,
        scope: "league",
        sectionId: "records",
      },
      db: handle.db,
      env: entitlementEnv({ devOverride: true }),
      loadLeagueQuestionContext: async () => ({
        canonFacts: ["The Squyres Standard: playoff eruptions count as lore"],
        catalog: forgeCanonCatalogForTest(
          emptyCatalog({
            highLow: {
              bestScoresInLosses: [],
              highestCombinedMatchups: [],
              highestScores: [
                {
                  matchupId: "fixture-matchup",
                  opponentName: "Final Boss",
                  opponentPersonId: "person-opponent",
                  personId: "person-squyres",
                  personName: "Squyres18",
                  recordType: "highest_single_week_score",
                  scoringPeriod: 16,
                  season: 2022,
                  value: 247.5,
                },
              ],
              lowestScores: [],
              worstScoresInWins: [],
            },
          }),
        ),
        leagueId,
        leagueName: "Fixture League",
        lens: {
          grouping: {
            id: "era-two",
            name: "Era 2",
            ordinal: 2,
            seasons: [2020, 2021, 2022, 2023],
          },
          segment: "playoff",
        },
      }),
      now: () => now,
      question: "Who has the most playoff points in era 2?",
      userId: user.id,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("expected answer to be ready");
    }

    expect(result.entitlement).toMatchObject({
      allowed: true,
      reason: "DEV_OVERRIDE",
    });
    expect(result.answer).toMatchObject({
      generatedAt: now.toISOString(),
      scope: {
        kind: "league",
        leagueId,
        leagueName: "Fixture League",
        sectionId: "records",
      },
    });
    expect(result.answer.text).toContain("Squyres18");
    expect(result.answer.text).toContain("247.50");
    expect(result.answer.text).toContain("playoff score in Era 2");
    expect(result.answer.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: "segment=playoff; era=Era 2 (2020, 2021, 2022, 2023)",
          label: "Curated Record Book",
        }),
        expect.objectContaining({
          label: "Ratified canon checked",
        }),
      ]),
    );
  });

  it("answers a capped global question when no league context is selected", async () => {
    const user = await seedUser("answer-global");

    const result = await getPersonalAgentAnswer({
      context: {
        pathname: "/you",
        scope: "global",
        sectionId: "overview",
      },
      db: handle.db,
      env: entitlementEnv({
        caps: { individualLeaguesCovered: 2 },
        devOverride: true,
      }),
      loadLandingData: async () => ({
        leagues: [
          {
            href: "/leagues/league-alpha",
            latestPress: null,
            leagueId: "league-alpha",
            logo: null,
            matchup: null,
            name: "Alpha League",
            provider: "espn",
            providerLabel: "ESPN",
          },
          {
            href: "/leagues/league-beta",
            latestPress: null,
            leagueId: "league-beta",
            logo: null,
            matchup: null,
            name: "Beta League",
            provider: "sleeper",
            providerLabel: "Sleeper",
          },
          {
            href: "/leagues/league-gamma",
            latestPress: null,
            leagueId: "league-gamma",
            logo: null,
            matchup: null,
            name: "Gamma League",
            provider: "yahoo",
            providerLabel: "Yahoo",
          },
        ],
      }),
      now: () => now,
      question: "What should I look at first?",
      userId: user.id,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("expected global answer to be ready");
    }
    expect(result.answer.scope).toEqual({
      kind: "global",
      pathname: "/you",
      scope: "global",
      sectionId: "overview",
    });
    expect(result.answer.citations).toEqual([
      {
        detail: "2 covered of 3 connected leagues",
        href: "/you",
        label: "Personal briefing",
      },
    ]);
    expect(result.answer.text).toContain("Alpha League, Beta League");
    expect(result.answer.text).not.toContain("Gamma League");
    expect(result.answer.text).toContain("first 2 leagues by recency");
  });

  it("answers era and segment questions through the real engine-backed context loader", async () => {
    const user = await seedUser("answer-real-seam");
    await handle.db.insert(userEntitlements).values({ userId: user.id });
    const league = await seedEngineBackedAnswerLeague("answer-real-seam");
    const question = "Who has the most regular points in era 2?";

    const canonContext = await getLeagueCanonRecordsContext(handle.db, {
      leagueId: league.leagueId,
      lens: {
        groupingId: league.groupingId,
        segment: "regular",
      },
      limit: 5,
    });
    const canonLeader = canonContext.catalog.highLow.highestScores[0];
    if (!canonLeader) {
      throw new Error("expected real-seam canon catalog leader");
    }
    expect(canonLeader).toMatchObject({
      personName: "Riley Rockets (Riley Rocket)",
      scoringPeriod: 1,
      season: 2025,
      value: 188.5,
    });

    const result = await getPersonalAgentAnswer({
      context: {
        leagueId: league.leagueId,
        pathname: `/leagues/${league.leagueId}/records`,
        scope: "league",
        sectionId: "records",
      },
      db: handle.db,
      env: entitlementEnv(),
      now: () => now,
      question,
      userId: user.id,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("expected real-seam answer to be ready");
    }
    expect(result.entitlement).toMatchObject({
      allowed: true,
      reason: "ENTITLED",
    });
    expect(result.answer.scope).toMatchObject({
      kind: "league",
      leagueId: league.leagueId,
      leagueName: league.leagueName,
      sectionId: "records",
    });
    expect(result.answer.text).toContain(canonLeader.personName);
    expect(result.answer.text).toContain("188.50");
    expect(result.answer.text).toContain("top regular-season score in Era 2");
    expect(result.answer.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: "segment=regular-season; era=Era 2 (2025)",
          label: "Curated Record Book",
        }),
        expect.objectContaining({
          detail: "Era 2: 2025",
          label: "Confirmed era grouping",
        }),
        expect.objectContaining({
          label: "Ratified canon checked",
        }),
      ]),
    );
  });

  it("keeps unpushed score edits out of the Record Book and personal-agent canon", async () => {
    const user = await seedUser("answer-t9-replay");
    await handle.db.insert(userEntitlements).values({ userId: user.id });
    const league = await seedEngineBackedAnswerLeague("answer-t9-replay");

    await applyCuratedDataEdit(handle.db, {
      actorUserId: league.actorUserId,
      editClass: "substantive",
      field: "home_score",
      leagueId: league.leagueId,
      reason: "T9 replay saved but not pushed",
      targetId: league.matchupId,
      targetKind: "matchup",
      value: 240,
    });
    await createCurationCheckpoint(handle.db, {
      actorUserId: league.actorUserId,
      label: "saved unpushed T9 score edit",
      leagueId: league.leagueId,
    });

    const recordsPage = await getLeagueRecordsPageData(handle.db, {
      leagueId: league.leagueId,
      lens: {
        groupingId: league.groupingId,
        segment: "regular",
      },
    });
    expect(recordsPage.status).toBe("ready");
    if (recordsPage.status !== "ready") {
      throw new Error("expected records page data");
    }
    expect(recordsPage.data.catalog.highLow.highestScores[0]).toMatchObject({
      personName: "Riley Rockets (Riley Rocket)",
      season: 2025,
      value: 188.5,
    });

    const canonContext = await getLeagueCanonRecordsContext(handle.db, {
      leagueId: league.leagueId,
      lens: {
        groupingId: league.groupingId,
        segment: "regular",
      },
      limit: 5,
    });
    expect(canonContext.catalog.highLow.highestScores[0]).toMatchObject({
      personName: "Riley Rockets (Riley Rocket)",
      season: 2025,
      value: 188.5,
    });

    const result = await getPersonalAgentAnswer({
      context: {
        leagueId: league.leagueId,
        pathname: `/leagues/${league.leagueId}/records`,
        scope: "league",
        sectionId: "records",
      },
      db: handle.db,
      env: entitlementEnv(),
      now: () => now,
      question: "Who has the most regular points in era 2?",
      userId: user.id,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("expected T9 replay answer");
    }
    expect(result.answer.text).toContain("188.50");
    expect(result.answer.text).not.toContain("240");
  });
});
