// @vitest-environment node
import { describe, expect, it } from "vitest";
import type {
  championshipRecords,
  headToHeadRecords,
  recordBookMilestones,
  seasonStatistics,
  weeklyStatistics,
} from "@/db/schema";
import { buildRecordsCatalog } from "./records-catalog";

type ChampionshipRow = typeof championshipRecords.$inferSelect;
type HeadToHeadRow = typeof headToHeadRecords.$inferSelect;
type MilestoneRow = typeof recordBookMilestones.$inferSelect;
type SeasonRow = typeof seasonStatistics.$inferSelect;
type WeeklyRow = typeof weeklyStatistics.$inferSelect;

const NOW = new Date("2026-06-16T00:00:00.000Z");
const LEAGUE_ID = "catalog-fixture-league";
const PEOPLE = {
  alpha: "person-alpha-shared",
  beta: "person-beta-shared",
  gamma: "person-gamma",
} as const;

const personNames = new Map<string, string>([
  [PEOPLE.alpha, "Alpha + Shared"],
  [PEOPLE.beta, "Beta + Shared"],
  [PEOPLE.gamma, "Gamma Solo"],
]);

function weeklyRow(
  input: Pick<
    WeeklyRow,
    | "matchupId"
    | "opponentPersonId"
    | "personId"
    | "pointsAgainst"
    | "pointsFor"
    | "result"
    | "scoringPeriod"
    | "season"
  > &
    Partial<
      Pick<
        WeeklyRow,
        | "isBottomScorer"
        | "isChampionship"
        | "isPlayoff"
        | "isTopScorer"
        | "matchupKind"
        | "weeklyRank"
      >
    >,
): WeeklyRow {
  return {
    createdAt: NOW,
    id: `weekly-${input.matchupId}-${input.personId}`,
    isBottomScorer: input.isBottomScorer ?? false,
    isChampionship: input.isChampionship ?? false,
    isPlayoff: input.isPlayoff ?? false,
    isTopScorer: input.isTopScorer ?? false,
    leagueId: LEAGUE_ID,
    margin: input.pointsFor - input.pointsAgainst,
    matchupId: input.matchupId,
    matchupKind: input.matchupKind ?? "head_to_head",
    opponentPersonId: input.opponentPersonId,
    personId: input.personId,
    pointsAgainst: input.pointsAgainst,
    pointsFor: input.pointsFor,
    result: input.result,
    scoringPeriod: input.scoringPeriod,
    season: input.season,
    teamSeasonId: `team-season-${input.season}-${input.personId}`,
    updatedAt: NOW,
    weeklyRank: input.weeklyRank ?? 1,
  };
}

function matchupRows(input: {
  isChampionship?: boolean;
  isPlayoff?: boolean;
  matchupId: string;
  personAId: string;
  personAScore: number;
  personBId: string;
  personBScore: number;
  scoringPeriod: number;
  season: number;
}): WeeklyRow[] {
  const aResult =
    input.personAScore > input.personBScore
      ? "win"
      : input.personAScore < input.personBScore
        ? "loss"
        : "tie";
  const bResult =
    input.personBScore > input.personAScore
      ? "win"
      : input.personBScore < input.personAScore
        ? "loss"
        : "tie";

  return [
    weeklyRow({
      isChampionship: input.isChampionship,
      isPlayoff: input.isPlayoff,
      matchupId: input.matchupId,
      opponentPersonId: input.personBId,
      personId: input.personAId,
      pointsAgainst: input.personBScore,
      pointsFor: input.personAScore,
      result: aResult,
      scoringPeriod: input.scoringPeriod,
      season: input.season,
    }),
    weeklyRow({
      isChampionship: input.isChampionship,
      isPlayoff: input.isPlayoff,
      matchupId: input.matchupId,
      opponentPersonId: input.personAId,
      personId: input.personBId,
      pointsAgainst: input.personAScore,
      pointsFor: input.personBScore,
      result: bResult,
      scoringPeriod: input.scoringPeriod,
      season: input.season,
    }),
  ];
}

function seasonRow(
  input: Pick<
    SeasonRow,
    | "finalPlacement"
    | "finalRank"
    | "losses"
    | "madeChampionship"
    | "madePlayoffs"
    | "personId"
    | "playoffSeed"
    | "pointsAgainst"
    | "pointsFor"
    | "season"
    | "ties"
    | "wins"
  > &
    Partial<
      Pick<
        SeasonRow,
        | "currentStreakLength"
        | "currentStreakType"
        | "divisionWinner"
        | "expectedWins"
        | "luck"
      >
    >,
): SeasonRow {
  const games = input.wins + input.losses + input.ties;
  const averageFor = games > 0 ? input.pointsFor / games : 0;
  const averageAgainst = games > 0 ? input.pointsAgainst / games : 0;

  return {
    allPlayLosses: input.losses,
    allPlayTies: input.ties,
    allPlayWins: input.wins,
    avgPointsAgainst: averageAgainst,
    avgPointsFor: averageFor,
    createdAt: NOW,
    currentStreakLength: input.currentStreakLength ?? 0,
    currentStreakType: input.currentStreakType ?? null,
    divisionWinner: input.divisionWinner ?? false,
    expectedWins: input.expectedWins ?? input.wins,
    finalPlacement: input.finalPlacement,
    finalRank: input.finalRank,
    highestScore: 0,
    id: `season-${input.season}-${input.personId}`,
    leagueId: LEAGUE_ID,
    lowestScore: 0,
    longestLossStreak: 0,
    longestWinStreak: 0,
    losses: input.losses,
    luck: input.luck ?? 0,
    madeChampionship: input.madeChampionship,
    madePlayoffs: input.madePlayoffs,
    medianPointsAgainst: averageAgainst,
    medianPointsFor: averageFor,
    personId: input.personId,
    playoffSeed: input.playoffSeed,
    pointDifferential: input.pointsFor - input.pointsAgainst,
    pointsAgainst: input.pointsAgainst,
    pointsFor: input.pointsFor,
    scoringStdDev: 0,
    season: input.season,
    ties: input.ties,
    updatedAt: NOW,
    winPercentage: games > 0 ? (input.wins + input.ties * 0.5) / games : 0,
    wins: input.wins,
  };
}

function h2hRow(
  input: Pick<
    HeadToHeadRow,
    | "championshipMeetings"
    | "currentStreakLength"
    | "currentStreakPersonId"
    | "lastScoringPeriod"
    | "lastSeason"
    | "longestStreakLength"
    | "longestStreakPersonId"
    | "meetings"
    | "personAHighestScore"
    | "personAId"
    | "personAPoints"
    | "personAWins"
    | "personBHighestScore"
    | "personBId"
    | "personBPoints"
    | "personBWins"
    | "playoffMeetings"
    | "season"
    | "ties"
  >,
): HeadToHeadRow {
  return {
    createdAt: NOW,
    id: `h2h-${input.season}-${input.personAId}-${input.personBId}`,
    leagueId: LEAGUE_ID,
    updatedAt: NOW,
    ...input,
  };
}

function championshipRow(
  input: Pick<
    ChampionshipRow,
    | "championPersonId"
    | "championshipScore"
    | "regularSeasonWinnerPersonId"
    | "runnerUpPersonId"
    | "runnerUpScore"
    | "season"
    | "thirdPlacePersonId"
  >,
): ChampionshipRow {
  return {
    createdAt: NOW,
    id: `championship-${input.season}`,
    leagueId: LEAGUE_ID,
    updatedAt: NOW,
    ...input,
  };
}

function milestoneRow(
  input: Pick<
    MilestoneRow,
    | "label"
    | "metadata"
    | "milestoneKey"
    | "milestoneType"
    | "personId"
    | "providerPlayerId"
    | "season"
    | "status"
    | "value"
  >,
): MilestoneRow {
  return {
    createdAt: NOW,
    id: `milestone-${input.milestoneKey}`,
    leagueId: LEAGUE_ID,
    updatedAt: NOW,
    ...input,
  };
}

function buildSeededCatalog() {
  const weeklyRows: WeeklyRow[] = [
    ...matchupRows({
      matchupId: "matchup-2024-1-alpha-beta",
      personAId: PEOPLE.alpha,
      personAScore: 120,
      personBId: PEOPLE.beta,
      personBScore: 110,
      scoringPeriod: 1,
      season: 2024,
    }),
    ...matchupRows({
      isChampionship: true,
      isPlayoff: true,
      matchupId: "matchup-2024-2-alpha-gamma-title",
      personAId: PEOPLE.alpha,
      personAScore: 140,
      personBId: PEOPLE.gamma,
      personBScore: 90,
      scoringPeriod: 2,
      season: 2024,
    }),
    ...matchupRows({
      matchupId: "matchup-2024-3-beta-gamma-tie",
      personAId: PEOPLE.beta,
      personAScore: 95,
      personBId: PEOPLE.gamma,
      personBScore: 95,
      scoringPeriod: 3,
      season: 2024,
    }),
    weeklyRow({
      matchupId: "matchup-2024-3-alpha-median",
      matchupKind: "median",
      opponentPersonId: null,
      personId: PEOPLE.alpha,
      pointsAgainst: 100,
      pointsFor: 115,
      result: "win",
      scoringPeriod: 3,
      season: 2024,
    }),
    ...matchupRows({
      matchupId: "matchup-2025-1-alpha-gamma",
      personAId: PEOPLE.alpha,
      personAScore: 100,
      personBId: PEOPLE.gamma,
      personBScore: 90,
      scoringPeriod: 1,
      season: 2025,
    }),
    ...matchupRows({
      matchupId: "matchup-2025-2-beta-gamma",
      personAId: PEOPLE.beta,
      personAScore: 100,
      personBId: PEOPLE.gamma,
      personBScore: 80,
      scoringPeriod: 2,
      season: 2025,
    }),
    ...matchupRows({
      isChampionship: true,
      isPlayoff: true,
      matchupId: "matchup-2025-3-beta-alpha-title",
      personAId: PEOPLE.beta,
      personAScore: 140,
      personBId: PEOPLE.alpha,
      personBScore: 130,
      scoringPeriod: 3,
      season: 2025,
    }),
  ];

  const seasonRows: SeasonRow[] = [
    seasonRow({
      currentStreakLength: 2,
      currentStreakType: "win",
      finalPlacement: "champ",
      finalRank: 1,
      losses: 0,
      madeChampionship: true,
      madePlayoffs: true,
      personId: PEOPLE.alpha,
      playoffSeed: 1,
      pointsAgainst: 200,
      pointsFor: 260,
      season: 2024,
      ties: 0,
      wins: 2,
    }),
    seasonRow({
      currentStreakLength: 1,
      currentStreakType: "tie",
      finalPlacement: "third",
      finalRank: 3,
      losses: 1,
      madeChampionship: false,
      madePlayoffs: true,
      personId: PEOPLE.beta,
      playoffSeed: 3,
      pointsAgainst: 215,
      pointsFor: 205,
      season: 2024,
      ties: 1,
      wins: 0,
    }),
    seasonRow({
      currentStreakLength: 1,
      currentStreakType: "tie",
      finalPlacement: "runner_up",
      finalRank: 2,
      losses: 1,
      madeChampionship: true,
      madePlayoffs: true,
      personId: PEOPLE.gamma,
      playoffSeed: 2,
      pointsAgainst: 235,
      pointsFor: 185,
      season: 2024,
      ties: 1,
      wins: 0,
    }),
    seasonRow({
      currentStreakLength: 1,
      currentStreakType: "loss",
      finalPlacement: "runner_up",
      finalRank: 2,
      losses: 1,
      madeChampionship: true,
      madePlayoffs: true,
      personId: PEOPLE.alpha,
      playoffSeed: 2,
      pointsAgainst: 230,
      pointsFor: 230,
      season: 2025,
      ties: 0,
      wins: 1,
    }),
    seasonRow({
      currentStreakLength: 2,
      currentStreakType: "win",
      finalPlacement: "champ",
      finalRank: 1,
      losses: 0,
      madeChampionship: true,
      madePlayoffs: true,
      personId: PEOPLE.beta,
      playoffSeed: 1,
      pointsAgainst: 210,
      pointsFor: 240,
      season: 2025,
      ties: 0,
      wins: 2,
    }),
    seasonRow({
      currentStreakLength: 2,
      currentStreakType: "loss",
      finalPlacement: "third",
      finalRank: 3,
      losses: 2,
      madeChampionship: false,
      madePlayoffs: true,
      personId: PEOPLE.gamma,
      playoffSeed: 3,
      pointsAgainst: 200,
      pointsFor: 170,
      season: 2025,
      ties: 0,
      wins: 0,
    }),
  ];

  const championshipRows: ChampionshipRow[] = [
    championshipRow({
      championPersonId: PEOPLE.alpha,
      championshipScore: 140,
      regularSeasonWinnerPersonId: PEOPLE.alpha,
      runnerUpPersonId: PEOPLE.gamma,
      runnerUpScore: 90,
      season: 2024,
      thirdPlacePersonId: PEOPLE.beta,
    }),
    championshipRow({
      championPersonId: PEOPLE.beta,
      championshipScore: 140,
      regularSeasonWinnerPersonId: PEOPLE.beta,
      runnerUpPersonId: PEOPLE.alpha,
      runnerUpScore: 130,
      season: 2025,
      thirdPlacePersonId: PEOPLE.gamma,
    }),
  ];

  const headToHeadRows: HeadToHeadRow[] = [
    h2hRow({
      championshipMeetings: 1,
      currentStreakLength: 1,
      currentStreakPersonId: PEOPLE.beta,
      lastScoringPeriod: 3,
      lastSeason: 2025,
      longestStreakLength: 1,
      longestStreakPersonId: PEOPLE.alpha,
      meetings: 2,
      personAHighestScore: 130,
      personAId: PEOPLE.alpha,
      personAPoints: 250,
      personAWins: 1,
      personBHighestScore: 140,
      personBId: PEOPLE.beta,
      personBPoints: 250,
      personBWins: 1,
      playoffMeetings: 1,
      season: 0,
      ties: 0,
    }),
    h2hRow({
      championshipMeetings: 0,
      currentStreakLength: 1,
      currentStreakPersonId: PEOPLE.beta,
      lastScoringPeriod: 2,
      lastSeason: 2025,
      longestStreakLength: 1,
      longestStreakPersonId: PEOPLE.beta,
      meetings: 2,
      personAHighestScore: 110,
      personAId: PEOPLE.beta,
      personAPoints: 210,
      personAWins: 1,
      personBHighestScore: 95,
      personBId: PEOPLE.gamma,
      personBPoints: 175,
      personBWins: 0,
      playoffMeetings: 0,
      season: 0,
      ties: 1,
    }),
    h2hRow({
      championshipMeetings: 1,
      currentStreakLength: 1,
      currentStreakPersonId: PEOPLE.beta,
      lastScoringPeriod: 3,
      lastSeason: 2025,
      longestStreakLength: 1,
      longestStreakPersonId: PEOPLE.beta,
      meetings: 1,
      personAHighestScore: 130,
      personAId: PEOPLE.alpha,
      personAPoints: 130,
      personAWins: 0,
      personBHighestScore: 140,
      personBId: PEOPLE.beta,
      personBPoints: 140,
      personBWins: 1,
      playoffMeetings: 1,
      season: 2025,
      ties: 0,
    }),
  ];

  const milestoneRows: MilestoneRow[] = [
    milestoneRow({
      label: "Keeper and dynasty signal available",
      metadata: { keeperRosterEntries: 5, seasons: [2024, 2025] },
      milestoneKey: "keeper_dynasty:support",
      milestoneType: "keeper_dynasty_support",
      personId: null,
      providerPlayerId: null,
      season: 2025,
      status: "available",
      value: 5,
    }),
    milestoneRow({
      label: "Alpha + Shared keeper seasons",
      metadata: { uniquePlayerSeasons: 3 },
      milestoneKey: `person:${PEOPLE.alpha}:keeper_count`,
      milestoneType: "keeper_count",
      personId: PEOPLE.alpha,
      providerPlayerId: null,
      season: null,
      status: "available",
      value: 3,
    }),
    milestoneRow({
      label: "Beta + Shared kept Anchor RB",
      metadata: { displayName: "Anchor RB", seasons: [2024, 2025] },
      milestoneKey: `person:${PEOPLE.beta}:longest_kept_player`,
      milestoneType: "longest_kept_player",
      personId: PEOPLE.beta,
      providerPlayerId: "player-anchor-rb",
      season: 2025,
      status: "available",
      value: 2,
    }),
    milestoneRow({
      label: "Keeper milestones unavailable",
      metadata: { reason: "provider_has_no_keeper_dynasty_signal" },
      milestoneKey: "keeper_dynasty:unavailable",
      milestoneType: "keeper_dynasty_support",
      personId: null,
      providerPlayerId: null,
      season: null,
      status: "unavailable",
      value: 0,
    }),
  ];

  return {
    catalog: buildRecordsCatalog({
      championshipRows,
      headToHeadRows,
      limit: 10,
      milestoneRows,
      personNames,
      seasonRows,
      weeklyRows,
    }),
    seasonRows,
  };
}

function sumSeasonRows(
  rows: readonly SeasonRow[],
  personId: string,
  key: "losses" | "pointsAgainst" | "pointsFor" | "ties" | "wins",
): number {
  return rows
    .filter((row) => row.personId === personId)
    .reduce((sum, row) => sum + row[key], 0);
}

describe("buildRecordsCatalog", () => {
  it("aggregates the seeded multi-season fixture into every catalog section", () => {
    const { catalog, seasonRows } = buildSeededCatalog();

    expect(catalog.integrityBlocked).toBe(false);
    expect(catalog.allTimeStandings.map((row) => row.personId)).toEqual([
      PEOPLE.alpha,
      PEOPLE.beta,
      PEOPLE.gamma,
    ]);

    const alphaStanding = catalog.allTimeStandings.find(
      (row) => row.personId === PEOPLE.alpha,
    );
    expect(alphaStanding).toMatchObject({
      championships: 1,
      games: 4,
      losses: 1,
      madeChampionships: 2,
      personName: "Alpha + Shared",
      playoffAppearances: 2,
      pointsAgainst: 430,
      pointsFor: 490,
      rank: 1,
      regularSeasonTitles: 1,
      runnerUps: 1,
      ties: 0,
      winPercentage: 0.75,
      wins: 3,
    });
    expect(alphaStanding?.wins).toBe(
      sumSeasonRows(seasonRows, PEOPLE.alpha, "wins"),
    );
    expect(alphaStanding?.pointsFor).toBe(
      sumSeasonRows(seasonRows, PEOPLE.alpha, "pointsFor"),
    );
    expect(alphaStanding?.bestSeason).toMatchObject({
      finalPlacement: "champ",
      season: 2024,
      wins: 2,
    });

    expect(catalog.highLow.highestScores.slice(0, 2)).toEqual([
      expect.objectContaining({
        personId: PEOPLE.alpha,
        scoringPeriod: 2,
        season: 2024,
        value: 140,
      }),
      expect.objectContaining({
        personId: PEOPLE.beta,
        scoringPeriod: 3,
        season: 2025,
        value: 140,
      }),
    ]);
    expect(catalog.highLow.bestScoresInLosses[0]).toMatchObject({
      opponentPersonId: PEOPLE.beta,
      personId: PEOPLE.alpha,
      scoringPeriod: 3,
      season: 2025,
      value: 130,
    });
    expect(catalog.highLow.lowestScores[0]).toMatchObject({
      personId: PEOPLE.gamma,
      season: 2025,
      value: 80,
    });
    expect(catalog.highLow.highestCombinedMatchups[0]).toMatchObject({
      matchupId: "matchup-2025-3-beta-alpha-title",
      personId: PEOPLE.beta,
      value: 270,
    });

    expect(catalog.blowouts.biggest[0]).toMatchObject({
      margin: 50,
      matchupId: "matchup-2024-2-alpha-gamma-title",
      personId: PEOPLE.alpha,
    });
    expect(catalog.blowouts.narrowestWins[0]).toMatchObject({
      margin: 10,
      matchupId: "matchup-2024-1-alpha-beta",
      personId: PEOPLE.alpha,
    });

    expect(catalog.streaks.longestWins[0]).toMatchObject({
      endScoringPeriod: 1,
      endSeason: 2025,
      length: 3,
      personId: PEOPLE.alpha,
      startScoringPeriod: 1,
      startSeason: 2024,
    });
    expect(catalog.streaks.longestWins[0]?.length).not.toBe(4);

    expect(catalog.championships.seasons).toEqual([
      expect.objectContaining({
        champion: { personId: PEOPLE.beta, personName: "Beta + Shared" },
        runnerUp: { personId: PEOPLE.alpha, personName: "Alpha + Shared" },
        season: 2025,
      }),
      expect.objectContaining({
        champion: { personId: PEOPLE.alpha, personName: "Alpha + Shared" },
        runnerUp: { personId: PEOPLE.gamma, personName: "Gamma Solo" },
        season: 2024,
      }),
    ]);
    expect(
      catalog.championships.managerRecords.find(
        (row) => row.personId === PEOPLE.beta,
      ),
    ).toMatchObject({
      championshipGameWins: 1,
      championships: 1,
      playoffAppearances: 2,
      regularSeasonTitles: 1,
      thirdPlaces: 1,
    });

    expect(catalog.milestones.keeper).toMatchObject({
      status: "available",
      summary: "3 keeper milestones materialized",
    });
    expect(catalog.milestones.keeper.entries.map((row) => row.value)).toEqual([
      5, 3, 2,
    ]);
    expect(catalog.milestones.keeper.entries).toContainEqual(
      expect.objectContaining({
        label: "Beta + Shared kept Anchor RB",
        milestoneType: "longest_kept_player",
        personId: PEOPLE.beta,
        value: 2,
      }),
    );
  });

  it("keeps co-owner identities separate and mirrors H2H ledgers across tied series", () => {
    const { catalog } = buildSeededCatalog();

    expect(catalog.allTimeStandings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId: PEOPLE.alpha,
          personName: "Alpha + Shared",
        }),
        expect.objectContaining({
          personId: PEOPLE.beta,
          personName: "Beta + Shared",
        }),
      ]),
    );

    const alphaBeta = catalog.headToHead.allTimePairs.find(
      (row) =>
        row.personA.personId === PEOPLE.alpha &&
        row.personB.personId === PEOPLE.beta,
    );
    expect(alphaBeta).toMatchObject({
      championshipMeetings: 1,
      meetings: 2,
      personA: expect.objectContaining({
        losses: 1,
        points: 250,
        wins: 1,
      }),
      personB: expect.objectContaining({
        losses: 1,
        points: 250,
        wins: 1,
      }),
      playoffMeetings: 1,
      ties: 0,
    });

    const alphaLedger = catalog.headToHead.managerLedgers.find(
      (row) =>
        row.season === 0 &&
        row.personId === PEOPLE.alpha &&
        row.opponentPersonId === PEOPLE.beta,
    );
    const betaLedger = catalog.headToHead.managerLedgers.find(
      (row) =>
        row.season === 0 &&
        row.personId === PEOPLE.beta &&
        row.opponentPersonId === PEOPLE.alpha,
    );
    expect(alphaLedger).toMatchObject({
      losses: 1,
      pointsAgainst: 250,
      pointsFor: 250,
      wins: 1,
    });
    expect(betaLedger).toMatchObject({
      losses: alphaLedger?.wins,
      pointsAgainst: alphaLedger?.pointsFor,
      pointsFor: alphaLedger?.pointsAgainst,
      wins: alphaLedger?.losses,
    });

    const betaGamma = catalog.headToHead.allTimePairs.find(
      (row) =>
        row.personA.personId === PEOPLE.beta &&
        row.personB.personId === PEOPLE.gamma,
    );
    expect(betaGamma).toMatchObject({
      meetings: 2,
      personA: expect.objectContaining({ wins: 1 }),
      personB: expect.objectContaining({ wins: 0 }),
      ties: 1,
    });
    expect(betaGamma?.meetings).toBe(
      (betaGamma?.personA.wins ?? 0) +
        (betaGamma?.personB.wins ?? 0) +
        (betaGamma?.ties ?? 0),
    );
  });

  it("is deterministic when record values tie", () => {
    const first = buildSeededCatalog().catalog;
    const second = buildSeededCatalog().catalog;

    expect(second).toEqual(first);
    expect(first.highLow.highestScores.slice(0, 2)).toEqual([
      expect.objectContaining({
        personId: PEOPLE.alpha,
        scoringPeriod: 2,
        season: 2024,
        value: 140,
      }),
      expect.objectContaining({
        personId: PEOPLE.beta,
        scoringPeriod: 3,
        season: 2025,
        value: 140,
      }),
    ]);
  });
});
