import type { Env } from "@/core/env/schema";
import type { Db } from "@/db/client";
import type { CentralNewsIngestionDependencies } from "./ingestion";
import { MockCentralNewsSource } from "./mocks";
import { TavilyCentralNewsSource } from "./real";

export function createNewsDependencies(
  db: Db,
  env: Pick<Env, "services">,
): CentralNewsIngestionDependencies {
  return {
    db,
    source: env.services.tavily.mock
      ? new MockCentralNewsSource()
      : new TavilyCentralNewsSource({ apiKey: env.services.tavily.apiKey }),
  };
}
