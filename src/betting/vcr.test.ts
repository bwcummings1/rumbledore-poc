// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertCassetteSecretFree,
  createVcrFetch,
  readVcrCassette,
} from "@/testing/vcr";
import { SportsDataIoResultsProvider, TheOddsApiProvider } from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

describe("betting provider VCR replay", () => {
  it("replays The Odds API events, markets, and odds offline", async () => {
    const cassette = await readVcrCassette(
      new URL("__cassettes__/the-odds-api-nfl-odds.json", import.meta.url),
    );
    const fixtureKey = [
      "real",
      "odds",
      "provider",
      "value",
      "never",
      "written",
    ].join("-");
    assertCassetteSecretFree(cassette, [fixtureKey]);
    const provider = new TheOddsApiProvider({
      apiKey: fixtureKey,
      fetcher: createVcrFetch(cassette, { mode: "replay" }),
    });

    const events = await provider.listEvents({
      now: new Date("2026-09-10T10:00:00.000Z"),
      sport: "nfl",
    });
    const markets = await provider.getMarkets({
      providerEventId: "replay-event-1",
      sport: "nfl",
    });
    const odds = await provider.getOdds({
      providerEventId: "replay-event-1",
      sport: "nfl",
    });

    expect(events).toEqual([
      {
        awayTeam: "Dallas Cowboys",
        homeTeam: "Tampa Bay Buccaneers",
        lastUpdated: new Date("2026-09-10T10:06:00.000Z"),
        provider: "the_odds_api",
        providerEventId: "replay-event-1",
        sport: "nfl",
        startTime: new Date("2026-09-10T20:20:00.000Z"),
        status: "scheduled",
      },
    ]);
    expect(markets.map((market) => market.type)).toEqual([
      "moneyline",
      "spread",
      "total",
    ]);
    expect(odds).toMatchObject([
      {
        awayPrice: 125,
        homePrice: -145,
        providerMarketId: "replay-event-1:replay_book:h2h",
      },
      {
        awayPrice: -110,
        homePrice: -110,
        line: -3.5,
        providerMarketId: "replay-event-1:replay_book:spreads",
      },
      {
        line: 46.5,
        overPrice: -105,
        providerMarketId: "replay-event-1:replay_book:totals",
        underPrice: -115,
      },
    ]);
  });

  it("replays SportsDataIO score results offline with auth stripped", async () => {
    const cassette = await readVcrCassette(
      new URL("__cassettes__/sportsdataio-nfl-score.json", import.meta.url),
    );
    const fixtureKey = [
      "real",
      "sportsdataio",
      "value",
      "never",
      "written",
    ].join("-");
    assertCassetteSecretFree(cassette, [fixtureKey]);
    const provider = new SportsDataIoResultsProvider({
      apiKey: fixtureKey,
      fetcher: createVcrFetch(cassette, { mode: "replay" }),
    });

    await expect(
      provider.getEventResult({
        event: {
          awayTeam: "DAL",
          homeTeam: "PHI",
          id: "local-event-id",
          provider: "the_odds_api",
          providerEventId: "20250904-DAL-PHI",
          sport: "nfl",
          startTime: new Date("2025-09-04T20:20:00.000Z"),
        },
      }),
    ).resolves.toMatchObject({
      awayScore: 20,
      finalStatus: "final",
      homeScore: 27,
      playerStats: [
        {
          playerId: "100001",
          stats: expect.objectContaining({ passing_yards: 247 }),
        },
      ],
      provider: "sportsdataio",
    });
  });

  it("keeps committed betting cassettes free of fixture secrets", async () => {
    for (const name of [
      "the-odds-api-nfl-odds.json",
      "sportsdataio-nfl-score.json",
    ]) {
      const cassette = await readVcrCassette(
        new URL(`__cassettes__/${name}`, import.meta.url),
      );
      assertCassetteSecretFree(cassette, [fakeKey()]);
    }
  });
});
