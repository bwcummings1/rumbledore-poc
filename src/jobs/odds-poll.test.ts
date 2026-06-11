// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  OddsEvent,
  OddsMarket,
  OddsProvider,
  OddsProviderEventInput,
  OddsProviderListInput,
  OddsQuote,
} from "@/betting";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { bettingEvents } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { JOB_EVENTS } from "./events";
import {
  createOddsPollFunction,
  oddsPoll,
  runOddsPoll,
} from "./functions/odds-poll";
import { functions } from "./index";

const marker = `oddsjob-${randomUUID()}`;
const providerName = `fixture-${marker}`;
const providerEventId = `${marker}-event`;
let handle: DbHandle;

class StaticOddsProvider implements OddsProvider {
  async listEvents(_input: OddsProviderListInput): Promise<OddsEvent[]> {
    return [
      {
        awayTeam: "Baltimore Ravens",
        homeTeam: "Cincinnati Bengals",
        lastUpdated: new Date("2026-09-12T12:00:00.000Z"),
        provider: providerName,
        providerEventId,
        sport: "nfl",
        startTime: new Date("2026-09-13T17:00:00.000Z"),
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
    ];
  }

  async getOdds(input: OddsProviderEventInput): Promise<OddsQuote[]> {
    return [
      {
        awayPrice: 110,
        capturedAt: new Date("2026-09-12T12:05:00.000Z"),
        homePrice: -130,
        provider: providerName,
        providerMarketId: `${input.providerEventId}:moneyline`,
      },
    ];
  }
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

describe("odds.poll Inngest function", () => {
  it("runs odds ingestion through the Inngest test engine", async () => {
    const fn = createOddsPollFunction(() => ({
      db: handle.db,
      now: () => new Date("2026-09-12T12:10:00.000Z"),
      provider: new StaticOddsProvider(),
    }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        sport: "nfl",
      },
      id: `${marker}-event`,
      name: JOB_EVENTS.oddsPoll,
    };

    const { result } = await testEngine.execute({ events: [event] });

    expect(result).toMatchObject({
      eventName: JOB_EVENTS.oddsPoll,
      events: { inserted: 1 },
      markets: { inserted: 1 },
      ok: true,
      snapshots: { inserted: 1 },
    });
  });

  it("rejects invalid payloads without retrying", async () => {
    await expect(
      runOddsPoll({
        data: {
          limit: 0,
        },
        deps: {
          db: handle.db,
          provider: new StaticOddsProvider(),
        },
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("is exported through the shared function registry", () => {
    expect(functions).toContain(oddsPoll);
  });
});
