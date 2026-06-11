import type { Env } from "@/core/env/schema";
import type { Db } from "@/db/client";
import type { OddsIngestionDependencies } from "./ingestion";
import { MockOddsProvider } from "./mocks";
import { TheOddsApiProvider } from "./real";

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
