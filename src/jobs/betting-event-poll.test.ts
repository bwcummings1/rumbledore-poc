// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPickWeek } from "@/betting/pickem";
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
import { JOB_EVENTS } from "./events";
import {
  bettingEventPoll,
  runBettingEventPoll,
} from "./functions/betting-event-poll";
import { functions } from "./index";

const marker = `eventpoll-${randomUUID()}`;
/** Dated far ahead of other suites' fixtures so the newest-first slice is ours. */
const kickoff = new Date("2041-09-13T17:00:00.000Z");
const wellAfter = new Date("2041-09-13T23:00:00.000Z");

let handle: DbHandle;
let league: League;
let user: User;
let counter = 0;

async function seedEventWithPendingPick(startTime = kickoff) {
  counter += 1;
  const id = `${marker}-e${counter}`;
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: "Away",
      contentHash: `${id}:e`,
      homeTeam: "Home",
      provider: marker,
      providerEventId: id,
      sport: "nfl",
      startTime,
      status: "scheduled",
    })
    .returning();
  const [market] = await handle.db
    .insert(bettingMarkets)
    .values({
      contentHash: `${id}:m`,
      eventId: event.id,
      period: "full_game",
      provider: marker,
      providerMarketId: id,
      status: "open",
      subject: "game",
      type: "moneyline",
    })
    .returning();
  const [snapshot] = await handle.db
    .insert(oddsSnapshots)
    .values({
      awayPrice: -110,
      capturedAt: new Date(startTime.getTime() - 60 * 60 * 1000),
      homePrice: -110,
      marketId: market.id,
      provider: marker,
      sourcePayloadHash: `${id}:s`,
    })
    .returning();

  const week = await openPickWeek(handle.db, {
    closesAt: new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000),
    leagueId: league.id,
    maxPicksPerUser: 5,
    opensAt: new Date(startTime.getTime() - 5 * 24 * 60 * 60 * 1000),
    rosterSize: 2,
    season: 2041,
    week: counter,
  });
  await withLeagueContext(handle.db, league.id, (tx) =>
    tx.insert(picks).values({
      idempotencyKey: `${marker}-p${counter}`,
      leagueId: league.id,
      marketId: market.id,
      oddsSnapshotId: snapshot.id,
      pickWeekId: week.pickWeekId,
      selection: "home",
      userId: user.id,
    }),
  );
  return event;
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await handle.pool.query("select 1");
  await migrateSerialized(handle);

  [user] = await handle.db
    .insert(users)
    .values({ displayName: "Poller", email: `${marker}@example.test` })
    .returning();
  [league] = await handle.db
    .insert(leagues)
    .values({ name: "Poll", provider: "espn", providerLeagueId: marker })
    .returning();
}, 90_000);

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}%`}`);
  await handle.db.delete(users).where(sql`${users.email} like ${`${marker}%`}`);
  await handle.db
    .delete(bettingEvents)
    .where(eq(bettingEvents.provider, marker));
  await handle.pool.end();
});

describe("betting event poll", () => {
  it("requests grading for a finished event that still has pending picks", async () => {
    // This job is the wire that was missing. `findFinishedEvents` and
    // `plannedGameFinalEvents` existed with green tests and NO importer, so the
    // only live grading trigger carried a fantasy-matchup id and the grader
    // reported `event_not_found` forever. UIX-101 survived its own fix.
    const event = await seedEventWithPendingPick();

    const result = await runBettingEventPoll({
      deps: { db: handle.db, now: () => wellAfter },
    });

    const planned = result.planned.filter(
      (candidate) => candidate.data.bettingEventId === event.id,
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({
      data: { bettingEventId: event.id, leagueId: league.id },
      // The dedicated event, NOT game.final. Overloading one event for the
      // fantasy-matchup producer and this one is what made the payload
      // ambiguous in the first place.
      name: JOB_EVENTS.bettingEventFinal,
    });
    // Deterministic on (league, event) so an Inngest redelivery deduplicates
    // instead of grading twice.
    expect(planned[0]?.id).toBe(`game.final:${league.id}:${event.id}`);
  }, 90_000);

  it("ignores an event still inside its settle window", async () => {
    const event = await seedEventWithPendingPick();

    // One hour after kickoff: the game is plausibly still being played.
    const result = await runBettingEventPoll({
      deps: {
        db: handle.db,
        now: () => new Date(kickoff.getTime() + 60 * 60 * 1000),
      },
    });

    expect(
      result.planned.map((candidate) => candidate.data.bettingEventId),
    ).not.toContain(event.id);
  }, 90_000);

  it("is exported through the shared function registry", () => {
    // The registry is what Inngest reads. A job absent from it is exactly the
    // orphan class this whole change exists to close.
    expect(functions).toContain(bettingEventPoll);
  });
});
