// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import {
  bettingEvents,
  bettingMarkets,
  type League,
  leagues,
  oddsSnapshots,
  type User,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { getLeaguePickemData } from "./league-pickem";
import { openPickWeek, submitPick } from "./pickem";

const marker = `leaguepickem-${randomUUID()}`;
const season = 2098;
const opensAt = new Date("2026-09-08T12:00:00.000Z");
const closesAt = new Date("2026-09-20T12:00:00.000Z");
const kickoff = new Date("2026-09-13T17:00:00.000Z");
const now = new Date("2026-09-13T16:00:00.000Z");

let handle: DbHandle;
let league: League;
let user: User;
let counter = 0;

async function seedMarket(startTime = kickoff) {
  counter += 1;
  const id = `${marker}-e${counter}`;
  const [event] = await handle.db
    .insert(bettingEvents)
    .values({
      awayTeam: `Away ${counter}`,
      contentHash: `${id}:e`,
      homeTeam: `Home ${counter}`,
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
      providerMarketId: `${id}:spread`,
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
      sourcePayloadHash: `${id}:s1`,
    })
    .returning();
  return { event, market, snapshot };
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await handle.pool.query("select 1");
  await migrateSerialized(handle);

  [user] = await handle.db
    .insert(users)
    .values({ displayName: "Desk", email: `${marker}@example.test` })
    .returning();
  [league] = await handle.db
    .insert(leagues)
    .values({ name: "Desk", provider: "espn", providerLeagueId: marker })
    .returning();
}, 90_000);

afterAll(async () => {
  await handle?.pool.end();
});

describe("league Pick 'em desk", () => {
  it("reports no open week before one exists", async () => {
    const data = await getLeaguePickemData(handle.db, {
      leagueId: league.id,
      now,
      slateLimit: 5000,
      userId: user.id,
    });
    expect(data.status).toBe("no_open_week");
    expect(data.week).toBeNull();
  });

  it("surfaces the open week with the full allowance remaining", async () => {
    await openPickWeek(handle.db, {
      closesAt,
      leagueId: league.id,
      maxPicksPerUser: 10,
      opensAt,
      rosterSize: 4,
      season,
      week: 1,
    });

    const data = await getLeaguePickemData(handle.db, {
      leagueId: league.id,
      now,
      slateLimit: 5000,
      userId: user.id,
    });
    expect(data.status).toBe("ready");
    expect(data.week?.rosterSize).toBe(4);
    expect(data.you.remainingPicks).toBe(10);
    // 4 members x 10 picks = 40 potential.
    expect(data.league.scorablePicks).toBe(40);
  });

  it("decrements the allowance and drops the picked market from the slate", async () => {
    const { market, snapshot } = await seedMarket();

    const before = await getLeaguePickemData(handle.db, {
      leagueId: league.id,
      now,
      slateLimit: 5000,
      userId: user.id,
    });
    expect(before.slate.map((row) => row.marketId)).toContain(market.id);

    await submitPick(handle.db, {
      idempotencyKey: `${marker}-pick-1`,
      leagueId: league.id,
      now,
      oddsSnapshotId: snapshot.id,
      pickWeekId: before.week?.pickWeekId ?? "",
      selection: "home",
      userId: user.id,
    });

    const after = await getLeaguePickemData(handle.db, {
      leagueId: league.id,
      now,
      slateLimit: 5000,
      userId: user.id,
    });
    expect(after.you.submittedPicks).toBe(1);
    expect(after.you.remainingPicks).toBe(9);
    // One pick per market per week is enforced by a unique index, so offering
    // the market again could only produce a failed submit.
    expect(after.slate.map((row) => row.marketId)).not.toContain(market.id);
    expect(after.you.picks[0]?.selection).toBe("home");
  });

  it("excludes events that have already started from the slate", async () => {
    const { market } = await seedMarket(
      new Date(now.getTime() - 60 * 60 * 1000),
    );
    const data = await getLeaguePickemData(handle.db, {
      leagueId: league.id,
      now,
      slateLimit: 5000,
      userId: user.id,
    });
    expect(data.slate.map((row) => row.marketId)).not.toContain(market.id);
  });

  it("prices the slate from the LATEST snapshot per market", async () => {
    // Odds move. A pick must be priced from the number the user is looking at,
    // not from whichever snapshot the database happened to return first.
    const { market } = await seedMarket();
    await handle.db.insert(oddsSnapshots).values({
      awayPrice: -105,
      capturedAt: new Date(opensAt.getTime() + 60 * 60 * 1000),
      homePrice: -130,
      line: -6.5,
      marketId: market.id,
      provider: marker,
      sourcePayloadHash: `${marker}-late-snap`,
    });

    const data = await getLeaguePickemData(handle.db, {
      leagueId: league.id,
      now,
      slateLimit: 5000,
      userId: user.id,
    });
    const option = data.slate.find((row) => row.marketId === market.id);
    expect(option?.line).toBe(-6.5);
    expect(option?.homePrice).toBe(-130);
  });
});
