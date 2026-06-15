// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appendBankrollLedgerEntry,
  ensureArenaSeason,
  openBankrollWeek,
} from "@/betting";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  arenaSeasons,
  arenaStandings,
  bankrollWeeks,
  betSlips,
  type League,
  leagues,
  type User,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { REALTIME_EVENTS, RecordingRealtimePublisher } from "@/realtime";
import { JOB_EVENTS } from "./events";
import {
  createBankrollRolloverFunction,
  runBankrollRollover,
} from "./functions/bankroll-rollover";
import { functions } from "./index";

const marker = `rolloverjob-${randomUUID()}`;

let handle: DbHandle;
let league: League;
let pendingLeague: League;
let pendingUser: User;
let stepLeague: League;
let stepUser: User;
let user: User;

function date(value: string): Date {
  return new Date(value);
}

async function bankrollWeekById(leagueId: string, bankrollWeekId: string) {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const [week] = await tx
      .select()
      .from(bankrollWeeks)
      .where(
        and(
          eq(bankrollWeeks.id, bankrollWeekId),
          eq(bankrollWeeks.leagueId, leagueId),
        ),
      )
      .limit(1);
    return week ?? null;
  });
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

  [user, pendingUser, stepUser] = await handle.db
    .insert(users)
    .values([
      {
        displayName: "Rollover Job User",
        email: `${marker}@example.test`,
      },
      {
        displayName: "Rollover Pending User",
        email: `${marker}-pending@example.test`,
      },
      {
        displayName: "Rollover Step User",
        email: `${marker}-step@example.test`,
      },
    ])
    .returning();
  [league, pendingLeague, stepLeague] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Rollover Job League",
        provider: "espn",
        providerLeagueId: marker,
      },
      {
        name: "Rollover Pending League",
        provider: "espn",
        providerLeagueId: `${marker}-pending`,
      },
      {
        name: "Rollover Step League",
        provider: "espn",
        providerLeagueId: `${marker}-step`,
      },
    ])
    .returning();
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(arenaSeasons)
    .where(sql`${arenaSeasons.name} = ${`${marker}-arena`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}%@example.test`}`);
  await handle.pool.end();
});

describe("bankroll rollover job", () => {
  it("is registered in the served Inngest function list", () => {
    expect(
      functions.some(
        (fn) =>
          (fn as { opts?: { id?: string } }).opts?.id === "bankroll-rollover",
      ),
    ).toBe(true);
  });

  it("rolls elapsed settled weeks, opens the next week, and rebuilds arena standings", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: league.id,
      userId: user.id,
      weekEnd: date("2040-09-08T00:00:00.000Z"),
      weekStart: date("2040-09-01T00:00:00.000Z"),
    });
    await appendBankrollLedgerEntry(handle.db, {
      amountCents: 25_000,
      bankrollWeekId: opened.week.id,
      entryType: "adjustment",
      leagueId: league.id,
      userId: user.id,
    });
    const arenaSeason = await ensureArenaSeason(handle.db, {
      endsAt: date("2040-10-01T00:00:00.000Z"),
      name: `${marker}-arena`,
      startsAt: date("2040-09-01T00:00:00.000Z"),
    });
    const realtime = new RecordingRealtimePublisher();

    const result = await runBankrollRollover({
      data: { leagueIds: [league.id], now: "2040-09-08T01:00:00.000Z" },
      deps: { db: handle.db, realtime },
    });

    expect(result).toMatchObject({
      arenaLeaderboardUpdates: [
        {
          seasonId: arenaSeason.id,
          type: REALTIME_EVENTS.arenaLeaderboardUpdated,
          v: 1,
        },
      ],
      eventName: JOB_EVENTS.bankrollRollover,
      failures: [],
      ok: true,
      rolledOverWeeks: [
        {
          bankrollWeekId: opened.week.id,
          closingBalanceCents: 1_025_000,
          createdNextWeek: true,
          leagueId: league.id,
          openingBalanceCents: 1_025_000,
          resetAmountCents: 0,
          userId: user.id,
        },
      ],
      skippedPendingWeeks: 0,
    });
    const rolled = result.rolledOverWeeks[0];
    expect(rolled.nextWeekStart).toBe("2040-09-08T00:00:00.000Z");
    expect(rolled.nextWeekEnd).toBe("2040-09-15T00:00:00.000Z");

    await expect(
      bankrollWeekById(league.id, opened.week.id),
    ).resolves.toMatchObject({
      closed: true,
      closingBalanceCents: 1_025_000,
    });
    await expect(
      bankrollWeekById(league.id, rolled.nextWeekId),
    ).resolves.toMatchObject({
      closed: false,
      openingBalanceCents: 1_025_000,
      weekStart: date("2040-09-08T00:00:00.000Z"),
    });

    const arenaRows = await handle.db
      .select()
      .from(arenaStandings)
      .where(eq(arenaStandings.seasonId, arenaSeason.id));
    expect(arenaRows.map((row) => row.kind).sort()).toEqual([
      "individual",
      "league",
    ]);
    expect(realtime.leagueLeaderboardUpdated).toEqual([
      expect.objectContaining({
        bankrollWeekId: rolled.nextWeekId,
        leagueId: league.id,
        type: REALTIME_EVENTS.leagueLeaderboardUpdated,
      }),
    ]);
    expect(realtime.arenaLeaderboardUpdated).toEqual([
      expect.objectContaining({
        seasonId: arenaSeason.id,
        type: REALTIME_EVENTS.arenaLeaderboardUpdated,
      }),
    ]);
  });

  it("does not close an elapsed week while slips are still pending", async () => {
    const opened = await openBankrollWeek(handle.db, {
      leagueId: pendingLeague.id,
      userId: pendingUser.id,
      weekEnd: date("2041-09-08T00:00:00.000Z"),
      weekStart: date("2041-09-01T00:00:00.000Z"),
    });
    await withLeagueContext(handle.db, pendingLeague.id, (tx) =>
      tx.insert(betSlips).values({
        bankrollWeekId: opened.week.id,
        combinedDecimalOdds: 2,
        idempotencyKey: `${marker}:pending`,
        kind: "single",
        leagueId: pendingLeague.id,
        placedAt: date("2041-09-07T12:00:00.000Z"),
        potentialPayoutCents: 20_000,
        requestHash: `${marker}:pending-request`,
        stakeCents: 10_000,
        status: "pending",
        userId: pendingUser.id,
      }),
    );
    const realtime = new RecordingRealtimePublisher();

    const result = await runBankrollRollover({
      data: {
        leagueIds: [pendingLeague.id],
        now: "2041-09-08T01:00:00.000Z",
      },
      deps: { db: handle.db, realtime },
    });

    expect(result.rolledOverWeeks).toEqual([]);
    expect(result.skippedPendingWeeks).toBe(1);
    await expect(
      bankrollWeekById(pendingLeague.id, opened.week.id),
    ).resolves.toMatchObject({
      closed: false,
      closingBalanceCents: null,
    });
    expect(realtime.leagueLeaderboardUpdated).toEqual([]);
    expect(realtime.arenaLeaderboardUpdated).toEqual([]);
  });

  it("runs through the Inngest step API", async () => {
    const opened = await openBankrollWeek(handle.db, {
      floorCents: 50_000,
      leagueId: stepLeague.id,
      userId: stepUser.id,
      weekEnd: date("2042-09-08T00:00:00.000Z"),
      weekStart: date("2042-09-01T00:00:00.000Z"),
    });
    await appendBankrollLedgerEntry(handle.db, {
      amountCents: -50_000,
      bankrollWeekId: opened.week.id,
      entryType: "adjustment",
      leagueId: stepLeague.id,
      userId: stepUser.id,
    });
    const realtime = new RecordingRealtimePublisher();
    const fn = createBankrollRolloverFunction(() => ({
      db: handle.db,
      realtime,
    }));
    const testEngine = new InngestTestEngine({ function: fn });

    const stepRun = await testEngine.executeStep(
      "rollover-elapsed-bankroll-weeks",
      {
        events: [
          {
            data: {
              leagueIds: [stepLeague.id],
              now: "2042-09-08T01:00:00.000Z",
            },
            name: JOB_EVENTS.bankrollRollover,
          },
        ],
      },
    );

    expect(stepRun.result).toMatchObject({
      eventName: JOB_EVENTS.bankrollRollover,
      ok: true,
      rolledOverWeeks: [
        {
          bankrollWeekId: opened.week.id,
          closingBalanceCents: 0,
          createdNextWeek: true,
          openingBalanceCents: 50_000,
          resetAmountCents: 50_000,
        },
      ],
    });
  });
});
