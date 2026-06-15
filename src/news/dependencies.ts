import type { Env } from "@/core/env/schema";
import type { Db } from "@/db/client";
import { CompositeCentralNewsSource } from "./composite";
import type { CentralNewsIngestionDependencies } from "./ingestion";
import {
  MockRssCentralNewsSource,
  MockWebGroundingCentralNewsSource,
} from "./mocks";
import { RosteredPlayerRefExtractor } from "./player-refs";
import { RssCentralNewsSource, TavilyCentralNewsSource } from "./real";

export function createCentralNewsDependencies(
  db: Db,
  env: Pick<Env, "news">,
): CentralNewsIngestionDependencies {
  const playerRefExtractor = new RosteredPlayerRefExtractor(db);
  const grounding = env.news.grounding.mock
    ? new MockWebGroundingCentralNewsSource()
    : new TavilyCentralNewsSource({
        apiKey: env.news.grounding.apiKey,
        playerRefExtractor,
      });
  const rss = env.news.rss.mock
    ? new MockRssCentralNewsSource()
    : new RssCentralNewsSource({
        feedUrls: env.news.rss.feedUrls,
        playerRefExtractor,
      });

  return {
    db,
    source: new CompositeCentralNewsSource([grounding, rss]),
  };
}

export const createNewsDependencies = createCentralNewsDependencies;
