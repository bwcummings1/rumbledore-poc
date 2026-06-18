// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type EntitlementsConfig, parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { leagues, members, userEntitlements, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { RecordsCatalog } from "@/stats";
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
    allTimeStandings: [],
    blowouts: {
      biggest: [],
      narrowestWins: [],
    },
    championships: {
      managerRecords: [],
      seasons: [],
    },
    headToHead: {
      allTimePairs: [],
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
    milestones: {
      keeper: {
        entries: [],
        status: "unavailable",
        summary: null,
      },
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
        catalog: emptyCatalog({
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
});
