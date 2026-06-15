import { createHash } from "node:crypto";
import { type SQL, sql } from "drizzle-orm";
import { cron, NonRetriableError } from "inngest";
import { z } from "zod";
import {
  extractArenaStandingSwingSignals,
  rebuildAllArenaStandings,
  rolloverBankrollWeek,
} from "@/betting";
import { logger } from "@/core/logging";
import { recordJobRun } from "@/core/metrics";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import { leagues } from "@/db/schema";
import {
  type ArenaLeaderboardUpdatedPayload,
  type ArenaStandingsSwingPayload,
  createRealtimePublisher,
  type LeagueLeaderboardUpdatedPayload,
  REALTIME_EVENTS,
  type RealtimePublisher,
} from "@/realtime";
import { inngest } from "../client";
import {
  type ArenaStandingsSwingData,
  type BankrollRolloverData,
  JOB_EVENTS,
} from "../events";

const DEFAULT_ROLLOVER_LIMIT = 500;
const MAX_ROLLOVER_LIMIT = 2000;

export interface BankrollRolloverDependencies {
  db: Db;
  now?: () => Date;
  realtime: RealtimePublisher;
}

interface ElapsedOpenBankrollWeekRow {
  floor_cents: number | string;
  id: string;
  league_id: string;
  pending_slip_count: number | string;
  user_id: string;
  week_end: Date | string;
  week_start: Date | string;
}

interface ElapsedOpenBankrollWeek {
  bankrollWeekId: string;
  floorCents: number;
  leagueId: string;
  pendingSlipCount: number;
  userId: string;
  weekEnd: Date;
  weekStart: Date;
}

export interface RolledOverBankrollWeek {
  bankrollWeekId: string;
  closingBalanceCents: number;
  closingWeekStart: string;
  createdNextWeek: boolean;
  leagueId: string;
  nextWeekEnd: string;
  nextWeekId: string;
  nextWeekStart: string;
  openingBalanceCents: number;
  resetAmountCents: number;
  userId: string;
}

export interface BankrollRolloverFailure {
  bankrollWeekId: string;
  code: string | null;
  leagueId: string;
  message: string;
  userId: string;
}

interface PlannedArenaStandingsSwingEvent {
  data: ArenaStandingsSwingData;
  id: string;
  name: typeof JOB_EVENTS.arenaStandingsSwing;
}

export interface BankrollRolloverResponse {
  arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[];
  arenaRecapEvents: PlannedArenaStandingsSwingEvent[];
  arenaSwingSignals: ArenaStandingsSwingPayload[];
  eventName: typeof JOB_EVENTS.bankrollRollover;
  failures: BankrollRolloverFailure[];
  leagueLeaderboardUpdates: LeagueLeaderboardUpdatedPayload[];
  limit: number;
  limitReached: boolean;
  ok: true;
  rolledOverWeeks: RolledOverBankrollWeek[];
  skippedPendingWeeks: number;
}

const bankrollRolloverDataSchema = z.object({
  leagueIds: z.array(z.uuid()).max(200).optional(),
  limit: z.number().int().min(1).max(MAX_ROLLOVER_LIMIT).optional(),
  now: z.iso.datetime().optional(),
});

function toNonRetriable(error: AppError): NonRetriableError {
  return new NonRetriableError(error.message, { cause: error });
}

function parseBankrollRolloverData(
  data: unknown,
): BankrollRolloverData & { limit: number } {
  const parsed = bankrollRolloverDataSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw toNonRetriable(
      new AppError({
        cause: parsed.error,
        code: "BANKROLL_ROLLOVER_INVALID",
        message: "Bankroll rollover payload is invalid",
        status: 400,
      }),
    );
  }

  return {
    leagueIds: parsed.data.leagueIds,
    limit: parsed.data.limit ?? DEFAULT_ROLLOVER_LIMIT,
    now: parsed.data.now,
  };
}

function dateValue(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime());
}

function integerValue(value: number | string): number {
  return typeof value === "number" ? value : Number.parseInt(value, 10);
}

function nextWeekEndFor(weekStart: Date, weekEnd: Date): Date {
  const durationMs = weekEnd.getTime() - weekStart.getTime();
  if (durationMs <= 0) {
    throw new AppError({
      code: "BANKROLL_ROLLOVER_INVALID_WEEK",
      message: "Elapsed bankroll week has an invalid window",
      status: 500,
    });
  }
  return new Date(weekEnd.getTime() + durationMs);
}

async function executeRows<T>(executor: Db | LeagueScopedTx, statement: SQL) {
  const result = await executor.execute(statement);
  const maybeRows = result as unknown;
  if (Array.isArray(maybeRows)) {
    return maybeRows as T[];
  }
  return ((maybeRows as { rows?: T[] }).rows ?? []) as T[];
}

async function getLeagueIds(
  db: Db,
  leagueIds?: readonly string[],
): Promise<string[]> {
  if (leagueIds) {
    return [...leagueIds];
  }

  const rows = await db
    .select({ id: leagues.id })
    .from(leagues)
    .orderBy(leagues.id);
  return rows.map((row) => row.id);
}

async function loadElapsedOpenWeeksForLeague({
  db,
  leagueId,
  now,
}: {
  db: Db;
  leagueId: string;
  now: Date;
}): Promise<ElapsedOpenBankrollWeek[]> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const rows = await executeRows<ElapsedOpenBankrollWeekRow>(
      tx,
      sql`
        select
          bw.id,
          bw.league_id,
          bw.user_id,
          bw.week_start,
          bw.week_end,
          bw.floor_cents,
          (
            select count(*)::integer
            from bet_slips bs
            where bs.league_id = bw.league_id
              and bs.user_id = bw.user_id
              and bs.bankroll_week_id = bw.id
              and bs.status = 'pending'
          ) as pending_slip_count
        from bankroll_weeks bw
        where bw.league_id = ${leagueId}
          and bw.closed = false
          and bw.week_end <= ${now}
        order by bw.week_end asc, bw.user_id asc
      `,
    );

    return rows.map((row) => ({
      bankrollWeekId: row.id,
      floorCents: integerValue(row.floor_cents),
      leagueId: row.league_id,
      pendingSlipCount: integerValue(row.pending_slip_count),
      userId: row.user_id,
      weekEnd: dateValue(row.week_end),
      weekStart: dateValue(row.week_start),
    }));
  });
}

async function loadElapsedOpenWeeks({
  db,
  leagueIds,
  now,
}: {
  db: Db;
  leagueIds?: readonly string[];
  now: Date;
}): Promise<ElapsedOpenBankrollWeek[]> {
  const resolvedLeagueIds = await getLeagueIds(db, leagueIds);
  const weeks: ElapsedOpenBankrollWeek[] = [];
  for (const leagueId of resolvedLeagueIds) {
    weeks.push(...(await loadElapsedOpenWeeksForLeague({ db, leagueId, now })));
  }
  return weeks;
}

function failureFromError(
  week: ElapsedOpenBankrollWeek,
  error: unknown,
): BankrollRolloverFailure {
  const maybeError = error as {
    code?: unknown;
    message?: unknown;
  };
  return {
    bankrollWeekId: week.bankrollWeekId,
    code: typeof maybeError.code === "string" ? maybeError.code : null,
    leagueId: week.leagueId,
    message:
      typeof maybeError.message === "string"
        ? maybeError.message
        : "Bankroll rollover failed",
    userId: week.userId,
  };
}

async function rolloverElapsedBankrollWeeks({
  db,
  leagueIds,
  limit,
  now,
}: {
  db: Db;
  leagueIds?: readonly string[];
  limit: number;
  now: Date;
}): Promise<{
  failures: BankrollRolloverFailure[];
  limitReached: boolean;
  rolledOverWeeks: RolledOverBankrollWeek[];
  skippedPendingWeeks: number;
}> {
  const attemptedWeekIds = new Set<string>();
  const pendingWeekIds = new Set<string>();
  const failures: BankrollRolloverFailure[] = [];
  const rolledOverWeeks: RolledOverBankrollWeek[] = [];

  while (rolledOverWeeks.length < limit) {
    const elapsedWeeks = await loadElapsedOpenWeeks({ db, leagueIds, now });
    let processedInCycle = false;

    for (const week of elapsedWeeks) {
      if (week.pendingSlipCount > 0) {
        pendingWeekIds.add(week.bankrollWeekId);
        continue;
      }
      if (attemptedWeekIds.has(week.bankrollWeekId)) {
        continue;
      }
      if (rolledOverWeeks.length >= limit) {
        break;
      }

      attemptedWeekIds.add(week.bankrollWeekId);
      try {
        const nextWeekEnd = nextWeekEndFor(week.weekStart, week.weekEnd);
        const rollover = await rolloverBankrollWeek(db, {
          closingWeekStart: week.weekStart,
          floorCents: week.floorCents,
          leagueId: week.leagueId,
          nextWeekEnd,
          nextWeekStart: week.weekEnd,
          now,
          userId: week.userId,
        });
        rolledOverWeeks.push({
          bankrollWeekId: week.bankrollWeekId,
          closingBalanceCents: rollover.closingBalanceCents,
          closingWeekStart: week.weekStart.toISOString(),
          createdNextWeek: rollover.createdNextWeek,
          leagueId: week.leagueId,
          nextWeekEnd: rollover.nextWeek.weekEnd.toISOString(),
          nextWeekId: rollover.nextWeek.id,
          nextWeekStart: rollover.nextWeek.weekStart.toISOString(),
          openingBalanceCents: rollover.openingBalanceCents,
          resetAmountCents: rollover.resetAmountCents,
          userId: week.userId,
        });
        processedInCycle = true;
      } catch (error) {
        const failure = failureFromError(week, error);
        failures.push(failure);
        logger.warn("Bankroll rollover skipped failed week", {
          error,
          failure,
        });
      }
    }

    if (!processedInCycle) {
      break;
    }
  }

  return {
    failures,
    limitReached: rolledOverWeeks.length >= limit,
    rolledOverWeeks,
    skippedPendingWeeks: pendingWeekIds.size,
  };
}

function uniqueBy<T>(values: readonly T[], keyFor: (value: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const value of values) {
    const key = keyFor(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

async function publishRolloverRealtimeSignals({
  arenaResults,
  at,
  deps,
  rolledOverWeeks,
}: {
  arenaResults: Awaited<ReturnType<typeof rebuildAllArenaStandings>>;
  at: string;
  deps: BankrollRolloverDependencies;
  rolledOverWeeks: readonly RolledOverBankrollWeek[];
}): Promise<{
  arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[];
  arenaSwingSignals: ArenaStandingsSwingPayload[];
  leagueLeaderboardUpdates: LeagueLeaderboardUpdatedPayload[];
}> {
  const leagueLeaderboardUpdates = uniqueBy(
    rolledOverWeeks.map((week) => ({
      at,
      bankrollWeekId: week.nextWeekId,
      leagueId: week.leagueId,
      type: REALTIME_EVENTS.leagueLeaderboardUpdated,
      v: 1 as const,
    })),
    (payload) => `${payload.leagueId}:${payload.bankrollWeekId}`,
  );

  const arenaLeaderboardUpdates: ArenaLeaderboardUpdatedPayload[] =
    arenaResults.map((arenaResult) => ({
      at,
      seasonId: arenaResult.season?.id ?? null,
      type: REALTIME_EVENTS.arenaLeaderboardUpdated,
      v: 1,
    }));

  const arenaSwingSignals: ArenaStandingsSwingPayload[] = [];
  for (const arenaResult of arenaResults) {
    if (!arenaResult.season || !arenaResult.computedAt) {
      continue;
    }
    const swings = extractArenaStandingSwingSignals(arenaResult);
    if (swings.length === 0) {
      continue;
    }
    arenaSwingSignals.push({
      at,
      computedAt: arenaResult.computedAt,
      seasonId: arenaResult.season.id,
      swings: swings.map((swing) => ({
        kind: swing.kind,
        leagueId: swing.leagueId,
        netPnlCents: swing.netPnlCents,
        newRank: swing.newRank,
        oldRank: swing.oldRank,
        rankDelta: swing.rankDelta,
        subjectId: swing.subjectId,
        userId: swing.userId,
      })),
      type: REALTIME_EVENTS.arenaStandingsSwing,
      v: 1,
    });
  }

  try {
    for (const payload of leagueLeaderboardUpdates) {
      await deps.realtime.publishLeagueLeaderboardUpdated(payload);
    }
    for (const payload of arenaLeaderboardUpdates) {
      await deps.realtime.publishArenaLeaderboardUpdated(payload);
    }
    for (const payload of arenaSwingSignals) {
      await deps.realtime.publishArenaStandingsSwing(payload);
    }
  } catch (error) {
    logger.warn("Realtime bankroll rollover signal failed", { error });
  }

  return {
    arenaLeaderboardUpdates,
    arenaSwingSignals,
    leagueLeaderboardUpdates,
  };
}

function hashIds(ids: readonly string[]): string {
  return createHash("sha256")
    .update([...ids].sort().join("\n"))
    .digest("hex");
}

function planArenaSwingContentEvents({
  arenaSwingSignals,
  rolledOverWeeks,
}: {
  arenaSwingSignals: readonly ArenaStandingsSwingPayload[];
  rolledOverWeeks: readonly RolledOverBankrollWeek[];
}): PlannedArenaStandingsSwingEvent[] {
  if (arenaSwingSignals.length === 0 || rolledOverWeeks.length === 0) {
    return [];
  }

  const seasonIds = [
    ...new Set(arenaSwingSignals.map((signal) => signal.seasonId)),
  ];
  const affectedLeagueIds = [
    ...new Set([
      ...rolledOverWeeks.map((week) => week.leagueId),
      ...arenaSwingSignals.flatMap((signal) =>
        signal.swings.flatMap((swing) =>
          swing.kind === "league" && swing.leagueId ? [swing.leagueId] : [],
        ),
      ),
    ]),
  ];
  const rolloverHash = hashIds(
    rolledOverWeeks.map((week) => week.bankrollWeekId),
  );

  return seasonIds.flatMap((seasonId) =>
    affectedLeagueIds.map((leagueId) => {
      const swingKey = `rollover:${rolloverHash}:${leagueId}`;
      return {
        data: { leagueId, seasonId, swingKey },
        id: `${JOB_EVENTS.arenaStandingsSwing}:${leagueId}:${seasonId}:${swingKey}`,
        name: JOB_EVENTS.arenaStandingsSwing,
      };
    }),
  );
}

async function getDefaultBankrollRolloverDependencies(): Promise<BankrollRolloverDependencies> {
  const [{ getDb }, { getEnv }] = await Promise.all([
    import("@/db"),
    import("@/core/env"),
  ]);
  const env = getEnv();
  return {
    db: getDb(),
    realtime: createRealtimePublisher(env),
  };
}

export async function runBankrollRollover({
  data: rawData,
  deps,
}: {
  data: unknown;
  deps: BankrollRolloverDependencies;
}): Promise<BankrollRolloverResponse> {
  const data = parseBankrollRolloverData(rawData);
  const now = data.now ? new Date(data.now) : (deps.now?.() ?? new Date());
  const rolloverResult = await rolloverElapsedBankrollWeeks({
    db: deps.db,
    leagueIds: data.leagueIds,
    limit: data.limit,
    now,
  });
  const arenaResults =
    rolloverResult.rolledOverWeeks.length > 0
      ? await rebuildAllArenaStandings(deps.db, { computedAt: now })
      : [];
  const realtimeSignals =
    rolloverResult.rolledOverWeeks.length > 0
      ? await publishRolloverRealtimeSignals({
          arenaResults,
          at: now.toISOString(),
          deps,
          rolledOverWeeks: rolloverResult.rolledOverWeeks,
        })
      : {
          arenaLeaderboardUpdates: [],
          arenaSwingSignals: [],
          leagueLeaderboardUpdates: [],
        };
  const arenaRecapEvents = planArenaSwingContentEvents({
    arenaSwingSignals: realtimeSignals.arenaSwingSignals,
    rolledOverWeeks: rolloverResult.rolledOverWeeks,
  });

  return {
    ...rolloverResult,
    arenaLeaderboardUpdates: realtimeSignals.arenaLeaderboardUpdates,
    arenaRecapEvents,
    arenaSwingSignals: realtimeSignals.arenaSwingSignals,
    eventName: JOB_EVENTS.bankrollRollover,
    leagueLeaderboardUpdates: realtimeSignals.leagueLeaderboardUpdates,
    limit: data.limit,
    ok: true,
  };
}

export function createBankrollRolloverFunction(
  resolveDeps: () =>
    | BankrollRolloverDependencies
    | Promise<BankrollRolloverDependencies> = getDefaultBankrollRolloverDependencies,
) {
  return inngest.createFunction(
    {
      description:
        "Closes elapsed paper-betting bankroll weeks with no pending slips, opens the next week, and refreshes arena standings.",
      id: "bankroll-rollover",
      idempotency: "event.id",
      name: "Bankroll weekly rollover",
      triggers: [
        { event: JOB_EVENTS.bankrollRollover },
        cron("TZ=UTC 15 * * * *"),
      ],
    },
    async ({ event, step }): Promise<BankrollRolloverResponse> =>
      recordJobRun("bankroll-rollover", async () => {
        const deps = await resolveDeps();
        const result = await step.run("rollover-elapsed-bankroll-weeks", () =>
          runBankrollRollover({ data: event.data, deps }),
        );
        if (result.arenaRecapEvents.length > 0) {
          await step.sendEvent(
            "send-arena-rollover-content-events",
            result.arenaRecapEvents,
          );
        }
        return result;
      }),
  );
}

export const bankrollRollover = createBankrollRolloverFunction();
