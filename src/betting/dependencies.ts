import type { Env } from "@/core/env/schema";
import type { Db } from "@/db/client";
import type { OddsIngestionDependencies } from "./ingestion";
import { MockOddsProvider, MockResultsProvider } from "./mocks";
import { SportsDataIoResultsProvider, TheOddsApiProvider } from "./real";
import type { BettingSettlementDependencies } from "./settlement";

export function createOddsDependencies(
  db: Db,
  env: Pick<Env, "services">,
): OddsIngestionDependencies {
  return {
    db,
    provider: env.services.odds.mock
      ? new MockOddsProvider()
      : new TheOddsApiProvider({ apiKey: env.services.odds.apiKey }),
  };
}

export function createBettingSettlementDependencies(
  db: Db,
  env: Pick<Env, "services">,
): BettingSettlementDependencies {
  return {
    db,
    resultsProvider: env.services.sportsdataio.mock
      ? new MockResultsProvider()
      : new SportsDataIoResultsProvider({
          apiKey: env.services.sportsdataio.apiKey,
        }),
  };
}
