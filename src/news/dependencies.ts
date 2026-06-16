import type { Env } from "@/core/env/schema";
import {
  createSpendGuard,
  runGuardedProviderCall,
  type SpendGuard,
} from "@/core/spend-guard";
import type { Db } from "@/db/client";
import { CompositeCentralNewsSource } from "./composite";
import type { CentralNewsIngestionDependencies } from "./ingestion";
import type {
  CentralNewsFetchInput,
  CentralNewsSource,
  CentralNewsSourceItem,
} from "./interfaces";
import {
  MockRssCentralNewsSource,
  MockWebGroundingCentralNewsSource,
} from "./mocks";
import { RosteredPlayerRefExtractor } from "./player-refs";
import { RssCentralNewsSource, TavilyCentralNewsSource } from "./real";

export class GuardedCentralNewsSource implements CentralNewsSource {
  constructor(
    readonly real: CentralNewsSource,
    private readonly mock: CentralNewsSource,
    private readonly guard: SpendGuard,
  ) {}

  async fetch(input: CentralNewsFetchInput): Promise<CentralNewsSourceItem[]> {
    // ubs:ignore — interface method name; outbound calls are guarded before paid SDK use.
    return runGuardedProviderCall({
      guard: this.guard,
      mockCall: () => this.mock.fetch(input),
      operation: "centralNews.fetch",
      provider: "tavily",
      realCall: async () => ({
        usage: { units: 1 },
        value: await this.real.fetch(input),
      }),
    });
  }
}

export interface NewsDependencyFactoryOptions {
  spendGuard?: SpendGuard;
}

export function createCentralNewsDependencies(
  db: Db,
  env: Pick<Env, "news" | "redisUrl" | "spendGuard">,
  options: NewsDependencyFactoryOptions = {},
): CentralNewsIngestionDependencies {
  const spendGuard = options.spendGuard ?? createSpendGuard(env);
  const playerRefExtractor = new RosteredPlayerRefExtractor(db);
  const mockGrounding = new MockWebGroundingCentralNewsSource();
  const grounding = env.news.grounding.mock
    ? mockGrounding
    : new GuardedCentralNewsSource(
        new TavilyCentralNewsSource({
          apiKey: env.news.grounding.apiKey,
          playerRefExtractor,
        }),
        mockGrounding,
        spendGuard,
      );
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
