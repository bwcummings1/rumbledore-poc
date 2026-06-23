import { z } from "zod";
import type {
  GeneralStatsFixture,
  GeneralStatsIntegrityCheck,
  GeneralStatsIntegrityCheckKey,
  GeneralStatsIntegritySummary,
} from "./types";

const teamCode = z.string().trim().min(1);
const sourceId = z.string().trim().min(1);
const season = z.number().int().min(1900).max(2200);
const week = z.number().int().min(1);
const nonnegativeCount = z.number().int().min(0);
const integerStat = z.number().int();

const playerSchema = z.object({
  fantasyProviderIds: z.record(z.string().trim().min(1), sourceId).default({}),
  fullName: z.string().trim().min(1),
  position: z.string().trim().min(1),
  sourcePlayerId: sourceId,
  team: teamCode,
});

const scheduleSchema = z
  .object({
    awayScore: nonnegativeCount.nullable(),
    awayTeam: teamCode,
    gameTime: z.string().datetime({ offset: true }),
    homeScore: nonnegativeCount.nullable(),
    homeTeam: teamCode,
    season,
    sourceGameId: sourceId,
    status: z.enum(["scheduled", "in_progress", "final"]),
    week,
  })
  .refine((game) => game.awayTeam !== game.homeTeam, {
    message: "awayTeam and homeTeam must differ",
    path: ["homeTeam"],
  });

const teamStatSchema = z
  .object({
    isHome: z.boolean(),
    opponentTeam: teamCode,
    passingTouchdowns: nonnegativeCount,
    passingYards: integerStat,
    pointsAgainst: nonnegativeCount,
    pointsFor: nonnegativeCount,
    receivingTouchdowns: nonnegativeCount,
    receivingYards: integerStat,
    rushingTouchdowns: nonnegativeCount,
    rushingYards: integerStat,
    sacks: nonnegativeCount,
    season,
    sourceGameId: sourceId,
    team: teamCode,
    turnovers: nonnegativeCount,
    week,
  })
  .refine((stat) => stat.team !== stat.opponentTeam, {
    message: "team and opponentTeam must differ",
    path: ["opponentTeam"],
  });

const playerWeekStatSchema = z
  .object({
    fantasyPoints: z.number(),
    interceptions: nonnegativeCount,
    opponentTeam: teamCode,
    passingTouchdowns: nonnegativeCount,
    passingYards: integerStat,
    receptions: nonnegativeCount,
    receivingTouchdowns: nonnegativeCount,
    receivingYards: integerStat,
    rushingTouchdowns: nonnegativeCount,
    rushingYards: integerStat,
    season,
    sourceGameId: sourceId,
    sourcePlayerId: sourceId,
    targets: nonnegativeCount,
    team: teamCode,
    week,
  })
  .refine((stat) => stat.team !== stat.opponentTeam, {
    message: "team and opponentTeam must differ",
    path: ["opponentTeam"],
  });

const fixtureSchema = z.object({
  playerWeekStats: z.array(playerWeekStatSchema),
  players: z.array(playerSchema),
  schedule: z.array(scheduleSchema),
  source: sourceId,
  teamStats: z.array(teamStatSchema),
});

export function parseGeneralStatsFixture(value: unknown): GeneralStatsFixture {
  return fixtureSchema.parse(value);
}

function check(
  key: GeneralStatsIntegrityCheckKey,
  status: GeneralStatsIntegrityCheck["status"],
  detail: Record<string, unknown>,
): GeneralStatsIntegrityCheck {
  return { detail, key, status };
}

function duplicated(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].sort();
}

function gameTeamKey(seasonValue: number, weekValue: number, team: string) {
  return `${seasonValue}:${weekValue}:${team}`;
}

export function runGeneralStatsIntegrityChecks(
  fixture: GeneralStatsFixture,
): GeneralStatsIntegritySummary {
  const checks: GeneralStatsIntegrityCheck[] = [];

  checks.push(
    check(
      "no_silent_empty",
      fixture.players.length > 0 &&
        fixture.schedule.length > 0 &&
        fixture.teamStats.length > 0 &&
        fixture.playerWeekStats.length > 0
        ? "pass"
        : "fail",
      {
        playerWeekStats: fixture.playerWeekStats.length,
        players: fixture.players.length,
        schedule: fixture.schedule.length,
        teamStats: fixture.teamStats.length,
      },
    ),
  );

  const duplicatePlayers = duplicated(
    fixture.players.map((player) => player.sourcePlayerId),
  );
  checks.push(
    check("unique_players", duplicatePlayers.length === 0 ? "pass" : "fail", {
      duplicatePlayers,
      players: fixture.players.length,
    }),
  );

  const duplicateGames = duplicated(
    fixture.schedule.map((game) => game.sourceGameId),
  );
  checks.push(
    check("unique_games", duplicateGames.length === 0 ? "pass" : "fail", {
      duplicateGames,
      games: fixture.schedule.length,
    }),
  );

  const scheduleByGameId = new Map(
    fixture.schedule.map((game) => [game.sourceGameId, game]),
  );
  const teamStatsByGameId = new Map<string, GeneralStatsFixture["teamStats"]>();
  for (const stat of fixture.teamStats) {
    const existing = teamStatsByGameId.get(stat.sourceGameId) ?? [];
    existing.push(stat);
    teamStatsByGameId.set(stat.sourceGameId, existing);
  }

  const missingTeamBoxes: string[] = [];
  const extraTeamBoxes: string[] = [];
  const mismatchedTeamBoxes: string[] = [];
  for (const game of fixture.schedule) {
    const rows = teamStatsByGameId.get(game.sourceGameId) ?? [];
    const teams = new Set(rows.map((row) => row.team));
    if (!teams.has(game.awayTeam) || !teams.has(game.homeTeam)) {
      missingTeamBoxes.push(game.sourceGameId);
      continue;
    }
    if (rows.length !== 2) {
      mismatchedTeamBoxes.push(game.sourceGameId);
      continue;
    }
    for (const row of rows) {
      const expectedOpponent =
        row.team === game.awayTeam ? game.homeTeam : game.awayTeam;
      const expectedHome = row.team === game.homeTeam;
      const expectedFor =
        row.team === game.awayTeam ? game.awayScore : game.homeScore;
      const expectedAgainst =
        row.team === game.awayTeam ? game.homeScore : game.awayScore;
      if (
        row.season !== game.season ||
        row.week !== game.week ||
        row.opponentTeam !== expectedOpponent ||
        row.isHome !== expectedHome ||
        (game.status === "final" &&
          (row.pointsFor !== expectedFor ||
            row.pointsAgainst !== expectedAgainst))
      ) {
        mismatchedTeamBoxes.push(game.sourceGameId);
        break;
      }
    }
  }
  for (const row of fixture.teamStats) {
    if (!scheduleByGameId.has(row.sourceGameId)) {
      extraTeamBoxes.push(row.sourceGameId);
    }
  }
  checks.push(
    check(
      "team_box_coverage",
      missingTeamBoxes.length === 0 &&
        extraTeamBoxes.length === 0 &&
        mismatchedTeamBoxes.length === 0
        ? "pass"
        : "fail",
      {
        extraTeamBoxes: [...new Set(extraTeamBoxes)].sort(),
        missingTeamBoxes,
        mismatchedTeamBoxes: [...new Set(mismatchedTeamBoxes)].sort(),
      },
    ),
  );

  const playerIds = new Set(
    fixture.players.map((player) => player.sourcePlayerId),
  );
  const duplicatePlayerWeekStats = duplicated(
    fixture.playerWeekStats.map(
      (stat) => `${stat.season}:${stat.week}:${stat.sourcePlayerId}`,
    ),
  );
  const missingPlayers = fixture.playerWeekStats
    .filter((stat) => !playerIds.has(stat.sourcePlayerId))
    .map((stat) => stat.sourcePlayerId);
  const missingGames = fixture.playerWeekStats
    .filter((stat) => !scheduleByGameId.has(stat.sourceGameId))
    .map((stat) => stat.sourceGameId);
  checks.push(
    check(
      "player_stat_references",
      duplicatePlayerWeekStats.length === 0 &&
        missingPlayers.length === 0 &&
        missingGames.length === 0
        ? "pass"
        : "fail",
      {
        duplicatePlayerWeekStats,
        missingGames: [...new Set(missingGames)].sort(),
        missingPlayers: [...new Set(missingPlayers)].sort(),
      },
    ),
  );

  const gameTeams = new Map<string, string>();
  for (const game of fixture.schedule) {
    gameTeams.set(
      gameTeamKey(game.season, game.week, game.awayTeam),
      game.homeTeam,
    );
    gameTeams.set(
      gameTeamKey(game.season, game.week, game.homeTeam),
      game.awayTeam,
    );
  }
  const misalignedPlayerStats = fixture.playerWeekStats
    .filter((stat) => {
      const game = scheduleByGameId.get(stat.sourceGameId);
      const expectedOpponent = gameTeams.get(
        gameTeamKey(stat.season, stat.week, stat.team),
      );
      return (
        !game ||
        game.season !== stat.season ||
        game.week !== stat.week ||
        expectedOpponent !== stat.opponentTeam
      );
    })
    .map(
      (stat) =>
        `${stat.sourcePlayerId}:${stat.season}:week-${stat.week}:${stat.sourceGameId}`,
    );
  checks.push(
    check(
      "player_stat_game_alignment",
      misalignedPlayerStats.length === 0 ? "pass" : "fail",
      { misalignedPlayerStats },
    ),
  );

  return {
    checks,
    ok: checks.every((entry) => entry.status === "pass"),
  };
}
