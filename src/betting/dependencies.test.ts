// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createLogger } from "@/core/logging";
import { getMetricsSnapshot, resetMetricsForTests } from "@/core/metrics";
import { AppError } from "@/core/result";
import { MemorySpendCounterStore, SpendGuard } from "@/core/spend-guard";
import type { Db } from "@/db/client";
import {
  createBettingSettlementDependencies,
  createOddsDependencies,
  GuardedOddsProvider,
  GuardedResultsProvider,
} from "./dependencies";
import type { OddsProvider, ResultsProvider } from "./interfaces";
import { MockOddsProvider, MockResultsProvider } from "./mocks";
import { SportsDataIoResultsProvider, TheOddsApiProvider } from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

beforeEach(() => {
  resetMetricsForTests();
});

describe("createOddsDependencies", () => {
  it("keeps odds mocked with zero paid configuration", () => {
    const deps = createOddsDependencies({} as Db, parseEnv({}));

    expect(deps.provider).toBeInstanceOf(MockOddsProvider);
  });

  it("selects The Odds API provider when its key is present", () => {
    const deps = createOddsDependencies(
      {} as Db,
      parseEnv({ THE_ODDS_API_KEY: fakeKey() }),
    );

    expect(deps.provider).toBeInstanceOf(GuardedOddsProvider);
    expect((deps.provider as GuardedOddsProvider).real).toBeInstanceOf(
      TheOddsApiProvider,
    );
  });

  it("keeps odds mocked when forced even if its key is present", () => {
    const deps = createOddsDependencies(
      {} as Db,
      parseEnv({ MOCK_ODDS: "true", THE_ODDS_API_KEY: fakeKey() }),
    );

    expect(deps.provider).toBeInstanceOf(MockOddsProvider);
  });

  it("records one provider usage sample for the memoized real odds fetch", async () => {
    const real: OddsProvider = {
      getMarkets: vi.fn(async () => []),
      getOdds: vi.fn(async () => []),
      listEvents: vi.fn(async () => []),
    };
    const mock: OddsProvider = {
      getMarkets: vi.fn(async () => []),
      getOdds: vi.fn(async () => []),
      listEvents: vi.fn(async () => []),
    };
    const env = parseEnv({ SPEND_GUARD_ODDS_REQUESTS: "10" });
    const provider = new GuardedOddsProvider(
      real,
      mock,
      new SpendGuard({
        config: env.spendGuard,
        logger: createLogger({ sink: () => undefined }),
        store: new MemorySpendCounterStore(),
      }),
      createLogger({ sink: () => undefined }),
    );

    await provider.listEvents({ sport: "nfl" });
    await provider.getMarkets({ providerEventId: "event-1", sport: "nfl" });

    expect(real.listEvents).toHaveBeenCalledTimes(1);
    expect(real.getMarkets).toHaveBeenCalledTimes(1);
    expect(mock.listEvents).not.toHaveBeenCalled();
    expect(getMetricsSnapshot().providerUsage.providers.odds).toMatchObject({
      callCount: 1,
      cap: 10,
      demotionCount: 0,
      latestCumulative: 1,
      operations: {
        "odds.listEvents": {
          callCount: 1,
          demotionCount: 0,
          totalUnits: 1,
        },
      },
      realCallCount: 1,
      totalUnits: 1,
      unit: "requests",
    });
  });

  it("falls back to mock odds after an unavailable real odds response", async () => {
    const real: OddsProvider = {
      getMarkets: vi.fn(async () => []),
      getOdds: vi.fn(async () => []),
      listEvents: vi.fn(async () => {
        throw new AppError({
          code: "ODDS_PROVIDER_HTTP_ERROR",
          message: "The Odds API request failed with HTTP 503",
          status: 502,
        });
      }),
    };
    const mock: OddsProvider = {
      getMarkets: vi.fn(async () => [
        {
          period: "full_game" as const,
          provider: "mock_odds",
          providerEventId: "mock-event",
          providerMarketId: "mock-market",
          status: "open" as const,
          subject: "game",
          type: "moneyline" as const,
        },
      ]),
      getOdds: vi.fn(async () => []),
      listEvents: vi.fn(async () => [
        {
          awayTeam: "Mock Away",
          homeTeam: "Mock Home",
          provider: "mock_odds",
          providerEventId: "mock-event",
          sport: "nfl" as const,
          startTime: new Date("2026-09-10T20:20:00.000Z"),
          status: "scheduled" as const,
        },
      ]),
    };
    const provider = new GuardedOddsProvider(
      real,
      mock,
      new SpendGuard({
        config: parseEnv({}).spendGuard,
        logger: createLogger({ sink: () => undefined }),
        store: new MemorySpendCounterStore(),
      }),
      createLogger({ sink: () => undefined }),
    );

    await expect(provider.listEvents({ sport: "nfl" })).resolves.toEqual([
      expect.objectContaining({ provider: "mock_odds" }),
    ]);
    await expect(
      provider.getMarkets({ providerEventId: "mock-event", sport: "nfl" }),
    ).resolves.toEqual([expect.objectContaining({ provider: "mock_odds" })]);
    expect(real.listEvents).toHaveBeenCalledTimes(1);
    expect(real.getMarkets).not.toHaveBeenCalled();
    expect(mock.listEvents).toHaveBeenCalledTimes(1);
    expect(mock.getMarkets).toHaveBeenCalledTimes(1);
  });
});

describe("createBettingSettlementDependencies", () => {
  it("keeps results mocked with zero paid configuration", () => {
    const deps = createBettingSettlementDependencies({} as Db, parseEnv({}));

    expect(deps.resultsProvider).toBeInstanceOf(MockResultsProvider);
  });

  it("selects SportsDataIO when its key is present", () => {
    const deps = createBettingSettlementDependencies(
      {} as Db,
      parseEnv({ SPORTSDATAIO_API_KEY: fakeKey() }),
    );

    expect(deps.resultsProvider).toBeInstanceOf(GuardedResultsProvider);
    expect(
      (deps.resultsProvider as GuardedResultsProvider).real,
    ).toBeInstanceOf(SportsDataIoResultsProvider);
  });

  it("keeps SportsDataIO mocked when forced even if its key is present", () => {
    const deps = createBettingSettlementDependencies(
      {} as Db,
      parseEnv({
        MOCK_SPORTSDATAIO: "true",
        SPORTSDATAIO_API_KEY: fakeKey(),
      }),
    );

    expect(deps.resultsProvider).toBeInstanceOf(MockResultsProvider);
  });

  it("falls back to mock results after an unavailable SportsDataIO response", async () => {
    const real: ResultsProvider = {
      getEventResult: vi.fn(async () => {
        throw new AppError({
          code: "RESULTS_PROVIDER_HTTP_ERROR",
          message: "SportsDataIO request failed with HTTP 503",
          status: 502,
        });
      }),
      id: "sportsdataio",
    };
    const provider = new GuardedResultsProvider(
      real,
      new MockResultsProvider(),
      new SpendGuard({
        config: parseEnv({}).spendGuard,
        logger: createLogger({ sink: () => undefined }),
        store: new MemorySpendCounterStore(),
      }),
      createLogger({ sink: () => undefined }),
    );

    await expect(
      provider.getEventResult({
        event: {
          awayTeam: "Arizona Cardinals",
          homeTeam: "Seattle Seahawks",
          id: "event-1",
          provider: "mock",
          providerEventId: "mock-nfl-2026-week-01-ari-sea",
          sport: "nfl",
          startTime: new Date("2026-09-10T20:20:00.000Z"),
        },
      }),
    ).resolves.toMatchObject({
      finalStatus: "final",
      provider: "mock_results",
    });
    expect(real.getEventResult).toHaveBeenCalledTimes(1);
  });
});
