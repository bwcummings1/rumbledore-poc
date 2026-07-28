// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  bettingEvents,
  bettingMarkets,
  type League,
  leagues,
  oddsSnapshots,
  picks,
  type User,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { findFinishedEvents, plannedGameFinalEvents } from "./event-results";
import { openPickWeek, submitPick } from "./pickem";

/**
 * The producer that closes UIX-101.
 *
 * Bets never settled because nothing ever said a game had ended: the only
 * `game.final` emitter fired on FANTASY matchups and carried a
 * `fantasy_matchups.id`, which the settler looked up in `betting_event` — two
 * independent key spaces, so the lookup could never hit. Every run returned
 * "event_not_found" with ok:true, silently, forever.
 *
 * The regression test that matters is the last one: the emitted payload must
 * carry `bettingEventId`, because that is precisely what was missing.
 */

const marker = `eventresults-${randomUUID()}`;
const opensAt = new Date("2026-09-08T12:00:00.000Z");
const closesAt = new Date("2026-09-20T12:00:00.000Z");
const kickoff = new Date("2026-09-13T17:00:00.000Z");
const beforeKickoff = new Date("2026-09-13T16:00:00.000Z");
/** Well after the 3.5h settle window. */
const wellAfter = new Date("2026-09-13T23:00:00.000Z");

let handle: DbHandle;
let league: League;
let otherLeague: League;
let user: User;
let counter = 0;

async function seedEvent(input?: {
  startTime?: Date;
  status?: "scheduled" | "in_progress" | "final" | "canceled" | "postponed";
}) {
  counter += 1;
  const providerEventId = `${marker}-event-${counter}`;
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
      status: input?.status ?? "scheduled",
    })
    .returning();

  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${providerEventId}:market`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId: `${providerEventId}:spread`,
      status: "open",
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
      sourcePayloadHash: `${providerEventId}:snap`,
    })
    .returning();

  return { event, market, snapshot };
}

async function pickOn(
  snapshotId: string,
  targetLeague: League,
  week: number,
): Promise<void> {
  const opened = await openPickWeek(handle.db, {
    closesAt,
    leagueId: targetLeague.id,
    opensAt,
    rosterSize: 10,
    season: 2026,
    week,
  });
  await submitPick(handle.db, {
    idempotencyKey: `${marker}-${targetLeague.id}-${week}-${snapshotId}`,
    leagueId: targetLeague.id,
    now: beforeKickoff,
    oddsSnapshotId: snapshotId,
    pickWeekId: opened.pickWeekId,
    selection: "home",
    userId: user.id,
  });
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await handle.pool.query("select 1");
  await migrateSerialized(handle);

  [user] = await handle.db
    .insert(users)
    .values({ displayName: "Results User", email: `${marker}@example.test` })
    .returning();

  [league, otherLeague] = await handle.db
    .insert(leagues)
    .values([
      {
        name: "Results League",
        provider: "espn",
        providerLeagueId: `${marker}-l1`,
      },
      {
        name: "Results League 2",
        provider: "espn",
        providerLeagueId: `${marker}-l2`,
      },
    ])
    .returning();
}, 60_000);

afterAll(async () => {
  await handle?.pool.end();
});

describe("finished-event producer", () => {
  it("ignores events that have not started", async () => {
    const { snapshot } = await seedEvent();
    await pickOn(snapshot.id, league, 1);

    const found = await findFinishedEvents(handle.db, {
      limit: 1000,
      now: beforeKickoff,
    });
    expect(found).toHaveLength(0);
  });

  it("ignores an event still inside the settle window", async () => {
    const { snapshot } = await seedEvent();
    await pickOn(snapshot.id, league, 2);

    // One hour after kickoff: the game is plausibly still being played.
    const found = await findFinishedEvents(handle.db, {
      limit: 1000,
      now: new Date(kickoff.getTime() + 60 * 60 * 1000),
    });
    expect(found).toHaveLength(0);
  });

  it("finds an event once the settle window has elapsed", async () => {
    const { event, snapshot } = await seedEvent();
    await pickOn(snapshot.id, league, 3);

    const found = await findFinishedEvents(handle.db, {
      limit: 1000,
      now: wellAfter,
    });
    const match = found.find((row) => row.bettingEventId === event.id);
    expect(match).toBeDefined();
    expect(match?.leagueIds).toContain(league.id);
  });

  it("fans out to every league holding a pending pick, and no others", async () => {
    const { event, snapshot } = await seedEvent();
    await pickOn(snapshot.id, league, 4);
    await pickOn(snapshot.id, otherLeague, 4);

    const found = await findFinishedEvents(handle.db, {
      limit: 1000,
      now: wellAfter,
    });
    const match = found.find((row) => row.bettingEventId === event.id);
    expect(match?.leagueIds.slice().sort()).toEqual(
      [league.id, otherLeague.id].sort(),
    );
  });

  it("skips an event nobody picked", async () => {
    // No grading pass is owed for an event with no picks on it.
    const { event } = await seedEvent();
    const found = await findFinishedEvents(handle.db, {
      limit: 1000,
      now: wellAfter,
    });
    expect(found.map((row) => row.bettingEventId)).not.toContain(event.id);
  });

  it("stops asking once a league's picks are graded", async () => {
    const { event, snapshot } = await seedEvent();
    await pickOn(snapshot.id, league, 5);

    await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .update(picks)
        .set({ status: "correct" })
        .where(eq(picks.oddsSnapshotId, snapshot.id)),
    );

    const found = await findFinishedEvents(handle.db, {
      limit: 1000,
      now: wellAfter,
    });
    expect(found.map((row) => row.bettingEventId)).not.toContain(event.id);
  });

  it("ignores an event already marked final", async () => {
    const { event, snapshot } = await seedEvent({ status: "final" });
    await pickOn(snapshot.id, league, 6);

    const found = await findFinishedEvents(handle.db, {
      limit: 1000,
      now: wellAfter,
    });
    expect(found.map((row) => row.bettingEventId)).not.toContain(event.id);
  });

  it("ignores a canceled event, which can never resolve", async () => {
    // Without this, a canceled game stays a candidate forever and the settle
    // path returns `result_not_final` on every pass for the rest of the season.
    const { event, snapshot } = await seedEvent({ status: "canceled" });
    await pickOn(snapshot.id, league, 7);

    const found = await findFinishedEvents(handle.db, {
      limit: 1000,
      now: wellAfter,
    });
    expect(found.map((row) => row.bettingEventId)).not.toContain(event.id);
  });

  it("still considers a postponed event, which may yet be played", async () => {
    // Postponed differs from canceled: a rescheduled game moves its startTime
    // and should be graded once it is actually played.
    const { event, snapshot } = await seedEvent({ status: "postponed" });
    await pickOn(snapshot.id, league, 8);

    const found = await findFinishedEvents(handle.db, {
      limit: 1000,
      now: wellAfter,
    });
    expect(found.map((row) => row.bettingEventId)).toContain(event.id);
  });

  it("ALWAYS emits bettingEventId — the regression UIX-101 was", () => {
    // The whole defect was that the only producer carried a fantasy_matchups.id
    // in `gameId` and never set `bettingEventId`, so the settler's lookup into
    // betting_event could never hit. This payload must never rely on the
    // `?? data.gameId` fallback.
    const planned = plannedGameFinalEvents([
      { bettingEventId: "event-1", leagueIds: ["league-a", "league-b"] },
    ]);

    expect(planned).toHaveLength(2);
    for (const event of planned) {
      expect(event.data.bettingEventId).toBe("event-1");
      expect(event.data).not.toHaveProperty("gameId");
    }
  });

  it("uses deterministic event ids so a redelivery cannot grade twice", () => {
    const once = plannedGameFinalEvents([
      { bettingEventId: "e1", leagueIds: ["l1"] },
    ]);
    const again = plannedGameFinalEvents([
      { bettingEventId: "e1", leagueIds: ["l1"] },
    ]);
    expect(once[0]?.id).toBe(again[0]?.id);
    expect(once[0]?.id).toBe("game.final:l1:e1");
  });
});
