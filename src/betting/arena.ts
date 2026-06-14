import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  type ArenaSeason,
  type ArenaStanding,
  arenaSeasons,
  arenaStandings,
  leagues,
  users,
} from "@/db/schema";

const DEFAULT_LIMIT = 25;
const DEFAULT_MOVEMENT_LIMIT = 3;
const MAX_LIMIT = 100;

type ArenaStandingKind = "league" | "individual";
type ArenaSeasonStatus = "active" | "complete" | "upcoming";

interface UserLeagueMetricRow {
  current_balance_cents: number | string | null;
  league_id: string;
  league_name: string;
  net_pnl_cents: number | string | null;
  push_void_slip_count: number | string | null;
  roi_bps: number | string | null;
  settled_slip_count: number | string | null;
  total_return_cents: number | string | null;
  total_stake_cents: number | string | null;
  user_display_name: string;
  user_email: string;
  user_id: string;
  weeks_played: number | string | null;
  weeks_survived: number | string | null;
  win_rate_bps: number | string | null;
  won_slip_count: number | string | null;
}

interface LeagueListRow {
  id: string;
  name: string;
}

interface ComputedStanding {
  currentBalanceCents: number;
  kind: ArenaStandingKind;
  leagueId: string | null;
  netPnlCents: number;
  pushVoidSlipCount: number;
  rank: number;
  roiBps: number;
  settledSlipCount: number;
  subjectId: string;
  totalReturnCents: number;
  totalStakeCents: number;
  userId: string | null;
  weeksPlayed: number;
  weeksSurvived: number;
  winRateBps: number;
  wonSlipCount: number;
}

export interface EnsureArenaSeasonInput {
  endsAt: Date;
  name: string;
  startsAt: Date;
}

export interface ArenaLeaderboardRow {
  currentBalanceCents: number;
  displayName: string;
  id: string;
  netPnlCents: number;
  previousRank: number | null;
  pushVoidSlipCount: number;
  rank: number;
  rankDelta: number;
  roiBps: number;
  settledSlipCount: number;
  totalReturnCents: number;
  totalStakeCents: number;
  weeksPlayed: number;
  weeksSurvived: number;
  winRateBps: number;
  wonSlipCount: number;
}

export interface ArenaSeasonSummary {
  computedAt: string | null;
  endsAt: string;
  id: string;
  isSelected: boolean;
  name: string;
  startsAt: string;
  status: ArenaSeasonStatus;
}

export interface ArenaMover {
  displayName: string;
  id: string;
  kind: ArenaStandingKind;
  netPnlCents: number;
  previousRank: number;
  rank: number;
  rankDelta: number;
}

export interface ArenaLeagueRivalOption {
  displayName: string;
  id: string;
  netPnlCents: number;
  rank: number;
}

export interface ArenaHeadToHeadLeague extends ArenaLeagueRivalOption {
  currentBalanceCents: number;
  rankDelta: number;
  roiBps: number;
  weeksPlayed: number;
  weeksSurvived: number;
  winRateBps: number;
}

export interface ArenaHeadToHead {
  anchor: ArenaHeadToHeadLeague;
  comparison: "leading" | "tied" | "trailing";
  leader: ArenaHeadToHeadLeague | null;
  marginCents: number;
  rankGap: number;
  rival: ArenaHeadToHeadLeague;
}

export interface ArenaLeaderboardData {
  computedAt: string | null;
  headToHead: ArenaHeadToHead | null;
  individualStandings: ArenaLeaderboardRow[];
  leagueOptions: ArenaLeagueRivalOption[];
  leagueStandings: ArenaLeaderboardRow[];
  movers: {
    fallers: ArenaMover[];
    risers: ArenaMover[];
  };
  season: {
    endsAt: string;
    id: string;
    name: string;
    startsAt: string;
    status: ArenaSeasonStatus;
  } | null;
  seasons: ArenaSeasonSummary[];
}

export interface RebuildArenaStandingsResult extends ArenaLeaderboardData {
  materializedRows: ArenaStanding[];
}

export interface ArenaStandingSwingSignal {
  kind: ArenaStandingKind;
  leagueId: string | null;
  netPnlCents: number;
  newRank: number;
  oldRank: number;
  rankDelta: number;
  subjectId: string;
  userId: string | null;
}

function appError(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): AppError {
  return new AppError({ code, details, message, status });
}

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function requireDate(value: Date, field: string): Date {
  if (!validDate(value)) {
    throw appError("ARENA_INVALID_DATE", `${field} must be a valid Date`, 400, {
      field,
    });
  }
  return new Date(value.getTime());
}

function dateISOString(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function validateSeasonWindow(startsAt: Date, endsAt: Date): void {
  if (startsAt.getTime() >= endsAt.getTime()) {
    throw appError(
      "ARENA_INVALID_SEASON_WINDOW",
      "startsAt must be before endsAt",
      400,
    );
  }
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function boundedMovementLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_MOVEMENT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function integer(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value);
}

function percentageBps(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 10_000);
}

function seasonDto(
  season: ArenaSeason,
  now = new Date(),
): ArenaLeaderboardData["season"] {
  return {
    endsAt: season.endsAt.toISOString(),
    id: season.id,
    name: season.name,
    startsAt: season.startsAt.toISOString(),
    status: seasonStatus(season, now),
  };
}

function seasonStatus(
  season: Pick<ArenaSeason, "endsAt" | "startsAt">,
  now = new Date(),
): ArenaSeasonStatus {
  const nowMs = now.getTime();
  if (nowMs < season.startsAt.getTime()) {
    return "upcoming";
  }
  if (nowMs >= season.endsAt.getTime()) {
    return "complete";
  }
  return "active";
}

async function executeRows<T>(executor: Db | LeagueScopedTx, statement: SQL) {
  const result = await executor.execute(statement);
  const maybeRows = result as unknown;
  if (Array.isArray(maybeRows)) {
    return maybeRows as T[];
  }
  return ((maybeRows as { rows?: T[] }).rows ?? []) as T[];
}

async function requireArenaSeason(
  db: Db,
  seasonId: string,
): Promise<ArenaSeason> {
  const [season] = await db
    .select()
    .from(arenaSeasons)
    .where(eq(arenaSeasons.id, seasonId))
    .limit(1);
  if (!season) {
    throw appError("ARENA_SEASON_NOT_FOUND", "Arena season was not found", 404);
  }
  return season;
}

async function loadArenaSeasons(db: Db): Promise<ArenaSeason[]> {
  return db
    .select()
    .from(arenaSeasons)
    .orderBy(desc(arenaSeasons.startsAt), desc(arenaSeasons.createdAt));
}

function defaultArenaSeason(
  seasons: readonly ArenaSeason[],
  now = new Date(),
): ArenaSeason | null {
  const active = seasons.find(
    (season) =>
      season.startsAt.getTime() <= now.getTime() &&
      now.getTime() < season.endsAt.getTime(),
  );
  return active ?? seasons[0] ?? null;
}

async function latestComputedAtBySeason(
  db: Db,
): Promise<Map<string, string | null>> {
  const rows = await db
    .select({
      computedAt: sql<Date | null>`max(${arenaStandings.computedAt})`,
      seasonId: arenaStandings.seasonId,
    })
    .from(arenaStandings)
    .groupBy(arenaStandings.seasonId);

  return new Map(
    rows.map((row) => [row.seasonId, dateISOString(row.computedAt)]),
  );
}

function seasonSummary(
  season: ArenaSeason,
  input: {
    computedAt: string | null;
    now?: Date;
    selectedSeasonId: string | null;
  },
): ArenaSeasonSummary {
  return {
    computedAt: input.computedAt,
    endsAt: season.endsAt.toISOString(),
    id: season.id,
    isSelected: season.id === input.selectedSeasonId,
    name: season.name,
    startsAt: season.startsAt.toISOString(),
    status: seasonStatus(season, input.now),
  };
}

async function loadUserLeagueMetrics(
  db: Db,
  season: Pick<ArenaSeason, "endsAt" | "startsAt">,
): Promise<UserLeagueMetricRow[]> {
  const leagueRows: LeagueListRow[] = await db
    .select({ id: leagues.id, name: leagues.name })
    .from(leagues)
    .orderBy(leagues.name);
  const rows: UserLeagueMetricRow[] = [];

  for (const league of leagueRows) {
    const leagueRowsForSeason = await withLeagueContext(db, league.id, (tx) =>
      executeRows<
        Omit<UserLeagueMetricRow, "league_id" | "league_name"> & {
          league_id: string;
          league_name: string;
        }
      >(
        tx,
        sql`
      with season_weeks as (
        select
          bw.id,
          bw.league_id,
          bw.user_id,
          bw.floor_cents,
          bw.week_start,
          latest.running_balance_cents as latest_balance_cents
        from bankroll_weeks bw
        join lateral (
          select bl.running_balance_cents
          from bankroll_ledger bl
          where bl.bankroll_week_id = bw.id
            and bl.league_id = bw.league_id
            and bl.user_id = bw.user_id
          order by bl.seq desc
          limit 1
        ) latest on true
        where bw.league_id = ${league.id}
          and bw.week_start >= ${season.startsAt}
          and bw.week_start < ${season.endsAt}
      ),
      latest_user_league_week as (
        select distinct on (league_id, user_id)
          league_id,
          user_id,
          floor_cents,
          latest_balance_cents
        from season_weeks
        order by league_id, user_id, week_start desc
      ),
      week_counts as (
        select
          league_id,
          user_id,
          count(*)::integer as weeks_played,
          count(*) filter (where latest_balance_cents > 0)::integer as weeks_survived
        from season_weeks
        group by league_id, user_id
      ),
      ledger_totals as (
        select
          sw.league_id,
          sw.user_id,
          coalesce(sum(case when bl.entry_type = 'bet_stake' then -bl.amount_cents else 0 end), 0)::integer as total_stake_cents,
          coalesce(sum(case when bl.entry_type in ('bet_payout', 'bet_refund') then bl.amount_cents else 0 end), 0)::integer as total_return_cents
        from season_weeks sw
        join bankroll_ledger bl
          on bl.bankroll_week_id = sw.id
          and bl.league_id = sw.league_id
          and bl.user_id = sw.user_id
        group by sw.league_id, sw.user_id
      ),
      slip_totals as (
        select
          bw.league_id,
          bw.user_id,
          count(bs.id)::integer as settled_slip_count,
          count(bs.id) filter (where bs.status in ('won', 'partial_void'))::integer as won_slip_count,
          count(bs.id) filter (where bs.status in ('push', 'void'))::integer as push_void_slip_count
        from bankroll_weeks bw
        join bet_slips bs
          on bs.bankroll_week_id = bw.id
          and bs.league_id = bw.league_id
          and bs.user_id = bw.user_id
        where bw.league_id = ${league.id}
          and bw.week_start >= ${season.startsAt}
          and bw.week_start < ${season.endsAt}
          and bs.status <> 'pending'
        group by bw.league_id, bw.user_id
      )
      select
        latest.league_id,
        ${league.name}::text as league_name,
        latest.user_id,
        u.display_name as user_display_name,
        u.email as user_email,
        latest.latest_balance_cents::integer as current_balance_cents,
        (latest.latest_balance_cents - latest.floor_cents)::integer as net_pnl_cents,
        coalesce(ledger.total_stake_cents, 0)::integer as total_stake_cents,
        coalesce(ledger.total_return_cents, 0)::integer as total_return_cents,
        coalesce(slips.settled_slip_count, 0)::integer as settled_slip_count,
        coalesce(slips.won_slip_count, 0)::integer as won_slip_count,
        coalesce(slips.push_void_slip_count, 0)::integer as push_void_slip_count,
        week_counts.weeks_played,
        week_counts.weeks_survived,
        case
          when coalesce(ledger.total_stake_cents, 0) = 0 then 0
          else round(((coalesce(ledger.total_return_cents, 0) - ledger.total_stake_cents)::numeric / ledger.total_stake_cents) * 10000)::integer
        end as roi_bps,
        case
          when coalesce(slips.settled_slip_count, 0) = 0 then 0
          else round((coalesce(slips.won_slip_count, 0)::numeric / slips.settled_slip_count) * 10000)::integer
        end as win_rate_bps
      from latest_user_league_week latest
      join week_counts
        on week_counts.league_id = latest.league_id
        and week_counts.user_id = latest.user_id
      join users u on u.id = latest.user_id
      left join ledger_totals ledger
        on ledger.league_id = latest.league_id
        and ledger.user_id = latest.user_id
      left join slip_totals slips
        on slips.league_id = latest.league_id
        and slips.user_id = latest.user_id
    `,
      ),
    );
    rows.push(...leagueRowsForSeason);
  }

  return rows;
}

function rankStandings(
  rows: Omit<ComputedStanding, "rank">[],
): ComputedStanding[] {
  return [...rows]
    .sort((a, b) => {
      const net = b.netPnlCents - a.netPnlCents;
      if (net !== 0) return net;
      const roi = b.roiBps - a.roiBps;
      if (roi !== 0) return roi;
      const balance = b.currentBalanceCents - a.currentBalanceCents;
      if (balance !== 0) return balance;
      const winRate = b.winRateBps - a.winRateBps;
      if (winRate !== 0) return winRate;
      return a.subjectId.localeCompare(b.subjectId);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function computeIndividualStandings(
  rows: readonly UserLeagueMetricRow[],
): ComputedStanding[] {
  const byUser = new Map<string, Omit<ComputedStanding, "rank">>();

  for (const row of rows) {
    const userId = row.user_id;
    const existing = byUser.get(userId) ?? {
      currentBalanceCents: 0,
      kind: "individual" as const,
      leagueId: null,
      netPnlCents: 0,
      pushVoidSlipCount: 0,
      roiBps: 0,
      settledSlipCount: 0,
      subjectId: userId,
      totalReturnCents: 0,
      totalStakeCents: 0,
      userId,
      weeksPlayed: 0,
      weeksSurvived: 0,
      winRateBps: 0,
      wonSlipCount: 0,
    };

    existing.currentBalanceCents += integer(row.current_balance_cents);
    existing.netPnlCents += integer(row.net_pnl_cents);
    existing.pushVoidSlipCount += integer(row.push_void_slip_count);
    existing.settledSlipCount += integer(row.settled_slip_count);
    existing.totalReturnCents += integer(row.total_return_cents);
    existing.totalStakeCents += integer(row.total_stake_cents);
    existing.weeksPlayed += integer(row.weeks_played);
    existing.weeksSurvived += integer(row.weeks_survived);
    existing.wonSlipCount += integer(row.won_slip_count);
    existing.roiBps = percentageBps(
      existing.totalReturnCents - existing.totalStakeCents,
      existing.totalStakeCents,
    );
    existing.winRateBps = percentageBps(
      existing.wonSlipCount,
      existing.settledSlipCount,
    );

    byUser.set(userId, existing);
  }

  return rankStandings([...byUser.values()]);
}

function computeLeagueStandings(
  rows: readonly UserLeagueMetricRow[],
): ComputedStanding[] {
  const byLeague = new Map<
    string,
    Omit<ComputedStanding, "rank"> & {
      memberCount: number;
      totalCurrentBalanceCents: number;
      totalNetPnlCents: number;
    }
  >();

  for (const row of rows) {
    const leagueId = row.league_id;
    const existing = byLeague.get(leagueId) ?? {
      currentBalanceCents: 0,
      kind: "league" as const,
      leagueId,
      memberCount: 0,
      netPnlCents: 0,
      pushVoidSlipCount: 0,
      roiBps: 0,
      settledSlipCount: 0,
      subjectId: leagueId,
      totalCurrentBalanceCents: 0,
      totalNetPnlCents: 0,
      totalReturnCents: 0,
      totalStakeCents: 0,
      userId: null,
      weeksPlayed: 0,
      weeksSurvived: 0,
      winRateBps: 0,
      wonSlipCount: 0,
    };

    existing.memberCount += 1;
    existing.totalCurrentBalanceCents += integer(row.current_balance_cents);
    existing.totalNetPnlCents += integer(row.net_pnl_cents);
    existing.pushVoidSlipCount += integer(row.push_void_slip_count);
    existing.settledSlipCount += integer(row.settled_slip_count);
    existing.totalReturnCents += integer(row.total_return_cents);
    existing.totalStakeCents += integer(row.total_stake_cents);
    existing.weeksPlayed += integer(row.weeks_played);
    existing.weeksSurvived += integer(row.weeks_survived);
    existing.wonSlipCount += integer(row.won_slip_count);
    existing.currentBalanceCents = Math.round(
      existing.totalCurrentBalanceCents / existing.memberCount,
    );
    existing.netPnlCents = Math.round(
      existing.totalNetPnlCents / existing.memberCount,
    );
    existing.roiBps = percentageBps(
      existing.totalReturnCents - existing.totalStakeCents,
      existing.totalStakeCents,
    );
    existing.winRateBps = percentageBps(
      existing.wonSlipCount,
      existing.settledSlipCount,
    );

    byLeague.set(leagueId, existing);
  }

  return rankStandings(
    [...byLeague.values()].map(({ memberCount, ...row }) => row),
  );
}

export async function ensureArenaSeason(
  db: Db,
  input: EnsureArenaSeasonInput,
): Promise<ArenaSeason> {
  const startsAt = requireDate(input.startsAt, "startsAt");
  const endsAt = requireDate(input.endsAt, "endsAt");
  validateSeasonWindow(startsAt, endsAt);
  const name = input.name.trim();
  if (!name) {
    throw appError("ARENA_INVALID_SEASON_NAME", "name cannot be blank", 400);
  }

  const [season] = await db
    .insert(arenaSeasons)
    .values({ endsAt, name, startsAt })
    .onConflictDoUpdate({
      set: { name, updatedAt: new Date() },
      target: [arenaSeasons.startsAt, arenaSeasons.endsAt],
    })
    .returning();

  if (!season) {
    throw appError(
      "ARENA_SEASON_INSERT_FAILED",
      "Arena season could not be created",
      500,
    );
  }
  return season;
}

export async function computeArenaStandings(
  db: Db,
  input: { seasonId: string },
): Promise<{
  individualStandings: ComputedStanding[];
  leagueStandings: ComputedStanding[];
  season: ArenaSeason;
}> {
  const season = await requireArenaSeason(db, input.seasonId);
  const rows = await loadUserLeagueMetrics(db, season);
  return {
    individualStandings: computeIndividualStandings(rows),
    leagueStandings: computeLeagueStandings(rows),
    season,
  };
}

export async function rebuildArenaStandings(
  db: Db,
  input: { computedAt?: Date; seasonId: string },
): Promise<RebuildArenaStandingsResult> {
  const computedAt = input.computedAt
    ? requireDate(input.computedAt, "computedAt")
    : new Date();
  const computed = await computeArenaStandings(db, {
    seasonId: input.seasonId,
  });
  const standings = [
    ...computed.leagueStandings,
    ...computed.individualStandings,
  ];

  const materializedRows = await db.transaction(async (tx) => {
    const previousRows = await tx
      .select({
        kind: arenaStandings.kind,
        rank: arenaStandings.rank,
        subjectId: arenaStandings.subjectId,
      })
      .from(arenaStandings)
      .where(eq(arenaStandings.seasonId, input.seasonId));
    const previousRankBySubject = new Map(
      previousRows.map((row) => [`${row.kind}:${row.subjectId}`, row.rank]),
    );

    await tx
      .delete(arenaStandings)
      .where(eq(arenaStandings.seasonId, input.seasonId));
    if (standings.length === 0) {
      return [];
    }

    return tx
      .insert(arenaStandings)
      .values(
        standings.map((row) => {
          const previousRank =
            previousRankBySubject.get(`${row.kind}:${row.subjectId}`) ?? null;
          return {
            computedAt,
            currentBalanceCents: row.currentBalanceCents,
            kind: row.kind,
            leagueId: row.leagueId,
            netPnlCents: row.netPnlCents,
            previousRank,
            pushVoidSlipCount: row.pushVoidSlipCount,
            rank: row.rank,
            rankDelta: previousRank === null ? 0 : previousRank - row.rank,
            roiBps: row.roiBps,
            seasonId: input.seasonId,
            settledSlipCount: row.settledSlipCount,
            subjectId: row.subjectId,
            totalReturnCents: row.totalReturnCents,
            totalStakeCents: row.totalStakeCents,
            userId: row.userId,
            weeksPlayed: row.weeksPlayed,
            weeksSurvived: row.weeksSurvived,
            winRateBps: row.winRateBps,
            wonSlipCount: row.wonSlipCount,
          };
        }),
      )
      .returning();
  });

  const leagueStandings = await standingsForKind(db, input.seasonId, "league");
  return {
    computedAt: computedAt.toISOString(),
    individualStandings: await standingsForKind(
      db,
      input.seasonId,
      "individual",
    ),
    headToHead: buildHeadToHead(leagueStandings),
    leagueOptions: leagueRivalOptions(leagueStandings),
    leagueStandings,
    materializedRows,
    movers: await movementForSeason(db, input.seasonId),
    season: seasonDto(computed.season),
    seasons: [
      seasonSummary(computed.season, {
        computedAt: computedAt.toISOString(),
        selectedSeasonId: computed.season.id,
      }),
    ],
  };
}

export async function rebuildAllArenaStandings(
  db: Db,
  input: { computedAt?: Date } = {},
): Promise<RebuildArenaStandingsResult[]> {
  const seasons = await db
    .select({ id: arenaSeasons.id })
    .from(arenaSeasons)
    .orderBy(arenaSeasons.startsAt);
  const results: RebuildArenaStandingsResult[] = [];

  for (const season of seasons) {
    results.push(
      await rebuildArenaStandings(db, {
        computedAt: input.computedAt,
        seasonId: season.id,
      }),
    );
  }

  return results;
}

export function extractArenaStandingSwingSignals(
  result: Pick<RebuildArenaStandingsResult, "materializedRows">,
): ArenaStandingSwingSignal[] {
  return result.materializedRows
    .filter((row) => row.previousRank !== null && row.rankDelta !== 0)
    .map((row) => ({
      kind: row.kind,
      leagueId: row.leagueId,
      netPnlCents: row.netPnlCents,
      newRank: row.rank,
      oldRank: row.previousRank as number,
      rankDelta: row.rankDelta,
      subjectId: row.subjectId,
      userId: row.userId,
    }))
    .sort(
      (a, b) =>
        Math.abs(b.rankDelta) - Math.abs(a.rankDelta) ||
        a.kind.localeCompare(b.kind) ||
        a.newRank - b.newRank ||
        a.subjectId.localeCompare(b.subjectId),
    );
}

async function standingsForKind(
  db: Db,
  seasonId: string,
  kind: ArenaStandingKind,
  input: { limit?: number } = {},
): Promise<ArenaLeaderboardRow[]> {
  const limit = boundedLimit(input.limit);
  const rows = await db
    .select({
      currentBalanceCents: arenaStandings.currentBalanceCents,
      kind: arenaStandings.kind,
      leagueName: leagues.name,
      netPnlCents: arenaStandings.netPnlCents,
      previousRank: arenaStandings.previousRank,
      pushVoidSlipCount: arenaStandings.pushVoidSlipCount,
      rank: arenaStandings.rank,
      rankDelta: arenaStandings.rankDelta,
      roiBps: arenaStandings.roiBps,
      settledSlipCount: arenaStandings.settledSlipCount,
      subjectId: arenaStandings.subjectId,
      totalReturnCents: arenaStandings.totalReturnCents,
      totalStakeCents: arenaStandings.totalStakeCents,
      userDisplayName: users.displayName,
      userEmail: users.email,
      weeksPlayed: arenaStandings.weeksPlayed,
      weeksSurvived: arenaStandings.weeksSurvived,
      winRateBps: arenaStandings.winRateBps,
      wonSlipCount: arenaStandings.wonSlipCount,
    })
    .from(arenaStandings)
    .leftJoin(leagues, eq(leagues.id, arenaStandings.leagueId))
    .leftJoin(users, eq(users.id, arenaStandings.userId))
    .where(
      and(eq(arenaStandings.seasonId, seasonId), eq(arenaStandings.kind, kind)),
    )
    .orderBy(arenaStandings.rank)
    .limit(limit);

  return rows.map((row) => ({
    currentBalanceCents: row.currentBalanceCents,
    displayName:
      kind === "league"
        ? (row.leagueName ?? "Unknown league")
        : (row.userDisplayName ?? row.userEmail ?? "Unknown player"),
    id: row.subjectId,
    netPnlCents: row.netPnlCents,
    previousRank: row.previousRank,
    pushVoidSlipCount: row.pushVoidSlipCount,
    rank: row.rank,
    rankDelta: row.rankDelta,
    roiBps: row.roiBps,
    settledSlipCount: row.settledSlipCount,
    totalReturnCents: row.totalReturnCents,
    totalStakeCents: row.totalStakeCents,
    weeksPlayed: row.weeksPlayed,
    weeksSurvived: row.weeksSurvived,
    winRateBps: row.winRateBps,
    wonSlipCount: row.wonSlipCount,
  }));
}

async function movementForSeason(
  db: Db,
  seasonId: string,
  input: { limit?: number } = {},
): Promise<ArenaLeaderboardData["movers"]> {
  const limit = boundedMovementLimit(input.limit);
  const rows = await db
    .select({
      kind: arenaStandings.kind,
      leagueName: leagues.name,
      netPnlCents: arenaStandings.netPnlCents,
      previousRank: arenaStandings.previousRank,
      rank: arenaStandings.rank,
      rankDelta: arenaStandings.rankDelta,
      subjectId: arenaStandings.subjectId,
      userDisplayName: users.displayName,
      userEmail: users.email,
    })
    .from(arenaStandings)
    .leftJoin(leagues, eq(leagues.id, arenaStandings.leagueId))
    .leftJoin(users, eq(users.id, arenaStandings.userId))
    .where(
      and(
        eq(arenaStandings.seasonId, seasonId),
        sql`${arenaStandings.rankDelta} <> 0`,
        sql`${arenaStandings.previousRank} is not null`,
      ),
    )
    .orderBy(desc(sql<number>`abs(${arenaStandings.rankDelta})`))
    .limit(MAX_LIMIT);

  const movers = rows
    .filter((row) => row.previousRank !== null)
    .map((row) => ({
      displayName:
        row.kind === "league"
          ? (row.leagueName ?? "Unknown league")
          : (row.userDisplayName ?? row.userEmail ?? "Unknown player"),
      id: row.subjectId,
      kind: row.kind,
      netPnlCents: row.netPnlCents,
      previousRank: row.previousRank as number,
      rank: row.rank,
      rankDelta: row.rankDelta,
    }));

  return {
    fallers: movers
      .filter((row) => row.rankDelta < 0)
      .sort((a, b) => a.rankDelta - b.rankDelta || a.rank - b.rank)
      .slice(0, limit),
    risers: movers
      .filter((row) => row.rankDelta > 0)
      .sort((a, b) => b.rankDelta - a.rankDelta || a.rank - b.rank)
      .slice(0, limit),
  };
}

function leagueRivalOptions(
  rows: readonly ArenaLeaderboardRow[],
): ArenaLeagueRivalOption[] {
  return rows.map((row) => ({
    displayName: row.displayName,
    id: row.id,
    netPnlCents: row.netPnlCents,
    rank: row.rank,
  }));
}

function headToHeadLeague(row: ArenaLeaderboardRow): ArenaHeadToHeadLeague {
  return {
    currentBalanceCents: row.currentBalanceCents,
    displayName: row.displayName,
    id: row.id,
    netPnlCents: row.netPnlCents,
    rank: row.rank,
    rankDelta: row.rankDelta,
    roiBps: row.roiBps,
    weeksPlayed: row.weeksPlayed,
    weeksSurvived: row.weeksSurvived,
    winRateBps: row.winRateBps,
  };
}

function naturalRivalFor(
  anchor: ArenaLeaderboardRow,
  rows: readonly ArenaLeaderboardRow[],
): ArenaLeaderboardRow | null {
  const index = rows.findIndex((row) => row.id === anchor.id);
  if (index < 0) return null;
  return rows[index - 1] ?? rows[index + 1] ?? null;
}

function buildHeadToHead(
  rows: readonly ArenaLeaderboardRow[],
  input: { leagueId?: string; rivalLeagueId?: string } = {},
): ArenaHeadToHead | null {
  if (rows.length < 2) return null;

  const anchor = input.leagueId
    ? rows.find((row) => row.id === input.leagueId)
    : rows[0];
  if (!anchor) return null;

  const explicitRival =
    input.rivalLeagueId && input.rivalLeagueId !== anchor.id
      ? rows.find((row) => row.id === input.rivalLeagueId)
      : null;
  const rival = explicitRival ?? naturalRivalFor(anchor, rows);
  if (!rival) return null;

  const anchorLeague = headToHeadLeague(anchor);
  const rivalLeague = headToHeadLeague(rival);
  const gap = anchor.netPnlCents - rival.netPnlCents;
  const leader = gap > 0 ? anchorLeague : gap < 0 ? rivalLeague : null;

  return {
    anchor: anchorLeague,
    comparison: gap > 0 ? "leading" : gap < 0 ? "trailing" : "tied",
    leader,
    marginCents: Math.abs(gap),
    rankGap: Math.abs(anchor.rank - rival.rank),
    rival: rivalLeague,
  };
}

export async function getArenaLeaderboardData(
  db: Db,
  input: {
    leagueId?: string;
    limit?: number;
    movementLimit?: number;
    now?: Date;
    rivalLeagueId?: string;
    seasonId?: string;
  } = {},
): Promise<ArenaLeaderboardData> {
  const now = input.now ? requireDate(input.now, "now") : new Date();
  const allSeasons = await loadArenaSeasons(db);
  const season = input.seasonId
    ? (allSeasons.find((candidate) => candidate.id === input.seasonId) ??
      (await requireArenaSeason(db, input.seasonId)))
    : defaultArenaSeason(allSeasons, now);
  const computedAtBySeason = await latestComputedAtBySeason(db);
  const seasons = allSeasons.map((candidate) =>
    seasonSummary(candidate, {
      computedAt: computedAtBySeason.get(candidate.id) ?? null,
      now,
      selectedSeasonId: season?.id ?? null,
    }),
  );

  if (!season) {
    return {
      computedAt: null,
      headToHead: null,
      individualStandings: [],
      leagueOptions: [],
      leagueStandings: [],
      movers: { fallers: [], risers: [] },
      season: null,
      seasons,
    };
  }

  const leagueStandings = await standingsForKind(db, season.id, "league", {
    limit: input.limit,
  });
  const allLeagueStandings = await standingsForKind(db, season.id, "league", {
    limit: MAX_LIMIT,
  });
  const individualStandings = await standingsForKind(
    db,
    season.id,
    "individual",
    { limit: input.limit },
  );

  return {
    computedAt: computedAtBySeason.get(season.id) ?? null,
    headToHead: buildHeadToHead(allLeagueStandings, {
      leagueId: input.leagueId,
      rivalLeagueId: input.rivalLeagueId,
    }),
    individualStandings,
    leagueOptions: leagueRivalOptions(allLeagueStandings),
    leagueStandings,
    movers: await movementForSeason(db, season.id, {
      limit: input.movementLimit,
    }),
    season: seasonDto(season, now),
    seasons,
  };
}
