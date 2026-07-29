import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { withLeagueContext } from "@/db/rls";
import {
  bettingEvents,
  bettingMarkets,
  oddsSnapshots,
  pickWeeks,
  picks,
} from "@/db/schema";
import { scorePickWeek } from "./pickem-scoring";

/**
 * Read path for a league's Pick 'em desk.
 *
 * Replaces `getLeagueBetData`'s bankroll/slip view. Design of record:
 * `PROJECT_CONTEXT.md` §3.3.
 *
 * Deliberately server-side and pure of React so the shape can be tested without
 * a component harness — the numbers here drive an inter-league competition, so
 * they deserve assertions rather than a snapshot.
 */

export type PickemStatus = "ready" | "no_open_week";

export interface PickemSlateOption {
  readonly oddsSnapshotId: string;
  readonly marketId: string;
  readonly marketType: string;
  readonly eventId: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly startTime: string;
  readonly line: number | null;
  readonly homePrice: number | null;
  readonly awayPrice: number | null;
  readonly overPrice: number | null;
  readonly underPrice: number | null;
  /** True once the event has started; the server rejects these regardless. */
  readonly locked: boolean;
}

export interface PickemSubmittedPick {
  readonly pickId: string;
  readonly marketId: string;
  readonly selection: string;
  readonly status: string;
  readonly lockedLine: number | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly startTime: string;
  readonly submittedAt: string;
}

export interface LeaguePickemData {
  readonly status: PickemStatus;
  readonly week: {
    readonly pickWeekId: string;
    readonly season: number;
    readonly week: number;
    readonly rosterSize: number;
    readonly maxPicksPerUser: number;
    readonly opensAt: string;
    readonly closesAt: string;
  } | null;
  readonly you: {
    readonly submittedPicks: number;
    readonly remainingPicks: number;
    readonly picks: readonly PickemSubmittedPick[];
  };
  readonly league: {
    readonly correctPicks: number;
    readonly scorablePicks: number;
    readonly accuracy: number;
    readonly participationRate: number;
    readonly isEligibleForWeeklyPrize: boolean;
  };
  readonly slate: readonly PickemSlateOption[];
}

const EMPTY: LeaguePickemData = {
  league: {
    accuracy: 0,
    correctPicks: 0,
    isEligibleForWeeklyPrize: false,
    participationRate: 0,
    scorablePicks: 0,
  },
  slate: [],
  status: "no_open_week",
  week: null,
  you: { picks: [], remainingPicks: 0, submittedPicks: 0 },
};

export interface LeaguePickemInput {
  readonly leagueId: string;
  readonly userId: string;
  readonly now?: Date;
  /** Slate size cap. The pick universe is wide by design, so the UI pages it. */
  readonly slateLimit?: number;
}

export async function getLeaguePickemData(
  db: Db,
  input: LeaguePickemInput,
): Promise<LeaguePickemData> {
  const now = input.now ?? new Date();

  return withLeagueContext(db, input.leagueId, async (tx) => {
    // The open week is the one whose window contains `now`. There is at most
    // one, enforced by the (league, season, week) unique index plus non-
    // overlapping windows.
    const [week] = await tx
      .select()
      .from(pickWeeks)
      .where(
        and(
          eq(pickWeeks.leagueId, input.leagueId),
          gt(pickWeeks.closesAt, now),
        ),
      )
      .orderBy(asc(pickWeeks.opensAt))
      .limit(1);

    if (!week) {
      return EMPTY;
    }

    const weekPicks = await tx
      .select({
        awayTeam: bettingEvents.awayTeam,
        homeTeam: bettingEvents.homeTeam,
        lockedLine: picks.lockedLine,
        marketId: picks.marketId,
        pickId: picks.id,
        selection: picks.selection,
        startTime: bettingEvents.startTime,
        status: picks.status,
        submittedAt: picks.submittedAt,
        userId: picks.userId,
      })
      .from(picks)
      .innerJoin(bettingMarkets, eq(bettingMarkets.id, picks.marketId))
      .innerJoin(bettingEvents, eq(bettingEvents.id, bettingMarkets.eventId))
      .where(
        and(
          eq(picks.leagueId, input.leagueId),
          eq(picks.pickWeekId, week.id),
        ),
      );

    const yours = weekPicks.filter((row) => row.userId === input.userId);
    const voidPicks = weekPicks.filter((row) => row.status === "void").length;
    const correctPicks = weekPicks.filter(
      (row) => row.status === "correct",
    ).length;

    const score = scorePickWeek({
      correctPicks,
      maxPicksPerUser: week.maxPicksPerUser,
      rosterSize: week.rosterSize,
      // Void picks were submitted but are not scorable, so counting them would
      // let pushes inflate the participation gate.
      submittedPicks: weekPicks.length - voidPicks,
      voidPicks,
    });

    // The slate: latest snapshot per open market on an event that has not
    // started. Markets the user already picked are excluded — one pick per
    // market per week is enforced by a unique index, so offering them again
    // would only produce a failed submit.
    const pickedMarketIds = new Set(yours.map((row) => row.marketId));

    const snapshotRows = await tx
      .select({
        awayPrice: oddsSnapshots.awayPrice,
        awayTeam: bettingEvents.awayTeam,
        capturedAt: oddsSnapshots.capturedAt,
        eventId: bettingEvents.id,
        homePrice: oddsSnapshots.homePrice,
        homeTeam: bettingEvents.homeTeam,
        line: oddsSnapshots.line,
        marketId: bettingMarkets.id,
        marketType: bettingMarkets.type,
        overPrice: oddsSnapshots.overPrice,
        snapshotId: oddsSnapshots.id,
        startTime: bettingEvents.startTime,
        underPrice: oddsSnapshots.underPrice,
      })
      .from(oddsSnapshots)
      .innerJoin(bettingMarkets, eq(bettingMarkets.id, oddsSnapshots.marketId))
      .innerJoin(bettingEvents, eq(bettingEvents.id, bettingMarkets.eventId))
      .where(
        and(
          eq(bettingMarkets.status, "open"),
          gt(bettingEvents.startTime, now),
          inArray(bettingEvents.status, ["scheduled"]),
        ),
      )
      .orderBy(asc(bettingEvents.startTime));

    // Latest snapshot wins per market — odds move, and a pick must be priced
    // from the number the user is actually looking at.
    const latestByMarket = new Map<string, (typeof snapshotRows)[number]>();
    for (const row of snapshotRows) {
      const seen = latestByMarket.get(row.marketId);
      if (!seen || row.capturedAt > seen.capturedAt) {
        latestByMarket.set(row.marketId, row);
      }
    }

    const slate: PickemSlateOption[] = [...latestByMarket.values()]
      .filter((row) => !pickedMarketIds.has(row.marketId))
      .slice(0, input.slateLimit ?? 100)
      .map((row) => ({
        awayPrice: row.awayPrice,
        awayTeam: row.awayTeam,
        eventId: row.eventId,
        homePrice: row.homePrice,
        homeTeam: row.homeTeam,
        line: row.line,
        locked: row.startTime <= now,
        marketId: row.marketId,
        marketType: row.marketType,
        oddsSnapshotId: row.snapshotId,
        overPrice: row.overPrice,
        startTime: row.startTime.toISOString(),
        underPrice: row.underPrice,
      }));

    return {
      league: {
        accuracy: score.accuracy,
        correctPicks,
        isEligibleForWeeklyPrize: score.isEligibleForWeeklyPrize,
        participationRate: score.participationRate,
        scorablePicks: score.scorablePicks,
      },
      slate,
      status: "ready" as const,
      week: {
        closesAt: week.closesAt.toISOString(),
        maxPicksPerUser: week.maxPicksPerUser,
        opensAt: week.opensAt.toISOString(),
        pickWeekId: week.id,
        rosterSize: week.rosterSize,
        season: week.season,
        week: week.week,
      },
      you: {
        picks: yours.map((row) => ({
          awayTeam: row.awayTeam,
          homeTeam: row.homeTeam,
          lockedLine: row.lockedLine,
          marketId: row.marketId,
          pickId: row.pickId,
          selection: row.selection,
          startTime: row.startTime.toISOString(),
          status: row.status,
          submittedAt: row.submittedAt.toISOString(),
        })),
        remainingPicks: Math.max(week.maxPicksPerUser - yours.length, 0),
        submittedPicks: yours.length,
      },
    };
  });
}
