// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { bettingEvents, bettingMarkets, oddsSnapshots } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { refreshOddsCatalog } from "./ingestion";
import type {
  OddsEvent,
  OddsMarket,
  OddsProvider,
  OddsProviderEventInput,
  OddsProviderListInput,
  OddsQuote,
} from "./interfaces";

const marker = `oddstest-${randomUUID()}`;
const providerName = `fixture-${marker}`;
const providerEventId = `${marker}-event-1`;
let handle: DbHandle;

class MutableOddsProvider implements OddsProvider {
  homeMoneyline = -145;

  async listEvents(_input: OddsProviderListInput): Promise<OddsEvent[]> {
    return [
      {
        awayTeam: "Dallas Cowboys",
        homeTeam: "Tampa Bay Buccaneers",
        lastUpdated: new Date("2026-09-10T10:00:00.000Z"),
        provider: providerName,
        providerEventId,
        sport: "nfl",
        startTime: new Date("2026-09-10T20:20:00.000Z"),
        status: "scheduled",
      },
    ];
  }

  async getMarkets(input: OddsProviderEventInput): Promise<OddsMarket[]> {
    return [
      {
        period: "full_game",
        provider: providerName,
        providerEventId: input.providerEventId,
        providerMarketId: `${input.providerEventId}:moneyline`,
        status: "open",
        subject: "game",
        type: "moneyline",
      },
      {
        period: "full_game",
        provider: providerName,
        providerEventId: input.providerEventId,
        providerMarketId: `${input.providerEventId}:spread`,
        status: "open",
        subject: "game",
        type: "spread",
      },
      {
        period: "full_game",
        provider: providerName,
        providerEventId: input.providerEventId,
        providerMarketId: `${input.providerEventId}:total`,
        status: "open",
        subject: "game",
        type: "total",
      },
      {
        metadata: { playerName: "Fixture Quarterback" },
        period: "full_game",
        propType: "passing_yards",
        provider: providerName,
        providerEventId: input.providerEventId,
        providerMarketId: `${input.providerEventId}:fixture-qb-passing-yards`,
        status: "open",
        subject: "fixture-qb",
        type: "player_prop",
      },
    ];
  }

  async getOdds(input: OddsProviderEventInput): Promise<OddsQuote[]> {
    return [
      {
        awayPrice: 125,
        capturedAt: new Date("2026-09-10T10:05:00.000Z"),
        homePrice: this.homeMoneyline,
        provider: providerName,
        providerMarketId: `${input.providerEventId}:moneyline`,
      },
      {
        awayPrice: -110,
        capturedAt: new Date("2026-09-10T10:05:00.000Z"),
        homePrice: -110,
        line: -3.5,
        provider: providerName,
        providerMarketId: `${input.providerEventId}:spread`,
      },
      {
        capturedAt: new Date("2026-09-10T10:05:00.000Z"),
        line: 46.5,
        overPrice: -105,
        provider: providerName,
        providerMarketId: `${input.providerEventId}:total`,
        underPrice: -115,
      },
      {
        capturedAt: new Date("2026-09-10T10:05:00.000Z"),
        line: 242.5,
        overPrice: -115,
        provider: providerName,
        providerMarketId: `${input.providerEventId}:fixture-qb-passing-yards`,
        underPrice: -105,
      },
    ];
  }
}

async function catalogCounts() {
  const events = await handle.db
    .select()
    .from(bettingEvents)
    .where(eq(bettingEvents.provider, providerName));
  const markets = await handle.db
    .select()
    .from(bettingMarkets)
    .where(eq(bettingMarkets.provider, providerName));
  const snapshots = await handle.db
    .select()
    .from(oddsSnapshots)
    .where(eq(oddsSnapshots.provider, providerName));

  return {
    events: events.length,
    markets: markets.length,
    snapshots: snapshots.length,
  };
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
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(bettingEvents)
    .where(eq(bettingEvents.provider, providerName));
  await handle.pool.end();
});

describe("odds catalog ingestion", () => {
  it("keeps central odds catalog tables outside league RLS", async () => {
    const rows = await handle.pool.query<{
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(`
        select relname, relrowsecurity, relforcerowsecurity
        from pg_class
        where relname in ('betting_event', 'betting_market', 'odds_snapshot')
        order by relname
      `);

    expect(rows.rows).toEqual([
      {
        relforcerowsecurity: false,
        relname: "betting_event",
        relrowsecurity: false,
      },
      {
        relforcerowsecurity: false,
        relname: "betting_market",
        relrowsecurity: false,
      },
      {
        relforcerowsecurity: false,
        relname: "odds_snapshot",
        relrowsecurity: false,
      },
    ]);
  });

  it("upserts events and markets while appending only changed odds snapshots", async () => {
    const provider = new MutableOddsProvider();
    const deps = {
      db: handle.db,
      now: () => new Date("2026-09-10T10:10:00.000Z"),
      provider,
    };

    const first = await refreshOddsCatalog({ deps, input: { sport: "nfl" } });
    const second = await refreshOddsCatalog({ deps, input: { sport: "nfl" } });
    provider.homeMoneyline = -150;
    const third = await refreshOddsCatalog({ deps, input: { sport: "nfl" } });

    expect(first).toMatchObject({
      events: { fetched: 1, inserted: 1, skipped: 0 },
      markets: { fetched: 4, inserted: 4, skipped: 0 },
      snapshots: { inserted: 4, skipped: 0 },
    });
    expect(second).toMatchObject({
      events: { fetched: 1, unchanged: 1 },
      markets: { fetched: 4, unchanged: 4 },
      snapshots: { inserted: 0, skipped: 4 },
    });
    expect(third).toMatchObject({
      events: { fetched: 1, unchanged: 1 },
      markets: { fetched: 4, unchanged: 4 },
      snapshots: { inserted: 1, skipped: 3 },
    });
    await expect(catalogCounts()).resolves.toEqual({
      events: 1,
      markets: 4,
      snapshots: 5,
    });
  });
});
