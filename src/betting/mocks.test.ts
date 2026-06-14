import { describe, expect, it } from "vitest";
import { MockOddsProvider, MockResultsProvider } from "./mocks";

describe("betting mocks", () => {
  it("serves full market depth with matching player-prop results for every fixture event", async () => {
    const oddsProvider = new MockOddsProvider();
    const resultsProvider = new MockResultsProvider();
    const events = await oddsProvider.listEvents({ sport: "nfl" });

    expect(events.length).toBeGreaterThanOrEqual(2);

    for (const event of events) {
      const markets = await oddsProvider.getMarkets({
        providerEventId: event.providerEventId,
        sport: "nfl",
      });
      const odds = await oddsProvider.getOdds({
        providerEventId: event.providerEventId,
        sport: "nfl",
      });
      const oddsByMarketId = new Map(
        odds.map((quote) => [quote.providerMarketId, quote]),
      );

      expect(markets.map((market) => market.type)).toEqual(
        expect.arrayContaining(["moneyline", "spread", "total", "player_prop"]),
      );
      expect(markets).toHaveLength(odds.length);

      for (const market of markets) {
        expect(oddsByMarketId.has(market.providerMarketId)).toBe(true);
      }

      const moneyline = markets.find((market) => market.type === "moneyline");
      const spread = markets.find((market) => market.type === "spread");
      const total = markets.find((market) => market.type === "total");
      expect(
        moneyline && oddsByMarketId.get(moneyline.providerMarketId),
      ).toMatchObject({
        awayPrice: expect.any(Number),
        homePrice: expect.any(Number),
      });
      expect(
        spread && oddsByMarketId.get(spread.providerMarketId),
      ).toMatchObject({
        awayPrice: expect.any(Number),
        homePrice: expect.any(Number),
        line: expect.any(Number),
      });
      expect(total && oddsByMarketId.get(total.providerMarketId)).toMatchObject(
        {
          line: expect.any(Number),
          overPrice: expect.any(Number),
          underPrice: expect.any(Number),
        },
      );

      const result = await resultsProvider.getEventResult({
        event: {
          awayTeam: event.awayTeam,
          homeTeam: event.homeTeam,
          id: event.providerEventId,
          provider: event.provider,
          providerEventId: event.providerEventId,
          sport: event.sport,
          startTime: event.startTime,
        },
      });

      for (const propMarket of markets.filter(
        (market) => market.type === "player_prop",
      )) {
        const propOdds = oddsByMarketId.get(propMarket.providerMarketId);
        const stat = result.playerStats.find(
          (entry) => entry.playerId === propMarket.subject,
        )?.stats[propMarket.propType ?? ""];

        expect(propMarket.propType).toBeTruthy();
        expect(propOdds).toMatchObject({
          line: expect.any(Number),
          overPrice: expect.any(Number),
          underPrice: expect.any(Number),
        });
        expect(stat).toEqual(expect.any(Number));
      }
    }
  });
});
