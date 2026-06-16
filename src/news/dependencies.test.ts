// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import type { Db } from "@/db/client";
import { CompositeCentralNewsSource } from "./composite";
import {
  createNewsDependencies,
  GuardedCentralNewsSource,
} from "./dependencies";
import {
  MockRssCentralNewsSource,
  MockWebGroundingCentralNewsSource,
} from "./mocks";
import { RssCentralNewsSource, TavilyCentralNewsSource } from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

describe("createNewsDependencies", () => {
  it("keeps central news mocked with zero paid configuration", () => {
    const deps = createNewsDependencies({} as Db, parseEnv({}));

    expect(deps.source).toBeInstanceOf(CompositeCentralNewsSource);
    expect((deps.source as CompositeCentralNewsSource).sources).toEqual([
      expect.any(MockWebGroundingCentralNewsSource),
      expect.any(MockRssCentralNewsSource),
    ]);
  });

  it("selects Tavily plus mocked RSS for central news when only Tavily is configured", () => {
    const deps = createNewsDependencies(
      {} as Db,
      parseEnv({ TAVILY_API_KEY: fakeKey() }),
    );

    expect((deps.source as CompositeCentralNewsSource).sources).toEqual([
      expect.any(GuardedCentralNewsSource),
      expect.any(MockRssCentralNewsSource),
    ]);
    const [grounding] = (deps.source as CompositeCentralNewsSource).sources;
    expect((grounding as GuardedCentralNewsSource).real).toBeInstanceOf(
      TavilyCentralNewsSource,
    );
  });

  it("keeps Tavily grounding mocked when forced even if its key is present", () => {
    const deps = createNewsDependencies(
      {} as Db,
      parseEnv({
        MOCK_TAVILY: "true",
        TAVILY_API_KEY: fakeKey(),
      }),
    );

    expect((deps.source as CompositeCentralNewsSource).sources).toEqual([
      expect.any(MockWebGroundingCentralNewsSource),
      expect.any(MockRssCentralNewsSource),
    ]);
  });

  it("selects configured RSS feeds alongside mocked grounding", () => {
    const deps = createNewsDependencies(
      {} as Db,
      parseEnv({
        NEWS_RSS_FEED_URLS: "https://feeds.example.invalid/fantasy.xml",
      }),
    );

    expect((deps.source as CompositeCentralNewsSource).sources).toEqual([
      expect.any(MockWebGroundingCentralNewsSource),
      expect.any(RssCentralNewsSource),
    ]);
  });
});
