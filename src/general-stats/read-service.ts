import { and, asc, eq, ilike, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  nflPlayers,
  nflPlayerWeekStats,
  nflSchedule,
  nflTeamStats,
} from "@/db/schema";
import type {
  EnrichedRosterFact,
  GeneralStatsPlayer,
  GeneralStatsPlayerWeekStats,
  GeneralStatsScheduleGame,
  GeneralStatsTeamBoxScore,
  LeagueRosterFactForEnrichment,
} from "./types";

function normalizeSource(value: string | undefined): string | undefined {
  const source = value?.trim();
  return source ? source : undefined;
}

function normalizeTeam(value: string): string {
  return value.trim().toUpperCase();
}

function sourceClause(source: string | undefined): SQL | undefined {
  return source ? eq(nflPlayers.source, source) : undefined;
}

function compactClauses(clauses: Array<SQL | undefined>): SQL | undefined {
  const filtered = clauses.filter((clause): clause is SQL => Boolean(clause));
  if (filtered.length === 0) {
    return undefined;
  }
  return and(...filtered);
}

function toPlayer(row: typeof nflPlayers.$inferSelect): GeneralStatsPlayer {
  return {
    fantasyProviderIds: row.fantasyProviderIds,
    fetchedAt: row.fetchedAt,
    fullName: row.fullName,
    id: row.id,
    position: row.position,
    source: row.source,
    sourcePlayerId: row.sourcePlayerId,
    team: row.team,
  };
}

function toScheduleGame(
  row: typeof nflSchedule.$inferSelect,
): GeneralStatsScheduleGame {
  return {
    awayScore: row.awayScore,
    awayTeam: row.awayTeam,
    fetchedAt: row.fetchedAt,
    gameTime: row.gameTime,
    homeScore: row.homeScore,
    homeTeam: row.homeTeam,
    id: row.id,
    season: row.season,
    source: row.source,
    sourceGameId: row.sourceGameId,
    status: row.status,
    week: row.week,
  };
}

function toTeamBoxScore(
  row: typeof nflTeamStats.$inferSelect,
): GeneralStatsTeamBoxScore {
  return {
    fetchedAt: row.fetchedAt,
    isHome: row.isHome,
    opponentTeam: row.opponentTeam,
    passingTouchdowns: row.passingTouchdowns,
    passingYards: row.passingYards,
    pointsAgainst: row.pointsAgainst,
    pointsFor: row.pointsFor,
    receivingTouchdowns: row.receivingTouchdowns,
    receivingYards: row.receivingYards,
    rushingTouchdowns: row.rushingTouchdowns,
    rushingYards: row.rushingYards,
    sacks: row.sacks,
    season: row.season,
    source: row.source,
    sourceGameId: row.sourceGameId,
    team: row.team,
    turnovers: row.turnovers,
    week: row.week,
  };
}

function toPlayerWeekStats(row: {
  player: typeof nflPlayers.$inferSelect;
  stat: typeof nflPlayerWeekStats.$inferSelect;
}): GeneralStatsPlayerWeekStats {
  return {
    fantasyPoints: row.stat.fantasyPoints,
    fetchedAt: row.stat.fetchedAt,
    interceptions: row.stat.interceptions,
    opponentTeam: row.stat.opponentTeam,
    passingTouchdowns: row.stat.passingTouchdowns,
    passingYards: row.stat.passingYards,
    player: toPlayer(row.player),
    receptions: row.stat.receptions,
    receivingTouchdowns: row.stat.receivingTouchdowns,
    receivingYards: row.stat.receivingYards,
    rushingTouchdowns: row.stat.rushingTouchdowns,
    rushingYards: row.stat.rushingYards,
    season: row.stat.season,
    source: row.stat.source,
    sourceGameId: row.stat.sourceGameId,
    targets: row.stat.targets,
    team: row.stat.team,
    week: row.stat.week,
  };
}

export async function findGeneralStatsPlayerBySourceId(
  db: Db,
  input: { source?: string; sourcePlayerId: string },
): Promise<GeneralStatsPlayer | null> {
  const source = normalizeSource(input.source);
  const [row] = await db
    .select()
    .from(nflPlayers)
    .where(
      compactClauses([
        sourceClause(source),
        eq(nflPlayers.sourcePlayerId, input.sourcePlayerId),
      ]),
    )
    .orderBy(asc(nflPlayers.source), asc(nflPlayers.fullName))
    .limit(1);
  return row ? toPlayer(row) : null;
}

export async function findGeneralStatsPlayerByFantasyProviderId(
  db: Db,
  input: { provider: string; providerPlayerId: string; source?: string },
): Promise<GeneralStatsPlayer | null> {
  const source = normalizeSource(input.source);
  const provider = input.provider.trim().toLowerCase();
  const providerPlayerId = input.providerPlayerId.trim();
  if (!provider || !providerPlayerId) {
    return null;
  }

  const [row] = await db
    .select()
    .from(nflPlayers)
    .where(
      compactClauses([
        sourceClause(source),
        sql`${nflPlayers.fantasyProviderIds}->>${provider} = ${providerPlayerId}`,
      ]),
    )
    .orderBy(asc(nflPlayers.source), asc(nflPlayers.fullName))
    .limit(1);
  return row ? toPlayer(row) : null;
}

export async function findGeneralStatsPlayersByName(
  db: Db,
  input: { limit?: number; name: string; source?: string },
): Promise<GeneralStatsPlayer[]> {
  const source = normalizeSource(input.source);
  const name = input.name.trim();
  if (!name) {
    return [];
  }

  const rows = await db
    .select()
    .from(nflPlayers)
    .where(
      compactClauses([
        sourceClause(source),
        ilike(nflPlayers.fullName, `%${name}%`),
      ]),
    )
    .orderBy(asc(nflPlayers.fullName), asc(nflPlayers.source))
    .limit(input.limit ?? 10);
  return rows.map(toPlayer);
}

export async function getGeneralStatsPlayerStats(
  db: Db,
  input: {
    season: number;
    source?: string;
    sourcePlayerId: string;
    week?: number;
  },
): Promise<GeneralStatsPlayerWeekStats[]> {
  const source = normalizeSource(input.source);
  const rows = await db
    .select({ player: nflPlayers, stat: nflPlayerWeekStats })
    .from(nflPlayerWeekStats)
    .innerJoin(nflPlayers, eq(nflPlayerWeekStats.playerId, nflPlayers.id))
    .where(
      compactClauses([
        source ? eq(nflPlayerWeekStats.source, source) : undefined,
        eq(nflPlayerWeekStats.sourcePlayerId, input.sourcePlayerId),
        eq(nflPlayerWeekStats.season, input.season),
        input.week ? eq(nflPlayerWeekStats.week, input.week) : undefined,
      ]),
    )
    .orderBy(asc(nflPlayerWeekStats.week));
  return rows.map(toPlayerWeekStats);
}

export async function getGeneralStatsTeamBoxScore(
  db: Db,
  input: { season: number; source?: string; team: string; week: number },
): Promise<GeneralStatsTeamBoxScore | null> {
  const source = normalizeSource(input.source);
  const team = normalizeTeam(input.team);
  const [row] = await db
    .select()
    .from(nflTeamStats)
    .where(
      compactClauses([
        source ? eq(nflTeamStats.source, source) : undefined,
        eq(nflTeamStats.season, input.season),
        eq(nflTeamStats.week, input.week),
        eq(nflTeamStats.team, team),
      ]),
    )
    .orderBy(asc(nflTeamStats.source))
    .limit(1);
  return row ? toTeamBoxScore(row) : null;
}

export async function getGeneralStatsSchedule(
  db: Db,
  input: { season: number; source?: string; team?: string; week?: number },
): Promise<GeneralStatsScheduleGame[]> {
  const source = normalizeSource(input.source);
  const team = input.team ? normalizeTeam(input.team) : undefined;
  const rows = await db
    .select()
    .from(nflSchedule)
    .where(
      compactClauses([
        source ? eq(nflSchedule.source, source) : undefined,
        eq(nflSchedule.season, input.season),
        input.week ? eq(nflSchedule.week, input.week) : undefined,
        team
          ? sql`(${nflSchedule.homeTeam} = ${team} OR ${nflSchedule.awayTeam} = ${team})`
          : undefined,
      ]),
    )
    .orderBy(asc(nflSchedule.week), asc(nflSchedule.gameTime));
  return rows.map(toScheduleGame);
}

export async function enrichLeagueRosterFactWithGeneralStats(
  db: Db,
  fact: LeagueRosterFactForEnrichment,
  options: { source?: string } = {},
): Promise<EnrichedRosterFact | null> {
  if (fact.provider && fact.providerPlayerId) {
    const byProvider = await findGeneralStatsPlayerByFantasyProviderId(db, {
      provider: fact.provider,
      providerPlayerId: fact.providerPlayerId,
      source: options.source,
    });
    if (byProvider) {
      return { confidence: "provider_id", original: fact, player: byProvider };
    }
  }

  if (!fact.playerName) {
    return null;
  }

  const candidates = await findGeneralStatsPlayersByName(db, {
    limit: 5,
    name: fact.playerName,
    source: options.source,
  });
  const team = fact.team ? normalizeTeam(fact.team) : undefined;
  const player = team
    ? (candidates.find((candidate) => candidate.team === team) ?? candidates[0])
    : candidates[0];

  return player ? { confidence: "name", original: fact, player } : null;
}
