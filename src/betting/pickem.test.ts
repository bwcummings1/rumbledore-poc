// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  type BettingMarket,
  bettingEvents,
  bettingMarkets,
  type League,
  leagues,
  type OddsSnapshot,
  oddsSnapshots,
  picks,
  type User,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { loadPickWeekTally, openPickWeek, submitPick } from "./pickem";

/**
 * Pick submission invariants.
 *
 * The idempotency test is the important one: under the bankroll model the same
 * defect double-STAKED money (UIX-001). Here it would double-count a pick and
 * corrupt a league's accuracy, which is the thing an inter-league competition
 * is decided on.
 */

const marker = `pickemtest-${randomUUID()}`;
const opensAt = new Date("2026-09-08T12:00:00.000Z");
const closesAt = new Date("2026-09-15T12:00:00.000Z");
const kickoff = new Date("2026-09-13T17:00:00.000Z");
const beforeKickoff = new Date("2026-09-13T16:00:00.000Z");

let handle: DbHandle;
let league: League;
let user: User;
let eventCounter = 0;

async function seedSnapshot(input?: {
  marketStatus?: "open" | "suspended" | "settled" | "void";
  startTime?: Date;
}): Promise<{ market: BettingMarket; snapshot: OddsSnapshot }> {
  eventCounter += 1;
  const providerEventId = `${marker}-event-${eventCounter}`;
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: "Arizona Cardinals",
      contentHash: `${providerEventId}:event`,
      homeTeam: "Seattle Seahawks",
      provider: marker,
      providerEventId,
      sport: "nfl",
      startTime: input?.startTime ?? kickoff,
      status: "scheduled",
    })
    .returning();

  const providerMarketId = `${providerEventId}:spread`;
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${providerMarketId}:market`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId,
      status: input?.marketStatus ?? "open",
      subject: "game",
      type: "spread",
    })
    .returning();

  const [snapshot] = await handle.db
    .insert(oddsSnapshots)
    .values({
      awayPrice: -110,
      capturedAt: opensAt,
      homePrice: -110,
      line: -3.5,
      marketId: market.id,
      provider: marker,
      sourcePayloadHash: `${providerMarketId}:snapshot:1`,
    })
    .returning();

  return { market, snapshot };
}

async function picksFor(pickWeekId: string) {
  return withLeagueContext(handle.db, league.id, (tx) =>
    tx
      .select()
      .from(picks)
      .where(
        and(eq(picks.leagueId, league.id), eq(picks.pickWeekId, pickWeekId)),
      ),
  );
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

  [user] = await handle.db
    .insert(users)
    .values({ displayName: "Pick User", email: `${marker}@example.test` })
    .returning();

  [league] = await handle.db
    .insert(leagues)
    .values({
      name: "Pick League",
      provider: "espn",
      providerLeagueId: `${marker}-league`,
    })
    .returning();
}, 60_000);

afterAll(async () => {
  await handle?.pool.end();
});

describe("Pick 'em submission", () => {
  it("snapshots roster size when the week opens and does not re-snapshot", async () => {
    // The snapshot is what stops a league shrinking its own denominator
    // mid-week by cutting inactive members, so re-opening must be a no-op.
    const first = await openPickWeek(handle.db, {
      closesAt,
      leagueId: league.id,
      opensAt,
      rosterSize: 12,
      season: 2026,
      week: 1,
    });
    expect(first.created).toBe(true);

    const second = await openPickWeek(handle.db, {
      closesAt,
      leagueId: league.id,
      opensAt,
      rosterSize: 4, // a shrunken roster must NOT overwrite the snapshot
      season: 2026,
      week: 1,
    });
    expect(second.created).toBe(false);
    expect(second.pickWeekId).toBe(first.pickWeekId);

    const tally = await loadPickWeekTally(handle.db, {
      leagueId: league.id,
      pickWeekId: first.pickWeekId,
    });
    expect(tally?.rosterSize).toBe(12);
  });

  it("returns the same pick for a replayed idempotency key (UIX-001 reshaped)", async () => {
    const week = await openPickWeek(handle.db, {
      closesAt,
      leagueId: league.id,
      opensAt,
      rosterSize: 10,
      season: 2026,
      week: 2,
    });
    const { snapshot } = await seedSnapshot();
    const key = `${marker}-replay-key`;

    const first = await submitPick(handle.db, {
      idempotencyKey: key,
      leagueId: league.id,
      now: beforeKickoff,
      oddsSnapshotId: snapshot.id,
      pickWeekId: week.pickWeekId,
      selection: "home",
      userId: user.id,
    });
    // Same key replayed, exactly as a client retry after a timed-out response.
    const second = await submitPick(handle.db, {
      idempotencyKey: key,
      leagueId: league.id,
      now: beforeKickoff,
      oddsSnapshotId: snapshot.id,
      pickWeekId: week.pickWeekId,
      selection: "home",
      userId: user.id,
    });

    expect(second.deduplicated).toBe(true);
    expect(second.pickId).toBe(first.pickId);
    const rows = await picksFor(week.pickWeekId);
    expect(rows).toHaveLength(1);
  });

  it("rejects a pick once the event has started", async () => {
    const week = await openPickWeek(handle.db, {
      closesAt,
      leagueId: league.id,
      opensAt,
      rosterSize: 10,
      season: 2026,
      week: 3,
    });
    const { snapshot } = await seedSnapshot();

    // The week is still open, but this game has kicked off — picking it now
    // would not be a UX annoyance, it would be cheating.
    await expect(
      submitPick(handle.db, {
        idempotencyKey: `${marker}-late`,
        leagueId: league.id,
        now: new Date(kickoff.getTime() + 60_000),
        oddsSnapshotId: snapshot.id,
        pickWeekId: week.pickWeekId,
        selection: "home",
        userId: user.id,
      }),
    ).rejects.toMatchObject({ code: "PICK_EVENT_STARTED" });

    expect(await picksFor(week.pickWeekId)).toHaveLength(0);
  });

  it("enforces the weekly allowance server-side", async () => {
    const week = await openPickWeek(handle.db, {
      closesAt,
      leagueId: league.id,
      maxPicksPerUser: 2,
      opensAt,
      rosterSize: 10,
      season: 2026,
      week: 4,
    });

    for (let index = 0; index < 2; index += 1) {
      const { snapshot } = await seedSnapshot();
      const result = await submitPick(handle.db, {
        idempotencyKey: `${marker}-allow-${index}`,
        leagueId: league.id,
        now: beforeKickoff,
        oddsSnapshotId: snapshot.id,
        pickWeekId: week.pickWeekId,
        selection: "home",
        userId: user.id,
      });
      expect(result.remainingPicks).toBe(1 - index);
    }

    const { snapshot: extra } = await seedSnapshot();
    await expect(
      submitPick(handle.db, {
        idempotencyKey: `${marker}-allow-over`,
        leagueId: league.id,
        now: beforeKickoff,
        oddsSnapshotId: extra.id,
        pickWeekId: week.pickWeekId,
        selection: "home",
        userId: user.id,
      }),
    ).rejects.toMatchObject({ code: "PICK_ALLOWANCE_EXHAUSTED" });

    expect(await picksFor(week.pickWeekId)).toHaveLength(2);
  });

  it("rejects a closed market", async () => {
    const week = await openPickWeek(handle.db, {
      closesAt,
      leagueId: league.id,
      opensAt,
      rosterSize: 10,
      season: 2026,
      week: 5,
    });
    const { snapshot } = await seedSnapshot({ marketStatus: "suspended" });

    await expect(
      submitPick(handle.db, {
        idempotencyKey: `${marker}-suspended`,
        leagueId: league.id,
        now: beforeKickoff,
        oddsSnapshotId: snapshot.id,
        pickWeekId: week.pickWeekId,
        selection: "home",
        userId: user.id,
      }),
    ).rejects.toMatchObject({ code: "PICK_MARKET_CLOSED" });
  });

  it("excludes void picks from the submitted count the participation gate reads", async () => {
    const week = await openPickWeek(handle.db, {
      closesAt,
      leagueId: league.id,
      opensAt,
      rosterSize: 1,
      season: 2026,
      week: 6,
    });
    const { snapshot } = await seedSnapshot();
    await submitPick(handle.db, {
      idempotencyKey: `${marker}-void`,
      leagueId: league.id,
      now: beforeKickoff,
      oddsSnapshotId: snapshot.id,
      pickWeekId: week.pickWeekId,
      selection: "home",
      userId: user.id,
    });

    await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .update(picks)
        .set({ status: "void" })
        .where(eq(picks.pickWeekId, week.pickWeekId)),
    );

    const tally = await loadPickWeekTally(handle.db, {
      leagueId: league.id,
      pickWeekId: week.pickWeekId,
    });
    // A void pick was submitted but is not scorable, so counting it as
    // submitted would let pushes inflate participation.
    expect(tally?.voidPicks).toBe(1);
    expect(tally?.submittedPicks).toBe(0);
  });
});
