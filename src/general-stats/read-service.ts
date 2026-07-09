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
  LeagueRosterGeneralStatsFact,
  LeagueRosterGeneralStatsSeasonTotals,
} from "./types";

function normalizeSource(value: string | undefined): string | undefined {
  const source = value?.trim();
  return source ? source : undefined;
}

function normalizeTeam(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 8;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 24);
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

function emptySeasonTotals(): LeagueRosterGeneralStatsSeasonTotals {
  return {
    fantasyPoints: 0,
    games: 0,
    interceptions: 0,
    passingTouchdowns: 0,
    passingYards: 0,
    receptions: 0,
    receivingTouchdowns: 0,
    receivingYards: 0,
    rushingTouchdowns: 0,
    rushingYards: 0,
    targets: 0,
  };
}

function seasonTotals(
  stats: readonly GeneralStatsPlayerWeekStats[],
): LeagueRosterGeneralStatsSeasonTotals {
  return stats.reduce((totals, stat) => {
    totals.fantasyPoints += stat.fantasyPoints;
    totals.games += 1;
    totals.interceptions += stat.interceptions;
    totals.passingTouchdowns += stat.passingTouchdowns;
    totals.passingYards += stat.passingYards;
    totals.receptions += stat.receptions;
    totals.receivingTouchdowns += stat.receivingTouchdowns;
    totals.receivingYards += stat.receivingYards;
    totals.rushingTouchdowns += stat.rushingTouchdowns;
    totals.rushingYards += stat.rushingYards;
    totals.targets += stat.targets;
    return totals;
  }, emptySeasonTotals());
}

function latestWeekFor(
  stats: readonly GeneralStatsPlayerWeekStats[],
  week: number | undefined,
): GeneralStatsPlayerWeekStats | null {
  if (stats.length === 0) {
    return null;
  }

  const sorted = [...stats].sort(
    (left, right) =>
      right.week - left.week ||
      left.player.fullName.localeCompare(right.player.fullName),
  );
  if (week === undefined || !Number.isFinite(week)) {
    return sorted[0] ?? null;
  }

  return (
    sorted.find((stat) => stat.week === week) ??
    sorted.find((stat) => stat.week <= week) ??
    sorted[0] ??
    null
  );
}

function scheduleWindow(
  games: readonly GeneralStatsScheduleGame[],
  week: number | undefined,
): GeneralStatsScheduleGame[] {
  const sorted = [...games].sort(
    (left, right) =>
      left.week - right.week ||
      left.gameTime.getTime() - right.gameTime.getTime(),
  );
  if (week === undefined || !Number.isFinite(week)) {
    return sorted.slice(0, 4);
  }

  const nearWeek = sorted.filter(
    (game) => game.week >= week - 1 && game.week <= week + 1,
  );
  return (nearWeek.length > 0 ? nearWeek : sorted).slice(0, 4);
}

function rosterFactKey(fact: LeagueRosterFactForEnrichment): string {
  if (fact.provider && fact.providerPlayerId) {
    return `${fact.provider.toLowerCase()}:${fact.providerPlayerId}`;
  }
  return `${fact.playerName ?? ""}:${fact.team ?? ""}`.toLowerCase();
}

export async function getLeagueRosterGeneralNflFacts(
  db: Db,
  input: {
    limit?: number;
    rosterFacts: readonly LeagueRosterFactForEnrichment[];
    season: number;
    source?: string;
    week?: number;
  },
): Promise<LeagueRosterGeneralStatsFact[]> {
  const limit = normalizeLimit(input.limit);
  const seenRosterFacts = new Set<string>();
  const seenPlayers = new Set<string>();
  const results: LeagueRosterGeneralStatsFact[] = [];

  for (const rosterFact of input.rosterFacts) {
    const factKey = rosterFactKey(rosterFact);
    if (!factKey || seenRosterFacts.has(factKey)) {
      continue;
    }
    seenRosterFacts.add(factKey);

    const enriched = await enrichLeagueRosterFactWithGeneralStats(
      db,
      rosterFact,
      { source: input.source },
    );
    if (!enriched) {
      continue;
    }

    const playerKey = `${enriched.player.source}:${enriched.player.sourcePlayerId}`;
    if (seenPlayers.has(playerKey)) {
      continue;
    }
    seenPlayers.add(playerKey);

    const stats = await getGeneralStatsPlayerStats(db, {
      season: input.season,
      source: enriched.player.source,
      sourcePlayerId: enriched.player.sourcePlayerId,
    });
    const schedule = await getGeneralStatsSchedule(db, {
      season: input.season,
      source: enriched.player.source,
      team: enriched.player.team,
    });

    results.push({
      confidence: enriched.confidence,
      latestWeek: latestWeekFor(stats, input.week),
      original: enriched.original,
      player: enriched.player,
      schedule: scheduleWindow(schedule, input.week),
      season: input.season,
      seasonTotals: seasonTotals(stats),
      source: enriched.player.source,
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results.sort(
    (left, right) =>
      (left.original.leagueTeamName ?? "").localeCompare(
        right.original.leagueTeamName ?? "",
      ) || left.player.fullName.localeCompare(right.player.fullName),
  );
}
