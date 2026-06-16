// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createLogger } from "@/core/logging";
import { getMetricsSnapshot, resetMetricsForTests } from "@/core/metrics";
import { MemorySpendCounterStore, SpendGuard } from "@/core/spend-guard";
import type { Db } from "@/db/client";
import {
  createBettingSettlementDependencies,
  createOddsDependencies,
  GuardedOddsProvider,
  GuardedResultsProvider,
} from "./dependencies";
import type { OddsProvider } from "./interfaces";
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
});
