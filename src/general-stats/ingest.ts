import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  nflPlayers,
  nflPlayerWeekStats,
  nflSchedule,
  nflTeamStats,
} from "@/db/schema";
import { stableContentHash } from "@/ingestion/hash";
import { loadMockGeneralStatsFixture } from "./mock-source";
import { runGeneralStatsIntegrityChecks } from "./source";
import type {
  GeneralStatsFixture,
  GeneralStatsIngestSummary,
  GeneralStatsIntegritySummary,
} from "./types";

export class GeneralStatsIntegrityError extends Error {
  constructor(public readonly summary: GeneralStatsIntegritySummary) {
    super(
      `General stats integrity failed: ${summary.checks
        .filter((check) => check.status === "fail")
        .map((check) => check.key)
        .join(", ")}`,
    );
    this.name = "GeneralStatsIntegrityError";
  }
}

export interface IngestGeneralStatsOptions {
  fetchedAt?: Date;
  fixture?: GeneralStatsFixture;
  /**
   * Records a successful source re-observation even when the fixture facts are
   * unchanged. Central generation uses this to prove its substrate was checked
   * at write time; ordinary reconciliation remains content-idempotent.
   */
  touchFetchedAt?: boolean;
}

function changed(total: number, changedRows: number) {
  return { changed: changedRows, total };
}

function playerHashPayload(
  source: string,
  player: GeneralStatsFixture["players"][number],
) {
  return {
    fantasyProviderIds: player.fantasyProviderIds,
    fullName: player.fullName,
    position: player.position,
    source,
    sourcePlayerId: player.sourcePlayerId,
    team: player.team,
  };
}

function scheduleHashPayload(
  source: string,
  game: GeneralStatsFixture["schedule"][number],
) {
  return {
    ...game,
    source,
  };
}

function teamStatHashPayload(
  source: string,
  stat: GeneralStatsFixture["teamStats"][number],
) {
  return {
    ...stat,
    source,
  };
}

function playerWeekStatHashPayload(
  source: string,
  stat: GeneralStatsFixture["playerWeekStats"][number],
) {
  return {
    ...stat,
    source,
  };
}

export async function ingestMockGeneralStats(
  db: Db,
  options: IngestGeneralStatsOptions = {},
): Promise<GeneralStatsIngestSummary> {
  const fixture = options.fixture ?? loadMockGeneralStatsFixture();
  const fetchedAt = options.fetchedAt ?? new Date();
  const integrity = runGeneralStatsIntegrityChecks(fixture);
  if (!integrity.ok) {
    throw new GeneralStatsIntegrityError(integrity);
  }

  const playerRows = fixture.players.map((player) => ({
    contentHash: stableContentHash(playerHashPayload(fixture.source, player)),
    fantasyProviderIds: player.fantasyProviderIds,
    fetchedAt,
    fullName: player.fullName,
    position: player.position,
    source: fixture.source,
    sourcePlayerId: player.sourcePlayerId,
    team: player.team,
  }));
  const changedPlayers = await db
    .insert(nflPlayers)
    .values(playerRows)
    .onConflictDoUpdate({
      target: [nflPlayers.source, nflPlayers.sourcePlayerId],
      set: {
        contentHash: sql`excluded.content_hash`,
        fantasyProviderIds: sql`excluded.fantasy_provider_ids`,
        fetchedAt: sql`excluded.fetched_at`,
        fullName: sql`excluded.full_name`,
        position: sql`excluded.position`,
        team: sql`excluded.team`,
        updatedAt: sql`now()`,
      },
      where: options.touchFetchedAt
        ? sql`${nflPlayers.contentHash} is distinct from excluded.content_hash OR ${nflPlayers.fetchedAt} is distinct from excluded.fetched_at`
        : sql`${nflPlayers.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: nflPlayers.id });

  const playerIds = fixture.players.map((player) => player.sourcePlayerId);
  const persistedPlayers = await db
    .select({
      id: nflPlayers.id,
      sourcePlayerId: nflPlayers.sourcePlayerId,
    })
    .from(nflPlayers)
    .where(
      and(
        eq(nflPlayers.source, fixture.source),
        inArray(nflPlayers.sourcePlayerId, playerIds),
      ),
    );
  const playerIdBySourceId = new Map(
    persistedPlayers.map((player) => [player.sourcePlayerId, player.id]),
  );

  const scheduleRows = fixture.schedule.map((game) => ({
    awayScore: game.awayScore,
    awayTeam: game.awayTeam,
    contentHash: stableContentHash(scheduleHashPayload(fixture.source, game)),
    fetchedAt,
    gameTime: new Date(game.gameTime),
    homeScore: game.homeScore,
    homeTeam: game.homeTeam,
    season: game.season,
    source: fixture.source,
    sourceGameId: game.sourceGameId,
    status: game.status,
    week: game.week,
  }));
  const changedSchedule = await db
    .insert(nflSchedule)
    .values(scheduleRows)
    .onConflictDoUpdate({
      target: [nflSchedule.source, nflSchedule.sourceGameId],
      set: {
        awayScore: sql`excluded.away_score`,
        awayTeam: sql`excluded.away_team`,
        contentHash: sql`excluded.content_hash`,
        fetchedAt: sql`excluded.fetched_at`,
        gameTime: sql`excluded.game_time`,
        homeScore: sql`excluded.home_score`,
        homeTeam: sql`excluded.home_team`,
        season: sql`excluded.season`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
        week: sql`excluded.week`,
      },
      where: options.touchFetchedAt
        ? sql`${nflSchedule.contentHash} is distinct from excluded.content_hash OR ${nflSchedule.fetchedAt} is distinct from excluded.fetched_at`
        : sql`${nflSchedule.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: nflSchedule.id });

  const teamRows = fixture.teamStats.map((stat) => ({
    contentHash: stableContentHash(teamStatHashPayload(fixture.source, stat)),
    fetchedAt,
    isHome: stat.isHome,
    opponentTeam: stat.opponentTeam,
    passingTouchdowns: stat.passingTouchdowns,
    passingYards: stat.passingYards,
    pointsAgainst: stat.pointsAgainst,
    pointsFor: stat.pointsFor,
    receivingTouchdowns: stat.receivingTouchdowns,
    receivingYards: stat.receivingYards,
    rushingTouchdowns: stat.rushingTouchdowns,
    rushingYards: stat.rushingYards,
    sacks: stat.sacks,
    season: stat.season,
    source: fixture.source,
    sourceGameId: stat.sourceGameId,
    team: stat.team,
    turnovers: stat.turnovers,
    week: stat.week,
  }));
  const changedTeamStats = await db
    .insert(nflTeamStats)
    .values(teamRows)
    .onConflictDoUpdate({
      target: [
        nflTeamStats.source,
        nflTeamStats.season,
        nflTeamStats.week,
        nflTeamStats.team,
      ],
      set: {
        contentHash: sql`excluded.content_hash`,
        fetchedAt: sql`excluded.fetched_at`,
        isHome: sql`excluded.is_home`,
        opponentTeam: sql`excluded.opponent_team`,
        passingTouchdowns: sql`excluded.passing_touchdowns`,
        passingYards: sql`excluded.passing_yards`,
        pointsAgainst: sql`excluded.points_against`,
        pointsFor: sql`excluded.points_for`,
        receivingTouchdowns: sql`excluded.receiving_touchdowns`,
        receivingYards: sql`excluded.receiving_yards`,
        rushingTouchdowns: sql`excluded.rushing_touchdowns`,
        rushingYards: sql`excluded.rushing_yards`,
        sacks: sql`excluded.sacks`,
        sourceGameId: sql`excluded.source_game_id`,
        turnovers: sql`excluded.turnovers`,
        updatedAt: sql`now()`,
      },
      where: options.touchFetchedAt
        ? sql`${nflTeamStats.contentHash} is distinct from excluded.content_hash OR ${nflTeamStats.fetchedAt} is distinct from excluded.fetched_at`
        : sql`${nflTeamStats.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: nflTeamStats.id });

  const playerWeekRows = fixture.playerWeekStats.map((stat) => {
    const playerId = playerIdBySourceId.get(stat.sourcePlayerId);
    if (!playerId) {
      throw new Error(
        `General stats player row was not persisted for ${stat.sourcePlayerId}`,
      );
    }
    return {
      contentHash: stableContentHash(
        playerWeekStatHashPayload(fixture.source, stat),
      ),
      fantasyPoints: stat.fantasyPoints,
      fetchedAt,
      interceptions: stat.interceptions,
      opponentTeam: stat.opponentTeam,
      passingTouchdowns: stat.passingTouchdowns,
      passingYards: stat.passingYards,
      playerId,
      receptions: stat.receptions,
      receivingTouchdowns: stat.receivingTouchdowns,
      receivingYards: stat.receivingYards,
      rushingTouchdowns: stat.rushingTouchdowns,
      rushingYards: stat.rushingYards,
      season: stat.season,
      source: fixture.source,
      sourceGameId: stat.sourceGameId,
      sourcePlayerId: stat.sourcePlayerId,
      targets: stat.targets,
      team: stat.team,
      week: stat.week,
    };
  });
  const changedPlayerWeekStats = await db
    .insert(nflPlayerWeekStats)
    .values(playerWeekRows)
    .onConflictDoUpdate({
      target: [
        nflPlayerWeekStats.source,
        nflPlayerWeekStats.season,
        nflPlayerWeekStats.week,
        nflPlayerWeekStats.sourcePlayerId,
      ],
      set: {
        contentHash: sql`excluded.content_hash`,
        fantasyPoints: sql`excluded.fantasy_points`,
        fetchedAt: sql`excluded.fetched_at`,
        interceptions: sql`excluded.interceptions`,
        opponentTeam: sql`excluded.opponent_team`,
        passingTouchdowns: sql`excluded.passing_touchdowns`,
        passingYards: sql`excluded.passing_yards`,
        playerId: sql`excluded.player_id`,
        receptions: sql`excluded.receptions`,
        receivingTouchdowns: sql`excluded.receiving_touchdowns`,
        receivingYards: sql`excluded.receiving_yards`,
        rushingTouchdowns: sql`excluded.rushing_touchdowns`,
        rushingYards: sql`excluded.rushing_yards`,
        sourceGameId: sql`excluded.source_game_id`,
        targets: sql`excluded.targets`,
        team: sql`excluded.team`,
        updatedAt: sql`now()`,
      },
      where: options.touchFetchedAt
        ? sql`${nflPlayerWeekStats.contentHash} is distinct from excluded.content_hash OR ${nflPlayerWeekStats.fetchedAt} is distinct from excluded.fetched_at`
        : sql`${nflPlayerWeekStats.contentHash} is distinct from excluded.content_hash`,
    })
    .returning({ id: nflPlayerWeekStats.id });

  return {
    fetchedAt,
    integrity,
    playerWeekStats: changed(
      playerWeekRows.length,
      changedPlayerWeekStats.length,
    ),
    players: changed(playerRows.length, changedPlayers.length),
    schedule: changed(scheduleRows.length, changedSchedule.length),
    source: fixture.source,
    teamStats: changed(teamRows.length, changedTeamStats.length),
  };
}
