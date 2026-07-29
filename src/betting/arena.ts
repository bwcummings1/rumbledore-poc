import {
  and,
  desc,
  eq,
  gt,
  inArray,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
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
import { scorePickWeek, WEEKLY_PARTICIPATION_FLOOR } from "./pickem-scoring";

const DEFAULT_LIMIT = 25;
const DEFAULT_MOVEMENT_LIMIT = 3;
const MAX_LIMIT = 100;

type ArenaStandingKind = "league" | "individual";
type ArenaSeasonStatus = "active" | "complete" | "upcoming";

/**
 * One row per (league, week, user). A week in which nobody picked still
 * produces a row, with `user_id` null -- the league denominator must count it.
 */
interface PickMetricRow {
  correct_picks: number | string | null;
  league_id: string;
  league_name: string;
  max_picks_per_user: number | string;
  pick_week_id: string;
  roster_size: number | string;
  submitted_picks: number | string | null;
  user_display_name: string | null;
  user_email: string | null;
  user_id: string | null;
  void_picks: number | string | null;
}

interface LeagueListRow {
  id: string;
  name: string;
}

interface ComputedStanding {
  accuracyBps: number;
  correctPicks: number;
  eligibleWeeks: number;
  kind: ArenaStandingKind;
  leagueId: string | null;
  rank: number;
  scorablePicks: number;
  subjectId: string;
  submittedPicks: number;
  userId: string | null;
  voidPicks: number;
  weeksPlayed: number;
}

export interface EnsureArenaSeasonInput {
  endsAt: Date;
  name: string;
  startsAt: Date;
}

export interface ArenaLeaderboardRow {
  accuracyBps: number;
  correctPicks: number;
  displayName: string;
  eligibleWeeks: number;
  id: string;
  previousRank: number | null;
  rank: number;
  rankDelta: number;
  scorablePicks: number;
  submittedPicks: number;
  voidPicks: number;
  weeksPlayed: number;
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
  accuracyBps: number;
  displayName: string;
  id: string;
  kind: ArenaStandingKind;
  previousRank: number;
  rank: number;
  rankDelta: number;
}

export interface ArenaLeagueRivalOption {
  accuracyBps: number;
  displayName: string;
  id: string;
  rank: number;
}

export interface ArenaHeadToHeadLeague extends ArenaLeagueRivalOption {
  correctPicks: number;
  eligibleWeeks: number;
  rankDelta: number;
  scorablePicks: number;
  weeksPlayed: number;
}

export interface ArenaHeadToHead {
  anchor: ArenaHeadToHeadLeague;
  comparison: "leading" | "tied" | "trailing";
  leader: ArenaHeadToHeadLeague | null;
  /** Accuracy gap in basis points. Absolute, so it never encodes direction. */
  marginBps: number;
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
  accuracyBps: number;
  kind: ArenaStandingKind;
  leagueId: string | null;
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

/**
 * Loads graded pick counts for every league, one row per (league, week, user).
 *
 * Runs per league inside `withLeagueContext` because `pick_weeks` and `picks`
 * are RLS-protected: a single cross-league query would return nothing.
 *
 * The LEFT JOIN is load-bearing. A week in which nobody picked still yields a
 * row (with a null user), and that week's full denominator still counts
 * against the league. An inner join would drop it and flatter every league
 * that skipped a week -- the exact opposite of the intended rule.
 */
async function loadPickMetrics(
  db: Db,
  season: Pick<ArenaSeason, "endsAt" | "startsAt">,
): Promise<PickMetricRow[]> {
  const leagueRows: LeagueListRow[] = await db
    .select({ id: leagues.id, name: leagues.name })
    .from(leagues)
    .orderBy(leagues.name);
  const rows: PickMetricRow[] = [];

  for (const league of leagueRows) {
    const leagueRowsForSeason = await withLeagueContext(db, league.id, (tx) =>
      executeRows<PickMetricRow>(
        tx,
        sql`
      select
        pw.league_id,
        ${league.name}::text as league_name,
        pw.id as pick_week_id,
        pw.roster_size,
        pw.max_picks_per_user,
        p.user_id,
        u.display_name as user_display_name,
        u.email as user_email,
        count(p.id) filter (where p.status = 'correct')::int as correct_picks,
        count(p.id) filter (where p.status = 'void')::int as void_picks,
        count(p.id)::int as submitted_picks
      from pick_weeks pw
      left join picks p
        on p.pick_week_id = pw.id
        and p.league_id = pw.league_id
      left join users u on u.id = p.user_id
      where pw.league_id = ${league.id}
        and pw.opens_at >= ${season.startsAt}
        and pw.opens_at < ${season.endsAt}
      group by
        pw.league_id, pw.id, pw.roster_size, pw.max_picks_per_user,
        p.user_id, u.display_name, u.email
    `,
      ),
    );
    rows.push(...leagueRowsForSeason);
  }

  return rows;
}

/**
 * Orders standings by accuracy and assigns standard competition ranks.
 *
 * Ties SHARE a rank (1,1,3) rather than being broken arbitrarily. The prize
 * rule is an even split among tied entries, so inventing an order here would
 * misreport who actually won. `subjectId` still breaks the sort for stable
 * output, but it does not break the rank.
 */
function rankStandings(
  rows: Omit<ComputedStanding, "rank">[],
): ComputedStanding[] {
  const sorted = [...rows].sort((a, b) => {
    const accuracy = b.accuracyBps - a.accuracyBps;
    if (accuracy !== 0) return accuracy;
    // Same accuracy on a larger denominator is the harder achievement.
    const volume = b.scorablePicks - a.scorablePicks;
    if (volume !== 0) return volume;
    return a.subjectId.localeCompare(b.subjectId);
  });

  const ranked: ComputedStanding[] = [];
  let rank = 0;
  let seen = 0;
  let previousAccuracy: number | null = null;
  for (const row of sorted) {
    seen += 1;
    if (previousAccuracy === null || row.accuracyBps !== previousAccuracy) {
      rank = seen;
      previousAccuracy = row.accuracyBps;
    }
    ranked.push({ ...row, rank });
  }
  return ranked;
}

interface WeekTotals {
  correctPicks: number;
  maxPicksPerUser: number;
  rosterSize: number;
  submittedPicks: number;
  voidPicks: number;
}

/**
 * League standings: the denominator is the whole roster, every week.
 *
 * `rosterSize x maxPicksPerUser - pushes` counts every pick the league COULD
 * have made, including those of members who never opened the app. That is the
 * rule -- an unsubmitted pick scores the same as a wrong one -- and it is why
 * these totals cannot be derived by summing the individual standings, which
 * only know about users who actually picked.
 */
function computeLeagueStandings(
  rows: readonly PickMetricRow[],
): ComputedStanding[] {
  const byWeek = new Map<string, WeekTotals & { leagueId: string }>();
  for (const row of rows) {
    const existing = byWeek.get(row.pick_week_id) ?? {
      correctPicks: 0,
      leagueId: row.league_id,
      maxPicksPerUser: integer(row.max_picks_per_user),
      rosterSize: integer(row.roster_size),
      submittedPicks: 0,
      voidPicks: 0,
    };
    existing.correctPicks += integer(row.correct_picks);
    existing.submittedPicks += integer(row.submitted_picks);
    existing.voidPicks += integer(row.void_picks);
    byWeek.set(row.pick_week_id, existing);
  }

  const byLeague = new Map<string, Omit<ComputedStanding, "rank">>();
  for (const week of byWeek.values()) {
    const score = scorePickWeek({
      correctPicks: week.correctPicks,
      maxPicksPerUser: week.maxPicksPerUser,
      rosterSize: week.rosterSize,
      // A void pick was submitted but is not scorable, so counting it would
      // let pushes inflate the participation gate.
      submittedPicks: week.submittedPicks - week.voidPicks,
      voidPicks: week.voidPicks,
    });

    const existing = byLeague.get(week.leagueId) ?? {
      accuracyBps: 0,
      correctPicks: 0,
      eligibleWeeks: 0,
      kind: "league" as const,
      leagueId: week.leagueId,
      scorablePicks: 0,
      subjectId: week.leagueId,
      submittedPicks: 0,
      userId: null,
      voidPicks: 0,
      weeksPlayed: 0,
    };
    existing.correctPicks += week.correctPicks;
    existing.scorablePicks += score.scorablePicks;
    existing.submittedPicks += week.submittedPicks - week.voidPicks;
    existing.voidPicks += week.voidPicks;
    existing.weeksPlayed += 1;
    if (score.isEligibleForWeeklyPrize) {
      existing.eligibleWeeks += 1;
    }
    // Summed counts, not averaged weekly percentages: averaging would weight a
    // 12-pick week the same as a 120-pick one, letting a league lift its season
    // score with one strong low-volume week.
    existing.accuracyBps = percentageBps(
      existing.correctPicks,
      existing.scorablePicks,
    );
    byLeague.set(week.leagueId, existing);
  }

  return rankStandings([...byLeague.values()]);
}

/**
 * Individual standings: the denominator is the user's own allowance, counted
 * for each week they SUBMITTED at least one pick.
 *
 * This is deliberately asymmetric with the league rule above, and the reason is
 * a data limitation rather than a design preference. Scoring a user for weeks
 * they skipped entirely would require knowing who was on the roster in that
 * week; `members` records only CURRENT membership, so joining it would hand a
 * mid-season joiner retroactive zeroes for weeks before they existed in the
 * league -- the same drift `pick_weeks.roster_size` is snapshotted to prevent.
 *
 * Within a week they did play, the absolute rule still holds: the denominator
 * is the full allowance, so picks they left unsubmitted still count against
 * them. Only wholly skipped weeks are excluded.
 */
function computeIndividualStandings(
  rows: readonly PickMetricRow[],
): ComputedStanding[] {
  const byUser = new Map<string, Omit<ComputedStanding, "rank">>();

  for (const row of rows) {
    const userId = row.user_id;
    // Null user rows exist so the league denominator can count empty weeks.
    // They name no player, so they contribute nothing here.
    if (userId === null) continue;

    const voidPicks = integer(row.void_picks);
    const existing = byUser.get(userId) ?? {
      accuracyBps: 0,
      correctPicks: 0,
      eligibleWeeks: 0,
      kind: "individual" as const,
      leagueId: null,
      scorablePicks: 0,
      subjectId: userId,
      submittedPicks: 0,
      userId,
      voidPicks: 0,
      weeksPlayed: 0,
    };

    const allowance = integer(row.max_picks_per_user);
    const submitted = integer(row.submitted_picks) - voidPicks;
    existing.correctPicks += integer(row.correct_picks);
    // Pushes void: they leave the denominator rather than counting as wrong.
    existing.scorablePicks += Math.max(allowance - voidPicks, 0);
    existing.submittedPicks += submitted;
    existing.voidPicks += voidPicks;
    existing.weeksPlayed += 1;
    if (
      allowance - voidPicks > 0 &&
      submitted / (allowance - voidPicks) >= WEEKLY_PARTICIPATION_FLOOR
    ) {
      existing.eligibleWeeks += 1;
    }
    existing.accuracyBps = percentageBps(
      existing.correctPicks,
      existing.scorablePicks,
    );

    byUser.set(userId, existing);
  }

  return rankStandings([...byUser.values()]);
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
  const rows = await loadPickMetrics(db, season);
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
            accuracyBps: row.accuracyBps,
            computedAt,
            correctPicks: row.correctPicks,
            eligibleWeeks: row.eligibleWeeks,
            kind: row.kind,
            leagueId: row.leagueId,
            previousRank,
            rank: row.rank,
            rankDelta: previousRank === null ? 0 : previousRank - row.rank,
            scorablePicks: row.scorablePicks,
            seasonId: input.seasonId,
            subjectId: row.subjectId,
            submittedPicks: row.submittedPicks,
            userId: row.userId,
            voidPicks: row.voidPicks,
            weeksPlayed: row.weeksPlayed,
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

export async function findArenaSeasonIdsForWeekStarts(
  db: Db,
  input: { weekStarts: readonly Date[] },
): Promise<string[]> {
  const weekStarts = [
    ...new Map(
      input.weekStarts.map((weekStart, index) => {
        const resolved = requireDate(weekStart, `weekStarts.${index}`);
        return [resolved.getTime(), resolved] as const;
      }),
    ).values(),
  ];
  if (weekStarts.length === 0) {
    return [];
  }

  const clauses = weekStarts.map((weekStart) =>
    and(
      lte(arenaSeasons.startsAt, weekStart),
      gt(arenaSeasons.endsAt, weekStart),
    ),
  );
  const rows = await db
    .select({ id: arenaSeasons.id })
    .from(arenaSeasons)
    .where(or(...clauses))
    .orderBy(arenaSeasons.startsAt);

  return [...new Set(rows.map((row) => row.id))];
}

export async function rebuildAllArenaStandings(
  db: Db,
  input: { computedAt?: Date; seasonIds?: readonly string[] } = {},
): Promise<RebuildArenaStandingsResult[]> {
  const seasonIds = input.seasonIds ? [...new Set(input.seasonIds)] : null;
  if (seasonIds && seasonIds.length === 0) {
    return [];
  }

  const query = db.select({ id: arenaSeasons.id }).from(arenaSeasons);
  const seasons = await (seasonIds
    ? query
        .where(inArray(arenaSeasons.id, seasonIds))
        .orderBy(arenaSeasons.startsAt)
    : query.orderBy(arenaSeasons.startsAt));
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
      accuracyBps: row.accuracyBps,
      kind: row.kind,
      leagueId: row.leagueId,
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
      accuracyBps: arenaStandings.accuracyBps,
      correctPicks: arenaStandings.correctPicks,
      eligibleWeeks: arenaStandings.eligibleWeeks,
      kind: arenaStandings.kind,
      leagueName: leagues.name,
      previousRank: arenaStandings.previousRank,
      rank: arenaStandings.rank,
      rankDelta: arenaStandings.rankDelta,
      scorablePicks: arenaStandings.scorablePicks,
      subjectId: arenaStandings.subjectId,
      submittedPicks: arenaStandings.submittedPicks,
      userDisplayName: users.displayName,
      userEmail: users.email,
      voidPicks: arenaStandings.voidPicks,
      weeksPlayed: arenaStandings.weeksPlayed,
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
    accuracyBps: row.accuracyBps,
    correctPicks: row.correctPicks,
    displayName:
      kind === "league"
        ? (row.leagueName ?? "Unknown league")
        : (row.userDisplayName ?? row.userEmail ?? "Unknown player"),
    eligibleWeeks: row.eligibleWeeks,
    id: row.subjectId,
    previousRank: row.previousRank,
    rank: row.rank,
    rankDelta: row.rankDelta,
    scorablePicks: row.scorablePicks,
    submittedPicks: row.submittedPicks,
    voidPicks: row.voidPicks,
    weeksPlayed: row.weeksPlayed,
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
      accuracyBps: arenaStandings.accuracyBps,
      kind: arenaStandings.kind,
      leagueName: leagues.name,
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
      accuracyBps: row.accuracyBps,
      displayName:
        row.kind === "league"
          ? (row.leagueName ?? "Unknown league")
          : (row.userDisplayName ?? row.userEmail ?? "Unknown player"),
      id: row.subjectId,
      kind: row.kind,
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
    accuracyBps: row.accuracyBps,
    displayName: row.displayName,
    id: row.id,
    rank: row.rank,
  }));
}

function headToHeadLeague(row: ArenaLeaderboardRow): ArenaHeadToHeadLeague {
  return {
    accuracyBps: row.accuracyBps,
    correctPicks: row.correctPicks,
    displayName: row.displayName,
    eligibleWeeks: row.eligibleWeeks,
    id: row.id,
    rank: row.rank,
    rankDelta: row.rankDelta,
    scorablePicks: row.scorablePicks,
    weeksPlayed: row.weeksPlayed,
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
  const gap = anchor.accuracyBps - rival.accuracyBps;
  const leader = gap > 0 ? anchorLeague : gap < 0 ? rivalLeague : null;

  return {
    anchor: anchorLeague,
    comparison: gap > 0 ? "leading" : gap < 0 ? "trailing" : "tied",
    leader,
    marginBps: Math.abs(gap),
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
  // Independent of each other, so they overlap. `latestComputedAtBySeason`
  // does not depend on which season is selected — it summarises all of them.
  const [allSeasons, computedAtBySeason] = await Promise.all([
    loadArenaSeasons(db),
    latestComputedAtBySeason(db),
  ]);
  const season = input.seasonId
    ? (allSeasons.find((candidate) => candidate.id === input.seasonId) ??
      (await requireArenaSeason(db, input.seasonId)))
    : defaultArenaSeason(allSeasons, now);
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

  // ONE league query, not two. The board needs the full ladder for the rival
  // picker and head-to-head, and a shorter slice for display; since both read
  // in rank order the short one is always a prefix of the long one, so the
  // second round trip only ever re-fetched rows it already had.
  //
  // The two remaining queries are independent, so they run concurrently rather
  // than as a waterfall — this is the central arena page, hit by every league.
  const [allLeagueStandings, individualStandings] = await Promise.all([
    standingsForKind(db, season.id, "league", { limit: MAX_LIMIT }),
    standingsForKind(db, season.id, "individual", { limit: input.limit }),
  ]);
  const leagueStandings = allLeagueStandings.slice(
    0,
    boundedLimit(input.limit),
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
