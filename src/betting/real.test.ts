// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TheOddsApiProvider } from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

describe("TheOddsApiProvider", () => {
  it("maps v4 NFL odds into events, markets, and snapshots", async () => {
    const calls: string[] = [];
    const provider = new TheOddsApiProvider({
      apiKey: fakeKey(),
      fetcher: async (url) => {
        calls.push(url);
        return {
          json: async () => [
            {
              away_team: "Dallas Cowboys",
              bookmakers: [
                {
                  key: "fixture_book",
                  last_update: "2026-09-10T10:06:00.000Z",
                  markets: [
                    {
                      key: "h2h",
                      last_update: "2026-09-10T10:01:00.000Z",
                      outcomes: [
                        { name: "Tampa Bay Buccaneers", price: -145 },
                        { name: "Dallas Cowboys", price: 125 },
                      ],
                    },
                    {
                      key: "spreads",
                      last_update: "2026-09-10T10:02:00.000Z",
                      outcomes: [
                        {
                          name: "Tampa Bay Buccaneers",
                          point: -3.5,
                          price: -110,
                        },
                        { name: "Dallas Cowboys", point: 3.5, price: -110 },
                      ],
                    },
                    {
                      key: "totals",
                      last_update: "2026-09-10T10:03:00.000Z",
                      outcomes: [
                        { name: "Over", point: 46.5, price: -105 },
                        { name: "Under", point: 46.5, price: -115 },
                      ],
                    },
                  ],
                  title: "Fixture Book",
                },
              ],
              commence_time: "2026-09-10T20:20:00.000Z",
              home_team: "Tampa Bay Buccaneers",
              id: "fixture-event-1",
              sport_key: "americanfootball_nfl",
            },
          ],
          ok: true,
          status: 200,
          statusText: "OK",
        };
      },
    });

    const events = await provider.listEvents({
      now: new Date("2026-09-10T10:00:00.000Z"),
      sport: "nfl",
    });
    const markets = await provider.getMarkets({
      providerEventId: "fixture-event-1",
      sport: "nfl",
    });
    const odds = await provider.getOdds({
      providerEventId: "fixture-event-1",
      sport: "nfl",
    });

    const requested = new URL(calls[0]);
    expect(requested.pathname).toBe("/v4/sports/americanfootball_nfl/odds");
    expect(requested.searchParams.get("regions")).toBe("us");
    expect(requested.searchParams.get("markets")).toBe("h2h,spreads,totals");
    expect(requested.searchParams.get("oddsFormat")).toBe("american");
    expect(calls).toHaveLength(1);
    expect(events).toEqual([
      {
        awayTeam: "Dallas Cowboys",
        homeTeam: "Tampa Bay Buccaneers",
        lastUpdated: new Date("2026-09-10T10:06:00.000Z"),
        provider: "the_odds_api",
        providerEventId: "fixture-event-1",
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
        providerMarketId: "fixture-event-1:fixture_book:h2h",
      },
      {
        awayPrice: -110,
        homePrice: -110,
        line: -3.5,
        providerMarketId: "fixture-event-1:fixture_book:spreads",
      },
      {
        line: 46.5,
        overPrice: -105,
        providerMarketId: "fixture-event-1:fixture_book:totals",
        underPrice: -115,
      },
    ]);
  });
});
