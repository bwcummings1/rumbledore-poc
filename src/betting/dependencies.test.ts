// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import type { Db } from "@/db/client";
import {
  createBettingSettlementDependencies,
  createOddsDependencies,
} from "./dependencies";
import { MockOddsProvider, MockResultsProvider } from "./mocks";
import { SportsDataIoResultsProvider, TheOddsApiProvider } from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

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

    expect(deps.provider).toBeInstanceOf(TheOddsApiProvider);
  });

  it("keeps odds mocked when forced even if its key is present", () => {
    const deps = createOddsDependencies(
      {} as Db,
      parseEnv({ MOCK_ODDS: "true", THE_ODDS_API_KEY: fakeKey() }),
    );

    expect(deps.provider).toBeInstanceOf(MockOddsProvider);
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

    expect(deps.resultsProvider).toBeInstanceOf(SportsDataIoResultsProvider);
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
