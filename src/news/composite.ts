import type {
  CentralNewsFetchInput,
  CentralNewsSource,
  CentralNewsSourceItem,
} from "./interfaces";

export class CompositeCentralNewsSource implements CentralNewsSource {
  readonly sources: readonly CentralNewsSource[];

  constructor(sources: readonly CentralNewsSource[]) {
    this.sources = sources;
  }

  async fetch(input: CentralNewsFetchInput): Promise<CentralNewsSourceItem[]> {
    const results = await Promise.all(
      this.sources.map((source) => source.fetch(input)),
    );

    return results.flat();
  }
}
